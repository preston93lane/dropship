---
name: shopify-listing
description: Build and maintain Shopify product listings through the gateway - store setup prerequisites, the listing standard (title, image order, variants mapped to supplier SKUs, bundle variant, pricing, SEO), the shopify.create_product payload, publishing, price changes, unpublishing, and the live-page check. Use for any Shopify store or listing work.
---

# Shopify listing

## Store prerequisites (human, once; docs/07-setup.md)

Shopify plan with Shopify Payments; a fast clean theme (Dawn or similar) with sticky add-to-cart on mobile; legal pages (refund, shipping, privacy, terms, contact) that match the supplier's reality; a reviews app (only real reviews); the supplier app (CJ / DSers / AutoDS) for automatic order fulfillment and tracking sync; the Facebook & Instagram and TikTok sales-channel apps (pixels + CAPI); a custom app with Admin API token for the gateway (scopes: products, publications, inventory read).

## Listing standard

| Element | Standard |
|---|---|
| Title | `[Benefit/keyword] [Product type]`, ≤ 60 chars, no hype |
| Images | 6-10: hero (matches the top ad) → demo → scale/in-hand → what's included → feature callout graphic → comparison graphic → lifestyle. Square 2048px when possible. Alt text on every image |
| Variants | ≤ 3-4 for a test. Map each to a supplier variant id. Add a **2-pack bundle variant** (option "Pack": 1 / 2) |
| Price | from unit economics; compare-at only when real |
| Description | from the marketing plan via `pdp-copywriting` (semantic HTML) |
| SEO | title ≤ 60, description ≤ 155, clean handle |
| Tags | niche, angle, `test-<date>`; product type set |
| Status | always created as DRAFT; publish is a separate action |

## Create (action payload)

```json
{"type": "shopify.create_product", "rationale": "Draft listing for approved product (score 78, contribution $21.40)",
 "payload": {"product_id": "<uuid>", "listing": {
   "title": "Magnetic Under-Desk Cable Organizer",
   "descriptionHtml": "<p>Re-route any cable in one second…</p><h3>Why you'll love it</h3><ul><li>…</li></ul>",
   "vendor": "YOUR_BRAND_NAME", "productType": "Cable Management", "tags": ["desk setup", "test-2026-11"],
   "images": [{"url": "https://…/hero.jpg", "alt": "Magnetic cable organizer holding six cables under a desk"}],
   "options": [{"name": "Pack", "values": ["1 Pack", "2 Pack"]}],
   "variants": [{"optionValues": {"Pack": "1 Pack"}, "price": 29.99, "sku": "CJ123-1"},
                {"optionValues": {"Pack": "2 Pack"}, "price": 49.99, "compareAtPrice": 59.98, "sku": "CJ123-2"}],
   "seo": {"title": "Magnetic Cable Organizer | Tidy Desk in Seconds", "description": "Snap-on magnetic cable organizer. Holds 6 cables, no tools. Free US shipping."}}}}
```

Then move the product `approved → listing`. Once creatives are approved, request `shopify.publish_product` (human-approved below autonomy L2).

## After publishing: live-page check

Open the product URL from the action result: images load; variants and prices are correct; the bundle maths are right; shipping text matches the supplier window; policies are linked; add-to-cart → checkout works on mobile (the store-manager notes anything it can't verify and asks the human).

## Ongoing

- Price changes: `shopify.set_price` with rationale (test data or economics).
- Killed/retired products: `shopify.unpublish_product` (keeps the URL from serving stale ads).
- Supplier out of stock: unpublish and pause ads (media-buyer), notify the human.
