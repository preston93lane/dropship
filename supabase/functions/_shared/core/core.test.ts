import { test } from "node:test";
import assert from "node:assert/strict";

import { checkMarginGates, suggestPrice, unitEconomics } from "./economics.ts";
import { betaCdf, mulberry32, sampleBeta } from "./stats.ts";
import { calibrateWeights, DEFAULT_WEIGHTS, scoreProduct, SCORE_COMPONENTS, type ScoreComponent } from "./scoring.ts";
import { evaluateAd, evaluateProductTest, probCpaBelow } from "./rules.ts";
import { allocateBudget } from "./allocation.ts";
import { DEFAULT_GUARDRAILS, evaluateAction, recommendAutonomy, type PolicyContext } from "./policy.ts";
import { assertCreativeTransition, assertProductTransition, canTransition } from "./lifecycle.ts";

const ue = unitEconomics({ price: 39.99, cogs: 8.5, shippingCost: 4.5 });

test("unit economics: contribution, breakeven and target CPA", () => {
  // fees = 39.99*0.029+0.30 = 1.46; refunds = 2.00; contribution = 39.99-13-1.46-2.00 = 23.53
  assert.equal(ue.landedCost, 13);
  assert.equal(ue.contribution, 23.53);
  assert.equal(ue.breakevenCpa, 23.53);
  assert.equal(ue.targetCpa, 16.47);
  assert.equal(ue.breakevenRoas, 1.7);
  assert.ok(checkMarginGates(ue).pass);
});

test("unit economics: thin-margin product fails gates", () => {
  const thin = unitEconomics({ price: 19.99, cogs: 7, shippingCost: 5 });
  const gates = checkMarginGates(thin);
  assert.equal(gates.pass, false);
  assert.ok(gates.failures.some((f) => f.includes("contribution")));
});

test("suggestPrice uses markup, floor and charm ending", () => {
  assert.equal(suggestPrice(13), 39.99);
  assert.equal(suggestPrice(5), 24.99);
  assert.equal(suggestPrice(13.4), 40.99);
});

test("betaCdf matches known values", () => {
  assert.ok(Math.abs(betaCdf(0.5, 1, 1) - 0.5) < 1e-9);
  assert.ok(Math.abs(betaCdf(0.5, 2, 2) - 0.5) < 1e-9);
  assert.ok(Math.abs(betaCdf(0.2, 2, 5) - 0.34464) < 1e-4);
  assert.ok(Math.abs(betaCdf(0.02, 3, 147) - 0.574548) < 1e-5); // verified by numerical integration
});

test("sampleBeta mean converges", () => {
  const rng = mulberry32(7);
  let s = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) s += sampleBeta(3, 7, rng);
  assert.ok(Math.abs(s / n - 0.3) < 0.01);
});

const strongSignals: Partial<Record<ScoreComponent, number>> = {
  demand: 8,
  proof: 8,
  wow: 9,
  creative_potential: 8,
  competition: 6,
  trend_timing: 7,
};

test("scoreProduct: strong product with US warehouse is priority", () => {
  const r = scoreProduct({ components: strongSignals, economics: ue, flags: { usWarehouse: true, shippingDays: 5 } });
  assert.deepEqual(r.hardFails, []);
  assert.ok(r.score >= 72, `score ${r.score}`);
  assert.equal(r.verdict, "priority");
});

test("scoreProduct: hard gates reject regardless of hype", () => {
  const r = scoreProduct({ components: strongSignals, economics: ue, flags: { trademarkRisk: true } });
  assert.equal(r.verdict, "reject");
  const noEcon = scoreProduct({ components: strongSignals });
  assert.equal(noEcon.verdict, "reject");
});

test("scoreProduct: missing components => watch, penalties reduce score", () => {
  const r = scoreProduct({ components: { demand: 9 }, economics: ue, flags: { usWarehouse: true, shippingDays: 4 } });
  assert.equal(r.verdict, "watch");
  const base = scoreProduct({ components: strongSignals, economics: ue, flags: { usWarehouse: true, shippingDays: 5 } });
  const pen = scoreProduct({
    components: strongSignals,
    economics: ue,
    flags: { usWarehouse: true, shippingDays: 5, soldCheaperAtBigBox: true },
  });
  assert.ok(Math.abs(base.score - pen.score - 8) < 0.11);
});

test("calibrateWeights: needs data, then nudges toward separating components, bounded", () => {
  const mk = (wow: number, won: boolean) => {
    const c = Object.fromEntries(SCORE_COMPONENTS.map((k) => [k, 5])) as Record<ScoreComponent, number>;
    c.wow = wow;
    return { components: c, won };
  };
  const few = calibrateWeights(DEFAULT_WEIGHTS, [mk(9, true)]);
  assert.equal(few.applied, false);
  const outcomes = [mk(9, true), mk(8, true), mk(4, false), mk(3, false), mk(5, false), mk(4, false)];
  const r = calibrateWeights(DEFAULT_WEIGHTS, outcomes);
  assert.equal(r.applied, true);
  assert.ok(r.weights.wow > DEFAULT_WEIGHTS.wow);
  assert.ok(r.weights.wow <= DEFAULT_WEIGHTS.wow * 1.12);
  const sum = Object.values(r.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.01);
});

const econ = { breakevenCpa: 23.53, targetCpa: 16.47 };

test("rules: insufficient spend => watch", () => {
  const d = evaluateAd({ spend: 4, impressions: 800, clicks: 10, purchases: 0 }, econ);
  assert.equal(d.action, "watch");
});

test("rules: low CTR kills the hook", () => {
  const d = evaluateAd({ spend: 15, impressions: 5000, clicks: 20, purchases: 0 }, econ);
  assert.equal(d.action, "kill");
  assert.match(d.reason, /CTR/);
});

test("rules: no purchases after 1.5x breakeven => kill", () => {
  const d = evaluateAd({ spend: 36, impressions: 4000, clicks: 70, addToCarts: 3, purchases: 0 }, econ);
  assert.equal(d.action, "kill");
});

test("rules: clear winner scales, but not twice in 24h", () => {
  const stats = { spend: 60, impressions: 9000, clicks: 160, addToCarts: 20, purchases: 6, revenue: 240 };
  const d = evaluateAd(stats, econ);
  assert.equal(d.action, "scale");
  assert.equal(d.budgetChangePct, 0.2);
  const wait = evaluateAd({ ...stats, hoursSinceBudgetChange: 6 }, econ);
  assert.equal(wait.action, "keep");
});

test("rules: scaling ad with fatigue => refresh creative", () => {
  const d = evaluateAd(
    { spend: 400, impressions: 60000, clicks: 900, purchases: 30, frequency: 4.1, phase: "scaling" },
    econ,
  );
  assert.equal(d.action, "refresh_creative");
});

test("probCpaBelow is monotone in purchases", () => {
  const lo = probCpaBelow({ spend: 50, impressions: 5000, clicks: 100, purchases: 1 }, 20)!;
  const hi = probCpaBelow({ spend: 50, impressions: 5000, clicks: 100, purchases: 5 }, 20)!;
  assert.ok(hi > lo);
});

test("product test rollup", () => {
  const winner = evaluateAd({ spend: 60, impressions: 9000, clicks: 160, purchases: 6 }, econ);
  const loser = evaluateAd({ spend: 36, impressions: 4000, clicks: 70, purchases: 0 }, econ);
  assert.equal(evaluateProductTest({ productId: "p", totalSpend: 96, testBudget: 150, adDecisions: [winner, loser] }).action, "declare_winner");
  assert.equal(evaluateProductTest({ productId: "p", totalSpend: 160, testBudget: 150, adDecisions: [loser, loser] }).action, "kill_product");
});

test("allocation: proven winner gets most budget, new arm still explored, losers starved", () => {
  const out = allocateBudget(
    [
      { id: "winner", spend: 300, clicks: 600, purchases: 30, contribution: 23.5 },
      { id: "loser", spend: 200, clicks: 500, purchases: 1, contribution: 23.5 },
      { id: "new", spend: 5, clicks: 10, purchases: 0, contribution: 23.5 },
    ],
    100,
  );
  const by = Object.fromEntries(out.map((a) => [a.id, a]));
  assert.ok(by.winner!.daily > by.new!.daily);
  assert.ok(by.new!.daily > 0);
  assert.equal(by.loser!.daily, 0);
  const total = out.reduce((s, a) => s + a.daily, 0);
  assert.ok(total <= 100.0001);
});

test("allocation respects max caps", () => {
  const out = allocateBudget(
    [
      { id: "a", spend: 300, clicks: 600, purchases: 30, contribution: 23.5, maxDaily: 30 },
      { id: "b", spend: 100, clicks: 300, purchases: 8, contribution: 23.5 },
    ],
    100,
  );
  assert.ok(out.find((a) => a.id === "a")!.daily <= 30);
});

const ctx: PolicyContext = {
  committedDailyBudget: 40,
  newTestsToday: 0,
  activeTestingProducts: 1,
  samplesThisWeek: 0,
  creativesCompliant: true,
  productApproved: true,
};

test("policy: pause always runs, even with kill switch", () => {
  const r = evaluateAction({ type: "ads.pause", payload: {} }, { ...DEFAULT_GUARDRAILS, killSwitch: true }, ctx);
  assert.equal(r.decision, "auto");
  const launch = evaluateAction({ type: "ads.create_test", payload: { dailyBudget: 20 } }, { ...DEFAULT_GUARDRAILS, killSwitch: true }, ctx);
  assert.equal(launch.decision, "reject");
});

test("policy: L1 creates paused tests automatically but activation needs approval", () => {
  assert.equal(evaluateAction({ type: "ads.create_test", payload: { dailyBudget: 20 } }, DEFAULT_GUARDRAILS, ctx).decision, "auto");
  assert.equal(evaluateAction({ type: "ads.activate", payload: { dailyBudget: 20 } }, DEFAULT_GUARDRAILS, ctx).decision, "approval");
  const l2 = { ...DEFAULT_GUARDRAILS, autonomyLevel: 2 as const };
  assert.equal(evaluateAction({ type: "ads.activate", payload: { dailyBudget: 20 } }, l2, ctx).decision, "auto");
});

test("policy: hard caps reject", () => {
  const over = evaluateAction({ type: "ads.activate", payload: { dailyBudget: 70 } }, { ...DEFAULT_GUARDRAILS, autonomyLevel: 3 }, ctx);
  assert.equal(over.decision, "reject");
  const jump = evaluateAction(
    { type: "ads.set_budget", payload: { dailyBudget: 30, currentDailyBudget: 10 } },
    { ...DEFAULT_GUARDRAILS, autonomyLevel: 3 },
    ctx,
  );
  assert.equal(jump.decision, "reject");
  const noncompliant = evaluateAction({ type: "ads.create_test", payload: { dailyBudget: 20 } }, DEFAULT_GUARDRAILS, {
    ...ctx,
    creativesCompliant: false,
  });
  assert.equal(noncompliant.decision, "reject");
});

test("policy: big price change needs a human even at L3", () => {
  const r = evaluateAction(
    { type: "shopify.set_price", payload: { price: 49.99, currentPrice: 34.99 } },
    { ...DEFAULT_GUARDRAILS, autonomyLevel: 3 },
    ctx,
  );
  assert.equal(r.decision, "approval");
});

test("autonomy recommendation steps up only on a clean track record", () => {
  const good = { daysAtLevel: 20, actionsProposed: 40, approvedUnchangedPct: 0.95, policyViolations: 0, complianceRejectionsLive: 0, contributionAfterAdsLast14d: 300 };
  assert.equal(recommendAutonomy(1, good).recommend, 2);
  assert.equal(recommendAutonomy(2, { ...good, policyViolations: 1 }).recommend, 1);
});

test("lifecycle transitions are enforced", () => {
  assert.ok(canTransition("testing", "winner"));
  assert.throws(() => assertProductTransition("candidate", "testing"));
  assert.throws(() => assertCreativeTransition("in_review", "live"));
  assertCreativeTransition("in_review", "approved");
});
