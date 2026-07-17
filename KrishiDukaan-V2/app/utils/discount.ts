import type { Timestamp } from "firebase/firestore";
import type { BulkDiscountTier } from "../dashboard/_types/inventory";

export type DiscountFields = {
  discountEnabled?: boolean;
  discountType?: "percentage" | "fixed_amount";
  discountPct?: number;
  discountFixedAmt?: number;
  discountStartDate?: Timestamp | null | { toMillis(): number };
  discountEndDate?: Timestamp | null | { toMillis(): number };
  // Bulk
  bulkDiscountEnabled?: boolean;
  bulkDiscountTiers?: BulkDiscountTier[];
};

/**
 * Returns the currently active discount percentage (0–99), or 0 if the
 * discount is disabled, not yet started, or already expired.
 * Only valid for percentage-type discounts. Returns 0 for fixed_amount.
 */
export function getActiveDiscountPct(inv: DiscountFields): number {
  if (!inv.discountEnabled || !inv.discountPct || inv.discountPct <= 0) return 0;
  if (inv.discountType === "fixed_amount") return 0; // use getActiveDiscountAmt instead
  const now = Date.now();
  const start = inv.discountStartDate?.toMillis?.() ?? 0;
  const end   = inv.discountEndDate?.toMillis?.()   ?? Infinity;
  if (now < start || now > end) return 0;
  return inv.discountPct;
}

/**
 * Returns the currently active fixed discount amount in rupees, or 0.
 * Only valid for fixed_amount type discounts.
 */
export function getActiveDiscountAmt(inv: DiscountFields): number {
  if (!inv.discountEnabled) return 0;
  if (inv.discountType !== "fixed_amount") return 0;
  if (!inv.discountFixedAmt || inv.discountFixedAmt <= 0) return 0;
  const now = Date.now();
  const start = inv.discountStartDate?.toMillis?.() ?? 0;
  const end   = inv.discountEndDate?.toMillis?.()   ?? Infinity;
  if (now < start || now > end) return 0;
  return inv.discountFixedAmt;
}

/**
 * Returns effective discount percentage for display purposes.
 * For fixed amounts, converts to a percentage of the given price.
 * Returns 0 if discount is inactive.
 */
export function getEffectiveDiscountPct(inv: DiscountFields, price: number): number {
  if (!inv.discountEnabled) return 0;
  const now = Date.now();
  const start = inv.discountStartDate?.toMillis?.() ?? 0;
  const end   = inv.discountEndDate?.toMillis?.()   ?? Infinity;
  if (now < start || now > end) return 0;

  if (inv.discountType === "fixed_amount") {
    if (!inv.discountFixedAmt || inv.discountFixedAmt <= 0 || price <= 0) return 0;
    return Math.min(99, Math.round((inv.discountFixedAmt / price) * 100));
  }
  return inv.discountPct && inv.discountPct > 0 ? inv.discountPct : 0;
}

/**
 * Given an original price and an active discount percentage, returns the
 * final price, discount amount, and savings.
 * All values are rounded to 2 decimal places.
 */
export function calcDiscount(originalPrice: number, discountPct: number) {
  if (discountPct <= 0) {
    return { finalPrice: originalPrice, discountAmt: 0, savingsAmt: 0 };
  }
  const discountAmt = Math.round((originalPrice * discountPct) / 100 * 100) / 100;
  const finalPrice  = Math.round((originalPrice - discountAmt) * 100) / 100;
  return { finalPrice, discountAmt, savingsAmt: discountAmt };
}

/**
 * Calculates final price after applying a fixed rupee discount amount.
 */
export function calcDiscountFixed(originalPrice: number, fixedAmt: number) {
  if (fixedAmt <= 0) {
    return { finalPrice: originalPrice, discountAmt: 0, savingsAmt: 0 };
  }
  const discountAmt = Math.min(fixedAmt, originalPrice);
  const finalPrice  = Math.round((originalPrice - discountAmt) * 100) / 100;
  return { finalPrice, discountAmt, savingsAmt: discountAmt };
}

/**
 * Finds the applicable bulk discount percentage for a given quantity.
 * Returns the highest tier whose minQty is <= qty, or 0 if none applies.
 */
export function getBulkDiscountPct(
  tiers: BulkDiscountTier[] | undefined,
  qty: number,
): number {
  if (!tiers || tiers.length === 0 || qty <= 0) return 0;
  // Sort descending by minQty, find first tier where minQty <= qty
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  const match = sorted.find(t => qty >= t.minQty);
  return match ? match.discountPct : 0;
}

/**
 * Returns the next bulk tier above current qty (for "buy X more to save Y%").
 * Returns null if already at max tier or no tiers configured.
 */
export function getNextBulkTier(
  tiers: BulkDiscountTier[] | undefined,
  currentQty: number,
): BulkDiscountTier | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  return sorted.find(t => t.minQty > currentQty) ?? null;
}

/** Formats a price for Indian locale display. */
export function fmtPrice(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
