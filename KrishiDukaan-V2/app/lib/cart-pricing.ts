/**
 * Server-authoritative cart pricing — GST and delivery, per seller.
 *
 * Pure (no Firebase, no React) so the checkout route, the webhook order
 * recovery and the unit tests all run the SAME code. The rules mirror what the
 * web cart shows and what createOrdersFromCart persists, so the amount charged,
 * the amount displayed and the order record cannot drift:
 *
 *   Original Price → Discount → Discounted Price → GST → Delivery → Final
 *
 *   GST       computed on the DISCOUNTED unit price. Included GST is already in
 *             the price and is never added; only EXCLUDED GST is added.
 *   Delivery  per seller. Free-delivery products add no weight and no charge.
 *             The weight slab is picked by the customer's delivery state (see
 *             utils/delivery). Zero chargeable weight → only the per-product
 *             extra applies, exactly like the cart estimate: an item with no
 *             parseable pack size must not pick up the lowest slab.
 *             A shipment where EVERY item is free ships free; what it would
 *             have cost is kept as `waived` so the invoice can show it struck.
 */

import { computeLinePricing } from "../utils/gst";
import { normalizeUnit } from "../utils/weight";
import { getActiveDiscountAmt, getActiveDiscountPct, type DiscountFields } from "../utils/discount";
import {
  chargeFromSlabs,
  resolveDeliverySlabs,
  type DeliverySettingsLike,
  type DeliveryType,
} from "../utils/delivery";

export type CartPricingLine = {
  /** Same key checkout groups sellers by: phone first, id fallback. */
  sellerKey: string;
  /** Post-discount unit price — GST is computed on this. */
  unitPrice: number;
  qty: number;
  /** qty × per-unit pack weight, in kg. */
  weightKg: number;
  gstApplicable?: boolean;
  gstRate?: number;
  /** Default TRUE — only an explicit false is exclusive. */
  gstIncluded?: boolean;
  extraDeliveryCharge?: number;
  freeDelivery?: boolean;
};

export type DeliveryBreakdown = {
  /** Weight-slab component actually charged (0 if free). */
  slab: number;
  /** Per-product extra actually charged (0 if free). */
  extra: number;
  free: boolean;
  /** What would have been charged, when Free Delivery overrode it. */
  waived: number;
  /** Which slab set applied. "default" = single-slab seller or state unknown. */
  deliveryType: DeliveryType;
};

export type SellerPricing = {
  sellerKey: string;
  /** Sum of post-discount line prices, before any added GST. */
  subtotal: number;
  /** All GST in the order (included + excluded) — for the invoice. */
  gstTotal: number;
  /** GST ADDED to the payable total (excluded lines only). */
  gstAdded: number;
  deliveryCharge: number;
  delivery: DeliveryBreakdown;
  /** subtotal + gstAdded + deliveryCharge. */
  total: number;
};

const r2 = (n: number) => Number(n.toFixed(2));
const r3 = (n: number) => Number(n.toFixed(3));

/** Delivery for ONE seller's lines. `settings` null = no readable settings. */
export function computeSellerDelivery(
  lines: CartPricingLine[],
  settings: DeliverySettingsLike | null,
  customerState: string | null | undefined,
): DeliveryBreakdown {
  const chargeable = lines.filter((l) => !l.freeDelivery);
  const isFree = lines.length > 0 && chargeable.length === 0;

  const extraOf = (ls: CartPricingLine[]) =>
    r2(ls.reduce((s, l) => s + ((l.extraDeliveryCharge ?? 0) > 0 ? l.extraDeliveryCharge! : 0), 0));
  const weightOf = (ls: CartPricingLine[]) => r3(ls.reduce((s, l) => s + l.weightKg, 0));

  let deliveryType: DeliveryType = "default";
  const slabFor = (weightKg: number): number => {
    if (!settings || weightKg <= 0) return 0;
    const resolved = resolveDeliverySlabs(settings, customerState);
    deliveryType = resolved.deliveryType;
    return resolved.slabs.length ? chargeFromSlabs(weightKg, resolved.slabs) : 0;
  };

  if (isFree) {
    // Nothing is charged; keep what it would have been for the invoice.
    const waived = r2(slabFor(weightOf(lines)) + extraOf(lines));
    return { slab: 0, extra: 0, free: true, waived, deliveryType };
  }

  const slab = slabFor(weightOf(chargeable));
  return { slab, extra: extraOf(chargeable), free: false, waived: 0, deliveryType };
}

/** Full per-seller pricing: subtotal, GST and delivery. */
export function computeSellerPricing(
  sellerKey: string,
  lines: CartPricingLine[],
  settings: DeliverySettingsLike | null,
  customerState: string | null | undefined,
): SellerPricing {
  let subtotal = 0;
  let gstTotal = 0;
  let gstAdded = 0;
  for (const l of lines) {
    const p = computeLinePricing({
      unitPrice: l.unitPrice,
      qty: l.qty,
      gstApplicable: l.gstApplicable,
      gstRate: l.gstRate,
      gstIncluded: l.gstIncluded,
    });
    subtotal += p.net;
    gstTotal += p.gstTotal;
    gstAdded += p.gstAdded;
  }
  const delivery = computeSellerDelivery(lines, settings, customerState);
  const deliveryCharge = delivery.free ? 0 : r2(delivery.slab + delivery.extra);
  return {
    sellerKey,
    subtotal: r2(subtotal),
    gstTotal: r2(gstTotal),
    gstAdded: r2(gstAdded),
    deliveryCharge,
    delivery,
    total: r2(subtotal + gstAdded + deliveryCharge),
  };
}

// ─── Source-document readers ────────────────────────────────────────────────
//
// Product, inventory, seller-copy and availability[] documents all carry a
// pack-size ladder and the store's commercial settings, in slightly different
// shapes. These two readers are the only place that knowledge lives.

/**
 * Price of the chosen pack size from a `variants[]` ladder, or null when the
 * item has no size or the ladder has no matching, positive price.
 *
 * Matching goes through normalizeUnit so "1 kg", "1KG" and "1kg" are the same
 * size, as they are everywhere else. Null means "use the base price" — the
 * previous behaviour — so a size the ladder doesn't list is never priced at 0.
 */
export function variantPriceFor(variants: unknown, variantUnit: string | null | undefined): number | null {
  if (!variantUnit || !Array.isArray(variants)) return null;
  const want = normalizeUnit(variantUnit);
  if (!want) return null;
  for (const v of variants as Array<Record<string, unknown> | null>) {
    if (!v || normalizeUnit(String(v.unit ?? "")) !== want) continue;
    const price = Number(v.price);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

// ─── Seller identity matching (single source of truth) ──────────────────────
//
// A product's sellers are stored across mixed schemas: a seller COPY, an
// INVENTORY row, or a canonical availability[] entry, each naming its seller
// under ANY of several fields (ownerId / retailerId / ownerPhone / retailerPhone
// / manufacturerPhone / storeId / storePhone) and in either E164 or 10-digit
// form. Resolving "does this doc belong to the selected seller?" in one place
// keeps the checkout backend and the cart reader from diverging — the bug where
// a copy keyed by ownerPhone was invisible to a retailerPhone-only lookup.

/** A phone reduced to its last 10 digits, or "" when not phone-shaped. */
export function phoneTail(s: unknown): string {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

const SELLER_ID_FIELDS = [
  "ownerId", "retailerId", "ownerPhone", "retailerPhone", "manufacturerPhone", "storeId", "storePhone",
] as const;

/**
 * Build a predicate that tells whether a seller-shaped doc (copy / inventory /
 * availability entry) belongs to the seller named by `keys` (any mix of phone
 * and/or UID). Matches on any identifier field, with phone-tail equivalence so
 * an E164 value matches a 10-digit one. Genuinely different sellers never
 * collide: only non-empty identifiers are compared.
 */
export function makeSellerMatcher(
  keys: Array<string | null | undefined>,
): (doc: Record<string, unknown> | null | undefined) => boolean {
  const idSet = new Set(keys.map((k) => String(k ?? "").trim()).filter(Boolean));
  const tailSet = new Set(Array.from(idSet).map(phoneTail).filter(Boolean));
  return (doc) => {
    if (!doc) return false;
    for (const f of SELLER_ID_FIELDS) {
      const s = String((doc as Record<string, unknown>)[f] ?? "").trim();
      if (!s) continue;
      if (idSet.has(s)) return true;
      const t = phoneTail(s);
      if (t && tailSet.has(t)) return true;
    }
    return false;
  };
}

/**
 * The seller's own per-size ladder, taken from whichever of its sources
 * configured one (inventory → copy → availability entry). The first NON-EMPTY
 * ladder wins; undefined when the seller configured none (then the caller uses
 * the canonical ladder or the base-size rule). This is deliberately independent
 * of which doc named the seller, so a manufacturer selling its own copy and a
 * retailer with an availability entry are handled by the same code.
 */
export function pickSellerLadder(
  sources: Array<unknown>,
): Array<Record<string, unknown>> | undefined {
  for (const v of sources) {
    if (Array.isArray(v) && v.length > 0) return v as Array<Record<string, unknown>>;
  }
  return undefined;
}

// ─── Variant resolution (single source of truth) ────────────────────────────
//
// Both the Product Detail store list and the checkout backend must resolve a
// seller's price for the SELECTED pack size the same way, or the amount shown,
// the amount charged and the order record drift. The rules below mirror the
// client's resolveStoreVariant exactly:
//
//   • A seller that configured its OWN pack-size ladder is authoritative: the
//     selected size is either in that ladder (use its price) or the seller does
//     not stock it (NOT_STOCKED). There is no fall-through to another source or
//     to the base price — that was the "charge 1 L money for a 5 L can" bug.
//   • A seller with NO ladder (legacy single-price store) offers only the base
//     size; any other size is NOT_STOCKED.
//   • The manufacturer-direct / owner listing (no seller-specific source) uses
//     the canonical product ladder under the same rules.
//   • A product with no variants at all is single-size: the base price is the
//     only price and is always valid.

// A flat (non-discriminated) result shape on purpose: this project compiles with
// `strict: false`, where TypeScript does NOT reliably narrow a discriminated
// union on a boolean `ok` flag. Optional fields let callers read `code` on the
// failure path and `price`/`stock` on the success path without a type error.
export type VariantMatch = {
  ok: boolean;
  /** Present when ok. */
  price?: number;
  /** Present when ok; null when the source carries no per-variant stock count. */
  stock?: number | null;
  /** Present when !ok. */
  code?: "not_stocked" | "invalid_price";
};

type Variant = { unit?: unknown; price?: unknown; stock?: unknown };

/** The canonical base size's normalized unit — the size the base/selling price
 *  refers to. Mirrors the client's baseVariantIdx (price match, else first). */
export function baseVariantUnit(canonicalVariants: unknown, basePrice: number): string {
  if (!Array.isArray(canonicalVariants) || canonicalVariants.length === 0) return "";
  const list = canonicalVariants as Variant[];
  const byPrice = list.find((v) => Number(v?.price) === basePrice);
  return normalizeUnit(String((byPrice ?? list[0])?.unit ?? ""));
}

/** Look up the selected size in a ladder, distinguishing "size absent" from
 *  "size present but priced 0/NaN" so the caller can report the right reason.
 *  Tolerant of duplicate/conflicting rows for the same size: the FIRST row with
 *  a valid positive price wins; invalid_price is reported only when the size is
 *  present but no row prices it validly. */
function matchInLadder(variants: unknown, variantUnit: string): VariantMatch | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const want = normalizeUnit(variantUnit);
  const matches = (variants as Variant[]).filter((v) => normalizeUnit(String(v?.unit ?? "")) === want);
  if (matches.length === 0) return { ok: false, code: "not_stocked" };
  for (const m of matches) {
    const price = Number(m.price);
    if (Number.isFinite(price) && price > 0) {
      const stockNum = Number(m.stock);
      return { ok: true, price, stock: Number.isFinite(stockNum) ? stockNum : null };
    }
  }
  return { ok: false, code: "invalid_price" };
}

/**
 * Resolve the price (and variant stock, if the ladder carries it) for the
 * selected pack size from ONE seller source plus the canonical product.
 *
 *   variantUnit        selected size; "" ⇒ single-size product, base price wins.
 *   sellerVariants     the seller's OWN ladder (inventory/copy/availability), or
 *                      undefined when this seller has none / is the owner listing.
 *   sellerBasePrice    the seller's own base/selling price (0 when none).
 *   hasSellerSource    true for a retailer/self listing, false for the canonical
 *                      owner listing with no seller-specific document.
 *   canonicalVariants  the product's own ladder; canonicalBasePrice its base.
 */
export function resolveVariant(opts: {
  variantUnit: string;
  sellerVariants?: unknown;
  sellerBasePrice?: number;
  hasSellerSource: boolean;
  canonicalVariants?: unknown;
  canonicalBasePrice: number;
}): VariantMatch {
  const {
    variantUnit,
    sellerVariants,
    sellerBasePrice = 0,
    hasSellerSource,
    canonicalVariants,
    canonicalBasePrice,
  } = opts;

  const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : null);

  // Single-size product (no size selected): the base price is the only price.
  if (!normalizeUnit(variantUnit)) {
    const price = positive(sellerBasePrice) ?? positive(canonicalBasePrice);
    return price !== null ? { ok: true, price, stock: null } : { ok: false, code: "invalid_price" };
  }

  // 1) Seller with its own ladder → authoritative, no fallback.
  const sellerLadder = matchInLadder(sellerVariants, variantUnit);
  if (sellerLadder) return sellerLadder;

  // 2) Seller source present but no ladder → legacy single-price store: base only.
  if (hasSellerSource) {
    const baseUnit = baseVariantUnit(canonicalVariants, canonicalBasePrice);
    const isBase = baseUnit === "" || baseUnit === normalizeUnit(variantUnit);
    if (!isBase) return { ok: false, code: "not_stocked" };
    const price = positive(sellerBasePrice) ?? positive(canonicalBasePrice);
    return price !== null ? { ok: true, price, stock: null } : { ok: false, code: "invalid_price" };
  }

  // 3) Owner / manufacturer-direct listing → canonical ladder under the same rules.
  const canonLadder = matchInLadder(canonicalVariants, variantUnit);
  if (canonLadder) return canonLadder;

  // Canonical product has no ladder at all → single-size; base price is valid.
  const price = positive(canonicalBasePrice);
  return price !== null ? { ok: true, price, stock: null } : { ok: false, code: "invalid_price" };
}

/**
 * The pack size a cart line is WEIGHED as for the delivery slab. Pricing is not
 * affected: resolveVariant still prices a line with no size at the base price.
 *
 * A line can arrive with no size (a card's quick "+ Add", or a cart saved before
 * that button carried one). Weighed as nothing it was 0 kg, which matched the
 * lowest slab and went out with free delivery (Crystal Gramoxone 1L, 31 Oct
 * 2026). The same sources resolveVariant reads decide what it weighs:
 *   • the seller's own ladder: its only size, or the shopper must choose;
 *   • a retailer listing with no ladder: it sells only the base size;
 *   • otherwise the product's ladder: its only size, or the shopper must
 *     choose; with no ladder, the product's base unit ("" when none is set).
 * `{ ok: false }` means the listing has several sizes and none was picked.
 */
export function packUnitForWeight(opts: {
  variantUnit: string;
  sellerVariants?: unknown;
  hasSellerSource: boolean;
  canonicalVariants?: unknown;
  canonicalBasePrice: number;
  canonicalUnit?: unknown;
}): { ok: true; unit: string } | { ok: false } {
  const chosen = String(opts.variantUnit ?? "").trim();
  if (normalizeUnit(chosen)) return { ok: true, unit: chosen };

  // Distinct sizes in a ladder, keeping each one's own spelling for the record.
  const sizes = (ladder: unknown): string[] => {
    if (!Array.isArray(ladder)) return [];
    const seen = new Map<string, string>();
    for (const v of ladder as Variant[]) {
      const unit = String(v?.unit ?? "").trim();
      const key = normalizeUnit(unit);
      if (key && !seen.has(key)) seen.set(key, unit);
    }
    return Array.from(seen.values());
  };
  const onlySize = (list: string[], fallback: string): { ok: true; unit: string } | { ok: false } =>
    list.length === 1 ? { ok: true, unit: list[0]! }
    : list.length > 1 ? { ok: false }
    : { ok: true, unit: fallback };
  const productUnit = String(opts.canonicalUnit ?? "").trim();

  if (Array.isArray(opts.sellerVariants) && opts.sellerVariants.length > 0) {
    return onlySize(sizes(opts.sellerVariants), "");
  }
  if (opts.hasSellerSource) {
    const base = baseVariantUnit(opts.canonicalVariants, opts.canonicalBasePrice);
    const spelled = sizes(opts.canonicalVariants).find((u) => normalizeUnit(u) === base);
    return { ok: true, unit: spelled ?? productUnit };
  }
  return onlySize(sizes(opts.canonicalVariants), productUnit);
}

export type Commercial = {
  gstApplicable: boolean;
  gstRate: number;
  /** Default TRUE — only an explicit false is exclusive. */
  gstIncluded: boolean;
  extraDeliveryCharge: number;
  freeDelivery: boolean;
};

/** A store's own GST + delivery settings from any product-shaped document. */
export function commercialOf(d: Record<string, unknown> | null | undefined): Commercial {
  const rate = Number(d?.gstRate);
  const extra = Number(d?.extraDeliveryCharge);
  return {
    gstApplicable: d?.gstApplicable === true,
    gstRate: Number.isFinite(rate) && rate > 0 ? Math.min(rate, 100) : 0,
    gstIncluded: d?.gstIncluded !== false,
    extraDeliveryCharge: Number.isFinite(extra) && extra > 0 ? extra : 0,
    freeDelivery: d?.freeDelivery === true,
  };
}

/**
 * Whether a document carries commercial settings at all. A seller copy or
 * inventory row written before these fields existed has none; it must not be
 * read as "explicitly no GST" when a fresher source has the real settings.
 */
export function hasCommercial(d: Record<string, unknown> | null | undefined): boolean {
  if (!d) return false;
  return (
    d.gstApplicable !== undefined ||
    d.gstRate !== undefined ||
    d.gstIncluded !== undefined ||
    d.extraDeliveryCharge !== undefined ||
    d.freeDelivery !== undefined
  );
}

/**
 * The seller's discount on [price], from a priced doc's discount fields —
 * the same helpers the cart and product page use (app/utils/discount.ts), so
 * the charge matches what the customer was shown:
 *  - a percentage applies only when discountType isn't "fixed_amount" (the
 *    app stores a leftover discountPct next to a fixed discount), and
 *  - a fixed amount respects the discount's start/end dates (an expired
 *    ₹300-off was still being taken off a ₹400 item).
 */
export function discountedPrice(d: Record<string, unknown>, price: number): number {
  const fields = d as unknown as DiscountFields;
  const pct = getActiveDiscountPct(fields);
  const pctOff = Math.round((price * pct) / 100 * 100) / 100;
  const fixedOff = getActiveDiscountAmt(fields);
  return Math.round(Math.max(0, price - pctOff - fixedOff) * 100) / 100;
}

/** First value that is a positive number — a stored 0 is "not priced", never "free". */
export function positive(...values: unknown[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * The unit price of the pack size the customer chose, at THIS store.
 *
 * [ladders] are this store's size lists, most specific first (its inventory
 * row, its product copy, its availability[] entry, and the product's own
 * list when the store owns the product). The first one listing the size wins.
 * When none does:
 *  - no size asked, or a single-size product → [storeBase];
 *  - the product's base size → [storeBase] (the store's plain price is the
 *    base size's price);
 *  - any other size → null: this store doesn't price that size, and the line
 *    is refused rather than charged at the base price. Charging the base was
 *    the bug: a 5 L can of a product whose 1 L costs ₹200 was charged ₹200.
 */
export function sizePrice(
  variantUnit: string,
  storeBase: number,
  ladders: unknown[],
  catalog: Record<string, unknown> | null,
): number | null {
  if (!variantUnit) return storeBase > 0 ? storeBase : null;
  for (const ladder of ladders) {
    const p = variantPriceFor(ladder, variantUnit);
    if (p !== null) return p;
  }
  const catalogSizes = Array.isArray(catalog?.variants)
    ? (catalog!.variants as Array<Record<string, unknown> | null>).filter((v) => v && normalizeUnit(String(v.unit ?? '')))
    : [];
  if (catalogSizes.length < 2) return storeBase > 0 ? storeBase : null;
  const catalogPrice = Number(catalog?.price);
  const base = catalogSizes.find((v) => Number(v!.price) === catalogPrice) ?? catalogSizes[0];
  if (normalizeUnit(String(base!.unit ?? '')) === normalizeUnit(variantUnit)) {
    return storeBase > 0 ? storeBase : null;
  }
  return null;
}
