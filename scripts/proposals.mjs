#!/usr/bin/env node
/**
 * Pull human-approved improvement proposals from the gateway into the working tree for review as a git diff.
 *
 *   GATEWAY_URL=... GATEWAY_ADMIN_KEY=... npm run proposals:pull            # write files, show what changed
 *   ... npm run proposals:pull -- --mark-applied                            # after you commit, mark them applied
 *
 * Only paths under agents/, .claude/skills/, playbook/ and docs/ may be written. Review with `git diff`,
 * run `npm test`, commit, then `npm run agents:apply` to ship the new agent/skill versions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, normalize } from "node:path";

const url = process.env.GATEWAY_URL;
const key = process.env.GATEWAY_ADMIN_KEY;
if (!url || !key) {
  console.error("set GATEWAY_URL and GATEWAY_ADMIN_KEY");
  process.exit(2);
}
const ALLOWED = ["agents/", ".claude/skills/", "playbook/", "docs/"];
const api = async (method, path, body) => {
  const res = await fetch(url.replace(/\/$/, "") + path, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-agent": "operator" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
};

const proposals = await api("GET", "/v1/proposals?status=approved");
if (proposals.length === 0) console.log("no approved proposals");
for (const p of proposals) {
  console.log(`\n# ${p.title} (${p.kind}, ${p.id})\n${p.rationale}`);
  for (const f of p.files ?? []) {
    const path = normalize(f.path);
    if (path.startsWith("..") || !ALLOWED.some((a) => path.startsWith(a))) {
      console.log(`  SKIPPED ${f.path} (outside allowed directories)`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content);
    console.log(`  wrote ${path}`);
  }
  if (process.argv.includes("--mark-applied")) {
    await api("PATCH", `/v1/proposals/${p.id}`, { status: "applied" });
    console.log("  marked applied");
  }
}
console.log("\nReview with `git diff`, run `npm test`, commit, then `npm run agents:apply`.");
