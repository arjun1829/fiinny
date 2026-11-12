import { NextResponse } from "next/server";
import { FieldPath, type Query } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import {
  CARDS_COLLECTION,
  PHONETIC_MARK,
  SEARCH_COLLECTION,
  cardToProduct,
  matchScore,
  normalizeCategory,
  phoneticKey,
  queryWords,
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
// The first matches of a search are re-ordered best match first; later
// matches follow in name order.
const RANKED_WINDOW = 50;
// A search that finds nothing is retried with forgiving spellings and fewer
// words. Each retry scans less, and there are at most this many words.
const FALLBACK_MAX_CHUNKS = 3;
const FALLBACK_MAX_WORDS = 5;

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

/**
 * k/id: continue in name order after that doc. o: offset into a search's
 * best-match-first window. t: the tokens the search settled on, so later
 * pages don't redo the forgiving retries.
 */
type Cursor = { k?: string; id?: string; o?: number; t?: string[] };
type ScanPos = { k: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const c: Cursor = {};
    if (typeof parsed?.k === "string" && typeof parsed?.id === "string") { c.k = parsed.k; c.id = parsed.id; }
    if (Number.isInteger(parsed?.o) && parsed.o >= 0) c.o = parsed.o;
    if (Array.isArray(parsed?.t) && parsed.t.every((x: unknown) => typeof x === "string")) {
      c.t = (parsed.t as string[]).slice(0, FALLBACK_MAX_WORDS);
    }
    if (c.k !== undefined || c.o !== undefined || c.t !== undefined) return c;
  } catch {
    /* fall through: an unreadable cursor restarts from the first page */
  }
  return null;
}

function scanPosOf(c: Cursor | null): ScanPos | null {
  return c && c.k !== undefined && c.id !== undefined ? { k: c.k, id: c.id } : null;
}

type Page = {
  ids: string[];
  next: ScanPos | null;
  /** The docs themselves, when the query was on the cards collection. */
  docs?: FirebaseFirestore.QueryDocumentSnapshot[];
};

/** Reads an ordered (nameKey, id) query, pageSize at a time. */
async function readPage(query: Query, cursor: ScanPos | null, pageSize: number): Promise<Page> {
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

type Scan = {
  docs: FirebaseFirestore.QueryDocumentSnapshot[];
  /** Where to continue in name order, or null when nothing is left. */
  next: ScanPos | null;
};

/**
 * Up to `want` token docs holding every token, in name order: array-contains
 * on the first (most selective) token, the others checked here. Bounded by
 * `maxChunks` scans of SEARCH_SCAN_CHUNK docs.
 */
async function scanMatches(
  query: (primary: string) => Query,
  tokens: string[],
  after: ScanPos | null,
  want: number,
  maxChunks = SEARCH_MAX_CHUNKS,
): Promise<Scan> {
  const [primary, ...rest] = tokens;
  const base = query(primary);
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const posOf = (d: FirebaseFirestore.QueryDocumentSnapshot): ScanPos => ({ k: String(d.get("nameKey") ?? ""), id: d.id });
  let pos = after;
  for (let chunk = 0; chunk < maxChunks; chunk++) {
    const q = pos ? base.startAfter(pos.k, pos.id) : base;
    const snap = await q.limit(SEARCH_SCAN_CHUNK).get();
    for (const d of snap.docs) {
      pos = posOf(d);
      const keywords = (d.get("searchKeywords") ?? []) as string[];
      if (!rest.every((t) => keywords.includes(t))) continue;
      // A match past `want` proves there is more: continue after the last kept one.
      if (docs.length === want) return { docs, next: posOf(docs[docs.length - 1]) };
      docs.push(d);
    }
    if (snap.size < SEARCH_SCAN_CHUNK) return { docs, next: null };
  }
  // The scan budget ran out before the end: continue from the last doc scanned.
  return { docs, next: pos };
}

/** Most selective token first: real words longest first, then sound-alike ones. */
function orderTokens(tokens: string[]): string[] {
  const uniq = Array.from(new Set(tokens));
  const byLength = (a: string, b: string) => b.length - a.length;
  return [
    ...uniq.filter((t) => !t.startsWith(PHONETIC_MARK)).sort(byLength),
    ...uniq.filter((t) => t.startsWith(PHONETIC_MARK)).sort(byLength),
  ];
}

/**
 * A search that found nothing, retried forgivingly. Each word is kept if some
 * card has it, else swapped for its sound-alike token ("pawar" -> "~pwr") if
 * some card has that, else dropped. If the words still don't meet on one
 * card, one word is dropped at a time, last typed first ("power plus booster"
 * -> "power plus"). Returns the tokens that found something, or null.
 *
 * soundFirst: prefer each word's sound-alike over the word as typed. Used when
 * the typed words matched only shop names or descriptions ("pawar pl" -> a
 * corn seed sold by "Pawar Krushi Kendra"), to find "Power Plus" by its name.
 */
async function forgivingTokens(
  query: (primary: string) => Query,
  words: string[],
  soundFirst = false,
): Promise<string[] | null> {
  const exists = async (token: string) => (await query(token).limit(1).get()).size > 0;
  const resolved: string[] = [];
  for (const w of words.slice(0, FALLBACK_MAX_WORDS)) {
    const key = phoneticKey(w);
    const sound = key ? PHONETIC_MARK + key : "";
    if (soundFirst && sound && await exists(sound)) { resolved.push(sound); continue; }
    if (await exists(w)) { resolved.push(w); continue; }
    if (!soundFirst && sound && await exists(sound)) resolved.push(sound);
  }
  // What's left must hold at least one 3+ letter word or sound-alike key: a
  // lone fragment ("pl" from "pawar pl") matches unrelated products, and
  // showing nothing beats showing the wrong thing.
  const finds = async (tokens: string[]) =>
    tokens.some(isStrongToken) &&
    (await scanMatches(query, orderTokens(tokens), null, 1, FALLBACK_MAX_CHUNKS)).docs.length > 0;
  if (await finds(resolved)) return orderTokens(resolved);
  for (let drop = resolved.length - 1; drop >= 0 && resolved.length > 1; drop--) {
    const fewer = resolved.filter((_, i) => i !== drop);
    if (await finds(fewer)) return orderTokens(fewer);
  }
  return null;
}

function isStrongToken(token: string): boolean {
  const core = token.startsWith(PHONETIC_MARK) ? token.slice(PHONETIC_MARK.length) : token;
  return core.length >= 3;
}

/**
 * One page of search results. The first RANKED_WINDOW matches are ordered
 * best match first (matchScore); after them, matches continue in name order.
 */
async function rankedSearchPage(
  query: (primary: string) => Query,
  search: string,
  tokens: string[],
  cursor: Cursor | null,
  pageSize: number,
): Promise<{ ids: string[]; next: Cursor | null; best?: number }> {
  const scanPos = scanPosOf(cursor);
  if (scanPos && cursor?.o === undefined) {
    const scan = await scanMatches(query, tokens, scanPos, pageSize);
    return { ids: scan.docs.map((d) => d.id), next: scan.next ? { ...scan.next, t: tokens } : null };
  }
  const window = await scanMatches(query, tokens, null, RANKED_WINDOW);
  const ranked = window.docs
    .map((d, i) => ({
      id: d.id,
      i,
      score: matchScore(String(d.get("nameKey") ?? ""), (d.get("aliasKeys") ?? []) as string[], search, tokens),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const offset = cursor?.o ?? 0;
  const ids = ranked.slice(offset, offset + pageSize).map((r) => r.id);
  let next: Cursor | null = null;
  if (offset + pageSize < ranked.length) next = { o: offset + pageSize, t: tokens };
  else if (window.next) next = { ...window.next, t: tokens };
  return { ids, next, best: ranked[0]?.score ?? 0 };
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

    let page: { ids: string[]; next: Cursor | null; best?: number; docs?: FirebaseFirestore.QueryDocumentSnapshot[] };
    const terms = searchTerms(search);
    if (!search) {
      page = await readPage(byName(inCategory(cards)), scanPosOf(cursor), pageSize);
    } else if (terms.length > 0) {
      const tokenQuery = (primary: string) => byName(
        inCategory(db.collection(SEARCH_COLLECTION).where("searchKeywords", "array-contains", primary)),
      );
      // Later pages carry the tokens the first page settled on.
      const tokens = cursor?.t?.length ? orderTokens(cursor.t) : terms;
      page = await rankedSearchPage(tokenQuery, search, tokens, cursor, pageSize);
      let pageTokens = tokens;
      if (!cursor && page.ids.length === 0) {
        const forgiving = await forgivingTokens(tokenQuery, queryWords(search));
        if (forgiving) {
          page = await rankedSearchPage(tokenQuery, search, forgiving, null, pageSize);
          pageTokens = forgiving;
        }
      }
      if (!cursor && !page.best) {
        // Nothing matched by product name, only by shop name or description
        // ("pawar pl" -> corn sold by "Pawar Krushi Kendra"): a sound-alike
        // reading may name the product meant. Its matches go first; the
        // shop/description matches follow instead of disappearing.
        const sound = await forgivingTokens(tokenQuery, queryWords(search), true);
        if (sound) {
          const alt = await rankedSearchPage(tokenQuery, search, sound, null, pageSize);
          if ((alt.best ?? 0) > 0) {
            const weak = page.ids.filter((id) => !alt.ids.includes(id));
            const ids = [...alt.ids, ...weak].slice(0, pageSize);
            const weakShown = ids.length - alt.ids.length;
            // More name matches: page on through them. Otherwise continue the
            // shop/description matches from the first one not shown yet.
            const next = alt.next ??
              (weakShown < weak.length ? { o: weakShown, t: pageTokens } : page.next);
            page = { ids, next, best: alt.best };
          }
        }
      }
      // Those were token docs; the cards share their ids.
    } else {
      // A single character: names starting with it.
      const ch = search.slice(0, 1);
      const prefix = inCategory(cards).where("nameKey", ">=", ch).where("nameKey", "<", `${ch}`);
      page = await readPage(byName(prefix), scanPosOf(cursor), pageSize);
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
