---
name: supplier-sourcing
description: Find and verify a dropshipping supplier for a product - exact item match, landed cost, US-warehouse availability, real shipping times, variant mapping, stock, sample ordering and TikTok Shop fulfillment eligibility. Use when validating a product or when a supplier fails (stock-out, slow shipping, quality complaints).
---

# Supplier sourcing

Supply decides refunds, chargebacks, reviews, TikTok Shop eligibility and ad-account health. A great product with a slow or sloppy supplier is a losing product.

## Preference order

1. **US-warehouse stock** with 2-7 day delivery: CJ Dropshipping US warehouses, Zendrop US, Spocket US suppliers, AutoDS US suppliers, or a private supplier holding stock at a US 3PL.
2. **Fast international lines** (7-12 days, tracked) only for Shopify + Meta tests, never TikTok Shop.
3. Anything > 12 days: reject unless the product is unique and we plan to move stock to a US warehouse before scaling.

TikTok Shop US needs US-origin fulfillment, dispatch within about 2 business days and valid tracking. International shipping from overseas suppliers is not allowed, and shipping items bought from other retailers is treated as falsified fulfillment. Verify current rules in Seller Center before listing.

## Verification checklist

- **Exact match**: same dimensions, materials, color options, included parts and packaging as the item in the ads we'll run. Compare photos side by side; check the supplier's own video.
- **Landed cost** = unit cost + shipping to a US address for 1 unit (and for the 2-pack bundle). Use the supplier's shipping calculator for a real zip code (e.g. 10001 and 90001).
- **Delivery time**: processing + transit, from the supplier's stated line and recent reviews. Record the slower number.
- **Stock**: units available in the warehouse you'll ship from; flag < 200 units for a product we may scale.
- **Variants**: map each Shopify variant to a supplier variant id (`supplier.variant_id`); avoid more than 3-4 variants in a test.
- **Quality signals**: supplier rating, order count, review photos, complaint themes (broken on arrival, smaller than expected).
- **Compliance docs** for electronics, kids or kitchen items: certifications on request (UL/FCC/CPSIA/food-safe).
- **Backup supplier**: note a second source if one exists.

## Samples

When a product becomes a `winner` (or before the test if the product is unusual), order a sample (`supplier.order_sample`, capped weekly by policy). The sample is used to verify quality and to shoot **real** product footage for creatives, which beats AI footage for any shot where the product is handled.

## Record (`supplier` field)

`{name, url, product_id, variant_id, cogs, shipping_cost, shipping_days, warehouse_country, stock, backup_url, notes}`, with the date you checked it in `notes`. Prices and shipping change, so re-check before scaling.
