import { NextRequest, NextResponse } from 'next/server';

type GeocodeComponent = { long_name?: string; short_name?: string; types?: string[] };
type GeocodeResult = { formatted_address?: string; types?: string[]; address_components?: GeocodeComponent[] };

type AddressComponents = {
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
};

const EMPTY_COMPONENTS: AddressComponents = { area: '', city: '', district: '', state: '', pincode: '' };

function pickFormattedAddress(results: GeocodeResult[]): string | null {
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

/** Pick the most precise Google result for structured parsing. */
function pickPreciseResult(results: GeocodeResult[]): GeocodeResult | null {
  if (!Array.isArray(results) || !results.length) return null;
  return (
    results.find((r) => r.types?.includes('street_address')) ||
    results.find((r) => r.types?.includes('premise')) ||
    results.find((r) => r.types?.includes('subpremise')) ||
    results.find((r) => r.types?.includes('route')) ||
    results[0]
  );
}

function componentsFromGoogle(result: GeocodeResult): AddressComponents {
  const parts = result.address_components || [];
  const pick = (type: string) =>
    parts.find((p) => Array.isArray(p.types) && p.types.includes(type) && p.long_name)?.long_name || '';

  let city = '';
  for (const want of ['locality', 'postal_town', 'sublocality_level_1', 'administrative_area_level_2', 'neighborhood']) {
    const v = pick(want);
    if (v) { city = v; break; }
  }

  const streetNumber = pick('street_number');
  const route = pick('route');
  const premise = pick('premise') || pick('subpremise');
  const sublocality = pick('sublocality_level_1') || pick('sublocality') || pick('neighborhood');
  let area = [streetNumber, route].filter(Boolean).join(' ').trim();
  if (!area) area = premise || sublocality;

  return {
    area,
    city,
    district: pick('administrative_area_level_2') || pick('administrative_area_level_3'),
    state: pick('administrative_area_level_1'),
    pincode: pick('postal_code'),
  };
}

function componentsFromNominatim(a: Record<string, string>): AddressComponents {
  const street = [a.house_number, a.road].filter(Boolean).join(' ').trim();
  return {
    area: street || a.neighbourhood || a.suburb || a.quarter || a.residential || a.hamlet || '',
    city: a.city || a.town || a.village || a.municipality || a.suburb || a.county || '',
    district: a.state_district || a.county || a.district || '',
    state: a.state || '',
    pincode: a.postcode || '',
  };
}

function hasAnyComponent(c: AddressComponents): boolean {
  return !!(c.area || c.city || c.district || c.state || c.pincode);
}

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat');
  const lng = req.nextUrl.searchParams.get('lng');
  if (lat == null || lng == null || lat === '' || lng === '') {
    return NextResponse.json({ error: 'missing lat or lng' }, { status: 400 });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return NextResponse.json({ error: 'invalid coordinates' }, { status: 400 });
  }

  const key =
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  let data: { status?: string; error_message?: string; results?: GeocodeResult[] } = {};
  if (key) {
    try {
      // Server-side fetch — NOT subject to browser referer restrictions, so this
      // succeeds even when the in-browser JS Geocoder is blocked.
      const upstream = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${encodeURIComponent(key)}`
      );
      data = await upstream.json();
    } catch {
      // fall through to OSM fallback below
    }
  }

  if (data.status === 'OK' && data.results?.length) {
    const formatted = pickFormattedAddress(data.results);
    const precise = pickPreciseResult(data.results);
    const components = precise ? componentsFromGoogle(precise) : EMPTY_COMPONENTS;
    if (formatted || hasAnyComponent(components)) {
      return NextResponse.json({ formatted_address: formatted, components, geocode_status: 'OK' });
    }
  }

  // Fallback: OpenStreetMap Nominatim (free, no API key).
  // Used when Google Geocoding API is disabled or quota-exceeded.
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&zoom=18&addressdetails=1&accept-language=en`,
      { headers: { 'User-Agent': 'krishidukan-app/1.0' } }
    );
    if (r.ok) {
      const j = (await r.json()) as { display_name?: string; address?: Record<string, string> };
      const a = j.address || {};
      const components = componentsFromNominatim(a);
      const city =
        a.city || a.town || a.village || a.suburb || a.county || a.state_district || a.state;
      const stateName = a.state;
      const compact = [city, stateName].filter(Boolean).join(', ');
      if (compact || hasAnyComponent(components)) {
        return NextResponse.json({
          formatted_address: compact || j.display_name || null,
          components,
          geocode_status: 'OSM_FALLBACK',
        });
      }
      if (j.display_name) {
        return NextResponse.json({
          formatted_address: j.display_name,
          components,
          geocode_status: 'OSM_FALLBACK',
        });
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    formatted_address: null,
    components: EMPTY_COMPONENTS,
    geocode_status: data.status || 'UNKNOWN',
    geocode_error: data.error_message || null,
  });
}
