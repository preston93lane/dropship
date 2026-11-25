// Supabase Edge Function entrypoint: the agent/human gateway.
// Deploy: supabase functions deploy gateway --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { buildIntegrations } from "../_shared/adapters/index.ts";
import { createGateway } from "../_shared/app/gateway.ts";
import { SupabaseRepo } from "../_shared/repo/supabase.ts";

const env = (k: string) => Deno.env.get(k);
const required = (k: string) => {
  const v = env(k);
  if (!v) throw new Error(`missing required secret ${k}`);
  return v;
};

const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const consoleUrl = env("CONSOLE_URL");
const deps = {
  repo: new SupabaseRepo(db),
  integrations: buildIntegrations(env),
  now: () => new Date(),
  ...(consoleUrl ? { consoleUrl } : {}),
};

const agentKey = env("GATEWAY_AGENT_KEY"); // optional full-access key (avoid in production)
const scoped = env("GATEWAY_AGENT_KEYS_JSON"); // {"<key>": ["read","research","report"], ...}
const handle = createGateway(deps, {
  ...(agentKey ? { agentKey } : {}),
  ...(scoped ? { agentKeys: JSON.parse(scoped) } : {}),
  adminKey: required("GATEWAY_ADMIN_KEY"),
  cronSecret: required("GUARDIAN_CRON_SECRET"),
});

Deno.serve(handle);
