/**
 * Guardrail policy: decides whether an agent's requested action runs
 * automatically, waits for human approval, or is rejected outright.
 *
 * Principle: "LLMs decide, code enforces." Agents never hold ad-platform or
 * store credentials; every write goes through the gateway, which calls this.
 *
 * Risk-reducing actions (pause, unpublish) are always allowed, even with the
 * kill switch on, because stopping spend must never be blocked.
 */

export const ACTION_TYPES = [
  "shopify.create_product", // always created as DRAFT
  "shopify.update_product", // copy, images, variants (not price)
  "shopify.publish_product",
  "shopify.unpublish_product", // risk-reducing
  "shopify.set_price",
  "ads.create_test", // campaign/ad set/ads created PAUSED
  "ads.activate", // turns on spend
  "ads.set_budget",
  "ads.pause", // risk-reducing
  "ads.scale_duplicate", // copy a proven ad into a scaling campaign
  "supplier.order_sample",
  "tiktok_shop.list_product",
  "notify.human",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
export type AutonomyLevel = 0 | 1 | 2 | 3;

export const RISK_REDUCING: ReadonlySet<ActionType> = new Set(["ads.pause", "shopify.unpublish_product", "notify.human"]);

/** Minimum autonomy level at which an action may run without a human. */
export const DEFAULT_AUTO_LEVEL: Record<ActionType, AutonomyLevel> = {
  "shopify.create_product": 1,
  "shopify.update_product": 1,
  "shopify.publish_product": 2,
  "shopify.unpublish_product": 0,
  "shopify.set_price": 2,
  "ads.create_test": 1,
  "ads.activate": 2,
  "ads.set_budget": 2,
  "ads.pause": 0,
  "ads.scale_duplicate": 3,
  "supplier.order_sample": 2,
  "tiktok_shop.list_product": 2,
  "notify.human": 0,
};

export interface Guardrails {
  autonomyLevel: AutonomyLevel;
  killSwitch: boolean;
  /** Hard cap on the sum of all active daily budgets across channels. */
  maxDailyAdSpend: number;
  /** Hard cap for any single campaign/ad set daily budget. */
  maxDailyBudgetPerAdSet: number;
  /** Budget increases larger than this (relative) are rejected; split into steps. */
  maxBudgetIncreasePct: number;
  maxNewTestsPerDay: number;
  maxActiveTestingProducts: number;
  /** Price changes beyond this (relative) always need approval. */
  maxAutoPriceChangePct: number;
  maxSampleOrderCost: number;
  maxSampleOrdersPerWeek: number;
  autoLevel: Record<ActionType, AutonomyLevel>;
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  autonomyLevel: 1,
  killSwitch: false,
  maxDailyAdSpend: 100,
  maxDailyBudgetPerAdSet: 40,
  maxBudgetIncreasePct: 0.3,
  maxNewTestsPerDay: 2,
  maxActiveTestingProducts: 4,
  maxAutoPriceChangePct: 0.15,
  maxSampleOrderCost: 60,
  maxSampleOrdersPerWeek: 3,
  autoLevel: DEFAULT_AUTO_LEVEL,
};

export interface ActionRequest {
  type: ActionType;
  payload: {
    /** New daily budget for ads.create_test / ads.activate / ads.set_budget / ads.scale_duplicate. */
    dailyBudget?: number;
    currentDailyBudget?: number;
    price?: number;
    currentPrice?: number;
    cost?: number;
    [k: string]: unknown;
  };
}

export interface PolicyContext {
  /** Sum of daily budgets of everything currently active (excluding the entity being changed). */
  committedDailyBudget: number;
  newTestsToday: number;
  activeTestingProducts: number;
  samplesThisWeek: number;
  /** True only if every creative referenced by the action passed compliance review. */
  creativesCompliant?: boolean;
  /** True if the product has been approved by the orchestrator (or human) for launch. */
  productApproved?: boolean;
}

export type PolicyDecision = "auto" | "approval" | "reject";

export interface PolicyResult {
  decision: PolicyDecision;
  reasons: string[];
}

const SPEND_ACTIONS: ReadonlySet<ActionType> = new Set(["ads.create_test", "ads.activate", "ads.set_budget", "ads.scale_duplicate"]);

export function evaluateAction(req: ActionRequest, g: Guardrails, ctx: PolicyContext): PolicyResult {
  const reasons: string[] = [];
  const { type, payload } = req;

  if (!(ACTION_TYPES as readonly string[]).includes(type)) {
    return { decision: "reject", reasons: [`unknown action type ${type}`] };
  }
  if (RISK_REDUCING.has(type)) {
    return { decision: "auto", reasons: ["risk-reducing actions always run"] };
  }
  if (g.killSwitch) {
    return { decision: "reject", reasons: ["kill switch is ON: only pause/unpublish are allowed"] };
  }

  // ---- Hard limits: reject (agent must change the request) ----
  if (SPEND_ACTIONS.has(type)) {
    const budget = payload.dailyBudget;
    if (budget === undefined || !(budget >= 0)) {
      return { decision: "reject", reasons: ["dailyBudget is required for spend actions"] };
    }
    if (budget > g.maxDailyBudgetPerAdSet) {
      reasons.push(`daily budget $${budget} exceeds per-ad-set cap $${g.maxDailyBudgetPerAdSet}`);
    }
    const current = type === "ads.set_budget" ? (payload.currentDailyBudget ?? 0) : 0;
    const delta = budget - current;
    if (ctx.committedDailyBudget + delta > g.maxDailyAdSpend) {
      reasons.push(
        `total committed daily budget would be $${(ctx.committedDailyBudget + delta).toFixed(2)} > cap $${g.maxDailyAdSpend}`,
      );
    }
    if (type === "ads.set_budget" && current > 0 && delta / current > g.maxBudgetIncreasePct) {
      reasons.push(
        `budget increase ${Math.round((delta / current) * 100)}% exceeds ${Math.round(g.maxBudgetIncreasePct * 100)}% step limit (avoid resetting learning; step up gradually)`,
      );
    }
  }
  if (type === "ads.create_test") {
    if (ctx.newTestsToday >= g.maxNewTestsPerDay) reasons.push(`already launched ${ctx.newTestsToday} tests today (cap ${g.maxNewTestsPerDay})`);
    if (ctx.activeTestingProducts >= g.maxActiveTestingProducts) {
      reasons.push(`${ctx.activeTestingProducts} products already testing (cap ${g.maxActiveTestingProducts})`);
    }
    if (ctx.productApproved === false) reasons.push("product is not approved for launch");
  }
  if ((type === "ads.create_test" || type === "ads.activate" || type === "ads.scale_duplicate") && ctx.creativesCompliant !== true) {
    reasons.push("every creative must pass compliance review before it can run");
  }
  if (type === "supplier.order_sample") {
    if ((payload.cost ?? Number.POSITIVE_INFINITY) > g.maxSampleOrderCost) reasons.push(`sample cost exceeds $${g.maxSampleOrderCost} cap`);
    if (ctx.samplesThisWeek >= g.maxSampleOrdersPerWeek) reasons.push(`sample order cap (${g.maxSampleOrdersPerWeek}/week) reached`);
  }
  if (reasons.length > 0) return { decision: "reject", reasons };

  // ---- Soft limits: ask a human ----
  if (type === "shopify.set_price") {
    const { price, currentPrice } = payload;
    if (price === undefined || !(price > 0)) return { decision: "reject", reasons: ["price is required"] };
    if (currentPrice && Math.abs(price - currentPrice) / currentPrice > g.maxAutoPriceChangePct) {
      return { decision: "approval", reasons: [`price change >${Math.round(g.maxAutoPriceChangePct * 100)}% needs a human`] };
    }
  }

  const needed = g.autoLevel[type];
  if (g.autonomyLevel >= needed) {
    return { decision: "auto", reasons: [`autonomy L${g.autonomyLevel} >= L${needed} required for ${type}`] };
  }
  return { decision: "approval", reasons: [`${type} needs autonomy L${needed}; current L${g.autonomyLevel}`] };
}

export interface GraduationStats {
  daysAtLevel: number;
  actionsProposed: number;
  approvedUnchangedPct: number;
  policyViolations: number;
  complianceRejectionsLive: number; // ads disapproved by platforms after launch
  contributionAfterAdsLast14d: number;
}

/** Recommend (never apply) an autonomy change. Humans flip the switch in the console. */
export function recommendAutonomy(current: AutonomyLevel, s: GraduationStats): { recommend: AutonomyLevel; why: string } {
  if (s.policyViolations > 0 || s.complianceRejectionsLive >= 3) {
    const down = Math.max(0, current - 1) as AutonomyLevel;
    return { recommend: down, why: "policy violations or repeated platform disapprovals: step down a level" };
  }
  if (current >= 3) return { recommend: 3, why: "already at max autonomy" };
  const ready =
    s.daysAtLevel >= 14 && s.actionsProposed >= 20 && s.approvedUnchangedPct >= 0.9 && (current < 2 || s.contributionAfterAdsLast14d > 0);
  if (ready) {
    return { recommend: (current + 1) as AutonomyLevel, why: "14+ days, 20+ actions, >=90% approved unchanged, no violations" };
  }
  return { recommend: current, why: "keep earning trust at the current level" };
}
