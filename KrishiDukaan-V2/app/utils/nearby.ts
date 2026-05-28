/**
 * Nearby-selection helper:
 * - Computes distances from user location to each store
 * - Progressive radius fallback: [5, 10, 20] km
 * - Falls back to nearest district, then state-wide if metadata exists
 * - Sorts stores by distance ascending
 * - Sorts product results: in-stock first, then by distance
 */

import { LatLng, haversineDistance, formatDistance } from './haversine';
import { Store } from '../firebase';
import { MarketplaceProduct } from '../../types/product';

const RADIUS_TIERS_KM = [5, 10, 20];

export type StoreWithDistance = Store & {
  distanceKm: number;
  distanceLabel: string;
};

/**
 * Compute distance from user to each store and attach it.
 * Stores without valid lat/lng keep their original distance string.
 */
export function computeStoreDistances(
  stores: Store[],
  userLocation: LatLng
): StoreWithDistance[] {
  return stores
    .map((store) => {
      const storeLoc = store.location;
      if (storeLoc && storeLoc.lat && storeLoc.lng) {
        const distanceKm = haversineDistance(userLocation, storeLoc);
        return {
          ...store,
          distanceKm,
          distanceLabel: formatDistance(distanceKm),
        };
      }
      // No valid coordinates — keep original distance string
      return {
        ...store,
        distanceKm: Infinity,
        distanceLabel: store.distance || 'Unknown',
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Extract a "district" from the store address (2nd comma-separated segment).
 * Example address: "Baner, Pune, Maharashtra 413102" → district = "Pune"
 */
function extractDistrict(address?: string): string {
  if (!address) return '';
  const parts = address.split(',').map((s) => s.trim());
  // Try the second part, which is typically the district/city
  if (parts.length >= 3) return parts[parts.length - 2].toLowerCase();
  if (parts.length >= 2) return parts[1].toLowerCase();
  return parts[0].toLowerCase();
}

/**
 * Extract the state from the store address (last comma-separated segment, minus pincode).
 */
function extractState(address?: string): string {
  if (!address) return '';
  const parts = address.split(',').map((s) => s.trim());
  const last = parts[parts.length - 1];
  // Remove pincode digits from state
  return last.replace(/\d+/g, '').trim().toLowerCase();
}

/**
 * Apply progressive radius fallback.
 * Returns stores sorted by distance ascending.
 *
 * Algorithm:
 * 1. Try 5 km radius
 * 2. Try 10 km radius
 * 3. Try 20 km radius
 * 4. Fallback: nearest district match
 * 5. Fallback: state-wide list
 * 6. Final: return all stores sorted by distance
 */
export function selectNearbyStores(
  stores: StoreWithDistance[],
  userLocation: LatLng
): StoreWithDistance[] {
  const sorted = [...stores].sort((a, b) => a.distanceKm - b.distanceKm);

  // Progressive radius search
  for (const radius of RADIUS_TIERS_KM) {
    const inRadius = sorted.filter((s) => s.distanceKm <= radius);
    if (inRadius.length > 0) {
      return inRadius;
    }
  }

  // District fallback: find the nearest store's district and get all stores in that district
  if (sorted.length > 0 && sorted[0].address) {
    const nearestDistrict = extractDistrict(sorted[0].address);
    if (nearestDistrict) {
      const districtStores = sorted.filter(
        (s) => extractDistrict(s.address) === nearestDistrict
      );
      if (districtStores.length > 0) {
        return districtStores;
      }
    }
  }

  // State fallback
  if (sorted.length > 0 && sorted[0].address) {
    const nearestState = extractState(sorted[0].address);
    if (nearestState) {
      const stateStores = sorted.filter(
        (s) => extractState(s.address) === nearestState
      );
      if (stateStores.length > 0) {
        return stateStores;
      }
    }
  }

  // Final fallback: return all stores sorted by distance
  return sorted;
}

/**
 * Sort products by: in-stock first, then by distance from user.
 * Uses store availability data to compute effective distance.
 */
export function sortProductsByAvailability(
  products: MarketplaceProduct[],
  storesWithDistance: StoreWithDistance[]
): MarketplaceProduct[] {
  const storeDistanceMap = new Map<string, number>();
  storesWithDistance.forEach((s) => {
    storeDistanceMap.set(s.id, s.distanceKm);
  });

  return [...products].sort((a, b) => {
    // In-stock priority
    const aInStock = isInStock(a.stock);
    const bInStock = isInStock(b.stock);
    if (aInStock && !bInStock) return -1;
    if (!aInStock && bInStock) return 1;

    // Then sort by nearest store distance
    const aDist = getMinProductDistance(a, storeDistanceMap);
    const bDist = getMinProductDistance(b, storeDistanceMap);
    return aDist - bDist;
  });
}

function isInStock(stockLabel: string): boolean {
  const lower = stockLabel.toLowerCase();
  return lower === 'in stock' || lower === 'fast selling' || lower === 'trending';
}

function getMinProductDistance(
  product: MarketplaceProduct,
  distanceMap: Map<string, number>
): number {
  if (!product.availability || product.availability.length === 0) {
    return Infinity;
  }
  let min = Infinity;
  for (const av of product.availability) {
    const d = distanceMap.get(av.storeId);
    if (d !== undefined && d < min) min = d;
  }
  return min;
}

/** Normalize Firestore address (string or structured object) for display and search. */
export function storeAddressToDisplayString(address: unknown): string {
  if (address == null) return '';
  if (typeof address === 'string') return address.trim();
  if (typeof address === 'object') {
    const o = address as Record<string, unknown>;
    const pick = (k: string) => {
      const v = o[k];
      if (typeof v === 'string') return v.trim();
      if (v != null && typeof v !== 'object') return String(v).trim();
      return '';
    };
    const parts = [pick('line1'), pick('line2'), pick('city'), pick('district'), pick('state'), pick('pincode')].filter(
      Boolean
    );
    return parts.join(', ');
  }
  return String(address).trim();
}

/**
 * Filter stores by a text query.
 * Matches against: business name, city, district, villages (from address).
 */
export function filterStoresByQuery(
  stores: StoreWithDistance[],
  query: string
): StoreWithDistance[] {
  const q = query.trim().toLowerCase();
  if (!q) return stores;

  return stores.filter((store) => {
    const name = (store.name || '').toLowerCase();
    const address = storeAddressToDisplayString(store.address).toLowerCase();
    const owner = (store.ownerName || '').toLowerCase();
    return name.includes(q) || address.includes(q) || owner.includes(q);
  });
}
