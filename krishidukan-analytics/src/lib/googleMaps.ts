import type { Libraries } from '@react-google-maps/api';

/** Existing public Maps key (reused from KrishiDukaan-V2 — no new key created). */
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

/** Stable loader id + libraries (geocoding is part of the core JS API). */
export const GOOGLE_MAPS_LOADER_ID = 'krishidukan-analytics-maps';
export const GOOGLE_MAPS_LIBRARIES: Libraries = [];

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** locality component, or '' if Google did not return one. */
  city: string;
  /** administrative_area_level_1 (first-order region), or '' if unresolved. */
  state: string;
  /** country component, or '' if unresolved. */
  country: string;
}

/** Read a component's long_name by type from Google's structured components. */
function component(
  components: google.maps.GeocoderAddressComponent[],
  type: string,
): string {
  return components.find((c) => c.types.includes(type))?.long_name ?? '';
}

/**
 * Resolve a city name to coordinates + structured address components via the
 * Maps JS Geocoder (Geocoding API). We read Google's STRUCTURED components —
 * locality (city), administrative_area_level_1 (state), country — rather than
 * parsing the formatted address string. Biased to India. Resolves to null when
 * not found; callers cache successful results so a city is geocoded only once.
 * Requires the Maps JS API to already be loaded.
 */
export function geocodeCity(city: string): Promise<GeocodeResult | null> {
  return new Promise((resolve) => {
    if (typeof google === 'undefined' || !google.maps) {
      resolve(null);
      return;
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: `${city}, India`, region: 'IN' }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const r = results[0];
        const loc = r.geometry.location;
        const comps = r.address_components;
        resolve({
          lat: loc.lat(),
          lng: loc.lng(),
          city: component(comps, 'locality') || city,
          state: component(comps, 'administrative_area_level_1'),
          country: component(comps, 'country'),
        });
      } else {
        resolve(null);
      }
    });
  });
}
