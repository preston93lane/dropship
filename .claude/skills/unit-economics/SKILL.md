---
name: unit-economics
description: Pricing and profitability math for every product decision - contribution per order, breakeven and target CPA/ROAS, price suggestion, bundles and AOV, test budgets, and the machine's own cost. Use before validating, pricing, launching, scaling or killing anything.
---

# Unit economics

The gateway computes these with one implementation (`POST /v1/economics`, and automatically on products), so every agent uses the same numbers. This skill explains them so you can reason with them.

## Definitions (per order)

- **Landed cost** = supplier COGS + supplier shipping
- **Fees** = price × (payment % + platform %) + fixed payment fee. Shopify Payments US online is about 2.9% + $0.30; TikTok Shop adds its referral fee as `platformFeePct`.
- **Refund allowance** = price × refund rate (default 5%; dropshipping refunds rarely recover COGS)
- **Contribution** = price − landed cost − fees − refund allowance − other per-order costs
- **Breakeven CPA** = contribution (ad cost per order at which profit is zero)
- **Target CPA** = breakeven CPA × (1 − target profit share). The default share of 30% means we aim to keep 30% of contribution as profit.
- **Breakeven ROAS** = price ÷ breakeven CPA. **Target ROAS** = price ÷ target CPA.

Example: price $39.99, COGS $8.50, shipping $4.50 → contribution ≈ $23.53, breakeven CPA $23.53 (breakeven ROAS 1.70), target CPA ≈ $16.47 (ROAS 2.43).

## Gates (defaults, configurable by the operator)

Contribution ≥ $15 · markup ≥ 2.5x landed (≥ 2.0x when contribution ≥ $30) · contribution margin ≥ 35%. Below these, paid social cannot reliably buy customers profitably. Mid-ticket products ($60-100) usually beat cheap viral items: the cheapest viral pet toys sell for $9-13 on TikTok Shop and Amazon, which leaves no room for a paid-social CPA.

## Pricing

- Start from **3x landed cost** with a .99 ending, floor $24.99 (`suggestPrice`), then sanity-check against competitors and the big-box price. A higher price with a better offer and page often converts as well and doubles the margin for CPA.
- **Compare-at prices only when real** (an actual previous price or MSRP you can document). Fake "was" prices are deceptive.
- **Bundles raise AOV**: a 2-pack at 15-25% off per unit usually lifts AOV 20-40% while landed cost grows less than proportionally (shipping is shared). Recompute economics for the bundle as its own price point.
- **Free shipping**: build it into the price; customers convert better on "free shipping" than on a lower price plus shipping.

## Test budget

Product test budget ≈ **6 × breakeven CPA**, spread over 3-6 creatives and 3-5 days. Enough to see a winner, small enough that a miss is cheap. The guardian kills individual ads much earlier on the rules in `kill-scale-rules`.

## The machine's cost

Every loop logs LLM and media cost (`/v1/runs`, `/v1/costs`). Trailing 7-day machine cost should stay under about 15-20% of contribution after ads once products are live. Before the first winner it's an investment; track it as "cost per validated product" and "cost per finished creative".
