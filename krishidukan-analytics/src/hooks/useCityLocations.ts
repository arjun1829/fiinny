import { useEffect, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { slugifyCity, type DemographicRow } from '../lib/demographics';
import { lookupCity } from '../lib/geo';
import { getCityGeoCache, saveCityGeo } from '../lib/analyticsRepo';
import type { ReportCategory } from '../lib/analyticsPaths';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  geocodeCity,
} from '../lib/googleMaps';

export interface CityLocation {
  city: string;
  state: string; // '' when unknown
  country: string;
  lat: number;
  lng: number;
}

export interface CityLocations {
  /** slug -> resolved location (coords + state). */
  locations: Record<string, CityLocation>;
  /** Still geocoding one or more cities. */
  resolving: boolean;
  /** Cities that could not be located at all (no coords). */
  failed: string[];
}

/**
 * Resolve every unique (non-"(not set)") city in `rows` to coordinates + state,
 * cheapest path first:
 *   1. in-code gazetteer (instant, no API)   2. Firestore cache
 *   3. one-time Google geocode -> persisted to the cache
 * A city is geocoded at most once, ever — never on every render. Extends the
 * existing coordinate cache rather than adding a second geocoding system.
 */
export function useCityLocations(
  rows: DemographicRow[],
  category: ReportCategory,
): CityLocations {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [locations, setLocations] = useState<Record<string, CityLocation>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);

  // Gazetteer + Firestore cache (no geocoding yet).
  useEffect(() => {
    let cancelled = false;
    const cities = Array.from(
      new Set(rows.filter((r) => !r.isNotSet).map((r) => r.city)),
    );

    const apply = (cache: Record<string, { lat: number; lng: number; state?: string; country?: string }>) => {
      if (cancelled) return;
      const loc: Record<string, CityLocation> = {};
      const pend: string[] = [];
      for (const city of cities) {
        const slug = slugifyCity(city);
        const g = lookupCity(city);
        if (g) {
          loc[slug] = { city, state: g.state, country: g.country, lat: g.lat, lng: g.lng };
        } else if (cache[slug]) {
          const c = cache[slug];
          loc[slug] = { city, state: c.state ?? '', country: c.country ?? '', lat: c.lat, lng: c.lng };
        } else {
          pend.push(city);
        }
      }
      setLocations(loc);
      setPending(pend);
      setFailed([]);
    };

    getCityGeoCache(category)
      .then((cache) => apply(cache))
      .catch(() => apply({}));

    return () => {
      cancelled = true;
    };
  }, [rows, category]);

  // One-time geocoding for cities missing from both the gazetteer and cache.
  useEffect(() => {
    if (!isLoaded || pending.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const city of pending) {
        if (cancelled) return;
        const r = await geocodeCity(city);
        if (cancelled) return;
        if (r) {
          const slug = slugifyCity(city);
          setLocations((prev) => ({
            ...prev,
            [slug]: { city, state: r.state, country: r.country, lat: r.lat, lng: r.lng },
          }));
          void saveCityGeo(category, {
            city,
            lat: r.lat,
            lng: r.lng,
            state: r.state,
            country: r.country,
            source: 'geocode',
          }).catch(() => {});
        } else {
          setFailed((f) => (f.includes(city) ? f : [...f, city]));
        }
      }
      if (!cancelled) setPending([]);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, pending, category]);

  return { locations, resolving: isLoaded && pending.length > 0, failed };
}
