import { NextRequest, NextResponse } from 'next/server';

type GeocodeResult = { formatted_address?: string; types?: string[] };

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
    if (formatted) {
      return NextResponse.json({ formatted_address: formatted, geocode_status: 'OK' });
    }
  }

  // Fallback: OpenStreetMap Nominatim (free, no API key).
  // Used when Google Geocoding API is disabled or quota-exceeded.
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&zoom=12&accept-language=en`,
      { headers: { 'User-Agent': 'krishidukan-app/1.0' } }
    );
    if (r.ok) {
      const j = (await r.json()) as { display_name?: string; address?: Record<string, string> };
      const a = j.address || {};
      const city =
        a.city || a.town || a.village || a.suburb || a.county || a.state_district || a.state;
      const stateName = a.state;
      const compact = [city, stateName].filter(Boolean).join(', ');
      if (compact) {
        return NextResponse.json({ formatted_address: compact, geocode_status: 'OSM_FALLBACK' });
      }
      if (j.display_name) {
        return NextResponse.json({ formatted_address: j.display_name, geocode_status: 'OSM_FALLBACK' });
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    formatted_address: null,
    geocode_status: data.status || 'UNKNOWN',
    geocode_error: data.error_message || null,
  });
}
