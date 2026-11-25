# 07 · Setup: accounts, keys and deployment, in order

Do these in order; each step is testable on its own. Never paste secrets into chats, prompts or committed files.

## 0. Local (15 minutes, free)

Prereqs: Node 22+, git, [Claude Code](https://code.claude.com).

```bash
npm ci
npm test && npm run typecheck          # engine + gateway tests
npm run dev:gateway                    # API + console on http://localhost:8787 (admin key: dev-admin-key)
```

In another terminal:

```bash
export GATEWAY_URL=http://localhost:8787 GATEWAY_KEY=dev-agent-key
claude    # then: "act as the product-analyst and run the RESEARCH loop for <niche>"
```

Fill in `.claude/skills/business-profile/SKILL.md` first (niche, brand, avatar, exclusions).

## 1. fal.ai (media)

1. Create an account; add **prepaid credits** ($20-50 to start) and turn **auto-top-up off**. That's your hard media cap.
2. Create an API key → `export FAL_KEY=...` locally (cloud: vault credential, step 6).
3. Open each fal model page for the `verify: true` entries in `.claude/skills/media-pipeline/models.json`; fix the endpoint ids and input fields.
4. `cd .claude/skills/motion-graphics/remotion && npm ci && ./make-demo-assets.sh && npx remotion render src/index.ts AdVideo out/test.mp4 --props=props/example-ad.json`

## 2. Supabase (state, gateway, guardian)

```bash
npm i -g supabase                                        # or brew install supabase/tap/supabase
supabase login && supabase link --project-ref <ref>      # create the project in the dashboard first
supabase db push                                         # applies supabase/migrations
cp .env.example .env                                     # fill it in; keep DRY_RUN=true for now
supabase secrets set --env-file .env
supabase functions deploy gateway --no-verify-jwt
supabase functions deploy guardian --no-verify-jwt
```

Generate secrets with `openssl rand -hex 32`. Create **four scoped agent keys** and put them in
`GATEWAY_AGENT_KEYS_JSON`:

```json
{"<research-key>": ["read","research","report"],
 "<creative-key>": ["read","creative","report"],
 "<ops-key>": ["read","research","creative","actions","report"],
 "<improve-key>": ["read","improve","report","research"]}
```

Then run `supabase/sql/schedule_guardian.sql` in the SQL editor (replace the placeholders) and open
`https://<ref>.supabase.co/functions/v1/gateway/console`.

Replace `YOUR_PROJECT_REF` in `.claude/skills/gateway-api/gateway.env` and `environments/*.yaml`.

## 3. Shopify

1. Store on a plan with Shopify Payments; domain; a fast theme (Dawn is fine) with sticky add-to-cart.
2. Policies (refund, shipping, privacy, terms, contact) that match the supplier's real delivery times.
3. Apps: supplier (CJ Dropshipping / DSers / AutoDS), a reviews app (real reviews only), **Facebook & Instagram** and **TikTok** sales channels (these install pixels and server-side events).
4. Settings → Apps → Develop apps → create a custom app with Admin API scopes `write_products`, `read_products`, `write_publications`, `read_publications`, `read_inventory` → install → copy the Admin API token into `SHOPIFY_ADMIN_TOKEN`.
5. Publication ids: run `{ publications(first: 10) { nodes { id name } } }` in the Shopify GraphiQL app; set `SHOPIFY_ONLINE_STORE_PUBLICATION_ID` and `SHOPIFY_TIKTOK_PUBLICATION_ID`.
6. **Verify on a development store first**: set `DRY_RUN=false`, `supabase secrets set ...`, create one draft listing via the store-manager, check it in admin.

## 4. Meta (Facebook/Instagram ads)

1. Business Manager → verify your domain → add the Page and the Instagram account.
2. Ad account → **Payment settings → Account spending limit** (your absolute monthly cap).
3. Pixel + Conversions API via the Shopify Facebook & Instagram app; check that Purchase events arrive (Events Manager).
4. Business settings → System users → add an admin system user → assign the ad account, Page and pixel → generate a token with `ads_management`, `ads_read`, `business_management` → `META_ACCESS_TOKEN`.
5. Set `META_AD_ACCOUNT_ID` (digits), `META_PAGE_ID`, `META_PIXEL_ID`, `META_INSTAGRAM_USER_ID`, `META_API_VERSION`.
6. Verify: launch one $5/day test via the gateway → activate → check Ads Manager → pause.

## 5. TikTok (optional at first)

Ads Manager account with an **account budget limit**; pixel and Events API via the Shopify TikTok app; a
TikTok for Business developer app → long-term access token → `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`,
`TIKTOK_PIXEL_ID`, an identity. Verify with a paused test as for Meta.

## 6. Managed Agents (the autonomous loops)

Prereqs: an Anthropic API key with Managed Agents access and the `ant` CLI ≥ 1.40 (`ant auth login` or `ANTHROPIC_API_KEY`).

```bash
grep -rn YOUR_ environments deployments .claude/skills/gateway-api   # fill every placeholder except vault ids for now
npm run agents:plan                       # dry run: shows every agent, skill, environment, vault, memory store
```

**First apply, without deployments** (they would start firing immediately):

```bash
npm run skills:clean && ant apply agents environments vaults memory_stores   # review the plan, answer y
npm run playbook:seed
```

**Vault credentials** (Console → Managed Agents → Vaults is easiest; header-only injection is the Console default and is correct here). For each vault add `GATEWAY_KEY` = that loop's scoped key, allowed host `<ref>.supabase.co`. In the **creative** vault also add `FAL_KEY` with allowed hosts `queue.fal.run`, `fal.run`, `*.fal.media`. CLI alternative:

```bash
ant beta:vaults:credentials create --vault-id <vlt_...> <<'YAML'
display_name: gateway key (ops)
auth:
  type: environment_variable
  secret_name: GATEWAY_KEY
  secret_value: <paste the ops key here, then clear your shell history>
  networking: {type: limited, allowed_hosts: [<ref>.supabase.co]}
  injection_location: {header: true, body: false}
YAML
```

**Smoke-test each agent** with a one-off session before scheduling:

```bash
AGENT=$(jq -r '.resources["./agents/product-analyst.md"].id' claude-lock.json)
ENV=$(jq -r '.resources["./environments/research.yaml"].id' claude-lock.json)
# attach the loop's vault (flag name per `ant beta:sessions create --help`)
SID=$(ant beta:sessions create --agent "$AGENT" --environment-id "$ENV" --vault-ids <vlt_research> --title "smoke test" --transform id -r)
ant beta:sessions:events send --session-id "$SID" --event '{type: user.message, content: [{type: text, text: "Run gw GET /v1/summary and report what you see."}]}'
ant beta:sessions:events stream --session-id "$SID"
```

**Then schedule**: put the vault ids (`vlt_...` from `claude-lock.json`) into `deployments/*.md` and run
`npm run agents:apply`. Check `schedule.upcoming_runs_at` in the output. Run each once by hand:
`ant beta:deployments run --deployment-id <depl_...>`.

**Event wakeups**: set `ANTHROPIC_API_KEY` and `LOOP_DEPLOYMENTS_JSON` (`{"create": "depl_...", "adapt": "depl_..."}`) in Supabase secrets.

## 7. Go live

1. `DRY_RUN=false` only after each adapter you use has passed its verification step.
2. Console: autonomy **L1**, caps at the comfortable minimum, kill switch off.
3. Watch the first week closely: approvals, decisions, daily reports. Then let the track record decide.

## Changing things later

- Prompts and skills: edit the files → `npm test` → commit → `npm run agents:apply` (new agent versions; deployments pick up the latest).
- Schedules and budgets: edit `deployments/*.md` → apply.
- Guardrails: the console. Rules and weights: settings (`rules`, `score_weights`) via the admin key.
- Pause everything (agents): `ant beta:deployments pause --deployment-id …` for each. Pause spend: the kill switch.
