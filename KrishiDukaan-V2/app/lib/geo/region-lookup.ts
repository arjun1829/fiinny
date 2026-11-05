/**
 * Coarse "which state / district is this?" for Admin > Search insights.
 *
 * Point-in-polygon over bundled boundaries (india-regions.json): current
 * states, and Census 2011 districts (newer districts show under the one they
 * were carved from). No API calls, no reads. The ~380 KB file loads on the
 * first lookup in a server instance and is kept in memory.
 */

type Region = [name: string, bbox: [number, number, number, number], rings: number[][]];
type Regions = { states: Region[]; districts: Region[] };

export type RegionHit = { state: string; district?: string };

let regions: Promise<Regions> | null = null;

function loadRegions(): Promise<Regions> {
  if (!regions) {
    regions = import("./india-regions.json")
      .then((m) => (m.default ?? m) as unknown as Regions)
      .catch((err) => {
        regions = null;
        throw err;
      });
  }
  return regions;
}

/** Even-odd test over every ring, so holes and islands both work. */
function contains(region: Region, x: number, y: number): boolean {
  const [minX, minY, maxX, maxY] = region[1];
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  let inside = false;
  for (const ring of region[2]) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2], yi = ring[i * 2 + 1];
      const xj = ring[j * 2], yj = ring[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function find(list: Region[], x: number, y: number): string | undefined {
  for (const r of list) if (contains(r, x, y)) return r[0];
  return undefined;
}

// A point on the coast can fall just offshore of the simplified outline;
// try a few nearby spots (~5 km) before giving up.
const NUDGES: [number, number][] = [[0, 0], [50, 0], [-50, 0], [0, 50], [0, -50], [50, 50], [-50, -50], [50, -50], [-50, 50]];

export async function lookupRegion(lat: number, lng: number): Promise<RegionHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Outside India's extent: nothing to look up.
  if (lat < 6 || lat > 37.5 || lng < 68 || lng > 98) return null;
  const { states, districts } = await loadRegions();
  const x0 = Math.round(lng * 1000);
  const y0 = Math.round(lat * 1000);
  for (const [dx, dy] of NUDGES) {
    const state = find(states, x0 + dx, y0 + dy);
    if (state) return { state, district: find(districts, x0 + dx, y0 + dy) };
  }
  return null;
}
