import { PRODUCT_OWNER } from "../core/lifecycle.ts";
import type { Campaign, MetricsRow, Product } from "../repo/types.ts";
import type { Deps } from "./actions.ts";
import { loadGuardrails } from "./settings.ts";

/** The one-glance state of the business (used by /v1/summary, the console and Telegram /status). */
export async function buildSummary(deps: Deps) {
  const { repo } = deps;
  const guardrails = await loadGuardrails(repo);
  const products = await repo.list<Product>("products", { limit: 2000 });
  const counts: Record<string, number> = {};
  for (const p of products) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const active = await repo.list<Campaign>("campaigns", { eq: { status: "active" } });
  const pending = await repo.list("actions", { eq: { status: "pending_approval" } });
  const today = deps.now().toISOString().slice(0, 10);
  const metrics = await repo.list<MetricsRow>("ad_metrics_daily", { eq: { date: today } });
  const openBriefs = await repo.list("creative_briefs", { eq: { status: "open" } });
  const inReview = await repo.list("creatives", { eq: { status: "in_review" } });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    guardrails,
    dry_run: deps.integrations.dryRun,
    products_by_status: counts,
    next_owner_by_status: PRODUCT_OWNER,
    active_campaigns: active.length,
    committed_daily_budget: r2(active.reduce((s, c) => s + Number(c.daily_budget), 0)),
    spend_today: r2(metrics.reduce((s, m) => s + Number(m.spend), 0)),
    revenue_today: r2(metrics.reduce((s, m) => s + Number(m.revenue), 0)),
    pending_approvals: pending.length,
    open_briefs: openBriefs.length,
    creatives_in_review: inReview.length,
  };
}
