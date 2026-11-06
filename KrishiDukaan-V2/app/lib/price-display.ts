import type { MarketplaceProduct } from "../../types/product";

/**
 * What a product card shows: the price a buyer actually pays, and — only when
 * a seller is running a discount — that same seller's price before it, struck
 * out, with the % off. "₹86,999 ₹99,900 13% off".
 */
export type DisplayPrice = {
  /** What the buyer pays. */
  price: number;
  /** The pre-discount price of the SAME offer, or null when there is no discount. */
  mrp: number | null;
  /** Whole-number % off, 0 when there is no discount. */
  pct: number;
};

type PriceSource = Pick<
  MarketplaceProduct,
  "price" | "oldPrice" | "lowestPrice" | "lowestFinalPrice" | "availability"
>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** % off rounded down, so "13% off" is never more than the real saving. */
export function pctOff(mrp: number, price: number): number {
  if (!(mrp > 0) || !(price < mrp)) return 0;
  // The epsilon keeps a 10% discount from flooring to 9 on float error.
  return Math.floor((1 - price / mrp) * 100 + 1e-6);
}

function withMrp(price: number, mrp: number | null): DisplayPrice {
  const pct = mrp ? pctOff(mrp, price) : 0;
  // Under 1% is noise from rounding, not an offer worth a badge.
  return pct >= 1 ? { price, mrp, pct } : { price, mrp: null, pct: 0 };
}

/**
 * The cheapest offer across sellers, with its own pre-discount price.
 *
 * Pairing per seller matters: `lowestPrice` and `lowestFinalPrice` can come
 * from two different sellers, so striking one against the other can claim a
 * discount nobody is giving (or hide one that exists).
 */
export function displayPrice(p: PriceSource): DisplayPrice {
  let best: { final: number; base: number } | null = null;
  for (const a of p.availability ?? []) {
    const base = a.sellingPrice;
    if (typeof base !== "number" || !(base > 0)) continue;
    const pct = typeof a.discountPct === "number" && a.discountPct > 0 ? Math.min(a.discountPct, 99) : 0;
    const final = round2(base * (1 - pct / 100));
    // Ties go to the one with a real discount, so an equal-priced offer still shows.
    if (!best || final < best.final || (final === best.final && base > best.base)) {
      best = { final, base };
    }
  }
  if (best) return withMrp(best.final, best.base > best.final ? best.base : null);

  const base = p.lowestPrice ?? p.price ?? 0;
  const final = p.lowestFinalPrice ?? base;
  if (final < base) return withMrp(final, base);
  // Legacy struck price some catalog entries were seeded with.
  if (p.oldPrice && p.oldPrice > base) return withMrp(base, p.oldPrice);
  return { price: base, mrp: null, pct: 0 };
}

/** Same rule for a single seller's price and discount (seller rows, cart lines). */
export function sellerDisplayPrice(base: number, discountPct: number | undefined): DisplayPrice {
  const pct = discountPct && discountPct > 0 ? Math.min(discountPct, 99) : 0;
  const final = round2(base * (1 - pct / 100));
  return withMrp(final, final < base ? base : null);
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
