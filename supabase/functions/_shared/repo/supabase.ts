import type { ListFilter, Repo, Row } from "./types.ts";

/**
 * Structural type for the bits of supabase-js we use, so this file type-checks
 * in Node without the npm package. The Edge Function entrypoint passes a real
 * `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` instance.
 */
// deno-lint-ignore no-explicit-any
type Query = any;
export interface SupabaseLike {
  from(table: string): Query;
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(path: string): Promise<{ data: { signedUrl: string; path: string } | null; error: unknown }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

function check<T>(res: { data: T; error: unknown }, what: string): T {
  if (res.error) {
    const msg = typeof res.error === "object" && res.error && "message" in res.error ? (res.error as { message: string }).message : String(res.error);
    throw new Error(`${what}: ${msg}`);
  }
  return res.data;
}

export class SupabaseRepo implements Repo {
  private readonly db: SupabaseLike;
  constructor(db: SupabaseLike) {
    this.db = db;
  }

  async get<T extends Row = Row>(table: string, id: string): Promise<T | null> {
    const res = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    return check(res, `get ${table}`) as T | null;
  }

  async list<T extends Row = Row>(table: string, f: ListFilter = {}): Promise<T[]> {
    let q = this.db.from(table).select("*");
    for (const [k, v] of Object.entries(f.eq ?? {})) q = q.eq(k, v);
    for (const [k, vs] of Object.entries(f.in ?? {})) q = q.in(k, vs as unknown[]);
    for (const [k, v] of Object.entries(f.gte ?? {})) q = q.gte(k, v);
    for (const [k, v] of Object.entries(f.lte ?? {})) q = q.lte(k, v);
    if (f.order) q = q.order(f.order.column, { ascending: f.order.ascending ?? true });
    q = q.limit(f.limit ?? 500);
    return check(await q, `list ${table}`) as T[];
  }

  async insert<T extends Row = Row>(table: string, row: Row): Promise<T> {
    return check(await this.db.from(table).insert(row).select("*").single(), `insert ${table}`) as T;
  }

  async update<T extends Row = Row>(table: string, id: string, patch: Row): Promise<T> {
    return check(await this.db.from(table).update(patch).eq("id", id).select("*").single(), `update ${table}`) as T;
  }

  async upsert(table: string, rows: Row[], onConflict: string): Promise<void> {
    if (rows.length === 0) return;
    check(await this.db.from(table).upsert(rows, { onConflict }), `upsert ${table}`);
  }

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    const res = await this.db.from("settings").select("value").eq("key", key).maybeSingle();
    const row = check(res, `get setting ${key}`) as { value: T } | null;
    return row ? row.value : null;
  }

  async setSetting(key: string, value: unknown, by: string, reason?: string): Promise<void> {
    check(
      await this.db.from("settings").upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "key" }),
      `set setting ${key}`,
    );
    check(await this.db.from("settings_history").insert({ key, value, changed_by: by, reason: reason ?? null }), "settings history");
  }

  async signUpload(path: string) {
    const bucket = this.db.storage.from("creatives");
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new Error(`signed upload failed: ${String(error)}`);
    return { uploadUrl: data.signedUrl, publicUrl: bucket.getPublicUrl(path).data.publicUrl, path: data.path };
  }
}
