// Mirrors the listing object shape produced by seed()/parseCSV()/parseSheetCSV()
// in the original SPA (index (1).html) — the same fields regardless of
// whether a listing came from the hardcoded seed, an Excel import, or the
// Google Sheet sync. `source` distinguishes those origins.
//
// NOTE on schema naming: the architecture report's §3.5 Firestore design
// sketch (written before implementation) proposed camelCase field names
// (ownerName, contactPhone, imageUrls, etc.) as a fresh design. By Phase 7,
// this snake_case shape had already been implemented, tested, and built on
// across Phases 4-6 (ListingCard, filtering.ts, sorting.ts, MapView, and
// the seed data all depend on these exact field names). Renaming everything
// to match the pre-implementation sketch would be pure churn with no
// behavioral benefit, so Phase 7 extends *this* type — the one actually
// running — rather than the planning doc's original proposal. `status` and
// `firestoreId` below are the only structural additions this phase makes.
export type ListingTag = 'owner' | 'broker' | 'flatmate';
export type ListingCity = 'Bangalore' | 'Hyderabad' | 'Gurgaon';
export type ListingType = '1BHK' | '2BHK' | 'Flatmate';
export type ListingSource = 'seed' | 'user' | 'excel' | 'sheet' | 'firestore';

// Mirrors the moderation workflow decided in Phase 0: user-submitted
// listings are created 'pending' and only become publicly visible once an
// admin publishes them (Phase 9/12); admin-created listings are 'published'
// immediately. Seed/demo data written by the Phase 7 seed script is
// 'published' outright, since it exists purely to populate the homepage
// during development — there's no submitter to moderate.
export type ListingStatus = 'pending' | 'published' | 'rejected';

// The original's Filter Panel (FP_FURNISH/FP_AVAIL/FP_TENANT/FP_AMENITY,
// index (1).html head script) rendered these as filter options, but no
// listing anywhere in the source data model (seed/CSV/Sheet-sync schema)
// actually carried structured fields for them — they only existed as
// free-text words inside descriptions, so the filters never had anything to
// filter against (architecture report §1.5). Phase 5 adds them here as real
// fields so the Filter Panel is fully functional, not just visually present.
export type Furnishing = 'Fully Furnished' | 'Semi Furnished' | 'Unfurnished';
export type Availability = 'Immediate' | 'Within 15 Days' | 'Within 30 Days';
export type TenantPreference = 'Anyone' | 'Family' | 'Male' | 'Female';
export type Amenity = 'Gym' | 'Parking' | 'Pool' | 'Power Backup' | 'Security' | 'Lift';

export interface Listing {
  id: string;
  title: string;
  description: string;
  rent: number;
  location: string;
  city: ListingCity;
  type: ListingType;
  tag: ListingTag;
  owner_name: string;
  contact_phone: string | null;
  contact_email: string;
  image_urls: string[];
  fb_url: string;
  lat: number | null;
  lng: number | null;
  created: string; // ISO timestamp
  available: boolean;
  views: number;
  source: ListingSource;
  furnishing: Furnishing;
  availability: Availability;
  tenant_preference: TenantPreference;
  amenities: Amenity[];
  status: ListingStatus;
  /**
   * The Firebase Auth uid of whoever submitted this listing. New in Phase
   * 9 — the original had no concept of a listing's poster beyond a
   * free-text "your name" field, since there was no real auth to attribute
   * it to. Optional because seed/CSV/Sheet-sourced listings (and anything
   * an admin creates directly in Phase 12) have no submitting user.
   */
  ownerId?: string;
  /**
   * Owner-controlled visibility toggle, independent of `status`. New in
   * Phase 13 (My Listings) — `status` is exclusively admin-driven
   * (moderation: pending/published/rejected), so an owner temporarily
   * pulling their own published listing from public view (e.g. "flat got
   * rented, but I might repost") needed a separate flag rather than
   * repurposing status, which would have collided with the moderation
   * workflow's own meaning of those three values. A listing is publicly
   * visible only when `status === 'published' && !hidden`.
   */
  hidden: boolean;
}
