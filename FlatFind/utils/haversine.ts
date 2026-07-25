// Mirrors hav(la1,lo1,la2,lo2) (index (1).html, main IIFE) — the original had
// three near-identical Haversine implementations (hav(), isWithinRadius(),
// and an inline copy in getFiltered()'s .map()); this is the single
// canonical version referenced by the architecture report (§1.11, §3.8) as
// replacing all three.
const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance between two coordinates, in km, rounded to 1 decimal. */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Number((EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(1));
}
