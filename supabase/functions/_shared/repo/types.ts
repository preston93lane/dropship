/**
 * Minimal data-access interface. Two implementations:
 *  - MemoryRepo: tests and local dry runs (no database needed)
 *  - SupabaseRepo: production (Postgres via supabase-js, service role)
 * Keeping the surface tiny means the gateway logic is fully testable in Node.
 */

export type Row = Record<string, unknown>;

export interface ListFilter {
  eq?: Record<string, unknown>;
  in?: Record<string, readonly unknown[]>;
  gte?: Record<string, unknown>;
  lte?: Record<string, unknown>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface Repo {
  get<T extends Row = Row>(table: string, id: string): Promise<T | null>;
  list<T extends Row = Row>(table: string, filter?: ListFilter): Promise<T[]>;
  insert<T extends Row = Row>(table: string, row: Row): Promise<T>;
  update<T extends Row = Row>(table: string, id: string, patch: Row): Promise<T>;
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>;
  getSetting<T = unknown>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown, by: string, reason?: string): Promise<void>;
  /** Signed upload URL for the public `creatives` storage bucket. */
  signUpload(path: string): Promise<{ uploadUrl: string; publicUrl: string; path: string }>;
}

export interface Product extends Row {
  id: string;
  status: string;
  title: string;
  niche?: string | null;
  dedupe_key?: string | null;
  signals?: Row;
  components?: Record<string, number>;
  risk_flags?: Row;
  supplier?: {
    name?: string;
    url?: string;
    product_id?: string;
    variant_id?: string;
    cogs?: number;
    shipping_cost?: number;
    shipping_days?: number;
    warehouse_country?: string;
  };
  price?: number | null;
  economics?: Row | null;
  score?: number | null;
  test_budget?: number | null;
  shopify_product_id?: string | null;
  shopify_handle?: string | null;
  outcome?: string | null;
}

export interface Creative extends Row {
  id: string;
  product_id: string;
  status: string;
  format: string;
  asset_url?: string | null;
  thumbnail_url?: string | null;
  primary_text?: string | null;
  headline?: string | null;
  compliance?: { verdict?: string } | null;
}

export interface Campaign extends Row {
  id: string;
  product_id: string;
  channel: "meta" | "tiktok";
  phase: "testing" | "scaling";
  status: "paused" | "active" | "killed" | "completed";
  name: string;
  external_campaign_id?: string | null;
  external_adset_id?: string | null;
  daily_budget: number;
  landing_url?: string | null;
  last_budget_change_at?: string | null;
}

export interface Ad extends Row {
  id: string;
  campaign_id: string;
  product_id: string;
  creative_id: string;
  channel: string;
  external_ad_id?: string | null;
  status: "paused" | "active" | "killed";
  launched_at?: string | null;
}

export interface ActionRow extends Row {
  id: string;
  type: string;
  payload: Row;
  rationale?: string | null;
  requested_by: string;
  product_id?: string | null;
  status: string;
  policy: { decision: string; reasons: string[] };
  result?: Row | null;
  error?: string | null;
  dry_run: boolean;
}

export interface MetricsRow extends Row {
  ad_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  add_to_carts: number;
  purchases: number;
  revenue: number;
  frequency?: number | null;
}
