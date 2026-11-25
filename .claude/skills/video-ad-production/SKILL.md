---
name: video-ad-production
description: End-to-end pipeline for producing a finished short-form video ad from a script spec - asset gathering, shot generation, voiceover with word timings, edit in Remotion (or ffmpeg), finalize to platform specs, technical + visual QA, variants, upload and registration. Use whenever making or iterating a video ad.
---

# Video ad production

```
spec (script + shots) → assets → shots (AI i2v / presenter / supplier / sample footage / motion graphics)
  → voiceover.py (vo.mp3 + words.json) → edit: Remotion AdVideo (default) or assemble.py (fast path)
  → finalize.py (-14 LUFS, H.264 yuv420p, faststart) → qa_video.py --frames (+ look at frames)
  → variants (re-render 4:5 / 1:1) → upload.py → gw POST /v1/creatives
```

Work in `/tmp/work/<creative_slug>/` with subfolders `source/ shots/ vo/ out/`.

## 1. Assets

- Download the source media listed in the spec (product photos and supplier video from our storage).
- Prefer **real footage** for any shot where the product is touched, opened, attached or operated. AI is for scene-setting, hooks, b-roll, lifestyle and transitions.
- Make cutouts for motion graphics (`product-image-generation` → `image.remove_bg`).

## 2. Shots

- Image-to-video from real-product start frames (`ai-video-generation` for model choice and prompts). Hook shot: 2 takes on the hero model, keep the best. Others: 1 take on the standard model.
- Supplier clips: trim to the best 1.5-3s moments; crop to 9:16; drop their watermark and branded segments (don't use footage with another store's branding).
- Motion-graphic segments: Remotion `ProductShowcase` or callouts inside `AdVideo`.

## 3. Voiceover and timings

```bash
python3 <media-pipeline>/scripts/voiceover.py --text-file vo.txt --voice "<voice>" --out vo/
```

Pick a voice that matches the avatar (energetic and friendly for gadgets, calm for home). Keep the same voice across a concept family. Without a voice (music-only demo), captions come from the on-screen text plan.

## 4. Edit

**Remotion (default; best motion quality)**: copy assets into `<motion-graphics>/remotion/public/job/`, write props (see `motion-graphics`), then:

```bash
cd <motion-graphics>/remotion && npm ci --silent   # once per session
npx remotion render src/index.ts AdVideo /tmp/work/<slug>/out/raw.mp4 --props=/tmp/work/<slug>/props.json
```

**ffmpeg fast path** (simple cut + captions, ~15s render): write an EDL and run `assemble.py edl.json` (see its docstring).

## 5. Finalize, QA, variants

```bash
python3 <media-pipeline>/scripts/finalize.py out/raw.mp4 out/final_9x16.mp4
python3 <media-pipeline>/scripts/qa_video.py out/final_9x16.mp4 --frames out/qa
```

Then **look at every frame in `out/qa/`** with the read tool. Check product fidelity, text legibility and safe zones, AI artifacts, and the first frame as a thumbnail. Fix and re-render rather than ship a flaw.

For 4:5 and 1:1, **re-render** the composition at the new size (set `width`/`height` in props). Use `finalize.py --variants` (centre crop) only when all text sits in the middle 60%.

## 6. Ship

Upload master, variants and thumbnail with `upload.py` (path `products/<product_id>/creatives/<slug>/…`), then register:

```bash
gw POST /v1/creatives @creative.json   # status "in_review" when you're done with QA
```

with `product_id, brief_id, format: "video", style, aspect: "9:16", concept_family, angle, hook_type, hook_text, script, primary_text, headline, asset_url, thumbnail_url, variants {"4:5": url}, duration_s, models_used[], production_cost, ai_generated`.

## Specs that matter

9:16 1080x1920, 30fps, H.264 High yuv420p, AAC 48k, -14 LUFS, ≤ 60s (sweet spot 12-25s for tests), first frame meaningful, captions on, text in safe zones, real product in the demo.
