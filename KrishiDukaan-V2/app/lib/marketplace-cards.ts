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
  "liveDiscountPct", "sellerCount", "searchAliases",
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

/**
 * The query's words in the order typed. Runs of single letters are joined,
 * so "d a p" searches "dap" instead of being dropped.
 */
export function queryWords(query: string): string[] {
  const raw = query.normalize("NFKC").toLowerCase().split(WORD_SPLIT).filter(Boolean);
  const words: string[] = [];
  let run = "";
  for (const w of raw) {
    if (Array.from(w).length === 1) { run += w; continue; }
    if (run) { words.push(run); run = ""; }
    words.push(w);
  }
  if (run) words.push(run);
  return words.filter((w) => Array.from(w).length >= MIN_TOKEN).map((w) => w.slice(0, MAX_TOKEN));
}

/** Query words usable as search tokens, longest (most selective) first. */
export function searchTerms(query: string): string[] {
  return Array.from(new Set(queryWords(query))).sort((a, b) => b.length - a.length);
}

/** Marks a phonetic token; see phoneticKey(). */
export const PHONETIC_MARK = "~";

/**
 * Sound-alike key for a Latin-script word: power / powar / pawar / pavar ->
 * "pwr". Must give the same key as phoneticKey() in
 * functions/src/marketplace/search-keywords.ts (which writes the "~" tokens)
 * and in the mobile app's marketplace_search.dart.
 */
export function phoneticKey(word: string): string {
  const w = word.toLowerCase();
  if (!/^[a-z0-9]+$/.test(w) || /^[0-9]+$/.test(w)) return "";
  const mapped = w
    .replace(/ph/g, "f")
    .replace(/[v]/g, "w")
    .replace(/[qc]/g, "k")
    .replace(/z/g, "j");
  let out = mapped[0];
  for (const ch of mapped.slice(1)) {
    if ("aeiouyh".includes(ch)) continue;
    if (out[out.length - 1] === ch) continue;
    out += ch;
  }
  return out.length >= 2 ? out : "";
}

/** Splits a name into words the way searchWords() does on the server. */
export function nameWords(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().split(WORD_SPLIT).filter(Boolean);
}

/**
 * How well a card answers a search, for ordering results: an exact or
 * linked match first, then names that start with or contain the search, then
 * names holding every word (or a sound-alike), then linked-search words, then
 * everything else (shop name, description, category matches).
 * `terms` are the tokens the search ran on (may include "~" phonetic ones).
 */
export function matchScore(nameKey: string, aliases: string[], query: string, terms: string[]): number {
  const q = queryWords(query).join(" ");
  if (!q) return 0;
  if (nameKey === q || aliases.includes(q)) return 100;
  if (nameKey.startsWith(q)) return 90;
  if (aliases.some((a) => a.startsWith(q))) return 85;
  if (nameKey.includes(q)) return 80;
  const hits = (words: string[], t: string) => t.startsWith(PHONETIC_MARK)
    ? words.some((w) => (PHONETIC_MARK + phoneticKey(w)).startsWith(t) && phoneticKey(w) !== "")
    : words.some((w) => w.includes(t));
  if (terms.length === 0) return 0;
  const name = nameWords(nameKey);
  if (terms.every((t) => hits(name, t))) return 60;
  const alias = aliases.flatMap(nameWords);
  if (terms.every((t) => hits(name, t) || hits(alias, t))) return 50;
  return 0;
}

export function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}
