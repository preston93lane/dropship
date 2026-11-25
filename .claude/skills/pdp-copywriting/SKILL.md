---
name: pdp-copywriting
description: Write product detail page (PDP) copy and structure for the Shopify store that converts ad traffic - above-the-fold promise matching the ad, benefit sections, real social proof, FAQ that kills objections, honest shipping and guarantee, SEO fields. Use when creating or improving a product listing.
---

# Product page copy

Ad traffic is cold and on mobile. The page must confirm the ad's promise within one screen, then remove doubt.

## Structure (mobile-first)

1. **Title**: `[Primary benefit/keyword] [Product type]`, e.g. "Magnetic Under-Desk Cable Organizer". ≤ 60 chars, no hype words.
2. **Image gallery** (first image = the money shot that matches the top ad): hero on white or in context → demo GIF/clip → scale shot (in hand, on the desk) → what's included → feature callout graphic → comparison graphic → real review photos when available.
3. **Price block**: price, real compare-at only, bundle selector (1 / 2-pack), "Free US shipping · Delivered in X-Y business days".
4. **Promise line** under the price (mirrors the ad angle): "Re-route any cable in one second. No tools."
5. **3-5 benefit bullets**: benefit first, then the feature ("Snaps on in seconds: strong magnetic base").
6. **How it works**: 3 steps with images.
7. **Specs**: dimensions, materials, weight, what's included, compatibility. Exact, from the supplier, verified.
8. **Social proof**: only real reviews (reviews app). Never import fake reviews or copy reviews from other stores.
9. **FAQ**: answer the top objections (size/fit, does it hold heavy cables, residue on removal, shipping time, returns).
10. **Guarantee and policies**: return window, how refunds work, contact.

## SEO fields

SEO title ≤ 60 chars (keyword + benefit), meta description ≤ 155 chars (benefit + offer), alt text on every image (describe the image truthfully).

## Rules

- Same claims rules as `ad-copywriting`. The page must not promise more than the ad or the product delivers.
- Shipping promise = supplier's slower real time + buffer.
- Short paragraphs (≤ 3 lines on mobile), scannable bold lead-ins.
- Output for the store-manager: `descriptionHtml` (semantic HTML: `<h3>`, `<ul>`, `<p>`, no inline styles), `seo {title, description}`, image order with alt text, and the FAQ.
