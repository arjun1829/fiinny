import { collection, getDocs, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { Listing } from '@/types/listing';

const LISTINGS_COLLECTION = 'listings';

// The sole owner of Firestore reads/writes for the listings collection, per
// the architecture doc §3.11 ("every function's lib/*-firestore.ts file
// exports typed functions only... no component ever calls getDocs/addDoc
// directly"). This is the direct structural fix for the original's three
// uncoordinated sync strategies (startFetchSheet's CSV poll, the dead
// JSONP fetchSheet/startSheetSync path, and the debugFetch button —
// architecture report §1.9): one function, one collection, one source of
// truth.
//
// Client SDK only, subject to firestore.rules for every read here — the
// Admin SDK (and the Server Component homepage read that used to pair with
// it, listings-firestore.server.ts) was removed in the Admin SDK removal
// pass: no service account credentials were available for the current
// Firebase project, so app/page.tsx now calls fetchPublishedListings()
// below directly, client-side, like every other page in this app.

// Duck-typed rather than `instanceof Timestamp` — kept this way even though
// only the client SDK's Timestamp class exists in this codebase now, since
// duck-typing costs nothing extra here and stays correct regardless of
// which Timestamp class ends up producing a given document.
function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function';
}

/** Converts a Firestore document (whose `created` field is a Timestamp) into the app's Listing shape (ISO string). */
export function fromFirestoreDoc(id: string, data: Record<string, unknown>): Listing {
  const created = isTimestampLike(data.created) ? data.created.toDate().toISOString() : (data.created as string);
  return { ...(data as Omit<Listing, 'id' | 'created'>), id, created };
}

/** One-shot client-SDK fetch of every published listing. Subject to firestore.rules. */
export async function fetchPublishedListings(): Promise<Listing[]> {
  const q = query(collection(db, LISTINGS_COLLECTION), where('status', '==', 'published'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => fromFirestoreDoc(doc.id, doc.data()));
}

/**
 * Subscribes to real-time updates for published listings. Replaces the
 * original's 15-minute setTimeout-recursive CSV poll (startFetchSheet,
 * index (1).html) — Firestore's onSnapshot pushes changes as they happen
 * instead of the client re-fetching and re-parsing a whole CSV on a timer.
 * Returns the unsubscribe function; callers must call it on unmount.
 */
export function subscribeToPublishedListings(onUpdate: (listings: Listing[]) => void): Unsubscribe {
  const q = query(collection(db, LISTINGS_COLLECTION), where('status', '==', 'published'));
  return onSnapshot(q, (snapshot) => {
    onUpdate(snapshot.docs.map((doc) => fromFirestoreDoc(doc.id, doc.data())));
  });
}
