import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import type { Change, DocumentSnapshot } from "firebase-functions/v2/firestore";

/**
 * storeDirectory/{chunk-NNN}: a compact copy of every store record, so the
 * store locator, cart store picker, SEO store pages and the app read one or
 * two docs instead of the whole retailers, profiles, manufacturers, stores and
 * storeReviews collections.
 *
 * It holds the source records (only the fields the web fetchStores(), the SEO
 * getAllStores(), the app's StoreRepository, the add-retailer form and the
 * comment tag suggestions read) rather than a merged result, so each of those
 * keeps its own merge rules unchanged. Store ratings are pre-summed per phone,
 * the only way any reader used reviews.
 *
 * Rebuilt by a 5-minute job, only after a trigger has seen a relevant change.
 */

const REGION = "asia-south1";
export const DIRECTORY = "storeDirectory";
const STATE_DOC = "storeDirectoryState/state";
// Firestore docs are capped at 1 MiB; leave room for field overhead.
const MAX_CHUNK_BYTES = 700_000;

const MAPS_FIELDS = ["googleMapsUrl", "googleBusinessUrl", "mapsLink"];
const COMMON_FIELDS = [
  "phone", "ownerName", "uid", "logo", "address", "city", "state", "pincode",
  "onlineDelivery", "geo", "location", "lat", "lng", "updatedAt", "email", ...MAPS_FIELDS,
];

/** Fields each reader's merge uses, per source collection. null = whole doc. */
const SOURCE_FIELDS: Record<string, string[] | null> = {
  retailers: [...COMMON_FIELDS, "onboardingStatus", "retailerId", "userId", "shopName", "status",
    "products", "averageRating", "totalReviews"],
  manufacturers: [...COMMON_FIELDS, "slug", "businessName"],
  profiles: [...COMMON_FIELDS, "role", "shopName", "businessName", "name", "status"],
  // Legacy and small; the web spreads the whole doc into its Store objects.
  stores: null,
};
const SOURCES = Object.keys(SOURCE_FIELDS);

type Entry = { c: string; id: string; d: Record<string, unknown> };

const db = (): admin.firestore.Firestore => admin.firestore();

function project(collection: string, data: admin.firestore.DocumentData): Record<string, unknown> | null {
  // Only sellers can appear as stores.
  if (collection === "profiles" && data.role !== "retailer" && data.role !== "manufacturer") return null;
  const fields = SOURCE_FIELDS[collection];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || (fields && !fields.includes(k))) continue;
    // Readers only use product names, as the store's "stock" list.
    out[k] = k === "products" && Array.isArray(v)
      ? v.map((p) => (p && typeof p === "object" ? (p as { name?: unknown }).name : p))
        .filter((n) => typeof n === "string" && n)
      : v;
  }
  return out;
}

async function readAll(collection: string): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const out: admin.firestore.QueryDocumentSnapshot[] = [];
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db().collection(collection).orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    out.push(...snap.docs);
    if (snap.size < 500) return out;
    last = snap.docs[snap.docs.length - 1];
  }
}

export interface DirectoryReport {
  entries: number;
  storePhonesWithReviews: number;
  chunks: number;
  bytes: number;
}

/** Rebuilds the whole directory from the source collections. */
export async function rebuildStoreDirectory(opts: { dryRun?: boolean } = {}): Promise<DirectoryReport> {
  const startedAt = admin.firestore.Timestamp.now();
  const entries: Entry[] = [];
  for (const c of SOURCES) {
    for (const doc of await readAll(c)) {
      const d = project(c, doc.data());
      if (d) entries.push({ c, id: doc.id, d });
    }
  }

  const ratings: Record<string, { sum: number; count: number }> = {};
  for (const doc of await readAll("storeReviews")) {
    const phone = String(doc.get("storePhone") ?? "");
    const rating = Number(doc.get("rating") ?? 0);
    if (!phone || !(rating > 0)) continue;
    const cur = ratings[phone] ?? { sum: 0, count: 0 };
    cur.sum += rating;
    cur.count += 1;
    ratings[phone] = cur;
  }

  // Pack entries into chunks by approximate serialized size.
  const chunks: Entry[][] = [[]];
  let size = JSON.stringify(ratings).length;
  let total = size;
  for (const e of entries) {
    const bytes = JSON.stringify(e).length;
    if (size + bytes > MAX_CHUNK_BYTES && chunks[chunks.length - 1].length > 0) {
      chunks.push([]);
      size = 0;
    }
    chunks[chunks.length - 1].push(e);
    size += bytes;
    total += bytes;
  }

  const report = {
    entries: entries.length,
    storePhonesWithReviews: Object.keys(ratings).length,
    chunks: chunks.length,
    bytes: total,
  };
  if (opts.dryRun) return report;

  const buildId = startedAt.toMillis().toString(36);
  const existing = await db().collection(DIRECTORY).listDocuments();
  const keep = new Set(chunks.map((_, i) => `chunk-${String(i).padStart(3, "0")}`));
  // One batch, so readers see either the old directory or the new one.
  const batch = db().batch();
  chunks.forEach((chunk, i) => {
    batch.set(db().collection(DIRECTORY).doc(`chunk-${String(i).padStart(3, "0")}`), {
      buildId,
      chunkIndex: i,
      chunkCount: chunks.length,
      builtAt: startedAt,
      entries: chunk,
      ...(i === 0 ? { ratings } : {}),
    });
  });
  for (const ref of existing) if (!keep.has(ref.id)) batch.delete(ref);
  batch.set(db().doc(STATE_DOC), { builtAt: startedAt }, { merge: true });
  await batch.commit();
  return report;
}

const RELEVANT: Record<string, Set<string> | null> = {
  retailers: new Set(SOURCE_FIELDS.retailers),
  manufacturers: new Set(SOURCE_FIELDS.manufacturers),
  profiles: new Set(SOURCE_FIELDS.profiles),
  stores: null,
  storeReviews: new Set(["storePhone", "rating"]),
};

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && typeof (a as { isEqual?: unknown }).isEqual === "function") {
    return (a as { isEqual(o: unknown): boolean }).isEqual(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether a write changed anything the directory holds. */
export function affectsDirectory(collection: string, change: Change<DocumentSnapshot> | undefined): boolean {
  const before = change?.before?.exists ? change.before.data() ?? {} : null;
  const after = change?.after?.exists ? change.after.data() ?? {} : null;
  if (!before || !after) return true;
  const fields = RELEVANT[collection];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).some((k) => (!fields || fields.has(k)) && !isEqual(before[k], after[k]));
}

async function markDirty(collection: string, change: Change<DocumentSnapshot> | undefined): Promise<void> {
  if (!affectsDirectory(collection, change)) return;
  await db().doc(STATE_DOC).set({ dirtyAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

export const markStoreDirectoryDirtyOnRetailer = onDocumentWritten(
  { document: "retailers/{id}", region: REGION }, (e) => markDirty("retailers", e.data));
export const markStoreDirectoryDirtyOnManufacturer = onDocumentWritten(
  { document: "manufacturers/{id}", region: REGION }, (e) => markDirty("manufacturers", e.data));
export const markStoreDirectoryDirtyOnProfile = onDocumentWritten(
  { document: "profiles/{id}", region: REGION }, (e) => markDirty("profiles", e.data));
export const markStoreDirectoryDirtyOnStore = onDocumentWritten(
  { document: "stores/{id}", region: REGION }, (e) => markDirty("stores", e.data));
export const markStoreDirectoryDirtyOnStoreReview = onDocumentWritten(
  { document: "storeReviews/{id}", region: REGION }, (e) => markDirty("storeReviews", e.data));

export const rebuildStoreDirectoryIfDirty = onSchedule(
  { schedule: "every 5 minutes", region: REGION, memory: "512MiB", timeoutSeconds: 300 },
  async () => {
    const state = await db().doc(STATE_DOC).get();
    const dirtyAt = state.get("dirtyAt") as admin.firestore.Timestamp | undefined;
    const builtAt = state.get("builtAt") as admin.firestore.Timestamp | undefined;
    if (builtAt && (!dirtyAt || dirtyAt.toMillis() < builtAt.toMillis())) return;
    const report = await rebuildStoreDirectory();
    logger.info("[storeDirectory] rebuilt", report);
  },
);
