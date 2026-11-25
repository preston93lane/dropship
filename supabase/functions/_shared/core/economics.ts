/**
 * Unit economics: the single source of truth for "can this product make money?"
 *
 * Every agent decision that touches price, ad spend or kill/scale rules derives
 * its thresholds from these numbers. Keep this file dependency-free so it runs
 * unchanged in Deno (Supabase Edge Functions) and Node (tests, CLI).
 */

export interface UnitEconomicsInput {
  /** Price the customer pays for one order (use AOV if bundles are common). */
  price: number;
  /** Supplier cost of goods for one order. */
  cogs: number;
  /** Supplier shipping cost to the customer for one order. */
  shippingCost: number;
  /** Payment processing percentage (Shopify Payments US online ~2.9%). */
  paymentFeePct?: number;
  /** Payment processing fixed fee per order. */
  paymentFeeFixed?: number;
  /** Marketplace / platform fee percentage (TikTok Shop referral fee etc., 0 for own Shopify store). */
  platformFeePct?: number;
  /** Expected refund rate (0.05 = 5%). Dropshipping refunds rarely recover COGS. */
  refundRatePct?: number;
  /** Any other per-order cost: packaging inserts, per-order app fees, etc. */
  otherPerOrder?: number;
}

export interface UnitEconomicsOptions {
  /** Share of pre-ad contribution we want to keep as profit (0.3 = keep 30%). */
  targetProfitShare?: number;
}

export interface UnitEconomics {
  price: number;
  landedCost: number;
  fees: number;
  refundAllowance: number;
  /** Contribution per order before ad spend. Also the breakeven CPA. */
  contribution: number;
  contributionMarginPct: number;
  markup: number;
  breakevenCpa: number;
  breakevenRoas: number;
  targetCpa: number;
  targetRoas: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function unitEconomics(input: UnitEconomicsInput, opts: UnitEconomicsOptions = {}): UnitEconomics {
  const {
    price,
    cogs,
    shippingCost,
    paymentFeePct = 0.029,
    paymentFeeFixed = 0.3,
    platformFeePct = 0,
    refundRatePct = 0.05,
    otherPerOrder = 0,
  } = input;
  const targetProfitShare = opts.targetProfitShare ?? 0.3;

  if (!(price > 0)) throw new Error("price must be > 0");
  if (cogs < 0 || shippingCost < 0) throw new Error("costs must be >= 0");
  if (targetProfitShare < 0 || targetProfitShare >= 1) throw new Error("targetProfitShare must be in [0,1)");

  const landedCost = cogs + shippingCost;
  const fees = price * (paymentFeePct + platformFeePct) + paymentFeeFixed;
  const refundAllowance = price * refundRatePct;
  const contribution = price - landedCost - fees - refundAllowance - otherPerOrder;
  const breakevenCpa = Math.max(contribution, 0);
  const targetCpa = breakevenCpa * (1 - targetProfitShare);

  return {
    price: round2(price),
    landedCost: round2(landedCost),
    fees: round2(fees),
    refundAllowance: round2(refundAllowance),
    contribution: round2(contribution),
    contributionMarginPct: round2((contribution / price) * 100) / 100,
    markup: round2(price / Math.max(landedCost, 0.01)),
    breakevenCpa: round2(breakevenCpa),
    breakevenRoas: breakevenCpa > 0 ? round2(price / breakevenCpa) : Number.POSITIVE_INFINITY,
    targetCpa: round2(targetCpa),
    targetRoas: targetCpa > 0 ? round2(price / targetCpa) : Number.POSITIVE_INFINITY,
  };
}

export interface PriceSuggestionOptions {
  /** Price / landed cost multiple. Dropshipping that survives paid ads usually needs >= 2.5-3x. */
  markup?: number;
  /** Psychological ending, e.g. 0.99 or 0.95. */
  ending?: number;
  /** Never price below this (very cheap items cannot carry a CPA). */
  minPrice?: number;
}

/** Suggest a price from landed cost using a markup and a charm ending. */
export function suggestPrice(landedCost: number, opts: PriceSuggestionOptions = {}): number {
  const { markup = 3, ending = 0.99, minPrice = 24.99 } = opts;
  const raw = Math.max(landedCost * markup, minPrice);
  const whole = Math.floor(raw);
  const candidate = whole + ending;
  return round2(candidate >= raw ? candidate : whole + 1 + ending);
}

export interface MarginGates {
  /** Minimum contribution per order in dollars before ads. */
  minContribution: number;
  /** Minimum price / landed cost multiple. */
  minMarkup: number;
  /** Minimum contribution margin (0.35 = 35%). */
  minContributionMarginPct: number;
}

export const DEFAULT_MARGIN_GATES: MarginGates = {
  minContribution: 15,
  minMarkup: 2.5,
  minContributionMarginPct: 0.35,
};

export function checkMarginGates(ue: UnitEconomics, gates: MarginGates = DEFAULT_MARGIN_GATES): {
  pass: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  if (ue.contribution < gates.minContribution) {
    failures.push(`contribution $${ue.contribution} < $${gates.minContribution} minimum (cannot afford a realistic CPA)`);
  }
  if (ue.markup < gates.minMarkup) {
    failures.push(`markup ${ue.markup}x < ${gates.minMarkup}x minimum`);
  }
  if (ue.contributionMarginPct < gates.minContributionMarginPct) {
    failures.push(
      `contribution margin ${(ue.contributionMarginPct * 100).toFixed(0)}% < ${(gates.minContributionMarginPct * 100).toFixed(0)}% minimum`,
    );
  }
  return { pass: failures.length === 0, failures };
}
