/**
 * Server-side store/retailer data for the indexable /stores/* routes.
 *
 * WHY THIS EXISTS SEPARATELY FROM fetchStores() IN app/firebase.ts
 * ---------------------------------------------------------------
 * fetchStores() is the client path: full firebase/firestore SDK, runs in the
 * browser, feeds the interactive locator. These routes are server-rendered, so
 * they need firebase/firestore/lite (HTTP REST, no gRPC, no ADC) exactly like
 * products-server.ts and reels-server.ts.
 *
 * The MERGE SEMANTICS below are deliberately kept in step with fetchStores().
 * Sellers live across four collections and the same phone can appear in several
 * of them, so both paths must agree on which record wins or the locator and the
 * store page will disagree about a shop's name and coordinates:
 *
 *   profiles/{phone}      unified new-schema profile (mobile app's primary)
 *   retailers/{phone}     retailer docs, incl. manufacturer-network retailers
 *   manufacturers/{phone} manufacturers, which also surface as stores
 *   stores/{id}           legacy, often stale names/coordinates
 *
 * If you change the scoring here, change it in fetchStores() too.
 */
import {
  collection,
  getDocs,
  query,
  where,
  limit,
} from "firebase/firestore/lite";
import { getClientDb } from "../firebase-client-server";
import { buildProductSlug, filterServableProductIds } from "./products-server";

export interface SeoStore {
  /** Firestore doc id — a phone number for most records. */
  id: string;
  phone?: string;
  name: string;
  ownerName?: string;
  line1?: string;
  city: string;
  state: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  logo?: string;
  /** 'retailer' | 'manufacturer' — drives copy and schema @type. */
  role: "retailer" | "manufacturer";
  /** Set only for manufacturers that already have a /brand/[slug] page. */
  brandSlug?: string;
  /** Last write to the underlying record, for sitemap <lastmod>. */
  updatedAtMs?: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  slug: string;
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

/**
 * Firestore Timestamp | Date | ISO string → epoch ms, or undefined.
 *
 * undefined rather than Date.now(): this feeds the sitemap's <lastmod>, and a
 * record with no timestamp must produce no lastmod at all. Substituting "now"
 * tells Google every page changed on every regeneration, which is how the
 * signal stops being believed.
 */
function millis(v: unknown): number | undefined {
  try {
    const d = (v as { toDate?: () => Date })?.toDate?.();
    if (d instanceof Date && !isNaN(d.getTime())) return d.getTime();
    if (typeof v === "number" && isFinite(v)) return v;
    if (v) {
      const parsed = new Date(v as string);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

// ─── Normalisation ──────────────────────────────────────────────────────────
// Seller-entered addresses are free text, so the same place arrives as
// "KARJAT", "Karjat" and "karjat", and Maharashtra is frequently misspelled
// "MAHARASTRA". Left alone these fork the URL tree — /stores/maharastra/deola
// would sit apart from /stores/maharashtra/* and split an already-small
// footprint across duplicate branches. Everything is canonicalised here, once,
// before any slug or page is derived from it.

/**
 * Misspellings, abbreviations and Devanagari forms seen in live seller data,
 * lowercased. Devanagari matters because slugifyGeo strips non-Latin entirely —
 * a seller who typed "महाराष्ट्र" would otherwise slug to "" and produce a
 * broken "/stores///<store>" URL.
 */
const STATE_ALIASES: Record<string, string> = {
  maharastra: "Maharashtra",
  maharashtr: "Maharashtra",
  mh: "Maharashtra",
  "महाराष्ट्र": "Maharashtra",
  ts: "Telangana",
  telengana: "Telangana",
  ap: "Andhra Pradesh",
  mp: "Madhya Pradesh",
  up: "Uttar Pradesh",
  gj: "Gujarat",
  ka: "Karnataka",
};

/**
 * Devanagari city names present in live data, transliterated so these sellers
 * join the same city tree as everyone else. Without this वाशीम would either be
 * dropped or fork a second page for the city already listed as "Washim".
 */
const CITY_ALIASES: Record<string, string> = {
  "वाशीम": "Washim",
  "वडवणी": "Wadwani",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizeState(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return STATE_ALIASES[cleaned.toLowerCase()] ?? titleCase(cleaned);
}

export function normalizeCity(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return CITY_ALIASES[cleaned] ?? titleCase(cleaned);
}

// ─── Slugs ──────────────────────────────────────────────────────────────────

/** "Ahilyanagar " → "ahilyanagar"; used for both state and city path segments. */
export function slugifyGeo(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Store slug: `{kebab-name}--{shortId}`.
 *
 * shortId is the LAST 6 CHARS of the doc id rather than the whole thing,
 * because most doc ids here are phone numbers and a full phone number does not
 * belong in a URL (sitemaps, referrer headers, server logs). Six characters is
 * enough to disambiguate within a single city. Resolution is no longer scoped
 * to a city, though — see resolveStore(), which matches across all stores so a
 * shop that changed city keeps its old URL working, and breaks the rare
 * six-character tie on the requested geography.
 */
export function buildStoreSlug(name: string, id: string): string {
  const base = slugifyGeo(name).slice(0, 60);
  const shortId = id.slice(-6);
  return base ? `${base}--${shortId}` : shortId;
}

function shortIdFromSlug(slug: string): string {
  const decoded = decodeURIComponent(slug).trim();
  const sep = decoded.lastIndexOf("--");
  return sep === -1 ? decoded : decoded.slice(sep + 2);
}

// ─── Merge ──────────────────────────────────────────────────────────────────

type Raw = {
  id: string;
  phone?: string;
  name: string;
  ownerName?: string;
  line1?: string;
  city: string;
  state: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  logo?: string;
  role: "retailer" | "manufacturer";
  updatedAtMs?: number;
  /** Richness score — higher wins when the same phone appears twice. */
  score: number;
};

const phoneOf = (docId: string, data: Record<string, unknown>): string | undefined =>
  str(data.phone) || (/^\+?\d{10,13}$/.test(docId) ? docId : undefined);

/** Address fields arrive either nested under `address` or flattened. */
function readAddress(data: Record<string, unknown>) {
  const addr = data.address;
  const isMap = addr && typeof addr === "object" && !Array.isArray(addr);
  const a = (isMap ? addr : {}) as Record<string, unknown>;
  return {
    line1: str(a.line1 ?? a.address ?? (isMap ? "" : addr)),
    city: normalizeCity(str(a.city ?? data.city)),
    state: normalizeState(str(a.state ?? data.state)),
    pincode: str(a.pincode ?? data.pincode).trim() || undefined,
  };
}

/** geo/location are stored as GeoPoint, {lat,lng} or {latitude,longitude}. */
function readGeo(data: Record<string, unknown>) {
  const g = (data.geo ?? {}) as Record<string, unknown>;
  const l = (data.location ?? {}) as Record<string, unknown>;
  return {
    lat: num(g.latitude ?? g.lat ?? l.latitude ?? l.lat),
    lng: num(g.longitude ?? g.lng ?? l.longitude ?? l.lng),
  };
}

let _cache: SeoStore[] | null = null;

/**
 * Every seller that can legitimately have a public page.
 *
 * HARD CONSTRAINT: a store is only returned when it has a name AND a city AND a
 * state. Generating a city page for a district where no real retailer trades is
 * a doorway page — it risks a manual action and helps nobody. No location, no
 * page.
 */
export async function getAllStores(): Promise<SeoStore[]> {
  if (_cache) return _cache;
  try {
    const db = getClientDb();
    const [profilesSnap, retailersSnap, manufacturersSnap, storesSnap] =
      await Promise.all([
        getDocs(collection(db, "profiles")).catch(() => null),
        getDocs(collection(db, "retailers")).catch(() => null),
        getDocs(collection(db, "manufacturers")).catch(() => null),
        getDocs(collection(db, "stores")).catch(() => null),
      ]);

    const raw: Raw[] = [];

    // manufacturers/ — also carries the /brand/[slug] mapping.
    const brandSlugByPhone = new Map<string, string>();
    for (const d of manufacturersSnap?.docs ?? []) {
      const data = d.data() as Record<string, unknown>;
      const phone = phoneOf(d.id, data);
      const slug = str(data.slug).trim();
      if (slug && phone) brandSlugByPhone.set(phone, slug);

      const name = str(data.businessName || data.ownerName).trim();
      if (!name) continue;
      const { line1, city, state, pincode } = readAddress(data);
      raw.push({
        id: d.id, phone, name, ownerName: str(data.ownerName) || undefined,
        line1, city, state, pincode, ...readGeo(data),
        logo: str(data.logo) || undefined, role: "manufacturer",
        updatedAtMs: millis(data.updatedAt),
        score: 4 + (name ? 2 : 0),
      });
    }

    // retailers/ — deliberately NOT gated on `active`/`assignedSeat`. On these
    // docs `active: false` is the un-activated default, not a deactivation, and
    // gating on it hid most of the network (see fetchStores() for the counts).
    // Only an explicit admin removal hides a store.
    for (const d of retailersSnap?.docs ?? []) {
      const data = d.data() as Record<string, unknown>;
      const os = str(data.onboardingStatus);
      if (os === "removed" || os === "inactive") continue;

      const name = str(data.shopName || data.ownerName).trim();
      if (!name || name === "Retailer") continue;
      const { line1, city, state, pincode } = readAddress(data);
      raw.push({
        id: d.id, phone: phoneOf(d.id, data), name,
        ownerName: str(data.ownerName) || undefined,
        line1, city, state, pincode, ...readGeo(data),
        logo: str(data.logo) || undefined, role: "retailer",
        updatedAtMs: millis(data.updatedAt),
        score: (data.retailerId ? 3 : 0) + (data.userId ? 3 : 0) + 2,
      });
    }

    // profiles/ — unified new schema, nested address/geo maps.
    for (const d of profilesSnap?.docs ?? []) {
      const data = d.data() as Record<string, unknown>;
      const role = str(data.role);
      if (role !== "retailer" && role !== "manufacturer") continue;
      const name = str(
        data.shopName || data.businessName || data.ownerName || data.name,
      ).trim();
      if (!name) continue;
      const { line1, city, state, pincode } = readAddress(data);
      raw.push({
        id: d.id, phone: phoneOf(d.id, data), name,
        ownerName: str(data.ownerName) || undefined,
        line1, city, state, pincode, ...readGeo(data),
        logo: str(data.logo) || undefined, role,
        updatedAtMs: millis(data.updatedAt),
        score: 4 + (name ? 2 : 0),
      });
    }

    // stores/ — legacy, lowest priority.
    for (const d of storesSnap?.docs ?? []) {
      const data = d.data() as Record<string, unknown>;
      const name = str(data.name || data.shopName).trim();
      if (!name) continue;
      const { line1, city, state, pincode } = readAddress(data);
      raw.push({
        id: d.id, phone: phoneOf(d.id, data), name,
        line1, city, state, pincode, ...readGeo(data),
        logo: str(data.logo) || undefined, role: "retailer",
        updatedAtMs: millis(data.updatedAt),
        score: 1,
      });
    }

    // Same phone across collections → keep the richest record.
    const byKey = new Map<string, Raw>();
    for (const entry of raw) {
      const key = entry.phone || entry.id;
      const existing = byKey.get(key);
      const withGeo = entry.score + (entry.lat && entry.lng ? 1 : 0);
      const existingWithGeo =
        existing ? existing.score + (existing.lat && existing.lng ? 1 : 0) : -1;
      // The richest record wins the content, but the timestamp is the newest
      // across every copy: a shop edited through one collection is a shop that
      // changed, whichever record the merge happens to prefer.
      const newest = Math.max(entry.updatedAtMs ?? 0, existing?.updatedAtMs ?? 0);
      if (!existing || withGeo > existingWithGeo) {
        byKey.set(key, { ...entry, updatedAtMs: newest || undefined });
      } else if (newest && newest !== existing.updatedAtMs) {
        byKey.set(key, { ...existing, updatedAtMs: newest });
      }
    }

    _cache = Array.from(byKey.values())
      // The hard constraint: no real location, no page. The slug checks are not
      // redundant with the truthiness checks — a value in a script slugifyGeo
      // strips (Devanagari, say) is truthy but slugs to "", which would emit a
      // "/stores///<store>" URL and fail the build. Anything not covered by
      // CITY_ALIASES/STATE_ALIASES is dropped here rather than shipped broken.
      .filter(
        (s) => s.name && s.city && s.state && slugifyGeo(s.city) && slugifyGeo(s.state),
      )
      .map((s) => ({
        id: s.id, phone: s.phone, name: s.name, ownerName: s.ownerName,
        line1: s.line1 || undefined, city: s.city, state: s.state,
        pincode: s.pincode, lat: s.lat, lng: s.lng, logo: s.logo,
        role: s.role,
        brandSlug: s.phone ? brandSlugByPhone.get(s.phone) : undefined,
        updatedAtMs: s.updatedAtMs,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return _cache;
  } catch (err) {
    console.warn("[stores-server] getAllStores failed:", err);
    return [];
  }
}

// ─── Geography ──────────────────────────────────────────────────────────────

export interface CityEntry {
  city: string;
  citySlug: string;
  state: string;
  stateSlug: string;
  count: number;
  /**
   * Newest change among this city's stores — the city page IS its list of
   * stores, so the page changed when the freshest of them did.
   */
  updatedAtMs?: number;
}

export interface StateEntry {
  state: string;
  stateSlug: string;
  count: number;
  cities: CityEntry[];
  /** Newest change among this state's stores. */
  updatedAtMs?: number;
}

/** State → city tree, built only from cities that actually contain stores. */
export async function getStoreGeography(): Promise<StateEntry[]> {
  const stores = await getAllStores();
  const states = new Map<string, StateEntry>();

  for (const s of stores) {
    const stateSlug = slugifyGeo(s.state);
    const citySlug = slugifyGeo(s.city);
    if (!stateSlug || !citySlug) continue;

    let st = states.get(stateSlug);
    if (!st) {
      st = { state: s.state, stateSlug, count: 0, cities: [] };
      states.set(stateSlug, st);
    }
    st.count += 1;
    if (s.updatedAtMs && s.updatedAtMs > (st.updatedAtMs ?? 0)) {
      st.updatedAtMs = s.updatedAtMs;
    }

    let ct = st.cities.find((c) => c.citySlug === citySlug);
    if (!ct) {
      ct = { city: s.city, citySlug, state: s.state, stateSlug, count: 0 };
      st.cities.push(ct);
    }
    ct.count += 1;
    if (s.updatedAtMs && s.updatedAtMs > (ct.updatedAtMs ?? 0)) {
      ct.updatedAtMs = s.updatedAtMs;
    }
  }

  // Array.from rather than iterating the Map directly — this tsconfig targets
  // below es2015, so `for…of` over Map.values() needs downlevelIteration.
  const all = Array.from(states.values());
  for (const st of all) {
    st.cities.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  }
  return all.sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export async function getStoresInCity(
  stateSlug: string,
  citySlug: string,
): Promise<SeoStore[]> {
  const stores = await getAllStores();
  return stores.filter(
    (s) => slugifyGeo(s.state) === stateSlug && slugifyGeo(s.city) === citySlug,
  );
}

/**
 * The canonical path for a store. The ONLY definition of that URL — the page,
 * the sitemap and the internal links all call this, so a submitted URL and a
 * canonical tag cannot drift apart by being written out twice.
 */
export function storeUrlPath(s: SeoStore): string {
  return `/stores/${slugifyGeo(s.state)}/${slugifyGeo(s.city)}/${buildStoreSlug(
    s.name,
    s.id,
  )}`;
}

export interface ResolvedStore {
  store: SeoStore;
  /** Where this store lives now, which may not be where it was asked for. */
  canonicalPath: string;
}

/**
 * Resolve a store from ANY url it has ever had, not just its current one.
 *
 * WHY THIS IS NOT A LOOKUP WITHIN THE CITY
 * ----------------------------------------
 * A store's URL encodes three mutable things: its state, its city and its name.
 * The previous version fetched the stores in the requested city and matched on
 * the short id within that list, so correcting a shop's city in Firestore moved
 * its page and left the indexed URL returning 404 — 96 of them at the last
 * count, every one a page Google had already ranked. Renaming a shop was
 * survivable only by accident: the id still matched, so the old URL kept
 * answering 200 and quietly became a duplicate of the new one.
 *
 * Matching on the short id across ALL stores makes both cases recoverable: the
 * caller learns which store this is and where it now lives, and can redirect
 * instead of 404ing or serving a duplicate.
 *
 * Short ids are the last six characters of a doc id, and most doc ids are phone
 * numbers, so a collision is unlikely but not impossible. Where several stores
 * share one, the requested geography breaks the tie; if it cannot, this returns
 * null. Sending a visitor to a different shop than the one they asked for is
 * worse than showing them a 404.
 */
export async function resolveStore(
  stateSlug: string,
  citySlug: string,
  storeSlug: string,
): Promise<ResolvedStore | null> {
  const shortId = shortIdFromSlug(storeSlug);
  if (!shortId) return null;

  const stores = await getAllStores();
  const matches = stores.filter((s) => s.id.slice(-6) === shortId);
  if (matches.length === 0) return null;

  const store =
    matches.length === 1
      ? matches[0]!
      : matches.find(
          (s) =>
            slugifyGeo(s.state) === stateSlug && slugifyGeo(s.city) === citySlug,
        );
  if (!store) return null;

  return { store, canonicalPath: storeUrlPath(store) };
}

// ─── Products stocked by a store ────────────────────────────────────────────

/**
 * Products a store stocks.
 *
 * Read straight off products/, NOT inventory/. inventory is auth-gated
 * (firestore.rules: `allow read: if isAdmin() || teamHas('inventory') ||
 * (isAuthed() && …)`) so an unauthenticated server render gets
 * permission-denied, whereas products/ is `allow read: if true` and already
 * carries ownerPhone/ownerId on every doc.
 *
 * Each row links to the CANONICAL product page, never to the seller's own copy.
 * A retailer's stock rows are copies (source: retailer_inventory_copy /
 * manufacturer_assigned / admin_assigned) and products-server deliberately keeps
 * copies out of the index — linking to one would point at a duplicate of a page
 * that already exists. manufacturerProductId / originalProductId is the original.
 */
export async function getStoreProducts(
  store: SeoStore,
  max = 24,
): Promise<StoreProduct[]> {
  const key = store.phone || store.id;
  if (!key) return [];
  try {
    const db = getClientDb();
    const [byPhone, byOwner] = await Promise.all([
      getDocs(
        query(collection(db, "products"), where("ownerPhone", "==", key), limit(80)),
      ).catch(() => null),
      getDocs(
        query(collection(db, "products"), where("ownerId", "==", key), limit(80)),
      ).catch(() => null),
    ]);

    const byCanonicalId = new Map<string, StoreProduct>();
    for (const snap of [byPhone, byOwner]) {
      for (const d of snap?.docs ?? []) {
        const data = d.data() as Record<string, unknown>;
        if (data.isActive === false) continue;
        const name = str(data.name);
        const image = str(data.image);
        if (!name || !image) continue;

        const canonicalId =
          str(data.manufacturerProductId) || str(data.originalProductId) || d.id;
        if (byCanonicalId.has(canonicalId)) continue;

        byCanonicalId.set(canonicalId, {
          id: canonicalId,
          name,
          image,
          price: Number(data.price || 0),
          slug: buildProductSlug(name, canonicalId),
        });
      }
    }

    const candidates = Array.from(byCanonicalId.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, max);

    // Each card links to /products/{slug}, but the doc scanned above is the
    // SELLER's copy — the canonicalId it points at is a different document and
    // may not have a product page (inactive, or itself a copy). Checking the
    // ids we are about to link keeps this grid free of 404s; it fails open, so
    // a Firestore hiccup shows the products rather than an empty store page.
    const servable = await filterServableProductIds(candidates.map((p) => p.id));
    return candidates.filter((p) => servable.has(p.id));
  } catch (err) {
    console.warn("[stores-server] getStoreProducts failed:", err);
    return [];
  }
}
