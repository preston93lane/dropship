---
name: creative-strategy
description: The creative director's system for planning ad batches that win - the diversity matrix (format x angle x hook x spokesperson x visual world) required by modern ad delivery, batch composition for initial tests, the iteration ladder for winners, fatigue refreshes, the quality bar and the brief-to-spec format. Use when planning any set of creatives or deciding what to make next.
---

# Creative strategy

## Why diversity is the strategy

Meta's delivery system (Andromeda) and TikTok's group visually and structurally similar ads together; ten near-duplicates behave like one ad. Each creative in a batch must differ on **at least 3 of 5 dimensions**:

| Dimension | Options |
|---|---|
| **Format** | presenter/UGC-style video · demo video + VO · motion-graphic showcase · static · carousel/slideshow |
| **Angle** (messaging theme) | from the product's ranked angles (pain, desire, identity, comparison, convenience, gift…) |
| **Hook type** | problem callout · POV · negative · demo-first · curiosity · comparison · question · pattern interrupt |
| **Spokesperson** | none (product only) · AI presenter A/B (different look and voice) · hands-only · real creator (later) |
| **Visual world** | setting, palette, time of day, camera style (handheld vs. locked-off), music genre |

Give each creative a `concept_family` label (angle + format, e.g. `glowup-demo`). Iterations of a winner share the family; new tests need new families.

## Start from the data

Before planning a batch, read `gw GET /v1/insights/creatives` (which formats, hook types, angles and concept families have produced purchases and CTR in this store) and the playbook's `creative-patterns.md`. Lean on proven dimensions for most of the batch, and keep at least one slot for an untested dimension so the system keeps learning. With fewer than ~20 measured creatives, treat differences as hunches.

## Batch recipes

**Initial test (5)**
1. Demo-led video, strongest angle, demo-first hook
2. Presenter video, 2nd angle, problem-callout hook
3. Presenter video (different presenter and setting), 3rd angle, POV or negative hook
4. Motion-graphic showcase (cheap), 1st angle restated with feature callouts
5. Static (hero-benefits or us-vs-them), 2nd angle

**New angles (after a weak first batch)**: 3-4 creatives, all on angles **not** tested yet. Keep any hook with CTR above the account median.

**Iterate winner (4-6)**: hold the winning concept and change **one** variable per variant: new hook line · new first frame · presenter swap · 50% shorter cut · format port (video → static and carousel with the same message) · same demo with a new angle.

**Refresh fatigue (3)**: new first 3 seconds on the winner's body, plus one new-angle creative using the winner's proven demo shots.

## Production economics

Draft cheap, finish expensive. Hook shots get the best model and 2 takes; everything else uses the standard models. Target ≤ $4 generation per video and ≤ $1 per static (see `media-pipeline` registry). Reuse: the same b-roll library and cutouts serve the whole batch.

## Quality bar (the director's final check)

1. Hook works in 1.5s with sound off. The first frame works as a thumbnail.
2. The product shown is the product that ships (shape, color, size, parts, function).
3. One message; every claim is true and supported.
4. Text ≥ 48px at 1080w, high contrast, inside safe zones, on screen ≥ 1.5s per line.
5. Feels native (looks like a creator's post, not a TV ad); pacing ≈ a cut every 1-2.5s.
6. Audio: clear VO at about -14 LUFS, music ducked under the voice, no copyrighted tracks.
7. Ends with a clear action and reason (offer, shipping).

## Spec format (to producers)

Every task to a producer includes: product id, brief id, creative_slug, concept_family, angle, hook_type, format, aspect(s), duration, first-frame description, the full script or layout spec (`video-ad-scripting` YAML or static props JSON), source media URLs, brand theme, budget cap, and the registration fields to fill. Producers don't see your conversation; the spec must stand alone.
