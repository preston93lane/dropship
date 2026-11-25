/** Tests for Telegram approvals/commands, Shopify order webhooks + P&L, the compliance judge, and creative insights. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryRepo } from "../repo/memory.ts";
import { ConsoleNotifier, DryRunAds, DryRunStore, DryRunSupplier } from "../adapters/index.ts";
import type { Integrations, TelegramApi } from "../adapters/types.ts";
import type { ComplianceJudge } from "./compliance.ts";
import { createGateway } from "./gateway.ts";

const AGENT = "agent-key";
const ADMIN = "admin-key";
const TG_SECRET = "tg-secret";
const SHOP_SECRET = "shop-secret";

class FakeTelegram implements TelegramApi {
  readonly chatId = "4242";
  readonly sent: { text: string; buttons?: { text: string; data: string }[] }[] = [];
  readonly answers: string[] = [];
  readonly edits: string[] = [];
  async sendMessage(text: string, buttons?: { text: string; data: string }[]) {
    this.sent.push(buttons ? { text, buttons } : { text });
  }
  async answerCallback(_id: string, text: string) {
    this.answers.push(text);
  }
  async editMessage(_c: string | number, _m: number, text: string) {
    this.edits.push(text);
  }
}

function setup(judge?: ComplianceJudge) {
  const now = () => new Date("2026-11-25T15:00:00Z");
  const repo = new MemoryRepo(now);
  const telegram = new FakeTelegram();
  const notifier = new ConsoleNotifier();
  const meta = new DryRunAds("meta");
  const integrations: Integrations = { dryRun: true, ads: { meta }, store: new DryRunStore(), supplier: new DryRunSupplier(), notifier, telegram, publications: {} };
  const deps = { repo, integrations, now, ...(judge ? { complianceJudge: judge } : {}) };
  const handle = createGateway(deps, { agentKey: AGENT, adminKey: ADMIN, cronSecret: "c", telegramSecret: TG_SECRET, shopifyWebhookSecret: SHOP_SECRET });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { authorization: `Bearer ${AGENT}` }) => {
    const res = await handle(new Request(`https://x/functions/v1/gateway${path}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }));
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { repo, telegram, notifier, meta, call };
}

async function activeCampaign(repo: MemoryRepo) {
  const product = await repo.insert("products", { title: "Desk Strip", status: "testing", economics: { breakevenCpa: 20, targetCpa: 14, contribution: 20 }, shopify_product_id: "gid://shopify/Product/777", supplier: { cogs: 6, shipping_cost: 4 } });
  const campaign = await repo.insert("campaigns", { product_id: product.id, channel: "meta", phase: "testing", status: "active", name: "c", daily_budget: 20, external_campaign_id: "c1", external_adset_id: "s1" });
  return { product, campaign };
}

test("telegram: approval requests carry buttons; a tap approves and executes", async () => {
  const { repo, notifier, call, telegram } = setup();
  const { campaign } = await activeCampaign(repo);
  const r = await call("POST", "/v1/actions", { type: "ads.set_budget", payload: { campaign_id: campaign.id, dailyBudget: 24 }, rationale: "winner" });
  assert.equal(r.body.status, "pending_approval");
  assert.match(notifier.sent.at(-1)!, /change daily budget \$20\.00 -> \$24\.00/);
  const buttons = notifier.buttons.at(-1)!;
  assert.deepEqual(buttons.map((b) => b.data), [`a:${r.body.id}`, `r:${r.body.id}`]);

  const tg = { "x-telegram-bot-api-secret-token": TG_SECRET };
  assert.equal((await call("POST", "/telegram/webhook", { callback_query: { id: "q1", from: { id: 1 }, data: `a:${r.body.id}`, message: { message_id: 5, chat: { id: 4242 }, text: "Approval needed" } } }, {})).status, 401);
  // a stranger's tap is refused
  await call("POST", "/telegram/webhook", { callback_query: { id: "q0", from: { id: 9 }, data: `a:${r.body.id}`, message: { message_id: 5, chat: { id: 9999 } } } }, tg);
  assert.equal(telegram.answers.at(-1), "Not authorized");
  assert.equal((await repo.get("actions", r.body.id))!.status, "pending_approval");
  // the owner's tap approves and executes
  await call("POST", "/telegram/webhook", { callback_query: { id: "q1", from: { id: 1 }, data: `a:${r.body.id}`, message: { message_id: 5, chat: { id: 4242 }, text: "Approval needed" } } }, tg);
  assert.equal(telegram.answers.at(-1), "✅ Approved and done");
  assert.equal((await repo.get("actions", r.body.id))!.status, "succeeded");
  assert.equal(Number((await repo.get("campaigns", campaign.id as string))!.daily_budget), 24);
  // a second tap is harmless
  await call("POST", "/telegram/webhook", { callback_query: { id: "q2", from: { id: 1 }, data: `a:${r.body.id}`, message: { message_id: 5, chat: { id: 4242 } } } }, tg);
  assert.equal(telegram.answers.at(-1), "Already decided");
});

test("telegram: /status, /pending and /kill", async () => {
  const { repo, call, telegram } = setup();
  const { campaign } = await activeCampaign(repo);
  const tg = { "x-telegram-bot-api-secret-token": TG_SECRET };
  await call("POST", "/telegram/webhook", { message: { message_id: 1, chat: { id: 4242 }, text: "/status" } }, tg);
  assert.match(telegram.sent.at(-1)!.text, /Autonomy L1/);
  await call("POST", "/telegram/webhook", { message: { message_id: 2, chat: { id: 4242 }, text: "/kill" } }, tg);
  assert.match(telegram.sent.at(-1)!.text, /Kill switch ON\. Paused 1/);
  assert.equal((await repo.get("campaigns", campaign.id as string))!.status, "paused");
  assert.equal((await repo.getSetting<{ killSwitch: boolean }>("guardrails"))!.killSwitch, true);
  // strangers are ignored entirely
  const before = telegram.sent.length;
  await call("POST", "/telegram/webhook", { message: { message_id: 3, chat: { id: 1 }, text: "/kill" } }, tg);
  assert.equal(telegram.sent.length, before);
});

async function shopifySign(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...sig));
}

test("shopify webhook: HMAC verified, orders mapped to products, refunds tracked, P&L uses store data", async () => {
  const { repo, call, meta } = setup();
  const { product, campaign } = await activeCampaign(repo);
  const creative = await repo.insert("creatives", { product_id: product.id, status: "live", format: "video", hook_type: "pov" });
  const ad = await repo.insert("ads", { campaign_id: campaign.id, product_id: product.id, creative_id: creative.id, channel: "meta", external_ad_id: "a1", status: "active" });
  await repo.upsert("ad_metrics_daily", [{ ad_id: ad.id, date: "2026-11-25", spend: 30, impressions: 3000, clicks: 60, add_to_carts: 6, purchases: 2, revenue: 80 }], "ad_id,date");
  void meta;

  const order = { id: 5001, created_at: "2026-11-25T12:00:00Z", line_items: [{ product_id: 777, quantity: 2, price: "29.99", total_discount: "5.00" }, { product_id: 999, quantity: 1, price: "10.00", total_discount: "0" }], refunds: [] };
  const raw = JSON.stringify(order);
  assert.equal((await call("POST", "/shopify/webhook", raw, { "x-shopify-topic": "orders/create", "x-shopify-hmac-sha256": "bad" })).status, 401);
  const ok = await call("POST", "/shopify/webhook", raw, { "x-shopify-topic": "orders/create", "x-shopify-hmac-sha256": await shopifySign(raw, SHOP_SECRET) });
  assert.equal(ok.body.rows, 2);
  const rows = await repo.list("orders");
  const mine = rows.find((r) => r.product_id === product.id)!;
  assert.equal(mine.revenue, 54.98);
  assert.equal(mine.cogs, 12);
  assert.equal(mine.shipping_cost, 8);

  // refund arrives as orders/updated: recomputed, not double counted
  const updated = JSON.stringify({ ...order, refunds: [{ refund_line_items: [{ subtotal: "29.99", line_item: { product_id: 777 } }] }] });
  await call("POST", "/shopify/webhook", updated, { "x-shopify-topic": "orders/updated", "x-shopify-hmac-sha256": await shopifySign(updated, SHOP_SECRET) });
  await call("POST", "/shopify/webhook", updated, { "x-shopify-topic": "orders/updated", "x-shopify-hmac-sha256": await shopifySign(updated, SHOP_SECRET) });
  assert.equal((await repo.list("orders")).find((r) => r.product_id === product.id)!.refunded, 29.99);

  await repo.insert("costs", { date: "2026-11-25", category: "media", vendor: "fal", amount: 3.5 });
  const pnl = await call("GET", "/v1/pnl?days=7");
  assert.equal(pnl.body.contribution_source, "store");
  assert.equal(pnl.body.totals.store_orders, 1);
  assert.equal(pnl.body.totals.ad_spend, 30);
  assert.equal(pnl.body.totals.machine_cost, 3.5);
  // revenue 64.98 - refunds 29.99 - (cogs+ship 20) - fees - ad 30
  assert.ok(pnl.body.totals.net < 0, `net ${pnl.body.totals.net}`);
  assert.equal(pnl.body.attribution_ratio, 1.23);

  const insights = await call("GET", "/v1/insights/creatives");
  assert.equal(insights.body.measured_creatives, 1);
  assert.equal((insights.body.dimensions.hook_type as { value: string }[])[0]!.value, "pov");
});

test("compliance judge: both must pass; judge failure keeps the creative in review", async () => {
  let mode: "pass" | "revise" | "down" = "revise";
  const seen: string[][] = [];
  const judge: ComplianceJudge = {
    async review(input) {
      seen.push(input.frames);
      if (mode === "down") throw new Error("overloaded");
      return mode === "pass"
        ? { verdict: "pass", issues: [], ai_disclosure_required: true, model: "test" }
        : { verdict: "revise", issues: [{ severity: "high", section: "claims", problem: "'never tangles' unsupported", fix: "say 'holds up to 6 cables'" }], ai_disclosure_required: false, model: "test" };
    },
  };
  const { repo, call } = setup(judge);
  const product = await repo.insert("products", { title: "Strip", status: "creative_production" });
  const mk = async () => (await repo.insert("creatives", { product_id: product.id, status: "in_review", format: "video", thumbnail_url: "https://cdn/x.jpg", primary_text: "Never tangles again" })).id as string;

  const c1 = await mk();
  const r1 = await call("POST", `/v1/creatives/${c1}/compliance`, { verdict: "pass", frames: ["https://cdn/f1.jpg", "http://insecure/f.jpg"] });
  assert.equal(r1.body.status, "rejected");
  assert.equal(r1.body.compliance.agent_verdict, "pass");
  assert.equal(r1.body.compliance.verdict, "revise");
  assert.deepEqual(seen[0], ["https://cdn/x.jpg", "https://cdn/f1.jpg"]);

  mode = "down";
  const c2 = await mk();
  assert.equal((await call("POST", `/v1/creatives/${c2}/compliance`, { verdict: "pass" })).status, 503);
  assert.equal((await repo.get("creatives", c2))!.status, "in_review");

  mode = "pass";
  const r3 = await call("POST", `/v1/creatives/${c2}/compliance`, { verdict: "pass" });
  assert.equal(r3.body.status, "approved");
  assert.equal(r3.body.compliance.judge.ai_disclosure_required, true);
});

test("console shows the 7-day P&L card", async () => {
  const now = () => new Date("2026-11-25T15:00:00Z");
  const integrations: Integrations = { dryRun: true, ads: {}, store: new DryRunStore(), supplier: new DryRunSupplier(), notifier: new ConsoleNotifier(), publications: {} };
  const handle = createGateway({ repo: new MemoryRepo(now), integrations, now }, { adminKey: ADMIN, cronSecret: "c" });
  const html = await (await handle(new Request("https://x/functions/v1/gateway/console", { headers: { cookie: `dsadmin=${ADMIN}` } }))).text();
  assert.match(html, /Last 7 days/);
  assert.match(html, /Contribution after ads/);
});
