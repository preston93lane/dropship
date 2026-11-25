---
name: tiktok-ads
description: Run TikTok ads for a Shopify dropshipping store and (later) TikTok Shop - prerequisites, test structure, native creative requirements, Spark Ads, AI-generated-content labeling, reading TikTok metrics, scaling and GMV Max for Shop products. Use when launching or managing TikTok campaigns.
---

# TikTok ads

## When to use TikTok

Native vertical video creatives (presenter/UGC, demo, satisfying motion), audience skewing under ~35, products with a strong "wow" moment. Use TikTok Shop campaigns only for products listed on TikTok Shop with US stock (`tiktok-shop`).

## Prerequisites (human, once)

TikTok Ads Manager business account, **account budget limit** set; TikTok Pixel + Events API (Shopify's TikTok app sets both up); Business API developer app with an access token for the gateway; an identity (custom identity, or a TikTok account for Spark Ads).

## Test structure (what `ads.create_test` builds with channel `tiktok`)

Campaign (web conversions) → 1 ad group: US, broad, optimize for **complete payment**, daily budget $20-50 (TikTok's minimums are higher than Meta's) → 3-5 single-video ads. Statics aren't used; turn statics into slideshow videos in the creative loop.

## Creative rules for TikTok

- Must feel like TikTok content: vertical, sound-on, people or hands, fast first second, captions, trending *formats* (not copyrighted sounds).
- Keep text off the bottom 20% and the right edge (UI).
- Commercial Music Library sounds only.
- **AI-generated content label**: required for realistic AI-generated content. Enable it on every creative flagged `ai_disclosure_required` (set in Ads Manager or via API when supported; note it in the action rationale).
- Spark Ads (boosting real creator posts) usually outperform. Use them once creators post about the product (affiliate-manager, Phase 7).

## Reading metrics

2s/6s view rate (hook strength), average watch time vs. length, CTR (destination), CVR, CPA vs. target. TikTok's in-platform attribution window differs from Meta's. Compare platforms on Shopify-reconciled CPA where possible (performance-analyst).

## Scaling

Budget steps ≤ 20-30% per day on winning ad groups; duplicate winners into new ad groups with fresh hooks; for TikTok Shop products use GMV Max (Shop ads) campaigns per TikTok's current recommendations. Creative refresh cadence is faster on TikTok (often 7 days).
