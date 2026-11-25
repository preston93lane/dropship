# Discovery sources (rotate 3-5 per day)

Costs are monthly list prices researched Nov 2026; verify before subscribing. Start with the free tier and add paid data only once a niche is chosen and you're testing ≥2 products a week.

| Source | What it tells you | How to use it | Cost |
|---|---|---|---|
| **TikTok Creative Center** (Top Ads, Top Products, Trends/hashtags) | What's being advertised on TikTok right now, by country and industry; CTR/engagement tiers | Filter US, last 7/30 days, your industry. Look for products in several top ads from different advertisers. Note hook styles. | Free |
| **Meta Ad Library** | Every active Meta ad: advertiser, start date, number of variations | Search niche keywords and competitor stores. **Ads active 30+ days with several variations = profitable.** Count unique advertisers per product. | Free (UI); scraping via Apify actors ≈ $0.5-5 per 1k ads |
| **TikTok Shop data** (FastMoss / Kalodata) | Units sold, GMV, creators, price for TikTok Shop products | Only once TikTok Shop is a channel. Look for steady daily sales over 2+ weeks, not one viral spike. | ≈ $49-139/mo (FastMoss has an API); Kalodata ≈ $59+/mo |
| **Amazon Movers & Shakers / Best Sellers** | Demand spikes in categories; price anchors; review complaints | Category pages for your niche. Use 1-3★ reviews to find complaints your product or angle can solve. Also the big-box price check. | Free |
| **Google Trends** | Search interest slope, seasonality | Compare product keyword vs. category over 12 months; want rising 4-8 week slope; check seasonality before launching. | Free |
| **Supplier trending lists** (CJ "Trending", AliExpress "Top selling", AutoDS/Zendrop catalogs) | What other dropshippers are ordering | Leading indicator, but crowded. Use to confirm supply, not as sole proof. | Free |
| **Reddit / niche communities** | Real problems in the customer's own words | Search "[niche] recommendation", "what's the best way to...". Gold for angles and objections. | Free |
| **Competitor stores** | Their product mix, prices, bundles, reviews | Find via ad library. Check reviews and app stack. Never copy their copy or creatives. | Free |

## Scout task template (product-analyst → trend-scout)

> Source: Meta Ad Library. Niche: desk setup. Search terms: "cable organizer", "desk organizer", "under desk". Country US, active ads. Known products to skip: [list]. Return 5-15 finds in the JSON format from your instructions, each with the ad library URL, advertiser count and oldest ad start date. Stop when results stop being new.

## Budget

A research run should cost well under $4 of LLM time. Scouts run on the cheapest model. Avoid re-reading the same pages: dedupe URLs between scouts.
