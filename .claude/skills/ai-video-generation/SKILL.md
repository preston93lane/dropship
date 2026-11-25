---
name: ai-video-generation
description: Generate AI video shots for ads that look real and keep the product faithful - model selection by shot type and budget (Nov 2026 registry with deprecations), image-to-video from real product frames, prompt anatomy, camera/motion vocabulary, AI presenter rules (no fake testimonials), takes and cost control, and artifact QA. Use for any AI-generated clip, hook shot, b-roll or presenter segment.
---

# AI video generation

## When to use AI video (and when not)

| Use AI for | Use real footage for |
|---|---|
| Scroll-stopping hook scenes, lifestyle and b-roll, environment reveals, transitions, the "problem" scene (messy desk), seasonal/gift settings | Any shot where the product is handled, attached, opened, filled or operated; close-ups of mechanisms; size-in-hand shots |

AI models invent product behavior. A clip that shows the product doing something it can't is a deceptive ad (refunds, chargebacks, disapprovals). When the product moves in an AI shot, it must move like the real thing; otherwise keep it static and move the camera.

## Model selection (registry keys; prices checked on fal's model pages 2026-11-25)

| Shot | Key | ~$/s | Why |
|---|---|---|---|
| Drafts, cheap b-roll | `video.budget_i2v` | 0.04 (768p) | Fast iteration |
| Default product b-roll | `video.standard_i2v` | 0.07 | Good motion and fidelity per dollar |
| Hook / hero shot | `video.hero_i2v` | 0.11 | Best fidelity and motion where it matters most |
| Hero fallback | `video.premium_i2v` | 0.16 | When the hero model warps the product |
| Needs synced ambient sound or dialogue | `video.native_audio` | 0.30 (720p) | Pricey; use for 1 shot max |
| Fallback (refusals or outages) | `video.open_weights` | 0.10 | |
| AI presenter / talking head | `video.presenter` | 0.10 | Explainer style only (rules below); a 20s segment is about $2 |

**Deprecated, do not use**: OpenAI Sora 2 API (shut down 2026-09-24); Veo 3.1 on fal (reported removed 2026-11-17). The registry is the source of truth, and model-scouting updates it.

## Prompt anatomy (image-to-video)

`[subject + exact state] + [single action] + [camera move] + [lighting/time] + [style] + [constraints]`

Example: "The magnetic cable strip stays fixed under the desk edge; three cables slowly settle into the clips. Slow push-in, locked tripod, shallow depth of field. Soft morning window light. Realistic handheld-phone look, natural colors. Product shape, color and size unchanged; no text; no extra objects."

- **One action per clip**, 3-5 seconds. Stitch multiple clips rather than asking for a sequence.
- Camera vocabulary: slow push-in · pull-back reveal · orbit 30° · handheld drift · top-down · macro rack focus · whip pan (transition).
- Style for ads: "shot on phone, natural light, UGC look" usually outperforms "cinematic commercial".
- Put **no text** in AI video; add text in the edit.
- Always pass the real product frame as `image_url`; `fal_run.py` maps it onto each model's own field (`start_image_url` for Kling, `image_urls` for edit models) and applies the registry `defaults`. **Audio stays off** unless you set `generate_audio: true` (Kling defaults it on at +50% price). Kling takes its aspect from the start frame, so make the start frame 9:16. Duration: `"5"` is the cheap default.

## AI presenters (compliance-critical)

- Allowed: a presenter who **introduces, explains and demonstrates** the product ("Here's how this works…", "Three things to know…").
- Not allowed: a presenter **claiming personal experience or results** ("I've used this for 3 weeks and my back pain is gone"), posing as a customer, or reading reviews as if they were their own. That is a fabricated testimonial (FTC Consumer Review and Testimonials Rule; civil penalties per violation).
- Real reviews may be quoted as quotes: "One customer wrote: '…'", verbatim.
- Disclose: flag `ai_generated` on the creative so the media-buyer enables the platform's AI-generated-content label where required (TikTok requires labeling realistic AI content).
- Use 2-3 consistent presenter identities (look + voice) and track which performs; never imitate real people or celebrities.

## Takes and cost control

- Hook shot: 2 takes on the hero model; other shots 1 take on standard; re-generate only on a QA fail.
- Stop and ask the creative director if a single video exceeds $8 of generation.
- `fal_run.py` logs estimated cost to `/v1/costs` with `--ref <creative_slug>`.

## Artifact QA (check every clip's frames)

Product shape or proportions drift · added or missing parts · melting edges · text or logos morphing · hands with extra fingers · objects passing through each other · flicker · physics violations (cables floating) · face uncanniness on presenters · watermark. Any of these on the product = reject the take.
