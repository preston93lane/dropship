---
name: offer-and-angle-strategy
description: Build the strategic core of a product's marketing - customer avatars from real language, a ranked set of genuinely different ad angles, and an honest offer (price, bundle, guarantee, shipping promise) that maximizes conversion and AOV. Use when a product is approved for launch, when a test needs new angles, or when conversion lags after the click.
---

# Offer and angle strategy

**Angle** = the reason-to-buy an ad leads with. **Offer** = what the customer gets and on what terms. Most "bad products" are actually a bad angle or a weak offer. Ad platforms now treat near-identical creatives as one, so angles must be truly different, not reworded.

## 1. Avatars from evidence

Mine the research (comments, reviews of similar products, Reddit threads) for each avatar:
- **Trigger moment**: when do they feel the problem? ("every time I sit down to work")
- **Failed alternatives**: what they tried and why it failed ("zip ties, but I have to cut them")
- **Desired outcome** in their words ("a desk that looks like Pinterest")
- **Objections**: price, quality, "does it actually work", size, shipping time

## 2. Angle generator (produce 8+, keep the best 5-8)

| Driver | Template | Example (cable organizer) |
|---|---|---|
| Pain/problem | "Still dealing with X?" | "Your cables are why your desk never looks clean" |
| Desire/aspiration | "Get the Y you've wanted" | "The 10-second desk glow-up" |
| Identity | "For people who…" | "For people who notice the cables" |
| Mechanism/curiosity | "Why X works differently" | "Magnets, not zip ties: here's why it lasts" |
| Comparison | "X vs the usual way" | "Zip ties vs this" |
| Convenience/time | "Do X in Y seconds" | "Re-route any cable in one second" |
| Gift | "The gift they didn't know they needed" | "Gift for the person whose desk is chaos" |
| Social proof (real only) | "Why N people switched" | only with real numbers |
| Savings | "Stop wasting money on X" | weak for this product, skip |

Rank by: strength of evidence (comments and reviews), how easy it is to show visually, how saturated it is among competitors (prefer unclaimed), and fit with the playbook's niche patterns. Each angle carries: the proof it needs, a hook, a first-frame idea, and its best format.

## 3. Offer design

- **Price**: from unit economics; test anchor points only with the media-buyer's agreement (one variable at a time).
- **Bundle**: a 2-pack (or "desk + drawer" set) at a visible per-unit saving. This is the default AOV lever.
- **Guarantee**: a 30-day money-back only if the refund budget in economics supports it. State it plainly.
- **Shipping**: "Free US shipping, delivered in X-Y business days" using the supplier's slower real number plus a buffer.
- **Urgency**: only real urgency (a sale with an actual end date, real low stock). No fake countdown timers or "only 3 left".
- **Risk reversal and FAQ**: answer the top 3 objections on the product page.

## Output

`angles` (structured JSON on the product) = `[{angle, driver, avatar, proof_needed, hook, first_frame, best_formats[], evidence}]` ranked, plus an `offer` object `{price, compare_at?, bundle: {qty, price}, guarantee, shipping_promise}` written to the product notes.
