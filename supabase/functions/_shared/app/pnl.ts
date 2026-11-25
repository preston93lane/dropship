/**
 * Profit and loss, the number that matters: what the store took in, minus refunds, product, shipping,
 * fees, ad spend and the machine's own cost. Uses Shopify orders when they exist ("store" source);
 * otherwise falls back to platform-reported purchases x modeled contribution ("modeled" source).
 */
import type { Ad, MetricsRow, Product, Repo, Row } from "../repo/types.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: Date) => d.toISOString().slice(0, 10);

export interface PnlDay {
  date: string;
  ad_spend: number;
  platform_revenue: number;
  platform_purchases: number;
  store_orders: number;
  store_revenue: number;
  refunds: number;
  product_and_shipping: number;
  fees: number;
  contribution_after_ads: number;
  machine_cost: number;
  net: number;
}

export async function computePnl(repo: Repo, now: Date, days = 7) {
  const since = day(new Date(now.getTime() - (days - 1) * 86400_000));
  const [metrics, orders, costs, runs, ads, products] = await Promise.all([
    repo.list<MetricsRow>("ad_metrics_daily", { gte: { date: since }, limit: 50000 }),
    repo.list<Row>("orders", { gte: { ordered_at: since }, limit: 50000 }),
    repo.list<Row>("costs", { gte: { date: since }, limit: 50000 }),
    repo.list<Row>("agent_runs", { gte: { started_at: since }, limit: 50000 }),
    repo.list<Ad>("ads", { limit: 10000 }),
    repo.list<Product>("products", { limit: 5000 }),
  ]);
  const productOfAd = new Map(ads.map((a) => [a.id, a.product_id]));
  const contributionOf = new Map(products.map((p) => [p.id, Number((p.economics as { contribution?: number } | null)?.contribution ?? 0)]));
  const useStore = orders.length > 0;

  const daysMap = new Map<string, PnlDay>();
  for (let i = 0; i < days; i++) {
    const d = day(new Date(now.getTime() - (days - 1 - i) * 86400_000));
    daysMap.set(d, { date: d, ad_spend: 0, platform_revenue: 0, platform_purchases: 0, store_orders: 0, store_revenue: 0, refunds: 0, product_and_shipping: 0, fees: 0, contribution_after_ads: 0, machine_cost: 0, net: 0 });
  }
  const at = (d: string) => daysMap.get(d.slice(0, 10));
  const perProduct = new Map<string, { product_id: string; title: string; ad_spend: number; store_revenue: number; orders: number; contribution_after_ads: number }>();
  const prod = (id: string | null | undefined) => {
    const key = id ?? "other";
    let p = perProduct.get(key);
    if (!p) {
      p = { product_id: key, title: products.find((x) => x.id === id)?.title ?? "(unmatched)", ad_spend: 0, store_revenue: 0, orders: 0, contribution_after_ads: 0 };
      perProduct.set(key, p);
    }
    return p;
  };

  for (const m of metrics) {
    const d = at(String(m.date));
    if (!d) continue;
    const pid = productOfAd.get(m.ad_id);
    d.ad_spend += Number(m.spend);
    d.platform_revenue += Number(m.revenue);
    d.platform_purchases += Number(m.purchases);
    const pp = prod(pid);
    pp.ad_spend += Number(m.spend);
    pp.contribution_after_ads -= Number(m.spend);
    if (!useStore) {
      const c = Number(m.purchases) * (pid ? (contributionOf.get(pid) ?? 0) : 0);
      d.contribution_after_ads += c;
      pp.contribution_after_ads += c;
    }
  }
  const orderIds = new Set<string>();
  for (const o of orders) {
    const d = at(String(o.ordered_at));
    if (!d) continue;
    const rev = Number(o.revenue);
    const variable = Number(o.refunded ?? 0) + Number(o.cogs ?? 0) + Number(o.shipping_cost ?? 0) + Number(o.fees ?? 0);
    orderIds.add(String(o.shopify_order_id).split(":")[0]!);
    d.store_revenue += rev;
    d.refunds += Number(o.refunded ?? 0);
    d.product_and_shipping += Number(o.cogs ?? 0) + Number(o.shipping_cost ?? 0);
    d.fees += Number(o.fees ?? 0);
    d.contribution_after_ads += rev - variable;
    const pp = prod(o.product_id as string | null);
    pp.store_revenue += rev;
    pp.orders += 1;
    pp.contribution_after_ads += rev - variable;
  }
  for (const d of daysMap.values()) {
    d.store_orders = orders.filter((o) => String(o.ordered_at).slice(0, 10) === d.date).map((o) => String(o.shopify_order_id).split(":")[0]).filter((v, i, a) => a.indexOf(v) === i).length;
  }
  for (const c of costs) {
    if (!["llm", "media", "research", "saas"].includes(String(c.category))) continue;
    const d = at(String(c.date));
    if (d) d.machine_cost += Number(c.amount);
  }
  for (const r of runs) {
    const d = at(String(r.started_at));
    if (d) d.machine_cost += Number(r.llm_cost ?? 0) + Number(r.media_cost ?? 0);
  }

  const out = [...daysMap.values()].map((d) => {
    const contribution = d.contribution_after_ads - d.ad_spend;
    return {
      ...d,
      ad_spend: r2(d.ad_spend),
      platform_revenue: r2(d.platform_revenue),
      store_revenue: r2(d.store_revenue),
      refunds: r2(d.refunds),
      product_and_shipping: r2(d.product_and_shipping),
      fees: r2(d.fees),
      contribution_after_ads: r2(contribution),
      machine_cost: r2(d.machine_cost),
      net: r2(contribution - d.machine_cost),
    };
  });
  const sum = (k: keyof PnlDay) => r2(out.reduce((s, d) => s + Number(d[k]), 0));
  const totals = {
    ad_spend: sum("ad_spend"),
    platform_revenue: sum("platform_revenue"),
    platform_purchases: sum("platform_purchases"),
    store_orders: orderIds.size,
    store_revenue: sum("store_revenue"),
    refunds: sum("refunds"),
    product_and_shipping: sum("product_and_shipping"),
    fees: sum("fees"),
    contribution_after_ads: sum("contribution_after_ads"),
    machine_cost: sum("machine_cost"),
    net: sum("net"),
  };
  return {
    days,
    since,
    contribution_source: useStore ? "store" : "modeled",
    note: useStore ? "From Shopify orders (true revenue, refunds, COGS, fees)." : "No Shopify orders synced yet: contribution = platform-reported purchases x modeled contribution per order.",
    attribution_ratio: totals.store_revenue > 0 ? r2(totals.platform_revenue / totals.store_revenue) : null,
    machine_cost_share: totals.contribution_after_ads > 0 ? r2(totals.machine_cost / totals.contribution_after_ads) : null,
    totals,
    by_day: out,
    by_product: [...perProduct.values()].map((p) => ({ ...p, ad_spend: r2(p.ad_spend), store_revenue: r2(p.store_revenue), contribution_after_ads: r2(p.contribution_after_ads) })).sort((a, b) => b.contribution_after_ads - a.contribution_after_ads),
  };
}
