---
name: media-pipeline
description: Shared media tooling for creative agents - the model registry (fal.ai endpoints, prices, deprecations) and scripts to run any AI model with cost logging (fal_run.py), synthesize voiceover with word-level timings (voiceover.py), edit ads with ffmpeg (assemble.py), finalize to platform specs (finalize.py), QA videos and extract frames (qa_video.py), and upload assets (upload.py). Use whenever generating, editing, checking or uploading media.
---

# Media pipeline

All scripts are Python 3 stdlib + ffmpeg (both preinstalled in the cloud sandbox). Every script supports `--dry-run` (or runs dry automatically without `FAL_KEY`), producing placeholder media so the whole pipeline can be exercised for free.

| Script | Does | Example |
|---|---|---|
| `fal_run.py` | Runs any fal model via the queue API, downloads outputs, estimates and logs cost | `fal_run.py --model video.hero_i2v --input @in.json --out shots/hook --ref cable-pov-01` |
| `voiceover.py` | TTS + word timestamps → `vo.mp3`, `words.json` | `voiceover.py --text-file vo.txt --voice Rachel --out vo/` |
| `assemble.py` | ffmpeg editor: clips + VO + captions + hook + callouts + ducked music + variants | `assemble.py edl.json` |
| `finalize.py` | Two-pass loudness to -14 LUFS, H.264 yuv420p, faststart, optional crops | `finalize.py raw.mp4 final.mp4` |
| `qa_video.py` | Spec checks + keyframes for visual review; exit 1 on hard fail | `qa_video.py final.mp4 --frames out/qa` |
| `upload.py` | Signed upload to the `creatives` bucket → public URL | `upload.py final.mp4 --path products/<id>/creatives/<slug>/final.mp4` |

## Model registry (`models.json`)

Keys like `video.hero_i2v`, `image.product_edit` and `audio.tts` map to fal endpoints with unit prices. Use keys, not raw endpoints, so the self-improver can swap models in one place. If the gateway setting `model_registry` exists (`gw GET /v1/settings/model_registry`), it is newer than this file: prefer it. Entries with `"verify": true` have not been confirmed against fal's live model pages; if a call fails with 404 or schema errors, check the endpoint's page, note it in your report, and fall back to the next model in the same group.

## Costs

`fal_run.py` and `voiceover.py` log estimated spend to `/v1/costs` (category `media`) when the gateway is reachable. Pass `--ref <creative_slug>` so cost per creative is traceable. Keep the fal account on **prepaid credits with auto-top-up off**: that's the hard cap on media spend.

## Credentials

`FAL_KEY` (and `GATEWAY_KEY`) are vault credentials. The sandbox only sees placeholders, substituted on the way out. Never print, write or pass keys in arguments or files.
