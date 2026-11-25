/**
 * Kill / keep / scale / refresh rules for ads and product tests.
 *
 * Design: deterministic, explainable, statistically aware. The guardian runs
 * this on every metrics sync with no LLM involved. The media-buyer agent reads
 * the decisions and may add judgment (e.g. "kill, but the hook worked — reuse
 * it"), but it cannot override a kill into extra spend without passing policy.
 *
 * The probability model: each link click converts with unknown rate p,
 * p ~ Beta(prior.alpha + purchases, prior.beta + clicks - purchases).
 * CPA ~= CPC / p, so P(CPA < T) = P(p > CPC / T) = 1 - BetaCDF(CPC / T).
 */
import { betaCdf, clamp } from "./stats.ts";

export interface AdStats {
  spend: number;
  impressions: number;
  /** Link clicks (outbound / landing page clicks), not all clicks. */
  clicks: number;
  addToCarts?: number;
  purchases: number;
  revenue?: number;
  frequency?: number;
  /** Hours since the ad started delivering. */
  ageHours?: number;
  /** Hours since the last budget change on the ad set / campaign. */
  hoursSinceBudgetChange?: number;
  /** Daily CTRs oldest -> newest, for fatigue detection. */
  dailyCtr?: number[];
  /** "testing" ads are judged against test budgets; "scaling" ads are watched for fatigue. */
  phase?: "testing" | "scaling";
}

export interface EconomicsThresholds {
  breakevenCpa: number;
  targetCpa: number;
}

export interface RuleConfig {
  minSpendForDecisionPct: number; // of breakeven CPA, below this we just watch
  minImpressionsForCtr: number;
  minLinkCtr: number;
  killNoAtcSpendMultiple: number; // x breakeven CPA with zero add-to-carts
  killNoPurchaseSpendMultiple: number; // x breakeven CPA with zero purchases
  maxTestSpendMultiple: number; // x breakeven CPA: test budget per ad
  killProbThreshold: number; // P(CPA < breakeven) below this -> kill
  scaleProbThreshold: number; // P(CPA < target) above this -> scale
  scaleMinPurchases: number;
  maxScaleStepPct: number;
  minHoursBetweenBudgetChanges: number;
  fatigueFrequency: number;
  fatigueCtrDropPct: number;
  cvrPrior: { alpha: number; beta: number };
}

export const DEFAULT_RULES: RuleConfig = {
  minSpendForDecisionPct: 0.3,
  minImpressionsForCtr: 2000,
  minLinkCtr: 0.008,
  killNoAtcSpendMultiple: 0.75,
  killNoPurchaseSpendMultiple: 1.5,
  maxTestSpendMultiple: 3,
  killProbThreshold: 0.1,
  scaleProbThreshold: 0.75,
  scaleMinPurchases: 3,
  maxScaleStepPct: 0.2,
  minHoursBetweenBudgetChanges: 24,
  fatigueFrequency: 3.5,
  fatigueCtrDropPct: 0.3,
  // ~2% link-click -> purchase conversion, weak (worth ~50 clicks of evidence)
  cvrPrior: { alpha: 1, beta: 49 },
};

export type AdAction = "watch" | "keep" | "kill" | "scale" | "refresh_creative";

export interface AdDecision {
  action: AdAction;
  reason: string;
  budgetChangePct?: number;
  metrics: {
    ctr: number;
    cpc: number | null;
    cpa: number | null;
    roas: number | null;
    pProfitable: number | null;
    pTarget: number | null;
  };
}

/** Probability that the true CPA is below `targetCpa`, or null if there are no clicks to judge. */
export function probCpaBelow(stats: AdStats, targetCpa: number, prior = DEFAULT_RULES.cvrPrior): number | null {
  if (stats.clicks <= 0 || targetCpa <= 0) return null;
  const cpc = stats.spend / stats.clicks;
  const threshold = cpc / targetCpa; // required conversion rate
  if (threshold >= 1) return 0;
  const a = prior.alpha + stats.purchases;
  const b = prior.beta + Math.max(stats.clicks - stats.purchases, 0);
  return clamp(1 - betaCdf(threshold, a, b), 0, 1);
}

function metricsOf(stats: AdStats, econ: EconomicsThresholds, cfg: RuleConfig): AdDecision["metrics"] {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    ctr: stats.impressions > 0 ? r(stats.clicks / stats.impressions) : 0,
    cpc: stats.clicks > 0 ? r(stats.spend / stats.clicks) : null,
    cpa: stats.purchases > 0 ? r(stats.spend / stats.purchases) : null,
    roas: stats.revenue !== undefined && stats.spend > 0 ? r(stats.revenue / stats.spend) : null,
    pProfitable: probCpaBelow(stats, econ.breakevenCpa, cfg.cvrPrior),
    pTarget: probCpaBelow(stats, econ.targetCpa, cfg.cvrPrior),
  };
}

function isFatigued(stats: AdStats, cfg: RuleConfig): string | null {
  if (stats.frequency !== undefined && stats.frequency >= cfg.fatigueFrequency) {
    return `frequency ${stats.frequency.toFixed(1)} >= ${cfg.fatigueFrequency}`;
  }
  const d = stats.dailyCtr ?? [];
  if (d.length >= 6) {
    const first = (d[0]! + d[1]! + d[2]!) / 3;
    const last = (d[d.length - 1]! + d[d.length - 2]! + d[d.length - 3]!) / 3;
    if (first > 0 && (first - last) / first >= cfg.fatigueCtrDropPct) {
      return `CTR down ${Math.round(((first - last) / first) * 100)}% vs launch`;
    }
  }
  return null;
}

export function evaluateAd(stats: AdStats, econ: EconomicsThresholds, cfg: RuleConfig = DEFAULT_RULES): AdDecision {
  const m = metricsOf(stats, econ, cfg);
  const be = econ.breakevenCpa;
  const decide = (action: AdAction, reason: string, budgetChangePct?: number): AdDecision =>
    budgetChangePct === undefined ? { action, reason, metrics: m } : { action, reason, budgetChangePct, metrics: m };

  if (be <= 0) return decide("kill", "no positive contribution per order: every sale loses money");

  if (stats.spend < be * cfg.minSpendForDecisionPct) {
    return decide("watch", `spend $${stats.spend.toFixed(2)} below decision threshold $${(be * cfg.minSpendForDecisionPct).toFixed(2)}`);
  }

  if (stats.phase === "scaling") {
    const fatigue = isFatigued(stats, cfg);
    if (m.pProfitable !== null && m.pProfitable < cfg.killProbThreshold && stats.spend >= be * 2) {
      return decide("kill", `scaling ad no longer profitable (P(CPA<BE)=${m.pProfitable.toFixed(2)})`);
    }
    if (fatigue) return decide("refresh_creative", `creative fatigue: ${fatigue}`);
  }

  if (stats.impressions >= cfg.minImpressionsForCtr && m.ctr < cfg.minLinkCtr && stats.purchases === 0) {
    return decide("kill", `link CTR ${(m.ctr * 100).toFixed(2)}% < ${(cfg.minLinkCtr * 100).toFixed(2)}% after ${stats.impressions} impressions: hook is not stopping the scroll`);
  }
  if (stats.addToCarts !== undefined && stats.addToCarts === 0 && stats.spend >= be * cfg.killNoAtcSpendMultiple) {
    return decide("kill", `no add-to-carts after $${stats.spend.toFixed(2)} (${cfg.killNoAtcSpendMultiple}x breakeven CPA): offer/landing page not converting`);
  }
  if (stats.purchases === 0 && stats.spend >= be * cfg.killNoPurchaseSpendMultiple) {
    return decide("kill", `no purchases after $${stats.spend.toFixed(2)} (${cfg.killNoPurchaseSpendMultiple}x breakeven CPA)`);
  }

  if (stats.purchases >= cfg.scaleMinPurchases && m.pTarget !== null && m.pTarget >= cfg.scaleProbThreshold) {
    const hours = stats.hoursSinceBudgetChange ?? Number.POSITIVE_INFINITY;
    if (hours < cfg.minHoursBetweenBudgetChanges) {
      return decide("keep", `winning (P(CPA<target)=${m.pTarget.toFixed(2)}) but budget changed ${hours.toFixed(0)}h ago; wait to avoid resetting learning`);
    }
    return decide("scale", `P(CPA<target $${econ.targetCpa})=${m.pTarget.toFixed(2)} with ${stats.purchases} purchases`, cfg.maxScaleStepPct);
  }

  if (m.pProfitable !== null && stats.spend >= be && m.pProfitable < cfg.killProbThreshold) {
    return decide("kill", `P(CPA<breakeven $${be})=${m.pProfitable.toFixed(2)} after $${stats.spend.toFixed(2)}`);
  }
  if (stats.spend >= be * cfg.maxTestSpendMultiple && (m.pTarget ?? 0) < 0.5) {
    return decide("kill", `test budget exhausted (${cfg.maxTestSpendMultiple}x breakeven CPA) without a clear winner`);
  }
  return decide("keep", "gathering data");
}

export interface ProductTestSummary {
  productId: string;
  totalSpend: number;
  testBudget: number;
  adDecisions: AdDecision[];
}

export type ProductAction = "continue_test" | "declare_winner" | "kill_product" | "iterate_creatives";

/** Roll ad-level decisions up into a product-level verdict for the orchestrator. */
export function evaluateProductTest(s: ProductTestSummary): { action: ProductAction; reason: string } {
  const scaling = s.adDecisions.filter((d) => d.action === "scale" || (d.action === "keep" && (d.metrics.pTarget ?? 0) >= 0.75));
  const alive = s.adDecisions.filter((d) => d.action !== "kill");
  const promising = s.adDecisions.filter((d) => (d.metrics.pProfitable ?? 0) >= 0.4);

  if (scaling.length > 0) return { action: "declare_winner", reason: `${scaling.length} ad(s) beating target CPA with confidence` };
  if (s.totalSpend >= s.testBudget) {
    if (promising.length > 0) {
      return { action: "iterate_creatives", reason: `test budget spent; ${promising.length} ad(s) near breakeven — iterate on their hooks before killing` };
    }
    return { action: "kill_product", reason: `test budget $${s.testBudget} spent with no ad near breakeven` };
  }
  if (alive.length === 0) {
    return { action: "iterate_creatives", reason: "all ads killed before budget exhausted — new angles needed (product not yet disproven)" };
  }
  return { action: "continue_test", reason: `${alive.length} ad(s) still live, $${(s.testBudget - s.totalSpend).toFixed(2)} test budget left` };
}
