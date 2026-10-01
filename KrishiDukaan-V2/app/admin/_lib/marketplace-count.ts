/**
 * How many product cards the marketplace actually shows — the ONE rule, so
 * Admin → Overview and the buyer-facing "Showing N products" agree.
 *
 * Mirrors fetchMarketplaceProducts (app/firebase.ts) exactly:
 *   1. Inactive docs (isActive === false) are excluded.
 *   2. Canonical docs (not a per-seller copy) need a name, an image and a
 *      finite price; they dedupe by lower-cased name.
 *   3. A per-seller COPY whose name matches no canonical product is PROMOTED
 *      to its own card, so a retailer-only listing is still buyable. It needs
 *      a name, a price and some seller key (ownerId / retailerId / retailerPhone).
 *
 * The Overview used to count rule 2 only — no active filter, no promoted
 * copies — so it read 148 while buyers saw a different number. Counting the
 * same thing from the same rule is the only way to keep them equal.
 */

export const COPY_SOURCES = new Set(["admin_assigned", "retailer_inventory_copy", "manufacturer_assigned"]);

type ProductLike = {
  name?: unknown;
  image?: unknown;
  price?: unknown;
  source?: unknown;
  isActive?: unknown;
  ownerId?: unknown;
  retailerId?: unknown;
  retailerPhone?: unknown;
};

export type MarketplaceCount = {
  /** Distinct cards a buyer sees — the headline number. */
  total: number;
  /** Cards backed by a canonical (manufacturer/admin) product. */
  canonical: number;
  /** Retailer-only listings promoted to their own card (no canonical match). */
  promotedCopies: number;
};

export function countMarketplaceProducts(products: ProductLike[]): MarketplaceCount {
  const key = (p: ProductLike) => String(p.name ?? "").toLowerCase().trim();
  const isCopy = (p: ProductLike) => COPY_SOURCES.has(String(p.source ?? ""));
  const active = products.filter((p) => p.isActive !== false);

  const canonicalKeys = new Set(
    active
      .filter((p) => p.name && p.image && Number.isFinite(Number(p.price ?? 0)) && !isCopy(p))
      .map(key)
      .filter(Boolean),
  );

  const keys = new Set(canonicalKeys);
  for (const c of active) {
    if (!isCopy(c) || !c.name || !c.price) continue;
    if (!(c.ownerId || c.retailerId || c.retailerPhone)) continue;
    keys.add(key(c));
  }

  return {
    total: keys.size,
    canonical: canonicalKeys.size,
    promotedCopies: keys.size - canonicalKeys.size,
  };
}
