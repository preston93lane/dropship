---
name: product-image-generation
description: Generate and edit product imagery with AI while keeping the product 100% faithful - background removal/cutouts, reference-based scene and lifestyle edits, hands/in-use shots, upscaling, first frames for image-to-video, model choice by job and cost, prompt patterns and fidelity QA. Use for any product photo, ad scene, thumbnail or i2v start frame.
---

# Product image generation

**Golden rule: the product in every image must be the product that ships.** AI changes shapes, counts, logos, textures and text. Always start from real product photos (supplier or sample), use **reference/edit** models rather than text-to-image, and compare outputs side by side with the source.

## Jobs → models (registry keys in `media-pipeline/models.json`)

| Job | Model key | Approx cost | Notes |
|---|---|---|---|
| Cutout (transparent PNG) | `image.remove_bg` | ~$0.005 | For motion graphics, statics and end cards |
| Upscale a low-res supplier photo | `image.upscale` | ~$0.03 | Before any edit, if source < 1000px |
| New background / context, product unchanged | `image.product_edit` | ~$0.08 | Default for lifestyle scenes |
| Lifestyle scene, multiple references | `image.scene` | ~$0.035 | Cheaper; check fidelity carefully |
| Hero image after fidelity failures | `image.hero` | ~$0.15 | Use sparingly |
| Mood board / composition drafts | `image.draft` | ~$0.003 | Never used in a final ad |

Run any of them with `media-pipeline/scripts/fal_run.py --model <key> --input @in.json --out <dir>`. Source images must be URLs (upload local files first with `upload.py`). Exact input field names vary by endpoint; check the model's fal page (model-scouting keeps the registry current). Typical fields: `prompt`, `image_url` / `image_urls`, `aspect_ratio`, `num_images`.

## Prompt pattern for edits

```
Keep the product exactly as in the reference image: same shape, proportions, color, materials, logo placement and parts.
Change only the environment: [setting], [surface], [lighting: soft morning window light], [camera: 50mm, eye level, shallow depth of field].
Composition: product occupies ~40% of frame, centered slightly low, clean negative space at the top for a headline.
Photorealistic product photography, natural shadows, no text, no extra objects touching the product.
```

- Ask for **negative space** where the template puts text (top for hero-benefits).
- Hands: "a hand gently holding the product from the side" works; complex manipulation often warps. Use real footage instead.
- Generate 2-4 variants cheaply, pick 1, and only then spend on upscale or the hero model.

## First frames for image-to-video

The i2v start frame decides the video's product fidelity. Make it at the target aspect (9:16), product sharp and fully visible, with room for the planned motion (e.g. space on the left for a pan).

## Fidelity QA (every final image)

Compare against the source photo: outline and proportions · color · count of parts · ports, buttons and logos · surface texture · scale vs. hand or objects. Reject on any mismatch; don't fix the product with more AI. Also check for garbled text on the product, extra fingers, impossible shadows and melted edges.

Log costs (`fal_run.py` does this when the gateway is configured) and record `models_used` on the creative.
