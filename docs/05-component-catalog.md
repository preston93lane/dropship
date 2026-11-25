# 05 · Component catalog

Every piece of the system, its status, and what it takes to finish it. Implement in roadmap order (`04-roadmap.md`).

**Status key**: ✅ built and verified here (tests, renders or type checks) · 🟡 built, needs live verification
against a real account or API · 📝 written, ready to apply or run · 🔲 planned (specified here)

## Decision engine (`supabase/functions/_shared/core/`)

| Id | Component | Status | Files | Notes / how verified |
|---|---|---|---|---|
| C01 | Unit economics | ✅ | `economics.ts` | Contribution, breakeven/target CPA and ROAS, price suggestion, margin gates. Unit tests + `npm run economics` |
| C02 | Product scoring + calibration | ✅ | `scoring.ts` | Weighted rubric, hard gates, penalties, verdicts; bounded weight calibration from outcomes. Tests |
| C03 | Kill/scale/refresh rules | ✅ | `rules.ts` | Bayesian P(CPA < X) via Beta posterior; CTR/ATC/no-sale gates; fatigue; product rollup. Beta CDF checked against numerical integration |
| C04 | Budget allocation | ✅ | `allocation.ts` | Thompson sampling with exploration share and min/max caps. Tests |
| C05 | Autonomy policy | ✅ | `policy.ts` | auto/approval/reject per action, caps, kill switch, compliance requirement, autonomy recommendation. Tests |
| C06 | Lifecycle state machines | ✅ | `lifecycle.ts` | Product + creative transitions and owners. Tests |

## Gateway, guardian, data (`supabase/`)

| Id | Component | Status | Files | Notes / how verified |
|---|---|---|---|---|
| C07 | Database schema | ✅ | `migrations/20261125000000_init.sql` | 17 tables, views, triggers, RLS lockdown, storage bucket, seeds. Ran on Postgres (PGlite) with inserts, constraints and views |
| C08 | Gateway API | ✅ | `_shared/app/gateway.ts`, `gateway/index.ts` | ~40 routes; end-to-end tested in memory; Deno type-checked against real supabase-js |
| C09 | Scoped agent keys | ✅ | `gateway.ts` (`requiredScope`) | research / creative / ops / improve scopes. Tested |
| C10 | Action pipeline | ✅ | `_shared/app/actions.ts` | Enrichment from DB (agents can't misreport current budget or price), policy, approval queue, execution, effects. Tested |
| C11 | Human console | ✅ | `_shared/app/console.ts` | Approvals, products awaiting launch, guardrails, kill switch, proposals, latest report, logs. Rendered and tested over HTTP |
| C12 | Guardian loop | ✅ | `_shared/app/guardian.ts`, `guardian/index.ts` | Metrics sync, spend guard, ad rules, product verdicts, briefs, notifications, event wakeups. Tested |
| C13 | Guardian schedule (pg_cron) | 📝 | `sql/schedule_guardian.sql` | Run once in the SQL editor after deploy |
| C14 | Shopify adapter | 🟡 | `adapters/shopify.ts` | productSet (DRAFT), productUpdate, productVariantsBulkUpdate, publishablePublish. **Verify on a dev store** with your pinned API version |
| C15 | Meta adapter | 🟡 | `adapters/meta.ts` | Campaign/ad set/creative/ad (PAUSED), video and image upload, status, budget, insights with action mapping. **Verify in a test ad account** |
| C16 | TikTok adapter | 🟡 | `adapters/tiktok.ts` | v1.3 campaign/adgroup/ad, video upload by URL, status, budget, reports. **Verify enum values** |
| C17 | CJ sample orders | 🟡 | `adapters/index.ts` (`CjSupplier`) | createOrderV2 with payType 3 (create only; you pay in CJ). Verify payload |
| C18 | Notifications | 🟡 | `MultiNotifier` | Telegram + Slack/Discord-style webhook. Send a test message |
| C19 | Event-driven loop wakeups | 🟡 | `_shared/edge/triggers.ts` | Anthropic SDK `beta.deployments.run`; Deno type-checked. Needs deployment ids |
| C20 | Local dev gateway | ✅ | `scripts/dev-gateway.ts` | Full API + console on :8787, in-memory DB persisted to `data/` |
| C21 | Storage repo (Supabase) | 🟡 | `_shared/repo/supabase.ts` | Type-checked against real supabase-js; exercise it after deploy |

## Agents and orchestration

| Id | Component | Status | Files | Notes |
|---|---|---|---|---|
| C22 | 12 agent definitions | 📝 | `agents/*.md` | Prompts, models, tools, skills, rosters. Structure validated by tests; apply with `npm run agents:apply` |
| C23 | Environments (4) | 📝 | `environments/*.yaml` | Replace `YOUR_PROJECT_REF` |
| C24 | Vaults (4) + credentials | 📝 | `vaults/*.yaml` | Containers only; add credentials per `07-setup.md` |
| C25 | Playbook memory store + seed | 📝 | `memory_stores/playbook.yaml`, `playbook/`, `scripts/seed-playbook.ts` | `npm run playbook:seed` after the first apply |
| C26 | 8 loop deployments | 📝 | `deployments/*.md` | Fill in vault ids; test with manual runs |
| C27 | Claude Code mirror | ✅ | `scripts/sync-claude-code-agents.mjs`, `.claude/agents/` | CI fails if out of date |
| C28 | CI | 🟡 | `.github/workflows/ci.yml` | Typecheck, tests, Deno check, mirror check. Runs on first push |
| C29 | Agents apply workflow | 🟡 | `.github/workflows/agents.yml` | Dry-run plan on PRs; apply on manual dispatch. Needs the `ANTHROPIC_API_KEY` secret |

## Skills (`.claude/skills/`)

| Id | Skill | Status | Used by |
|---|---|---|---|
| S01 | gateway-api (+ `gw` helper) | ✅ (tested against the dev gateway) | all |
| S02 | business-profile | 📝 **fill in** | all |
| S03 | run-cycle | ✅ | orchestrator |
| S04 | unit-economics | ✅ | orchestrator, analysts, store, buyer |
| S05 | product-research (+ sources, rubric) | ✅ | product-analyst, trend-scout |
| S06 | competitor-ad-teardown | ✅ | product-analyst, creative-director |
| S07 | supplier-sourcing | ✅ | product-analyst |
| S08 | offer-and-angle-strategy | ✅ | marketing-strategist |
| S09 | ad-copywriting | ✅ | marketing-strategist |
| S10 | video-ad-scripting | ✅ | strategist, creative-director, producer |
| S11 | pdp-copywriting | ✅ | strategist, store-manager |
| S12 | creative-strategy | ✅ | creative-director |
| S13 | static-ad-design (+ 5 templates, renderer) | ✅ (rendered at 3 sizes with QA) | static-designer |
| S14 | product-image-generation | ✅ (doc); 🟡 live models | static-designer, video-producer |
| S15 | video-ad-production | ✅ | video-producer |
| S16 | ai-video-generation | ✅ (doc); 🟡 live models | video-producer |
| S17 | motion-graphics (+ Remotion: AdVideo, ProductShowcase, KineticHook) | ✅ (rendered, QA'd) | video-producer |
| S18 | media-pipeline (fal_run, voiceover, assemble, finalize, qa_video, upload, registry) | ✅ dry-run end to end; registry endpoints checked on fal 2026-11-25 (some input names still 🟡) | producers, compliance |
| S19 | ad-compliance | ✅ (+ 14 eval cases) | compliance-reviewer, creative-director |
| S20 | meta-ads | ✅ | media-buyer |
| S21 | tiktok-ads | ✅ | media-buyer |
| S22 | kill-scale-rules | ✅ | media-buyer, orchestrator |
| S23 | shopify-listing | ✅ | store-manager |
| S24 | tiktok-shop | ✅ | store-manager, affiliate-manager |
| S25 | performance-reporting | ✅ | performance-analyst, self-improver |
| S26 | retrospective | ✅ | self-improver |
| S27 | prompt-evolution | ✅ | self-improver |
| S28 | model-scouting | ✅ | self-improver |

## Planned components 🔲

| Id | Component | Why | Sketch | Phase |
|---|---|---|---|---|
| P01 | Shopify orders webhook → `orders` | True P&L, refunds, attribution reconciliation | Edge function `shopify-webhooks` (HMAC verify) upserting `orders`; report uses it over platform attribution | 6 |
| P02 | Server-side compliance judge | Separation of duties: an independent model checks every creative before `approved` | In `/v1/creatives/:id/compliance`, call Claude (Sonnet) with the checklist + keyframes; require both verdicts to pass | 6 |
| P03 | Telegram approve/reject buttons | Faster approvals from the phone | Inline keyboard callback → `/telegram/webhook` → `decideAction` | 5 |
| P04 | Meta Advantage+ Sales scaling structure | Better scaling at volume | New action `ads.create_scaling_asc`; policy L3 | 7 |
| P05 | TikTok Shop listing completion + GMV Max | Shop channel | Seller Center API for attributes; GMV Max campaign action | 7 |
| P06 | affiliate-manager agent + creator tables | Highest-ROI TikTok Shop growth | `agents/planned/affiliate-manager.md`; tables `creators`, `collabs` | 7 |
| P07 | support-agent + helpdesk | Fewer chargebacks, more reviews | `agents/planned/support-agent.md`; Shopify Inbox/Gmail integration | 7 |
| P08 | Email/SMS retention flows | Lifts LTV and blended ROAS | Klaviyo flows (abandoned checkout, post-purchase, winback); the `marketing:email-sequence` skill can draft them | 7 |
| P09 | Creative attribute analytics view | Faster retros | SQL view joining creatives (format, hook_type, angle) with metrics | 6 |
| P10 | Real UGC creators for winners | Real footage beats AI for demos | Brief generator + platform (e.g. Billo/Insense) outreach; human-approved | 7 |
| P11 | Multi-store / multi-niche | Diversification | `store_id` on core tables + per-store business profiles | 7+ |
| P12 | Research data integrations | Better proof signals | FastMoss API / Apify ad-library actor as gateway read endpoints (keys stay server-side) | 5-6 |
| P13 | Landing page experiments | Conversion lifts | Shopify theme variants or a testing app; `experiments` table already exists | 6 |
| P14 | Live KPI dashboard | At-a-glance health | Read-only dashboard over the views; or a Claude artifact reading the gateway | 6 |
| P15 | Parallel cloud rendering | Throughput at scale | Remotion Lambda or Cloud Run; only when renders > ~50/day | 7+ |
