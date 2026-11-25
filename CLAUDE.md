# Dropship AI — working in this repo

An AI-agent operating system for a dropshipping business. Read `README.md` for the overview and
`docs/01-architecture.md` before changing structure.

## Layout

- `agents/*.md` — Managed Agents definitions (frontmatter = config, body = system prompt). **Source of truth.**
  `.claude/agents/` is generated from them: edit `agents/`, then `npm run agents:sync-claude-code`.
- `.claude/skills/*/SKILL.md` — skills shared by cloud agents (uploaded by `ant apply`) and local Claude Code.
- `environments/ vaults/ memory_stores/ deployments/` — Managed Agents infra, applied with `npm run agents:apply`.
- `supabase/functions/_shared/core/` — pure, tested business logic (economics, scoring, rules, allocation, policy, lifecycle).
- `supabase/functions/_shared/app/` — gateway API, guardian loop, console, Telegram, Shopify webhooks, P&L, insights, compliance-judge contract.
  `adapters/` — Shopify/Meta/TikTok/CJ/Telegram + dry-run twins. `edge/` — Deno-only code with `npm:` imports (SDK triggers, judge).
- `supabase/migrations/` — database schema. `playbook/` — seed knowledge. `evals/` — eval cases for prompt changes.

## Rules

- "LLMs decide, code enforces": money, spend caps, autonomy and compliance gates live in `core/policy.ts` and the
  gateway, never only in prompts. Do not move an enforcement rule into a prompt.
- `core/` stays dependency-free and runs in both Deno and Node (relative `.ts` imports, erasable TS syntax only).
- Edge-only code that needs `npm:` imports goes in `supabase/functions/_shared/edge/` (excluded from Node typecheck).
- Agent prompts: state the role, the loop, the standards and the handoff states; keep enforcement in code.
- Never weaken guardrails, compliance rules or claims rules to make a metric look better.
- Before committing: `npm run typecheck && npm test && npm run check:edge`, and re-sync `.claude/agents/`.

## Local mode

`npm run demo` seeds fake data; `npm run dev:gateway` serves the full API + console on :8787 with an in-memory DB
and dry-run integrations; `npm run loop -- <loop>` runs a loop in Claude Code against it.
