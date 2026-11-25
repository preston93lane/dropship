/**
 * Integration contracts. The gateway only talks to these interfaces; each has
 * a live implementation and a DRY_RUN implementation that returns fake IDs, so
 * the whole loop can run end-to-end before any account is connected.
 */

export interface AdCreativeInput {
  creativeId: string;
  format: string; // video | static | carousel
  assetUrl: string;
  thumbnailUrl?: string | null;
  primaryText: string;
  headline: string;
  cta?: string | null;
}

export interface CreateTestInput {
  name: string;
  dailyBudget: number;
  landingUrl: string;
  creatives: AdCreativeInput[];
}

export interface CreateTestResult {
  externalCampaignId: string;
  externalAdsetId: string;
  ads: { creativeId: string; externalAdId: string }[];
}

export interface ExternalIds {
  externalCampaignId: string;
  externalAdsetId: string;
  externalAdIds: string[];
}

export interface DailyAdMetrics {
  externalAdId: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  revenue: number;
  frequency?: number;
  video3sViews?: number;
}

export interface AdsAdapter {
  readonly channel: "meta" | "tiktok";
  createTest(input: CreateTestInput): Promise<CreateTestResult>;
  setActive(ids: ExternalIds, active: boolean): Promise<void>;
  pauseAd(externalAdId: string): Promise<void>;
  setDailyBudget(ids: Pick<ExternalIds, "externalCampaignId" | "externalAdsetId">, dailyBudget: number): Promise<void>;
  fetchDailyMetrics(since: string, until: string): Promise<DailyAdMetrics[]>;
}

export interface StoreProductInput {
  title: string;
  descriptionHtml: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  images?: { url: string; alt?: string }[];
  options?: { name: string; values: string[] }[];
  variants: { optionValues?: Record<string, string>; price: number; compareAtPrice?: number; sku?: string }[];
  seo?: { title?: string; description?: string };
}

export interface StoreAdapter {
  createDraftProduct(input: StoreProductInput): Promise<{ productId: string; handle: string; variantIds: string[] }>;
  updateProduct(productId: string, input: Partial<StoreProductInput>): Promise<void>;
  setActive(productId: string, active: boolean): Promise<void>;
  setPrice(productId: string, price: number, compareAtPrice?: number): Promise<void>;
  publishToChannel(productId: string, publicationId: string): Promise<void>;
  productUrl(handle: string): string;
}

export interface SampleOrderInput {
  supplierVariantId: string;
  quantity: number;
  reference: string;
}

export interface SupplierAdapter {
  orderSample(input: SampleOrderInput): Promise<{ orderId: string }>;
}

export interface NotifyOptions {
  severity?: "info" | "warn" | "critical";
  link?: string;
  /** One-tap buttons (Telegram inline keyboard). `data` comes back in the webhook callback. */
  buttons?: { text: string; data: string }[];
}

export interface Notifier {
  send(text: string, opts?: NotifyOptions): Promise<void>;
}

/** Telegram Bot API calls the gateway needs to answer button presses and commands. */
export interface TelegramApi {
  readonly chatId: string;
  sendMessage(text: string, buttons?: { text: string; data: string }[]): Promise<void>;
  answerCallback(callbackQueryId: string, text: string): Promise<void>;
  editMessage(chatId: string | number, messageId: number, text: string): Promise<void>;
}

export interface Integrations {
  dryRun: boolean;
  ads: Partial<Record<"meta" | "tiktok", AdsAdapter>>;
  store: StoreAdapter;
  supplier: SupplierAdapter;
  notifier: Notifier;
  telegram?: TelegramApi;
  publications: { onlineStore?: string; tiktok?: string };
  /** Optional hook to wake a Managed Agents deployment early (e.g. creative fatigue on a winner). */
  triggerLoop?: (loop: string, reason: string) => Promise<void>;
}

export class IntegrationError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
