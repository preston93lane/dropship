#!/usr/bin/env node
/**
 * Run any loop by hand in Claude Code, with the exact kickoff the cloud deployment uses.
 *
 *   npm run loop -- research        (research | plan | create | execute | adapt | report | improve | strategy)
 *   npm run loop -- create --print  (just print the prompt)
 *
 * Uses the local dev gateway unless GATEWAY_URL/GATEWAY_KEY are already set.
 */
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const loop = process.argv[2];
const files = readdirSync("deployments").filter((f) => f.endsWith(".md"));
const file = files.find((f) => f.startsWith(loop + "-"));
if (!loop || !file) {
  console.error("usage: npm run loop -- <" + files.map((f) => f.split("-")[0]).join("|") + "> [--print]");
  process.exit(2);
}
const text = readFileSync("deployments/" + file, "utf8");
const agent = text.match(/^agent: \.\.\/agents\/([\w-]+)\.md/m)?.[1];
const kickoff = text.split(/\n---\n/).slice(1).join("\n---\n").trim();
const prompt =
  "Use the " + agent + " subagent for this. " + kickoff +
  "\n\n(Local mode: gateway at $GATEWAY_URL; playbook in ./playbook/; media scripts run dry without FAL_KEY.)";

if (process.argv.includes("--print")) {
  console.log(prompt);
  process.exit(0);
}
const env = { ...process.env, GATEWAY_URL: process.env.GATEWAY_URL ?? "http://localhost:8787", GATEWAY_KEY: process.env.GATEWAY_KEY ?? "dev-agent-key" };
console.log("> " + agent + " · " + loop.toUpperCase() + " loop · gateway " + env.GATEWAY_URL);
console.log("  (start `npm run dev:gateway` in another terminal if you're using the local gateway)\n");
const r = spawnSync("claude", [prompt], { stdio: "inherit", env });
if (r.error) {
  console.error("Claude Code (`claude`) not found on PATH. Paste this into Claude Code instead:\n");
  console.log(prompt);
  process.exit(1);
}
process.exit(r.status ?? 0);
