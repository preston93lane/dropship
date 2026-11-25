---
name: retrospective
description: Weekly evidence-based retrospective that turns outcomes into durable knowledge - compare predictions with results for every concluded product and creative, attribute wins and losses to traits and creative attributes with sample sizes, conclude experiments, and write versioned playbook entries with confidence levels. Use in the IMPROVE loop or after any notable win or loss.
---

# Retrospective

## Inputs

`gw GET /v1/outcomes` (concluded products with score components), `gw GET /v1/products/<id>` for each (creatives, ads, decisions, events), `gw GET /v1/experiments`, `gw GET /v1/reports?kind=daily&limit=7`, the cost log.

## Questions to answer (with numbers)

1. **Prediction vs. outcome**: did higher-scored products win more? Which components separated winners from losers? (`POST /v1/calibrate` does the bounded weight update; you explain it.)
2. **Creative attributes**: compare hook rate, CTR and CPA by format, hook type, angle driver, presenter, length, first-frame type, and AI vs. real footage. Report n per group. With n < 5 per group, call it a hunch, not a lesson.
3. **Funnel diagnosis** for each killed product: where did it die (hook, CTR, ATC, checkout)? Was it the product or our execution?
4. **Process**: where did the loops stall (approvals waiting, compliance rejections, production failures, costs)?
5. **Experiments**: conclude what has enough data; propose the next 1-3.

## Playbook entries (`/mnt/memory/playbook/*.md`)

Format:
```
## <lesson in one line>
- Evidence: <ids>, n=<count>, effect=<e.g. CTR 1.8% vs 1.1%>, period <dates>
- Confidence: low | medium | high
- Applies to: <niche/format/channel>
- Action: <what agents should do differently>
- Added: <date>  (supersedes: <older lesson>, if any)
```

Rules: update or retire contradicted lessons rather than stacking conflicting ones; keep files short (≤ ~300 lines); `high` confidence needs n ≥ 10 across ≥ 2 products; never record unverifiable claims; never store credentials or personal data in memory.

Files: `lessons.md` (cross-cutting), `product-traits.md` (what predicts winners), `creative-patterns.md` (formats, hooks, structures that work), `hooks.md` (hook bank with performance), `niche-notes.md` (niche-specific).
