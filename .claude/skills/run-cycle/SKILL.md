---
name: run-cycle
description: The operating system of the business - the RESEARCH → PLAN → EXECUTE → ADAPT → IMPROVE loops, their cadences and owners, the product lifecycle handoffs, the exact checklist for the orchestrator's PLAN, EXECUTE and STRATEGY runs, capacity rules, and how to run a loop manually from Claude Code. Use when running or reasoning about any loop.
---

# Run cycle

## The loops

| Phase | Loop | Cadence | Owner (agent) | Moves products |
|---|---|---|---|---|
| Research | RESEARCH | daily 05:17 | product-analyst (+ trend-scout) | → candidate → validated |
| Plan | PLAN | daily 06:47 | orchestrator (+ marketing-strategist) | validated → approved / parked / rejected; opens briefs |
| Execute | CREATE | daily 08:23 (+ event triggers) | creative-director (+ static-designer, video-producer, compliance-reviewer) | briefs → approved creatives |
| Execute | EXECUTE | daily 11:13 | orchestrator (+ store-manager, media-buyer) | approved → listing → creative_production → ready_to_test → testing |
| Adapt | GUARDIAN | every 30 min | code (no LLM) | ads killed/scaled; testing → winner / killed |
| Adapt | ADAPT | 09:37 and 18:37 | media-buyer | scaling, fatigue, reallocation, near-miss diagnosis |
| Adapt | REPORT | daily 20:53 | performance-analyst | none (reports) |
| Improve | IMPROVE | weekly Sun 07:41 | self-improver (+ performance-analyst) | playbook, weights, models, proposals |
| Improve | STRATEGY | monthly 1st 09:29 | orchestrator | portfolio, autonomy recommendation |

Loops coordinate **only through state** in the gateway (products, briefs, creatives, campaigns, actions). Any loop can fail or be skipped without breaking the others; the next run picks up where things are.

## Capacity rules (defaults)

- Max products in `testing` at once: guardrail `maxActiveTestingProducts` (default 4)
- Max new tests per day: `maxNewTestsPerDay` (default 2)
- Pipeline target: ~2 `validated` products waiting at any time; if more, RESEARCH validates fewer; if empty, RESEARCH widens its sources
- Every testing product needs ≥ 3 approved creatives from ≥ 3 concept families

## PLAN checklist (orchestrator)

1. Summary + kill switch check. Open slots = `maxActiveTestingProducts` − count(approved … testing).
2. For each `validated` product (best score first): approve if it passes the decision principles and a slot exists; otherwise park (with a revisit date) or reject (with a reason). At autonomy L0 approval is a human step: leave it validated and list it in your summary.
3. For each newly approved product: ask marketing-strategist for the marketing plan (avatars, angles, offer, hooks, copy, PDP). Run products in parallel.
4. Open the initial creative brief: `POST /v1/briefs` `{product_id, reason: "initial_test", count: 5, formats: [...], angles: [top 3], notes}`.
5. Review `parked` products weekly (Mondays): revive or reject.

## EXECUTE checklist (orchestrator)

1. `approved` without a Shopify id → store-manager drafts the listing → `listing`.
2. `listing` with a draft listing → `creative_production` (the brief is already open).
3. `creative_production` with ≥ 3 approved creatives → `ready_to_test` (gateway enforces). Ask store-manager to publish the listing.
4. `ready_to_test` → media-buyer launches (`ads.create_test` + `ads.activate`). Spend approvals at L1 go to the human.
5. Store health weekly: unpublish killed products, check supplier stock on winners.

## STRATEGY checklist (monthly)

Portfolio (winners, scaling headroom, retirements) · niche health (hit rate, CPA trends) · machine P&L (LLM + media + tools vs. contribution) · autonomy recommendation from the gateway's track record · top 3 priorities for next month · proposals for the human (budget caps, niche change, new channel). Post as a `monthly` report.

## Running a loop by hand (Claude Code, local)

```bash
npm run dev:gateway                       # terminal 1: local gateway + console on :8787
export GATEWAY_URL=http://localhost:8787 GATEWAY_KEY=dev-agent-key
claude "Act as the orchestrator and run the PLAN loop."   # or ask for any agent by name
```

In the cloud: `ant beta:deployments run --deployment-id <depl_...>` triggers a loop immediately (also works while paused).
