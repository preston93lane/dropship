# 03 · Costs and ROI

Every cost here is a list price researched in November 2026 or an engineering estimate, labeled as such.
The system logs its real costs (`agent_runs`, `costs` tables), and the performance-analyst reports
**machine cost vs. contribution** daily. Trust those numbers over this page within a month.

## 1. What it costs to run the machine

### Model prices used (Claude API list, per million tokens)

| Model | Input | Output | Used for |
|---|---|---|---|
| Claude Opus 5.5 | $4 | $20 | orchestrator, creative-director, self-improver |
| Claude Sonnet 5.5 | $2 | $10 | analysts, producers, buyer, compliance, store |
| Claude Haiku 5.5 | $0.10 | $0.50 | trend-scout (bulk reading) |

Managed Agents adds **$0.08 per session-hour** of runtime and **$10 per 1,000 web searches**. Every deployment
carries a hard dollar budget per run.

### Per-loop estimate (Standard cadence, before prompt-cache savings)

| Loop | Rough tokens per run | $/run | Runs/mo | $/mo |
|---|---|---|---|---|
| RESEARCH | Sonnet 400k in / 40k out + Haiku 1.2M in / 80k out + ~60 searches | ~$2.00 | 30 | ~$60 |
| PLAN | Opus 200k / 15k + Sonnet 150k / 20k | ~$1.60 | 30 | ~$48 |
| CREATE (5 creatives) | Opus 300k / 25k + Sonnet 1.25M / 100k + compliance | ~$6.00 | 30 | ~$180 |
| EXECUTE | Opus + Sonnet, light | ~$1.00 | 30 | ~$30 |
| ADAPT | Sonnet 150k / 10k | ~$0.40 | 60 | ~$24 |
| REPORT | Sonnet 100k / 8k | ~$0.30 | 30 | ~$9 |
| IMPROVE | Opus 600k / 40k + searches | ~$4.00 | 4 | ~$16 |
| STRATEGY | Opus | ~$3.00 | 1 | ~$3 |
| Session runtime | ~2-3 h/day × $0.08 | | | ~$6 |
| **LLM total** | | | | **~$375/mo** |

Agent loops resend stable context (system prompts, skills, prior turns), so prompt caching usually cuts the
input cost substantially. Treat $375 as a ceiling for Standard and measure the real figure in week one.

### Media (fal.ai, prepaid; list prices checked on fal's model pages 2026-11-25)

| Unit | Typical recipe | Cost |
|---|---|---|
| Finished 15-25s video ad | hook shot 2 takes × 5s on the hero model, audio off (~$1.12) + 2 b-roll × 5s standard (~$0.70) + 2 cutouts/edits (~$0.17) + VO + timings (~$0.03) | **~$2-4** |
| Premium video (native audio shot, premium model) | | ~$5-8 |
| Static ad (3 sizes) | 1 cutout + 1-2 scene edits + render | **~$0.10-0.30** |
| Motion-graphic showcase | cutout only + Remotion render | **~$0.01** |
| Independent compliance check | one Claude Opus 5.5 call with keyframes | ~$0.05-0.15 per creative |
| AI presenter segment (HeyGen on fal, $0.10/s) | 10-25s | ~$1-2.50 |

A 5-creative test batch is about $8-12 of media. Compare: human UGC creators commonly charge $100-300 per video,
and an agency or freelancer static runs $25-75.

### Fixed tooling

| Item | Cost | When |
|---|---|---|
| Shopify (Basic) | ~$29-39/mo (verify current plans) | from week 2 |
| Domain | ~$15/yr | week 2 |
| Supabase | Free → Pro $25/mo (no pausing, backups) | Pro once real money flows |
| Reviews app | $0-15/mo | week 2 |
| Supplier app (CJ / DSers / AutoDS) | $0-30/mo | week 2 |
| Telegram notifications | free | week 2 |
| FastMoss / Kalodata (TikTok Shop data) | ~$49-139/mo | only when TikTok Shop is a channel |
| Apify (ad-library scraping) | ~$0-49/mo | optional |

### Monthly totals (excluding ad spend)

| Mode | Machine (LLM + media) | Tools | Total |
|---|---|---|---|
| Lean (pre-winner) | ~$150-250 | ~$40-70 | **~$200-320/mo** |
| Standard | ~$450-750 | ~$70-110 | **~$520-860/mo** |
| Scale | ~$900-1,500 | ~$100-250 | **~$1,000-1,750/mo** |

## 2. What it costs to find a winner

- Test budget per product ≈ **6 × breakeven CPA** (e.g. $20 BE → ~$120), but the guardian kills most losers
  at 1-1.5× BE per ad, so a typical failed test spends ~$60-120.
- Planning hit rate: **10-20%** of validated products become winners (the research loop and calibration aim to raise this).
- **Expected ad spend per winner ≈ $500-1,200** at a 15% hit rate, plus ~$10-15 of creative per test.
- Calendar: 2 new tests a day is the default cap; 4 products testing at once.

## 3. What a winner is worth (illustrative, not a promise)

Product at $39.99, landed $13, contribution $23.53 per order, target CPA $16.47:

| Daily ad spend | CPA (assumed) | Orders/day | Contribution after ads/day | ≈ per month |
|---|---|---|---|---|
| $100 | $15 | 6.7 | $57 | $1,700 |
| $300 | $17 | 17.6 | $115 | $3,450 |
| $1,000 | $19 (CPA rises with scale) | 52.6 | $238 | $7,150 |

Bundles (AOV ↑) and repeat purchases raise these; refunds and rising CPMs lower them. The guardian's
scale rules stop increasing spend when CPA approaches target.

## 4. Is the machine worth it?

**Replacement value** (what a human team would cost for the same output): product researcher VA ($800-1,500/mo),
media buyer ($3,000-6,000/mo or 10-15% of spend), 20+ UGC videos a month ($2,000-6,000), designer for statics
($500-1,500), analyst/reporting ($500+). That's **$7k-15k/mo** versus **$0.2-1.7k/mo** here.

**Where the ROI actually comes from**:
1. **Cheaper failures**: statistical kills at ~1-1.5× BE instead of "let it run another day" typically save 20-40% of test spend.
2. **Creative throughput and diversity**: more distinct concepts per product means more chances to find the hook that works.
3. **Higher hit rate over time**: calibration and the playbook make research pickier about what has won *for this store*.
4. **24/7 attention** on spend, with platform caps and a kill switch as backstops.

**Rules I'd hold the system to** (the REPORT and STRATEGY loops track them):
- Before the first winner: run **Lean**, and judge it on cost per validated product (target ≤ $15) and cost per finished creative (target ≤ $5).
- After winners: trailing-7-day **machine cost ≤ 15-20% of contribution after ads**. If it's higher, cut cadence or switch coordinators to Sonnet.
- Any loop that doesn't change decisions gets slowed down (e.g. research 3x/week once the pipeline is full).

## 5. Cost controls built in

- Per-run dollar budgets on every deployment (`budget.max_list_cost`); the session pauses at the cap.
- fal prepaid credits with auto-top-up off: a hard media cap. Producers stop and ask above $8/video.
- Cheap models do bulk reading; workflows fan out only for many-item work.
- `costs` and `agent_runs` tables make every dollar attributable; the self-improver reviews loop ROI weekly.
