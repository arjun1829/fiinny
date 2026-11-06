/**
 * Reading storeDirectory/*: a compact copy of the retailers, manufacturers,
 * profiles and stores records plus per-phone review totals, kept current by
 * Cloud Functions (functions/src/stores/directory.ts). Pure, so the browser
 * (fetchStores) and the server (SEO store pages) can both use it.
 *
 * The records come back shaped like query snapshots ({ docs: [{ id, data() }] })
 * so each reader keeps running its own merge exactly as it did over the
 * collections themselves.
 */

export const STORE_DIRECTORY = "storeDirectory";

export type DirectoryDoc = { id: string; data: () => Record<string, any> };
export type DirectorySnapshot = { docs: DirectoryDoc[] };

export type StoreSources = {
  stores: DirectorySnapshot;
  retailers: DirectorySnapshot;
  manufacturers: DirectorySnapshot;
  profiles: DirectorySnapshot;
  /** storePhone → summed ratings from storeReviews. */
  ratings: Map<string, { sum: number; count: number }>;
};

type Chunk = {
  buildId?: string;
  chunkIndex?: number;
  chunkCount?: number;
  entries?: { c: string; id: string; d: Record<string, any> }[];
  ratings?: Record<string, { sum: number; count: number }>;
};

/** Turns the directory's chunk docs into per-collection snapshots. */
export function sourcesFromDirectory(chunkDocs: Chunk[]): StoreSources {
  const chunks = [...chunkDocs].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  const buildIds = new Set(chunks.map((c) => c.buildId));
  if (chunks.length === 0 || buildIds.size !== 1 || chunks.length !== chunks[0].chunkCount) {
    throw new Error(`store directory unavailable or incomplete (${chunks.length} chunks)`);
  }

  const docs: Record<string, DirectoryDoc[]> = { stores: [], retailers: [], manufacturers: [], profiles: [] };
  const ratings = new Map<string, { sum: number; count: number }>();
  for (const chunk of chunks) {
    for (const e of chunk.entries ?? []) docs[e.c]?.push({ id: e.id, data: () => e.d });
    for (const [phone, agg] of Object.entries(chunk.ratings ?? {})) ratings.set(phone, agg);
  }
  return {
    stores: { docs: docs.stores },
    retailers: { docs: docs.retailers },
    manufacturers: { docs: docs.manufacturers },
    profiles: { docs: docs.profiles },
    ratings,
  };
}
