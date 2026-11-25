# Operator guide

Written for you, the person running this business. It covers four things: what was built, how to use it,
what's needed from you, and the best way to run it. The other docs go deeper; this is the one to keep open.

---

## 1. What was built

**An AI team, a set of rules that holds the money, and the plumbing between them.**

| Part | What it does | Where |
|---|---|---|
| **12 agents** | Research (product-analyst + trend-scout), marketing (strategist), design (creative-director, static-designer, video-producer), compliance, Shopify/TikTok Shop (store-manager), ad buying (media-buyer), management (orchestrator), reporting (performance-analyst), self-improvement (self-improver) | `agents/` |
| **28 skills** | The know-how each agent uses: product research, teardowns, suppliers, economics, angles/offers, copy, scripts, product pages, creative strategy, static design, product imagery, AI video, motion graphics, the video pipeline, compliance, Meta, TikTok, kill/scale, Shopify, TikTok Shop, reporting, retrospectives, prompt evolution, model scouting | `.claude/skills/` |
| **The loops** | Research → plan → create → execute → adapt → report → improve, on a schedule, as cloud agents | `deployments/` |
| **The guardian** | Plain code (no AI) that checks every ad every 30 minutes: kills losers, flags winners, catches runaway spend | `supabase/functions/guardian` |
| **The gateway** | The only door to your store and ad accounts. Enforces your caps, autonomy level and the compliance gate, and holds every credential | `supabase/functions/gateway` |
| **Your controls** | A phone-friendly console, plus Telegram: one-tap approvals, `/status`, `/pnl`, `/kill` | `/console`, Telegram bot |
| **Ad production** | AI video + motion-graphics templates + static-ad templates + voiceover/captions + export to platform specs | `.claude/skills/{motion-graphics,static-ad-design,media-pipeline}` |

**What changed in the latest pass** (fixes and step-ups):
- **Fixed**: the guardian re-sent the same "scale this" alert every 30 minutes while it waited for you; a product sent back for new angles had its second round killed instantly (its budget was already spent); TikTok tests could be created with no usable (video) ads; the research loop pointed at the wrong settings file; cache files were committed by mistake.
- **Fixed with live data**: I checked every AI media model against fal.ai's live pages. Four model addresses were wrong, the presenter model costs $0.10/s (not $0.02), and the hero video model turns audio on by default (50% more expensive). The registry and runner now handle this automatically.
- **New**: Telegram one-tap approvals and an emergency `/kill`; Shopify order webhooks, so profit is measured from real orders and refunds, not ad-platform claims; an **independent compliance judge** that must also pass every ad; creative insights (which formats, hooks and angles actually win); demo data, a one-command loop runner and a deployment smoke test; a clearer console (plain-English approvals, proper money formatting).

---

## 2. How to use it

### Today, on your computer (free, no accounts)

```bash
npm ci
npm run demo            # a realistic week of fake data: a winner, kills, an approval waiting for you
npm run dev:gateway     # the console at http://localhost:8787/console  (admin key: dev-admin-key)
```

Open the console. Approve the budget increase, launch or reject the waiting product, read the P&L card.
Then run a real loop with Claude Code (in a second terminal):

```bash
npm run loop -- research     # or: plan, create, execute, adapt, report, improve, strategy
```

That's the whole system working, minus real money and real ads.

### Once you're live (cloud)

You don't run anything. The loops fire on schedule, and you interact through three surfaces:

| Surface | Use it for |
|---|---|
| **Telegram** | Approve or reject with one tap. `/status` for a snapshot, `/pnl` for the last 7 days, `/pending` to re-send approvals, **`/kill` to stop all spend instantly** |
| **Console** (`…/functions/v1/gateway/console`) | Change caps and autonomy, turn the kill switch off, launch validated products, review improvement proposals, read reports and logs |
| **This repo** | Edit the business profile, prompts and skills; merge improvement proposals; `npm run agents:apply` to ship changes |

### What a normal day looks like (all automatic)

05:17 research finds and validates products → 06:47 the orchestrator approves the best into open test slots and briefs the creative team → 08:23 ads get made and compliance-checked → 11:13 listings are built and tests launched (you approve the spend at L1) → every 30 min the guardian kills losers and flags winners → 09:37 and 18:37 the media buyer handles scaling and fatigue → 20:53 the daily P&L report lands on your phone → Sundays the self-improver writes the retro, updates the playbook and proposes improvements.

---

## 3. What I need from you

Things only you can do, in the order you'll hit them.

### Decisions (day 1)
- [ ] **Niche, brand name, customer, exclusions** → edit `.claude/skills/business-profile/SKILL.md`. This steers everything. Pick something demonstrable on video, $25-60, with US-warehouse suppliers.
- [ ] **Money**: an ad-testing budget (I recommend $1,500-3,000) and a monthly tooling budget (~$200-320 in Lean mode until the first winner).
- [ ] **Timezone**: schedules default to America/New_York (`deployments/*.md`).

### Accounts and keys (week 1-2, see `docs/07-setup.md`)
- [ ] **Anthropic API key** with Managed Agents access, plus the `ant` CLI (≥ 1.40)
- [ ] **fal.ai**: prepaid credits ($20-50), **auto-top-up off**
- [ ] **Supabase** project (free tier to start)
- [ ] **Telegram** bot via @BotFather (2 minutes)
- [ ] **Shopify** store + apps (supplier app, reviews, Facebook & Instagram, TikTok), a custom app token, and order webhooks
- [ ] **Meta** Business Manager: pixel + Conversions API, **an ad account spending limit**, a system-user token
- [ ] Later: **TikTok** Ads, and TikTok Shop once you have a US-stock winner

I can't create accounts, enter payment details or hold your keys, and you shouldn't paste keys into a chat.
Every key goes into Supabase secrets or a Managed Agents vault, as the setup doc shows.

### Live verification (week 2-4, ~1 hour each)
The Shopify, Meta and TikTok connections are written to each platform's API but haven't touched a real account.
Before turning `DRY_RUN` off for each: create one draft listing on a **development store**; run one $5/day
**test campaign** through create → activate → budget → pause; place one test order and watch it reach the P&L.
`npm run smoke` checks the deployment itself.

### Your judgment (first 2-4 weeks)
- Review what research validates and what the creative team makes. Where you disagree, edit the skill, because that's how the system learns your taste.
- Approve spend from Telegram (that's what level 1 means). Expect 2-5 taps a day.
- **Order samples of winners** and film real product footage. It beats AI for any shot where the product is handled.

### Ongoing (only you)
Store policies that match reality, the business's legal setup, and an attorney review once you're at scale.

---

## 4. The best way to use the whole thing

**1. Start local, then cloud, then money.** Run research and creative locally until you like the output
(about a week). Then deploy with `DRY_RUN` on. Then turn on one integration at a time. Never more than one new variable at once.

**2. Earn autonomy; don't grant it.** Stay at **L1** (you approve spend) for at least two weeks. The console
recommends L2 once the track record shows 14+ days, 20+ actions, 90%+ approved unchanged and no violations. L3 only
for a proven niche. Pausing and killing are always automatic at every level.

**3. Set the platform caps first.** The Meta account spending limit, the TikTok budget limit and fal prepaid
credits are the guardrails that hold even if everything else fails. Then set the console caps a little below them.

**4. Let the rules kill; spend your attention on creative.** Don't override kills. When a product is close,
the answer is almost always new hooks and angles, not more budget. Read `GET /v1/insights/creatives` (or the
weekly retro) to see what's actually winning, and steer the creative-strategy skill toward it.

**5. Judge it on net, not ROAS.** The console's "Last 7 days" card and `/pnl` show contribution after ads
**and** the machine's own cost. Before the first winner, run Lean and expect red: you're buying information.
After winners, keep machine cost under ~15-20% of contribution, and slow down any loop that isn't changing decisions.

**6. Improve weekly, deliberately.** Sunday's retro proposes changes; you approve the good ones in the console,
then `npm run proposals:pull`, review the diff, `npm test`, commit, `npm run agents:apply`. Add a case to
`evals/compliance/` every time a platform disapproves an ad, so the system never repeats it.

**7. Keep it honest.** No fake reviews, no AI presenters posing as customers, no claims the product facts don't
support, no fake urgency. Two compliance gates enforce this, so don't loosen them to chase a metric. It's what
keeps the ad accounts, the payment processor and the FTC off your back.

### Your rhythm

| When | Time | Do |
|---|---|---|
| Daily | ~5 min | Tap approvals in Telegram; skim the evening report |
| Weekly | ~30 min | Read the retro; approve/reject proposals; watch the 3 best and 3 worst ads; check machine-cost share; adjust caps |
| Monthly | ~1 hr | Read the strategy report; decide autonomy level, niche health and next month's budget |
| Anytime | 5 sec | `/kill` if anything looks wrong |

---

## 5. Status at a glance

| | |
|---|---|
| ✅ Built and verified here | Decision engine, database (run on Postgres), gateway, guardian, console, Telegram, order webhooks + P&L, compliance judge (contract), insights, demo/loop/smoke tooling, video pipeline (rendered), templates (rendered), agents/skills/deployments (structure-tested). 40 automated tests, TypeScript + Deno type checks |
| 🟡 Needs your accounts to verify | Shopify, Meta, TikTok and CJ adapters; live fal calls (endpoints and prices checked 2026-11-25; a few input field names unconfirmed); Telegram bot; the judge's live API call; `ant apply` |
| 🔲 Planned (specified in `docs/05-component-catalog.md`) | Automatic LLM cost sync, creative previews in Telegram, AI-label via API, Advantage+ scaling, TikTok Shop GMV Max, affiliate and support agents, retention email/SMS, multi-store |

**Start here:** `npm ci && npm run demo && npm run dev:gateway`, open the console, then fill in the business profile.
