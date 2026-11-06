import { canonicalState } from "../utils/delivery";

/**
 * Where a listing may be sold ONLINE, decided per cart line. Pure (no
 * Firebase), shared by checkout (/api/payment/create-cart-order), the cart's
 * address check (/api/cart/availability) and the tests.
 *
 * Three rules, in this order:
 *  1. Network lock — a manufacturer can make a retailer in their network
 *     sell their products in-store only (`onlineLockedByManufacturer` on the
 *     retailer's assigned copy).
 *  2. Product licence — a manufacturer's product carries the states its
 *     selling licence covers (`license.states`). It binds the manufacturer's
 *     own listing AND every network retailer's assigned copy of it.
 *     Independent retailers are not bound by it. No states recorded = no
 *     limit (products from before licences existed keep selling).
 *  3. Seller coverage — a retailer who chose "Selected states" in Delivery
 *     settings delivers only there. Manufacturers don't use this: their area
 *     is set per product by the licence.
 *
 * An unknown customer state can't be checked, so rules 2–3 pass (the server
 * logs it); rule 1 never depends on the address.
 */

export type SellAreaBlock =
  | { code: "online_locked_by_manufacturer" }
  | { code: "not_licensed_for_state"; states: string[] }
  | { code: "outside_seller_coverage"; states: string[] };

export type SellAreaInput = {
  customerState: string | null | undefined;
  /** Licence states of the manufacturer product this line sells; null = not a licensed line. */
  licensedStates: string[] | null;
  /** The seller's Delivery-settings coverage; null for manufacturers / unknown. */
  coverage: { coverageType?: unknown; states?: unknown } | null;
  onlineLocked: boolean;
};

/** Licence states on a product doc ("license.states"), cleaned; [] when none. */
export function licensedStatesOf(doc: Record<string, unknown> | null | undefined): string[] {
  const license = doc?.license as { states?: unknown } | undefined;
  const raw = Array.isArray(license?.states) ? license!.states : [];
  return (raw as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean);
}

/** Is `state` one of `states`? Compared on canonical names ("Orissa" = Odisha). */
export function stateInList(states: readonly string[], state: string | null | undefined): boolean {
  const want = canonicalState(state);
  if (!want) return false;
  return states.some((s) => canonicalState(s) === want);
}

export function checkSellArea(input: SellAreaInput): SellAreaBlock | null {
  if (input.onlineLocked) return { code: "online_locked_by_manufacturer" };
  if (!canonicalState(input.customerState)) return null;

  const licensed = input.licensedStates ?? [];
  if (licensed.length > 0 && !stateInList(licensed, input.customerState)) {
    return { code: "not_licensed_for_state", states: licensed };
  }

  const cov = input.coverage;
  if (cov && cov.coverageType === "states") {
    const states = Array.isArray(cov.states) ? (cov.states as unknown[]).map(String).filter(Boolean) : [];
    if (states.length > 0 && !stateInList(states, input.customerState)) {
      return { code: "outside_seller_coverage", states };
    }
  }
  return null;
}

/** "Maharashtra", "Maharashtra and Goa", "Maharashtra, Goa and 3 more". */
export function describeStates(states: readonly string[]): string {
  if (states.length <= 1) return states[0] ?? "";
  if (states.length === 2) return `${states[0]} and ${states[1]}`;
  if (states.length === 3) return `${states[0]}, ${states[1]} and ${states[2]}`;
  return `${states[0]}, ${states[1]} and ${states.length - 2} more`;
}

/** Buyer-facing reason, same words on web and app. */
export function sellAreaMessage(block: SellAreaBlock): string {
  switch (block.code) {
    case "online_locked_by_manufacturer":
      return "This store sells this product in-store only. Please choose another store.";
    case "not_licensed_for_state":
      return `This product is not available for your address. It can be delivered only in ${describeStates(block.states)}.`;
    case "outside_seller_coverage":
      return `This store does not deliver to your address. It delivers only in ${describeStates(block.states)}.`;
  }
}
