---
name: static-ad-design
description: Design and render high-converting static and carousel ads with code-rendered typography - five proven layouts (hero-benefits, problem-solution, us-vs-them, review-card, offer-bundle), sizes and safe zones, the HTML template renderer with automatic layout QA, and the visual checklist. Use for any static ad, carousel card, or store graphic.
---

# Static ad design

Statics are cheap to make, quick to iterate, and often the best performer for clear offers and comparisons. Text is rendered by HTML/CSS (crisp, correctly spelled, on-brand); imagery comes from real product photos plus reference-faithful AI scenes (`product-image-generation`).

## Layouts (templates/*.html)

| Template | Use when | Key props |
|---|---|---|
| `hero-benefits` | Default. Strong product shot + 3 true benefits + offer badge | headline (`*word*` = highlight), subhead, background (scene), product (cutout), benefits[], badge, cta |
| `problem-solution` | Problem is visual and recognizable (not a body!) | problemImage, problemLabel, problem, fixLabel, fix, product, cta |
| `us-vs-them` | Clear functional advantages over the usual alternative | headline, product, oursLabel, themLabel, rows[{feature, ours, them}], cta |
| `review-card` | You have a **real** review worth quoting verbatim | rating, quote, reviewer, verified (only if true), reviewSummary, product, cta |
| `offer-bundle` | Pushing the 2-pack / sale (real prices only) | headline, product, product2, badge, compareAt (real), price, note, cta |

Theme overrides: `"theme": {"accent": "#FFE14D", "accentText": "#111", "bg": "#0F1115", "text": "#fff"}` (from the business profile).

## Render

```bash
node <skill>/scripts/render_static.mjs --template hero-benefits --props props.json \
  --sizes 1080x1350,1080x1920,1080x1080 --out out/ --name cable-hero-01
```

Local image paths in props are inlined. The script prints QA warnings (overflow, text under ~30px, text in the 9:16 bottom danger zone) and exits 1 on overflow: shorten the copy, don't shrink the type. Examples live in `examples/`.

## Sizes and placements

- **1080x1350 (4:5)**: Meta feed (primary static size)
- **1080x1920 (9:16)**: Stories/Reels/TikTok; keep text out of the top ~10% and bottom ~20%
- **1080x1080 (1:1)**: fallback / marketplace
- **Carousel**: 3-5 cards at 1080x1080 or 1080x1350; card 1 = hook, then benefit, proof, offer.

## Design rules that move metrics

- One focal point: the product (or the problem) fills 35-50% of the frame.
- Headline ≤ 7 words; benefit-led; highlight the one key word.
- High contrast; the accent color is only for the highlight, badge and CTA.
- Show scale (in hand or on the desk) when size is a likely objection.
- Real numbers beat adjectives ("Holds 6 cables" not "Holds tons").
- Don't fake UI (no fake play buttons, fake notifications or fake "Add to cart" system UI; Meta disapproves these).

## Checklist (before upload)

- [ ] Product identical to the supplier photo (no AI alterations to the product itself)
- [ ] Spelling and prices correct; offer matches the store
- [ ] QA warnings resolved at every size
- [ ] Review card: quote is verbatim from a real review; "Verified buyer" only if verified
- [ ] Viewed at phone size (render a 360px-wide preview and read it)
