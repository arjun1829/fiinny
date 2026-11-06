import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { getDocsByIds } from "./firestore-by-ids";
import { CARDS_COLLECTION, SEARCH_COLLECTION, searchTerms } from "./marketplace-cards";

/**
 * Marketplace cards whose product name contains `term`, sorted by name, at
 * most `max`: a name prefix query on marketplaceCards plus the name tokens on
 * the Market search docs (marketplaceSearch.nameKeywords), checked against the
 * whole term. About max + 2.5 × max small reads, whatever the catalogue size.
 * Returns [card doc id, card data] pairs (a card's own `id` field is its
 * canonical product).
 */
export async function findCardsByName(
  db: Firestore,
  term: string,
  max = 10,
): Promise<Array<[string, DocumentData]>> {
  const lower = term.trim().toLowerCase();
  if (!lower) return [];
  const cardsCol = collection(db, CARDS_COLLECTION);
  const [primary] = searchTerms(lower);

  // The two lookups run independently. The prefix query on marketplaceCards
  // needs only the automatic single-field index on nameKey, while the token
  // query on marketplaceSearch needs a composite (nameKeywords + nameKey)
  // index. If that composite index is missing in an environment the token
  // query rejects — and combining both with Promise.all used to make the whole
  // search throw, so the caller's catch blanked the autocomplete even when the
  // prefix query had matches. Isolating each failure keeps the reliable prefix
  // results flowing and surfaces the real error in the console instead of
  // silently showing no suggestions.
  const [prefixSnap, tokenSnap] = await Promise.all([
    getDocs(query(
      cardsCol,
      where("nameKey", ">=", lower),
      where("nameKey", "<", `${lower}`),
      orderBy("nameKey"),
      limit(max),
    )).catch((e) => {
      console.warn("[findCardsByName] marketplaceCards prefix query failed:", e);
      return null;
    }),
    primary
      ? getDocs(query(
        collection(db, SEARCH_COLLECTION),
        where("nameKeywords", "array-contains", primary),
        orderBy("nameKey"),
        limit(Math.ceil(max * 2.5)),
      )).catch((e) => {
        console.warn("[findCardsByName] marketplaceSearch token query failed (needs composite index?):", e);
        return null;
      })
      : Promise.resolve(null),
  ]);

  const nameById = new Map<string, string>();
  const cardData = new Map<string, DocumentData>();
  for (const d of prefixSnap?.docs ?? []) {
    nameById.set(d.id, String(d.get("nameKey") ?? ""));
    cardData.set(d.id, d.data());
  }
  for (const d of tokenSnap?.docs ?? []) {
    const nameKey = String(d.get("nameKey") ?? "");
    if (nameKey.includes(lower)) nameById.set(d.id, nameKey);
  }

  const ids = Array.from(nameById.keys())
    .sort((a, b) => nameById.get(a)!.localeCompare(nameById.get(b)!))
    .slice(0, max);
  const missing = ids.filter((id) => !cardData.has(id));
  if (missing.length > 0) {
    for (const [id, data] of Array.from(await getDocsByIds(db, CARDS_COLLECTION, missing))) cardData.set(id, data);
  }
  return ids.filter((id) => cardData.has(id)).map((id) => [id, cardData.get(id)!]);
}
