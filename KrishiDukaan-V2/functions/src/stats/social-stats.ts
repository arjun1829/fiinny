import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { normalizeSellerKey } from "./seller-stats";

/**
 * Per-seller SOCIAL totals for the seller dashboard's Analytics "Audience"
 * tiles — Followers and Reel views / likes / comments.
 *
 *   socialStats/{phone}:
 *     { phone,
 *       followers,                         // count of follows.followedShopId == phone
 *       reelCount,                         // reels.shopOwnerId == phone
 *       reelViews, reelLikes, reelComments,// Σ viewsCount/likesCount/commentsCount
 *       lastUpdatedAt,                     // when this doc was last recomputed
 *       syncStatus: "ok" }                 // see the robustness notes below
 *
 * WHY a precomputed doc. The Analytics page used to compute these live on every
 * open: a count() on `follows` plus three sum() aggregations on `reels`, once
 * per candidate phone form — up to a dozen aggregation queries per page view,
 * repeated for every seller every time they looked. These values barely change
 * between opens, so they are recomputed on a schedule here and the page reads a
 * single document instead (app/dashboard/_lib/analytics-firestore.ts).
 *
 * The authoritative source is the app's OWN Firestore data — the `reels`
 * counters (maintained by toggleLike / addComment / incrementViewsCount) and
 * the `follows` collection. There is no external social-platform API involved;
 * nothing is scraped.
 *
 * KEYING. `reels.shopOwnerId` and `follows.followedShopId` both hold the
 * seller's phone (written as `user.phone` by the mobile uploader / follow
 * flow). Both are normalised through normalizeSellerKey ("+91" + last 10
 * digits) so the two sources agree on one key per seller even if one stored a
 * bare 10-digit form. The Analytics client reads socialStats/{normalised phone}.
 *
 * ROBUSTNESS. The full totals are built in memory from a clean scan BEFORE any
 * write, so a scan that fails midway throws (and is retried) without ever
 * clobbering good cached numbers with partial/zero data — never overwrite valid
 * metrics with zero just because a read failed. A seller whose reels/follows
 * are genuinely all gone is a real zero, not a failure, and is written as 0 (see
 * the reconciliation pass over previously-known owners). Per-owner write errors
 * are isolated by the BulkWriter and do not fail the whole run.
 */

const REGION = "asia-south1";
export const SOCIAL_STATS = "socialStats";

/** Firestore read page size for the collection scans. */
const PAGE = 1000;

type Totals = {
  followers: number;
  reelCount: number;
  reelViews: number;
  reelLikes: number;
  reelComments: number;
};

function emptyTotals(): Totals {
  return { followers: 0, reelCount: 0, reelViews: 0, reelLikes: 0, reelComments: 0 };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Scans a collection in document-id pages, calling `onDoc` for each doc. Reads
 * only the fields in `fields` to keep egress down. Returns the number of docs
 * seen. Throws on any read error so the caller can abort before writing.
 */
async function scan(
  db: admin.firestore.Firestore,
  collection: string,
  fields: string[],
  onDoc: (data: admin.firestore.DocumentData) => void,
): Promise<number> {
  const base = db
    .collection(collection)
    .select(...fields)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(PAGE);
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  let seen = 0;
  for (;;) {
    const snap: admin.firestore.QuerySnapshot = await (cursor ? base.startAfter(cursor) : base).get();
    if (snap.empty) break;
    for (const doc of snap.docs) onDoc(doc.data());
    seen += snap.size;
    if (snap.size < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return seen;
}

/**
 * Recomputes every seller's social totals and upserts one socialStats/{phone}
 * doc each. Factored out of the scheduled wrapper so a one-off backfill can call
 * it too (scripts/backfill-social-stats.ts).
 */
export async function rebuildSocialStatsOnce(
  db: admin.firestore.Firestore = admin.firestore(),
  opts: { write?: boolean } = {},
): Promise<{ owners: number; reels: number; follows: number }> {
  const write = opts.write !== false;
  const totals = new Map<string, Totals>();
  const get = (phone: string): Totals => {
    let t = totals.get(phone);
    if (!t) { t = emptyTotals(); totals.set(phone, t); }
    return t;
  };

  // ── Scan reels: counts + engagement, grouped by owner ──────────────────────
  const reels = await scan(
    db,
    "reels",
    ["shopOwnerId", "viewsCount", "likesCount", "commentsCount"],
    (d) => {
      const key = normalizeSellerKey(d.shopOwnerId);
      if (!key || key.includes("/")) return;
      const t = get(key);
      t.reelCount += 1;
      t.reelViews += num(d.viewsCount);
      t.reelLikes += num(d.likesCount);
      t.reelComments += num(d.commentsCount);
    },
  );

  // ── Scan follows: one follower per doc, grouped by followed shop ────────────
  const follows = await scan(db, "follows", ["followedShopId"], (d) => {
    const key = normalizeSellerKey(d.followedShopId);
    if (!key || key.includes("/")) return;
    get(key).followers += 1;
  });

  if (!write) return { owners: totals.size, reels, follows };

  // Everything scanned cleanly (scan() throws otherwise), so it is now safe to
  // write — any value we write is a real total, not a partial read.
  const writer = db.bulkWriter();
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const [phone, t] of totals) {
    writer.set(
      db.collection(SOCIAL_STATS).doc(phone),
      { phone, ...t, lastUpdatedAt: now, syncStatus: "ok" },
      { merge: true },
    );
  }

  // Reconcile owners that USED to have social activity but no longer appear in
  // either scan (every reel/follow removed): their stored totals are a genuine
  // zero now, not a failed read, so zero them rather than leave stale numbers.
  const existing = await db.collection(SOCIAL_STATS).select().get();
  for (const doc of existing.docs) {
    if (totals.has(doc.id)) continue;
    writer.set(
      doc.ref,
      { ...emptyTotals(), phone: doc.id, lastUpdatedAt: now, syncStatus: "ok" },
      { merge: true },
    );
  }

  await writer.close();
  return { owners: totals.size, reels, follows };
}

/**
 * Recomputes socialStats daily. Daily is plenty: these are lifetime-ish totals
 * shown as "all time" on the dashboard, and the cost of a run scales with the
 * number of reels + follows, not with how often sellers open Analytics.
 *
 * retryCount + the build-then-write ordering mean a failed run leaves the last
 * good docs untouched and is retried, so the page keeps showing cached numbers
 * (flagged stale by lastUpdatedAt) rather than zeros.
 */
export const rebuildSocialStats = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Kolkata", region: REGION, retryCount: 3 },
  async () => {
    const t0 = Date.now();
    const { owners, reels, follows } = await rebuildSocialStatsOnce();
    logger.info(
      `[socialStats] rebuilt ${owners} owners from ${reels} reels + ${follows} follows in ${Date.now() - t0}ms`,
    );
  },
);
