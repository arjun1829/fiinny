import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { orderGrandTotal } from "../../../types/order";

export type SearchAppearanceStats = {
  impressions: string;
  ctr: string;
  avgPosition: string;
};

export type SeriesPoint = { label: string; value: number };

export type OrderAnalytics = {
  totalOrders: number;
  totalRevenue: number;
  revenueOverTime: SeriesPoint[];
  ordersOverTime: SeriesPoint[];
  statusCounts: Record<string, number>;
  topProducts: { name: string; quantity: number; revenue: number }[];
};

export type RetailerAnalytics = {
  totalImpressions: number;
  totalClicks: number;
  productCount: number;
  searchAppearance: SearchAppearanceStats;
  viewsOverTime: SeriesPoint[];
  callsOverTime: SeriesPoint[];
  directionRequests: SeriesPoint[];
  orders: OrderAnalytics;
  /** Lifetime follower count — see the note where it's fetched. */
  followers: number;
  /** Reel reach/engagement across the seller's own reels. */
  reelViews: number;
  reelLikes: number;
  reelComments: number;
  /** False when every query came back empty — drives the honest empty state. */
  hasAnyData: boolean;
};

type DaySeries = { key: string; label: string };

function getLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Selectable window, mirroring AnalyticsPeriod in the app
 * (mobile/lib/features/dashboard/data/store_analytics.dart) — same keys,
 * labels and day counts, so both platforms report the same number for the
 * same choice, and an analytics_digest notification's `period` maps directly.
 */
export const ANALYTICS_PERIODS = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "year", label: "Year", days: 365 },
] as const;

export type AnalyticsPeriodKey = (typeof ANALYTICS_PERIODS)[number]["key"];

export function periodDays(key: AnalyticsPeriodKey): number {
  return ANALYTICS_PERIODS.find((p) => p.key === key)?.days ?? 7;
}

/** An explicit start/end window for the Custom Date Range filter, alongside
 * the Week/Month/Year presets above — mirrors AnalyticsRange in the app
 * (mobile/lib/features/dashboard/data/store_analytics.dart). Both bounds are
 * inclusive calendar days. */
export type CustomDateRange = { start: Date; end: Date };

/**
 * The day buckets for a window, oldest first.
 *
 * Chart labels adapt to the range: a weekday name reads well across 7 points
 * but is meaningless repeated 52 times, so longer ranges switch to a date and
 * a year is bucketed by MONTH rather than by day (365 bars are unreadable and
 * would mean 365 map lookups per product).
 */
function getDaySeries(days: number): DaySeries[] {
  const today = new Date();
  const out: DaySeries[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: getLocalDayKey(d),
      label:
        days <= 7
          ? d.toLocaleDateString("en-US", { weekday: "short" })
          : d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

/** Same day-bucket shape as getDaySeries, but for an explicit start/end
 * range instead of "the last N days ending today" — backs the Custom Date
 * Range filter. */
function getDaySeriesForRange(start: Date, end: Date): DaySeries[] {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const totalDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const out: DaySeries[] = [];
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    out.push({
      key: getLocalDayKey(d),
      label:
        totalDays <= 7
          ? d.toLocaleDateString("en-US", { weekday: "short" })
          : d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

/**
 * Collapses a day series into at most [maxPoints] buckets for charting, summing
 * the values that fall in each bucket. The underlying totals are unaffected —
 * this only controls how many bars a chart draws.
 */
function bucketSeries(
  points: { label: string; value: number }[],
  maxPoints = 14,
): { label: string; value: number }[] {
  if (points.length <= maxPoints) return points;
  const size = Math.ceil(points.length / maxPoints);
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({
      // Label the bucket by its first day — the range is implied by the picker.
      label: chunk[0].label,
      value: chunk.reduce((sum, p) => sum + p.value, 0),
    });
  }
  return out;
}

/**
 * Seller analytics, aggregated from the two collections that actually hold
 * data for a seller:
 *
 * - `products` — matched via the same dual-schema owner fields the (working)
 *   inventory reads use: ownerId/retailerId hold auth UIDs, ownerPhone/
 *   retailerPhone/retailerDocId hold phone keys. The old version queried
 *   sellerId/sellerPhone/shopOwnerId, which exist on no product doc, so it
 *   found nothing. Engagement counters (impressions/clicks/…ByDay) live on
 *   these docs, written by the track* helpers in app/firebase.ts.
 * - `orders` — sellerId and sellerPhone both store the seller's phone
 *   (order_repository.dart writes sellerId as phone for legacy compat).
 *
 * The phantom `store_analytics` collection (never written, no security rule,
 * every read permission-denied) has been removed.
 */
export async function fetchRetailerAnalytics(
  retailerId: string | null,
  profile?: any,
  period: AnalyticsPeriodKey = "week",
  customRange?: CustomDateRange,
): Promise<RetailerAnalytics> {
  const days = customRange
    ? getDaySeriesForRange(customRange.start, customRange.end)
    : getDaySeries(periodDays(period));
  const dayKeys = new Set(days.map((d) => d.key));

  // ── Candidate identifiers ────────────────────────────────────────────────
  const uidCandidates = new Set<string>();
  if (retailerId) uidCandidates.add(retailerId);
  if (profile?.uid) uidCandidates.add(profile.uid);
  if (profile?.id) uidCandidates.add(profile.id);

  const phoneCandidates = new Set<string>();
  const rawPhone = String(profile?.phone ?? "").trim();
  if (rawPhone) {
    phoneCandidates.add(rawPhone);
    const stripped = rawPhone.replace("+91", "").trim();
    if (stripped) phoneCandidates.add(stripped);
    if (!rawPhone.startsWith("+")) phoneCandidates.add(`+91${rawPhone}`);
  }
  // Some accounts are keyed by phone in uid-shaped fields and vice versa —
  // querying a field with a wrong-shaped value just returns empty, never errors.
  const allCandidates = Array.from(
    new Set([...Array.from(uidCandidates), ...Array.from(phoneCandidates)]),
  );

  const errors: unknown[] = [];

  // ── Followers + reel engagement ──────────────────────────────────────────
  // Mirrors StoreAnalyticsRepository on mobile so both platforms report the
  // same figures from the same sources. Followers is a LIFETIME total, not a
  // per-period count: `follows` docs carry createdAt, but ranging over it
  // needs a composite index neither platform ships, and the running total is
  // the more useful number on screen — so it does not change with the period
  // picker, by design.
  let followers = 0;
  let reelViews = 0;
  let reelLikes = 0;
  let reelComments = 0;

  {
    // Reels and follows are keyed by the seller's PHONE (shopOwnerId /
    // followedShopId), never a uid — querying with a uid just returns empty.
    const phoneKeys = Array.from(phoneCandidates);
    const settled = await Promise.allSettled([
      ...phoneKeys.map((phone) =>
        getDocs(query(collection(db, "follows"), where("followedShopId", "==", phone))),
      ),
      ...phoneKeys.map((phone) =>
        getDocs(query(collection(db, "reels"), where("shopOwnerId", "==", phone))),
      ),
    ]);

    // A seller's phone can appear in several formats; dedupe by doc id so the
    // same follower or reel is never counted twice.
    const seenFollows = new Set<string>();
    const seenReels = new Set<string>();
    for (let i = 0; i < settled.length; i += 1) {
      const r = settled[i];
      if (r.status !== "fulfilled") {
        errors.push(r.reason);
        continue;
      }
      const isFollows = i < phoneKeys.length;
      for (const d of r.value.docs) {
        if (isFollows) {
          if (seenFollows.has(d.id)) continue;
          seenFollows.add(d.id);
          followers += 1;
        } else {
          if (seenReels.has(d.id)) continue;
          seenReels.add(d.id);
          const data = d.data() as Record<string, unknown>;
          reelViews += Number(data.viewsCount ?? 0) || 0;
          reelLikes += Number(data.likesCount ?? 0) || 0;
          reelComments += Number(data.commentsCount ?? 0) || 0;
        }
      }
    }
  }

  // ── Products: engagement counters ────────────────────────────────────────
  const viewsByDay: Record<string, number> = {};
  const callsByDay: Record<string, number> = {};
  const directionsByDay: Record<string, number> = {};
  days.forEach((d) => {
    viewsByDay[d.key] = 0;
    callsByDay[d.key] = 0;
    directionsByDay[d.key] = 0;
  });

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPositionSum = 0;

  const productFields = [
    "ownerId",
    "ownerPhone",
    "retailerId",
    "retailerPhone",
    "retailerDocId",
  ];
  const productSnaps = await Promise.all(
    productFields.flatMap((field) =>
      allCandidates.map((idVal) =>
        getDocs(query(collection(db, "products"), where(field, "==", idVal))).catch(
          (err) => {
            errors.push(err);
            console.error(`[analytics] products ${field}==${idVal} failed:`, err);
            return null;
          },
        ),
      ),
    ),
  );

  const seenProductIds = new Set<string>();
  for (const snap of productSnaps) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (seenProductIds.has(doc.id)) continue; // dedupe across field/id combos
      seenProductIds.add(doc.id);
      const data = doc.data();
      totalImpressions += Number(data.impressions || 0);
      totalClicks += Number(data.clicks || 0);
      totalPositionSum += Number(data.positionSum || 0);

      const impressionsDay = (data.impressionsByDay ?? {}) as Record<string, unknown>;
      const callsDay = (data.callsByDay ?? {}) as Record<string, unknown>;
      const directionsDay = (data.directionRequestsByDay ?? {}) as Record<string, unknown>;
      days.forEach((day) => {
        viewsByDay[day.key] += Number(impressionsDay[day.key] || 0);
        callsByDay[day.key] += Number(callsDay[day.key] || 0);
        directionsByDay[day.key] += Number(directionsDay[day.key] || 0);
      });
    }
  }

  // ── Orders: revenue and volume ───────────────────────────────────────────
  const revenueByDay: Record<string, number> = {};
  const ordersByDay: Record<string, number> = {};
  days.forEach((d) => {
    revenueByDay[d.key] = 0;
    ordersByDay[d.key] = 0;
  });

  const orderSnaps = await Promise.all(
    ["sellerPhone", "sellerId"].flatMap((field) =>
      // Real orders (especially older/web-checkout ones) store the seller's
      // Firebase Auth UID in sellerId, not a phone — phoneCandidates alone
      // never matched them, so totalOrders/totalRevenue silently read zero
      // for every seller. allCandidates (uid + phone) matches what the
      // products query above already does.
      allCandidates.map((idVal) =>
        getDocs(query(collection(db, "orders"), where(field, "==", idVal))).catch(
          (err) => {
            errors.push(err);
            console.error(`[analytics] orders ${field}==${idVal} failed:`, err);
            return null;
          },
        ),
      ),
    ),
  );

  let totalOrders = 0;
  let totalRevenue = 0;
  const statusCounts: Record<string, number> = {};
  const productAgg = new Map<string, { name: string; quantity: number; revenue: number }>();
  const seenOrderIds = new Set<string>();

  for (const snap of orderSnaps) {
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (seenOrderIds.has(doc.id)) continue;
      seenOrderIds.add(doc.id);
      const data = doc.data();
      const status = String(data.status ?? "unknown");
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      totalOrders += 1;

      const cancelled = status === "cancelled" || status === "rejected";
      // Canonical final total: web orders carry `grandTotal`, mobile orders `total`.
      // Reading only `total` silently counted every web order as ₹0 here.
      const total = orderGrandTotal(data as Parameters<typeof orderGrandTotal>[0]);
      if (!cancelled) totalRevenue += total;

      const createdAt = data.createdAt as Timestamp | undefined;
      const dayKey = createdAt?.toDate ? getLocalDayKey(createdAt.toDate()) : null;
      if (dayKey && dayKeys.has(dayKey)) {
        ordersByDay[dayKey] += 1;
        if (!cancelled) revenueByDay[dayKey] += total;
      }

      if (!cancelled && Array.isArray(data.items)) {
        for (const item of data.items) {
          const name = String(item?.name ?? "Unknown product");
          const qty = Number(item?.quantity ?? 0);
          const lineRevenue = Number(item?.price ?? 0) * qty;
          const agg = productAgg.get(name) ?? { name, quantity: 0, revenue: 0 };
          agg.quantity += qty;
          agg.revenue += lineRevenue;
          productAgg.set(name, agg);
        }
      }
    }
  }

  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Surface a real failure instead of silently rendering zeros — but only
  // when *nothing* succeeded; partial data is still worth showing.
  const everythingFailed =
    errors.length > 0 &&
    productSnaps.every((s) => s === null) &&
    orderSnaps.every((s) => s === null);
  if (everythingFailed) {
    throw errors[0];
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgPosition = totalImpressions > 0 ? totalPositionSum / totalImpressions : 0;
  const impressionsFormatted =
    totalImpressions >= 1000
      ? (totalImpressions / 1000).toFixed(1) + "k"
      : totalImpressions.toString();

  return {
    totalImpressions,
    totalClicks,
    productCount: seenProductIds.size,
    searchAppearance: {
      impressions: impressionsFormatted,
      ctr: ctr.toFixed(1) + "%",
      avgPosition: avgPosition > 0 ? avgPosition.toFixed(1) : "—",
    },
    viewsOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: viewsByDay[day.key] || 0 }))),
    callsOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: callsByDay[day.key] || 0 }))),
    directionRequests: bucketSeries(days.map((day) => ({ label: day.label, value: directionsByDay[day.key] || 0 }))),
    orders: {
      totalOrders,
      totalRevenue,
      revenueOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: revenueByDay[day.key] || 0 }))),
      ordersOverTime: bucketSeries(days.map((day) => ({ label: day.label, value: ordersByDay[day.key] || 0 }))),
      statusCounts,
      topProducts,
    },
    followers,
    reelViews,
    reelLikes,
    reelComments,
    hasAnyData:
      totalOrders > 0 ||
      totalImpressions > 0 ||
      totalClicks > 0 ||
      followers > 0 ||
      reelViews > 0,
  };
}
