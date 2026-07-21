import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { Listing } from '@/types/listing';
import { fromFirestoreDoc } from '@/features/listings/lib/listings-firestore';
import type { PostListingInput } from '@/features/posting/lib/posting-firestore';
import { classifyListingTag, extractPhoneFromText } from '@/features/posting/lib/classify';

// The owner-scoped counterpart to admin-firestore.ts — same "every
// function relies on firestore.rules to actually enforce the restriction"
// approach (Phase 12's pattern), just gated by `ownerId == request.auth.uid`
// (Phase 13) instead of isAdmin(). No function here trusts the caller to
// only ever pass their own uid/listing id; the rule is the real boundary.

/** Every listing owned by the given uid, regardless of status/hidden — the data source for the My Listings section. */
export async function fetchMyListings(ownerId: string): Promise<Listing[]> {
  const q = query(collection(db, 'listings'), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestoreDoc(d.id, d.data()));
}

/**
 * Edit fields an owner may change on their own listing. Deliberately the
 * same shape as PostListingInput (minus city/type, which the edit form
 * keeps but reuses unchanged) run back through the same
 * classify/extractPhone derivation submitListing() uses, so an edited
 * listing's tag/contact_phone stay consistent with a freshly-posted one
 * rather than drifting out of sync with posting's own logic.
 */
export async function updateMyListing(listingId: string, input: PostListingInput): Promise<void> {
  const title = input.title.trim();
  const rent = Number(input.rent);
  const location = input.location.trim();

  if (!title || !rent || !location) {
    throw new Error('Title, rent and location are required');
  }

  const description = input.description.trim();
  const normalizedPhone = input.phone.trim().replace(/\D/g, '').slice(-10) || null;
  const imageUrls = [input.imageUrl1.trim(), input.imageUrl2.trim()].filter(Boolean);

  await updateDoc(doc(db, 'listings', listingId), {
    title,
    description,
    rent,
    location,
    city: input.city,
    type: input.type,
    tag: classifyListingTag(description, title),
    owner_name: input.ownerName.trim(),
    contact_phone: normalizedPhone || extractPhoneFromText(description),
    contact_email: input.email.trim(),
    image_urls: imageUrls,
  });
}

/** Owner-controlled visibility toggle — see types/listing.ts's doc comment on `hidden` for why this is separate from `status`. */
export async function setListingHidden(listingId: string, hidden: boolean): Promise<void> {
  await updateDoc(doc(db, 'listings', listingId), { hidden });
}

/** Permanently removes the owner's own listing. firestore.rules restricts this to `resource.data.ownerId == request.auth.uid`. */
export async function deleteMyListing(listingId: string): Promise<void> {
  await deleteDoc(doc(db, 'listings', listingId));
}
