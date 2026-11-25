# Dropship AI

An operating system for a dropshipping business run by AI agents. Agents find products, write the
marketing, produce the ads (AI video, motion graphics, statics), list products on Shopify (and TikTok Shop),
buy ads on Meta and TikTok, watch the numbers, and improve themselves every week. Code holds the money, so
agents can only spend what your guardrails allow.

```
RESEARCH ──▶ PLAN ──▶ EXECUTE (create + list + launch) ──▶ ADAPT (kill · scale · refresh) ──▶ IMPROVE
   ▲                                                                                            │
   └──────────────── playbook · score weights · model registry · prompt proposals ◀────────────┘
```

| | |
|---|---|
| **Agents** (12) | orchestrator · product-analyst · trend-scout · marketing-strategist · creative-director · static-designer · video-producer · compliance-reviewer · store-manager · media-buyer · performance-analyst · self-improver (+2 planned: affiliate-manager, support-agent) |
| **Skills** (28) | research (product research, teardowns, suppliers, economics) · marketing (angles/offers, ad copy, scripts, product pages) · design (creative strategy, static ads, product imagery) · **video** (production pipeline, AI video generation, Remotion motion graphics, media tooling) · compliance · ads (Meta, TikTok, kill/scale) · store (Shopify, TikTok Shop) · ops (loops, gateway, reporting, retrospectives, prompt evolution, model scouting) |
| **Loops** | 8 scheduled Managed Agents deployments + a deterministic guardian every 30 minutes + event-driven wakeups |
| **Guardrails** | Autonomy levels L0-L3, spend caps, kill switch, spend guard, compliance gate, scoped keys, per-run LLM budgets, platform caps |

## Start here

1. **[docs/00-strategy.md](docs/00-strategy.md)**: what I recommend and why (read this first)
2. [docs/01-architecture.md](docs/01-architecture.md): how the pieces fit
3. [docs/02-operating-loops.md](docs/02-operating-loops.md): research → plan → execute → adapt → improve
4. [docs/03-costs-and-roi.md](docs/03-costs-and-roi.md): what it costs, what it's worth
5. [docs/04-roadmap.md](docs/04-roadmap.md): build it in phases, each with a definition of done
6. [docs/05-component-catalog.md](docs/05-component-catalog.md): every component and its status
7. [docs/06-guardrails-and-compliance.md](docs/06-guardrails-and-compliance.md): money, legal and security
8. [docs/07-setup.md](docs/07-setup.md): accounts, keys and deployment, step by step
9. [docs/research/2026-11-first-products-and-forecast.md](docs/research/2026-11-first-products-and-forecast.md): the first products to test, and what year one should look like financially

## Try it locally in 5 minutes (no accounts needed)

```bash
npm ci
npm test                       # decision engine + gateway end-to-end tests
npm run demo                   # a realistic week of fake business data
npm run dev:gateway            # API + console at http://localhost:8787/console (admin key: dev-admin-key)
```

```bash
npm run loop -- research       # runs the RESEARCH loop in Claude Code against the local gateway
```

**Starting this weekend? Follow [docs/WEEKEND-START.md](docs/WEEKEND-START.md).** **New here? Read [docs/OPERATOR-GUIDE.md](docs/OPERATOR-GUIDE.md) first.** It covers what's built, how to use it,
what's needed from you, and the best way to run the whole thing.

Without `FAL_KEY` the media scripts run in dry-run mode (placeholder media), so the creative pipeline can be
exercised for free. Render the motion templates:

```bash
cd .claude/skills/motion-graphics/remotion && npm ci && ./make-demo-assets.sh
npx remotion render src/index.ts AdVideo out/ad.mp4 --props=props/example-ad.json
```

## What's built vs. planned

- ✅ **Built and verified here**: decision engine (economics, scoring, Bayesian kill/scale rules, Thompson allocation, autonomy policy, lifecycle); database schema (run on Postgres); gateway API with scoped keys and action queue; human console with 7-day P&L; guardian loop; Telegram one-tap approvals and `/kill`; Shopify order webhooks and true P&L; independent compliance judge; creative insights; dry-run adapters; local dev gateway, demo data, loop launcher and smoke test; media pipeline (dry-run end to end, model registry checked against fal); Remotion and static templates (rendered and QA'd); all agents, skills, environments and deployments (structure tested).
- 🟡 **Built, needs your live verification**: Shopify, Meta, TikTok and CJ adapters; fal model endpoints; notifications; Managed Agents apply.
- 🔲 **Planned and specified**: automatic LLM cost sync, creative previews in Telegram, AI-label via API, ASC scaling, TikTok Shop GMV Max, affiliate and support agents, retention flows. See the catalog.

## Repository map

```
agents/                  Managed Agents definitions (source of truth) + planned/
.claude/skills/          28 skills (shared by cloud agents and local Claude Code)
.claude/agents/          generated Claude Code mirror of agents/ (npm run agents:sync-claude-code)
environments/ vaults/ memory_stores/ deployments/   Managed Agents infrastructure (npm run agents:apply)
supabase/
  migrations/            database schema
  functions/gateway/     agent + human API (Edge Function)
  functions/guardian/    30-minute control loop (Edge Function)
  functions/_shared/     core/ (pure logic) · app/ (gateway, guardian, console) · adapters/ · repo/ · edge/
  sql/                   pg_cron schedule
playbook/                seed knowledge for the playbook memory store
evals/                   eval cases that gate prompt changes
scripts/                 dev gateway, Claude Code sync, proposals, playbook seeding, economics CLI
docs/                    strategy, architecture, loops, costs, roadmap, catalog, guardrails, setup
```

## The deal with autonomy

The system starts at **L1**: agents do the work and prepare everything, and you approve spend from your
phone. Pausing and killing are always automatic. The console recommends a higher level once the track record
supports it (14+ days, 90%+ of proposals approved unchanged, zero violations). Set your platform spending
limits on day one; they are the guardrail that holds even if everything else fails.
