import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { Listing, ListingStatus } from '@/types/listing';
import { fromFirestoreDoc } from '@/features/listings/lib/listings-firestore';

// Admin-only Firestore access — every function here relies on
// firestore.rules' isAdmin() check (Phase 12) to actually succeed; calling
// these as a non-admin user fails with a permission error, by design (the
// rule is the real enforcement point, not this file — this file is just
// the typed access layer other code calls through, per the architecture
// doc's §3.11 "no component ever calls getDocs/addDoc directly" pattern).

/** All listings with the given status — used for the moderation queue ('pending') and admin stats (all four statuses + total). */
export async function fetchListingsByStatus(status: ListingStatus): Promise<Listing[]> {
  const q = query(collection(db, 'listings'), where('status', '==', status));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestoreDoc(d.id, d.data()));
}

/** Every listing regardless of status — used only for admin stat totals (Total / From Excel / User Posted counts), never rendered as a public list. */
export async function fetchAllListingsForAdmin(): Promise<Listing[]> {
  const snap = await getDocs(collection(db, 'listings'));
  return snap.docs.map((d) => fromFirestoreDoc(d.id, d.data()));
}

/** Mirrors the moderation action this phase adds: an admin publishing a pending listing, making it publicly visible for the first time. */
export async function publishListing(listingId: string): Promise<void> {
  await updateDoc(doc(db, 'listings', listingId), { status: 'published' satisfies ListingStatus });
}

/** Mirrors the moderation action this phase adds: an admin rejecting a pending listing — it never becomes publicly visible. */
export async function rejectListing(listingId: string): Promise<void> {
  await updateDoc(doc(db, 'listings', listingId), { status: 'rejected' satisfies ListingStatus });
}
