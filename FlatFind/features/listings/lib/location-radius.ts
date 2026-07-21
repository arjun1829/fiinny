import type { Listing } from '@/types/listing';
import { haversineDistanceKm } from '@/utils/haversine';
import type { LocationAnchor } from '@/features/map/components/LocationAutocomplete';

const RADIUS_KM = 4; // matches isWithinRadius()'s hardcoded <=4 check (index (1).html)

// Mirrors isWithinRadius() (index (1).html, LOCATION SEARCH block) — true if
// the listing has no coordinates (pass-through, same as the original) or is
// within RADIUS_KM of any selected anchor. No anchors selected -> always
// true (no-op filter), same as the original's `if(!_locSelected.length)
// return true`.
export function isWithinAnyAnchorRadius(listing: Listing, anchors: LocationAnchor[]): boolean {
  if (anchors.length === 0) return true;
  if (listing.lat == null || listing.lng == null) return true;
  const point = { lat: listing.lat, lng: listing.lng };
  return anchors.some((anchor) => haversineDistanceKm(anchor, point) <= RADIUS_KM);
}
