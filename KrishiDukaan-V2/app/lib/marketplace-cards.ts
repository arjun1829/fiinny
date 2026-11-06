/**
 * Reading marketplaceCards/{id}: one pre-merged card per product name, built
 * by Cloud Functions (functions/src/marketplace/cards.ts). Pure, so both the
 * browser and the server can use it.
 */
import type { MarketplaceProduct } from "../../types/product";

export const CARDS_COLLECTION = "marketplaceCards";
export const SEARCH_COLLECTION = "marketplaceSearch";

// Bookkeeping fields the storefront never renders.
const INTERNAL_FIELDS = [
  "contentHash", "sourceReadTime", "builtAt", "nextRecomputeAt", "memberIds",
  "schemaVersion", "listable", "nameKey", "categoryKey", "createdAtMs",
  "liveDiscountPct", "sellerCount",
];

export function cardToProduct(data: Record<string, unknown>): MarketplaceProduct {
  const product = { ...data };
  for (const field of INTERNAL_FIELDS) delete product[field];
  return product as unknown as MarketplaceProduct;
}

// Must split words exactly like searchWords() in
// functions/src/marketplace/search-keywords.ts. \p{M} keeps Devanagari vowel
// signs attached to their letters.
const MIN_TOKEN = 2;
const MAX_TOKEN = 15;
const WORD_SPLIT = new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "u");

/** Query words usable as search tokens, longest (most selective) first. */
export function searchTerms(query: string): string[] {
  const words = query
    .normalize("NFKC")
    .toLowerCase()
    .split(WORD_SPLIT)
    .filter((w) => w.length >= MIN_TOKEN)
    .map((w) => w.slice(0, MAX_TOKEN));
  return Array.from(new Set(words)).sort((a, b) => b.length - a.length);
}

export function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}
