---
name: motion-graphics
description: Motion-graphics and video templating with Remotion (React) - the AdVideo master template (footage + VO + ducked music + hook card + feature callouts + word-by-word captions + end card), ProductShowcase (pure motion ad from one cutout) and KineticHook (text pattern-interrupt), props schemas, render commands, layout/safe-zone rules and animation craft. Use when editing or rendering any video ad or animated graphic.
---

# Motion graphics (Remotion)

Project: `remotion/` in this skill. React compositions render frame-perfect MP4s with typography and animation that AI video can't do reliably.

## Setup (once per session)

```bash
cd <this skill>/remotion && npm ci --silent       # ~20s; uses the preinstalled Chromium (/opt/pw-browsers/chromium)
./make-demo-assets.sh                            # optional: placeholder assets to preview templates
```

Assets: put files in `remotion/public/<job>/` and reference them as `"<job>/file.mp4"`, or use full https URLs.

## Compositions

### `AdVideo`: the master template
Props (`src/AdVideo.tsx`):
```json
{
  "width": 1080, "height": 1920, "fps": 30,
  "clips": [{"src": "job/hook.mp4", "type": "video", "duration": 2.4, "startFrom": 0.0},
            {"src": "job/product.png", "type": "image", "duration": 2.0, "motion": "zoom_in"}],
  "voiceover": "job/vo.mp3", "voiceoverOffset": 0.1,
  "words": [{"text": "POV:", "start": 0.12, "end": 0.4}],
  "music": {"src": "job/music.mp3", "volume": 0.14},
  "hook": {"text": "POV: you fixed the cable mess", "end": 2.2, "y": 0.2},
  "callouts": [{"text": "Holds 6 cables", "start": 3.0, "end": 5.0, "y": 0.3, "icon": "✓"}],
  "captions": {"y": 0.64, "maxWords": 3, "uppercase": false},
  "endCard": {"headline": "Tidy desk in 10 seconds", "cta": "Shop now", "image": "job/cutout.png", "price": "$29.99", "badge": "Free US shipping", "duration": 1.8},
  "theme": {"accent": "#FFE14D"},
  "progressBar": true
}
```
`words` = the `words.json` from `voiceover.py`. Duration is computed from clips, VO and end card. The last clip holds if the VO runs longer. Music ducks automatically under speech.

### `ProductShowcase`: motion ad from one cutout
`{product, title, features[{text}], endCard{...}, music?, secondsPerFeature?}`. Great for supplier-photo-only products and as the cheap concept in every test batch.

### `KineticHook`: 1.5-3s pattern interrupt
`{lines: ["STOP", "scrolling", "your desk", "is a mess"], secondsPerLine: 0.7}`. Render and prepend as the first clip of an `AdVideo`.

## Render

```bash
npx remotion render src/index.ts AdVideo /tmp/work/<slug>/out/raw.mp4 --props=/tmp/work/<slug>/props.json
npx remotion still src/index.ts AdVideo /tmp/work/<slug>/out/frame.png --props=... --frame=45 --scale=0.5   # quick visual check
```

Then always run `media-pipeline/scripts/finalize.py` (Remotion does not normalize loudness and outputs yuvj420p) and `qa_video.py --frames`.

Rendering defaults to concurrency 1. With this Chromium build, parallel tabs occasionally drop text layers (verified). Raise `REMOTION_CONCURRENCY` only after `npx remotion browser ensure` installs chrome-headless-shell. A 10s 1080x1920 ad renders in about 50s.

## Layout and animation rules

- **Safe zones (9:16)**: keep text between 10% and 78% of the height and out of the right 16% (TikTok/Reels buttons). The components already offset left and bottom.
- **Hierarchy**: hook card (biggest, top) → captions (mid-lower) → callouts (upper-mid, short, 2-4 words) → end card.
- **Timing**: hook visible 1.5-2.5s; each callout ≥ 1.5s; captions ≤ 3 words per page; end card 1.5-2s.
- **Motion**: springs for entrances (they feel physical); never animate more than 2 elements at once; something moves on screen at every moment (Ken Burns on stills).
- **Brand**: the accent color only for the highlight word, callouts and CTA. Inter Black for headlines.
- **Re-render, don't crop** for 4:5 and 1:1 (set width/height), so text re-lays out.

## Extending

New templates go in `src/` and are registered in `src/Root.tsx` with `calculateMetadata` so duration and size come from props. Keep components pure functions of `frame`; no `Math.random()` without a seed (renders must be deterministic). Run `npx tsc --noEmit` before rendering.
