/**
 * Meta Marketing API adapter (Facebook + Instagram ads).
 * STATUS: implemented against the Graph API Marketing endpoints. VERIFY field names
 * against your pinned META_API_VERSION in a sandbox/test ad account before going live.
 *
 * Test structure (ABO): 1 campaign (OUTCOME_SALES) -> 1 ad set (daily budget, broad US,
 * Advantage+ audience, purchase optimization) -> N ads, one per creative. Everything is
 * created PAUSED. Activation and budget changes are separate, policy-gated actions.
 */
import { fetchBase64, requestJson } from "./http.ts";
import type { AdsAdapter, CreateTestInput, CreateTestResult, DailyAdMetrics, ExternalIds } from "./types.ts";

export interface MetaConfig {
  accessToken: string; // system-user token with ads_management
  adAccountId: string; // without "act_"
  pageId: string;
  pixelId: string;
  instagramUserId?: string;
  apiVersion: string; // e.g. v24.0
  countries?: string[];
}

type GraphResp = { id?: string; success?: boolean; data?: unknown[]; paging?: { next?: string }; hash?: string; images?: Record<string, { hash: string }> };

export class MetaAdsAdapter implements AdsAdapter {
  readonly channel = "meta" as const;
  private readonly cfg: MetaConfig;
  constructor(cfg: MetaConfig) {
    this.cfg = cfg;
  }

  private url(path: string) {
    return `https://graph.facebook.com/${this.cfg.apiVersion}/${path}`;
  }

  private post(path: string, params: Record<string, unknown>): Promise<GraphResp> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    body.set("access_token", this.cfg.accessToken);
    return requestJson<GraphResp>(this.url(path), { method: "POST", body }, { label: `meta POST ${path.split("?")[0]}` });
  }

  private async uploadVideo(fileUrl: string): Promise<string> {
    const r = await this.post(`act_${this.cfg.adAccountId}/advideos`, { file_url: fileUrl });
    if (!r.id) throw new Error("meta video upload returned no id");
    return r.id;
  }

  private async uploadImage(url: string): Promise<string> {
    const r = await this.post(`act_${this.cfg.adAccountId}/adimages`, { bytes: await fetchBase64(url) });
    const first = r.images ? Object.values(r.images)[0] : undefined;
    if (!first) throw new Error("meta image upload returned no hash");
    return first.hash;
  }

  async createTest(input: CreateTestInput): Promise<CreateTestResult> {
    const act = `act_${this.cfg.adAccountId}`;
    const campaign = await this.post(`${act}/campaigns`, {
      name: input.name,
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      is_adset_budget_sharing_enabled: false,
    });
    const adset = await this.post(`${act}/adsets`, {
      name: `${input.name} | broad`,
      campaign_id: campaign.id,
      daily_budget: Math.round(input.dailyBudget * 100), // minor units
      billing_event: "IMPRESSIONS",
      optimization_goal: "OFFSITE_CONVERSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      promoted_object: { pixel_id: this.cfg.pixelId, custom_event_type: "PURCHASE" },
      targeting: {
        geo_locations: { countries: this.cfg.countries ?? ["US"] },
        age_min: 18,
        targeting_automation: { advantage_audience: 1 },
      },
      status: "PAUSED",
    });

    const ads: CreateTestResult["ads"] = [];
    for (const c of input.creatives) {
      const cta = { type: c.cta ?? "SHOP_NOW", value: { link: input.landingUrl } };
      const identity = { page_id: this.cfg.pageId, ...(this.cfg.instagramUserId ? { instagram_user_id: this.cfg.instagramUserId } : {}) };
      const objectStorySpec =
        c.format === "video"
          ? {
              ...identity,
              video_data: {
                video_id: await this.uploadVideo(c.assetUrl),
                ...(c.thumbnailUrl ? { image_url: c.thumbnailUrl } : {}),
                message: c.primaryText,
                title: c.headline,
                call_to_action: cta,
              },
            }
          : {
              ...identity,
              link_data: {
                image_hash: await this.uploadImage(c.assetUrl),
                link: input.landingUrl,
                message: c.primaryText,
                name: c.headline,
                call_to_action: cta,
              },
            };
      const creative = await this.post(`${act}/adcreatives`, { name: `${input.name} | ${c.creativeId}`, object_story_spec: objectStorySpec });
      const ad = await this.post(`${act}/ads`, {
        name: `${input.name} | ${c.creativeId.slice(0, 8)}`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      });
      ads.push({ creativeId: c.creativeId, externalAdId: ad.id! });
    }
    return { externalCampaignId: campaign.id!, externalAdsetId: adset.id!, ads };
  }

  async setActive(ids: ExternalIds, active: boolean) {
    const status = active ? "ACTIVE" : "PAUSED";
    for (const adId of ids.externalAdIds) await this.post(adId, { status });
    await this.post(ids.externalAdsetId, { status });
    await this.post(ids.externalCampaignId, { status });
  }

  async pauseAd(externalAdId: string) {
    await this.post(externalAdId, { status: "PAUSED" });
  }

  async setDailyBudget(ids: Pick<ExternalIds, "externalCampaignId" | "externalAdsetId">, dailyBudget: number) {
    await this.post(ids.externalAdsetId, { daily_budget: Math.round(dailyBudget * 100) });
  }

  async fetchDailyMetrics(since: string, until: string): Promise<DailyAdMetrics[]> {
    type Row = {
      ad_id: string;
      date_start: string;
      spend?: string;
      impressions?: string;
      inline_link_clicks?: string;
      frequency?: string;
      actions?: { action_type: string; value: string }[];
      action_values?: { action_type: string; value: string }[];
    };
    const pick = (list: { action_type: string; value: string }[] | undefined, types: string[]) => {
      for (const t of types) {
        const hit = list?.find((a) => a.action_type === t);
        if (hit) return Number(hit.value);
      }
      return 0;
    };
    const params = new URLSearchParams({
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "ad_id,spend,impressions,inline_link_clicks,frequency,actions,action_values",
      limit: "500",
      access_token: this.cfg.accessToken,
    });
    let next: string | undefined = `${this.url(`act_${this.cfg.adAccountId}/insights`)}?${params}`;
    const out: DailyAdMetrics[] = [];
    while (next) {
      const page: { data: Row[]; paging?: { next?: string } } = await requestJson(next, {}, { label: "meta insights" });
      for (const r of page.data) {
        out.push({
          externalAdId: r.ad_id,
          date: r.date_start,
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.inline_link_clicks ?? 0),
          addToCarts: pick(r.actions, ["omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"]),
          checkouts: pick(r.actions, ["omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout"]),
          purchases: pick(r.actions, ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"]),
          revenue: pick(r.action_values, ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"]),
          ...(r.frequency ? { frequency: Number(r.frequency) } : {}),
        });
      }
      next = page.paging?.next;
    }
    return out;
  }
}
