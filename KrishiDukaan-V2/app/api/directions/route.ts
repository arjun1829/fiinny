import { NextRequest, NextResponse } from 'next/server';

type Waypoint = { lat: number; lng: number };

type RouteResult = {
  totalDistanceKm: number;
  encodedPolyline?: string;
  source: 'google-routes' | 'osrm';
};

/**
 * POST /api/directions
 * Body: { waypoints: { lat, lng }[] }
 *
 * Calls the Google Routes API server-side (no CORS restriction).
 * Falls back to OSRM if Google is unavailable or the key is not set.
 * Returns: { totalDistanceKm, encodedPolyline?, source }
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

  const apiKey =
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  // ── Try Google Routes API ─────────────────────────────────────────────────
  if (apiKey) {
    try {
      const result = await googleRoutes(waypoints, apiKey);
      if (result !== null) {
        return NextResponse.json({
          totalDistanceKm: result.totalDistanceKm,
          encodedPolyline:  result.encodedPolyline,
          source: 'google-routes',
        });
      }
    } catch {
      // fall through to OSRM
    }
  }

  // ── Fallback: OSRM ────────────────────────────────────────────────────────
  try {
    const result = await osrmRoute(waypoints);
    if (result !== null) {
      return NextResponse.json({
        totalDistanceKm:  result.totalDistanceKm,
        encodedPolyline:  result.encodedPolyline,
        source: 'osrm',
      });
    }
  } catch {
    // fall through to error
  }

  return NextResponse.json(
    { error: 'Could not calculate route distance. Both Google Routes and OSRM failed.' },
    { status: 502 },
  );
}

// ── Google Routes API ────────────────────────────────────────────────────────

async function googleRoutes(waypoints: Waypoint[], apiKey: string): Promise<RouteResult | null> {
  const origin      = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1);

  const body = {
    origin:      { location: { latLng: { latitude: origin.lat,      longitude: origin.lng      } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    ...(intermediates.length > 0
      ? { intermediates: intermediates.map(p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })) }
      : {}),
    travelMode:               'DRIVE',
    routingPreference:        'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: false,
    polylineEncoding:         'ENCODED_POLYLINE',
  };

  const res = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Goog-Api-Key':    apiKey,
        'X-Goog-FieldMask':  'routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as {
    routes?: {
      distanceMeters?: number;
      polyline?: { encodedPolyline?: string };
    }[];
  };

  const route = data.routes?.[0];
  if (!route || typeof route.distanceMeters !== 'number') return null;

  return {
    totalDistanceKm: Math.round(route.distanceMeters / 10) / 100,
    encodedPolyline: route.polyline?.encodedPolyline,
    source: 'google-routes',
  };
}

// ── OSRM fallback ─────────────────────────────────────────────────────────────

async function osrmRoute(waypoints: Waypoint[]): Promise<RouteResult | null> {
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'krishidukan-app/1.0' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    code: string;
    routes: { distance: number; geometry?: string }[];
  };

  if (data.code !== 'Ok' || !data.routes.length) return null;

  return {
    totalDistanceKm: Math.round(data.routes[0].distance / 10) / 100,
    encodedPolyline: data.routes[0].geometry,
    source: 'osrm',
  };
}
