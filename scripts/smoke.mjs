#!/usr/bin/env node
/**
 * Read-only smoke test for a deployed (or local) gateway. Changes nothing.
 *
 *   GATEWAY_URL=https://<ref>.supabase.co/functions/v1/gateway GATEWAY_ADMIN_KEY=... npm run smoke
 *   optional: GATEWAY_RESEARCH_KEY=... (checks that research keys cannot request actions)
 */
const url = (process.env.GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const admin = process.env.GATEWAY_ADMIN_KEY ?? (url.includes("localhost") ? "dev-admin-key" : "");
const researchKey = process.env.GATEWAY_RESEARCH_KEY;
if (!admin) {
  console.error("set GATEWAY_ADMIN_KEY");
  process.exit(2);
}

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, detail: detail ?? "" });
  } catch (e) {
    results.push({ ok: false, name, detail: e instanceof Error ? e.message : String(e) });
  }
}
async function req(method, path, { key, body, headers } = {}) {
  const res = await fetch(url + path, {
    method,
    headers: { "content-type": "application/json", ...(key ? { authorization: "Bearer " + key } : {}), ...(headers ?? {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

await check("health", async () => {
  const r = await req("GET", "/v1/health");
  expect(r.status === 200 && r.json?.ok, "HTTP " + r.status);
  return r.json.dry_run ? "DRY_RUN is ON (no real Shopify/ad calls)" : "LIVE mode";
});
await check("auth required", async () => {
  const r = await req("GET", "/v1/summary");
  expect(r.status === 401, "expected 401, got " + r.status);
});
await check("summary (admin)", async () => {
  const r = await req("GET", "/v1/summary", { key: admin });
  expect(r.status === 200, "HTTP " + r.status + " " + r.text.slice(0, 200));
  const g = r.json.guardrails;
  return "autonomy L" + g.autonomyLevel + ", cap $" + g.maxDailyAdSpend + "/day, kill switch " + (g.killSwitch ? "ON" : "off") + ", " + r.json.pending_approvals + " pending";
});
await check("economics", async () => {
  const r = await req("POST", "/v1/economics", { key: admin, body: { cogs: 8.5, shippingCost: 4.5 } });
  expect(r.status === 200 && r.json.economics.contribution > 0, "HTTP " + r.status);
  return "suggested price $" + r.json.suggested_price + ", breakeven CPA $" + r.json.economics.breakevenCpa;
});
await check("P&L", async () => {
  const r = await req("GET", "/v1/pnl?days=7", { key: admin });
  expect(r.status === 200, "HTTP " + r.status);
  return r.json.contribution_source + " source, 7d net $" + r.json.totals.net;
});
await check("console page", async () => {
  const r = await req("GET", "/console");
  expect(r.status === 200 && r.text.includes("Dropship Console"), "HTTP " + r.status);
});
await check("telegram webhook rejects unsigned calls", async () => {
  const r = await req("POST", "/telegram/webhook", { body: { message: { chat: { id: 1 }, text: "/status" } } });
  expect(r.status === 401, "expected 401, got " + r.status + " (set TELEGRAM_WEBHOOK_SECRET)");
});
await check("shopify webhook rejects bad signatures", async () => {
  const r = await req("POST", "/shopify/webhook", { body: {}, headers: { "x-shopify-hmac-sha256": "bad", "x-shopify-topic": "orders/create" } });
  expect(r.status === 401, "expected 401, got " + r.status + " (set SHOPIFY_WEBHOOK_SECRET)");
});
if (researchKey) {
  await check("research key cannot request actions", async () => {
    const r = await req("POST", "/v1/actions", { key: researchKey, body: { type: "notify.human", payload: { message: "smoke" } } });
    expect(r.status === 403, "expected 403, got " + r.status);
  });
}

for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.detail ? "  — " + r.detail : ""));
const failed = results.filter((r) => !r.ok).length;
console.log("\n" + (failed ? failed + " check(s) failed" : "all checks passed") + " against " + url);
process.exit(failed ? 1 : 0);
