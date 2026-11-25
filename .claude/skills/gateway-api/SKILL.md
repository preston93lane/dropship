---
name: gateway-api
description: How every agent reads and writes business state and requests real-world actions (Shopify, Meta, TikTok, suppliers) through the policy-enforcing gateway. Use for any product, creative, brief, campaign, metric, report, cost or action operation, and whenever a task says "gw ...".
---

# Gateway API

The gateway is the only door to the database and to the outside world. You never hold Shopify or ad-platform credentials; you hold a scoped `GATEWAY_KEY`. The gateway enforces guardrails (spend caps, autonomy level, compliance) in code, so a request can come back **auto-executed**, **pending human approval**, or **rejected with reasons**. All three are normal outcomes.

## Calling it

Use the `gw` helper in this skill's `scripts/` directory (add it to PATH once per session):

```bash
export PATH="$PATH:<this skill's path>/scripts" AGENT_NAME=<your-agent-name>
gw GET /v1/summary
gw POST /v1/products '{"title":"Magnetic cable organizer", ...}'
gw POST /v1/actions @/tmp/action.json      # long payloads: write a file, pass @file
```

It prints the JSON body and `HTTP <code>`, and exits non-zero on 4xx/5xx. Read the error message: 409 means the state machine refused a transition (it says what is allowed), 422 means policy rejected the action (reasons included), and 403 means your key lacks the scope.

Keys are scoped per loop: research keys cannot submit actions, creative keys cannot touch products' status beyond creatives, and ops keys can do both. If you get a 403, the task belongs to another loop: hand it off through state (e.g. leave the product `validated`) instead of working around it.

## Endpoints

| Method & path | Scope | Purpose |
|---|---|---|
| `GET /v1/summary` | read | Guardrails, autonomy level, kill switch, pipeline counts, spend today, pending approvals |
| `POST /v1/economics` | research | `{cogs, shippingCost, price?}` → unit economics, suggested price, margin gates, test budget |
| `GET /v1/products?status=a,b&limit=` | read | List products |
| `POST /v1/products` | research | Create a candidate (dedupes by `dedupe_key`/title, 409 returns the existing one) |
| `GET /v1/products/:id` | read | Product + creatives + briefs + campaigns + ad performance + history |
| `PATCH /v1/products/:id` | research | Update fields; `{"status": "...", "reason": "..."}` moves it through the lifecycle (approving needs ops scope) |
| `POST /v1/products/:id/score` | research | Compute economics + score + verdict from stored components/supplier/flags |
| `GET/POST /v1/briefs`, `PATCH /v1/briefs/:id` | read/creative | Creative briefs (`?status=open`) |
| `GET/POST /v1/creatives`, `PATCH /v1/creatives/:id` | read/creative | Register creatives, move status (`in_production → in_review`) |
| `POST /v1/creatives/:id/compliance` | creative | Compliance verdict `{verdict: pass|revise|fail, issues[], checklist, frames[]}`. The only way a creative becomes `approved`. When the gateway's independent judge is on, a `pass` is re-checked by a separate model using `frames` (public https keyframe URLs) + the thumbnail; both must pass. `503` = judge unavailable, the creative stays `in_review`: retry later |
| `POST /v1/assets/sign` | creative | `{path}` → signed upload URL + public URL (use `media-pipeline/scripts/upload.py`) |
| `POST /v1/actions` | actions | Request a side effect (below) |
| `GET /v1/actions?status=`, `GET /v1/actions/:id` | read | Action queue and results |
| `GET /v1/performance?product_id=` | read | Per-ad lifetime stats + the guardian rule's current verdict for each ad |
| `GET /v1/allocation` | read | Thompson-sampling budget suggestion across live campaigns |
| `GET /v1/pnl?days=7` | read | P&L by day and product: ad spend, store revenue/orders/refunds (Shopify webhooks), product+shipping, fees, contribution after ads, machine cost, net, platform-vs-store attribution ratio. `contribution_source` says `store` or `modeled` |
| `GET /v1/insights/creatives?min_spend=5` | read | Performance grouped by format, style, hook_type, angle, concept_family, aspect, ai_generated + top creatives. Read it before planning a batch |
| `GET /v1/decisions?since=ISO` | read | Guardian decision log |
| `POST /v1/runs`, `PATCH /v1/runs/:id` | report | Open/close your loop run (`status`, `summary`, `llm_cost`, `media_cost`) |
| `POST /v1/costs` | report | `{category: media|research|samples|..., vendor, amount, ref}` |
| `POST /v1/reports`, `GET /v1/reports?kind=` | report/read | Reports; `summary` is pushed to the human's phone |
| `GET/POST /v1/experiments`, `PATCH /v1/experiments/:id` | read/report | Experiments |
| `POST /v1/proposals`, `GET /v1/proposals` | improve/read | Improvement proposals for human review |
| `GET /v1/outcomes`, `POST /v1/calibrate` | read/improve | Launch outcomes; bounded score-weight calibration |
| `GET/PUT /v1/settings/:key` | read/improve | Agents may write only `model_registry`, `creative_playbook_index`, `research_sources` |

## Actions (`POST /v1/actions`)

```json
{"type": "ads.create_test", "payload": {...}, "rationale": "why, in one or two sentences", "idempotency_key": "optional-unique-string"}
```

| type | payload | Notes |
|---|---|---|
| `shopify.create_product` | `{product_id, listing: {title, descriptionHtml, vendor?, productType?, tags[], images[{url, alt}], options[{name, values[]}], variants[{optionValues{}, price, compareAtPrice?, sku?}], seo{title, description}}}` | Always created as DRAFT |
| `shopify.update_product` | `{product_id, listing: {...partial}}` | |
| `shopify.publish_product` / `shopify.unpublish_product` | `{product_id}` | Unpublish always allowed |
| `shopify.set_price` | `{product_id, price, compare_at_price?}` | Big changes need a human |
| `tiktok_shop.list_product` | `{product_id}` | Only US-stock products |
| `ads.create_test` | `{product_id, channel: meta|tiktok, dailyBudget, creative_ids[], landing_url?, name?}` | Created PAUSED; every creative must be compliance-approved |
| `ads.activate` | `{campaign_id}` | Starts spend |
| `ads.set_budget` | `{campaign_id, dailyBudget}` | Max step +30% per change |
| `ads.pause` | `{campaign_id}` or `{ad_id}`, `kill?: true`, `reason` | Always allowed, even with the kill switch on |
| `ads.scale_duplicate` | `{ad_id, dailyBudget}` | Copies a proven ad into a scaling campaign |
| `supplier.order_sample` | `{product_id, quantity}` | Capped per week |
| `notify.human` | `{message, severity: info|warn|critical}` | Use sparingly |

Response `status`: `succeeded` (done, see `result`), `pending_approval` (a human decides in the console — report it, don't resubmit), `rejected` (read `policy.reasons`, change the request or stop), `failed` (`error` says why; fix inputs or escalate).

## Rules

- Never fabricate state. If the gateway says something is missing, it is missing.
- Use `idempotency_key` for anything you might retry.
- Put a real `rationale` on every action: a human may read it on their phone to approve.
- Never try to bypass the gateway (no direct platform API calls, no credentials in files or messages).
