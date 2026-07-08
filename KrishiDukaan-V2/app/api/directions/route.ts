import { NextRequest, NextResponse } from 'next/server';

type Waypoint = { lat: number; lng: number };

/**
 * POST /api/directions
 * Body: { waypoints: { lat, lng }[] }
 *
 * Calls Google Directions API server-side (no CORS restriction).
 * Falls back to OSRM public routing if Google is unavailable or the API is not enabled.
 * Returns: { totalDistanceKm: number, source: 'google' | 'osrm' }
 */
export async function POST(req: NextRequest) {
  let waypoints: Waypoint[];
  try {
    const body = await req.json() as { waypoints?: unknown };
    if (!Array.isArray(body.waypoints) || body.waypoints.length < 2) {
      return NextResponse.json({ error: 'Provide at least 2 waypoints.' }, { status: 400 });
    }
    waypoints = (body.waypoints as Waypoint[]).filter(
      (p) => typeof p.lat === 'number' && typeof p.lng === 'number',
    );
    if (waypoints.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 valid waypoints.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // ── Try Google Directions API ──────────────────────────────────────────────
  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (apiKey) {
    try {
      const result = await googleDirections(waypoints, apiKey);
      if (result !== null) {
        return NextResponse.json({ totalDistanceKm: result, source: 'google' });
      }
    } catch {
      // fall through to OSRM
    }
  }

  // ── Fallback: OSRM public routing server ──────────────────────────────────
  // Free, no API key, good road coverage including India.
  try {
    const result = await osrmRoute(waypoints);
    if (result !== null) {
      return NextResponse.json({ totalDistanceKm: result, source: 'osrm' });
    }
  } catch {
    // fall through to error
  }

  return NextResponse.json(
    { error: 'Could not calculate route distance. Both Google and OSRM failed.' },
    { status: 502 },
  );
}

// ── Google Directions ────────────────────────────────────────────────────────

async function googleDirections(waypoints: Waypoint[], apiKey: string): Promise<number | null> {
  const origin      = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediate = waypoints.slice(1, -1);

  const params = new URLSearchParams({
    origin:      `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    key:         apiKey,
  });
  if (intermediate.length > 0) {
    params.set('waypoints', intermediate.map((p) => `via:${p.lat},${p.lng}`).join('|'));
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
    { next: { revalidate: 0 } },
  );
  if (!res.ok) return null;

  const body = (await res.json()) as {
    status: string;
    routes: { legs: { distance: { value: number } }[] }[];
  };

  if (body.status !== 'OK' || !body.routes.length) return null;

  const totalMeters = body.routes[0].legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  return Math.round(totalMeters / 10) / 100;
}

// ── OSRM fallback ─────────────────────────────────────────────────────────────

async function osrmRoute(waypoints: Waypoint[]): Promise<number | null> {
  // OSRM expects coordinates as lng,lat (note: reversed from Google)
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'krishidukan-app/1.0' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    code: string;
    routes: { distance: number }[];
  };

  if (body.code !== 'Ok' || !body.routes.length) return null;

  const totalMeters = body.routes[0].distance;
  return Math.round(totalMeters / 10) / 100;
}
