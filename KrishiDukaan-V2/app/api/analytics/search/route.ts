import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { lookupRegion } from "../../../lib/geo/region-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/search
 * Body: { kind: "search", q: string, results?: number, category?: string, lat?, lng?, source?: "web" | "app" }
 *    or { kind: "category", category: string, lat?, lng?, source?: "web" | "app" }
 *
 * `category` on a search is the main product category of its results.
 * `lat`/`lng` are sent only when the shopper's device knows a real location
 * (never the default); they are turned into a state + district here and
 * never stored — only the per-state/district counts are.
 *
 * Records what shoppers look for, for Admin > Search insights. Each call is
 * ONE merge write into the day's aggregate doc, searchStats/{YYYY-MM-DD}
 * (IST) — no per-search documents, so reading a month back in the admin is
 * at most 31 reads. Clients only call this once a search has settled and
 * dedupe per session, so typing "u", "ur", "ure", "urea" logs just "urea".
 */

const MAX_TERM = 60;
// Per-instance throttle: plenty for a real shopper, stops a script spamming one instance.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { n: number; at: number }>();

// Unicode-aware (Devanagari etc.); built via RegExp() because tsconfig targets ES5.
const NOT_TERM_CHAR = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s]+", "gu");
const NOT_CATEGORY_CHAR = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s&-]+", "gu");

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > RATE_WINDOW_MS) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n += 1;
  return h.n > RATE_MAX;
}

/** Lowercase letters/digits (any script) and single spaces — also a safe map key. */
function normalizeTerm(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.'’]/g, "") // "D.A.P." -> "dap"
    .replace(NOT_TERM_CHAR, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM)
    .trim();
}

/** Category names come from our own chips/products; keep them verbatim but map-key safe. */
function categoryKey(raw: unknown): string {
  const key = String(raw ?? "").trim().slice(0, MAX_TERM).replace(NOT_CATEGORY_CHAR, "").trim();
  return key.toLowerCase() === "all" ? "" : key;
}

/** State/district names are map keys too. */
function placeKey(raw: string | undefined): string {
  return String(raw ?? "").replace(NOT_CATEGORY_CHAR, "").trim();
}

function istDayKey(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* handled below */ }

  const source = body.source === "app" ? "app" : "web";
  const day = istDayKey();
  const update: Record<string, unknown> = { date: day, updatedAt: FieldValue.serverTimestamp() };

  // Where the shopper is, when their device knows (never stored as coordinates).
  let state = "";
  let district = "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (body.lat != null && body.lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const hit = await lookupRegion(lat, lng);
      state = placeKey(hit?.state);
      district = placeKey(hit?.district);
    } catch (err) {
      console.error("[analytics/search] region lookup failed", err);
    }
  }
  const one = FieldValue.increment(1);

  if (body.kind === "category") {
    const key = categoryKey(body.category);
    if (!key) return new NextResponse(null, { status: 204 });
    update.categoryTotal = one;
    update.categories = { [key]: one };
    if (state) update.stateBrowse = { [state]: { [key]: one } };
  } else {
    const term = normalizeTerm(body.q);
    if (term.length < 2) return new NextResponse(null, { status: 204 });
    const results = Number(body.results);
    const noResults = Number.isFinite(results) && results === 0;
    const category = noResults ? "" : categoryKey(body.category);
    update.total = one;
    update.sources = { [source]: one };
    update.terms = { [term]: one };
    if (noResults) {
      update.zeroResults = { [term]: one };
      update.zeroTotal = one;
    }
    // What kind of product was searched for (from the results).
    if (category) update.termCategories = { [category]: one };
    if (state) {
      update.locatedTotal = one;
      update.states = { [state]: one };
      update.stateTerms = { [state]: { [term]: one } };
      if (district) update.stateDistricts = { [state]: { [district]: one } };
      if (category) update.stateCategories = { [state]: { [category]: one } };
      if (noResults) update.stateZero = { [state]: { [term]: one } };
    }
  }

  try {
    // set+merge with nested objects treats map keys literally (no dot-path parsing).
    await getAdminDb().collection("searchStats").doc(day).set(update, { merge: true });
  } catch (err) {
    console.error("[analytics/search] write failed", err);
  }
  return new NextResponse(null, { status: 204 });
}
