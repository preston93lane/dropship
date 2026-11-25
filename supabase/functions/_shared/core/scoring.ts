/**
 * Product opportunity scoring.
 *
 * Research agents supply 0-10 judgments for qualitative components (wow factor,
 * creative potential...) plus hard data (economics, fulfillment, risk flags).
 * Code turns that into one comparable 0-100 score with hard gates, so a
 * persuasive LLM write-up can never push a structurally bad product through.
 *
 * Weights are calibrated weekly by the self-improver from real launch outcomes
 * (see calibrateWeights) — bounded, explainable nudges, never a rewrite.
 */
import { checkMarginGates, DEFAULT_MARGIN_GATES, type MarginGates, type UnitEconomics } from "./economics.ts";
import { clamp } from "./stats.ts";

export const SCORE_COMPONENTS = [
  "demand", // search/social demand velocity (trend slope, views growth)
  "proof", // evidence others are making money: long-running ads, sales estimates, many creators
  "margin", // computed from unit economics
  "wow", // visual "I need that" / problem-solving factor, demonstrable in 3 seconds
  "creative_potential", // how many distinct angles/hooks/formats this supports
  "competition", // 10 = unsaturated, 0 = everyone is running it
  "fulfillment", // computed: US warehouse + shipping days
  "trend_timing", // 10 = early in curve, 0 = peaked/declining
] as const;

export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];
export type Weights = Record<ScoreComponent, number>;

export const DEFAULT_WEIGHTS: Weights = {
  demand: 0.15,
  proof: 0.17,
  margin: 0.16,
  wow: 0.14,
  creative_potential: 0.12,
  competition: 0.08,
  fulfillment: 0.1,
  trend_timing: 0.08,
};

export interface RiskFlags {
  restrictedCategory?: boolean; // weapons, supplements w/ claims, adult, drugs, etc.
  trademarkRisk?: boolean; // branded/IP-infringing designs, knockoffs
  needsHealthClaims?: boolean; // only sells via medical/health claims (policy + FTC risk)
  fragile?: boolean;
  sizingVariance?: boolean; // apparel/shoes: high return rates
  batteryOrLiquid?: boolean; // shipping restrictions
  soldCheaperAtBigBox?: boolean; // same item cheaper on Amazon/Walmart -> conversion killer
  usWarehouse?: boolean;
  shippingDays?: number;
}

export interface ScoreInput {
  /** 0-10 judgments from research agents. margin/fulfillment are computed and override any provided value. */
  components: Partial<Record<ScoreComponent, number>>;
  economics?: UnitEconomics;
  flags?: RiskFlags;
}

export type Verdict = "reject" | "watch" | "validate" | "priority";

export interface ScoreResult {
  score: number;
  components: Record<ScoreComponent, number>;
  hardFails: string[];
  penalties: { reason: string; points: number }[];
  missing: ScoreComponent[];
  verdict: Verdict;
}

export function marginComponent(ue: UnitEconomics | undefined): number {
  if (!ue) return 0;
  const byPct = clamp((ue.contributionMarginPct - 0.25) / 0.35, 0, 1) * 10;
  const byDollars = clamp((ue.contribution - 8) / 22, 0, 1) * 10; // $8 -> 0, $30+ -> 10
  return Math.round(((byPct + byDollars) / 2) * 10) / 10;
}

export function fulfillmentComponent(flags: RiskFlags | undefined): number {
  if (!flags || flags.shippingDays === undefined) return flags?.usWarehouse ? 7 : 3;
  const d = flags.shippingDays;
  if (flags.usWarehouse) {
    if (d <= 5) return 10;
    if (d <= 7) return 8;
    return 6;
  }
  if (d <= 8) return 5;
  if (d <= 12) return 3;
  return 1;
}

export function scoreProduct(
  input: ScoreInput,
  weights: Weights = DEFAULT_WEIGHTS,
  gates: MarginGates = DEFAULT_MARGIN_GATES,
): ScoreResult {
  const flags = input.flags ?? {};
  const hardFails: string[] = [];
  const penalties: { reason: string; points: number }[] = [];

  if (flags.restrictedCategory) hardFails.push("restricted category for ads/marketplaces");
  if (flags.trademarkRisk) hardFails.push("trademark / IP infringement risk");
  if (flags.needsHealthClaims) hardFails.push("only sells via health/medical claims (FTC + ad policy risk)");
  if (input.economics) {
    const g = checkMarginGates(input.economics, gates);
    hardFails.push(...g.failures);
  } else {
    hardFails.push("no unit economics: supplier cost and shipping must be known before scoring");
  }

  if (flags.fragile) penalties.push({ reason: "fragile: breakage refunds", points: 5 });
  if (flags.sizingVariance) penalties.push({ reason: "sizing variance: high return rate", points: 5 });
  if (flags.batteryOrLiquid) penalties.push({ reason: "battery/liquid shipping restrictions", points: 3 });
  if (flags.soldCheaperAtBigBox) penalties.push({ reason: "sold cheaper at Amazon/Walmart", points: 8 });

  const components = {} as Record<ScoreComponent, number>;
  const missing: ScoreComponent[] = [];
  for (const c of SCORE_COMPONENTS) {
    if (c === "margin") components[c] = marginComponent(input.economics);
    else if (c === "fulfillment") components[c] = fulfillmentComponent(flags);
    else {
      const v = input.components[c];
      if (v === undefined || Number.isNaN(v)) {
        missing.push(c);
        components[c] = 0;
      } else components[c] = clamp(v, 0, 10);
    }
  }

  const totalWeight = SCORE_COMPONENTS.reduce((s, c) => s + weights[c], 0);
  const raw = SCORE_COMPONENTS.reduce((s, c) => s + components[c] * weights[c], 0) / totalWeight; // 0-10
  const penaltyPts = penalties.reduce((s, p) => s + p.points, 0);
  const score = Math.round(clamp(raw * 10 - penaltyPts, 0, 100) * 10) / 10;

  let verdict: Verdict;
  if (hardFails.length > 0) verdict = "reject";
  else if (missing.length > 0 || score < 55) verdict = "watch";
  else if (score < 72) verdict = "validate";
  else verdict = "priority";

  return { score, components, hardFails, penalties, missing, verdict };
}

export interface LaunchOutcome {
  components: Record<ScoreComponent, number>;
  /** true if the product reached "winner" (profitable at target CPA with enough purchases). */
  won: boolean;
}

export interface CalibrationResult {
  weights: Weights;
  changes: { component: ScoreComponent; from: number; to: number; signal: number }[];
  applied: boolean;
  rationale: string;
}

/**
 * Bounded weight calibration. For each component, compare the mean score of
 * winners vs losers; nudge weights toward components that separate them.
 * Each weight moves at most `maxStep` (relative) per call and weights are
 * renormalized to sum to 1. Requires a minimum sample to avoid chasing noise.
 */
export function calibrateWeights(
  weights: Weights,
  outcomes: LaunchOutcome[],
  opts: { maxStep?: number; minWinners?: number; minLosers?: number } = {},
): CalibrationResult {
  const { maxStep = 0.1, minWinners = 2, minLosers = 4 } = opts;
  const winners = outcomes.filter((o) => o.won);
  const losers = outcomes.filter((o) => !o.won);
  if (winners.length < minWinners || losers.length < minLosers) {
    return {
      weights,
      changes: [],
      applied: false,
      rationale: `insufficient outcomes (winners=${winners.length}/${minWinners}, losers=${losers.length}/${minLosers}); weights unchanged`,
    };
  }
  const mean = (arr: LaunchOutcome[], c: ScoreComponent) => arr.reduce((s, o) => s + o.components[c], 0) / arr.length;

  const next = { ...weights };
  const changes: CalibrationResult["changes"] = [];
  for (const c of SCORE_COMPONENTS) {
    const signal = mean(winners, c) - mean(losers, c); // -10..10
    next[c] = weights[c] * (1 + maxStep * clamp(signal / 3, -1, 1));
  }
  const total = SCORE_COMPONENTS.reduce((s, c) => s + next[c], 0);
  for (const c of SCORE_COMPONENTS) {
    next[c] = Math.round((next[c] / total) * 1000) / 1000;
    if (Math.abs(next[c] - weights[c]) >= 0.001) {
      changes.push({
        component: c,
        from: weights[c],
        to: next[c],
        signal: Math.round((mean(winners, c) - mean(losers, c)) * 100) / 100,
      });
    }
  }
  return {
    weights: next,
    changes,
    applied: true,
    rationale: `calibrated on ${winners.length} winners / ${losers.length} losers, max step ${maxStep * 100}%`,
  };
}
