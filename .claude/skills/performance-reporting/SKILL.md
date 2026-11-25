---
name: performance-reporting
description: Produce decision-ready performance reports - daily P&L (spend, revenue, contribution after ads, machine cost, net), per-product and per-channel breakdowns, anomaly detection, attribution caveats, weekly and monthly rollups, and the exact report format pushed to the operator's phone. Use for REPORT runs and any numbers question.
---

# Performance reporting

## Metric definitions

- **Ad spend**, **attributed revenue**, **purchases**: platform-reported (Meta/TikTok), from `/v1/performance` and `ad_metrics_daily`.
- **Contribution after ads** = Σ(purchases × product contribution) − ad spend. Contribution per order comes from each product's economics (modeled).
- **Blended ROAS** = revenue ÷ spend; compare with each product's breakeven ROAS, not with an arbitrary "3x".
- **Machine cost** = LLM (agent runs) + media (fal) + research tools + SaaS, from `/v1/costs` and `/v1/runs`.
- **Net** = contribution after ads − machine cost. This is the number that matters.
- **Hit rate** = winners ÷ concluded tests (trailing 30 days).
- **Cost per finished creative** = media + creative-loop LLM cost ÷ approved creatives.

## Daily report format

Title: `"<Mon DD>: <+/-$net> net, <n> winner(s), <n> kill(s)"`

Summary (3 lines, pushed to phone):
1. Money: spend $X → revenue $Y; contribution after ads $Z; machine $M; **net $N**.
2. What changed: winners, kills, launches.
3. What needs you: approvals waiting, anomalies, decisions.

Body (markdown):
- Table by product: status, spend, purchases, CPA vs. target, ROAS vs. breakeven, verdict
- Table by channel
- Creative leaderboard: top 5 ads by hook rate and CPA (with concept family)
- Anomalies (below)
- Pipeline: validated / approved / in production / ready / testing counts
- Machine cost breakdown and 7-day trend

## Anomalies to flag

Spend > 0 with 0 clicks (tracking or delivery); CPA > 2× its 7-day average; purchases drop to 0 across all ads at once (pixel, checkout or site down); disapproved ads; failed actions; approvals pending > 12h; spend pacing > 90% of the daily cap before 6pm; refund spikes (when order data exists); machine cost > 20% of contribution (7-day).

## Attribution honesty

Platform attribution over-counts (view-through, overlapping windows). When Shopify orders are synced, report the reconciled number and the gap. Never present modeled contribution as booked profit.

## Weekly / monthly

Weekly (feeds the retro): hit rate, CPA trend by niche and channel, best and worst concept families, cost per validated product, cost per finished creative. Monthly: P&L, portfolio, autonomy track record (approved-unchanged %, violations).
