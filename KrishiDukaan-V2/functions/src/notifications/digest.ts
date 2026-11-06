import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { notify } from "../notify";

const db = (): admin.firestore.Firestore => admin.firestore();

export type DigestPeriod = "week" | "month" | "year";

/** Roles that own a store and therefore have store analytics worth sending. */
const SELLER_ROLES = ["retailer", "manufacturer"];

/** `YYYY-MM-DD`, the key shape used by every `*ByDay` map on a product doc. */
function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Every day key in [start, end), oldest first. */
function dayKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start);
  while (cur < end) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

/** Sums a `{ "YYYY-MM-DD": n }` counter map over the given day keys. */
function sumByDay(map: unknown, keys: string[]): number {
  if (!map || typeof map !== "object") return 0;
  const m = map as Record<string, unknown>;
  let total = 0;
  for (const k of keys) {
    const v = m[k];
    if (typeof v === "number") total += v;
  }
  return total;
}

export interface DigestStats {
  storeViews: number;
  productViews: number;
  productClicks: number;
  calls: number;
  directions: number;
  newFollowers: number;
  likes: number;
  comments: number;
  reposts: number;
}

function isEmpty(s: DigestStats): boolean {
  return Object.values(s).every((v) => v === 0);
}

function addProductCounters(stats: DigestStats, d: admin.firestore.DocumentData, keys: string[]): void {
  stats.productViews += sumByDay(d.impressionsByDay, keys);
  stats.productClicks += sumByDay(d.clicksByDay, keys);
  stats.calls += sumByDay(d.callsByDay, keys);
  stats.directions += sumByDay(d.directionRequestsByDay, keys);
}

/**
 * Collects one seller's activity for [start, end).
 *
 * Product counters come from the `*ByDay` maps the app and web already bump
 * (impressions/clicks/calls/directionRequests — see _trackProductEvent in the
 * mobile product detail screen and trackProductClick in app/firebase.ts).
 * Social counts come from `engagement_buffer`, which retains flushed events
 * well past a year for exactly this reason.
 */
export async function collectStats(
  sellerPhone: string,
  start: Date,
  end: Date
): Promise<DigestStats> {
  const keys = dayKeysBetween(start, end);
  const stats: DigestStats = {
    storeViews: 0,
    productViews: 0,
    productClicks: 0,
    calls: 0,
    directions: 0,
    newFollowers: 0,
    likes: 0,
    comments: 0,
    reposts: 0,
  };

  // ── Product counters (dual-field owner query, deduplicated) ──────────────
  const seen = new Set<string>();
  for (const field of ["retailerPhone", "ownerPhone"]) {
    try {
      const snap = await db()
        .collection("products")
        .where(field, "==", sellerPhone)
        .get();
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        // Legacy counters still written by older app versions.
        addProductCounters(stats, doc.data(), keys);
      }
    } catch (err) {
      logger.error(`[digest] product query failed (${field})`, err);
    }
  }

  // Counters written since they moved off the product doc.
  const productIds = Array.from(seen);
  for (let i = 0; i < productIds.length; i += 100) {
    try {
      const refs = productIds.slice(i, i + 100).map((id) => db().collection("productStats").doc(id));
      for (const statDoc of await db().getAll(...refs)) {
        if (statDoc.exists) addProductCounters(stats, statDoc.data() ?? {}, keys);
      }
    } catch (err) {
      logger.error("[digest] productStats read failed", err);
    }
  }

  // ── Store profile views (bumped by the app's shop profile screen) ────────
  // storeStats/{phone} holds current views; the retailer doc holds the legacy
  // ones from older app versions.
  try {
    const [retailer, storeStats] = await db().getAll(
      db().collection("retailers").doc(sellerPhone),
      db().collection("storeStats").doc(sellerPhone),
    );
    stats.storeViews =
      sumByDay(retailer.data()?.storeViewsByDay, keys) +
      sumByDay(storeStats.data()?.storeViewsByDay, keys);
  } catch (err) {
    logger.error("[digest] store view read failed", err);
  }

  // ── Social engagement ────────────────────────────────────────────────────
  try {
    const snap = await db()
      .collection("engagement_buffer")
      .where("ownerPhone", "==", sellerPhone)
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(start))
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(end))
      .get();
    for (const doc of snap.docs) {
      switch (String(doc.data().kind ?? "")) {
        case "like":
          stats.likes++;
          break;
        case "comment":
          stats.comments++;
          break;
        case "follow":
          stats.newFollowers++;
          break;
        case "repost":
          stats.reposts++;
          break;
      }
    }
  } catch (err) {
    logger.error("[digest] engagement query failed", err);
  }

  return stats;
}

const PERIOD_LABEL: Record<DigestPeriod, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

/** Picks the few numbers worth putting in a push body. */
export function digestBody(stats: DigestStats, period: DigestPeriod): string {
  const parts: string[] = [];
  if (stats.storeViews > 0) parts.push(`${stats.storeViews} store views`);
  if (stats.productViews > 0) parts.push(`${stats.productViews} product views`);
  if (stats.newFollowers > 0) parts.push(`${stats.newFollowers} new followers`);
  const interactions = stats.likes + stats.comments + stats.reposts;
  if (interactions > 0) parts.push(`${interactions} interactions`);
  if (stats.calls > 0) parts.push(`${stats.calls} calls`);
  if (parts.length === 0) return `${PERIOD_LABEL[period]}: tap to see your store activity.`;
  return `${PERIOD_LABEL[period]}: ${parts.join(", ")}. Tap for the full breakdown.`;
}

const PERIOD_TITLE: Record<DigestPeriod, string> = {
  week: "Your weekly store report 📊",
  month: "Your monthly store report 📈",
  year: "Your yearly store report 🏆",
};

/** Start of the window ending at [end] for the given period. */
function windowStart(end: Date, period: DigestPeriod): Date {
  const start = new Date(end);
  if (period === "week") start.setDate(start.getDate() - 7);
  else if (period === "month") start.setMonth(start.getMonth() - 1);
  else start.setFullYear(start.getFullYear() - 1);
  return start;
}

async function sendDigest(period: DigestPeriod, end: Date): Promise<number> {
  const start = windowStart(end, period);
  let sent = 0;

  for (const role of SELLER_ROLES) {
    const snap = await db().collection("users").where("role", "==", role).get();
    for (const doc of snap.docs) {
      const phone = String(doc.data().phone ?? doc.id).trim();
      if (!phone) continue;
      try {
        const stats = await collectStats(phone, start, end);
        // Nothing happened at all — a report of zeroes is just noise.
        if (isEmpty(stats)) continue;
        await notify(
          phone,
          "analytics_digest",
          PERIOD_TITLE[period],
          digestBody(stats, period),
          { period }
        );
        sent++;
      } catch (err) {
        logger.error(`[digest] failed for ${phone}`, err);
      }
    }
  }
  return sent;
}

/**
 * Runs daily and sends whichever digests are due: weekly every Monday,
 * monthly on the 1st, yearly on 1 January. All three can fire on the same
 * morning, which is intended — they cover different windows.
 */
export const sendStoreAnalyticsDigest = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
    // Anchor every window to midnight so a run counts whole days only.
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const due: DigestPeriod[] = [];
    if (end.getDay() === 1) due.push("week");
    if (end.getDate() === 1) due.push("month");
    if (end.getDate() === 1 && end.getMonth() === 0) due.push("year");

    if (due.length === 0) {
      logger.info("[digest] nothing due today");
      return;
    }

    for (const period of due) {
      const sent = await sendDigest(period, end);
      logger.info(`[digest] ${period}: sent ${sent}`);
    }
  }
);
