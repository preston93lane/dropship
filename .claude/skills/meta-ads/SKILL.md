---
name: meta-ads
description: Run profitable Meta (Facebook/Instagram) ads for dropshipping in the Andromeda/Advantage+ era - account and tracking prerequisites, test structure, budgets, creative diversity, naming, reading results, scaling and fatigue, policy hygiene. Use when launching, reviewing or scaling Meta campaigns.
---

# Meta ads

## Prerequisites (human, once; see docs/07-setup.md)

Business Manager with a verified domain; ad account with an **account spending limit** set (the platform-level hard cap); Page + Instagram account; Pixel **and** Conversions API (Shopify's Facebook & Instagram app sets up both); Aggregated events with Purchase prioritized; a system-user token with `ads_management` for the gateway.

## How delivery works now

Targeting is mostly automatic: broad audiences + Advantage+ audience let the creative find its buyers. **Creative is the targeting.** Meta groups similar creatives together, so diversity across format, angle, hook, spokesperson and visual world matters more than volume (`creative-strategy`).

## Test structure (what `ads.create_test` builds)

- 1 campaign · objective **Sales** · 1 ad set (ABO) · broad (country only, 18+, Advantage+ audience) · optimize for **Purchase** · lowest cost
- 3-6 ads, each a different concept family; 1 primary text + 1 headline each (variations come later)
- Budget: $20-40/day per test ad set, so the product test budget (≈6× breakeven CPA) lasts 3-5 days
- Naming: `T | <product> | <date>` (campaign), `<product> | broad` (ad set), creative id prefix (ads)

Don't touch a test for the first 24-48h unless the guardian kills an ad; early CPA swings are noise.

## Reading results

| Metric | Healthy for cold dropshipping traffic (orientation, not law) | If bad, the problem is… |
|---|---|---|
| Hook rate (3s views / impressions) | > 30% | first frame and first line |
| Link CTR | > 1% | hook + angle relevance |
| CPC (link) | < $1.50 | creative or audience fit |
| ATC rate (ATC / link clicks) | > 6-8% | product page, price, offer |
| Checkout → purchase | > 40-50% | shipping cost or time surprise, trust, payment options |
| CPA | ≤ target CPA (from economics) | everything above |

Good CTR with bad ATC → fix the page or offer, not the ad. Good ATC with bad purchases → checkout friction (shipping surprise, trust).

## Scaling (only `winner` products)

1. **Vertical**: raise the winning ad set budget ≤ 20-30% per 24-48h (`ads.set_budget`; policy caps steps at +30%).
2. **Duplicate into a scaling campaign** (`ads.scale_duplicate`): the proven ad at a higher budget; consider an Advantage+ Sales campaign (ASC) setup when the account has ≥ 50 purchases/week (configured manually in Phase 5+).
3. **Feed it creative**: iterations of the winner every 5-10 days (`iterate_winner` briefs); fatigue arrives faster at scale.

## Fatigue signs

Frequency > 3.5 on prospecting; CTR down ≥ 30% from its first 3 days; CPA rising 3 days in a row. Response: new first 3 seconds on the same body, new formats, new angles. Not budget cuts alone.

## Policy hygiene

Run every creative through compliance. Avoid edits to live ads (they reset learning and re-review). If an ad is disapproved, don't resubmit the same thing; read the reason, fix and create a new ad. Repeated disapprovals put the account at risk, so tell the human after 2 in a week. Turn on the AI-content disclosure where required.
