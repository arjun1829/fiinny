import type { Listing } from '@/types/listing';
import { BUDGET_OPTIONS } from '@/constants/filters';
import { EXPIRY_DAYS } from '@/constants/listing-display';
import type { ListingFilters } from './filter-state';

// Mirrors getFiltered() (index (1).html, main IIFE). The original checked
// only city/type/budget/search — this is the direct 1:1 port of that part.
// tag/furnishing/availability/tenant/amenity are additions (Phase 5, per
// the user's decision to make the Filter Panel fully functional rather than
// cosmetic — see types/listing.ts and constants/filters.ts for why those
// fields didn't exist in the original data model at all).
//
// The status !== 'published' check is new in Phase 7 — the original had no
// moderation concept at all (every submitted listing went live instantly).
// Per Phase 0's decision, user-submitted listings are created 'pending' and
// must not appear in public search results until an admin publishes them.
//
// The `hidden` check is new in Phase 13 (My Listings) — an owner can pull
// their own published listing from public view without going back through
// moderation (see types/listing.ts's doc comment on `hidden` for why this
// is a separate flag from `status`).
//
// buildSearchHaystack() flattens every user-visible, meaningfully-searchable
// text field into one lowercased string, checked with a single .includes().
// Fixes a real bug (not a new feature): the search box only ever checked
// `location` and `title` — searching "Gurgaon" against a listing whose city
// is Gurgaon but whose title/location text didn't happen to contain that
// word returned nothing, even though the listing is unambiguously a
// Gurgaon listing. city/type/tag are included as their raw stored values
// (not display labels) since those values ARE the user-facing text already
// ('Gurgaon', '2BHK', 'owner', etc. — see types/listing.ts's literal
// unions), so no separate label-mapping table is needed for them to match.
function buildSearchHaystack(listing: Listing): string {
  return [
    listing.title,
    listing.description,
    listing.location,
    listing.city,
    listing.type,
    listing.tag,
    listing.owner_name,
    listing.furnishing,
    listing.availability,
    listing.tenant_preference,
    ...listing.amenities,
  ]
    .join(' ')
    .toLowerCase();
}

export function filterListings(listings: Listing[], filters: ListingFilters): Listing[] {
  const budget = BUDGET_OPTIONS[filters.budgetIndex] ?? BUDGET_OPTIONS[0];
  const now = Date.now();
  const query = filters.search.trim().toLowerCase();

  return listings.filter((listing) => {
    if (listing.status !== 'published') return false;
    if (listing.hidden) return false;
    if (!listing.available) return false;
    if ((now - new Date(listing.created).getTime()) / 86400000 > EXPIRY_DAYS) return false;
    if (filters.city !== 'All' && listing.city !== filters.city) return false;
    if (filters.type !== 'All' && listing.type !== filters.type) return false;
    if (listing.rent < budget.min || listing.rent > budget.max) return false;
    if (filters.tag !== 'All' && listing.tag !== filters.tag) return false;
    if (filters.furnishing !== 'All' && listing.furnishing !== filters.furnishing) return false;
    if (filters.availability !== 'All' && listing.availability !== filters.availability) return false;
    if (filters.tenant !== 'All' && listing.tenant_preference !== filters.tenant) return false;
    if (filters.amenity !== 'All' && !listing.amenities.includes(filters.amenity)) return false;
    // Multi-word queries ("sector 56") require every word to appear
    // somewhere in the haystack, not as one contiguous substring — so
    // "gated society" matches a title of "2BHK Gated Society" the same way
    // a real marketplace search would, without requiring the words to be
    // adjacent or in that exact order.
    if (query) {
      const haystack = buildSearchHaystack(listing);
      const terms = query.split(/\s+/).filter(Boolean);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}
