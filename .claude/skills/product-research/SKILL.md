---
name: product-research
description: Method for finding and validating dropshipping products that can win with paid social video ads - discovery sources, proof signals, hard gates, the 0-10 scoring rubric, big-box price checks, angle generation and the exact record to create in the gateway. Use for any product discovery, validation or "is this a good product?" question.
---

# Product research

A winning product for this business has five things at once: **(1) a visual "wow" or obvious problem fixed in the first 3 seconds of a video, (2) proof that people are already buying it, (3) at least $15 contribution per order before ads, (4) fast US fulfillment, (5) room for several genuinely different ad angles.** Missing any one usually means a lost test budget. The research loop's job is to find many candidates cheaply and validate few, rigorously.

## Workflow

1. **Load context**: `business-profile` (niche, exclusions), the playbook (`product-traits.md`: which traits predicted winners and losers here), and the known-products list from the gateway (dedupe).
2. **Discover** across 3-5 source families per day (rotate; see `references/sources.md`). Each scout returns raw finds with evidence URLs.
3. **Triage** with the hard gates below. Expect to drop 70-90%.
4. **Validate** survivors:
   - *Proof*: find the product being advertised by ≥3 unrelated advertisers, or with ≥1 ad live ≥30 days, or with TikTok Shop sales data showing steady (not one-spike) sales. Note ad start dates and how many creative variations each advertiser runs: many variations of one product = someone is scaling it.
   - *Teardown* the top 3-5 competitor ads (`competitor-ad-teardown`): which angles and hooks are used? What is **unclaimed**? An unclaimed angle is our edge.
   - *Supplier*: exact item match, cost, shipping cost and days to the US, warehouse country, variants and stock (`supplier-sourcing`).
   - *Economics*: `gw POST /v1/economics` with real cost and shipping. Hard-gate failures end it here.
   - *Big-box check*: search Amazon, Walmart and Temu for the same item. If it's available cheaper with fast shipping, flag `soldCheaperAtBigBox` unless our offer clearly differs.
   - *Angles*: at least 3 distinct angles (problem/solution, desire/identity, gift, comparison, curiosity), each with a hook idea and a first-frame visual.
5. **Score** with the rubric (`references/scoring-rubric.md`), create the record, call `/score`, and move to `validated` only on a `validate`/`priority` verdict.
6. **Ingest media** for validated products: upload supplier images and videos to storage `products/<id>/source/` (the creative sandbox cannot reach supplier sites). Record the URLs in `signals.media`.

## Hard gates (reject immediately)

- Anything in the business profile's exclusions, or needing health, medical, weight-loss, earnings or safety claims to sell.
- IP risk: brand names, logos, characters, licensed designs, patented "as seen on TV" items, knockoffs.
- Contribution < $15, or markup < 2.5x after real shipping costs (2.0x is enough when contribution is ≥ $30: mid-ticket products have the dollar headroom paid social needs).
- Shipping > 12 days with no US-warehouse alternative (refund and chargeback risk, and TikTok Shop ineligible).
- Fragile, sizing-dependent, or electrical items with certification needs (UL/FCC) and no documentation, unless the margin is very high.
- Already in our product list in any state (check `dedupe_key`).

## Signals that predict winners (update from the playbook)

- **Demonstrable in one shot**: before→after of an *object/situation* (not a body), satisfying motion, a clever mechanism.
- **Problem everyone recognizes**: the comment section says "I need this" or "where do I get this".
- **Price-to-perceived-value gap**: looks like $60 and costs us $12.
- **Broad but specific audience**: "anyone with a desk", "dog owners", not "left-handed violinists".
- **Repeat or bundle potential**: refills, multi-room, gifts.
- **Trend timing**: rising search interest and ad count over 2-6 weeks (early), not a flat high or a decline (late).

## Record to create (`POST /v1/products`)

```json
{
  "title": "Magnetic Under-Desk Cable Organizer",
  "niche": "desk setup",
  "source": "tiktok_creative_center",
  "source_urls": ["https://..."],
  "signals": {"advertisers_seen": 5, "oldest_ad_days": 41, "variations_seen": 14, "tiktok_views_30d": 4200000, "amazon_price": 34.99, "trend": "rising 6w", "media": []},
  "components": {"demand": 7, "proof": 8, "wow": 8, "creative_potential": 8, "competition": 6, "trend_timing": 7},
  "risk_flags": {"fragile": false, "sizingVariance": false, "batteryOrLiquid": false, "soldCheaperAtBigBox": false},
  "supplier": {"name": "CJ", "url": "https://...", "product_id": "...", "variant_id": "...", "cogs": 6.2, "shipping_cost": 4.1, "shipping_days": 5, "warehouse_country": "US"},
  "angles": [{"angle": "desk glow-up in 10s", "driver": "desire", "hook": "POV: you finally fixed the cable mess", "first_frame": "tangled cables close-up"}],
  "notes": "Why now, what's unclaimed, main risk."
}
```

`margin` and `fulfillment` components are computed by the gateway; do not set them.
