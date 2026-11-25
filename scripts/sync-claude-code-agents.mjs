#!/usr/bin/env node
/**
 * One source of truth for agent prompts: agents/*.md (Managed Agents format, applied with `ant apply`).
 * This script mirrors them into .claude/agents/*.md (Claude Code subagent format) so you can run any
 * agent interactively in Claude Code ("use the product-analyst to research pet products") before the
 * autonomous cloud deployment exists. Skills are shared directly from .claude/skills/.
 *
 *   npm run agents:sync-claude-code
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_PREAMBLE = `> **Local mode (Claude Code).** Same role as the cloud agent, with these substitutions:
> - Gateway: \`$GATEWAY_URL\` (default \`http://localhost:8787\` from \`npm run dev:gateway\`), key in \`$GATEWAY_KEY\`
>   (\`dev-agent-key\` for the dev gateway). Use the \`gw\` helper from the gateway-api skill.
> - Playbook: read \`./playbook/\` instead of \`/mnt/memory/playbook/\`.
> - Media keys (\`FAL_KEY\`) come from your shell environment / \`.env\`. Without them, media scripts run with \`--dry-run\`.
> - Subagents named below are available as Claude Code subagents with the same names.
`;

export function parseAgent(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("missing frontmatter");
  const fm = m[1];
  const get = (key) => fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  const modelLine = get("model") ?? "";
  const modelId = modelLine.match(/id:\s*([\w.-]+)/)?.[1] ?? modelLine;
  return { name: get("name"), description: get("description"), modelId, body: m[2].trim() };
}

export function toClaudeCode(agent) {
  const alias = agent.modelId.includes("opus") ? "opus" : agent.modelId.includes("haiku") ? "haiku" : "sonnet";
  return `---\nname: ${agent.name}\ndescription: ${agent.description}\nmodel: ${alias}\n---\n\n<!-- GENERATED from agents/${agent.name}.md by scripts/sync-claude-code-agents.mjs. Edit the source, not this file. -->\n\n${LOCAL_PREAMBLE}\n${agent.body}\n`;
}

export function syncAll(srcDir = "agents", outDir = ".claude/agents") {
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith(".md")) continue;
    const agent = parseAgent(readFileSync(join(srcDir, f), "utf8"));
    writeFileSync(join(outDir, `${agent.name}.md`), toClaudeCode(agent));
    written.push(agent.name);
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = syncAll();
  console.log(`synced ${names.length} agents to .claude/agents: ${names.join(", ")}`);
}
