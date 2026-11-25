---
name: ad-compliance
description: The compliance gate for ads, product pages and offers - Meta and TikTok ad policy essentials, FTC rules (Consumer Review and Testimonials Rule, endorsements, substantiation, Made in USA, pricing), AI-generated content disclosure, product fidelity, IP and music rights, with a section-by-section checklist and verdict format. Use to review any creative or claim before it can run.
---

# Ad compliance

Dropshipping stores die from three things: ad accounts banned for policy violations, payment processors freezing funds over chargebacks ("item not as described"), and regulatory exposure for fake reviews and unsupported claims. This gate exists to prevent all three. **Not legal advice**: when something is genuinely ambiguous, fail it or escalate to the human.

## Checklist

### 1. Prohibited / restricted
- [ ] Product category allowed on Meta and TikTok and in the business profile (no weapons, drugs, adult, unapproved supplements, tobacco/vapes, counterfeit, etc.)
- [ ] No "before/after" **body** imagery or framing (weight, skin, hair) and no body shaming. Before/after of *objects* (a messy vs. tidy desk) is fine.
- [ ] No sensational, shocking, violent or sexual content; no misleading "system" UI (fake play buttons, fake notifications or OS dialogs)
- [ ] No personal-attribute assertions ("Are you overweight?", "Other single moms…"): talk about situations, not the viewer's traits

### 2. Claims (substantiation)
- [ ] Every objective claim (numbers, materials, speed, compatibility, durability, "waterproof") matches the supplier spec or our own test, with the source noted
- [ ] No health or medical claims (cures, treats, relieves, prevents, therapeutic), no weight-loss claims, no earnings claims
- [ ] No superlatives needing proof ("#1", "best-selling", "doctor/dermatologist recommended", "clinically proven") unless documented
- [ ] "Made in USA" only if all or virtually all of it is (dropshipped items almost never qualify)
- [ ] "Free" really is free; shipping times match the policy and supplier reality

### 3. Reviews, testimonials, endorsements (FTC Consumer Review and Testimonials Rule)
- [ ] No fake or AI-generated reviews or testimonials; no reviews that misrepresent the reviewer's existence or experience
- [ ] AI presenters explain or demonstrate only; they never claim personal use or results or pose as customers
- [ ] Quoted reviews are verbatim from real customers of **this** store's product, attributed generically; ratings and review counts are real
- [ ] Creators or affiliates (when used) disclose the material connection (#ad / the platform's paid-partnership toggle)

### 4. Product fidelity ("item as described")
- [ ] Product in every frame matches the shipped item: shape, size (scale cues honest), color options, included parts, function
- [ ] AI scenes don't show capabilities the product lacks; no exaggerated results
- [ ] Bundle and variant shown = the variant linked

### 5. Offer integrity
- [ ] Prices and discounts match the store; compare-at prices are real
- [ ] No fake urgency (countdowns that reset, false "only N left", fake "sale ends tonight")
- [ ] Guarantee and returns statements match the store policy

### 6. AI-generated content disclosure
- [ ] Realistic AI-generated people, voices or scenes are flagged `ai_disclosure_required: true` in the compliance notes, so the media-buyer turns on the platform's AI-generated content label (TikTok requires labeling realistic AIGC; Meta labels some AI content and requires disclosure in certain ad categories)
- [ ] No synthetic likeness of a real person, celebrity or public figure

### 7. Intellectual property
- [ ] No trademarks, logos or brand names (ours excepted), characters, copyrighted footage from other stores or creators, or celebrity imagery
- [ ] Music is from a licensed commercial library (TikTok Commercial Music Library, Meta Sound Collection, or a generated track with commercial rights), never trending copyrighted tracks
- [ ] Comparisons with competitors are truthful and don't use their marks confusingly

### 8. Craft blockers (verdict "revise")
- [ ] Text legible at phone size, inside safe zones, no typos, captions match the VO

## Verdict

`gw POST /v1/creatives/<id>/compliance`:
```json
{"verdict": "revise",
 "issues": [{"severity": "high", "location": "00:04-00:06 VO", "problem": "\"never tangles again\" is not supported", "fix": "say \"keeps up to 6 cables in place\""}],
 "checklist": {"prohibited": "ok", "claims": "issue", "testimonials": "ok", "fidelity": "ok", "offer": "ok", "ai_disclosure": "required", "ip": "ok", "craft": "ok"},
 "notes": "ai_disclosure_required: true"}
```
`pass` = all sections ok (disclosure flagged where needed). `revise` = specific, fixable issues. `fail` = the concept depends on a violation.

## Listings and offers

Use the same sections for PDP copy, prices, bundles and guarantees when the orchestrator or store-manager asks.
