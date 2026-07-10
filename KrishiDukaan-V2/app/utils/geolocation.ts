/**
 * Geolocation helper: browser getCurrentPosition with fallback.
 * Persists last known location to localStorage.
 */

import { LatLng } from './haversine';

/** Default fallback: Pune, Maharashtra */
export const DEFAULT_LOCATION: LatLng = { lat: 18.5204, lng: 73.8567 };
export const DEFAULT_LOCATION_LABEL = 'Pune, Maharashtra';

const STORAGE_KEY = 'krishidukaan_user_location_v3';
const LABEL_STORAGE_KEY = 'krishidukaan_user_location_label_v3';
const CACHE_TTL_MS = 10 * 60 * 1000;

export type GeoResult = {
  coords: LatLng;
  label: string;
  source: 'browser' | 'cached' | 'default';
};

type CachedLocationPayload = {
  coords: LatLng;
  label?: string;
  timestamp?: number;
};

function isValidLatLng(coords: LatLng | undefined | null): coords is LatLng {
  if (!coords) return false;
  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return false;
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return false;
  return Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180;
}

function isFreshTimestamp(timestamp?: number): boolean {
  if (typeof timestamp !== 'number') return false;
  return Date.now() - timestamp <= CACHE_TTL_MS;
}

/** Try to load a previously persisted location from localStorage */
export function getCachedLocation(): GeoResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const label = localStorage.getItem(LABEL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LatLng | CachedLocationPayload | null;

      if (parsed && typeof parsed === 'object' && 'coords' in parsed) {
        const coords = parsed.coords as LatLng;
        const cachedLabel = parsed.label || label || DEFAULT_LOCATION_LABEL;
        if (isValidLatLng(coords) && isFreshTimestamp(parsed.timestamp)) {
          return { coords, label: cachedLabel, source: 'cached' };
        }
        return null;
      }

      if (isValidLatLng(parsed as LatLng)) {
        return null;
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/** Persist a location to localStorage */
export function cacheLocation(coords: LatLng, label: string): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedLocationPayload = {
      coords,
      label,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(LABEL_STORAGE_KEY, label);
  } catch {
    // storage full or blocked — ignore
  }
}

function pickFormattedFromResults(results: { formatted_address?: string; types?: string[] }[]): string | null {
  if (!Array.isArray(results) || !results.length) return null;
  const preferTypes = [
    'street_address',
    'premise',
    'subpremise',
    'route',
    'neighborhood',
    'sublocality',
    'sublocality_level_1',
    'locality',
    'administrative_area_level_3',
  ];
  for (const r of results) {
    const fa = r.formatted_address;
    if (typeof fa !== 'string' || !fa.trim()) continue;
    const types = r.types || [];
    if (types.some((t) => preferTypes.includes(t))) return fa.trim();
  }
  const first = results[0]?.formatted_address;
  return typeof first === 'string' && first.trim() ? first.trim() : null;
}

/**
 * Reverse‑geocode to a full address string.
 * Tries same-origin API route first, then direct Geocoding (client key).
 */
export async function reverseGeocodeToDisplay(
  lat: number,
  lng: number,
  apiKey: string | null | undefined
): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  if (typeof window !== 'undefined') {
    try {
      const r = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      );
      if (r.ok) {
        const data = (await r.json()) as { formatted_address?: string | null };
        const fa = data.formatted_address;
        if (typeof fa === 'string' && fa.trim()) return fa.trim();
      }
    } catch {
      // fall through
    }
  }

  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return fallback;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&key=${encodeURIComponent(key)}`
    );
    const data = (await res.json()) as {
      status?: string;
      results?: { formatted_address?: string; types?: string[] }[];
    };

    if (data.status === 'OK' && data.results?.length) {
      const formatted = pickFormattedFromResults(data.results);
      if (formatted) return formatted;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export type GetUserLocationOptions = {
  /**
   * When true, the localStorage cache is not used as a fallback if GPS fails.
   * GPS failure rejects the promise instead, so the caller can show an explicit error.
   * Use this for visit recording where stale fallback coordinates would be misleading.
   */
  skipCache?: boolean;
};

/**
 * Request the user's location via the browser Geolocation API.
 * By default falls back to cached → default if denied/unavailable.
 * Pass { skipCache: true } to reject instead of falling back to stale coordinates.
 */
export function getUserLocation(options?: GetUserLocationOptions): Promise<GeoResult> {
  const skipCache = options?.skipCache ?? false;

  return new Promise((resolve, reject) => {
    const cached = skipCache ? null : getCachedLocation();

    if (!navigator.geolocation) {
      if (cached) { resolve(cached); return; }
      if (skipCache) { reject(new Error('Location is not supported by your browser.')); return; }
      resolve({ coords: DEFAULT_LOCATION, label: DEFAULT_LOCATION_LABEL, source: 'default' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const coords: LatLng = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const label = await reverseGeocodeToDisplay(
            coords.lat,
            coords.lng,
            process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          );
          cacheLocation(coords, label);
          resolve({ coords, label, source: 'browser' });
        })();
      },
      (_error) => {
        if (cached) { resolve(cached); return; }
        if (skipCache) {
          reject(new Error('Unable to get your current location. Please allow location access and try again.'));
          return;
        }
        resolve({ coords: DEFAULT_LOCATION, label: DEFAULT_LOCATION_LABEL, source: 'default' });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}
