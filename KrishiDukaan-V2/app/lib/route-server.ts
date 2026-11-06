/**
 * Server-side helpers for Razorpay Route — the live split config and the
 * seller ↔ linked-account mapping.
 *
 * Seller identity in this codebase is spread across sellerPhone, sellerId,
 * ownerPhone, ownerId, retailerPhone and retailerId, and is sometimes a phone
 * and sometimes a UID. That ambiguity is survivable when it only affects which
 * dashboard query matches. It is NOT survivable once money moves: a mis-keyed
 * seller means paying the wrong shop. So Route uses exactly one key — the
 * seller's phone, which is what retailers/{id} and manufacturers/{id} are keyed
 * by — and every lookup goes through resolveSellerAccount().
 */
import Razorpay from "razorpay";
import { getAdminDb } from "./firebase-admin";
import {
  DEFAULT_ROUTE_CONFIG,
  ROUTE_CONFIG_PATH,
  parseRouteConfig,
  type RouteConfig,
} from "./route-split";

export const razorpayClient = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Collections a seller account can live in, in lookup order. */
const SELLER_COLLECTIONS = ["retailers", "manufacturers"] as const;

/**
 * The live split configuration.
 *
 * A read failure falls back to DEFAULT_ROUTE_CONFIG rather than throwing: a
 * checkout must not fail because a settings doc was deleted, and the defaults
 * are the rates that were agreed rather than an arbitrary guess.
 */
export async function loadRouteConfig(): Promise<RouteConfig> {
  try {
    const snap = await getAdminDb()
      .collection(ROUTE_CONFIG_PATH.collection)
      .doc(ROUTE_CONFIG_PATH.doc)
      .get();
    if (!snap.exists) return DEFAULT_ROUTE_CONFIG;
    return parseRouteConfig(snap.data()) ?? DEFAULT_ROUTE_CONFIG;
  } catch (e) {
    console.error("[route] config read failed, using defaults:", e);
    return DEFAULT_ROUTE_CONFIG;
  }
}

export interface SellerAccount {
  /** Canonical seller key — the phone the seller doc is keyed by. */
  phone: string;
  collection: (typeof SELLER_COLLECTIONS)[number];
  shopName: string;
  email: string | null;
  /** Razorpay linked account id, once onboarded. */
  razorpayAccountId: string | null;
  /** Razorpay's activation state for the route product. */
  routeStatus: string | null;
  data: FirebaseFirestore.DocumentData;
}

/** Look up a seller by phone across retailers/ then manufacturers/.
 *
 * Falls back to users/{phone} when neither per-role doc exists — a seller
 * onboarded through the newer signup flow can have `role: 'retailer'` on
 * their user doc with no matching retailers/{phone} record at all (their
 * extended profile — address, shop name, GST — was simply never filled in).
 * Route features would otherwise 404 for a perfectly real, logged-in seller.
 * The fallback's `collection` is still the correct per-role collection: the
 * first Route write through saveSellerRouteState() creates that doc via
 * `merge: true`, closing the gap for every lookup after. */
/** The first email set on any of the seller's docs. */
function firstEmail(docs: (FirebaseFirestore.DocumentData | undefined)[]): string | null {
  return docs.map((x) => (x?.email ? String(x.email).trim() : "")).find(Boolean) || null;
}

export async function resolveSellerAccount(phone: string): Promise<SellerAccount | null> {
  const key = String(phone ?? "").trim();
  if (!key) return null;

  const db = getAdminDb();
  // All candidate docs read in PARALLEL (it used to be up to three sequential
  // round trips on the checkout path); the first existing one in priority
  // order still wins, exactly as before.
  const [roleSnaps, userSnap] = await Promise.all([
    Promise.all(SELLER_COLLECTIONS.map((c) => db.collection(c).doc(key).get())),
    db.collection("users").doc(key).get(),
  ]);
  for (let i = 0; i < SELLER_COLLECTIONS.length; i++) {
    const collection = SELLER_COLLECTIONS[i]!;
    const snap = roleSnaps[i]!;
    if (!snap.exists) continue;
    const d = snap.data()!;
    return {
      phone: key,
      collection,
      shopName: String(d.shopName ?? d.businessName ?? d.storeName ?? d.name ?? "").trim(),
      // The admin's "edit user" screen writes email to users/{phone}, so a
      // seller whose role doc has none must still be found through the other
      // docs, not reported as missing an email.
      email: firstEmail([d, userSnap.data(), ...roleSnaps.map((r) => r.data())]),
      razorpayAccountId: (d.razorpayAccountId ? String(d.razorpayAccountId) : null) || null,
      routeStatus: (d.routeStatus ? String(d.routeStatus) : null) || null,
      data: d,
    };
  }

  if (userSnap.exists) {
    const d = userSnap.data()!;
    const role = String(d.role ?? "");
    if (role === "retailer" || role === "manufacturer") {
      return {
        phone: key,
        collection: role === "manufacturer" ? "manufacturers" : "retailers",
        shopName: String(d.shopName ?? d.businessName ?? d.name ?? "").trim(),
        email: firstEmail([d, ...roleSnaps.map((r) => r.data())]),
        razorpayAccountId: (d.razorpayAccountId ? String(d.razorpayAccountId) : null) || null,
        routeStatus: (d.routeStatus ? String(d.routeStatus) : null) || null,
        data: d,
      };
    }
  }
  return null;
}

/**
 * The phone behind a verified Firebase uid.
 *
 * Same uid → uidIndex → phone resolution the rest of the codebase uses. Returns
 * null rather than throwing so callers decide the status code.
 */
export async function phoneForUid(uid: string): Promise<string | null> {
  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  if (idx.exists) {
    const p = String(idx.data()?.phone ?? "").trim();
    if (p) return p;
  }
  if (byUid.exists) {
    const p = String(byUid.data()?.phone ?? "").trim();
    if (p) return p;
  }
  return null;
}

/** Persist the linked-account id and status against the seller. */
export async function saveSellerRouteState(
  seller: SellerAccount,
  patch: { razorpayAccountId?: string; routeStatus?: string; routeProductId?: string },
): Promise<void> {
  await getAdminDb()
    .collection(seller.collection)
    .doc(seller.phone)
    .set({ ...patch, routeUpdatedAt: new Date() }, { merge: true });
}
