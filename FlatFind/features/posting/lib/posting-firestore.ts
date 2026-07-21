import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { Listing, ListingCity, ListingType } from '@/types/listing';
import { classifyListingTag, extractPhoneFromText } from './classify';

export interface PostListingInput {
  title: string;
  description: string;
  rent: number;
  location: string;
  city: ListingCity;
  type: ListingType;
  ownerName: string;
  phone: string; // raw digits, may be empty
  email: string;
  imageUrl1: string;
  imageUrl2: string;
}

// Mirrors submitPost() (index (1).html, main IIFE) — same required-field
// validation (title, rent, location), same classify()/extractPhone()
// fallback chain for tag and contact_phone, same image_urls filtering
// (blank URLs dropped). Two real differences from the original, both
// deliberate:
//
//   1. `available: true, views: 0, source: 'user'` still match, but
//      `status: 'pending'` is new — the original published instantly with
//      no moderation step at all. Per Phase 0's decision, user-submitted
//      listings are created 'pending' and only become publicly visible
//      once an admin publishes them (Phase 12). filterListings() already
//      excludes non-'published' listings (Phase 7), so a freshly-posted
//      listing correctly does not appear in the public grid until then.
//   2. The document is written with the *signed-in user's* uid attached
//      (ownerId) — the original had no concept of who posted a listing
//      beyond a free-text "your name" field, since there was no real auth
//      to attribute it to. This lets a future "my listings" view (not part
//      of Phase 9's scope) query by ownerId later without a schema change.
//
// created uses serverTimestamp() rather than a client-generated
// new Date().toISOString() (the original's approach) — the server clock is
// authoritative, not whatever the poster's device clock happens to read.
export async function submitListing(input: PostListingInput, ownerId: string): Promise<string> {
  const title = input.title.trim();
  const rent = Number(input.rent);
  const location = input.location.trim();

  if (!title || !rent || !location) {
    throw new Error('Title, rent and location are required');
  }

  const description = input.description.trim();
  const normalizedPhone = input.phone.trim().replace(/\D/g, '').slice(-10) || null;
  const imageUrls = [input.imageUrl1.trim(), input.imageUrl2.trim()].filter(Boolean);

  const listing: Omit<Listing, 'id' | 'created'> & { created: ReturnType<typeof serverTimestamp> } = {
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
    fb_url: '',
    lat: null,
    lng: null,
    created: serverTimestamp(),
    available: true,
    views: 0,
    source: 'user',
    status: 'pending',
    // Furnishing/availability/tenant/amenities (Phase 5 additions) have no
    // equivalent fields in the original post form — it never collected
    // them either, so there's nothing to infer them from here. Defaulted
    // to the most neutral/inclusive option rather than guessing.
    furnishing: 'Unfurnished',
    availability: 'Immediate',
    tenant_preference: 'Anyone',
    amenities: [],
    ownerId,
    hidden: false,
  };

  const docRef = await addDoc(collection(db, 'listings'), listing);
  return docRef.id;
}
