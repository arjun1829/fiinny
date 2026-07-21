import type { Listing } from '@/types/listing';
import type { SortKey } from '@/constants/filters';
import { haversineDistanceKm, type LatLng } from '@/utils/haversine';

// Mirrors the .sort() clause in getFiltered() (index (1).html, main IIFE).
// `nearest` needs the user's location (S.userLat/userLng in the original),
// which doesn't exist until Phase 6 (Maps/geolocation) — when userLocation
// is null here, listings are left in their incoming order for that branch
// rather than crashing or silently reinterpreting "nearest" as something
// else. This matches the original's own fallback behavior: `(a.dist??999)`
// treated missing distance as "far", so with no location at all every
// listing ties and .sort() is a no-op.
export function sortListings(listings: Listing[], sort: SortKey, userLocation: LatLng | null): Listing[] {
  const withDistance = listings.map((listing) => ({
    listing,
    distanceKm: userLocation && listing.lat != null && listing.lng != null
      ? haversineDistanceKm(userLocation, { lat: listing.lat, lng: listing.lng })
      : null,
  }));

  withDistance.sort((a, b) => {
    switch (sort) {
      case 'newest':
        return new Date(b.listing.created).getTime() - new Date(a.listing.created).getTime();
      case 'price_up':
        return a.listing.rent - b.listing.rent;
      case 'price_dn':
        return b.listing.rent - a.listing.rent;
      case 'nearest':
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      default:
        return 0;
    }
  });

  return withDistance.map((entry) => entry.listing);
}
