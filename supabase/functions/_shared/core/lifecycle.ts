/**
 * Product and creative lifecycles. Loops hand work to each other through these
 * states (a "blackboard" architecture): no agent calls another loop directly,
 * it moves an item to the next state and the owning loop picks it up.
 */

export const PRODUCT_STATUSES = [
  "candidate", // found by research, raw signals only
  "validated", // scored + economics + supplier confirmed
  "approved", // orchestrator/human said "launch this"
  "rejected", // failed gates or judgment (terminal unless revived)
  "parked", // interesting but not now (seasonal, waiting on supplier)
  "listing", // store-manager building the product page
  "creative_production", // creative loop producing the test batch
  "ready_to_test", // listing live + >= N compliant creatives
  "testing", // ads spending under test budget
  "winner", // beat target CPA with confidence
  "scaling", // budget increasing, scaling campaigns live
  "refreshing", // winner with fatigued creatives, new variants in production
  "killed", // test failed
  "retired", // former winner, economics declined
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  candidate: ["validated", "rejected", "parked"],
  validated: ["approved", "rejected", "parked"],
  approved: ["listing", "parked", "rejected"],
  rejected: ["candidate"],
  parked: ["candidate", "validated", "rejected"],
  listing: ["creative_production", "parked"],
  creative_production: ["ready_to_test", "parked"],
  ready_to_test: ["testing", "parked"],
  testing: ["winner", "killed", "creative_production"],
  winner: ["scaling", "killed"],
  scaling: ["refreshing", "retired", "killed"],
  refreshing: ["scaling", "retired", "killed"],
  killed: ["candidate"],
  retired: ["candidate"],
};

/** Which loop owns the next step for a product in a given state. */
export const PRODUCT_OWNER: Record<ProductStatus, string> = {
  candidate: "research (product-analyst)",
  validated: "plan (orchestrator)",
  approved: "execute (store-manager)",
  rejected: "-",
  parked: "plan (orchestrator, weekly review)",
  listing: "execute (store-manager)",
  creative_production: "create (creative-director)",
  ready_to_test: "execute (media-buyer)",
  testing: "adapt (guardian + media-buyer)",
  winner: "adapt (media-buyer)",
  scaling: "adapt (guardian + media-buyer)",
  refreshing: "create (creative-director)",
  killed: "improve (self-improver retro)",
  retired: "improve (self-improver retro)",
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return PRODUCT_TRANSITIONS[from].includes(to);
}

export function assertProductTransition(from: ProductStatus, to: ProductStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal product transition ${from} -> ${to}; allowed: ${PRODUCT_TRANSITIONS[from].join(", ") || "none"}`);
  }
}

export const CREATIVE_STATUSES = [
  "brief", // requested by plan/adapt loop
  "in_production",
  "in_review", // waiting for compliance-reviewer
  "approved", // compliant, ready to launch
  "rejected", // failed compliance or quality bar
  "live",
  "fatigued",
  "retired",
] as const;

export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export const CREATIVE_TRANSITIONS: Record<CreativeStatus, readonly CreativeStatus[]> = {
  brief: ["in_production", "retired"],
  in_production: ["in_review", "retired"],
  in_review: ["approved", "rejected"],
  approved: ["live", "retired"],
  rejected: ["in_production", "retired"],
  live: ["fatigued", "retired"],
  fatigued: ["retired", "live"],
  retired: [],
};

export function assertCreativeTransition(from: CreativeStatus, to: CreativeStatus): void {
  if (!CREATIVE_TRANSITIONS[from].includes(to)) {
    throw new Error(`illegal creative transition ${from} -> ${to}; allowed: ${CREATIVE_TRANSITIONS[from].join(", ") || "none"}`);
  }
}
