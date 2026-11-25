# 06 · Guardrails, compliance and security

## Money guardrails (defaults; change them in the console)

| Guardrail | Default | Enforced by | Effect |
|---|---|---|---|
| Autonomy level | L1 | gateway policy | See `04-roadmap.md` for what each level auto-runs |
| Kill switch | off | gateway policy + console | On: only pause/unpublish allowed; turning it on pauses all active campaigns |
| Max total daily ad budget | $100 | gateway policy | Sum of active daily budgets can't exceed it (rejected) |
| Max per ad set/day | $40 | gateway policy | Rejected above |
| Max budget step | +30% per change | gateway policy | Larger jumps rejected (also protects learning) |
| New tests per day | 2 | gateway policy | Rejected above |
| Products testing at once | 4 | gateway policy | Rejected above |
| Auto price change | ≤ 15% | gateway policy | Larger needs a human at any level |
| Sample orders | ≤ $60 each, ≤ 3/week | gateway policy | Rejected above |
| Spend guard | 115% of daily cap | guardian | Trips the kill switch, pauses everything, critical alert |
| Platform caps | you set them | Meta/TikTok/fal | Account spending limit, account budget, prepaid credits (the last line of defense) |
| Per-run LLM budget | $1.50-$12 per loop | Managed Agents | Session pauses at the cap |

**Set the platform caps.** They are the only guardrails that hold even if everything else fails.

## Human-in-the-loop points

- At L1: activating spend, publishing listings, raising budgets, sample orders, TikTok Shop listing
- At every level: big price changes, guardrail and autonomy changes, merging improvement proposals, vault credentials
- Notifications: approvals, winners, kill switch, failed actions, daily report, weekly retro

## Compliance (what the compliance gate enforces)

Full checklist: `.claude/skills/ad-compliance/SKILL.md`. Highlights:
- **FTC Consumer Review and Testimonials Rule**: no fake or AI-generated reviews or testimonials; AI presenters
  may explain and demonstrate, never claim personal experience. Real reviews are quoted verbatim. The FTC has
  warned of civil penalties per violation (reported at up to ~$53k each in its Dec 2025 warning letters).
- **Substantiation**: every objective claim is backed by product facts; no health, medical, weight-loss or earnings claims.
- **Pricing**: real compare-at prices only; no fake urgency or scarcity; "Made in USA" only if true.
- **Platform policy**: no body before/after; no personal-attribute targeting language; no fake UI; licensed music only.
- **AI disclosure**: realistic AI content is flagged so the AI-generated-content label is applied (TikTok requires it).
- **Product fidelity**: ads must show the product that ships; this prevents "not as described" chargebacks.

The compliance verdict is the *only* way a creative becomes `approved`, and campaigns can't be created or
activated with unapproved creatives (enforced in code). With `ANTHROPIC_API_KEY` set on the gateway, every
agent `pass` is re-checked by an independent model call the agents can't influence; both must pass, and if
the judge is unavailable the creative stays in review.

**This is not legal advice.** For a business at scale, have an attorney review the store policies, your
claims-substantiation practice and the AI-disclosure approach.

## Security model

| Threat | Mitigation |
|---|---|
| Prompt injection from web pages (research) | Research sessions hold a key without `actions` scope; they can create candidates but can't spend, publish or launch. Agents are instructed to treat web content as data |
| Credential exfiltration from the sandbox | Vault `environment_variable` credentials: the sandbox sees a placeholder, substituted at egress only for the credential's allowed host. Platform tokens never reach agents (gateway only) |
| An agent approving its own work | Compliance is a separate endpoint and agent; producers can't move creatives to `approved`; an independent server-side judge must also pass every creative |
| Someone else pressing your Telegram buttons | Only `TELEGRAM_CHAT_ID` is obeyed; the webhook requires Telegram's secret token header; `/kill` can only reduce risk |
| Forged order webhooks | Shopify HMAC signature verified on every request |
| An agent changing its own limits | Guardrails, autonomy and caps are human-only settings; the self-improver can only *propose* |
| Runaway spend | Layered caps (platform → policy → spend guard → per-run budgets) |
| Bad self-modification | Proposals are human-reviewed git diffs, eval-backed; `ant apply` versions every agent (roll back by re-applying an older commit) |
| Console access | Admin key over HTTPS, HttpOnly + Secure + SameSite=Strict cookie; rotate `GATEWAY_ADMIN_KEY` if exposed |
| Data retention | Managed Agents sessions persist until deleted (beta; not ZDR-eligible). Don't put customer PII in agent sessions; the support agent (P07) needs a PII design first |

## Incident runbook

1. **Spend anomaly**: send `/kill` to the Telegram bot, or console → Kill switch ON (pauses everything). Check `decisions` and `actions`. Fix, then turn it off in the console.
2. **Ad account restricted**: kill switch ON; read the platform notice; the compliance-reviewer audits the last 14 days of creatives; appeal only with fixes in place.
3. **Leaked key**: rotate it (Supabase secrets, vault credential, platform token). Scoped keys limit the blast radius.
4. **Agent misbehaving**: pause its deployment (`ant beta:deployments pause --deployment-id …`), inspect the session in the Console session viewer, fix the prompt or skill via a proposal, re-apply, unpause.
5. **Supplier failure**: unpublish the affected products, pause their ads, notify customers (support), switch to the backup supplier.
