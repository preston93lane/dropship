---
name: model-scouting
description: Weekly check that the media models the creative team depends on are still available, correctly specified and priced - verify registry endpoints, catch deprecations early, evaluate better or cheaper alternatives with a small bake-off, and update the model_registry setting. Use in the IMPROVE loop or when a media call fails with 404/schema errors.
---

# Model scouting

AI media models change monthly: in 2026 alone, the Sora 2 API was shut down (Sept 24) and Veo 3.1 was reported leaving fal (Nov 17). A dead endpoint silently breaks the creative loop, so check weekly.

## Weekly routine

1. Load the current registry: `gw GET /v1/settings/model_registry` (fallback: `media-pipeline/models.json`).
2. For each entry, open its fal model page (`https://fal.ai/models/<endpoint>`) and confirm: the endpoint exists, the input schema (field names like `image_url`, `duration`, `aspect_ratio`), the price and unit, and any deprecation notice. Clear `verify: true` once confirmed.
3. Check fal's pricing page and "new models" listing for better options per slot (fidelity, motion quality, price). Candidates must support image-to-video from a reference frame for product shots.
4. **Bake-off** before swapping a production slot: same 2 start frames + prompts on the current and candidate models (dry budget ≤ $3). Judge product fidelity first, motion realism second, cost third. Record the result.
5. Update the registry with `gw PUT /v1/settings/model_registry` (full JSON, `reason` required). Add deprecated models to `deprecated[]` with dates and sources.
6. Report: changes, prices that moved, and any slot without a reliable model (that's a human-visible risk).

## Rules

- Never point a slot at a model you haven't verified exists.
- Prefer models with commercial-use terms suitable for ads. Note license changes.
- Keep at least one fallback per group (`open_weights` for video).
