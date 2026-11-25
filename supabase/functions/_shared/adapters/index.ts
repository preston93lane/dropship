/**
 * Builds the integration set from environment variables. Anything not configured
 * (or DRY_RUN=true, the default) falls back to a dry-run adapter that returns fake
 * IDs and logs what it would have done.
 */
import { requestJson } from "./http.ts";
import { MetaAdsAdapter } from "./meta.ts";
import { ShopifyAdapter } from "./shopify.ts";
import { TikTokAdsAdapter } from "./tiktok.ts";
import type {
  AdsAdapter,
  CreateTestInput,
  CreateTestResult,
  DailyAdMetrics,
  ExternalIds,
  Integrations,
  Notifier,
  NotifyOptions,
  SampleOrderInput,
  StoreAdapter,
  StoreProductInput,
  SupplierAdapter,
  TelegramApi,
} from "./types.ts";

const fakeId = (prefix: string) => `dry_${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export class DryRunAds implements AdsAdapter {
  readonly channel: "meta" | "tiktok";
  readonly calls: { op: string; args: unknown }[] = [];
  /** Tests can preload synthetic metrics here. */
  metrics: DailyAdMetrics[] = [];
  constructor(channel: "meta" | "tiktok") {
    this.channel = channel;
  }
  async createTest(input: CreateTestInput): Promise<CreateTestResult> {
    this.calls.push({ op: "createTest", args: input });
    return {
      externalCampaignId: fakeId(`${this.channel}_campaign`),
      externalAdsetId: fakeId(`${this.channel}_adset`),
      ads: input.creatives.map((c) => ({ creativeId: c.creativeId, externalAdId: fakeId(`${this.channel}_ad`) })),
    };
  }
  async setActive(ids: ExternalIds, active: boolean) {
    this.calls.push({ op: "setActive", args: { ids, active } });
  }
  async pauseAd(externalAdId: string) {
    this.calls.push({ op: "pauseAd", args: externalAdId });
  }
  async setDailyBudget(ids: Pick<ExternalIds, "externalCampaignId" | "externalAdsetId">, dailyBudget: number) {
    this.calls.push({ op: "setDailyBudget", args: { ids, dailyBudget } });
  }
  async fetchDailyMetrics(): Promise<DailyAdMetrics[]> {
    return this.metrics;
  }
}

export class DryRunStore implements StoreAdapter {
  readonly calls: { op: string; args: unknown }[] = [];
  async createDraftProduct(input: StoreProductInput) {
    this.calls.push({ op: "createDraftProduct", args: input });
    const handle = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return { productId: fakeId("shopify_product"), handle, variantIds: input.variants.map(() => fakeId("variant")) };
  }
  async updateProduct(productId: string, input: Partial<StoreProductInput>) {
    this.calls.push({ op: "updateProduct", args: { productId, input } });
  }
  async setActive(productId: string, active: boolean) {
    this.calls.push({ op: "setActive", args: { productId, active } });
  }
  async setPrice(productId: string, price: number, compareAtPrice?: number) {
    this.calls.push({ op: "setPrice", args: { productId, price, compareAtPrice } });
  }
  async publishToChannel(productId: string, publicationId: string) {
    this.calls.push({ op: "publishToChannel", args: { productId, publicationId } });
  }
  productUrl(handle: string) {
    return `https://example-store.invalid/products/${handle}`;
  }
}

export class DryRunSupplier implements SupplierAdapter {
  readonly calls: SampleOrderInput[] = [];
  async orderSample(input: SampleOrderInput) {
    this.calls.push(input);
    return { orderId: fakeId("sample_order") };
  }
}

/** CJ Dropshipping sample orders. STATUS: scaffolded — verify payload against CJ API v2 docs. */
export class CjSupplier implements SupplierAdapter {
  private readonly token: string;
  private readonly shipTo: Record<string, string>;
  constructor(token: string, shipTo: Record<string, string>) {
    this.token = token;
    this.shipTo = shipTo;
  }
  async orderSample(input: SampleOrderInput) {
    const res = await requestJson<{ result: boolean; message: string; data: { orderId?: string } | string }>(
      "https://developers.cjdropshipping.com/api2.0/v1/shopping/order/createOrderV2",
      {
        method: "POST",
        headers: { "CJ-Access-Token": this.token },
        json: {
          orderNumber: input.reference,
          ...this.shipTo, // shippingCountryCode, shippingProvince, shippingCity, shippingAddress, shippingZip, shippingCustomerName, shippingPhone, logisticName, fromCountryCode
          payType: 3, // create only; pay manually in CJ (keeps a human in the money loop)
          products: [{ vid: input.supplierVariantId, quantity: input.quantity }],
        },
      },
      { label: "cj createOrderV2" },
    );
    if (!res.result) throw new Error(`cj order failed: ${res.message}`);
    const id = typeof res.data === "string" ? res.data : (res.data.orderId ?? "unknown");
    return { orderId: id };
  }
}

export class ConsoleNotifier implements Notifier {
  readonly sent: string[] = [];
  readonly buttons: { text: string; data: string }[][] = [];
  async send(text: string, opts: NotifyOptions = {}) {
    this.sent.push(text);
    if (opts.buttons) this.buttons.push(opts.buttons);
    console.log(`[notify] ${text}`);
  }
}

export class TelegramBot implements TelegramApi {
  readonly chatId: string;
  private readonly token: string;
  constructor(token: string, chatId: string) {
    this.token = token;
    this.chatId = chatId;
  }
  private call(method: string, body: Record<string, unknown>) {
    return requestJson("https://api.telegram.org/bot" + this.token + "/" + method, { method: "POST", json: body }, { retries: 1, label: "telegram " + method });
  }
  async sendMessage(text: string, buttons?: { text: string; data: string }[]) {
    const markup = buttons && buttons.length ? { reply_markup: { inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data.slice(0, 64) }))] } } : {};
    await this.call("sendMessage", { chat_id: this.chatId, text: text.slice(0, 4000), disable_web_page_preview: true, ...markup });
  }
  async answerCallback(callbackQueryId: string, text: string) {
    await this.call("answerCallbackQuery", { callback_query_id: callbackQueryId, text: text.slice(0, 190) });
  }
  async editMessage(chatId: string | number, messageId: number, text: string) {
    await this.call("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000) });
  }
}

/** Telegram bot (with one-tap approve/reject buttons) + optional generic webhook (Slack/Discord-compatible {text}). */
export class MultiNotifier implements Notifier {
  private readonly tg?: TelegramApi;
  private readonly webhook?: string;
  constructor(tg?: TelegramApi, webhook?: string) {
    if (tg) this.tg = tg;
    if (webhook) this.webhook = webhook;
  }
  async send(text: string, opts: NotifyOptions = {}) {
    const icon = opts.severity === "critical" ? "🚨" : opts.severity === "warn" ? "⚠️" : "🤖";
    const msg = icon + " " + text + (opts.link ? "\n" + opts.link : "");
    const jobs: Promise<unknown>[] = [];
    if (this.tg) jobs.push(this.tg.sendMessage(msg, opts.buttons));
    if (this.webhook) jobs.push(requestJson(this.webhook, { method: "POST", json: { text: msg } }, { retries: 1, label: "webhook" }));
    if (jobs.length === 0) console.log("[notify] " + msg);
    await Promise.allSettled(jobs);
  }
}

export function buildIntegrations(env: (k: string) => string | undefined): Integrations {
  const dryRun = (env("DRY_RUN") ?? "true").toLowerCase() !== "false";
  const ads: Integrations["ads"] = {};
  let store: StoreAdapter = new DryRunStore();
  let supplier: SupplierAdapter = new DryRunSupplier();

  if (!dryRun && env("META_ACCESS_TOKEN") && env("META_AD_ACCOUNT_ID")) {
    ads.meta = new MetaAdsAdapter({
      accessToken: env("META_ACCESS_TOKEN")!,
      adAccountId: env("META_AD_ACCOUNT_ID")!,
      pageId: env("META_PAGE_ID") ?? "",
      pixelId: env("META_PIXEL_ID") ?? "",
      apiVersion: env("META_API_VERSION") ?? "v24.0",
      ...(env("META_INSTAGRAM_USER_ID") ? { instagramUserId: env("META_INSTAGRAM_USER_ID")! } : {}),
    });
  } else ads.meta = new DryRunAds("meta");

  if (!dryRun && env("TIKTOK_ACCESS_TOKEN") && env("TIKTOK_ADVERTISER_ID")) {
    ads.tiktok = new TikTokAdsAdapter({
      accessToken: env("TIKTOK_ACCESS_TOKEN")!,
      advertiserId: env("TIKTOK_ADVERTISER_ID")!,
      pixelId: env("TIKTOK_PIXEL_ID") ?? "",
      ...(env("TIKTOK_IDENTITY_ID") ? { identityId: env("TIKTOK_IDENTITY_ID")! } : {}),
      ...(env("TIKTOK_IDENTITY_TYPE") ? { identityType: env("TIKTOK_IDENTITY_TYPE")! } : {}),
    });
  } else ads.tiktok = new DryRunAds("tiktok");

  if (!dryRun && env("SHOPIFY_STORE_DOMAIN") && env("SHOPIFY_ADMIN_TOKEN")) {
    store = new ShopifyAdapter({
      domain: env("SHOPIFY_STORE_DOMAIN")!,
      token: env("SHOPIFY_ADMIN_TOKEN")!,
      apiVersion: env("SHOPIFY_API_VERSION") ?? "2026-10",
      ...(env("STOREFRONT_DOMAIN") ? { storefrontDomain: env("STOREFRONT_DOMAIN")! } : {}),
    });
  }
  if (!dryRun && env("CJ_ACCESS_TOKEN") && env("SAMPLE_SHIP_TO_JSON")) {
    supplier = new CjSupplier(env("CJ_ACCESS_TOKEN")!, JSON.parse(env("SAMPLE_SHIP_TO_JSON")!));
  }

  const tgToken = env("TELEGRAM_BOT_TOKEN");
  const tgChat = env("TELEGRAM_CHAT_ID");
  const telegram = tgToken && tgChat ? new TelegramBot(tgToken, tgChat) : undefined;
  const notifier = new MultiNotifier(telegram, env("NOTIFY_WEBHOOK_URL"));

  const integrations: Integrations = {
    dryRun,
    ads,
    store,
    supplier,
    notifier,
    ...(telegram ? { telegram } : {}),
    publications: {
      ...(env("SHOPIFY_ONLINE_STORE_PUBLICATION_ID") ? { onlineStore: env("SHOPIFY_ONLINE_STORE_PUBLICATION_ID")! } : {}),
      ...(env("SHOPIFY_TIKTOK_PUBLICATION_ID") ? { tiktok: env("SHOPIFY_TIKTOK_PUBLICATION_ID")! } : {}),
    },
  };

  // triggerLoop (event-driven deployment runs) is attached by the Edge entrypoints: see _shared/edge/triggers.ts
  return integrations;
}
