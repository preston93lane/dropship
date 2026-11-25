/**
 * Gateway: the only door between agents and the real world.
 *
 *   Agents  --Bearer GATEWAY_AGENT_KEY-->  /v1/*      (read state, write state, request actions)
 *   Human   --cookie / Bearer ADMIN-->     /console*  (approve, kill switch, autonomy, proposals)
 *   pg_cron --x-cron-secret-->             /v1/guardian/run
 *
 * Framework-free (Web Request/Response) so it runs in Deno Edge Functions and Node tests.
 */
import { checkMarginGates, suggestPrice, unitEconomics } from "../core/economics.ts";
import { calibrateWeights, scoreProduct, SCORE_COMPONENTS, type LaunchOutcome, type ScoreComponent } from "../core/scoring.ts";
import { evaluateAd } from "../core/rules.ts";
import { allocateBudget } from "../core/allocation.ts";
import { assertCreativeTransition, assertProductTransition, PRODUCT_OWNER, type CreativeStatus, type ProductStatus } from "../core/lifecycle.ts";
import type { Ad, Campaign, Creative, MetricsRow, Product, Repo, Row } from "../repo/types.ts";
import { decideAction, HttpError, submitAction, type Deps } from "./actions.ts";
import { runGuardian } from "./guardian.ts";
import {
  AGENT_WRITABLE_SETTINGS,
  loadEconomicsDefaults,
  loadGuardrails,
  loadMarginGates,
  loadRules,
  loadWeights,
} from "./settings.ts";
import { renderConsole, renderLogin } from "./console.ts";

export const SCOPES = ["read", "research", "creative", "actions", "report", "improve"] as const;
export type Scope = (typeof SCOPES)[number];

export interface GatewayConfig {
  /** Full-access agent key (local dev / single-key setups). */
  agentKey?: string;
  /**
   * Scoped agent keys: { "<key>": ["read","research","report"], ... }.
   * Give sessions that read untrusted web content (research) a key WITHOUT "actions".
   */
  agentKeys?: Record<string, Scope[]>;
  adminKey: string;
  cronSecret: string;
  /** Minimum approved creatives before a product can move to ready_to_test. */
  minCreativesToTest?: number;
}

type Handler = (ctx: Ctx) => Promise<Response>;
interface Ctx {
  req: Request;
  url: URL;
  params: string[];
  actor: string;
  scopes: ReadonlySet<Scope>;
  body: () => Promise<Row>;
}

/** Which scope a route needs. GETs only need "read". */
export function requiredScope(method: string, path: string): Scope {
  if (method === "GET") return "read";
  if (path.startsWith("/v1/actions")) return "actions";
  if (/^\/v1\/(products|economics)/.test(path)) return "research";
  if (/^\/v1\/(briefs|creatives|assets)/.test(path)) return "creative";
  if (/^\/v1\/(runs|costs|reports|experiments)/.test(path)) return "report";
  if (/^\/v1\/(proposals|calibrate|settings)/.test(path)) return "improve";
  return "actions";
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function cookie(req: Request, name: string): string {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

const PRODUCT_FIELDS = ["title", "niche", "source", "source_urls", "signals", "components", "risk_flags", "supplier", "price", "compare_at_price", "angles", "notes", "test_budget"];
const CREATIVE_FIELDS = ["format", "style", "aspect", "concept_family", "angle", "hook_type", "hook_text", "script", "primary_text", "headline", "cta", "asset_url", "thumbnail_url", "variants", "duration_s", "models_used", "production_cost", "ai_generated", "brief_id", "parent_id"];
const pick = (src: Row, keys: string[]) => Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));

async function computeEconomics(repo: Repo, product: Pick<Product, "price" | "supplier">) {
  const s = product.supplier ?? {};
  if (s.cogs === undefined || s.cogs === null) return null;
  const d = await loadEconomicsDefaults(repo);
  const landed = Number(s.cogs) + Number(s.shipping_cost ?? 0);
  const price = product.price ? Number(product.price) : suggestPrice(landed);
  return unitEconomics(
    { price, cogs: Number(s.cogs), shippingCost: Number(s.shipping_cost ?? 0), paymentFeePct: d.paymentFeePct, paymentFeeFixed: d.paymentFeeFixed, platformFeePct: d.platformFeePct, refundRatePct: d.refundRatePct, otherPerOrder: d.otherPerOrder },
    { targetProfitShare: d.targetProfitShare },
  );
}

export function createGateway(deps: Deps, cfg: GatewayConfig) {
  const { repo } = deps;
  const minCreatives = cfg.minCreativesToTest ?? 3;

  async function guardProductTransition(product: Product, to: ProductStatus, actor: string, isAdmin: boolean) {
    assertProductTransition(product.status as ProductStatus, to);
    const verdict = (product as Row).verdict as string | undefined;
    if (to === "validated" && !(verdict === "validate" || verdict === "priority")) {
      throw new HttpError(409, `cannot validate: score verdict is "${verdict ?? "unscored"}" (POST /v1/products/:id/score first)`);
    }
    if (to === "approved") {
      const g = await loadGuardrails(repo);
      if (g.autonomyLevel === 0 && !isAdmin) throw new HttpError(403, "autonomy L0: a human approves products in the console");
      const be = (product.economics as { breakevenCpa?: number } | null)?.breakevenCpa ?? 0;
      if (!(be > 0)) throw new HttpError(409, "cannot approve without positive unit economics");
    }
    if (to === "ready_to_test") {
      if (!product.shopify_product_id) throw new HttpError(409, "listing not created on Shopify yet");
      const approved = await repo.list<Creative>("creatives", { eq: { product_id: product.id, status: "approved" } });
      if (approved.length < minCreatives) throw new HttpError(409, `need >= ${minCreatives} approved creatives, have ${approved.length}`);
    }
    if (to === "testing" && !isAdmin) throw new HttpError(409, "products enter testing automatically when a campaign is activated (ads.activate)");
    void actor;
  }

  async function adLifetime(productId?: string) {
    const ads = await repo.list<Ad>("ads", productId ? { eq: { product_id: productId } } : { limit: 5000 });
    const campaigns = new Map((await repo.list<Campaign>("campaigns", productId ? { eq: { product_id: productId } } : { limit: 2000 })).map((c) => [c.id, c]));
    const metrics = await repo.list<MetricsRow>("ad_metrics_daily", { limit: 20000 });
    const rules = await loadRules(repo);
    const products = new Map<string, Product>();
    const out = [];
    for (const ad of ads) {
      const rows = metrics.filter((m) => m.ad_id === ad.id);
      const sum = (k: keyof MetricsRow) => Math.round(rows.reduce((s, r) => s + Number(r[k] ?? 0), 0) * 100) / 100;
      const stats = { spend: sum("spend"), impressions: sum("impressions"), clicks: sum("clicks"), addToCarts: sum("add_to_carts"), purchases: sum("purchases"), revenue: sum("revenue") };
      if (!products.has(ad.product_id)) {
        const p = await repo.get<Product>("products", ad.product_id);
        if (p) products.set(p.id, p);
      }
      const econ = products.get(ad.product_id)?.economics as { breakevenCpa?: number; targetCpa?: number } | null;
      const c = campaigns.get(ad.campaign_id);
      const decision = econ?.breakevenCpa
        ? evaluateAd({ ...stats, phase: c?.phase ?? "testing" }, { breakevenCpa: econ.breakevenCpa, targetCpa: econ.targetCpa ?? econ.breakevenCpa * 0.7 }, rules)
        : null;
      out.push({ ad_id: ad.id, creative_id: ad.creative_id, campaign_id: ad.campaign_id, channel: ad.channel, status: ad.status, phase: c?.phase, daily_budget: c?.daily_budget, ...stats, rule: decision });
    }
    return out;
  }

  const routes: [string, RegExp, Handler][] = [
    ["GET", /^\/v1\/summary$/, async () => {
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
      return json({
        guardrails,
        dry_run: deps.integrations.dryRun,
        products_by_status: counts,
        next_owner_by_status: PRODUCT_OWNER,
        active_campaigns: active.length,
        committed_daily_budget: active.reduce((s, c) => s + Number(c.daily_budget), 0),
        spend_today: Math.round(metrics.reduce((s, m) => s + Number(m.spend), 0) * 100) / 100,
        revenue_today: Math.round(metrics.reduce((s, m) => s + Number(m.revenue), 0) * 100) / 100,
        pending_approvals: pending.length,
        open_briefs: openBriefs.length,
        creatives_in_review: inReview.length,
      });
    }],

    ["POST", /^\/v1\/economics$/, async ({ body }) => {
      const b = await body();
      const d = await loadEconomicsDefaults(repo);
      const landed = Number(b.cogs ?? 0) + Number(b.shippingCost ?? b.shipping_cost ?? 0);
      const price = b.price ? Number(b.price) : suggestPrice(landed);
      const ue = unitEconomics(
        { price, cogs: Number(b.cogs ?? 0), shippingCost: Number(b.shippingCost ?? b.shipping_cost ?? 0), paymentFeePct: Number(b.paymentFeePct ?? d.paymentFeePct), paymentFeeFixed: d.paymentFeeFixed, platformFeePct: Number(b.platformFeePct ?? d.platformFeePct), refundRatePct: Number(b.refundRatePct ?? d.refundRatePct), otherPerOrder: d.otherPerOrder },
        { targetProfitShare: d.targetProfitShare },
      );
      return json({ economics: ue, suggested_price: suggestPrice(landed), gates: checkMarginGates(ue, await loadMarginGates(repo)), test_budget: Math.round(ue.breakevenCpa * d.testBudgetMultiple) });
    }],

    ["GET", /^\/v1\/products$/, async ({ url }) => {
      const status = url.searchParams.get("status");
      const filter = status ? { in: { status: status.split(",") } } : {};
      const rows = await repo.list<Product>("products", { ...filter, order: { column: "updated_at", ascending: false }, limit: Number(url.searchParams.get("limit") ?? 100) });
      return json(rows);
    }],
    ["POST", /^\/v1\/products$/, async ({ body, actor }) => {
      const b = await body();
      if (typeof b.title !== "string" || !b.title) throw new HttpError(400, "title is required");
      const dedupe = String(b.dedupe_key ?? b.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const existing = await repo.list<Product>("products", { eq: { dedupe_key: dedupe }, limit: 1 });
      if (existing[0]) return json({ duplicate: true, product: existing[0] }, 409);
      const row: Row = { ...pick(b, PRODUCT_FIELDS), title: b.title, dedupe_key: dedupe, status: "candidate", created_by: actor };
      const economics = await computeEconomics(repo, row as Pick<Product, "price" | "supplier">);
      if (economics) row.economics = economics;
      return json(await repo.insert("products", row), 201);
    }],
    ["GET", /^\/v1\/products\/([\w-]+)$/, async ({ params }) => {
      const product = await repo.get<Product>("products", params[0]!);
      if (!product) throw new HttpError(404, "product not found");
      return json({
        product,
        next_owner: PRODUCT_OWNER[product.status as ProductStatus],
        creatives: await repo.list("creatives", { eq: { product_id: product.id } }),
        briefs: await repo.list("creative_briefs", { eq: { product_id: product.id } }),
        campaigns: await repo.list("campaigns", { eq: { product_id: product.id } }),
        ads: await adLifetime(product.id),
        events: await repo.list("product_events", { eq: { product_id: product.id }, order: { column: "created_at", ascending: false }, limit: 50 }),
      });
    }],
    ["PATCH", /^\/v1\/products\/([\w-]+)$/, async ({ params, body, actor, req, scopes }) => {
      const product = await repo.get<Product>("products", params[0]!);
      if (!product) throw new HttpError(404, "product not found");
      const b = await body();
      if (b.status === "approved" && !scopes.has("actions")) throw new HttpError(403, "approving a product for launch needs the ops key (scope: actions)");
      const patch: Row = pick(b, PRODUCT_FIELDS);
      if (patch.supplier || patch.price !== undefined) {
        const merged = { price: (patch.price as number | undefined) ?? product.price, supplier: { ...(product.supplier ?? {}), ...((patch.supplier as Row) ?? {}) } } as Pick<Product, "price" | "supplier">;
        patch.supplier = merged.supplier;
        const economics = await computeEconomics(repo, merged);
        if (economics) {
          patch.economics = economics;
          if (merged.price === null || merged.price === undefined) patch.price = economics.price;
        }
      }
      if (typeof b.status === "string" && b.status !== product.status) {
        await guardProductTransition({ ...product, ...patch } as Product, b.status as ProductStatus, actor, isAdmin(req));
        patch.status = b.status;
        await repo.insert("product_events", { product_id: product.id, from_status: product.status, to_status: b.status, reason: String(b.reason ?? ""), actor });
        if (["killed", "retired"].includes(b.status) && !product.outcome) patch.outcome = b.status === "killed" ? "loser" : "winner";
      }
      return json(await repo.update("products", product.id, patch));
    }],
    ["POST", /^\/v1\/products\/([\w-]+)\/score$/, async ({ params }) => {
      const product = await repo.get<Product>("products", params[0]!);
      if (!product) throw new HttpError(404, "product not found");
      const economics = (await computeEconomics(repo, product)) ?? undefined;
      const flags = { ...(product.risk_flags ?? {}) } as Row;
      if (product.supplier?.shipping_days !== undefined) flags.shippingDays = Number(product.supplier.shipping_days);
      if (product.supplier?.warehouse_country) flags.usWarehouse = String(product.supplier.warehouse_country).toUpperCase() === "US";
      const result = scoreProduct(
        { components: (product.components ?? {}) as Partial<Record<ScoreComponent, number>>, ...(economics ? { economics } : {}), flags },
        await loadWeights(repo),
        await loadMarginGates(repo),
      );
      await repo.update("products", product.id, { score: result.score, score_breakdown: result, verdict: result.verdict, ...(economics ? { economics, price: economics.price } : {}) });
      return json({ ...result, economics });
    }],

    ["GET", /^\/v1\/briefs$/, async ({ url }) => {
      const status = url.searchParams.get("status");
      const productId = url.searchParams.get("product_id");
      return json(await repo.list("creative_briefs", { eq: { ...(status ? { status } : {}), ...(productId ? { product_id: productId } : {}) }, order: { column: "created_at", ascending: true } }));
    }],
    ["POST", /^\/v1\/briefs$/, async ({ body, actor }) => {
      const b = await body();
      if (!b.product_id) throw new HttpError(400, "product_id is required");
      return json(await repo.insert("creative_briefs", { ...pick(b, ["product_id", "reason", "angles", "formats", "count", "parent_creative_id", "notes"]), status: "open", requested_by: actor }), 201);
    }],
    ["PATCH", /^\/v1\/briefs\/([\w-]+)$/, async ({ params, body }) => {
      const b = await body();
      return json(await repo.update("creative_briefs", params[0]!, pick(b, ["status", "notes", "angles", "formats", "count"])));
    }],

    ["GET", /^\/v1\/creatives$/, async ({ url }) => {
      const eq: Row = {};
      for (const k of ["product_id", "status", "brief_id"]) {
        const v = url.searchParams.get(k);
        if (v) eq[k] = v;
      }
      return json(await repo.list("creatives", { eq, order: { column: "created_at", ascending: false }, limit: 200 }));
    }],
    ["POST", /^\/v1\/creatives$/, async ({ body, actor }) => {
      const b = await body();
      if (!b.product_id || !b.format) throw new HttpError(400, "product_id and format are required");
      const status = b.status === "in_review" ? "in_review" : "in_production";
      return json(await repo.insert("creatives", { ...pick(b, CREATIVE_FIELDS), product_id: b.product_id, status, created_by: actor }), 201);
    }],
    ["PATCH", /^\/v1\/creatives\/([\w-]+)$/, async ({ params, body }) => {
      const c = await repo.get<Creative>("creatives", params[0]!);
      if (!c) throw new HttpError(404, "creative not found");
      const b = await body();
      const patch = pick(b, CREATIVE_FIELDS);
      if (typeof b.status === "string" && b.status !== c.status) {
        assertCreativeTransition(c.status as CreativeStatus, b.status as CreativeStatus);
        if (b.status === "approved") throw new HttpError(409, "creatives are approved via POST /v1/creatives/:id/compliance");
        patch.status = b.status;
      }
      return json(await repo.update("creatives", c.id, patch));
    }],
    ["POST", /^\/v1\/creatives\/([\w-]+)\/compliance$/, async ({ params, body, actor }) => {
      const c = await repo.get<Creative>("creatives", params[0]!);
      if (!c) throw new HttpError(404, "creative not found");
      if (c.status !== "in_review") throw new HttpError(409, `creative is ${c.status}; submit it for review first (status in_review)`);
      const b = await body();
      const verdict = String(b.verdict);
      if (!["pass", "fail", "revise"].includes(verdict)) throw new HttpError(400, "verdict must be pass | fail | revise");
      const compliance = { verdict, issues: b.issues ?? [], notes: b.notes ?? null, checklist: b.checklist ?? null, reviewer: actor, reviewed_at: deps.now().toISOString() };
      const status = verdict === "pass" ? "approved" : "rejected";
      return json(await repo.update("creatives", c.id, { compliance, status }));
    }],

    ["POST", /^\/v1\/assets\/sign$/, async ({ body }) => {
      const b = await body();
      const path = String(b.path ?? "");
      if (!/^[\w\-./]+$/.test(path) || path.includes("..")) throw new HttpError(400, "path must be a simple relative path like products/<id>/<file>.mp4");
      return json(await repo.signUpload(path));
    }],

    ["POST", /^\/v1\/actions$/, async ({ body, actor }) => {
      const b = await body();
      const row = await submitAction(deps, {
        type: String(b.type ?? ""),
        payload: (b.payload ?? {}) as Row,
        requested_by: actor,
        ...(b.rationale ? { rationale: String(b.rationale) } : {}),
        ...(b.idempotency_key ? { idempotency_key: String(b.idempotency_key) } : {}),
      });
      return json(row, row.status === "rejected" || row.status === "failed" ? 422 : row.status === "pending_approval" ? 202 : 200);
    }],
    ["GET", /^\/v1\/actions$/, async ({ url }) => {
      const status = url.searchParams.get("status");
      return json(await repo.list("actions", { ...(status ? { eq: { status } } : {}), order: { column: "created_at", ascending: false }, limit: Number(url.searchParams.get("limit") ?? 50) }));
    }],
    ["GET", /^\/v1\/actions\/([\w-]+)$/, async ({ params }) => {
      const a = await repo.get("actions", params[0]!);
      if (!a) throw new HttpError(404, "action not found");
      return json(a);
    }],

    ["GET", /^\/v1\/performance$/, async ({ url }) => json(await adLifetime(url.searchParams.get("product_id") ?? undefined))],
    ["GET", /^\/v1\/allocation$/, async () => {
      const g = await loadGuardrails(repo);
      const live = await adLifetime();
      const byCampaign = new Map<string, { spend: number; clicks: number; purchases: number; product_id?: string }>();
      for (const a of live) {
        if (a.status !== "active") continue;
        const cur = byCampaign.get(a.campaign_id) ?? { spend: 0, clicks: 0, purchases: 0 };
        byCampaign.set(a.campaign_id, { spend: cur.spend + a.spend, clicks: cur.clicks + a.clicks, purchases: cur.purchases + a.purchases });
      }
      const arms = [];
      for (const [id, s] of byCampaign) {
        const c = await repo.get<Campaign>("campaigns", id);
        const p = c ? await repo.get<Product>("products", c.product_id) : null;
        const contribution = Number((p?.economics as { contribution?: number } | null)?.contribution ?? 0);
        if (contribution > 0) arms.push({ id, ...s, contribution, maxDaily: g.maxDailyBudgetPerAdSet, minDaily: 5 });
      }
      return json({ total_daily_cap: g.maxDailyAdSpend, allocations: allocateBudget(arms, g.maxDailyAdSpend), note: "Suggestion only. Apply changes with ads.set_budget actions (max step applies)." });
    }],
    ["GET", /^\/v1\/decisions$/, async ({ url }) => {
      const since = url.searchParams.get("since");
      return json(await repo.list("decisions", { ...(since ? { gte: { created_at: since } } : {}), order: { column: "created_at", ascending: false }, limit: 200 }));
    }],

    ["POST", /^\/v1\/runs$/, async ({ body, actor }) => {
      const b = await body();
      return json(await repo.insert("agent_runs", { loop: String(b.loop ?? "unknown"), agent: actor, session_id: b.session_id ?? null, status: "running" }), 201);
    }],
    ["PATCH", /^\/v1\/runs\/([\w-]+)$/, async ({ params, body }) => {
      const b = await body();
      return json(await repo.update("agent_runs", params[0]!, { ...pick(b, ["status", "summary", "llm_cost", "media_cost"]), finished_at: deps.now().toISOString() }));
    }],
    ["POST", /^\/v1\/costs$/, async ({ body }) => {
      const b = await body();
      const amount = Number(b.amount);
      if (!(amount >= 0)) throw new HttpError(400, "amount must be >= 0");
      return json(await repo.insert("costs", { category: String(b.category ?? "media"), vendor: String(b.vendor ?? "unknown"), amount, ref: b.ref ?? null }), 201);
    }],
    ["POST", /^\/v1\/reports$/, async ({ body, actor }) => {
      const b = await body();
      if (!b.title || !b.body_md) throw new HttpError(400, "title and body_md are required");
      const row = await repo.insert("reports", { ...pick(b, ["kind", "period_start", "period_end", "title", "body_md", "metrics"]), created_by: actor });
      if (b.notify !== false) await deps.integrations.notifier.send(`${String(b.title)}\n\n${String(b.summary ?? String(b.body_md).slice(0, 900))}`, deps.consoleUrl ? { link: deps.consoleUrl } : {});
      return json(row, 201);
    }],
    ["GET", /^\/v1\/reports$/, async ({ url }) => {
      const kind = url.searchParams.get("kind");
      return json(await repo.list("reports", { ...(kind ? { eq: { kind } } : {}), order: { column: "created_at", ascending: false }, limit: Number(url.searchParams.get("limit") ?? 10) }));
    }],
    ["GET", /^\/v1\/experiments$/, async ({ url }) => {
      const status = url.searchParams.get("status");
      return json(await repo.list("experiments", { ...(status ? { eq: { status } } : {}), order: { column: "created_at", ascending: false }, limit: 100 }));
    }],
    ["POST", /^\/v1\/experiments$/, async ({ body, actor }) => {
      const b = await body();
      return json(await repo.insert("experiments", { ...pick(b, ["product_id", "hypothesis", "variable", "variants"]), status: "running", created_by: actor }), 201);
    }],
    ["PATCH", /^\/v1\/experiments\/([\w-]+)$/, async ({ params, body }) => {
      const b = await body();
      const patch = pick(b, ["status", "result", "learning"]);
      if (b.status === "concluded") patch.concluded_at = deps.now().toISOString();
      return json(await repo.update("experiments", params[0]!, patch));
    }],
    ["POST", /^\/v1\/proposals$/, async ({ body, actor }) => {
      const b = await body();
      if (!b.title || !b.rationale || !b.kind) throw new HttpError(400, "kind, title, rationale are required");
      const row = await repo.insert("proposals", { ...pick(b, ["kind", "title", "rationale", "evidence", "files", "eval"]), status: "open", created_by: actor });
      await deps.integrations.notifier.send(`New improvement proposal: ${String(b.title)}`, deps.consoleUrl ? { link: deps.consoleUrl } : {});
      return json(row, 201);
    }],
    ["GET", /^\/v1\/proposals$/, async ({ url }) => {
      const status = url.searchParams.get("status");
      return json(await repo.list("proposals", { ...(status ? { eq: { status } } : {}), order: { column: "created_at", ascending: false }, limit: 50 }));
    }],
    ["PATCH", /^\/v1\/proposals\/([\w-]+)$/, async ({ params, body, req }) => {
      if (!isAdmin(req)) throw new HttpError(403, "only humans (admin key) change proposal status");
      const b = await body();
      return json(await repo.update("proposals", params[0]!, { status: b.status, decided_by: "admin", decided_at: deps.now().toISOString() }));
    }],

    ["GET", /^\/v1\/outcomes$/, async () => {
      const done = await repo.list<Product>("products", { in: { outcome: ["winner", "loser"] }, limit: 500 });
      return json(done.map((p) => ({ id: p.id, title: p.title, outcome: p.outcome, score: p.score, components: (p.score_breakdown as { components?: Row } | null)?.components ?? null, economics: p.economics })));
    }],
    ["POST", /^\/v1\/calibrate$/, async ({ actor }) => {
      const done = await repo.list<Product>("products", { in: { outcome: ["winner", "loser"] }, limit: 500 });
      const outcomes: LaunchOutcome[] = done
        .map((p) => ({ comps: (p.score_breakdown as { components?: Record<ScoreComponent, number> } | null)?.components, won: p.outcome === "winner" }))
        .filter((o): o is { comps: Record<ScoreComponent, number>; won: boolean } => {
          const comps = o.comps;
          return !!comps && SCORE_COMPONENTS.every((c) => typeof comps[c] === "number");
        })
        .map((o) => ({ components: o.comps, won: o.won }));
      const result = calibrateWeights(await loadWeights(repo), outcomes);
      if (result.applied) await repo.setSetting("score_weights", result.weights, actor, result.rationale);
      return json(result);
    }],

    ["GET", /^\/v1\/settings\/([\w-]+)$/, async ({ params }) => json({ key: params[0], value: await repo.getSetting(params[0]!) })],
    ["PUT", /^\/v1\/settings\/([\w-]+)$/, async ({ params, body, actor, req }) => {
      const key = params[0]!;
      if (!AGENT_WRITABLE_SETTINGS.has(key) && !isAdmin(req)) throw new HttpError(403, `setting "${key}" is human-only (agents may write: ${[...AGENT_WRITABLE_SETTINGS].join(", ")})`);
      const b = await body();
      await repo.setSetting(key, b.value, actor, b.reason ? String(b.reason) : undefined);
      return json({ key, saved: true });
    }],
  ];

  function isAdmin(req: Request) {
    return safeEqual(bearer(req), cfg.adminKey) || safeEqual(cookie(req, "dsadmin"), cfg.adminKey);
  }

  async function handleConsole(req: Request, path: string): Promise<Response> {
    if (path === "/console/login" && req.method === "POST") {
      const form = await req.formData();
      const key = String(form.get("key") ?? "");
      if (!safeEqual(key, cfg.adminKey)) return new Response(renderLogin("Wrong key"), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response(null, { status: 303, headers: { location: "./", "set-cookie": `dsadmin=${encodeURIComponent(key)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000` } });
    }
    if (!isAdmin(req)) return new Response(renderLogin(), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

    const back = () => new Response(null, { status: 303, headers: { location: req.headers.get("referer") ?? "./" } });
    let m: RegExpMatchArray | null;
    if (req.method === "POST" && (m = path.match(/^\/console\/actions\/([\w-]+)\/(approve|reject)$/))) {
      await decideAction(deps, m[1]!, m[2] === "approve", "human");
      return back();
    }
    if (req.method === "POST" && (m = path.match(/^\/console\/proposals\/([\w-]+)\/(approve|reject)$/))) {
      await repo.update("proposals", m[1]!, { status: m[2] === "approve" ? "approved" : "rejected", decided_by: "human", decided_at: deps.now().toISOString() });
      return back();
    }
    if (req.method === "POST" && (m = path.match(/^\/console\/products\/([\w-]+)\/(approve|reject)$/))) {
      const p = await repo.get<Product>("products", m[1]!);
      if (p) {
        const to = m[2] === "approve" ? "approved" : "rejected";
        assertProductTransition(p.status as ProductStatus, to);
        await repo.update("products", p.id, { status: to });
        await repo.insert("product_events", { product_id: p.id, from_status: p.status, to_status: to, reason: "human decision in console", actor: "human" });
      }
      return back();
    }
    if (req.method === "POST" && path === "/console/guardrails") {
      const form = await req.formData();
      const g = await loadGuardrails(repo);
      const num = (k: string, cur: number) => (form.get(k) !== null && form.get(k) !== "" ? Number(form.get(k)) : cur);
      const next = {
        ...g,
        autonomyLevel: Math.min(3, Math.max(0, num("autonomyLevel", g.autonomyLevel))) as 0 | 1 | 2 | 3,
        killSwitch: form.get("killSwitch") === "on",
        maxDailyAdSpend: num("maxDailyAdSpend", g.maxDailyAdSpend),
        maxDailyBudgetPerAdSet: num("maxDailyBudgetPerAdSet", g.maxDailyBudgetPerAdSet),
        maxNewTestsPerDay: num("maxNewTestsPerDay", g.maxNewTestsPerDay),
        maxActiveTestingProducts: num("maxActiveTestingProducts", g.maxActiveTestingProducts),
      };
      await repo.setSetting("guardrails", next, "human", "console");
      if (next.killSwitch && !g.killSwitch) {
        for (const c of await repo.list<Campaign>("campaigns", { eq: { status: "active" } })) {
          await submitAction(deps, { type: "ads.pause", payload: { campaign_id: c.id, reason: "manual kill switch" }, requested_by: "human" });
        }
      }
      return back();
    }
    if (req.method === "POST" && path === "/console/guardian") {
      await runGuardian(deps);
      return back();
    }
    if (req.method === "GET" && (path === "/console" || path === "/console/")) {
      const [guardrails, pending, recentActions, decisions, proposals, reports, products] = await Promise.all([
        loadGuardrails(repo),
        repo.list("actions", { eq: { status: "pending_approval" }, order: { column: "created_at", ascending: false } }),
        repo.list("actions", { order: { column: "created_at", ascending: false }, limit: 25 }),
        repo.list("decisions", { order: { column: "created_at", ascending: false }, limit: 25 }),
        repo.list("proposals", { eq: { status: "open" }, order: { column: "created_at", ascending: false } }),
        repo.list("reports", { order: { column: "created_at", ascending: false }, limit: 1 }),
        repo.list<Product>("products", { order: { column: "updated_at", ascending: false }, limit: 200 }),
      ]);
      const html = renderConsole({ guardrails, dryRun: deps.integrations.dryRun, pending, recentActions, decisions, proposals, latestReport: reports[0] ?? null, products });
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    return json({ error: "not found" }, 404);
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    let path = url.pathname.replace(/^\/functions\/v1/, "");
    if (path.startsWith("/gateway")) path = path.slice("/gateway".length) || "/";
    try {
      if (path === "/v1/health") return json({ ok: true, dry_run: deps.integrations.dryRun, time: deps.now().toISOString() });
      if (path.startsWith("/console")) return await handleConsole(req, path);
      if (path === "/v1/guardian/run" && req.method === "POST") {
        if (!safeEqual(req.headers.get("x-cron-secret") ?? "", cfg.cronSecret) && !isAdmin(req)) return json({ error: "unauthorized" }, 401);
        return json(await runGuardian(deps));
      }
      const token = bearer(req);
      let scopes: ReadonlySet<Scope> | null = null;
      if (isAdmin(req) || (cfg.agentKey && safeEqual(token, cfg.agentKey))) scopes = new Set(SCOPES);
      else for (const [key, s] of Object.entries(cfg.agentKeys ?? {})) if (safeEqual(token, key)) scopes = new Set(s);
      if (!scopes) return json({ error: "unauthorized: send Authorization: Bearer <GATEWAY_KEY>" }, 401);
      const need = requiredScope(req.method, path);
      if (!scopes.has(need)) return json({ error: `this key lacks scope "${need}" for ${req.method} ${path}` }, 403);
      const actor = (req.headers.get("x-agent") ?? "agent").slice(0, 64);
      for (const [method, re, handler] of routes) {
        if (method !== req.method) continue;
        const m = path.match(re);
        if (!m) continue;
        let cached: Row | undefined;
        const body = async () => {
          if (cached) return cached;
          const text = await req.text();
          try {
            cached = text ? (JSON.parse(text) as Row) : {};
          } catch {
            throw new HttpError(400, "body must be JSON");
          }
          return cached;
        };
        return await handler({ req, url, params: m.slice(1), actor, scopes, body });
      }
      return json({ error: `no route for ${req.method} ${path}` }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("illegal ")) return json({ error: msg }, 409);
      console.error(e);
      return json({ error: msg }, 500);
    }
  };
}
