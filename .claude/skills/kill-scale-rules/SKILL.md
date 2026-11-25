---
name: kill-scale-rules
description: How the guardian's deterministic kill/keep/scale/refresh rules work (Bayesian CPA probability, CTR and add-to-cart gates, test budgets, fatigue), the product-level verdicts, budget allocation by Thompson sampling, and when and how agents should add judgment or escalate. Use when reviewing ad performance, guardian decisions or budget changes.
---

# Kill / scale rules

The guardian (code, no LLM) evaluates every live ad every 30 minutes with `core/rules.ts`. Agents read its decisions (`gw GET /v1/decisions`, `gw GET /v1/performance` includes each ad's current rule verdict) and add judgment. You can always pause; you cannot override a kill into more spend.

## Ad-level rules (defaults; operator-tunable via the `rules` setting)

Let BE = breakeven CPA, T = target CPA (from unit economics).

1. **Watch** until spend ≥ 0.3 × BE (too early to judge).
2. **Kill: hook fails**: ≥ 2,000 impressions, link CTR < 0.8%, no purchases.
3. **Kill: page or offer fails**: 0 add-to-carts after 0.75 × BE spend.
4. **Kill: no sale**: 0 purchases after 1.5 × BE spend.
5. **Scale**: ≥ 3 purchases and P(true CPA < T) ≥ 0.75 → +20% budget, at most once per 24h (budget changes reset learning).
6. **Kill: losing**: spend ≥ BE and P(true CPA < BE) < 0.10.
7. **Kill: budget exhausted**: spend ≥ 3 × BE and P(CPA < T) < 0.5.
8. **Refresh** (scaling ads): frequency ≥ 3.5 or CTR down ≥ 30% vs. the first 3 days → open a `refresh_fatigue` brief.

**The probability model**: each click converts with unknown rate p ~ Beta(1 + purchases, 49 + clicks − purchases) (a weak prior of about 2% CVR). CPA ≈ CPC / p, so P(CPA < X) = 1 − BetaCDF(CPC / X). This rewards evidence: 6 purchases at a $10 CPA against a $16 target is a confident scale, while 1 lucky purchase is not.

## Product-level verdicts (testing products)

- **declare_winner**: any ad scaling or confidently under target → product `winner`, `iterate_winner` brief, notify.
- **kill_product**: test budget (≈6 × BE) spent and no ad with P(profitable) ≥ 0.4 → all paused, product `killed`.
- **iterate_creatives**: budget spent but some ads near breakeven, or all ads killed early → one round of new angles (`new_angles` brief). A second failure kills the product.

## Budget allocation

`gw GET /v1/allocation`: Thompson sampling over live campaigns. Budget flows to campaigns most likely to be the most profitable per dollar, with an exploration share for young campaigns and per-ad-set caps. It's a suggestion; apply it with `ads.set_budget` in ≤ 30% steps.

## Where agent judgment adds value

- **Tracking breaks**: spend with zero clicks or purchases across all ads at once, sudden CVR collapse after a site change → pause (don't kill), notify the human.
- **Learning-phase noise**: a single bad day after a budget change isn't a trend.
- **Near-miss diagnosis**: good CTR + no ATC = page or offer (store-manager); good ATC + no purchases = checkout or shipping (store-manager); bad CTR = hook (creative-director).
- **Salvage learnings from kills**: a killed ad with a high hook rate has a reusable hook. Tell the creative director.
- **Seasonality and offer changes**: an offer change mid-test confounds results; note it on the experiment.
