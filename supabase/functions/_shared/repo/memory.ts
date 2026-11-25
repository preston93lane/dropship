import type { ListFilter, Repo, Row } from "./types.ts";

/** In-memory Repo for tests and local dry runs. Mirrors the SupabaseRepo semantics. */
export class MemoryRepo implements Repo {
  readonly tables = new Map<string, Map<string, Row>>();
  readonly settings = new Map<string, unknown>();
  readonly settingsHistory: { key: string; value: unknown; by: string; reason?: string }[] = [];
  private seq = 0;
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  private t(table: string): Map<string, Row> {
    let m = this.tables.get(table);
    if (!m) {
      m = new Map();
      this.tables.set(table, m);
    }
    return m;
  }

  async get<T extends Row = Row>(table: string, id: string): Promise<T | null> {
    const row = this.t(table).get(id);
    return row ? (structuredClone(row) as T) : null;
  }

  async list<T extends Row = Row>(table: string, f: ListFilter = {}): Promise<T[]> {
    let rows = [...this.t(table).values()];
    for (const [k, v] of Object.entries(f.eq ?? {})) rows = rows.filter((r) => r[k] === v);
    for (const [k, vs] of Object.entries(f.in ?? {})) rows = rows.filter((r) => vs.includes(r[k]));
    for (const [k, v] of Object.entries(f.gte ?? {})) rows = rows.filter((r) => (r[k] as never) >= (v as never));
    for (const [k, v] of Object.entries(f.lte ?? {})) rows = rows.filter((r) => (r[k] as never) <= (v as never));
    if (f.order) {
      const { column, ascending = true } = f.order;
      rows.sort((a, b) => {
        const x = a[column] as never;
        const y = b[column] as never;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (f.limit !== undefined) rows = rows.slice(0, f.limit);
    return structuredClone(rows) as T[];
  }

  async insert<T extends Row = Row>(table: string, row: Row): Promise<T> {
    const id = (row.id as string | undefined) ?? (table === "decisions" || table === "costs" || table === "product_events" ? String(++this.seq) : crypto.randomUUID());
    const ts = this.now().toISOString();
    const full: Row = { created_at: ts, updated_at: ts, ...row, id };
    const tbl = this.t(table);
    for (const uniq of ["dedupe_key", "idempotency_key"]) {
      const v = full[uniq];
      if (v !== undefined && v !== null && [...tbl.values()].some((r) => r[uniq] === v)) {
        throw new Error(`duplicate key value violates unique constraint (${table}.${uniq})`);
      }
    }
    tbl.set(id, full);
    return structuredClone(full) as T;
  }

  async update<T extends Row = Row>(table: string, id: string, patch: Row): Promise<T> {
    const tbl = this.t(table);
    const cur = tbl.get(id);
    if (!cur) throw new Error(`${table} ${id} not found`);
    const next = { ...cur, ...patch, updated_at: this.now().toISOString() };
    tbl.set(id, next);
    return structuredClone(next) as unknown as T;
  }

  async upsert(table: string, rows: Row[], onConflict: string): Promise<void> {
    const keys = onConflict.split(",").map((s) => s.trim());
    const tbl = this.t(table);
    for (const row of rows) {
      const k = keys.map((c) => String(row[c])).join("|");
      tbl.set(k, { ...(tbl.get(k) ?? {}), ...row });
    }
  }

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    return this.settings.has(key) ? (structuredClone(this.settings.get(key)) as T) : null;
  }

  async setSetting(key: string, value: unknown, by: string, reason?: string): Promise<void> {
    this.settings.set(key, structuredClone(value));
    this.settingsHistory.push(reason === undefined ? { key, value, by } : { key, value, by, reason });
  }

  async signUpload(path: string) {
    return { uploadUrl: `memory://upload/${path}`, publicUrl: `https://example.invalid/creatives/${path}`, path };
  }
}
