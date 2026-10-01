import { NextResponse } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import {
  buildRatingAgg,
  mapMarketplaceDoc,
  mergeMarketplaceProducts,
} from "../../../lib/marketplace-merge";
import {
  collectNameGroups,
  collectMatchingNameGroups,
  type GroupCursor,
} from "../../../lib/marketplace-pagination";

// Admin SDK + Firestore cursor paging need the Node runtime, and every response
// depends on the requested cursor, so this route is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/products?pageSize=20&category=Seeds&cursor=<opaque>
 *
 * TRUE cursor pagination for the Web Market / All Products grid. Instead of the
 * client reading the whole `products` collection and merging in the browser,
 * this route reads a bounded window per request and returns ~pageSize merged
 * marketplace cards plus an opaque cursor for the next page.
 *
 * WHY THE PAGE UNIT IS A "NAME GROUP", NOT A RAW DOC:
 * marketplace cards are deduped by product NAME (manufacturer + retailer + admin
 * copies of one name collapse into a single card — see marketplace-merge.ts).
 * So we order raw docs by `name` (which puts every copy of a name adjacent),
 * accumulate COMPLETE name-groups, and only merge/emit groups we know are whole.
 * A group is "complete" once a later (greater) name has appeared. This makes a
 * page's merge identical to merging the whole collection, without ever splitting
 * a card across two pages.
 *
 * Response: { products: MarketplaceProduct[], nextCursor: string | null, hasMore: boolean }
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// Raw docs read per internal Firestore query. A page of ~20 cards needs a bit
// more than 20 raw docs (some names have manufacturer + retailer copies).
const CHUNK = 40;
// Safety cap so a single pathologically-popular name (hundreds of seller copies)
// can never spin the accumulation loop forever.
const MAX_CHUNKS = 12;
// Search may need to scan far past the cursor to gather pageSize MATCHES (matches
// can be sparse), so it gets a larger scan budget than plain browse. Still bounded:
// CHUNK * SEARCH_MAX_CHUNKS caps the raw docs one search request can read.
const SEARCH_MAX_CHUNKS = 40;
// Firestore `in` supports up to 30 values per query.
const IN_CHUNK = 30;

// A page of this feed is identical for every visitor — distance ordering happens
// in the browser — so one computation can serve everyone for a short window.
// That matters here because emitting ~13 merged cards costs up to
// CHUNK * MAX_CHUNKS (480) raw doc reads across that many SEQUENTIAL Firestore
// round-trips; measured at 13s warm and 33s cold against production. The route
// previously sent `no-store`, so every visitor paid that in full.
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

function encodeCursor(c: GroupCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null): GroupCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.name === "string" && typeof parsed?.id === "string") {
      return { name: parsed.name, id: parsed.id };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );
  const category = searchParams.get("category")?.trim() || "";
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const cursor = decodeCursor(searchParams.get("cursor"));
  // Lightweight autocomplete mode (navbar dropdown): same search + canonical
  // merge/dedup, but skip the productReviews read since suggestions don't show
  // ratings. Keeps a keystroke suggestion cheap (one small products scan only).
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

    // One bounded Firestore query per internal chunk. Order by (name, __name__)
    // so copies of the same name are contiguous and the cursor is stable; the
    // optional category filter is applied server-side. This is the ONLY place
    // that touches Firestore — never a full-collection read.
    const fetchChunk = async (after: GroupCursor | null, limit: number) => {
      let q = db.collection("products").orderBy("name").orderBy(FieldPath.documentId());
      if (category) q = q.where("category", "==", category);
      if (after) q = q.startAfter(after.name, after.id);
      const snap = await q.limit(limit).get();
      return snap.docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, name: String(data.name || ""), data };
      });
    };

    // Substring match over one name-group's raw docs. Firestore can't do this in a
    // query, so search scans name-ordered chunks server-side and filters here — the
    // same fields the old client-side search used (name/fullName/description/
    // category/store). A group matches if ANY of its copies matches, so all copies
    // of a matched name flow into the merge together.
    const matchesQuery = (docs: { data: Record<string, any> }[]) =>
      docs.some((d) => {
        const data = d.data;
        return [data.name, data.fullName, data.description, data.category, data.store]
          .some((v) => String(v || "").toLowerCase().includes(search));
      });

    const {
      emitted: emittedDocs,
      nextCursor: nextGroupCursor,
      hasMore,
      rawDocsRead,
      lastConsumedCursor,
      groupsSeen,
    } = search
      ? await collectMatchingNameGroups(fetchChunk, matchesQuery, {
          pageSize,
          chunk: CHUNK,
          maxChunks: SEARCH_MAX_CHUNKS,
          startCursor: cursor,
        })
      : await collectNameGroups(fetchChunk, {
          pageSize,
          chunk: CHUNK,
          maxChunks: MAX_CHUNKS,
          startCursor: cursor,
        });

    // Ratings for exactly the emitted cards' doc ids (chunked `in` queries).
    // Skipped entirely in suggest mode — dropdown suggestions don't show ratings.
    const reviewRows: { catalogId: string; rating: number }[] = [];
    if (!suggest) {
      const ids = emittedDocs.map((d) => d.id);
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const chunk = ids.slice(i, i + IN_CHUNK);
        if (chunk.length === 0) continue;
        const rSnap = await db
          .collection("productReviews")
          .where("catalogId", "in", chunk)
          .get()
          .catch(() => null);
        if (!rSnap) continue;
        for (const rd of rSnap.docs) {
          reviewRows.push({
            catalogId: String(rd.data().catalogId || ""),
            rating: Number(rd.data().rating || 0),
          });
        }
      }
    }
    const ratingAgg = buildRatingAgg(reviewRows);

    const mapped = emittedDocs
      .filter((d) => d.data.isActive !== false)
      .map((d) => mapMarketplaceDoc(d.id, d.data));

    const products = mergeMarketplaceProducts(mapped, ratingAgg);

    // Kept as a server-side log only. These counters were previously returned
    // in the response body, which shipped internal read volumes to every client.
    console.debug("[api/marketplace/products]", {
      cursorIn: cursor,
      rawDocsRead,
      groupsSeen,
      mergedCardsReturned: products.length,
      lastRawDocCursor: lastConsumedCursor,
      nextCursor: nextGroupCursor,
      hasMore,
      category: category || "all",
      search: search || null,
    });

    const body = {
      products,
      nextCursor: nextGroupCursor ? encodeCursor(nextGroupCursor) : null,
      hasMore,
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
