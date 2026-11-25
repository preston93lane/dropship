# 00 · Strategy: what will actually work

This is my recommendation for how to run an AI-operated dropshipping business in late 2026, and why the
system is built the way it is. Market facts below were researched in November 2026; the sources are at the end.

## The short version

1. **Creative is the business.** Meta and TikTok now pick audiences from the ad itself, and they treat
   near-duplicate ads as one ad. The edge is a steady supply of *genuinely different*, honest, native-looking
   ads, plus fast iteration on whatever wins. That's where most of the agent effort and media budget goes.
2. **Niche store, US stock.** Build one coherent niche brand (5-15 products), sourced from US warehouses with
   delivery in 7 days or less. It converts better, its learnings compound, it keeps refunds and chargebacks
   down, and it's the only way onto TikTok Shop US, which requires US-origin fulfillment.
3. **Shopify + Meta first, TikTok second, TikTok Shop third.** Meta → Shopify is the most predictable test bed.
   TikTok Ads works well with native video. TikTok Shop's real engine is creators and affiliates, which only
   pays off once a product is proven and stocked in the US.
4. **LLMs decide, code enforces.** Agents do research, judgment and creative. Code (the gateway and the
   guardian) holds the money: spend caps, kill rules, approvals, compliance gates. An agent can't spend
   a dollar that policy doesn't allow.
5. **Autonomy is earned.** Start at L1: agents do everything, and you approve spend from your phone. The
   system recommends moving up a level after 14+ clean days. Pausing and killing are always automatic.
6. **Kill fast, scale slow.** Statistical rules kill losers at about 1-1.5× breakeven CPA and scale winners
   in steps of 20% or less. Most of the system's ROI comes from wasting less test money than a human would.
7. **Compliance is existential.** Fake reviews and AI "testimonials" bring FTC penalties per violation,
   misrepresented products bring chargebacks and payment holds, and policy violations get ad accounts banned.
   Every creative passes an independent compliance gate before it can spend.

## What I'd do in your position (sequenced)

| Week | Do | Spend |
|---|---|---|
| 1 | Pick a niche (edit `.claude/skills/business-profile/SKILL.md`). Run RESEARCH and CREATE locally in Claude Code against the dev gateway. Judge the output yourself. | Claude usage + about $20 of fal credits |
| 2 | Set up Shopify, Supabase and the gateway (DRY_RUN on), the console and Telegram. Create listings as drafts. | Shopify ~$29-39/mo, Supabase free |
| 3-4 | Meta ad account with a **spending limit**. Launch 3-4 product tests at L1 ($20-40/day each). Approve activations from your phone. | $500-1,500 of test ad spend |
| 5-8 | Deploy the loops to Managed Agents (`ant apply`). Let it run daily. Move to L2 when the console recommends it. | ~$200-700/mo of machine cost, depending on cadence |
| 9+ | Scale winners; add TikTok; list US-stock winners on TikTok Shop; plan affiliates. | Scales with contribution |

**Capital I'd want before starting**: $1,500-3,000 for ad testing (finding a winner usually takes several
tests, so plan for roughly 5-10 tests) plus 2-3 months of tooling. With less, run the Lean cadence and fewer, better tests.

## Honest expectations

- Most products lose. Plan for roughly a 10-20% hit rate on validated products; the research loop's job is
  to raise it, and the guardian's job is to make losses cheap (~$100-200 each).
- AI video is excellent for hooks, scenes and b-roll. It's still bad at showing a product being *handled*.
  Order samples of winners and shoot real demo footage; it beats AI for the demo segment.
- Ad-platform APIs, AI-model endpoints and TikTok Shop rules change monthly. The model registry, adapters
  and the policy notes are designed to be swapped quickly, and the self-improver checks models weekly
  (the Sora 2 API was shut down in September 2026, and Veo 3.1 was reported leaving fal in November).
- "Fully autonomous from day one" is the fastest way to lose money. The system is built to *become*
  autonomous on its track record.

## Why this architecture (and not the alternatives)

| Choice | Why | Alternative considered |
|---|---|---|
| Claude Managed Agents for the loops | Anthropic hosts the agent loop and sandbox; agents, skills, environments and schedules are version-controlled files (`ant apply`); per-run **dollar budgets**; vaulted credentials never enter the sandbox; scheduled deployments = cron for agents | Self-hosted Agent SDK on a VPS: more ops, no built-in budgets or vaults. Use it only if you need to self-host (Managed Agents is in beta, bills session runtime of $0.08/hr on top of tokens, and keeps session history until deleted) |
| Same files work in Claude Code | `.claude/skills` and a generated `.claude/agents` let you run every agent interactively before any cloud setup | Separate prompt copies: drift |
| Supabase (Postgres + Edge Functions + Storage + pg_cron) | One free-to-start service for state, the gateway, the guardian cron and public media URLs | Separate DB + server + S3: more moving parts |
| Deterministic guardian, no LLM | Runs every 30 minutes for pennies; the rules can't be talked out of; the result is auditable | An agent watching ads hourly: expensive, and inconsistent with money on the line |
| fal.ai as the single media vendor | One key, one prepaid balance (a hard spending cap), every major video, image and TTS model behind one API, models swappable via the registry | Direct vendor accounts per model: more keys, more billing, and churn |
| Remotion + HTML templates for text and motion | Pixel-perfect captions, typography and animation; AI models misspell and warp text | Text baked into AI images/video: unusable at ad quality |

## Sources (researched Nov 2026; re-verify before relying on specifics)

- fal.ai pricing roundups: [teamday.ai fal pricing (Nov 2026)](https://www.teamday.ai/blog/fal-ai-pricing-2026), [fal Veo 3.1 page](https://fal.ai/models/fal-ai/veo3.1), [GenRates fal video pricing](https://genrates.com/providers/fal)
- TikTok Shop US fulfillment: [Easyship on the logistics reversal](https://www.easyship.com/blog/tiktok-shop-reverses-us-shipping-mandate), [Omniorders TikTok Shop playbook](https://omniorders.com/blog/tiktok-shop-dropshipping-fulfillment-guide), [SaleHoo TikTok dropshipping 2026](https://www.salehoo.com/learn/tiktok-dropshipping)
- Meta creative diversity (Andromeda): [Jon Loomer on creative diversification](https://www.jonloomer.com/meta-andromeda/), [AdExchanger on what Andromeda changes](https://www.adexchanger.com/data-driven-thinking/what-metas-andromeda-update-actually-changes-and-what-it-doesnt/), [Common Thread Collective](https://commonthreadco.com/blogs/coachs-corner/meta-andromeda-roas-creative-strategy-2026)
- FTC fake reviews and testimonials: [DLA Piper on the FTC warning letters](https://www.dlapiper.com/en-gb/insights/publications/2025/12/ftc-warning-letters-ai-consumer-reviews), [Benesch on Consumer Review Rule enforcement](https://www.beneschlaw.com/insight/five-stars-zero-tolerance-ftc-turns-up-enforcement-under-consumer-review-rule/)
- Research tools: [FastMoss pricing 2026](https://delzonic.com/blogs/fastmoss-pricing-2026/), [Kalodata vs FastMoss](https://www.hubfluence.io/blog/kalodata-vs-fastmoss)
- Presenter video: [HeyGen API pricing](https://www.heygen.com/api)
- Supplier API: [CJ Dropshipping API v2 docs](https://developers.cjdropshipping.com/en/api/api2/api/shopping.html)
