import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/client';

// users/{uid}/reveals/{listingId} — one doc per listing whose contact this
// user has revealed; existence = revealed. Mirrors
// saved-history-firestore.ts's savedDocRef/historyDocRef pattern exactly:
// doc ID is the listing's own id, so "has this been revealed before" is a
// plain existence check rather than a query, and a repeat reveal is a
// no-op overwrite (idempotent), never a second count.

function revealDocRef(uid: string, listingId: string) {
  return doc(db, 'users', uid, 'reveals', listingId);
}

/** Returns the set of listing IDs this user has revealed — lifetime, never reset (see useContactReveal's remainingReveals derivation). */
export async function fetchRevealedListingIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', uid, 'reveals'));
  return new Set(snap.docs.map((d) => d.id));
}

/** Records a contact reveal. Caller (useContactReveal) is responsible for checking the 4-reveal cap before calling this — firestore.rules can't enforce a count against a subcollection, so this is a client-trusted boundary, same class of gap as saved/history's rules already document. */
export async function recordContactReveal(uid: string, listingId: string): Promise<void> {
  await setDoc(revealDocRef(uid, listingId), { revealedAt: serverTimestamp() });
}
