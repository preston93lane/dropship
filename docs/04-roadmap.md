# 04 · Roadmap: build it in phases

Each phase has a **definition of done** (DoD). Don't skip ahead: every phase is cheaper to debug than the next.
Component ids refer to `05-component-catalog.md`.

## Phase 0: Foundation ✅ (this repo)
Decision engine, gateway, guardian, schema, agents, skills, media pipeline, templates, docs, tests.
- [x] `npm test`, `npm run typecheck`, `npm run check:edge` all pass
- [x] Static, Remotion and ffmpeg renders verified locally

## Phase 1: Assisted research (days 1-3) · cost: Claude usage only
- [x] First-products research and a year-one forecast ([docs/research/2026-11-first-products-and-forecast.md](research/2026-11-first-products-and-forecast.md), `npm run forecast`)
- [ ] Choose the niche (recommended: dog owners' home and travel gear); fill in `.claude/skills/business-profile/SKILL.md` (brand, avatar, exclusions)
- [ ] Get US-warehouse supplier quotes for the 3 launch products against their walk-away landed costs; order samples
- [ ] `npm ci && npm run demo && npm run dev:gateway`; explore the console with demo data
- [ ] `npm run loop -- research` (runs the RESEARCH loop in Claude Code against the local gateway)
- [ ] Review candidates in the console (`http://localhost:8787/console`, key `dev-admin-key`)
- [ ] Tune `product-research` (sources, rubric anchors) where its judgment differs from yours
- **DoD**: 10 validated products, of which you'd personally launch at least 5.

## Phase 2: Creative factory (days 3-7) · cost: ~$20-50 of fal credits
- [ ] fal.ai account → prepaid credits, **auto-top-up off** → `export FAL_KEY=...`
- [ ] Verify the `models.json` endpoints flagged `verify: true` (open each fal model page; fix ids and input fields)
- [ ] `cd .claude/skills/motion-graphics/remotion && npm ci`
- [ ] In Claude Code: "act as the creative-director and run the CREATE loop for <product>"
- [ ] Watch every output; tune `creative-strategy`, `video-ad-scripting` and the templates to your taste and brand
- **DoD**: 10 approved creatives you'd be proud to run; ≤ $4 per video; compliance catches the planted bad cases in `evals/compliance`.

## Phase 3: Store + infrastructure (week 2) · cost: Shopify ~$30-40/mo
- [ ] Shopify store: theme, policies, reviews app, supplier app, FB & IG and TikTok channel apps (`docs/07-setup.md` §3)
- [ ] Supabase project: `supabase db push`, set secrets, deploy `gateway` + `guardian`, run `schedule_guardian.sql`
- [ ] Telegram bot with one-tap approvals (`docs/07-setup.md` → Telegram); open the console at `/functions/v1/gateway/console`
- [ ] Shopify order webhooks (true P&L) and `npm run smoke` against the deployed gateway
- [ ] With **DRY_RUN=false on a development store first**, create one draft listing through the gateway and verify it in Shopify admin (C14)
- **DoD**: draft listings created via the gateway; the console works on your phone; notifications arrive.

## Phase 4: Paid tests at autonomy L1 (weeks 3-4) · cost: $1,500-3,000 of ad spend over the first 2 months
- [ ] Meta Business Manager, domain verification, pixel + Conversions API, **ad account spending limit**, system-user token (C15)
- [ ] Verify the Meta adapter in a test campaign: create paused → activate → budget → pause → insights sync
- [ ] Set guardrails in the console: `maxDailyAdSpend`, per-ad-set cap, tests/day
- [ ] Launch 3-4 product tests; approve activations from your phone
- [ ] Compare each guardian decision with your own judgment; tune `rules` (setting) if they systematically differ
- **DoD**: 3+ completed product tests; guardian decisions you'd have made; no policy surprises.

## Phase 5: Cloud autonomy (month 2) · cost: machine Lean → Standard
- [ ] Install `ant` (≥ 1.40); fill the `YOUR_PROJECT_REF` placeholders; `npm run agents:plan`, then `npm run agents:apply`
- [ ] Vault credentials (per-loop scoped `GATEWAY_KEY`s, `FAL_KEY`); put the vault ids in `deployments/*.md`; apply
- [ ] `npm run playbook:seed`
- [ ] Test every loop with a manual deployment run before relying on the schedule
- [ ] Set `ANTHROPIC_API_KEY` + `LOOP_DEPLOYMENTS_JSON` on the gateway for event wakeups (C19)
- [ ] Optional: TikTok Ads (C16) with its own verification pass
- **DoD**: 14 days of loops with no manual steps other than approvals; daily reports accurate; the console recommends L2.

## Phase 6: Self-improvement (months 2-3)
- [ ] Weekly IMPROVE runs; review proposals in the console; `npm run proposals:pull`, diff, test, merge, apply
- [ ] Grow `evals/compliance` from real disapprovals; build the product-scoring backtest once ≥ 6 winners exist
- [x] Shopify orders webhook → `orders` table for true P&L and refund tracking (built; connect it in Phase 3)
- [x] Server-side compliance judge in the gateway (built; turns on with `ANTHROPIC_API_KEY`)
- **DoD**: first eval-backed proposal merged; calibration applied; machine cost ≤ 20% of contribution.

## Phase 7: Expansion (month 3+)
- [ ] Move to L2 (then L3 for proven niches) on the track record
- [ ] TikTok Shop for US-stock winners (`tiktok-shop`) + `affiliate-manager` agent (P06)
- [ ] `support-agent` once orders exceed ~20/day (P07)
- [ ] Retention: email/SMS flows (P08); real-creator UGC for winners (P10)
- [ ] Second niche or store (P11)

## Autonomy graduation (enforced as recommendations; you flip the switch)

| Level | Agents may, without you | Graduate when |
|---|---|---|
| L0 Advisor | research, create, draft; you approve products and every external write | output quality proven (Phases 1-2) |
| **L1 Co-pilot** (default) | create draft listings and paused campaigns; pause/kill anything | 14+ days, 20+ actions, ≥ 90% approved unchanged, 0 violations |
| L2 Autopilot within caps | publish listings, activate tests, raise budgets within caps, order samples | same, plus positive contribution after ads over 14 days |
| L3 Full autopilot | duplicate winners into scaling campaigns | sustained profitability; you only review reports and exceptions |

Price changes above 15% and anything over the hard caps always need you, at every level.
