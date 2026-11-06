import { NextResponse } from "next/server";
import { FieldPath, type Query } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import {
  CARDS_COLLECTION,
  SEARCH_COLLECTION,
  cardToProduct,
  normalizeCategory,
  searchTerms,
} from "../../../lib/marketplace-cards";

// Admin SDK + Firestore cursor paging need the Node runtime, and every response
// depends on the requested cursor, so this route is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/products?pageSize=20&category=Seeds&search=urea&cursor=<opaque>
 *
 * Cursor-paginated Market grid and navbar suggestions (`suggest=1`), read from
 * marketplaceCards: one pre-merged card per product name, maintained by Cloud
 * Functions. A browse page reads pageSize cards; a search page reads the
 * matching marketplaceSearch token docs plus those cards.
 *
 * Response: { products: MarketplaceProduct[], nextCursor: string | null, hasMore: boolean }
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// Multi-word searches query on the most selective word and check the rest in
// memory, so they may need to scan past non-matches. Bounded per request.
const SEARCH_SCAN_CHUNK = 60;
const SEARCH_MAX_CHUNKS = 10;

// A page of this feed is identical for every visitor — distance ordering
// happens in the browser — so one computation can serve everyone briefly.
const CACHE_TTL_MS = 60_000;
// Bounded so distinct search terms cannot grow this without limit.
const CACHE_MAX_ENTRIES = 200;

type CachedEntry = { body: unknown; at: number };
const responseCache = new Map<string, CachedEntry>();

function cacheGet(key: string): unknown | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  // Re-insert so the Map's insertion order doubles as LRU order.
  responseCache.delete(key);
  responseCache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: unknown): void {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, { body, at: Date.now() });
}

// Lets Firebase Hosting's CDN serve repeat requests without waking the SSR
// function at all; stale-while-revalidate keeps the feed instant for a further
// 5 minutes while a fresh copy is computed in the background.
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

type Cursor = { k: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.k === "string" && typeof parsed?.id === "string") {
      return { k: parsed.k, id: parsed.id };
    }
  } catch {
    /* fall through: an unreadable cursor restarts from the first page */
  }
  return null;
}

type Page = {
  ids: string[];
  next: Cursor | null;
  /** The docs themselves, when the query was on the cards collection. */
  docs?: FirebaseFirestore.QueryDocumentSnapshot[];
};

/** Reads an ordered (nameKey, id) query, pageSize at a time. */
async function readPage(query: Query, cursor: Cursor | null, pageSize: number): Promise<Page> {
  const q = cursor ? query.startAfter(cursor.k, cursor.id) : query;
  const snap = await q.limit(pageSize + 1).get();
  const docs = snap.docs.slice(0, pageSize);
  const last = docs[docs.length - 1];
  return {
    ids: docs.map((d) => d.id),
    next: snap.size > pageSize && last ? { k: String(last.get("nameKey") ?? ""), id: last.id } : null,
    docs,
  };
}

/** Search: array-contains on the most selective word, other words checked here. */
async function searchPage(
  query: Query,
  otherTerms: string[],
  cursor: Cursor | null,
  pageSize: number,
): Promise<Page> {
  if (otherTerms.length === 0) return readPage(query, cursor, pageSize);

  const matched: Cursor[] = [];
  let after = cursor;
  let exhausted = false;
  for (let chunk = 0; chunk < SEARCH_MAX_CHUNKS && matched.length <= pageSize; chunk++) {
    const q = after ? query.startAfter(after.k, after.id) : query;
    const snap = await q.limit(SEARCH_SCAN_CHUNK).get();
    for (const d of snap.docs) {
      after = { k: String(d.get("nameKey") ?? ""), id: d.id };
      const keywords = (d.get("searchKeywords") ?? []) as string[];
      if (otherTerms.every((t) => keywords.includes(t))) {
        matched.push(after);
        if (matched.length > pageSize) break;
      }
    }
    if (snap.size < SEARCH_SCAN_CHUNK) {
      exhausted = true;
      break;
    }
  }

  const page = matched.slice(0, pageSize);
  if (matched.length > pageSize) return { ids: page.map((m) => m.id), next: page[page.length - 1] };
  // The scan budget ran out before the end: continue from the last doc scanned.
  return { ids: page.map((m) => m.id), next: exhausted ? null : after };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );
  const category = normalizeCategory(searchParams.get("category") ?? "");
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const cursor = decodeCursor(searchParams.get("cursor"));
  // Navbar autocomplete. Cards already carry ratings, so it costs the same as search.
  const suggest = searchParams.get("suggest") === "1";

  // Keyed on every input that changes the result, including the raw cursor.
  const cacheKey = [
    pageSize,
    category,
    search,
    searchParams.get("cursor") ?? "",
    suggest ? "1" : "0",
  ].join("|");

  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
  }

  try {
    const db = getAdminDb();
    const cards = db.collection(CARDS_COLLECTION);
    const byName = (q: Query) => q.orderBy("nameKey").orderBy(FieldPath.documentId());
    const inCategory = (q: Query) => (category ? q.where("categoryKey", "==", category) : q);

    let page: Page;
    const terms = searchTerms(search);
    if (!search) {
      page = await readPage(byName(inCategory(cards)), cursor, pageSize);
    } else if (terms.length > 0) {
      const [primary, ...rest] = terms;
      const tokens = inCategory(db.collection(SEARCH_COLLECTION).where("searchKeywords", "array-contains", primary));
      const matches = await searchPage(byName(tokens), rest, cursor, pageSize);
      // Those were token docs; the cards share their ids.
      page = { ids: matches.ids, next: matches.next };
    } else {
      // A single character: names starting with it.
      const ch = search.slice(0, 1);
      const prefix = inCategory(cards).where("nameKey", ">=", ch).where("nameKey", "<", `${ch}`);
      page = await readPage(byName(prefix), cursor, pageSize);
    }

    const snaps = page.docs ??
      (page.ids.length ? await db.getAll(...page.ids.map((id) => cards.doc(id))) : []);
    // A card deleted between the two reads is simply skipped.
    const products = snaps.filter((s) => s.exists).map((s) => cardToProduct(s.data() ?? {}));

    const body = {
      products,
      nextCursor: page.next ? encodeCursor(page.next) : null,
      hasMore: page.next !== null,
    };
    // Only successful payloads are cached; the error path below stays uncached
    // so a transient Firestore failure cannot be pinned for the whole TTL.
    cacheSet(cacheKey, body);

    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("[api/marketplace/products] failed:", err);
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 },
    );
  }
}
