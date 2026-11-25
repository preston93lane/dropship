/**
 * End-to-end gateway test with the in-memory repo and dry-run adapters:
 * research -> score -> approve -> list -> creatives -> compliance -> test -> approve spend
 * -> guardian kills a loser, scales a winner -> kill switch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryRepo } from "../repo/memory.ts";
import { ConsoleNotifier, DryRunAds, DryRunStore, DryRunSupplier } from "../adapters/index.ts";
import type { Integrations } from "../adapters/types.ts";
import { createGateway } from "./gateway.ts";
import { runGuardian } from "./guardian.ts";
import { DEFAULT_GUARDRAILS } from "../core/policy.ts";

const AGENT = "agent-key-123";
const ADMIN = "admin-key-456";

function setup() {
  let clock = new Date("2026-11-25T15:00:00Z");
  const now = () => clock;
  const repo = new MemoryRepo(now);
  const meta = new DryRunAds("meta");
  const notifier = new ConsoleNotifier();
  const integrations: Integrations = {
    dryRun: true,
    ads: { meta, tiktok: new DryRunAds("tiktok") },
    store: new DryRunStore(),
    supplier: new DryRunSupplier(),
    notifier,
    publications: {},
  };
  const deps = { repo, integrations, now };
  const handle = createGateway(deps, { agentKey: AGENT, adminKey: ADMIN, cronSecret: "cron" });
  const call = async (method: string, path: string, body?: unknown, opts: { admin?: boolean; agent?: string } = {}) => {
    const res = await handle(
      new Request(`https://x.supabase.co/functions/v1/gateway${path}`, {
        method,
        headers: {
          authorization: `Bearer ${opts.admin ? ADMIN : AGENT}`,
          "x-agent": opts.agent ?? "test-agent",
          "content-type": "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { repo, meta, notifier, deps, call, advance: (h: number) => (clock = new Date(clock.getTime() + h * 3600_000)) };
}

test("auth: rejects missing key, health is public", async () => {
  const { deps } = setup();
  const handle = createGateway(deps, { agentKey: AGENT, adminKey: ADMIN, cronSecret: "cron" });
  const r = await handle(new Request("https://x/functions/v1/gateway/v1/summary"));
  assert.equal(r.status, 401);
  const h = await handle(new Request("https://x/functions/v1/gateway/v1/health"));
  assert.equal(h.status, 200);
});

test("full loop: research to guardian decisions", async () => {
  const { repo, meta, call, deps, advance } = setup();

  // RESEARCH: candidate with evidence
  const created = await call("POST", "/v1/products", {
    title: "Magnetic Cable Organizer",
    niche: "desk setup",
    signals: { tiktok_views_7d: 2_400_000, ads_running_30d_plus: 6 },
    components: { demand: 8, proof: 8, wow: 8, creative_potential: 8, competition: 6, trend_timing: 7 },
    supplier: { name: "CJ", product_id: "CJ123", variant_id: "CJ123-BLK", cogs: 6.2, shipping_cost: 4.1, shipping_days: 5, warehouse_country: "US" },
  }, { agent: "trend-scout" });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.ok(created.body.economics.contribution > 15, "economics computed from supplier + suggested price");

  const dup = await call("POST", "/v1/products", { title: "magnetic cable organizer" });
  assert.equal(dup.status, 409);

  // Cannot validate before scoring
  assert.equal((await call("PATCH", `/v1/products/${id}`, { status: "validated" })).status, 409);
  const score = await call("POST", `/v1/products/${id}/score`);
  assert.equal(score.body.verdict, "priority");
  assert.equal((await call("PATCH", `/v1/products/${id}`, { status: "validated", reason: "strong" })).status, 200);
  assert.equal((await call("PATCH", `/v1/products/${id}`, { status: "approved", reason: "launch" }, { agent: "orchestrator" })).status, 200);

  // EXECUTE: listing (auto at L1 because it is a draft)
  const listing = await call("POST", "/v1/actions", {
    type: "shopify.create_product",
    payload: { product_id: id, listing: { title: "Magnetic Cable Organizer", descriptionHtml: "<p>Tidy desk</p>", variants: [{ price: 29.99 }] } },
    rationale: "draft listing",
  }, { agent: "store-manager" });
  assert.equal(listing.status, 200);
  assert.equal(listing.body.status, "succeeded");
  await call("PATCH", `/v1/products/${id}`, { status: "listing" });
  await call("PATCH", `/v1/products/${id}`, { status: "creative_production" });

  // CREATE: three creatives, compliance review
  const creativeIds: string[] = [];
  for (const hook of ["POV: your desk after", "Stop losing cables", "3 reasons"]) {
    const c = await call("POST", "/v1/creatives", { product_id: id, format: "video", hook_text: hook, asset_url: "https://cdn/x.mp4", primary_text: "Tidy desk in 10s", headline: "Desk glow-up", status: "in_review" }, { agent: "video-producer" });
    assert.equal(c.status, 201);
    creativeIds.push(c.body.id);
  }
  // Agents cannot self-approve via PATCH
  assert.equal((await call("PATCH", `/v1/creatives/${creativeIds[0]}`, { status: "approved" })).status, 409);
  // Not enough approved creatives yet
  assert.equal((await call("PATCH", `/v1/products/${id}`, { status: "ready_to_test" })).status, 409);
  for (const cid of creativeIds) {
    const r = await call("POST", `/v1/creatives/${cid}/compliance`, { verdict: "pass", issues: [] }, { agent: "compliance-reviewer" });
    assert.equal(r.body.status, "approved");
  }
  assert.equal((await call("PATCH", `/v1/products/${id}`, { status: "ready_to_test" })).status, 200);

  // Ads: create paused test (auto at L1), activation needs a human at L1
  const createTest = await call("POST", "/v1/actions", { type: "ads.create_test", payload: { product_id: id, channel: "meta", dailyBudget: 30, creative_ids: creativeIds } }, { agent: "media-buyer" });
  assert.equal(createTest.body.status, "succeeded", JSON.stringify(createTest.body));
  const campaignId = createTest.body.result.campaign_id;
  const activate = await call("POST", "/v1/actions", { type: "ads.activate", payload: { campaign_id: campaignId } }, { agent: "media-buyer" });
  assert.equal(activate.status, 202);
  assert.equal(activate.body.status, "pending_approval");

  // Human approves in the console
  const handle = createGateway(deps, { agentKey: AGENT, adminKey: ADMIN, cronSecret: "cron" });
  const approve = await handle(new Request(`https://x/functions/v1/gateway/console/actions/${activate.body.id}/approve`, { method: "POST", headers: { cookie: `dsadmin=${ADMIN}` } }));
  assert.equal(approve.status, 303);
  const product = await repo.get("products", id);
  assert.equal(product!.status, "testing");

  // ADAPT: inject metrics. Ad 0 = loser (no purchases), ad 1 = winner, ad 2 = still learning
  const ads = await repo.list("ads", { eq: { campaign_id: campaignId } });
  const ext = (i: number) => String(ads.find((a) => a.creative_id === creativeIds[i])!.external_ad_id);
  meta.metrics = [
    { externalAdId: ext(0), date: "2026-11-25", spend: 40, impressions: 4000, clicks: 70, addToCarts: 2, checkouts: 0, purchases: 0, revenue: 0 },
    { externalAdId: ext(1), date: "2026-11-25", spend: 60, impressions: 9000, clicks: 160, addToCarts: 24, checkouts: 12, purchases: 8, revenue: 248 },
    { externalAdId: ext(2), date: "2026-11-25", spend: 5, impressions: 600, clicks: 9, addToCarts: 0, checkouts: 0, purchases: 0, revenue: 0 },
  ];
  advance(30);
  const report = await runGuardian(deps);
  assert.equal(report.synced, 3);
  const byAction = Object.fromEntries(report.decisions.map((d) => [d.action, d]));
  assert.ok(byAction.kill, `expected a kill: ${JSON.stringify(report.decisions)}`);
  assert.ok(byAction.scale, `expected a scale: ${JSON.stringify(report.decisions)}`);
  const killedAd = await repo.get("ads", ads.find((a) => a.creative_id === creativeIds[0])!.id as string);
  assert.equal(killedAd!.status, "killed");
  // Scaling is a budget increase: at L1 it waits for a human
  const pendingBudget = await repo.list("actions", { eq: { type: "ads.set_budget", status: "pending_approval" } });
  assert.equal(pendingBudget.length, 1);
  assert.equal((pendingBudget[0]!.payload as { dailyBudget: number }).dailyBudget, 36);
  assert.equal(report.productVerdicts[0]?.action, "declare_winner");
  assert.equal((await repo.get("products", id))!.status, "winner");
  assert.equal((await repo.list("creative_briefs", { eq: { product_id: id, reason: "iterate_winner" } })).length, 1);

  const perf = await call("GET", `/v1/performance?product_id=${id}`);
  assert.equal(perf.body.length, 3);
  const alloc = await call("GET", "/v1/allocation");
  assert.equal(alloc.status, 200);
});

test("kill switch blocks new spend but allows pausing; spend guard trips it", async () => {
  const { repo, call, deps, meta } = setup();
  await repo.setSetting("guardrails", { ...DEFAULT_GUARDRAILS, killSwitch: true }, "test");
  const p = await call("POST", "/v1/products", { title: "Thing", supplier: { cogs: 5, shipping_cost: 4 } });
  const r = await call("POST", "/v1/actions", { type: "ads.create_test", payload: { product_id: p.body.id, channel: "meta", dailyBudget: 10, creative_ids: [] } });
  assert.equal(r.status, 422);

  // Spend guard
  await repo.setSetting("guardrails", { ...DEFAULT_GUARDRAILS, maxDailyAdSpend: 50 }, "test");
  const product = await repo.insert("products", { title: "Runaway", status: "testing", economics: { breakevenCpa: 20, targetCpa: 14 } });
  const campaign = await repo.insert("campaigns", { product_id: product.id, channel: "meta", phase: "testing", status: "active", name: "c", daily_budget: 40, external_campaign_id: "c1", external_adset_id: "s1" });
  const creative = await repo.insert("creatives", { product_id: product.id, status: "live", format: "video" });
  await repo.insert("ads", { campaign_id: campaign.id, product_id: product.id, creative_id: creative.id, channel: "meta", external_ad_id: "ad1", status: "active" });
  meta.metrics = [{ externalAdId: "ad1", date: "2026-11-25", spend: 80, impressions: 9000, clicks: 100, addToCarts: 1, checkouts: 0, purchases: 0, revenue: 0 }];
  const report = await runGuardian(deps);
  assert.equal(report.killSwitchTripped, true);
  assert.equal((await repo.get("campaigns", campaign.id as string))!.status, "paused");
  const g = await repo.getSetting<{ killSwitch: boolean }>("guardrails");
  assert.equal(g!.killSwitch, true);
});

test("settings: agents cannot change guardrails, can update model registry", async () => {
  const { call } = setup();
  assert.equal((await call("PUT", "/v1/settings/guardrails", { value: { autonomyLevel: 3 } })).status, 403);
  assert.equal((await call("PUT", "/v1/settings/model_registry", { value: { video: [] } })).status, 200);
  assert.equal((await call("PUT", "/v1/settings/guardrails", { value: { autonomyLevel: 2 } }, { admin: true })).status, 200);
});

test("scoped keys: research key cannot submit actions or approve products", async () => {
  const { deps } = setup();
  const handle = createGateway(deps, { adminKey: ADMIN, cronSecret: "cron", agentKeys: { "research-key": ["read", "research", "report"] } });
  const req = (method: string, path: string, body?: unknown) =>
    handle(new Request(`https://x/functions/v1/gateway${path}`, { method, headers: { authorization: "Bearer research-key", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  assert.equal((await req("GET", "/v1/summary")).status, 200);
  const p = await (await req("POST", "/v1/products", { title: "Lamp", supplier: { cogs: 5, shipping_cost: 3 } })).json();
  assert.equal((await req("POST", "/v1/actions", { type: "notify.human", payload: { message: "hi" } })).status, 403);
  assert.equal((await req("PATCH", `/v1/products/${p.id}`, { status: "approved" })).status, 403);
  assert.equal((await req("POST", "/v1/creatives", { product_id: p.id, format: "video" })).status, 403);
});

test("economics endpoint and calibration endpoint", async () => {
  const { call } = setup();
  const e = await call("POST", "/v1/economics", { cogs: 8, shippingCost: 5 });
  assert.equal(e.body.suggested_price, 39.99);
  assert.ok(e.body.gates.pass);
  const cal = await call("POST", "/v1/calibrate");
  assert.equal(cal.body.applied, false);
});
