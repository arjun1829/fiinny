import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { Listing } from '@/types/listing';
import { fromFirestoreDoc } from './listings-firestore';

/**
 * Fetches a single listing by ID for the detail route. Returns null if not
 * found, not published, or the read is denied by firestore.rules — all
 * three cases are indistinguishable from the caller's perspective ("there
 * is nothing to show here") and both /listings/[id] page.tsx and the
 * intercepting-route modal already treat null as "not found."
 *
 * The permission-denied catch matters concretely: Firestore rejects a
 * get() for a nonexistent document ID with a `permission-denied` error
 * rather than an empty/non-existent snapshot, whenever the deployed rule
 * touches resource.data without first checking existence — which is
 * exactly the gap fixed in firestore.rules for `get` on this collection
 * (Phase 10 validation note there has the full explanation). Catching it
 * here is defense in depth for whatever rules version happens to be
 * actually deployed at any given time, not a substitute for the rules fix.
 *
 * The error is checked via `.code === 'permission-denied'` rather than
 * `instanceof FirestoreError` — verified directly against the installed
 * SDK (Phase 10 validation): what the client SDK actually throws here has
 * `name: 'FirebaseError'` and `err instanceof FirestoreError` is false,
 * even though `FirestoreError extends FirebaseError` in the SDK's own
 * source. An instanceof check silently failed to catch anything and let
 * every permission-denied error rethrow as an unhandled 500 — caught only
 * by adding a temporary console.error and reading the actual shape of
 * what was thrown, not by assuming the class hierarchy worked as expected.
 */
export async function fetchListingById(id: string): Promise<Listing | null> {
  try {
    const snap = await getDoc(doc(db, 'listings', id));
    if (!snap.exists()) return null;
    return fromFirestoreDoc(snap.id, snap.data());
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : undefined;
    if (code === 'permission-denied') return null;
    throw err;
  }
}
