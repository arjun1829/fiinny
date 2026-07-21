import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { Listing } from '@/types/listing';
import { fromFirestoreDoc } from '@/features/listings/lib/listings-firestore';

// Resolves a set of listing IDs (from users/{uid}/saved or .../history) into
// full Listing objects, for /saved and /history to render with the same
// ListingGrid/ListingCard used everywhere else. Firestore's `in` query
// caps at 30 comparison values per the current SDK — chunked here so a
// user with a very large saved/history list doesn't silently truncate.
//
// The query includes `where('status', '==', 'published')` alongside the
// documentId() `in` filter, even though every ID here already came from
// this same user's own saved/history records. This isn't redundant: it's
// required by firestore.rules' `allow list: if resource.data.status ==
// 'published'` rule (Phase 7) — a list query is evaluated "all or nothing"
// against its own constraints, so a query for raw IDs with no status
// filter would be rejected outright the moment a saved/viewed listing had
// since been unpublished or rejected, not just silently omit that one
// result. Filtering here keeps this query within what the rule allows,
// and correctly drops anything the user saved/viewed that's no longer
// publicly visible, rather than breaking the whole page for it.
//
// The `hidden` check (Phase 13) is applied client-side after the fetch
// rather than as a `where('hidden', '==', false)` clause: existing
// documents written before Phase 13 have no `hidden` field at all, and
// Firestore equality filters don't match a missing field, so adding it to
// the query would silently drop every pre-Phase-13 listing from Saved/
// History results. Filtering the already-fetched results instead treats a
// missing `hidden` the same as `false` (visible) — correct for old
// documents — while still excluding anything an owner has since hidden.
export async function fetchListingsByIds(ids: string[]): Promise<Listing[]> {
  if (ids.length === 0) return [];

  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const q = query(collection(db, 'listings'), where(documentId(), 'in', chunk), where('status', '==', 'published'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => fromFirestoreDoc(d.id, d.data()));
    }),
  );

  return results.flat().filter((listing) => !listing.hidden);
}
