import { createHash } from "crypto";
import {
  collection,
  documentId,
  getCount,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "./firebase-client-server";
import { isListable } from "./seo/products-server";
import { CARDS_COLLECTION, cardToProduct } from "./marketplace-cards";
import type { BrandProductSummary } from "../dashboard/_lib/brand-page-types";
import type { MarketplaceProduct } from "../../types/product";

/**
 * One page of a brand's OWN products for /brand/[slug] and its "Load more".
 *
 * Why this shape:
 *  - `manufacturerPhone` is stamped on every product a brand owns AND on every
 *    retailer copy of it (one brand has 2,000+ copies), so the query also
 *    filters `source` to the brand's own docs. Without that filter a brand page
 *    would read thousands of copies just to throw them away.
 *  - The old page matched on the manufacturer's `uid`, which is wrong on some
 *    accounts (UNIMAX stores its phone number there while its products carry
 *    the real login id), so those brands showed no products at all.
 *  - Ordered by document id so a cursor is just the last id.
 *  - Pricing comes from the pre-merged marketplaceCards for exactly the
 *    products on the page, not from reading every seller copy.
 */

export const BRAND_PAGE_SIZE = 12;
// Docs a brand owns itself; copies (retailer_inventory_copy, manufacturer_assigned,
// admin_assigned) are deliberately left out.
const OWN_SOURCES = ["manufacturer_inventory", "admin"];
// A page can lose some docs to isListable() (no image / no price); read a few
// more rounds rather than return an empty page while more products exist.
const MAX_ROUNDS = 3;
const IN_CHUNK = 30;

export type BrandProductsPage = {
  products: BrandProductSummary[];
  marketProducts: MarketplaceProduct[];
  /** Last document id read; pass back as `after`. null when there is no more. */
  nextCursor: string | null;
};

function ownProductsQuery(manufacturerPhone: string) {
  return query(
    collection(getClientDb(), "products"),
    where("manufacturerPhone", "==", manufacturerPhone),
    where("isActive", "==", true),
    where("source", "in", OWN_SOURCES),
  );
}

/** Total products shown for the brand (one count read, no documents). */
export async function countBrandProducts(manufacturerPhone: string): Promise<number> {
  try {
    const snap = await getCount(ownProductsQuery(manufacturerPhone));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function fetchBrandProductsPage(
  manufacturerPhone: string,
  after?: string | null,
): Promise<BrandProductsPage> {
  const products: BrandProductSummary[] = [];
  let cursor = after || null;
  let exhausted = false;

  for (let round = 0; round < MAX_ROUNDS && products.length < BRAND_PAGE_SIZE && !exhausted; round++) {
    const constraints = [orderBy(documentId())];
    if (cursor) constraints.push(startAfter(cursor) as never);
    const snap = await getDocs(
      query(ownProductsQuery(manufacturerPhone), ...(constraints as []), limit(BRAND_PAGE_SIZE)),
    );
    for (const d of snap.docs) {
      const r = d.data() as Record<string, unknown>;
      if (!isListable(r)) continue;
      products.push({
        id: d.id,
        name: String(r.name ?? ""),
        category: String(r.category ?? ""),
        price: Number(r.price ?? 0),
        image: String(r.image ?? ""),
      });
    }
    if (snap.docs.length > 0) cursor = snap.docs[snap.docs.length - 1].id;
    if (snap.docs.length < BRAND_PAGE_SIZE) exhausted = true;
  }

  const marketProducts = await fetchCardsForNames(products.map((p) => p.name));
  return { products, marketProducts, nextCursor: exhausted ? null : cursor };
}

/** Pre-merged marketplace cards (cross-seller price, discount, rating) by product name. */
export async function fetchCardsForNames(names: string[]): Promise<MarketplaceProduct[]> {
  const ids = Array.from(
    new Set(
      names
        .map((n) => n.toLowerCase().trim())
        .filter(Boolean)
        .map((k) => createHash("sha1").update(k).digest("hex")),
    ),
  );
  const out: MarketplaceProduct[] = [];
  const db = getClientDb();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const snap = await getDocs(
      query(collection(db, CARDS_COLLECTION), where(documentId(), "in", ids.slice(i, i + IN_CHUNK))),
    ).catch(() => null);
    if (!snap) continue;
    for (const d of snap.docs) out.push(cardToProduct({ id: d.id, ...d.data() }));
  }
  return out;
}
