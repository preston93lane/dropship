/**
 * Local gateway: the full agent API + console on http://localhost:8787 with an
 * in-memory database (persisted to data/dev-db.json) and dry-run integrations.
 * Use it to exercise every skill and agent before Supabase or any ad account exists.
 *
 *   npm run dev:gateway
 *   export GATEWAY_URL=http://localhost:8787 GATEWAY_AGENT_KEY=dev-agent-key
 *   curl -s -H "Authorization: Bearer $GATEWAY_AGENT_KEY" $GATEWAY_URL/v1/summary
 *   open http://localhost:8787/console   (admin key: dev-admin-key)
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MemoryRepo } from "../supabase/functions/_shared/repo/memory.ts";
import { buildIntegrations } from "../supabase/functions/_shared/adapters/index.ts";
import { createGateway } from "../supabase/functions/_shared/app/gateway.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = "data/dev-db.json";
const repo = new MemoryRepo();

if (existsSync(DB_FILE)) {
  const saved = JSON.parse(readFileSync(DB_FILE, "utf8")) as { tables: Record<string, Record<string, unknown>[]>; settings: Record<string, unknown> };
  for (const [t, rows] of Object.entries(saved.tables)) repo.tables.set(t, new Map(rows.map((r) => [String(r.id ?? `${r.ad_id}|${r.date}`), r])));
  for (const [k, v] of Object.entries(saved.settings)) repo.settings.set(k, v);
}
const persist = () => {
  mkdirSync("data", { recursive: true });
  const tables = Object.fromEntries([...repo.tables].map(([t, m]) => [t, [...m.values()]]));
  writeFileSync(DB_FILE, JSON.stringify({ tables, settings: Object.fromEntries(repo.settings) }, null, 1));
};

const env = (k: string) => (k === "DRY_RUN" ? "true" : process.env[k]);
const handle = createGateway(
  { repo, integrations: buildIntegrations(env), now: () => new Date(), consoleUrl: `http://localhost:${PORT}/console` },
  {
    agentKey: process.env.GATEWAY_AGENT_KEY ?? "dev-agent-key",
    adminKey: process.env.GATEWAY_ADMIN_KEY ?? "dev-admin-key",
    cronSecret: process.env.GUARDIAN_CRON_SECRET ?? "dev-cron",
  },
);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0;
  const response = await handle(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, ...(hasBody ? { body: Buffer.concat(chunks) } : {}) }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  if (req.method !== "GET") persist();
}).listen(PORT, () => console.log(`dev gateway on http://localhost:${PORT}  (console: /console, admin key: dev-admin-key)`));
