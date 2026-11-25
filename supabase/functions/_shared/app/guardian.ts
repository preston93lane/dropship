/**
 * The guardian: a deterministic, LLM-free control loop run by pg_cron every
 * 30-60 minutes. It is the "adapt-fast" half of the ADAPT phase:
 *   1. sync ad metrics from Meta/TikTok into ad_metrics_daily
 *   2. spend guard: trip the kill switch if spend runs away
 *   3. evaluate every live ad with the kill/scale/refresh rules
 *   4. roll ads up into product verdicts (winner / kill / iterate)
 *   5. act through the same policy-gated action pipeline agents use
 * The media-buyer agent handles the judgment half (twice daily).
 */
import { evaluateAd, evaluateProductTest, type AdDecision, type AdStats } from "../core/rules.ts";
import type { Ad, Campaign, MetricsRow, Product, Repo, Row } from "../repo/types.ts";
import { submitAction, type Deps } from "./actions.ts";
import { loadEconomicsDefaults, loadGuardrails, loadRules } from "./settings.ts";

export interface GuardianReport {
  synced: number;
  spendToday: number;
  killSwitchTripped: boolean;
  decisions: { ad_id: string; action: string; reason: string }[];
  productVerdicts: { product_id: string; action: string; reason: string }[];
  warnings: string[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

async function transition(repo: Repo, product: Product, to: string, reason: string, extra: Row = {}) {
  if (product.status === to) return;
  await repo.update("products", product.id, { status: to, ...extra });
  await repo.insert("product_events", { product_id: product.id, from_status: product.status, to_status: to, reason, actor: "guardian" });
}

async function ensureBrief(repo: Repo, productId: string, reason: string, notes: string, parentCreativeId?: string) {
  const open = await repo.list("creative_briefs", { eq: { product_id: productId, status: "open", reason } });
  if (open.length > 0) return false;
  await repo.insert("creative_briefs", {
    product_id: productId,
    status: "open",
    reason,
    notes,
    count: reason === "refresh_fatigue" ? 3 : 4,
    formats: [],
    angles: [],
    requested_by: "guardian",
    ...(parentCreativeId ? { parent_creative_id: parentCreativeId } : {}),
  });
  return true;
}

export async function runGuardian(deps: Deps, opts: { lookbackDays?: number } = {}): Promise<GuardianReport> {
  const { repo, integrations, now } = deps;
  const report: GuardianReport = { synced: 0, spendToday: 0, killSwitchTripped: false, decisions: [], productVerdicts: [], warnings: [] };
  const guardrails = await loadGuardrails(repo);
  const rules = await loadRules(repo);
  const econDefaults = await loadEconomicsDefaults(repo);
  const lookback = opts.lookbackDays ?? 3;
  const until = day(now());
  const since = day(new Date(now().getTime() - lookback * 86400_000));

  // 1. Sync metrics
  const allAds = await repo.list<Ad>("ads", { in: { status: ["active", "paused", "killed"] }, limit: 5000 });
  for (const adapter of Object.values(integrations.ads)) {
    if (!adapter) continue;
    try {
      const byExternal = new Map(allAds.filter((a) => a.channel === adapter.channel && a.external_ad_id).map((a) => [String(a.external_ad_id), a.id]));
      const rows = (await adapter.fetchDailyMetrics(since, until))
        .filter((m) => byExternal.has(m.externalAdId))
        .map((m) => ({
          ad_id: byExternal.get(m.externalAdId)!,
          date: m.date,
          spend: m.spend,
          impressions: m.impressions,
          clicks: m.clicks,
          add_to_carts: m.addToCarts,
          checkouts: m.checkouts,
          purchases: m.purchases,
          revenue: m.revenue,
          frequency: m.frequency ?? null,
          synced_at: now().toISOString(),
        }));
      await repo.upsert("ad_metrics_daily", rows, "ad_id,date");
      report.synced += rows.length;
    } catch (e) {
      report.warnings.push(`${adapter.channel} sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const metrics = await repo.list<MetricsRow>("ad_metrics_daily", { limit: 20000 });
  const byAd = new Map<string, MetricsRow[]>();
  for (const m of metrics) {
    const list = byAd.get(m.ad_id) ?? [];
    list.push(m);
    byAd.set(m.ad_id, list);
  }
  report.spendToday = Math.round(metrics.filter((m) => m.date === until).reduce((s, m) => s + Number(m.spend), 0) * 100) / 100;

  // 2. Spend guard (defense in depth: platform-level account spend limits should already cap this)
  const active = await repo.list<Campaign>("campaigns", { eq: { status: "active" } });
  if (report.spendToday > guardrails.maxDailyAdSpend * 1.15 && !guardrails.killSwitch) {
    report.killSwitchTripped = true;
    await repo.setSetting("guardrails", { ...guardrails, killSwitch: true }, "guardian", `spend $${report.spendToday} > 115% of cap`);
    for (const c of active) {
      await submitAction(deps, { type: "ads.pause", payload: { campaign_id: c.id, reason: "spend guard" }, requested_by: "guardian", rationale: "kill switch: spend runaway" });
    }
    await integrations.notifier.send(
      `KILL SWITCH TRIPPED: today's ad spend $${report.spendToday} exceeds cap $${guardrails.maxDailyAdSpend}. All campaigns paused. Re-enable in the console after review.`,
      deps.consoleUrl ? { severity: "critical", link: deps.consoleUrl } : { severity: "critical" },
    );
    return report;
  }

  // 3. Evaluate live ads
  const campaigns = new Map((await repo.list<Campaign>("campaigns", { limit: 2000 })).map((c) => [c.id, c]));
  const products = new Map((await repo.list<Product>("products", { in: { status: ["testing", "winner", "scaling", "refreshing"] } })).map((p) => [p.id, p]));
  const decisionsByProduct = new Map<string, AdDecision[]>();
  const scaledCampaigns = new Set<string>();

  const statsFor = (ad: Ad, c: Campaign): AdStats => {
    const rows = (byAd.get(ad.id) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
    const sum = (k: keyof MetricsRow) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const freq = rows.length ? Number(rows[rows.length - 1]!.frequency ?? 0) : 0;
    const s: AdStats = {
      spend: sum("spend"),
      impressions: sum("impressions"),
      clicks: sum("clicks"),
      addToCarts: sum("add_to_carts"),
      purchases: sum("purchases"),
      revenue: sum("revenue"),
      dailyCtr: rows.map((r) => (Number(r.impressions) > 0 ? Number(r.clicks) / Number(r.impressions) : 0)),
      phase: c.phase,
    };
    if (freq) s.frequency = freq;
    if (ad.launched_at) s.ageHours = (now().getTime() - Date.parse(String(ad.launched_at))) / 3600_000;
    if (c.last_budget_change_at) s.hoursSinceBudgetChange = (now().getTime() - Date.parse(String(c.last_budget_change_at))) / 3600_000;
    return s;
  };

  for (const ad of allAds) {
    const c = campaigns.get(ad.campaign_id);
    const product = products.get(ad.product_id);
    if (!c || !product) continue;
    const econ = product.economics as { breakevenCpa?: number; targetCpa?: number } | null;
    if (!econ?.breakevenCpa) {
      report.warnings.push(`product ${product.id} has no economics; skipping ad ${ad.id}`);
      continue;
    }
    const stats = statsFor(ad, c);
    const d = evaluateAd(stats, { breakevenCpa: econ.breakevenCpa, targetCpa: econ.targetCpa ?? econ.breakevenCpa * 0.7 }, rules);
    if (c.phase === "testing") {
      const list = decisionsByProduct.get(product.id) ?? [];
      list.push(ad.status === "killed" ? { ...d, action: "kill" } : d);
      decisionsByProduct.set(product.id, list);
    }
    if (ad.status !== "active") continue;
    if (d.action === "watch" || d.action === "keep") continue;

    report.decisions.push({ ad_id: ad.id, action: d.action, reason: d.reason });
    let actionId: string | null = null;
    if (d.action === "kill") {
      const a = await submitAction(deps, { type: "ads.pause", payload: { ad_id: ad.id, kill: true, reason: d.reason }, requested_by: "guardian", rationale: d.reason });
      actionId = a.id;
    } else if (d.action === "scale" && !scaledCampaigns.has(c.id) && c.status === "active") {
      scaledCampaigns.add(c.id);
      const next = Math.round(Number(c.daily_budget) * (1 + (d.budgetChangePct ?? 0.2)) * 100) / 100;
      const a = await submitAction(deps, { type: "ads.set_budget", payload: { campaign_id: c.id, dailyBudget: next }, requested_by: "guardian", rationale: d.reason, idempotency_key: `scale-${c.id}-${until}` });
      actionId = a.id;
    } else if (d.action === "refresh_creative") {
      if (await ensureBrief(repo, product.id, "refresh_fatigue", `Fatigue on creative ${ad.creative_id}: ${d.reason}. Produce new hooks/first frames on the same winning concept.`, ad.creative_id)) {
        if (product.status === "scaling") await transition(repo, product, "refreshing", d.reason);
        await integrations.triggerLoop?.("create", `fatigue on ${product.title}`);
      }
    }
    await repo.insert("decisions", { ad_id: ad.id, product_id: product.id, source: "guardian", action: d.action, reason: d.reason, metrics: d.metrics, action_id: actionId });
  }

  // 4. Product-level verdicts for products under test
  for (const product of products.values()) {
    if (product.status === "winner") {
      const hasScaling = [...campaigns.values()].some((c) => c.product_id === product.id && c.phase === "scaling" && c.status === "active");
      if (hasScaling) await transition(repo, product, "scaling", "scaling campaign active");
      continue;
    }
    if (product.status !== "testing") continue;
    const adDecisions = decisionsByProduct.get(product.id) ?? [];
    if (adDecisions.length === 0) continue;
    const econ = product.economics as { breakevenCpa?: number } | null;
    const productAds = allAds.filter((a) => a.product_id === product.id && campaigns.get(a.campaign_id)?.phase === "testing");
    const totalSpend = productAds.reduce((s, a) => s + (byAd.get(a.id) ?? []).reduce((x, r) => x + Number(r.spend), 0), 0);
    const testBudget = Number(product.test_budget ?? (econ?.breakevenCpa ?? 0) * econDefaults.testBudgetMultiple);
    const verdict = evaluateProductTest({ productId: product.id, totalSpend, testBudget, adDecisions });
    if (verdict.action === "continue_test") continue;
    report.productVerdicts.push({ product_id: product.id, action: verdict.action, reason: verdict.reason });

    if (verdict.action === "declare_winner") {
      await transition(repo, product, "winner", verdict.reason, { outcome: "winner", decided_at: now().toISOString() });
      await ensureBrief(repo, product.id, "iterate_winner", "Winner declared. Produce iterations of the best ad: new hooks, first frames, formats on the same angle, plus 1-2 new angles.");
      await integrations.notifier.send(`WINNER: ${product.title} — ${verdict.reason}`, deps.consoleUrl ? { link: deps.consoleUrl } : {});
      await integrations.triggerLoop?.("create", `winner ${product.title}`);
    } else if (verdict.action === "kill_product") {
      for (const c of campaigns.values()) {
        if (c.product_id === product.id && c.status === "active") {
          await submitAction(deps, { type: "ads.pause", payload: { campaign_id: c.id, kill: true, reason: verdict.reason }, requested_by: "guardian", rationale: verdict.reason });
        }
      }
      await transition(repo, product, "killed", verdict.reason, { outcome: "loser", decided_at: now().toISOString() });
      await integrations.notifier.send(`Killed test: ${product.title} — ${verdict.reason} (spent $${totalSpend.toFixed(2)})`);
    } else if (verdict.action === "iterate_creatives") {
      const prior = await repo.list("creative_briefs", { eq: { product_id: product.id, reason: "new_angles" } });
      if (prior.length >= 1) {
        await transition(repo, product, "killed", `${verdict.reason}; already iterated once`, { outcome: "loser", decided_at: now().toISOString() });
      } else {
        await transition(repo, product, "creative_production", verdict.reason);
        await ensureBrief(repo, product.id, "new_angles", `${verdict.reason}. Use different angles/hook types than the first batch; keep anything with P(profitable)>=0.4.`);
        await integrations.triggerLoop?.("create", `iterate ${product.title}`);
      }
    }
  }

  const notable = report.decisions.filter((d) => d.action !== "keep").length + report.productVerdicts.length;
  if (notable > 0) {
    await integrations.notifier.send(
      `Guardian: ${report.decisions.length} ad decision(s), ${report.productVerdicts.length} product verdict(s). Spend today $${report.spendToday}.`,
      deps.consoleUrl ? { link: deps.consoleUrl } : {},
    );
  }
  return report;
}
