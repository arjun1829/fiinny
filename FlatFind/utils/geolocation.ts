import type { LatLng } from './haversine';

// Mirrors the one-shot navigator.geolocation.getCurrentPosition() call in
// init() (index (1).html, main IIFE) — a single request on mount, silent no-op
// on denial/error, no caching, no re-request affordance. Wrapped in a Promise
// here so callers can await it from a useEffect instead of relying on a bare
// callback mutating module state (S.userLat/userLng in the original).
export function getCurrentPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
    );
  });
}
