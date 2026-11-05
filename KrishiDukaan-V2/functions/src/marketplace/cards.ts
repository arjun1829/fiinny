import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { buildRatingAgg, mapMarketplaceDoc, mergeMarketplaceProducts } from "./merge";
import { nextDiscountBoundary } from "./discount";
import { buildNameKeywords, buildSearchKeywords } from "./search-keywords";

/**
 * marketplaceCards/{sha1(nameKey)} holds one ready-to-render marketplace card
 * per product name: the merge of every manufacturer/retailer/admin copy of
 * that name, plus search tokens and ranking fields. The storefront and app
 * read ~20 cards per page instead of every raw product doc.
 *
 * marketplaceSearch/{same id} holds the card's search tokens, kept apart so
 * readers that load many cards don't download several KB of tokens per card.
 *
 * cardMembers/{productId} = { nameKey } indexes which products belong to which
 * card, because Firestore cannot query case-insensitively by name.
 *
 * Consistency: a rebuild records the earliest time it read anything
 * (sourceReadTime) and only replaces a card built from an older snapshot.
 * Every product/review write triggers a rebuild that reads after that write,
 * so the newest card always reflects every write.
 */

const REGION = "asia-south1";
export const CARDS = "marketplaceCards";
export const SEARCH = "marketplaceSearch";
export const MEMBERS = "cardMembers";
const PRODUCTS = "products";
const REVIEWS = "productReviews";
const CARD_SCHEMA_VERSION = 1;
// A card past this size risks Firestore's 1 MiB document limit.
const MAX_CARD_BYTES = 900_000;
const GET_ALL_CHUNK = 300;
const IN_CHUNK = 30;
const MAX_EVENT_AGE_MS = 60 * 60 * 1000;

const COPY_SOURCES = new Set(["retailer_inventory_copy", "manufacturer_assigned", "admin_assigned"]);

// Writes that only touch these fields cannot change a card.
const IGNORED_PRODUCT_FIELDS = new Set([
  "updatedAt",
  "impressions", "positionSum", "clicks", "calls", "directionRequests",
  "impressionsByDay", "clicksByDay", "callsByDay", "directionRequestsByDay",
  // Product-identity link metadata (admin /admin/product-identity). canonicalId
  // is inert for the card merge (grouping is still name-based), so stamping it
  // must not churn a rebuild.
  "canonicalId", "canonicalLinkedAt", "canonicalLinkedBy",
]);

type Timestamp = admin.firestore.Timestamp;
type RawDoc = { id: string; data: admin.firestore.DocumentData };
type ReviewRow = { catalogId: string; rating: number };

const db = (): admin.firestore.Firestore => admin.firestore();

export function nameKeyOf(name: unknown): string {
  return String(name ?? "").toLowerCase().trim();
}

export function cardIdFor(nameKey: string): string {
  return createHash("sha1").update(nameKey).digest("hex");
}

function isNewer(a: Timestamp, b: Timestamp): boolean {
  return a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
}

function earliest(a: Timestamp, b: Timestamp): Timestamp {
  return isNewer(a, b) ? b : a;
}

function millisOf(value: unknown): number {
  if (value && typeof (value as Timestamp).toMillis === "function") return (value as Timestamp).toMillis();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Firestore rejects `undefined`; the merge output is full of optional fields. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && typeof (a as { isEqual?: unknown }).isEqual === "function") {
    return (a as { isEqual(o: unknown): boolean }).isEqual(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Top-level fields whose values differ between two versions of a doc. */
function changedFields(before: admin.firestore.DocumentData, after: admin.firestore.DocumentData): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys).filter((k) => !deepEqual(before[k], after[k]));
}

export type BuiltCard = { card: Record<string, unknown>; search: Record<string, unknown> };

/**
 * Pure: the card (and its search doc) for one name group, or null when nothing
 * in the group is listable. Docs are merged in document-id order, the order
 * the storefront's former full-collection read produced, so the result matches
 * it exactly.
 */
export function buildCardData(
  nameKey: string,
  docs: RawDoc[],
  reviews: ReviewRow[],
  now: number,
): BuiltCard | null {
  const sorted = [...docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const active = sorted.filter((d) => d.data.isActive !== false);
  const merged = mergeMarketplaceProducts(
    active.map((d) => mapMarketplaceDoc(d.id, d.data)),
    buildRatingAgg(reviews),
  );
  const product = merged[0];
  if (!product) return null;

  const availability = product.availability ?? [];
  const base = product.lowestPrice ?? product.price ?? 0;
  const final = product.lowestFinalPrice ?? base;
  const liveDiscountPct = base > 0 && final < base ? Math.round((1 - final / base) * 10000) / 100 : 0;

  let nextRecomputeMs: number | null = null;
  for (const d of active) {
    const boundary = nextDiscountBoundary(d.data, now);
    if (boundary !== null && (nextRecomputeMs === null || boundary < nextRecomputeMs)) nextRecomputeMs = boundary;
  }

  const unique = (values: unknown[]) =>
    Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));

  const categoryKey = String(product.category ?? "").trim().toLowerCase();
  // The app reads the base pack size for its delivery weight estimate; the
  // web mapping above doesn't carry it.
  const canonicalUnit = active.find((d) => d.id === product.id)?.data.unit;
  const card: Record<string, unknown> = {
    ...product,
    unit: typeof canonicalUnit === "string" && canonicalUnit ? canonicalUnit : undefined,
    nameKey,
    categoryKey,
    sellerCount: new Set(availability.map((a) => a.storePhone || a.storeId).filter(Boolean)).size,
    liveDiscountPct,
    createdAtMs: Math.max(0, ...active.map((d) => millisOf(d.data.createdAt))),
    memberIds: sorted.map((d) => d.id),
    // Docs with their own /products page, mirroring isListable() in the web's
    // app/lib/seo/products-server.ts, so the sitemap can read cards instead
    // of every product.
    listable: active
      .filter((d) => !COPY_SOURCES.has(String(d.data.source ?? "")) && d.data.name && d.data.image &&
        Number.isFinite(Number(d.data.price)))
      .map((d) => ({
        id: d.id,
        name: String(d.data.name),
        updatedAtMs: millisOf(d.data.updatedAt ?? d.data.createdAt),
      })),
    schemaVersion: CARD_SCHEMA_VERSION,
  };
  if (nextRecomputeMs !== null) {
    card.nextRecomputeAt = admin.firestore.Timestamp.fromMillis(nextRecomputeMs);
  }

  const clean = stripUndefined(card);
  if (JSON.stringify(clean).length > MAX_CARD_BYTES && Array.isArray(clean.availability)) {
    logger.error("[cards] card too large, trimming seller list", { nameKey, sellers: clean.availability.length });
    clean.availability = (clean.availability as unknown[]).slice(0, 800);
  }

  const search = {
    nameKey,
    categoryKey,
    nameKeywords: buildNameKeywords(unique([product.name])),
    searchKeywords: buildSearchKeywords({
      names: unique([product.name, product.fullName, ...active.map((d) => d.data.fullName)]),
      category: String(product.category ?? ""),
      storeNames: unique([...active.map((d) => d.data.store), ...availability.map((a) => a.storeName)]),
      description: String(product.description ?? ""),
    }),
  };
  return { card: clean, search };
}

function contentHash(built: BuiltCard): string {
  return createHash("sha1").update(JSON.stringify(built)).digest("hex");
}

async function readReviews(
  ids: string[],
  version: Timestamp,
): Promise<{ rows: ReviewRow[]; version: Timestamp }> {
  const rows: ReviewRow[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const snap = await db().collection(REVIEWS).where("catalogId", "in", ids.slice(i, i + IN_CHUNK)).get();
    version = earliest(version, snap.readTime);
    for (const d of snap.docs) {
      rows.push({ catalogId: String(d.get("catalogId") ?? ""), rating: Number(d.get("rating") ?? 0) });
    }
  }
  return { rows, version };
}

type WriteOutcome = "written" | "deleted" | "unchanged" | "stale";

/**
 * Writes the card and its search doc unless a card built from a newer
 * snapshot is already there.
 */
async function commitCard(
  nameKey: string,
  built: BuiltCard | null,
  version: Timestamp,
  dryRun = false,
): Promise<WriteOutcome> {
  const id = cardIdFor(nameKey);
  const ref = db().collection(CARDS).doc(id);
  const searchRef = db().collection(SEARCH).doc(id);
  const hash = built ? contentHash(built) : null;
  return db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const curVersion = cur.get("sourceReadTime") as Timestamp | undefined;
    if (curVersion && !isNewer(version, curVersion)) return "stale";
    if (!built) {
      if (!cur.exists) return "unchanged";
      if (!dryRun) {
        tx.delete(ref);
        tx.delete(searchRef);
      }
      return "deleted";
    }
    if (cur.exists && cur.get("contentHash") === hash) {
      // Record the newer snapshot so concurrent triggers can skip their rebuild.
      if (!dryRun) tx.update(ref, { sourceReadTime: version });
      return "unchanged";
    }
    if (!dryRun) {
      tx.set(ref, {
        ...built.card,
        contentHash: hash,
        sourceReadTime: version,
        builtAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(searchRef, built.search);
    }
    return "written";
  });
}

/** Rebuilds one card from the current state of its name group. */
export async function rebuildCard(nameKey: string): Promise<WriteOutcome> {
  if (!nameKey) return "unchanged";
  const firestore = db();
  const members = await firestore.collection(MEMBERS).where("nameKey", "==", nameKey).get();
  let version = members.readTime;

  const docs: RawDoc[] = [];
  const ids = members.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const refs = ids.slice(i, i + GET_ALL_CHUNK).map((id) => firestore.collection(PRODUCTS).doc(id));
    for (const snap of await firestore.getAll(...refs)) {
      version = earliest(version, snap.readTime);
      if (snap.exists) docs.push({ id: snap.id, data: snap.data() ?? {} });
    }
  }

  const activeIds = docs.filter((d) => d.data.isActive !== false).map((d) => d.id);
  const reviews = await readReviews(activeIds, version);
  const card = buildCardData(nameKey, docs, reviews.rows, Date.now());
  return commitCard(nameKey, card, reviews.version);
}

/** Skips the rebuild when a card built after `changedAt` already exists. */
async function rebuildUnlessCovered(nameKey: string, changedAt: Timestamp): Promise<void> {
  const current = await db().collection(CARDS).doc(cardIdFor(nameKey)).get();
  const builtFrom = current.get("sourceReadTime") as Timestamp | undefined;
  if (builtFrom && isNewer(builtFrom, changedAt)) return;
  const outcome = await rebuildCard(nameKey);
  logger.debug("[cards] rebuilt", { nameKey, outcome });
}

const TRANSIENT_GRPC_CODES = new Set([4, 8, 10, 13, 14]);

/** Rethrows only errors worth retrying, so a bad doc cannot retry forever. */
function handleError(err: unknown, context: Record<string, unknown>): void {
  const code = (err as { code?: number })?.code;
  if (typeof code === "number" && TRANSIENT_GRPC_CODES.has(code)) throw err;
  logger.error("[cards] rebuild failed", { ...context, err: String(err) });
}

function isTooOld(eventTime: string): boolean {
  return Date.now() - Date.parse(eventTime) > MAX_EVENT_AGE_MS;
}

function changeTimeOf(after: admin.firestore.DocumentSnapshot | undefined, eventTime: string): Timestamp {
  return (after?.exists ? after.updateTime : undefined) ??
    admin.firestore.Timestamp.fromDate(new Date(eventTime));
}

export const syncMarketplaceCardOnProductWrite = onDocumentWritten(
  { document: `${PRODUCTS}/{productId}`, region: REGION, retry: true, memory: "512MiB", timeoutSeconds: 120 },
  async (event) => {
    if (isTooOld(event.time)) return;
    const productId = event.params.productId;
    const before = event.data?.before;
    const after = event.data?.after;
    const beforeData = before?.exists ? before.data() ?? {} : null;
    const afterData = after?.exists ? after.data() ?? {} : null;

    if (beforeData && afterData &&
        changedFields(beforeData, afterData).every((f) => IGNORED_PRODUCT_FIELDS.has(f))) {
      return;
    }

    const oldKey = beforeData ? nameKeyOf(beforeData.name) : "";
    const newKey = afterData ? nameKeyOf(afterData.name) : "";

    try {
      let changedAt = changeTimeOf(after, event.time);
      if (oldKey !== newKey || !beforeData || !afterData) {
        const memberRef = db().collection(MEMBERS).doc(productId);
        const result = newKey ? await memberRef.set({ nameKey: newKey }) : await memberRef.delete();
        if (isNewer(result.writeTime, changedAt)) changedAt = result.writeTime;
      }
      for (const key of Array.from(new Set([oldKey, newKey]))) {
        if (key) await rebuildUnlessCovered(key, changedAt);
      }
    } catch (err) {
      handleError(err, { productId, oldKey, newKey });
    }
  },
);

export const syncMarketplaceCardOnReviewWrite = onDocumentWritten(
  { document: `${REVIEWS}/{reviewId}`, region: REGION, retry: true, timeoutSeconds: 120 },
  async (event) => {
    if (isTooOld(event.time)) return;
    const before = event.data?.before;
    const after = event.data?.after;
    const catalogIds = new Set(
      [before?.get("catalogId"), after?.get("catalogId")].map((v) => String(v ?? "")).filter(Boolean),
    );
    if (before?.exists && after?.exists &&
        before.get("rating") === after.get("rating") && before.get("catalogId") === after.get("catalogId")) {
      return;
    }
    const changedAt = changeTimeOf(after, event.time);
    try {
      for (const catalogId of Array.from(catalogIds)) {
        const member = await db().collection(MEMBERS).doc(catalogId).get();
        const key = String(member.get("nameKey") ?? "");
        if (key) await rebuildUnlessCovered(key, changedAt);
      }
    } catch (err) {
      handleError(err, { reviewId: event.params.reviewId });
    }
  },
);

/** Rebuilds cards whose discount window opens or closes. */
export const recomputeDueMarketplaceCards = onSchedule(
  { schedule: "every 15 minutes", region: REGION, timeoutSeconds: 300 },
  async () => {
    const due = await db()
      .collection(CARDS)
      .where("nextRecomputeAt", "<=", admin.firestore.Timestamp.now())
      .limit(100)
      .get();
    for (const card of due.docs) {
      try {
        await rebuildCard(String(card.get("nameKey") ?? ""));
      } catch (err) {
        logger.error("[cards] scheduled rebuild failed", { cardId: card.id, err: String(err) });
      }
    }
  },
);

export interface ReconcileReport {
  products: number;
  membershipsFixed: number;
  cardsWritten: number;
  cardsDeleted: number;
  cardsUnchanged: number;
  cardsStale: number;
  searchDocsDeleted: number;
  failures: number;
}

async function readAll(
  collection: string,
  onPage: (docs: admin.firestore.QueryDocumentSnapshot[], readTime: Timestamp) => void,
): Promise<void> {
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db().collection(collection).orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) return;
    onPage(snap.docs, snap.readTime);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) return;
  }
}

/**
 * Rebuilds every membership and card from scratch. Used nightly as a safety net
 * and, with `dryRun`, by scripts/backfill-marketplace-cards.ts to preview.
 */
export async function reconcileAllCards(opts: { dryRun?: boolean } = {}): Promise<ReconcileReport> {
  const dryRun = opts.dryRun === true;
  const firestore = db();
  let version: Timestamp | null = null;
  const note = (t: Timestamp) => { version = version ? earliest(version, t) : t; };

  const groups = new Map<string, RawDoc[]>();
  const keyById = new Map<string, string>();
  await readAll(PRODUCTS, (docs, readTime) => {
    note(readTime);
    for (const d of docs) {
      const key = nameKeyOf(d.get("name"));
      if (!key) continue;
      keyById.set(d.id, key);
      const group = groups.get(key) ?? [];
      group.push({ id: d.id, data: d.data() });
      groups.set(key, group);
    }
  });

  const reviewsById = new Map<string, ReviewRow[]>();
  await readAll(REVIEWS, (docs, readTime) => {
    note(readTime);
    for (const d of docs) {
      const catalogId = String(d.get("catalogId") ?? "");
      if (!catalogId) continue;
      const rows = reviewsById.get(catalogId) ?? [];
      rows.push({ catalogId, rating: Number(d.get("rating") ?? 0) });
      reviewsById.set(catalogId, rows);
    }
  });

  const report: ReconcileReport = {
    products: keyById.size, membershipsFixed: 0,
    cardsWritten: 0, cardsDeleted: 0, cardsUnchanged: 0, cardsStale: 0, searchDocsDeleted: 0, failures: 0,
  };

  // Memberships: add missing/wrong ones, remove ones for deleted or nameless products.
  const memberFixes: Array<{ id: string; key: string | null }> = [];
  const seenMembers = new Set<string>();
  await readAll(MEMBERS, (docs) => {
    for (const d of docs) {
      seenMembers.add(d.id);
      const want = keyById.get(d.id) ?? null;
      if (want !== d.get("nameKey")) memberFixes.push({ id: d.id, key: want });
    }
  });
  for (const [id, key] of Array.from(keyById)) if (!seenMembers.has(id)) memberFixes.push({ id, key });
  report.membershipsFixed = memberFixes.length;
  if (!dryRun) {
    for (let i = 0; i < memberFixes.length; i += 400) {
      const batch = firestore.batch();
      for (const fix of memberFixes.slice(i, i + 400)) {
        const ref = firestore.collection(MEMBERS).doc(fix.id);
        if (fix.key) batch.set(ref, { nameKey: fix.key });
        else batch.delete(ref);
      }
      await batch.commit();
    }
  }

  // Cards: build every group; delete cards whose group no longer exists.
  const existingCardKeys = new Map<string, string>();
  await readAll(CARDS, (docs) => {
    for (const d of docs) existingCardKeys.set(d.id, String(d.get("nameKey") ?? ""));
  });
  const groupCardIds = new Set(Array.from(groups.keys(), cardIdFor));
  const orphanSearchIds: string[] = [];
  await readAll(SEARCH, (docs) => {
    for (const d of docs) if (!groupCardIds.has(d.id)) orphanSearchIds.push(d.id);
  });

  const snapshotVersion: Timestamp = version ?? admin.firestore.Timestamp.now();
  const now = Date.now();
  const tasks: Array<() => Promise<void>> = [];
  const tally = (o: WriteOutcome) => {
    if (o === "written") report.cardsWritten++;
    else if (o === "deleted") report.cardsDeleted++;
    else if (o === "stale") report.cardsStale++;
    else report.cardsUnchanged++;
  };
  for (const [key, docs] of Array.from(groups)) {
    tasks.push(async () => {
      const reviews = docs.flatMap((d) => reviewsById.get(d.id) ?? []);
      tally(await commitCard(key, buildCardData(key, docs, reviews, now), snapshotVersion, dryRun));
    });
  }
  for (const [cardId, key] of Array.from(existingCardKeys)) {
    if (key && groups.has(key) && cardIdFor(key) === cardId) continue;
    tasks.push(async () => {
      if (key && cardIdFor(key) === cardId) {
        tally(await commitCard(key, null, snapshotVersion, dryRun));
      } else {
        // Malformed card doc: no valid key, so no trigger can ever fix it.
        if (!dryRun) {
          await firestore.collection(CARDS).doc(cardId).delete();
          await firestore.collection(SEARCH).doc(cardId).delete();
        }
        report.cardsDeleted++;
      }
    });
  }
  for (const id of orphanSearchIds) {
    if (existingCardKeys.has(id)) continue; // removed together with its card above
    tasks.push(async () => {
      if (!dryRun) await firestore.collection(SEARCH).doc(id).delete();
      report.searchDocsDeleted++;
    });
  }

  const CONCURRENCY = 10;
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      try {
        await task();
      } catch (err) {
        report.failures++;
        logger.error("[cards] reconcile task failed", { err: String(err) });
      }
    }
  }));
  return report;
}

export const reconcileMarketplaceCards = onSchedule(
  { schedule: "30 2 * * *", timeZone: "Asia/Kolkata", region: REGION, memory: "1GiB", timeoutSeconds: 540 },
  async () => {
    const report = await reconcileAllCards();
    logger.info("[cards] nightly reconcile", report);
  },
);
