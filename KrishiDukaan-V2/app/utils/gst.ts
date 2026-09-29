/**
 * GST helpers — single source of truth for GST math across the Edit Product
 * modal (preview), the cart (customer-facing totals) and order creation
 * (persisted amounts). Keeping the formula here stops the calculation from
 * drifting between those places.
 *
 * Business rule: GST is ALWAYS included in the product price and is never
 * charged separately, so only the inclusive branch is used in practice. The
 * `included` parameter is kept for the general formula / possible future use.
 */

/** Predefined GST slabs shown as quick-pick chips. Sellers may also enter a custom rate. */
export const GST_RATES = [0, 5, 12, 18, 28] as const;

/**
 * Coerce an arbitrary stored/entered value into a valid GST rate.
 * Returns a non-negative number (custom rates allowed); invalid input → 0.
 */
export function normalizeGstRate(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Guard against nonsensical rates; GST never exceeds 100%.
  return Math.min(n, 100);
}

/**
 * GST amount for a single unit at `price`.
 *
 * - Exclusive (`included = false`): GST is charged ON TOP of the price →
 *   `price * rate / 100`.
 * - Inclusive (`included = true`): the price already contains GST, so the GST
 *   component is BACKED OUT of it → `price - price / (1 + rate/100)`, i.e.
 *   `price * rate / (100 + rate)`. It must NOT be added to the price again.
 */
export function gstAmountPerUnit(price: number, rate: number, included: boolean): number {
  if (!rate || rate <= 0 || !Number.isFinite(price) || price <= 0) return 0;
  const amount = included
    ? price - price / (1 + rate / 100)
    : (price * rate) / 100;
  return Number(amount.toFixed(2));
}

// ─── Authoritative line pricing ────────────────────────────────────────────────
//
// Single source of truth for turning a POST-DISCOUNT unit price + GST settings
// into the payable numbers. Every surface — Edit Product preview, Product Detail,
// Cart, Checkout, order creation, and the invoice — must go through this so the
// GST-inclusive/exclusive state and the totals are identical everywhere.
//
// The calculation order the whole app follows is:
//   Original Price → Discount → Discounted Price → GST → Delivery → Final Price
// `unitPrice` here is the ALREADY-DISCOUNTED price, so GST is always computed on
// the discounted price (never the original).

export type LinePricingInput = {
  /** Post-discount unit price. GST is computed on this value. */
  unitPrice: number;
  /** Units. Defaults to 1 (per-unit preview). */
  qty?: number;
  gstApplicable?: boolean;
  gstRate?: number;
  /**
   * Whether GST is already inside `unitPrice`. Business default is TRUE — a line
   * is only exclusive when this is explicitly `false`.
   */
  gstIncluded?: boolean;
};

export type LinePricing = {
  /** Resolved: true only when GST actually applies (applicable + rate > 0). */
  applicable: boolean;
  /** Resolved inclusive flag (false for non-applicable lines). */
  included: boolean;
  /** GST for a single unit — backed out if included, added on top if excluded. */
  gstPerUnit: number;
  /** GST across `qty`. */
  gstTotal: number;
  /** Net = unitPrice × qty (post-discount, before any GST is added). */
  net: number;
  /** GST portion ADDED to the payable total. 0 when included. */
  gstAdded: number;
  /** Payable line total = net + gstAdded. */
  lineTotal: number;
};

/**
 * Compute the payable line pricing for one cart/order line from its post-discount
 * unit price and GST settings. Rounds money to 2 dp consistently with the rest of
 * the app (see calcDiscount / gstAmountPerUnit).
 */
export function computeLinePricing(input: LinePricingInput): LinePricing {
  const qty = input.qty ?? 1;
  const unitPrice = Number.isFinite(input.unitPrice) && input.unitPrice > 0 ? input.unitPrice : 0;
  const rate = Number(input.gstRate);
  const applicable = input.gstApplicable === true && Number.isFinite(rate) && rate > 0;
  // Business default: included unless explicitly excluded.
  const included = applicable ? input.gstIncluded !== false : false;

  const gstPerUnit = applicable ? gstAmountPerUnit(unitPrice, rate, included) : 0;
  const gstTotal = Number((gstPerUnit * qty).toFixed(2));
  const net = Number((unitPrice * qty).toFixed(2));
  const gstAdded = included ? 0 : gstTotal;
  const lineTotal = Number((net + gstAdded).toFixed(2));

  return { applicable, included, gstPerUnit, gstTotal, net, gstAdded, lineTotal };
}
