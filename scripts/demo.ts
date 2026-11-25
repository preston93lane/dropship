/**
 * Seed the local dev gateway with a realistic week of business so the console, reports, P&L,
 * insights and every agent have something real-looking to work with. Everything is fake (dry-run).
 *
 *   npm run demo            # writes data/dev-db.json
 *   npm run dev:gateway     # then open http://localhost:8787/console (admin key: dev-admin-key)
 *
 * Scenario (desk-setup niche): one winner (scale waiting on your approval), one product whose first hooks all
 * failed (sent back for new angles), one mid-test,
 * one validated product waiting for launch approval, one candidate, one rejected for IP risk,
 * Shopify orders with a refund, machine costs, a daily report and an improvement proposal.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { MemoryRepo } from "../supabase/functions/_shared/repo/memory.ts";
import { ConsoleNotifier, DryRunAds, DryRunStore, DryRunSupplier } from "../supabase/functions/_shared/adapters/index.ts";
import type { Integrations } from "../supabase/functions/_shared/adapters/types.ts";
import { createGateway } from "../supabase/functions/_shared/app/gateway.ts";
import { runGuardian } from "../supabase/functions/_shared/app/guardian.ts";
import { ingestShopifyOrder } from "../supabase/functions/_shared/app/shopify-webhooks.ts";
import type { Row } from "../supabase/functions/_shared/repo/types.ts";

const DAY = 86400_000;
const realNow = Date.now();
let clock = new Date(realNow - 9 * DAY);
const now = () => clock;
const dateAgo = (d: number) => new Date(realNow - d * DAY).toISOString().slice(0, 10);

const repo = new MemoryRepo(now);
const meta = new DryRunAds("meta");
const integrations: Integrations = { dryRun: true, ads: { meta, tiktok: new DryRunAds("tiktok") }, store: new DryRunStore(), supplier: new DryRunSupplier(), notifier: new ConsoleNotifier(), publications: {} };
const deps = { repo, integrations, now, consoleUrl: "http://localhost:8787/console" };
const ADMIN = "dev-admin-key";
const handle = createGateway(deps, { agentKey: "dev-agent-key", adminKey: ADMIN, cronSecret: "dev-cron" });

async function api(method: string, path: string, body?: unknown, agent = "demo"): Promise<Row> {
  const res = await handle(new Request(`http://localhost${path}`, { method, headers: { authorization: `Bearer ${ADMIN}`, "x-agent": agent, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const json = (await res.json()) as Row;
  if (res.status >= 400 && res.status !== 409 && res.status !== 202) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const comps = (d: number, p: number, w: number, c: number, comp: number, t: number) => ({ demand: d, proof: p, wow: w, creative_potential: c, competition: comp, trend_timing: t });

async function product(title: string, supplier: Row, components: Row, extra: Row = {}) {
  const p = await api("POST", "/v1/products", { title, niche: "desk setup", source: "tiktok_creative_center", supplier, components, ...extra }, "trend-scout");
  await api("POST", `/v1/products/${p.id}/score`, undefined, "product-analyst");
  return String(p.id);
}

async function launch(id: string, hooks: { hook: string; type: string; family: string; format?: string }[]) {
  await api("PATCH", `/v1/products/${id}`, { status: "validated", reason: "strong proof, US warehouse" }, "product-analyst");
  await api("PATCH", `/v1/products/${id}`, { status: "approved", reason: "open slot, fits niche" }, "orchestrator");
  await api("POST", "/v1/actions", { type: "shopify.create_product", payload: { product_id: id, listing: { title: "listing", descriptionHtml: "<p>demo</p>", variants: [{ price: 29.99 }] } }, rationale: "draft listing" }, "store-manager");
  await api("PATCH", `/v1/products/${id}`, { status: "listing" }, "orchestrator");
  await api("PATCH", `/v1/products/${id}`, { status: "creative_production" }, "orchestrator");
  const ids: string[] = [];
  for (const h of hooks) {
    const c = await api("POST", "/v1/creatives", { product_id: id, format: h.format ?? "video", style: h.format === "static" ? "hero-benefits" : "demo", hook_type: h.type, hook_text: h.hook, concept_family: h.family, angle: h.family.split("-")[0], primary_text: h.hook, headline: "Tidy desk in 10 seconds", asset_url: "https://example.invalid/demo.mp4", status: "in_review", production_cost: h.format === "static" ? 0.25 : 3.1, ai_generated: true }, h.format === "static" ? "static-designer" : "video-producer");
    await api("POST", `/v1/creatives/${c.id}/compliance`, { verdict: "pass", issues: [], checklist: { claims: "ok", testimonials: "ok", fidelity: "ok" } }, "compliance-reviewer");
    ids.push(String(c.id));
  }
  await api("PATCH", `/v1/products/${id}`, { status: "ready_to_test" }, "orchestrator");
  const t = await api("POST", "/v1/actions", { type: "ads.create_test", payload: { product_id: id, channel: "meta", dailyBudget: 40, creative_ids: ids }, rationale: "initial test" }, "media-buyer");
  const campaignId = String((t.result as Row).campaign_id);
  const act = await api("POST", "/v1/actions", { type: "ads.activate", payload: { campaign_id: campaignId }, rationale: "launch test" }, "media-buyer");
  await handle(new Request(`http://localhost/console/actions/${act.id}/approve`, { method: "POST", headers: { cookie: `dsadmin=${ADMIN}` } }));
  const ads = await repo.list("ads", { eq: { campaign_id: campaignId } });
  return { campaignId, extIds: ids.map((cid) => String(ads.find((a) => a.creative_id === cid)!.external_ad_id)) };
}

// metrics for one ad across the last N days: [spend, impressions, clicks, atc, purchases, revenue]
type Day = [number, number, number, number, number, number];
const metricsFor = (ext: string, days: Day[]) =>
  days.map(([spend, impressions, clicks, atc, purchases, revenue], i) => ({ externalAdId: ext, date: dateAgo(days.length - 1 - i), spend, impressions, clicks, addToCarts: atc, checkouts: Math.round(atc / 2), purchases, revenue, frequency: 1.2 + i * 0.2 }));

// A small but realistic account: three tests running at once.
await repo.setSetting("guardrails", { autonomyLevel: 1, killSwitch: false, maxDailyAdSpend: 150, maxDailyBudgetPerAdSet: 50, maxBudgetIncreasePct: 0.3, maxNewTestsPerDay: 3, maxActiveTestingProducts: 4, maxAutoPriceChangePct: 0.15, maxSampleOrderCost: 60, maxSampleOrdersPerWeek: 3 }, "demo");

// ---- research ---------------------------------------------------------------
const cable = await product("Magnetic Under-Desk Cable Organizer", { name: "CJ", product_id: "CJ-1001", variant_id: "CJ-1001-BLK", cogs: 6.2, shipping_cost: 4.1, shipping_days: 5, warehouse_country: "US" }, comps(8, 8, 8, 8, 6, 7), { source_urls: ["https://ads.tiktok.com/business/creativecenter/"], signals: { advertisers_seen: 5, oldest_ad_days: 41 } });
const pad = await product("Wireless Charging Desk Pad", { name: "CJ", product_id: "CJ-2002", cogs: 11.5, shipping_cost: 5, shipping_days: 6, warehouse_country: "US" }, comps(7, 7, 7, 7, 5, 6));
const light = await product("Monitor Light Bar with Remote", { name: "CJ", product_id: "CJ-3003", cogs: 12, shipping_cost: 5.5, shipping_days: 6, warehouse_country: "US" }, comps(8, 7, 7, 8, 5, 6));
const hook = await product("Under-Desk Headphone Hook", { name: "Zendrop", product_id: "ZD-44", cogs: 4.8, shipping_cost: 3.9, shipping_days: 5, warehouse_country: "US" }, comps(7, 7, 7, 7, 7, 7), { notes: "Clamp-on, no drilling. 3 advertisers, oldest ad 22 days. Unclaimed angle: 'stop putting headphones on the desk'." });
await product("Foldable Aluminum Laptop Stand", { name: "CJ", product_id: "CJ-5005", cogs: 9, shipping_cost: 6, shipping_days: 9, warehouse_country: "CN" }, { demand: 7, proof: 5 });
const licensed = await product("Cartoon Character Cable Clips", { name: "AliExpress", product_id: "AE-77", cogs: 2, shipping_cost: 3, shipping_days: 14, warehouse_country: "CN" }, comps(8, 6, 7, 6, 5, 6), { risk_flags: { trademarkRisk: true } });
await api("PATCH", `/v1/products/${hook}`, { status: "validated", reason: "priority score, US stock, unclaimed angle" }, "product-analyst");
await api("PATCH", `/v1/products/${licensed}`, { status: "rejected", reason: "trademark/IP risk (licensed characters)" }, "product-analyst");

// ---- tests --------------------------------------------------------------------
clock = new Date(realNow - 5 * DAY);
const A = await launch(cable, [
  { hook: "POV: you finally fixed the cable mess", type: "pov", family: "glowup-demo" },
  { hook: "Stop using zip ties for your cables", type: "negative", family: "comparison-presenter" },
  { hook: "Your desk, finally tidy", type: "demo_first", family: "glowup-static", format: "static" },
]);
const B = await launch(pad, [
  { hook: "Charge without the cable clutter", type: "problem_callout", family: "clutter-demo" },
  { hook: "The desk mat that charges your phone", type: "curiosity", family: "mechanism-presenter" },
  { hook: "Desk upgrade under $40", type: "price_anchor", family: "upgrade-static", format: "static" },
]);
clock = new Date(realNow - 2 * DAY);
const C = await launch(light, [
  { hook: "Your eyes after 8 hours of screen time", type: "problem_callout", family: "eyestrain-demo" },
  { hook: "No glare, no desk space", type: "demo_first", family: "space-showcase" },
  { hook: "Lamp vs light bar", type: "comparison", family: "comparison-static", format: "static" },
]);

meta.metrics = [
  ...metricsFor(A.extIds[0]!, [[18, 2100, 44, 6, 2, 59.98], [24, 2900, 61, 9, 3, 89.97], [27, 3300, 70, 10, 3, 104.97], [29, 3600, 74, 11, 4, 129.96], [30, 3700, 77, 12, 4, 119.96]]),
  ...metricsFor(A.extIds[1]!, [[12, 1800, 20, 2, 0, 0], [15, 2300, 26, 3, 1, 29.99], [14, 2200, 25, 2, 0, 0]]),
  ...metricsFor(A.extIds[2]!, [[6, 1500, 12, 1, 0, 0], [7, 1700, 14, 2, 1, 29.99]]),
  ...metricsFor(B.extIds[0]!, [[16, 2600, 22, 1, 0, 0], [18, 2900, 25, 1, 0, 0], [17, 2800, 23, 0, 0, 0]]),
  ...metricsFor(B.extIds[1]!, [[14, 2400, 15, 0, 0, 0], [16, 2700, 17, 1, 0, 0], [15, 2600, 16, 0, 0, 0]]),
  ...metricsFor(B.extIds[2]!, [[9, 2000, 9, 0, 0, 0], [10, 2100, 10, 0, 0, 0], [11, 2200, 11, 1, 0, 0]]),
  ...metricsFor(C.extIds[0]!, [[11, 1400, 21, 3, 1, 37.99], [12, 1500, 23, 3, 0, 0]]),
  ...metricsFor(C.extIds[1]!, [[9, 1200, 15, 2, 0, 0]]),
];
clock = new Date(realNow);
const gr = await runGuardian(deps);
if (process.env.DEMO_DEBUG) console.log(JSON.stringify(gr, null, 1));

// ---- store orders (what Shopify webhooks would deliver) ---------------------------
const cableRow = await repo.get("products", cable);
const shopifyId = Number(String(cableRow!.shopify_product_id ?? "1").replace(/\D/g, "").slice(0, 9) || 1);
await repo.update("products", cable, { shopify_product_id: `gid://shopify/Product/${shopifyId}` });
let orderId = 9000;
for (let d = 4; d >= 0; d--) {
  for (let i = 0; i < 3; i++) {
    const refunds = d === 3 && i === 0 ? [{ refund_line_items: [{ subtotal: "29.99", line_item: { product_id: shopifyId } }] }] : [];
    await ingestShopifyOrder(repo, { id: ++orderId, created_at: `${dateAgo(d)}T1${i}:00:00Z`, line_items: [{ product_id: shopifyId, quantity: i === 2 ? 2 : 1, price: "29.99", total_discount: i === 2 ? "10.00" : "0" }], refunds, fulfillment_status: d > 2 ? "fulfilled" : null });
  }
}

// ---- machine costs, a report, a proposal, a waiting product decision ----------------
for (let d = 6; d >= 0; d--) {
  await repo.insert("costs", { date: dateAgo(d), category: "llm", vendor: "anthropic", amount: 9.5 + (d % 3) });
  await repo.insert("costs", { date: dateAgo(d), category: "media", vendor: "fal", amount: d % 2 ? 11.2 : 6.4 });
}
const pnl = await api("GET", "/v1/pnl?days=7");
const t = pnl.totals as Record<string, number>;
await api("POST", "/v1/reports", {
  kind: "daily",
  title: `${new Date(realNow).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: $${t.net} net (7d), 1 winner, 5 ads killed`,
  summary: `7d: spend $${t.ad_spend} -> store revenue $${t.store_revenue}; contribution after ads $${t.contribution_after_ads}; machine $${t.machine_cost}; net $${t.net}.\nWinner: Magnetic Cable Organizer (budget increase waiting on you). Charging Desk Pad: all 3 hooks failed early, back to creative for new angles.\nWaiting on you: 1 budget increase, 1 product launch decision.`,
  body_md: "Demo report generated by `npm run demo`. Real reports come from the performance-analyst's REPORT loop.",
  metrics: t,
  notify: false,
}, "performance-analyst");
await api("POST", "/v1/proposals", {
  kind: "skill_edit",
  title: "video-ad-scripting: open with the product working, not a talking head",
  rationale: "Demo proposal. In this store's tests, demo-first hooks out-performed presenter openings on CTR (2 of 2 families).",
  evidence: { creatives: [], n: 6 },
  files: [],
}, "self-improver");

mkdirSync("data", { recursive: true });
writeFileSync("data/dev-db.json", JSON.stringify({ tables: Object.fromEntries([...repo.tables].map(([k, m]) => [k, [...m.values()]])), settings: Object.fromEntries(repo.settings) }, null, 1));
const products = await repo.list("products");
console.log("Demo data written to data/dev-db.json");
console.log("Products:", products.map((p) => `${p.title} [${p.status}]`).join(" | "));
console.log(`7-day P&L (${pnl.contribution_source}): spend $${t.ad_spend}, store revenue $${t.store_revenue}, contribution after ads $${t.contribution_after_ads}, machine $${t.machine_cost}, net $${t.net}`);
console.log("Pending approvals:", (await repo.list("actions", { eq: { status: "pending_approval" } })).length);
console.log("Next: npm run dev:gateway, then open http://localhost:8787/console (admin key: dev-admin-key)");
