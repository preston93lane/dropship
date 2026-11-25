/**
 * The action pipeline: every external side effect an agent wants goes through
 * submitAction -> policy -> (execute | queue for approval | reject).
 */
import { ACTION_TYPES, evaluateAction, type ActionRequest, type ActionType, type PolicyContext } from "../core/policy.ts";
import { unitEconomics } from "../core/economics.ts";
import type { Integrations, StoreProductInput } from "../adapters/types.ts";
import type { ActionRow, Ad, Campaign, Creative, Product, Repo, Row } from "../repo/types.ts";
import { loadEconomicsDefaults, loadGuardrails } from "./settings.ts";
import type { ComplianceJudge } from "./compliance.ts";

export interface Deps {
  repo: Repo;
  integrations: Integrations;
  now: () => Date;
  consoleUrl?: string;
  /** Independent server-side compliance check (see compliance.ts). Optional. */
  complianceJudge?: ComplianceJudge;
}

export interface SubmitInput {
  type: string;
  payload: Row;
  rationale?: string;
  requested_by: string;
  idempotency_key?: string;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const LIVE_PRODUCT_STATES = new Set(["approved", "listing", "creative_production", "ready_to_test", "testing", "winner", "scaling", "refreshing"]);

const today = (d: Date) => d.toISOString().slice(0, 10);

async function mustGet<T extends Row>(repo: Repo, table: string, id: unknown): Promise<T> {
  if (typeof id !== "string" || !id) throw new HttpError(400, `${table} id is required`);
  const row = await repo.get<T>(table, id);
  if (!row) throw new HttpError(404, `${table} ${id} not found`);
  return row;
}

async function creativesApproved(repo: Repo, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return false;
  for (const id of ids) {
    const c = await repo.get<Creative>("creatives", id);
    if (!c || !["approved", "live"].includes(c.status) || c.compliance?.verdict !== "pass") return false;
  }
  return true;
}

/** Fill payload fields from the database so agents cannot misreport current state. */
async function enrich(deps: Deps, type: ActionType, payload: Row): Promise<{ payload: Row; productId?: string; ctx: Partial<PolicyContext> }> {
  const { repo } = deps;
  const p: Row = { ...payload };
  const ctx: Partial<PolicyContext> = {};
  let productId = typeof p.product_id === "string" ? p.product_id : undefined;

  if (type === "ads.create_test") {
    const ids = Array.isArray(p.creative_ids) ? (p.creative_ids as string[]) : [];
    ctx.creativesCompliant = await creativesApproved(repo, ids);
    const product = await mustGet<Product>(repo, "products", productId);
    ctx.productApproved = LIVE_PRODUCT_STATES.has(product.status);
  }
  if (type === "ads.activate" || type === "ads.set_budget" || (type === "ads.pause" && p.campaign_id)) {
    const c = await mustGet<Campaign>(repo, "campaigns", p.campaign_id);
    productId = c.product_id;
    if (type === "ads.activate") {
      p.dailyBudget = Number(c.daily_budget);
      const ads = await repo.list<Ad>("ads", { eq: { campaign_id: c.id } });
      ctx.creativesCompliant = await creativesApproved(repo, ads.map((a) => a.creative_id));
    }
    if (type === "ads.set_budget") p.currentDailyBudget = c.status === "active" ? Number(c.daily_budget) : 0;
  }
  if (type === "ads.scale_duplicate") {
    const ad = await mustGet<Ad>(repo, "ads", p.ad_id);
    productId = ad.product_id;
    ctx.creativesCompliant = await creativesApproved(repo, [ad.creative_id]);
  }
  if (type === "shopify.set_price") {
    const product = await mustGet<Product>(repo, "products", productId);
    p.currentPrice = product.price ?? undefined;
  }
  if (type === "supplier.order_sample" && p.cost === undefined) {
    const product = await mustGet<Product>(repo, "products", productId);
    p.cost = Number(product.supplier?.cogs ?? 0) * Number(p.quantity ?? 1) + Number(product.supplier?.shipping_cost ?? 0);
  }
  return productId ? { payload: p, productId, ctx } : { payload: p, ctx };
}

async function policyContext(deps: Deps, extra: Partial<PolicyContext>): Promise<PolicyContext> {
  const { repo, now } = deps;
  const active = await repo.list<Campaign>("campaigns", { eq: { status: "active" } });
  const createdToday = await repo.list<Campaign>("campaigns", { gte: { created_at: `${today(now())}T00:00:00.000Z` }, eq: { phase: "testing" } });
  const testing = await repo.list<Product>("products", { eq: { status: "testing" } });
  const weekAgo = new Date(now().getTime() - 7 * 86400_000).toISOString();
  const samples = await repo.list<ActionRow>("actions", { eq: { type: "supplier.order_sample", status: "succeeded" }, gte: { created_at: weekAgo } });
  return {
    committedDailyBudget: active.reduce((s, c) => s + Number(c.daily_budget), 0),
    newTestsToday: createdToday.length,
    activeTestingProducts: testing.length,
    samplesThisWeek: samples.length,
    ...extra,
  };
}

export async function submitAction(deps: Deps, input: SubmitInput): Promise<ActionRow> {
  const { repo, integrations } = deps;
  if (!(ACTION_TYPES as readonly string[]).includes(input.type)) {
    throw new HttpError(400, `unknown action type "${input.type}". Valid: ${ACTION_TYPES.join(", ")}`);
  }
  const type = input.type as ActionType;
  if (input.idempotency_key) {
    const dup = await repo.list<ActionRow>("actions", { eq: { idempotency_key: input.idempotency_key }, limit: 1 });
    if (dup[0]) return dup[0];
  }
  const { payload, productId, ctx: extra } = await enrich(deps, type, input.payload ?? {});
  const guardrails = await loadGuardrails(repo);
  const ctx = await policyContext(deps, extra);
  const req: ActionRequest = { type, payload: payload as ActionRequest["payload"] };
  const policy = evaluateAction(req, guardrails, ctx);

  const status = policy.decision === "auto" ? "approved" : policy.decision === "approval" ? "pending_approval" : "rejected";
  const row = await repo.insert<ActionRow>("actions", {
    type,
    payload,
    rationale: input.rationale ?? null,
    requested_by: input.requested_by,
    product_id: productId ?? null,
    status,
    policy,
    dry_run: integrations.dryRun,
    idempotency_key: input.idempotency_key ?? null,
    decided_by: policy.decision === "auto" ? "policy" : null,
    decided_at: policy.decision === "auto" ? deps.now().toISOString() : null,
  });

  if (status === "approved") return executeAction(deps, row);
  if (status === "pending_approval") {
    const why = input.rationale ? ": " + input.rationale : "";
    const title = productId ? (await repo.get<Product>("products", productId))?.title : undefined;
    await integrations.notifier.send("Approval needed: " + (title ? title + ": " : "") + describeAction(type, payload) + "\nRequested by " + input.requested_by + why, {
      severity: "warn",
      ...(deps.consoleUrl ? { link: deps.consoleUrl } : {}),
      buttons: [
        { text: "✅ Approve", data: "a:" + row.id },
        { text: "❌ Reject", data: "r:" + row.id },
      ],
    });
  }
  return row;
}

/** Emergency stop: kill switch on (blocks every spend-increasing action) and pause all active campaigns. */
export async function engageKillSwitch(deps: Deps, by: string, reason: string): Promise<number> {
  const g = await loadGuardrails(deps.repo);
  if (!g.killSwitch) await deps.repo.setSetting("guardrails", { ...g, killSwitch: true }, by, reason);
  const active = await deps.repo.list<Campaign>("campaigns", { eq: { status: "active" } });
  for (const c of active) {
    await submitAction(deps, { type: "ads.pause", payload: { campaign_id: c.id, reason }, requested_by: by, rationale: "kill switch: " + reason });
  }
  return active.length;
}

/** One human-readable line for approval messages (what will happen, with the money involved). */
export function describeAction(type: string, p: Row): string {
  const money = (n: unknown) => (typeof n === "number" ? "$" + n.toFixed(2) : "?");
  const short = (v: unknown) => String(v ?? "").slice(0, 8);
  switch (type) {
    case "ads.activate":
      return "start spending on campaign " + short(p.campaign_id) + " at " + money(p.dailyBudget) + "/day";
    case "ads.set_budget":
      return "change daily budget " + money(p.currentDailyBudget) + " -> " + money(p.dailyBudget) + " (campaign " + short(p.campaign_id) + ")";
    case "ads.create_test":
      return "create a paused " + String(p.channel) + " test at " + money(p.dailyBudget) + "/day";
    case "ads.scale_duplicate":
      return "duplicate a winning ad into a scaling campaign at " + money(p.dailyBudget) + "/day";
    case "shopify.publish_product":
      return "publish the product page (make it live)";
    case "shopify.set_price":
      return "change price " + money(p.currentPrice) + " -> " + money(p.price);
    case "supplier.order_sample":
      return "order a supplier sample (~" + money(p.cost) + ")";
    case "tiktok_shop.list_product":
      return "list the product on TikTok Shop";
    default:
      return type;
  }
}

export async function decideAction(deps: Deps, id: string, approve: boolean, by: string, note?: string): Promise<ActionRow> {
  const row = await mustGet<ActionRow>(deps.repo, "actions", id);
  if (row.status !== "pending_approval") throw new HttpError(409, `action is ${row.status}, not pending_approval`);
  const decided = await deps.repo.update<ActionRow>("actions", id, {
    status: approve ? "approved" : "rejected",
    decided_by: by,
    decided_at: deps.now().toISOString(),
    ...(note ? { error: note } : {}),
  });
  return approve ? executeAction(deps, decided) : decided;
}

export async function executeAction(deps: Deps, row: ActionRow): Promise<ActionRow> {
  const { repo, now } = deps;
  await repo.update("actions", row.id, { status: "executing" });
  try {
    const result = await run(deps, row.type as ActionType, row.payload, row);
    return await repo.update<ActionRow>("actions", row.id, { status: "succeeded", result, executed_at: now().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.integrations.notifier.send(`Action failed: ${row.type} — ${msg}`, { severity: "warn" });
    return await repo.update<ActionRow>("actions", row.id, { status: "failed", error: msg, executed_at: now().toISOString() });
  }
}

function adsFor(deps: Deps, channel: unknown) {
  if (channel !== "meta" && channel !== "tiktok") throw new HttpError(400, "channel must be meta or tiktok");
  const a = deps.integrations.ads[channel];
  if (!a) throw new HttpError(400, `${channel} is not configured`);
  return a;
}

async function run(deps: Deps, type: ActionType, p: Row, row: ActionRow): Promise<Row> {
  const { repo, integrations, now } = deps;
  const ts = now().toISOString();
  switch (type) {
    case "shopify.create_product": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      const input = p.listing as StoreProductInput | undefined;
      if (!input?.title || !Array.isArray(input.variants) || input.variants.length === 0) {
        throw new HttpError(400, "payload.listing {title, descriptionHtml, variants[]} is required");
      }
      const res = await integrations.store.createDraftProduct(input);
      await repo.update("products", product.id, { shopify_product_id: res.productId, shopify_handle: res.handle });
      return res;
    }
    case "shopify.update_product": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      if (!product.shopify_product_id) throw new HttpError(409, "product has no Shopify id yet");
      await integrations.store.updateProduct(product.shopify_product_id, (p.listing ?? {}) as Partial<StoreProductInput>);
      return { updated: true };
    }
    case "shopify.publish_product":
    case "shopify.unpublish_product": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      if (!product.shopify_product_id) throw new HttpError(409, "product has no Shopify id yet");
      const active = type === "shopify.publish_product";
      await integrations.store.setActive(product.shopify_product_id, active);
      if (active && integrations.publications.onlineStore) {
        await integrations.store.publishToChannel(product.shopify_product_id, integrations.publications.onlineStore);
      }
      return { active, url: product.shopify_handle ? integrations.store.productUrl(product.shopify_handle) : null };
    }
    case "shopify.set_price": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      const price = Number(p.price);
      if (product.shopify_product_id) {
        await integrations.store.setPrice(product.shopify_product_id, price, p.compare_at_price ? Number(p.compare_at_price) : undefined);
      }
      const d = await loadEconomicsDefaults(repo);
      const s = product.supplier ?? {};
      const economics =
        s.cogs !== undefined
          ? unitEconomics({ price, cogs: Number(s.cogs), shippingCost: Number(s.shipping_cost ?? 0), ...d }, { targetProfitShare: d.targetProfitShare })
          : null;
      await repo.update("products", product.id, { price, ...(economics ? { economics } : {}) });
      return { price, economics };
    }
    case "tiktok_shop.list_product": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      if (!product.shopify_product_id) throw new HttpError(409, "list on Shopify first; TikTok Shop syncs via the TikTok sales channel app");
      if (!integrations.publications.tiktok) throw new HttpError(400, "SHOPIFY_TIKTOK_PUBLICATION_ID not configured");
      await integrations.store.publishToChannel(product.shopify_product_id, integrations.publications.tiktok);
      return { published_to: "tiktok" };
    }
    case "ads.create_test": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      const adapter = adsFor(deps, p.channel);
      const ids = p.creative_ids as string[];
      let creatives = await Promise.all(ids.map((id) => mustGet<Creative>(repo, "creatives", id)));
      if (adapter.channel === "tiktok") {
        creatives = creatives.filter((c) => c.format === "video");
        if (creatives.length === 0) throw new HttpError(400, "TikTok tests need video creatives (render statics as slideshow videos first)");
      }
      const landingUrl = (p.landing_url as string | undefined) ?? (product.shopify_handle ? integrations.store.productUrl(product.shopify_handle) : undefined);
      if (!landingUrl) throw new HttpError(409, "no landing_url and product has no Shopify handle");
      const name = (p.name as string | undefined) ?? `T | ${product.title.slice(0, 40)} | ${ts.slice(0, 10)}`;
      const res = await adapter.createTest({
        name,
        dailyBudget: Number(p.dailyBudget),
        landingUrl,
        creatives: creatives.map((c) => ({
          creativeId: c.id,
          format: c.format,
          assetUrl: String(c.asset_url ?? ""),
          thumbnailUrl: c.thumbnail_url ?? null,
          primaryText: String(c.primary_text ?? ""),
          headline: String(c.headline ?? ""),
          cta: (c.cta as string | null | undefined) ?? null,
        })),
      });
      const campaign = await repo.insert<Campaign>("campaigns", {
        product_id: product.id,
        channel: adapter.channel,
        phase: "testing",
        status: "paused",
        name,
        external_campaign_id: res.externalCampaignId,
        external_adset_id: res.externalAdsetId,
        daily_budget: Number(p.dailyBudget),
        landing_url: landingUrl,
      });
      for (const a of res.ads) {
        await repo.insert("ads", { campaign_id: campaign.id, product_id: product.id, creative_id: a.creativeId, channel: adapter.channel, external_ad_id: a.externalAdId, status: "paused" });
      }
      if (!product.test_budget) {
        const be = Number((product.economics as { breakevenCpa?: number } | null)?.breakevenCpa ?? 0);
        const d = await loadEconomicsDefaults(repo);
        if (be > 0) await repo.update("products", product.id, { test_budget: Math.round(be * d.testBudgetMultiple) });
      }
      return { campaign_id: campaign.id, ...res };
    }
    case "ads.activate": {
      const c = await mustGet<Campaign>(repo, "campaigns", p.campaign_id);
      const ads = await repo.list<Ad>("ads", { eq: { campaign_id: c.id } });
      await adsFor(deps, c.channel).setActive(
        { externalCampaignId: String(c.external_campaign_id), externalAdsetId: String(c.external_adset_id), externalAdIds: ads.filter((a) => a.status !== "killed").map((a) => String(a.external_ad_id)) },
        true,
      );
      await repo.update("campaigns", c.id, { status: "active", last_budget_change_at: ts });
      for (const a of ads) {
        if (a.status === "killed") continue;
        await repo.update("ads", a.id, { status: "active", launched_at: a.launched_at ?? ts });
        await repo.update("creatives", a.creative_id, { status: "live" });
      }
      const product = await mustGet<Product>(repo, "products", c.product_id);
      if (product.status === "ready_to_test") {
        await repo.update("products", product.id, { status: "testing", launched_at: ts });
        await repo.insert("product_events", { product_id: product.id, from_status: product.status, to_status: "testing", reason: "first campaign activated", actor: row.requested_by });
      }
      return { activated: c.id };
    }
    case "ads.set_budget": {
      const c = await mustGet<Campaign>(repo, "campaigns", p.campaign_id);
      await adsFor(deps, c.channel).setDailyBudget({ externalCampaignId: String(c.external_campaign_id), externalAdsetId: String(c.external_adset_id) }, Number(p.dailyBudget));
      await repo.update("campaigns", c.id, { daily_budget: Number(p.dailyBudget), last_budget_change_at: ts });
      return { campaign_id: c.id, from: p.currentDailyBudget, to: p.dailyBudget };
    }
    case "ads.pause": {
      const reason = (p.reason as string | undefined) ?? row.rationale ?? "paused";
      const kill = p.kill === true;
      if (p.ad_id) {
        const ad = await mustGet<Ad>(repo, "ads", p.ad_id);
        await adsFor(deps, ad.channel).pauseAd(String(ad.external_ad_id));
        await repo.update("ads", ad.id, kill ? { status: "killed", killed_at: ts, kill_reason: reason } : { status: "paused" });
        if (kill) await repo.update("creatives", ad.creative_id, { status: "retired" });
        return { paused_ad: ad.id, killed: kill };
      }
      const c = await mustGet<Campaign>(repo, "campaigns", p.campaign_id);
      const ads = await repo.list<Ad>("ads", { eq: { campaign_id: c.id } });
      await adsFor(deps, c.channel).setActive(
        { externalCampaignId: String(c.external_campaign_id), externalAdsetId: String(c.external_adset_id), externalAdIds: ads.map((a) => String(a.external_ad_id)) },
        false,
      );
      await repo.update("campaigns", c.id, { status: kill ? "killed" : "paused" });
      for (const a of ads) if (a.status === "active") await repo.update("ads", a.id, kill ? { status: "killed", killed_at: ts, kill_reason: reason } : { status: "paused" });
      return { paused_campaign: c.id, killed: kill };
    }
    case "ads.scale_duplicate": {
      const ad = await mustGet<Ad>(repo, "ads", p.ad_id);
      const src = await mustGet<Campaign>(repo, "campaigns", ad.campaign_id);
      const creative = await mustGet<Creative>(repo, "creatives", ad.creative_id);
      const adapter = adsFor(deps, src.channel);
      const name = `S | ${String(src.name).replace(/^T \| /, "").slice(0, 40)} | ${ts.slice(0, 10)}`;
      const res = await adapter.createTest({
        name,
        dailyBudget: Number(p.dailyBudget),
        landingUrl: String(src.landing_url),
        creatives: [{ creativeId: creative.id, format: creative.format, assetUrl: String(creative.asset_url), thumbnailUrl: creative.thumbnail_url ?? null, primaryText: String(creative.primary_text ?? ""), headline: String(creative.headline ?? ""), cta: (creative.cta as string | null | undefined) ?? null }],
      });
      await adapter.setActive({ externalCampaignId: res.externalCampaignId, externalAdsetId: res.externalAdsetId, externalAdIds: res.ads.map((a) => a.externalAdId) }, true);
      const campaign = await repo.insert<Campaign>("campaigns", { product_id: ad.product_id, channel: src.channel, phase: "scaling", status: "active", name, external_campaign_id: res.externalCampaignId, external_adset_id: res.externalAdsetId, daily_budget: Number(p.dailyBudget), landing_url: src.landing_url, last_budget_change_at: ts });
      await repo.insert("ads", { campaign_id: campaign.id, product_id: ad.product_id, creative_id: creative.id, channel: src.channel, external_ad_id: res.ads[0]?.externalAdId ?? null, status: "active", launched_at: ts });
      return { scaling_campaign_id: campaign.id };
    }
    case "supplier.order_sample": {
      const product = await mustGet<Product>(repo, "products", p.product_id);
      const vid = product.supplier?.variant_id ?? product.supplier?.product_id;
      if (!vid) throw new HttpError(409, "product.supplier.variant_id is required to order a sample");
      const res = await integrations.supplier.orderSample({ supplierVariantId: vid, quantity: Number(p.quantity ?? 1), reference: `sample-${row.id.slice(0, 8)}` });
      await repo.insert("costs", { category: "samples", vendor: String(product.supplier?.name ?? "supplier"), amount: Number(p.cost ?? 0), ref: res.orderId });
      return res;
    }
    case "notify.human": {
      const sev = p.severity === "critical" || p.severity === "warn" ? p.severity : "info";
      await integrations.notifier.send(String(p.message ?? ""), deps.consoleUrl ? { severity: sev, link: deps.consoleUrl } : { severity: sev });
      return { sent: true };
    }
  }
}
