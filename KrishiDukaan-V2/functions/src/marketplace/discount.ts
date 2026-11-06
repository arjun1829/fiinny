/** Copied from the web's app/utils/discount.ts so cards apply the same rule. */
export type DiscountFields = {
  discountEnabled?: boolean;
  discountType?: "percentage" | "fixed_amount";
  discountPct?: number;
  discountStartDate?: { toMillis(): number } | null;
  discountEndDate?: { toMillis(): number } | null;
};

/**
 * Returns the currently active discount percentage (0–99), or 0 if the
 * discount is disabled, not yet started, or already expired.
 * Only valid for percentage-type discounts. Returns 0 for fixed_amount.
 */
export function getActiveDiscountPct(inv: DiscountFields): number {
  if (!inv.discountEnabled || !inv.discountPct || inv.discountPct <= 0) return 0;
  if (inv.discountType === "fixed_amount") return 0;
  const now = Date.now();
  const start = inv.discountStartDate?.toMillis?.() ?? 0;
  const end = inv.discountEndDate?.toMillis?.() ?? Infinity;
  if (now < start || now > end) return 0;
  return inv.discountPct;
}

/**
 * The next moment a doc's active discount can change on its own (a window
 * opening or closing), or null if it never will. Cards are rebuilt then.
 */
export function nextDiscountBoundary(inv: DiscountFields, now: number): number | null {
  if (!inv.discountEnabled || !inv.discountPct || inv.discountPct <= 0) return null;
  if (inv.discountType === "fixed_amount") return null;
  const start = inv.discountStartDate?.toMillis?.();
  const end = inv.discountEndDate?.toMillis?.();
  if (typeof start === "number" && start > now) return start;
  // getActiveDiscountPct treats `now > end` as expired, so the change happens
  // just after `end`.
  if (typeof end === "number" && end >= now) return end + 1;
  return null;
}
