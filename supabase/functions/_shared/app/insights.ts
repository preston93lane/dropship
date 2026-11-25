/**
 * Creative insights: which formats, hook types, angles, styles and concept families actually perform.
 * Feeds the creative director (what to make next) and the weekly retrospective (what to write down).
 */
import type { Ad, Creative, MetricsRow, Repo } from "../repo/types.ts";

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const INSIGHT_DIMENSIONS = ["format", "style", "hook_type", "angle", "concept_family", "aspect", "ai_generated"] as const;

interface Agg {
  creatives: number;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

const finish = (a: Agg) => ({
  ...a,
  spend: r(a.spend),
  revenue: r(a.revenue),
  ctr: a.impressions ? r(a.clicks / a.impressions, 4) : null,
  cvr: a.clicks ? r(a.purchases / a.clicks, 4) : null,
  cpa: a.purchases ? r(a.spend / a.purchases) : null,
  roas: a.spend ? r(a.revenue / a.spend) : null,
});

export async function creativeInsights(repo: Repo, opts: { minSpend?: number } = {}) {
  const minSpend = opts.minSpend ?? 5;
  const [creatives, ads, metrics] = await Promise.all([
    repo.list<Creative>("creatives", { limit: 5000 }),
    repo.list<Ad>("ads", { limit: 10000 }),
    repo.list<MetricsRow>("ad_metrics_daily", { limit: 50000 }),
  ]);
  const byAd = new Map<string, Agg>();
  for (const m of metrics) {
    const a = byAd.get(m.ad_id) ?? { creatives: 0, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
    a.spend += Number(m.spend);
    a.impressions += Number(m.impressions);
    a.clicks += Number(m.clicks);
    a.purchases += Number(m.purchases);
    a.revenue += Number(m.revenue);
    byAd.set(m.ad_id, a);
  }
  const byCreative = new Map<string, Agg>();
  for (const ad of ads) {
    const m = byAd.get(ad.id);
    if (!m) continue;
    const c = byCreative.get(ad.creative_id) ?? { creatives: 1, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
    c.spend += m.spend;
    c.impressions += m.impressions;
    c.clicks += m.clicks;
    c.purchases += m.purchases;
    c.revenue += m.revenue;
    byCreative.set(ad.creative_id, c);
  }

  const measured = creatives.filter((c) => (byCreative.get(c.id)?.spend ?? 0) >= minSpend);
  const dimensions: Record<string, unknown[]> = {};
  for (const dim of INSIGHT_DIMENSIONS) {
    const groups = new Map<string, Agg>();
    for (const c of measured) {
      const key = String(c[dim] ?? "unknown");
      const g = groups.get(key) ?? { creatives: 0, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
      const m = byCreative.get(c.id)!;
      g.creatives += 1;
      g.spend += m.spend;
      g.impressions += m.impressions;
      g.clicks += m.clicks;
      g.purchases += m.purchases;
      g.revenue += m.revenue;
      groups.set(key, g);
    }
    dimensions[dim] = [...groups.entries()].map(([value, g]) => ({ value, ...finish(g) })).sort((a, b) => (b.purchases - a.purchases) || ((b.ctr ?? 0) - (a.ctr ?? 0)));
  }
  const top = measured
    .map((c) => ({ creative_id: c.id, product_id: c.product_id, format: c.format, hook_type: c.hook_type ?? null, hook_text: c.hook_text ?? null, concept_family: c.concept_family ?? null, ...finish(byCreative.get(c.id)!) }))
    .sort((a, b) => (b.purchases - a.purchases) || ((b.ctr ?? 0) - (a.ctr ?? 0)))
    .slice(0, 15);
  return {
    measured_creatives: measured.length,
    min_spend: minSpend,
    caution: measured.length < 20 ? "Small sample: treat differences as hypotheses, not lessons (see retrospective skill)." : null,
    dimensions,
    top_creatives: top,
  };
}
