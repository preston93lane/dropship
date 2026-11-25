/**
 * TikTok Marketing (Business) API v1.3 adapter.
 * STATUS: implemented against the v1.3 campaign/adgroup/ad/report endpoints. VERIFY enum
 * values (objective, optimization event, identity type) in your advertiser account before
 * going live — TikTok renames these more often than Meta.
 */
import { requestJson } from "./http.ts";
import type { AdsAdapter, CreateTestInput, CreateTestResult, DailyAdMetrics, ExternalIds } from "./types.ts";

export interface TikTokConfig {
  accessToken: string;
  advertiserId: string;
  pixelId: string;
  identityId?: string; // custom identity or TikTok account identity for Spark-style ads
  identityType?: string; // e.g. CUSTOMIZED_USER
  locationIds?: string[]; // US = 6252001
}

const BASE = "https://business-api.tiktok.com/open_api/v1.3";

export class TikTokAdsAdapter implements AdsAdapter {
  readonly channel = "tiktok" as const;
  private readonly cfg: TikTokConfig;
  constructor(cfg: TikTokConfig) {
    this.cfg = cfg;
  }

  private async call<T = Record<string, unknown>>(path: string, body: Record<string, unknown>, method: "POST" | "GET" = "POST"): Promise<T> {
    const headers = { "Access-Token": this.cfg.accessToken };
    const payload = { advertiser_id: this.cfg.advertiserId, ...body };
    let res: { code: number; message: string; data: T };
    if (method === "GET") {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(payload)) qs.set(k, typeof v === "string" ? v : JSON.stringify(v));
      res = await requestJson(`${BASE}${path}?${qs}`, { headers }, { label: `tiktok ${path}` });
    } else {
      res = await requestJson(`${BASE}${path}`, { method: "POST", headers, json: payload }, { label: `tiktok ${path}` });
    }
    if (res.code !== 0) throw new Error(`tiktok ${path} error ${res.code}: ${res.message}`);
    return res.data;
  }

  async createTest(input: CreateTestInput): Promise<CreateTestResult> {
    const campaign = await this.call<{ campaign_id: string }>("/campaign/create/", {
      campaign_name: input.name,
      objective_type: "WEB_CONVERSIONS",
      budget_mode: "BUDGET_MODE_INFINITE",
      operation_status: "DISABLE",
    });
    const adgroup = await this.call<{ adgroup_id: string }>("/adgroup/create/", {
      campaign_id: campaign.campaign_id,
      adgroup_name: `${input.name} | broad`,
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: this.cfg.locationIds ?? ["6252001"],
      budget_mode: "BUDGET_MODE_DAY",
      budget: input.dailyBudget,
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: new Date().toISOString().replace("T", " ").slice(0, 19),
      optimization_goal: "CONVERT",
      optimization_event: "SHOPPING",
      pixel_id: this.cfg.pixelId,
      billing_event: "OCPM",
      bid_type: "BID_TYPE_NO_BID",
      operation_status: "DISABLE",
    });

    const ads: CreateTestResult["ads"] = [];
    for (const c of input.creatives) {
      if (c.format !== "video") continue; // TikTok in-feed is video-first; statics become slideshows upstream
      const video = await this.call<{ video_id: string }[] | { video_id: string }>("/file/video/ad/upload/", {
        upload_type: "UPLOAD_BY_URL",
        video_url: c.assetUrl,
        file_name: `${c.creativeId}.mp4`,
      });
      const videoId = Array.isArray(video) ? video[0]!.video_id : video.video_id;
      const ad = await this.call<{ ad_ids: string[] }>("/ad/create/", {
        adgroup_id: adgroup.adgroup_id,
        creatives: [
          {
            ad_name: `${input.name} | ${c.creativeId.slice(0, 8)}`,
            ad_format: "SINGLE_VIDEO",
            video_id: videoId,
            ad_text: c.primaryText.slice(0, 100),
            call_to_action: c.cta ?? "SHOP_NOW",
            landing_page_url: input.landingUrl,
            identity_type: this.cfg.identityType ?? "CUSTOMIZED_USER",
            ...(this.cfg.identityId ? { identity_id: this.cfg.identityId } : {}),
          },
        ],
        operation_status: "DISABLE",
      });
      ads.push({ creativeId: c.creativeId, externalAdId: ad.ad_ids[0]! });
    }
    return { externalCampaignId: campaign.campaign_id, externalAdsetId: adgroup.adgroup_id, ads };
  }

  async setActive(ids: ExternalIds, active: boolean) {
    const operation_status = active ? "ENABLE" : "DISABLE";
    await this.call("/campaign/status/update/", { campaign_ids: [ids.externalCampaignId], operation_status });
    await this.call("/adgroup/status/update/", { adgroup_ids: [ids.externalAdsetId], operation_status });
    if (ids.externalAdIds.length) await this.call("/ad/status/update/", { ad_ids: ids.externalAdIds, operation_status });
  }

  async pauseAd(externalAdId: string) {
    await this.call("/ad/status/update/", { ad_ids: [externalAdId], operation_status: "DISABLE" });
  }

  async setDailyBudget(ids: Pick<ExternalIds, "externalCampaignId" | "externalAdsetId">, dailyBudget: number) {
    await this.call("/adgroup/budget/update/", { budget: [{ adgroup_id: ids.externalAdsetId, budget: dailyBudget }] });
  }

  async fetchDailyMetrics(since: string, until: string): Promise<DailyAdMetrics[]> {
    type R = { dimensions: { ad_id: string; stat_time_day: string }; metrics: Record<string, string> };
    const out: DailyAdMetrics[] = [];
    let page = 1;
    for (;;) {
      const data = await this.call<{ list: R[]; page_info: { total_page: number } }>(
        "/report/integrated/get/",
        {
          report_type: "BASIC",
          data_level: "AUCTION_AD",
          dimensions: ["ad_id", "stat_time_day"],
          metrics: ["spend", "impressions", "clicks", "frequency", "web_event_add_to_cart", "initiate_checkout", "complete_payment", "total_complete_payment_rate", "complete_payment_roas"],
          start_date: since,
          end_date: until,
          page,
          page_size: 1000,
        },
        "GET",
      );
      for (const r of data.list) {
        const spend = Number(r.metrics.spend ?? 0);
        out.push({
          externalAdId: r.dimensions.ad_id,
          date: r.dimensions.stat_time_day.slice(0, 10),
          spend,
          impressions: Number(r.metrics.impressions ?? 0),
          clicks: Number(r.metrics.clicks ?? 0),
          addToCarts: Number(r.metrics.web_event_add_to_cart ?? 0),
          checkouts: Number(r.metrics.initiate_checkout ?? 0),
          purchases: Number(r.metrics.complete_payment ?? 0),
          revenue: spend * Number(r.metrics.complete_payment_roas ?? 0),
          ...(r.metrics.frequency ? { frequency: Number(r.metrics.frequency) } : {}),
        });
      }
      if (page >= (data.page_info?.total_page ?? 1)) break;
      page++;
    }
    return out;
  }
}
