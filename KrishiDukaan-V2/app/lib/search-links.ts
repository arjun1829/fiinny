/**
 * Search links: searches an admin tied to a product, so a farmer's own words
 * for it ("power plus booster", "pawar plus") always find it.
 *
 * searchLinks/{cardId} = { nameKey, productName, terms: string[], updatedAt, updatedBy }
 *   cardId = sha1(nameKey), the same id as marketplaceCards/marketplaceSearch.
 *   A Cloud Function (syncMarketplaceCardOnSearchLinkWrite) rebuilds the
 *   product's card when this changes, adding the terms to its search words.
 * searchLinkSettings/ignored = { terms: string[] }: searches hidden from the
 *   "not linked yet" list (junk, phone numbers, things we'll never sell).
 */
import {
  arrayRemove,
  arrayUnion,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { nameWords, phoneticKey } from "./marketplace-cards";

export const LINKS_COLLECTION = "searchLinks";
export const LINK_SETTINGS_COLLECTION = "searchLinkSettings";
export const IGNORED_DOC = "ignored";
export const MAX_LINKED_TERMS = 200;

export type SearchLink = {
  cardId: string;
  nameKey: string;
  productName: string;
  terms: string[];
};

// Unicode-aware (Devanagari etc.); built via RegExp() because tsconfig targets ES5.
const NOT_TERM_CHAR = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s]+", "gu");

/**
 * A search as /api/analytics/search stores it (searchStats keys), so a link
 * made here matches the term the stats show. Keep in step with normalizeTerm()
 * in app/api/analytics/search/route.ts.
 */
export function normalizeSearchTerm(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.'’]/g, "")
    .replace(NOT_TERM_CHAR, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
}

/** The card id for a product name: sha1 of its lower-cased, trimmed name. */
export async function cardIdForName(name: string): Promise<{ cardId: string; nameKey: string }> {
  const nameKey = String(name ?? "").toLowerCase().trim();
  const bytes = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(nameKey));
  const cardId = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
  return { cardId, nameKey };
}

export async function linkSearches(db: Firestore, productName: string, terms: string[], by: string | null): Promise<void> {
  const clean = Array.from(new Set(terms.map(normalizeSearchTerm).filter((t) => t.length >= 2)));
  if (clean.length === 0) return;
  const { cardId, nameKey } = await cardIdForName(productName);
  await setDoc(doc(db, LINKS_COLLECTION, cardId), {
    nameKey,
    productName: productName.trim(),
    terms: arrayUnion(...clean),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  }, { merge: true });
}

export async function unlinkSearches(db: Firestore, cardId: string, terms: string[], by: string | null): Promise<void> {
  if (terms.length === 0) return;
  await updateDoc(doc(db, LINKS_COLLECTION, cardId), {
    terms: arrayRemove(...terms),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}

export async function setIgnored(db: Firestore, terms: string[], ignore: boolean): Promise<void> {
  if (terms.length === 0) return;
  await setDoc(doc(db, LINK_SETTINGS_COLLECTION, IGNORED_DOC), {
    terms: ignore ? arrayUnion(...terms) : arrayRemove(...terms),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * A sound-alike key for a whole search: each word's phonetic key (or the word
 * itself for Hindi/Marathi script or numbers), joined. "powar plus" and
 * "power plus" share "pwrpls"; half-typed "pow" gives "pw", a prefix of it.
 */
export function searchSkeleton(term: string): string {
  return nameWords(term).map((w) => phoneticKey(w) || w).join("");
}

export type TermStat = { term: string; searches: number; noResults: number };

export type SimilarGroup = {
  /** The most-searched search in the group. */
  head: string;
  members: TermStat[];
  searches: number;
  noResults: number;
};

/**
 * Groups searches that are spellings, sound-alikes or half-typed versions of
 * one another ("power plus booster", "powar plus", "pow"). Most-searched terms
 * start groups; each other term joins the biggest group whose key starts
 * with its key or whose key it starts with. A term never bridges two groups,
 * so a short "po" can't merge "power" with "potash".
 */
export function groupSimilarSearches(stats: TermStat[]): SimilarGroup[] {
  const sorted = [...stats].sort((a, b) => b.searches - a.searches || a.term.localeCompare(b.term));
  const groups: Array<SimilarGroup & { key: string }> = [];
  for (const s of sorted) {
    const key = searchSkeleton(s.term);
    // A two-letter key ("kr" from "khira") is too loose on its own: it joins
    // only as a half-typed start of a search already in the group ("pow").
    const home = key.length >= 2
      ? groups.find((g) =>
        (g.key.startsWith(key) || (g.key.length >= 3 && key.startsWith(g.key))) &&
        (key.length >= 3 || g.members.some((m) => m.term.startsWith(s.term))))
      : undefined;
    if (home) {
      home.members.push(s);
      home.searches += s.searches;
      home.noResults += s.noResults;
    } else {
      groups.push({ key, head: s.term, members: [s], searches: s.searches, noResults: s.noResults });
    }
  }
  return groups
    .map(({ key: _key, ...g }) => g)
    .sort((a, b) => b.searches - a.searches);
}

// Words in many product names; matching on them alone suggests noise.
const GENERIC_WORDS = new Set([
  "plus", "gold", "super", "pro", "max", "xtra", "extra", "new", "seed", "seeds", "kit",
  "herbicide", "insecticide", "fungicide", "fertilizer", "fertiliser", "liquid", "powder", "granules",
]);

/**
 * Searches that look like they mean this product: one of its words (or a
 * sound-alike of one) appears in the search, or the search is a spelling of
 * a search already linked to it. Used to suggest more links per product.
 */
export function looksLikeProduct(term: string, productName: string, linked: string[]): boolean {
  const key = searchSkeleton(term);
  if (key.length < 2) return false;
  if (linked.some((l) => {
    const lk = searchSkeleton(l);
    return lk.startsWith(key) || (lk.length >= 3 && key.startsWith(lk));
  })) return true;
  const meaningful = (w: string) => w.length >= 3 && !GENERIC_WORDS.has(w);
  const productWords = nameWords(productName).filter(meaningful);
  const termWords = nameWords(term).filter(meaningful);
  return termWords.some((tw) => productWords.some((pw) => {
    if (tw === pw) return true;
    const a = phoneticKey(tw);
    const b = phoneticKey(pw);
    return a.length >= 3 && a === b;
  }));
}
