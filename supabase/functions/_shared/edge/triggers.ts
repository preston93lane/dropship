// Deno-only (npm: specifier): attaches event-driven loop triggers to the integrations.
// When the guardian sees a winner or creative fatigue it can run a Managed Agents
// deployment immediately (e.g. the CREATE loop) instead of waiting for the next cron.
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import type { Integrations } from "../adapters/types.ts";

export function attachLoopTriggers(integrations: Integrations, env: (k: string) => string | undefined): Integrations {
  const apiKey = env("ANTHROPIC_API_KEY");
  const deployments = env("LOOP_DEPLOYMENTS_JSON"); // {"create":"depl_...","adapt":"depl_..."}
  if (!apiKey || !deployments) return integrations;
  const client = new Anthropic({ apiKey });
  const map = JSON.parse(deployments) as Record<string, string>;
  integrations.triggerLoop = async (loop: string, reason: string) => {
    const id = map[loop];
    if (!id) return;
    try {
      const run = await client.beta.deployments.run(id);
      console.log(`[trigger] ${loop} (${reason}) -> session ${run.session_id ?? "pending"}`);
    } catch (e) {
      // A failed wakeup must never break the guardian; the cron run will pick the work up.
      console.error(`[trigger] ${loop} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return integrations;
}
