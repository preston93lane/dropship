---
name: tiktok-shop
description: TikTok Shop (US) as a sales channel - eligibility (US-origin fulfillment, dispatch SLAs, tracking), listing via the Shopify TikTok channel, when it's worth it, GMV Max and the affiliate/creator program that drives most Shop sales. Use before listing anything on TikTok Shop or planning creator/affiliate work.
---

# TikTok Shop

## Eligibility (verify current rules in Seller Center before each new product)

As of late 2026 the reported requirements for US local sellers are: **US-origin inventory** (own warehouse, contracted 3PL, or Fulfilled by TikTok); orders marked shipped within about **2 business days** and delivered within the promised window; ≥ 95% valid tracking; low seller-fault cancellation rate (~≤ 2.5%). International third-party suppliers shipping from overseas are not allowed, and shipping items bought from other retailers is treated as falsified fulfillment. A reported early-2026 mandate to use TikTok's logistics was reversed, so seller shipping remains available. Treat these as checks to re-verify, not settled facts.

**Practical rule**: list on TikTok Shop only products whose supplier holds US stock and dispatches within 1-2 days (CJ US warehouse, US 3PL, or our own stock after a winner is proven).

## Listing

Use the official TikTok sales channel in Shopify to sync products and inventory. The gateway action `tiktok_shop.list_product` publishes a Shopify product to the TikTok publication. Category, attributes and compliance documents may still need completing in TikTok Seller Center (human step, noted in the action result).

## Fees

Referral fee per order (set `platformFeePct` in economics when evaluating TikTok Shop pricing), plus affiliate commissions when creators sell. Recompute unit economics for the Shop channel separately.

## What drives sales

1. **Affiliates/creators**: creators post videos with the product link and earn commission. This is the main growth engine on TikTok Shop. Offer free samples and competitive commission to creators whose audiences match (affiliate-manager, Phase 7).
2. **Shop ads (GMV Max)**: promote Shop products and the best creator videos (Spark-style).
3. **Shoppable content** from the brand account (our creatives, posted organically).

Creators must disclose paid partnerships. Never script creators to claim results they haven't had.
