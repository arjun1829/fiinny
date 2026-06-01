import type { Timestamp } from "firebase/firestore";

export type DiscountFields = {
  discountEnabled?: boolean;
  discountPct?: number;
  discountStartDate?: Timestamp | null | { toMillis(): number };
  discountEndDate?: Timestamp | null | { toMillis(): number };
};

/**
 * Returns the currently active discount percentage (0–99), or 0 if the
 * discount is disabled, not yet started, or already expired.
 */
export function getActiveDiscountPct(inv: DiscountFields): number {
  if (!inv.discountEnabled || !inv.discountPct || inv.discountPct <= 0) return 0;
  const now = Date.now();
  const start = inv.discountStartDate?.toMillis?.() ?? 0;
  const end   = inv.discountEndDate?.toMillis?.()   ?? Infinity;
  if (now < start || now > end) return 0;
  return inv.discountPct;
}

/**
 * Given an original price and an active discount percentage, returns the
 * final price, discount amount, and savings (= discount amount).
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

/** Formats a price for Indian locale display. */
export function fmtPrice(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
