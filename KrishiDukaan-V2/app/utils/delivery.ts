/**
 * Shared, framework-agnostic delivery-charge resolution.
 *
 * This module is the single source of truth for two questions that used to be
 * answered independently (and could therefore silently disagree) in the cart
 * estimate, the server checkout route, and the order-creation write:
 *
 *   1. Which weight slabs apply for a given customer delivery state?
 *   2. What charge does a chargeable weight resolve to within those slabs?
 *
 * It is intentionally pure (no Firebase, no React) so the client bundle, the
 * Next.js API route (Node/admin SDK) and the order writer can all import it.
 */

export type WeightSlab = {
  minKg: number;
  maxKg: number;
  charge: number;
};

/** Which slab set was applied — used for the buyer-facing label and the order record. */
export type DeliveryType = "in_state" | "out_state" | "default";

export type ResolvedSlabs = {
  slabs: WeightSlab[];
  deliveryType: DeliveryType;
  /** True when the customer's delivery state matches the seller's state. */
  sameState: boolean;
};

/**
 * Alternative spellings of the same state / UT → the canonical (lower-case,
 * "and" not "&") form. Google returns "Jammu and Kashmir" or "NCT of Delhi"
 * where a seller's own list says "Jammu & Kashmir" or "Delhi", and older names
 * such as "Orissa" are still typed by hand. A miss here is not harmless: an
 * in-state customer would be charged the OUTSIDE-state rate.
 */
const STATE_ALIASES: Record<string, string> = {
  "orissa": "odisha",
  "uttaranchal": "uttarakhand",
  "pondicherry": "puducherry",
  "nct of delhi": "delhi",
  "new delhi": "delhi",
  "delhi ncr": "delhi",
  "telengana": "telangana",
  "chattisgarh": "chhattisgarh",
  "andaman and nicobar": "andaman and nicobar islands",
  "andaman nicobar islands": "andaman and nicobar islands",
  // One UT since 2020; the two old halves both mean it.
  "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
  "daman and diu": "dadra and nagar haveli and daman and diu",
  "daman diu": "dadra and nagar haveli and daman and diu",
};

/** Canonical form of a state name for comparison; "" when there is none. */
export function canonicalState(v: string | null | undefined): string {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return STATE_ALIASES[s] ?? s;
}

/** Same-state check over canonical names. Empty on either side → false. */
export function isSameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = canonicalState(a);
  const nb = canonicalState(b);
  if (!na || !nb) return false;
  return na === nb;
}

function asSlabArray(v: unknown): WeightSlab[] {
  if (!Array.isArray(v)) return [];
  return (v as WeightSlab[]).filter(
    (s) =>
      s &&
      typeof s.minKg === "number" &&
      typeof s.maxKg === "number" &&
      typeof s.charge === "number",
  );
}

/**
 * Minimal shape of a `deliverySettings/{phone}` document this resolver reads.
 * Accepts a loose record so both the typed client model and a raw Firestore
 * `data()` object can be passed without adapters.
 */
export type DeliverySettingsLike = {
  coverageType?: string;
  weightSlabs?: unknown;
  inStateSlabs?: unknown;
  outStateSlabs?: unknown;
  sellerState?: string | null;
};

/**
 * Pick the applicable slab set for a customer's delivery state.
 *
 * Rules:
 *  - `states` coverage → the single `weightSlabs` set (unchanged legacy behavior).
 *  - `pan_india` coverage:
 *      • same state  → `inStateSlabs`  (falls back to `weightSlabs` if unset)
 *      • other state → `outStateSlabs` (falls back to `weightSlabs` if unset)
 *  - If the seller's state or the customer's state is unknown, we cannot decide
 *    within/outside, so we fall back to `weightSlabs` and report `deliveryType:
 *    "default"`. This is exactly how every pan-India seller behaved before the
 *    two-slab feature, so legacy docs keep working until re-saved.
 */
export function resolveDeliverySlabs(
  data: DeliverySettingsLike,
  customerState: string | null | undefined,
): ResolvedSlabs {
  const coverage = data.coverageType === "states" ? "states" : "pan_india";
  const legacy = asSlabArray(data.weightSlabs);

  if (coverage === "states") {
    return { slabs: legacy, deliveryType: "default", sameState: false };
  }

  const sellerState = data.sellerState;
  // Can't determine within/outside without both states → legacy single set.
  if (!sellerState || !customerState) {
    return { slabs: legacy, deliveryType: "default", sameState: false };
  }

  const same = isSameState(sellerState, customerState);
  const inSlabs = asSlabArray(data.inStateSlabs);
  const outSlabs = asSlabArray(data.outStateSlabs);

  if (same) {
    return {
      slabs: inSlabs.length ? inSlabs : legacy,
      deliveryType: "in_state",
      sameState: true,
    };
  }
  return {
    slabs: outSlabs.length ? outSlabs : legacy,
    deliveryType: "out_state",
    sameState: false,
  };
}

/**
 * Resolve a chargeable weight (kg) to a slab charge. Returns 0 when no slab
 * matches (unconfigured / free). The last slab is treated as open-ended so a
 * weight above every configured range still resolves to the top slab's charge.
 */
export function chargeFromSlabs(weightKg: number, slabs: WeightSlab[]): number {
  const sorted = [...slabs].sort((a, b) => a.minKg - b.minKg);
  for (const slab of sorted) {
    if (weightKg >= slab.minKg && weightKg < slab.maxKg) return slab.charge;
  }
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (weightKg >= last.minKg) return last.charge;
  }
  return 0;
}
