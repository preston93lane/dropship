// Supabase Edge Function entrypoint: the deterministic guardian loop.
// Invoked by pg_cron every 30 minutes (see supabase/sql/schedule_guardian.sql).
// Deploy: supabase functions deploy guardian --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { buildIntegrations } from "../_shared/adapters/index.ts";
import { runGuardian } from "../_shared/app/guardian.ts";
import { SupabaseRepo } from "../_shared/repo/supabase.ts";

const env = (k: string) => Deno.env.get(k);
const secret = env("GUARDIAN_CRON_SECRET") ?? "";

Deno.serve(async (req) => {
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const consoleUrl = env("CONSOLE_URL");
  const report = await runGuardian({
    repo: new SupabaseRepo(db),
    integrations: buildIntegrations(env),
    now: () => new Date(),
    ...(consoleUrl ? { consoleUrl } : {}),
  });
  return new Response(JSON.stringify(report, null, 2), { headers: { "content-type": "application/json" } });
});
