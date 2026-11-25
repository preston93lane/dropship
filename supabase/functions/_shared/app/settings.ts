import { DEFAULT_GUARDRAILS, type Guardrails } from "../core/policy.ts";
import { DEFAULT_RULES, type RuleConfig } from "../core/rules.ts";
import { DEFAULT_WEIGHTS, type Weights } from "../core/scoring.ts";
import { DEFAULT_MARGIN_GATES, type MarginGates } from "../core/economics.ts";
import type { Repo } from "../repo/types.ts";

export interface EconomicsDefaults {
  paymentFeePct: number;
  paymentFeeFixed: number;
  platformFeePct: number;
  refundRatePct: number;
  otherPerOrder: number;
  targetProfitShare: number;
  /** Product test budget = breakeven CPA x this multiple (spread across its creatives). */
  testBudgetMultiple: number;
}

export const DEFAULT_ECONOMICS: EconomicsDefaults = {
  paymentFeePct: 0.029,
  paymentFeeFixed: 0.3,
  platformFeePct: 0,
  refundRatePct: 0.05,
  otherPerOrder: 0.5,
  targetProfitShare: 0.3,
  testBudgetMultiple: 6,
};

async function merged<T extends object>(repo: Repo, key: string, defaults: T): Promise<T> {
  const stored = await repo.getSetting<Partial<T>>(key);
  return { ...defaults, ...(stored ?? {}) };
}

export async function loadGuardrails(repo: Repo): Promise<Guardrails> {
  const g = await merged(repo, "guardrails", DEFAULT_GUARDRAILS);
  return { ...g, autoLevel: { ...DEFAULT_GUARDRAILS.autoLevel, ...(g.autoLevel ?? {}) } };
}
export const loadRules = (repo: Repo): Promise<RuleConfig> => merged(repo, "rules", DEFAULT_RULES);
export const loadWeights = (repo: Repo): Promise<Weights> => merged(repo, "score_weights", DEFAULT_WEIGHTS);
export const loadMarginGates = (repo: Repo): Promise<MarginGates> => merged(repo, "margin_gates", DEFAULT_MARGIN_GATES);
export const loadEconomicsDefaults = (repo: Repo): Promise<EconomicsDefaults> => merged(repo, "economics_defaults", DEFAULT_ECONOMICS);

/** Settings agents may write through the gateway (everything else is human-only via the console). */
export const AGENT_WRITABLE_SETTINGS = new Set(["model_registry", "creative_playbook_index", "research_sources"]);
