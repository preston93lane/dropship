/**
 * Daily budget allocation across products/ad sets via Thompson sampling.
 *
 * Each arm's per-click conversion rate gets a Beta posterior. For each Monte
 * Carlo draw we compute profit per ad dollar: (contribution / CPA) - 1, where
 * CPA = CPC / p. Budget goes to arms in proportion to how often they are the
 * best arm, with an exploration floor for young arms and per-arm min/max caps.
 *
 * This is how the system "finds winners" without a human eyeballing ROAS: good
 * arms earn more budget automatically, but new tests always get a fair look.
 */
import { clamp, mulberry32, sampleBeta } from "./stats.ts";

export interface Arm {
  id: string;
  spend: number;
  clicks: number;
  purchases: number;
  /** Contribution per order before ad spend (= breakeven CPA). */
  contribution: number;
  /** Assumed CPC when an arm has no clicks yet. */
  priorCpc?: number;
  minDaily?: number;
  maxDaily?: number;
}

export interface AllocationOptions {
  samples?: number;
  seed?: number;
  /** Share of budget reserved for exploration, split evenly across arms with little data. */
  explorationShare?: number;
  /** Arms with fewer clicks than this are "exploring". */
  explorationClickThreshold?: number;
  /** Arms with P(profit per $ > 0) below this get no budget. */
  minProbProfitable?: number;
  prior?: { alpha: number; beta: number };
}

export interface Allocation {
  id: string;
  daily: number;
  winProb: number;
  probProfitable: number;
  expectedProfitPerDollar: number;
}

export function allocateBudget(arms: Arm[], totalDaily: number, opts: AllocationOptions = {}): Allocation[] {
  const {
    samples = 4000,
    seed = 42,
    explorationShare = 0.2,
    explorationClickThreshold = 150,
    minProbProfitable = 0.15,
    prior = { alpha: 1, beta: 49 },
  } = opts;
  if (arms.length === 0 || totalDaily <= 0) return [];

  const rng = mulberry32(seed);
  const wins = new Map<string, number>();
  const profitable = new Map<string, number>();
  const sumProfit = new Map<string, number>();
  for (const a of arms) {
    wins.set(a.id, 0);
    profitable.set(a.id, 0);
    sumProfit.set(a.id, 0);
  }

  for (let i = 0; i < samples; i++) {
    let bestId = "";
    let best = Number.NEGATIVE_INFINITY;
    for (const a of arms) {
      const cpc = a.clicks > 0 ? a.spend / a.clicks : (a.priorCpc ?? 1.0);
      const p = sampleBeta(prior.alpha + a.purchases, prior.beta + Math.max(a.clicks - a.purchases, 0), rng);
      const cpa = cpc / Math.max(p, 1e-9);
      const profitPerDollar = a.contribution / cpa - 1;
      sumProfit.set(a.id, sumProfit.get(a.id)! + profitPerDollar);
      if (profitPerDollar > 0) profitable.set(a.id, profitable.get(a.id)! + 1);
      if (profitPerDollar > best) {
        best = profitPerDollar;
        bestId = a.id;
      }
    }
    wins.set(bestId, wins.get(bestId)! + 1);
  }

  const stats = arms.map((a) => ({
    arm: a,
    winProb: wins.get(a.id)! / samples,
    probProfitable: profitable.get(a.id)! / samples,
    expectedProfitPerDollar: sumProfit.get(a.id)! / samples,
    exploring: a.clicks < explorationClickThreshold,
  }));

  const eligible = stats.filter((s) => s.exploring || s.probProfitable >= minProbProfitable);
  const exploring = eligible.filter((s) => s.exploring);
  const exploitPool = totalDaily * (exploring.length > 0 ? 1 - explorationShare : 1);
  const explorePool = totalDaily - exploitPool;
  const winTotal = eligible.reduce((s, e) => s + e.winProb, 0);

  const raw = new Map<string, number>();
  for (const s of stats) raw.set(s.arm.id, 0);
  for (const s of eligible) {
    const exploit = winTotal > 0 ? (s.winProb / winTotal) * exploitPool : exploitPool / eligible.length;
    const explore = s.exploring ? explorePool / exploring.length : 0;
    raw.set(s.arm.id, exploit + explore);
  }

  // Apply per-arm min/max, then redistribute leftover proportionally among unconstrained arms.
  const result = new Map<string, number>();
  let leftover = 0;
  for (const s of eligible) {
    const lo = s.arm.minDaily ?? 0;
    const hi = s.arm.maxDaily ?? Number.POSITIVE_INFINITY;
    const v = raw.get(s.arm.id)!;
    const capped = clamp(v, lo, hi);
    leftover += v - capped;
    result.set(s.arm.id, capped);
  }
  if (leftover > 0.01) {
    const open = eligible.filter((s) => result.get(s.arm.id)! < (s.arm.maxDaily ?? Number.POSITIVE_INFINITY));
    const w = open.reduce((acc, s) => acc + s.winProb + 1e-6, 0);
    for (const s of open) {
      const add = (leftover * (s.winProb + 1e-6)) / w;
      result.set(s.arm.id, Math.min(result.get(s.arm.id)! + add, s.arm.maxDaily ?? Number.POSITIVE_INFINITY));
    }
  }

  // Never exceed the total (min-daily floors can push it over): scale down proportionally.
  const sum = [...result.values()].reduce((a, b) => a + b, 0);
  const scale = sum > totalDaily ? totalDaily / sum : 1;

  return stats.map((s) => ({
    id: s.arm.id,
    daily: Math.floor((result.get(s.arm.id) ?? 0) * scale * 100) / 100,
    winProb: Math.round(s.winProb * 1000) / 1000,
    probProfitable: Math.round(s.probProfitable * 1000) / 1000,
    expectedProfitPerDollar: Math.round(s.expectedProfitPerDollar * 1000) / 1000,
  }));
}
