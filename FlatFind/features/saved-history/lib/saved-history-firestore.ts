import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/client';

// Mirrors S.savedIds / S.viewedIds (index (1).html, main IIFE) — both were
// in-memory Sets that reset on every page refresh (a real gap in the
// original, called out in the architecture report §1.2). These are now
// per-user Firestore subcollections (users/{uid}/saved/{listingId},
// users/{uid}/history/{listingId}) — persisted, matching the architecture
// doc's §3.5 design ("users/{uid}/saved/{listingId} — replaces in-memory
// contactsUsed; this is what makes free-reveal count survive a refresh,
// fixing a real gap" — same principle applies here to saved/viewed).
//
// Doc IDs are the listing's own id (not an auto-generated one), so
// isListingSaved()-style existence checks and unsave/toggle operations are
// simple doc-ref lookups rather than queries.

function savedDocRef(uid: string, listingId: string) {
  return doc(db, 'users', uid, 'saved', listingId);
}

function historyDocRef(uid: string, listingId: string) {
  return doc(db, 'users', uid, 'history', listingId);
}

/** Returns the set of listing IDs the user has saved. */
export async function fetchSavedListingIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', uid, 'saved'));
  return new Set(snap.docs.map((d) => d.id));
}

/** Returns the set of listing IDs the user has viewed, matching S.viewedIds's role in gating the "Viewed" badge and populating /history. */
export async function fetchViewedListingIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', uid, 'history'));
  return new Set(snap.docs.map((d) => d.id));
}

/** Mirrors toggleSave(id,btn)'s S.savedIds.add/delete — adds or removes the save record depending on current state. */
export async function toggleSavedListing(uid: string, listingId: string, currentlySaved: boolean): Promise<void> {
  const ref = savedDocRef(uid, listingId);
  if (currentlySaved) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, { savedAt: serverTimestamp() });
  }
}

/** Mirrors openDet()'s `S.viewedIds.add(id)` — recorded once per view; idempotent (re-viewing just refreshes viewedAt). */
export async function recordListingView(uid: string, listingId: string): Promise<void> {
  await setDoc(historyDocRef(uid, listingId), { viewedAt: serverTimestamp() });
}
