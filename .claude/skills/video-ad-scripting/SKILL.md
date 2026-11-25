---
name: video-ad-scripting
description: Write short-form video ad scripts and shot lists that hold attention and sell - hook bank by type, beat structures for 9-15s / 20-30s / 30-45s ads, VO pacing, on-screen text rules, first-frame design, and the script spec format the video producer executes. Use for any video ad, UGC/presenter script, or iteration of a winning video.
---

# Video ad scripting

Short-form ads win or lose in the first 1.5 seconds and the first 3 seconds' retention. Write for **sound off** (captions + on-screen text carry it) and **sound on** (voice and sound design add energy). Native beats polished.

## Structures

**A. Demo-led (15-20s)**: the default for "wow" products
| t | Beat | Notes |
|---|---|---|
| 0-1.5s | **Hook**: the problem or the wow, visually | First frame = thumbnail; motion starts at frame 1 |
| 1.5-4s | Problem, felt | One relatable moment ("every time I…") |
| 4-11s | **Demo**: product solves it, 2-3 quick shots | Real footage when the product is handled |
| 11-15s | Proof/benefit stack | 2-3 callouts (true features) |
| 15-18s | Offer + CTA | Price/bundle/shipping, "tap Shop Now" |

**B. Presenter/UGC-style (20-30s)**: hook line to camera → why the usual fixes fail → show it → three benefits → objection handled → CTA. The presenter *explains and demonstrates*; never claims personal results unless it is a real customer or creator who actually used it.

**C. Listicle (25-40s)**: "3 things that fixed my…" (brand voice) or "3 reasons…", with our product as one strong item.

**D. Comparison (15-25s)**: the usual way vs. ours, side by side; claims must be true for both sides.

**E. Motion-graphic showcase (8-12s)**: cutout product + feature callouts + offer; for products with only supplier photos, or as a cheap variant.

## Hook bank (by type, write the first frame for each)

- Problem callout: "If your desk looks like this…" [tangled cables close-up]
- POV: "POV: you finally fixed the cable mess" [clean desk reveal]
- Negative: "Stop using zip ties for your cables" [cutting a zip tie]
- Demo-first: (no words) [cables snapping onto the strip, satisfying click]
- Curiosity: "This $30 thing made my desk look twice as expensive" (only if the price is true)
- Comparison: "Zip ties vs. this" [split screen]
- Question: "Why does every desk setup on Pinterest look clean?"
- Pattern interrupt: kinetic text "STOP / scrolling / your desk / is a mess"

## VO and text

- Pace: about **2.6-3.0 words per second**. A 15s ad is about 35-40 words. Read it aloud and cut 20%.
- On-screen text: ≤ 6 words per line, ≥ 1.5s on screen, in the safe zone (not the bottom 20% or right 15% on 9:16).
- Captions mirror the VO word-for-word (the pipeline makes them).
- End with the action and the reason: "Tap Shop Now — free US shipping."

## Script spec (hand this to the video producer)

```yaml
creative_slug: cable-pov-01
angle: desk glow-up in 10s
hook_type: pov
duration_s: 17
aspect: 9:16
first_frame: "close-up of tangled cables under a desk, morning light"
voiceover: "POV: you finally fixed the cable mess. Six cables, one magnetic strip, ten seconds. No zip ties, no tools. Tap Shop Now — free US shipping."
shots:
  - {t: "0-1.6", source: ai_i2v, from: "products/<id>/source/lifestyle1.jpg", prompt: "slow push-in on tangled cables under a wooden desk, morning light", text: "POV: you fixed the cable mess"}
  - {t: "1.6-6", source: supplier_video, from: "products/<id>/source/demo.mp4", in: 3.2, note: "cables snapping onto strip"}
  - {t: "6-11", source: motion_graphic, template: ProductShowcase, callouts: ["Holds 6 cables", "No tools needed"]}
  - {t: "11-15", source: ai_i2v, prompt: "clean minimal desk, camera glides left, warm light", from: "products/<id>/source/hero.jpg"}
end_card: {headline: "Tidy desk in 10 seconds", price: "$29.99", badge: "Free US shipping", cta: "Shop now"}
music: "upbeat lo-fi, licensed library or generated"
```

## Iterating a winner (one variable at a time)

New hook on the same body · new first frame · a different presenter or voice · shorter cut (keep the best 10s) · same script in another format (motion graphic ↔ presenter) · a new angle reusing the winning demo shots.
