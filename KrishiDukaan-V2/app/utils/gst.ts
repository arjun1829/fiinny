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
