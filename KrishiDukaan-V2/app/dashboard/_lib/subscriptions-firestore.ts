import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import type {
  RetailerSeatListing,
  SeatStats,
  Subscription,
  SubscriptionOwnerType,
} from "../_types/subscriptions";

const SUBSCRIPTIONS = "subscriptions";
const SEAT_LISTINGS = "retailerSeatListings";

// ─── Subscription expiry helpers ─────────────────────────────────────────────

/** Subscriptions last 1 month. */
export function subscriptionExpiryDate(startDate: Date, months = 1): Date {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function isSubscriptionActive(sub: Subscription): boolean {
  if (sub.subscriptionStatus !== "active") return false;
  return sub.expiryDate.toMillis() > Date.now();
}

export function isExpiringSoon(sub: Subscription, withinDays = 5): boolean {
  if (!isSubscriptionActive(sub)) return false;
  const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
  return sub.expiryDate.toMillis() <= cutoff;
}

export function formatSubscriptionDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString(undefined, { dateStyle: "medium" });
}

// ─── Seat listing helpers ─────────────────────────────────────────────────────

/** A listing is active if status=active and not yet expired. */
export function isListingActive(listing: RetailerSeatListing): boolean {
  if (listing.status !== "active") return false;
  if (!listing.expiresAt) return false;
  return listing.expiresAt.toMillis() > Date.now();
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapSubscriptionDoc(id: string, data: Record<string, unknown>): Subscription {
  const status = data.subscriptionStatus;
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    ownerType: data.ownerType === "retailer" ? "retailer" : "manufacturer",
    planName: String(data.planName ?? "Standard"),
    seatsPurchased: typeof data.seatsPurchased === "number" ? data.seatsPurchased : 0,
    startDate: data.startDate as Timestamp,
    expiryDate: data.expiryDate as Timestamp,
    razorpayOrderId: data.razorpayOrderId ? String(data.razorpayOrderId) : null,
    razorpayPaymentId: data.razorpayPaymentId ? String(data.razorpayPaymentId) : null,
    subscriptionStatus:
      status === "expired" || status === "cancelled" ? status : "active",
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

function mapSeatListingDoc(id: string, data: Record<string, unknown>): RetailerSeatListing {
  const status = data.status;
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    ownerType: data.ownerType === "retailer" ? "retailer" : "manufacturer",
    manufacturerId: data.manufacturerId ? String(data.manufacturerId) : null,
    manufacturerPhone: data.manufacturerPhone ? String(data.manufacturerPhone) : null,
    ownerPhone: data.ownerPhone ? String(data.ownerPhone) : null,
    retailerDocId: data.retailerDocId ? String(data.retailerDocId) : null,
    retailerId: data.retailerId ? String(data.retailerId) : null,
    retailerPhone: data.retailerPhone ? String(data.retailerPhone) : null,
    productId: String(data.productId ?? ""),
    manufacturerProductId: data.manufacturerProductId ? String(data.manufacturerProductId) : null,
    listingType: data.listingType === "assigned" ? "assigned" : "own",
    status: status === "released" || status === "expired" ? status : "active",
    assignedAt: data.assignedAt as Timestamp,
    expiresAt: data.expiresAt as Timestamp,
    releasedAt: data.releasedAt ? (data.releasedAt as Timestamp) : null,
  };
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export type CreateSubscriptionInput = {
  ownerId: string;
  ownerType: SubscriptionOwnerType;
  planName?: string;
  seatsPurchased: number;
  amountPaid: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
};

export async function createSubscription(input: CreateSubscriptionInput): Promise<string> {
  const now = new Date();
  const expiry = subscriptionExpiryDate(now);
  const ts = serverTimestamp();

  // Resolve phone for the owner (if available via uidIndex)
  let ownerPhone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", input.ownerId));
    if (idxSnap.exists()) ownerPhone = String(idxSnap.data().phone ?? "") || null;
  } catch { /* ignore */ }

  const ref = await addDoc(collection(db, SUBSCRIPTIONS), {
    ownerId: input.ownerId,
    ownerPhone: ownerPhone ?? null,
    ownerType: input.ownerType,
    planName: input.planName ?? "Standard",
    seatsPurchased: input.seatsPurchased,
    amountPaid: input.amountPaid,
    currency: "INR",
    startDate: Timestamp.fromDate(now),
    expiryDate: Timestamp.fromDate(expiry),
    razorpayOrderId: input.razorpayOrderId ?? null,
    razorpayPaymentId: input.razorpayPaymentId ?? null,
    subscriptionStatus: "active",
    createdAt: ts,
    updatedAt: ts,
  });

  // Trigger subscription confirmation email (fire-and-forget)
  // Resolve user via uidIndex → users/{phone} (new schema); fall back to users/{uid}
  try {
    let userData: Record<string, unknown> | null = null;
    const idxSnap = await getDoc(doc(db, "uidIndex", input.ownerId));
    if (idxSnap.exists()) {
      const phone = idxSnap.data().phone as string;
      const userSnap = await getDoc(doc(db, "users", phone));
      if (userSnap.exists()) userData = userSnap.data() as Record<string, unknown>;
    }
    if (!userData) {
      const directSnap = await getDoc(doc(db, "users", input.ownerId));
      if (directSnap.exists()) userData = directSnap.data() as Record<string, unknown>;
    }
    if (userData?.email) {
      fetch("/api/email/subscription-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: userData.email,
          userName: (userData.name as string) || "",
          seatsPurchased: input.seatsPurchased,
          amountPaid: input.amountPaid,
          planName: input.planName ?? "Standard",
          startDate: now.toLocaleDateString("en-IN", { dateStyle: "medium" }),
          expiryDate: expiry.toLocaleDateString("en-IN", { dateStyle: "medium" }),
          razorpayPaymentId: input.razorpayPaymentId,
          razorpayOrderId: input.razorpayOrderId,
        }),
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("Failed to send subscription email trigger:", e);
  }

  return ref.id;
}

export async function fetchSubscriptions(ownerId: string): Promise<Subscription[]> {
  // Dual query: legacy ownerId (UID) + new ownerPhone (E164).
  // Resolves phone via uidIndex; falls back to UID-only if not found.
  let ownerPhone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", ownerId));
    if (idxSnap.exists()) ownerPhone = String(idxSnap.data().phone ?? "") || null;
  } catch { /* ignore */ }

  const queries = [
    getDocs(query(collection(db, SUBSCRIPTIONS), where("ownerId", "==", ownerId))),
  ];
  if (ownerPhone && ownerPhone !== ownerId) {
    queries.push(getDocs(query(collection(db, SUBSCRIPTIONS), where("ownerPhone", "==", ownerPhone))));
  }

  const snaps = await Promise.all(queries);
  const seen = new Set<string>();
  const subs: Subscription[] = [];
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        subs.push(mapSubscriptionDoc(d.id, d.data() as Record<string, unknown>));
      }
    });
  });
  subs.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  return subs;
}

export function getActiveSubscriptions(subs: Subscription[]): Subscription[] {
  return subs.filter(isSubscriptionActive);
}

// ─── Seat listings ────────────────────────────────────────────────────────────

/** Listings owned by a manufacturer (seats they've assigned to retailers). */
export async function fetchSeatListingsForOwner(ownerId: string): Promise<RetailerSeatListing[]> {
  const q = query(collection(db, SEAT_LISTINGS), where("ownerId", "==", ownerId));
  const snap = await getDocs(q);
  const listings = snap.docs.map((d) =>
    mapSeatListingDoc(d.id, d.data() as Record<string, unknown>),
  );
  listings.sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
  return listings;
}

/** Listings assigned TO a retailer (from any manufacturer). */
export async function fetchSeatListingsForRetailer(
  retailerId: string,
): Promise<RetailerSeatListing[]> {
  const q = query(collection(db, SEAT_LISTINGS), where("retailerId", "==", retailerId));
  const snap = await getDocs(q);
  const listings = snap.docs.map((d) =>
    mapSeatListingDoc(d.id, d.data() as Record<string, unknown>),
  );
  listings.sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
  return listings;
}

// ─── Seat utilities ───────────────────────────────────────────────────────────

export function getTotalPurchasedSeats(subs: Subscription[]): number {
  return getActiveSubscriptions(subs).reduce((sum, s) => sum + s.seatsPurchased, 0);
}

/** Active used = listings that are active AND not yet expired. */
export function getUsedSeats(listings: RetailerSeatListing[]): number {
  return listings.filter(isListingActive).length;
}

export function getAvailableSeats(
  subs: Subscription[],
  listings: RetailerSeatListing[],
): number {
  return Math.max(0, getTotalPurchasedSeats(subs) - getUsedSeats(listings));
}

export function canAssignSeat(
  subs: Subscription[],
  listings: RetailerSeatListing[],
): boolean {
  return getAvailableSeats(subs, listings) > 0;
}

/** Returns the latest expiryDate among all active subscriptions, or null if none. */
export function getSubscriptionExpiryDate(subs: Subscription[]): Date | null {
  const active = getActiveSubscriptions(subs);
  if (!active.length) return null;
  const maxMs = Math.max(...active.map((s) => s.expiryDate.toMillis()));
  return new Date(maxMs);
}

export function computeSeatStats(
  subs: Subscription[],
  listings: RetailerSeatListing[],
): SeatStats {
  const activeSubs = getActiveSubscriptions(subs);
  const totalPurchased = activeSubs.reduce((sum, s) => sum + s.seatsPurchased, 0);
  const activeUsed = getUsedSeats(listings);
  const available = Math.max(0, totalPurchased - activeUsed);
  const expiringSoon = activeSubs.filter((s) => isExpiringSoon(s, 5)).length;
  return { totalPurchased, activeUsed, available, expiringSoon };
}

// ─── Seat listing write helpers ───────────────────────────────────────────────

export type SeatListingPayload = {
  ownerId: string;
  /** Normalized E164 phone of the owner (manufacturer or retailer). Optional but preferred for new writes. */
  ownerPhone?: string | null;
  ownerType: "manufacturer" | "retailer";
  manufacturerId: string | null;
  /** Normalized phone of the manufacturer for phone-based queries. */
  manufacturerPhone?: string | null;
  retailerDocId: string | null;
  retailerId: string | null;
  /** Normalized E164 phone of the retailer. */
  retailerPhone?: string | null;
  productId: string;
  /** For assigned listings: the manufacturer's original product doc ID. Null for own listings. */
  manufacturerProductId: string | null;
  listingType: "own" | "assigned";
  /** Must equal the linked subscription's expiryDate so listings expire with their subscription. */
  expiresAt: Date;
};

/** Builds the Firestore document and adds it to an existing WriteBatch. */
export function addSeatListingToBatch(
  batch: WriteBatch,
  payload: SeatListingPayload,
): string {
  const ref = doc(collection(db, SEAT_LISTINGS));

  batch.set(ref, {
    ownerId: payload.ownerId,
    ownerPhone: payload.ownerPhone ?? null,
    ownerType: payload.ownerType,
    manufacturerId: payload.manufacturerId,
    manufacturerPhone: payload.manufacturerPhone ?? null,
    retailerDocId: payload.retailerDocId,
    retailerId: payload.retailerId,
    retailerPhone: payload.retailerPhone ?? null,
    productId: payload.productId,
    manufacturerProductId: payload.manufacturerProductId,
    listingType: payload.listingType,
    status: "active",
    assignedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(payload.expiresAt),
    releasedAt: null,
  });

  return ref.id;
}

/** Standalone (non-batch) seat listing creation. */
export async function createSeatListing(payload: SeatListingPayload): Promise<string> {
  const ref = await addDoc(collection(db, SEAT_LISTINGS), {
    ownerId: payload.ownerId,
    ownerPhone: payload.ownerPhone ?? null,
    ownerType: payload.ownerType,
    manufacturerId: payload.manufacturerId,
    manufacturerPhone: payload.manufacturerPhone ?? null,
    retailerDocId: payload.retailerDocId,
    retailerId: payload.retailerId,
    retailerPhone: payload.retailerPhone ?? null,
    productId: payload.productId,
    manufacturerProductId: payload.manufacturerProductId,
    listingType: payload.listingType,
    status: "active",
    assignedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(payload.expiresAt),
    releasedAt: null,
  });
  return ref.id;
}

/** Releases a seat listing (sets status to "released"). */
export async function releaseSeatListing(seatListingId: string): Promise<void> {
  await updateDoc(doc(db, SEAT_LISTINGS, seatListingId), {
    status: "released",
    releasedAt: serverTimestamp(),
  });
}

/**
 * Returns true if this retailer has at least one active, non-expired seat listing
 * that was assigned by a manufacturer (listingType: "assigned").
 *
 * Checks two identifiers in parallel:
 *  - retailerId (Auth UID) — populated after the retailer signs up and backfill runs
 *  - retailerDocId (E164 phone) — populated at product-assignment time, works pre-signup
 *
 * This is the authoritative source-of-truth check used to bypass the paywall when
 * the `isPaid` flag has not been written yet (e.g., invite acceptance failed silently).
 */
export async function retailerHasActiveSeat(
  uid: string,
  phone?: string | null,
): Promise<boolean> {
  const now = Date.now();

  const queries: Promise<RetailerSeatListing[]>[] = [
    getDocs(query(collection(db, SEAT_LISTINGS), where("retailerId", "==", uid))).then((snap) =>
      snap.docs.map((d) => mapSeatListingDoc(d.id, d.data() as Record<string, unknown>)),
    ),
  ];

  // Pre-signup: listing has retailerDocId = E164 phone, retailerId = "" or null
  if (phone && phone !== uid) {
    queries.push(
      getDocs(query(collection(db, SEAT_LISTINGS), where("retailerDocId", "==", phone))).then(
        (snap) => snap.docs.map((d) => mapSeatListingDoc(d.id, d.data() as Record<string, unknown>)),
      ),
    );
  }

  const results = await Promise.all(queries);
  return results.flat().some(
    (l) =>
      l.listingType === "assigned" &&
      l.status === "active" &&
      l.expiresAt != null &&
      l.expiresAt.toMillis() > now,
  );
}
