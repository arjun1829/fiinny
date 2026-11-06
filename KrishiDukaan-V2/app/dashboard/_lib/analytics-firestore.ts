import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, fetchIncomingOrdersForSeller } from "../../firebase";

/** Summary doc written by rebuildSocialStats (functions/src/stats/social-stats.ts). */
const SOCIAL_STATS = "socialStats";
import { getDocsByIds } from "../../lib/firestore-by-ids";
import { normalizeOrderItems, orderGrandTotal, type OrderDoc } from "../../../types/order";
import { PAYOUT_HOLD_DAYS, type EarningsHold, type EarningsStats } from "./seller-earnings";

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
  /** Freshness of the Followers / Reel tiles, which come from the precomputed
   *  socialStats summary doc. `available` is false when no summary has been
   *  built yet (show "not available"); `stale` is true when the last rebuild is
   *  old enough to flag. Lets the page distinguish "genuinely 0" from "unknown".
   */
  socialSync: { available: boolean; stale: boolean; lastUpdatedAt: number | null };
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
 * Collapses a day series into one bucket per calendar month, summing the
 * values in each — used for the Year view (and any custom range long enough
 * that 365 daily bars would be unreadable), as the task's "monthly totals for
 * Year" calls for. Labels read "Jan", "Feb", … The underlying daily totals are
 * unchanged, so a chart's bars still sum to the matching summary metric.
 */
function monthlySeries(
  days: DaySeries[],
  valueByDay: Record<string, number>,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const idx = new Map<string, number>();
  for (const d of days) {
    const ym = d.key.slice(0, 7); // YYYY-MM
    let at = idx.get(ym);
    if (at === undefined) {
      at = out.length;
      idx.set(ym, at);
      out.push({
        label: new Date(`${d.key}T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
        value: 0,
      });
    }
    out[at].value += valueByDay[d.key] || 0;
  }
  return out;
}

/** Inclusive millisecond bounds of the day window — start of its first day to
 *  the very end of its last — so a date-range filter keeps every record on the
 *  final day instead of cutting off at that day's midnight. */
function windowBoundsOf(days: DaySeries[]): { startMs: number; endMs: number } {
  const startMs = new Date(`${days[0].key}T00:00:00.000`).getTime();
  const endMs = new Date(`${days[days.length - 1].key}T23:59:59.999`).getTime();
  return { startMs, endMs };
}

/** An order's createdAt in epoch ms — Firestore Timestamp, ISO string, or 0
 *  when there is no parseable timestamp. Mirrors orderMillis in the Orders
 *  page so both read the same instant off the same field. */
function orderMillisOf(createdAt: unknown): number {
  const ms = (createdAt as any)?.toMillis?.();
  if (typeof ms === "number") return ms;
  if (!createdAt) return 0;
  const parsed = new Date(createdAt as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Same as normalizeSellerKey in functions/src/stats/seller-stats.ts. */
function sellerKeyOf(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^\+?\d{10,12}$/.test(raw.replace(/[\s-]/g, "")) && digits.length >= 10) return `+91${digits.slice(-10)}`;
  return raw;
}

type SellerTotals = {
  earnings?: EarningsStats;
  orders?: { count?: number; revenue?: number; paid?: number; paidAmount?: number; status?: Record<string, number> };
  items?: Record<string, { name?: string; qty?: number; revenue?: number }>;
};

/**
 * The seller's order totals (all time) and per-day orders/revenue for the
 * window, from sellerStats/{key} and sellerDailyStats (kept by the
 * sellerStatsOnOrderWrite Cloud Function) for each key the seller's orders
 * may be filed under. Each order is filed under exactly one key, so the
 * keys' totals add up without double counting.
 */
async function readSellerOrderStats(keys: string[], fromKey: string, toKey: string) {
  const reads = await Promise.allSettled(keys.map(async (key) => {
    const [totals, daySnap] = await Promise.all([
      getDoc(doc(db, "sellerStats", key)),
      toKey
        ? getDocs(query(
          collection(db, "sellerDailyStats"),
          where("sellerKey", "==", key),
          where("date", ">=", fromKey),
          where("date", "<=", toKey),
        ))
        : Promise.resolve(null),
    ]);
    return { totals: (totals.exists() ? totals.data() : {}) as SellerTotals, days: daySnap?.docs.map((d) => d.data()) ?? [] };
  }));
  const ok = reads.filter((r): r is PromiseFulfilledResult<{ totals: SellerTotals; days: Record<string, any>[] }> => r.status === "fulfilled");
  return {
    results: ok.map((r) => r.value),
    errors: reads.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason),
  };
}

/** The keys a seller's orders may be filed under in sellerStats. */
function sellerKeysFor(uid: string | null, profile?: any): string[] {
  return Array.from(new Set(
    [uid, profile?.uid, profile?.id, profile?.phone].filter(Boolean).map(sellerKeyOf).filter(Boolean),
  ));
}

export type SellerOrderTotals = { count: number; paid: number; paidAmount: number; status: Record<string, number> };

/** All-time order totals for the seller's Orders page tabs and tiles (2-3 doc reads). */
export async function fetchSellerOrderTotals(uid: string | null, profile?: any): Promise<SellerOrderTotals> {
  const out: SellerOrderTotals = { count: 0, paid: 0, paidAmount: 0, status: {} };
  const { results } = await readSellerOrderStats(sellerKeysFor(uid, profile), "", "");
  for (const { totals } of results) {
    out.count += Number(totals.orders?.count ?? 0) || 0;
    out.paid += Number(totals.orders?.paid ?? 0) || 0;
    out.paidAmount += Number(totals.orders?.paidAmount ?? 0) || 0;
    for (const [k, n] of Object.entries(totals.orders?.status ?? {})) out.status[k] = (out.status[k] ?? 0) + (Number(n) || 0);
  }
  return out;
}

/**
 * The seller's earnings totals (sellerStats.earnings, summed over their keys)
 * and the hold entries of the last PAYOUT_HOLD_DAYS + 2 days — a few doc
 * reads instead of every order. Feed them to summaryFromStats.
 */
export async function fetchSellerEarningsStats(
  uid: string | null,
  profile?: any,
): Promise<{ stats: EarningsStats; holds: EarningsHold[] }> {
  const from = new Date();
  from.setDate(from.getDate() - (PAYOUT_HOLD_DAYS + 2));
  const { results, errors } = await readSellerOrderStats(sellerKeysFor(uid, profile), getLocalDayKey(from), getLocalDayKey(new Date()));
  if (results.length === 0 && errors.length > 0) throw errors[0];
  const stats: EarningsStats = {};
  const add = (a: number | undefined, b: unknown) => (a ?? 0) + (Number(b ?? 0) || 0);
  const holds: EarningsHold[] = [];
  for (const { totals, days } of results) {
    const e = totals.earnings ?? {};
    stats.orders = add(stats.orders, e.orders);
    stats.gatewayFees = add(stats.gatewayFees, e.gatewayFees);
    stats.platformFees = add(stats.platformFees, e.platformFees);
    for (const phase of ["awaiting", "delivered", "transferred", "settled"] as const) {
      const cur = stats[phase] ?? {};
      stats[phase] = {
        net: add(cur.net, e[phase]?.net),
        webNet: add(cur.webNet, e[phase]?.webNet),
        platformFee: add(cur.platformFee, e[phase]?.platformFee),
      };
    }
    for (const day of days) {
      for (const h of Object.values((day.holds ?? {}) as Record<string, any>)) {
        holds.push({
          net: Number(h?.net ?? 0) || 0,
          webNet: Number(h?.webNet ?? 0) || 0,
          deliveredAtMs: Number(h?.at ?? 0) || 0,
          releaseAtMs: Number(h?.releaseAt ?? 0) || 0,
        });
      }
    }
  }
  return { stats, holds };
}

/** Products the dashboard already loaded, so analytics doesn't read them again. */
export type LoadedProduct = { id: string } & Record<string, unknown>;

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
 * - `orders` — the live order docs, read through the SAME identity-expanded
 *   query the Orders page uses (fetchIncomingOrdersForSeller: sellerId /
 *   sellerPhone across every uid/phone form plus uidIndex), then filtered to
 *   the selected window by each order's createdAt. This replaces the old
 *   dependence on the pre-aggregated sellerStats/{key} docs, which were
 *   all-time (so the tiles ignored the period picker) and drifted below the
 *   real order count whenever the sellerStatsOnOrderWrite trigger had not
 *   recorded every order — the cause of "5 orders / ₹8,799" on this page while
 *   the Orders and Payments pages showed more. Reading the orders directly
 *   makes the tiles period-specific and reconcile with those pages by
 *   construction.
 *
 * The phantom `store_analytics` collection (never written, no security rule,
 * every read permission-denied) has been removed.
 */
export async function fetchRetailerAnalytics(
  retailerId: string | null,
  profile?: any,
  period: AnalyticsPeriodKey = "week",
  customRange?: CustomDateRange,
  /** The seller's products if the caller already has them (dashboard Home). */
  loadedProducts?: LoadedProduct[],
): Promise<RetailerAnalytics> {
  const days = customRange
    ? getDaySeriesForRange(customRange.start, customRange.end)
    : getDaySeries(periodDays(period));
  const dayKeys = new Set(days.map((d) => d.key));

  // ── Candidate identifiers ────────────────────────────────────────────────
  const phoneCandidates = new Set<string>();
  const rawPhone = String(profile?.phone ?? "").trim();
  if (rawPhone) {
    phoneCandidates.add(rawPhone);
    const stripped = rawPhone.replace("+91", "").trim();
    if (stripped) phoneCandidates.add(stripped);
    if (!rawPhone.startsWith("+")) phoneCandidates.add(`+91${rawPhone}`);
  }
  const errors: unknown[] = [];

  // ── Followers + reel engagement ──────────────────────────────────────────
  // Followers and reel views/likes/comments come from the precomputed
  // socialStats/{phone} summary doc (rebuilt daily by rebuildSocialStats in
  // functions/src/stats/social-stats.ts) — ONE document read, instead of the
  // count()/sum() aggregation queries this page used to fire on every open.
  // They are LIFETIME totals, not per-period counts, so they do not respond to
  // the period picker, by design (the underlying follows/reels carry no
  // per-day breakdown here). The doc is keyed by the seller's normalised phone;
  // reels (shopOwnerId) and follows (followedShopId) are phone-keyed, never a
  // uid, so a uid alone never resolves one.
  let followers = 0;
  let reelViews = 0;
  let reelLikes = 0;
  let reelComments = 0;
  let socialAvailable = false;
  let socialLastUpdatedAt: number | null = null;

  {
    // The phone may be missing from `profile` (users/{phone} keeps the phone as
    // the doc id, which getUserProfile drops), which is exactly why the old
    // live queries returned 0 for many sellers. Fall back to uidIndex/{uid} —
    // the canonical uid→phone map, same as the Orders page — before giving up.
    if (phoneCandidates.size === 0 && retailerId) {
      try {
        const idx = await getDoc(doc(db, "uidIndex", retailerId));
        const p = String(idx.data()?.phone ?? "").trim();
        if (p) {
          phoneCandidates.add(p);
          const stripped = p.replace("+91", "").trim();
          if (stripped) phoneCandidates.add(stripped);
          if (!p.startsWith("+")) phoneCandidates.add(`+91${p}`);
        }
      } catch (err) {
        errors.push(err);
      }
    }

    // Normalise to the same key the Cloud Function writes under; usually one.
    const socialKeys = Array.from(new Set(
      Array.from(phoneCandidates).map(sellerKeyOf).filter(Boolean),
    ));
    const settled = await Promise.allSettled(
      socialKeys.map((key) => getDoc(doc(db, SOCIAL_STATS, key))),
    );
    for (const r of settled) {
      if (r.status === "rejected") { errors.push(r.reason); continue; }
      const snap = r.value;
      if (!snap.exists()) continue;
      const d = snap.data() ?? {};
      socialAvailable = true;
      followers += Number(d.followers ?? 0) || 0;
      reelViews += Number(d.reelViews ?? 0) || 0;
      reelLikes += Number(d.reelLikes ?? 0) || 0;
      reelComments += Number(d.reelComments ?? 0) || 0;
      const ts = (d.lastUpdatedAt as any)?.toMillis?.() ?? null;
      if (ts && (socialLastUpdatedAt === null || ts > socialLastUpdatedAt)) {
        socialLastUpdatedAt = ts;
      }
    }
  }
  // Flag the tiles as stale once the last rebuild is older than two daily
  // cycles — cached numbers still show, just marked, rather than vanishing.
  const SOCIAL_STALE_MS = 48 * 60 * 60 * 1000;
  const socialStale =
    socialAvailable &&
    socialLastUpdatedAt !== null &&
    Date.now() - socialLastUpdatedAt > SOCIAL_STALE_MS;

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

  // The seller's products: the ones the caller loaded, else the same owner
  // fields the dashboard's product lists read (fetchRetailerProducts /
  // fetchManufacturerProducts), queried here directly so an admin or team
  // member viewing the dashboard doesn't need the seller's uidIndex entry.
  let productsFailed = false;
  let products: LoadedProduct[] = loadedProducts ?? [];
  if (!loadedProducts) {
    const productsCol = collection(db, "products");
    const isManufacturer = profile?.role === "manufacturer";
    const phones = Array.from(phoneCandidates);
    const queries = [
      ...(retailerId && isManufacturer
        ? [
          query(productsCol, where("ownerId", "==", retailerId), where("ownerType", "==", "manufacturer")),
          query(productsCol, where("manufacturerId", "==", retailerId), where("ownerType", "==", "manufacturer")),
        ]
        : []),
      ...(retailerId && !isManufacturer
        ? [
          query(productsCol, where("retailerId", "==", retailerId)),
          query(productsCol, where("ownerId", "==", retailerId)),
        ]
        : []),
      ...(!isManufacturer
        ? phones.flatMap((phone) => [
          query(productsCol, where("retailerPhone", "==", phone)),
          query(productsCol, where("ownerPhone", "==", phone)),
        ])
        : []),
    ];
    const snaps = await Promise.all(queries.map((q) => getDocs(q).catch((err) => {
      errors.push(err);
      return null;
    })));
    productsFailed = snaps.length > 0 && snaps.every((snap) => snap === null);
    const byId = new Map<string, LoadedProduct>();
    for (const snap of snaps) {
      for (const d of snap?.docs ?? []) {
        if (d.data().isActive === false) continue;
        byId.set(d.id, { id: d.id, ...d.data() });
      }
    }
    products = Array.from(byId.values());
  }

  const addCounters = (data: Record<string, unknown>) => {
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
  };

  const seenProductIds = new Set<string>();
  for (const p of products) {
    if (seenProductIds.has(p.id)) continue;
    seenProductIds.add(p.id);
    // Legacy counters still written by older app versions.
    addCounters(p);
  }

  // Current counters live in productStats/{id}, 30 per query in parallel.
  const stats = await getDocsByIds(db, "productStats", seenProductIds).catch((err) => {
    errors.push(err);
    console.error("[analytics] productStats read failed:", err);
    return new Map<string, Record<string, unknown>>();
  });
  stats.forEach((data) => addCounters(data));

  // ── Orders: revenue and volume ───────────────────────────────────────────
  // Read the live order docs the same way the Orders page does, then filter to
  // the window by createdAt and compute every order metric here — so the tiles
  // are period-specific and reconcile with the Orders / Payments pages instead
  // of trusting the sellerStats aggregate, which was all-time and could lag the
  // real order count.
  const revenueByDay: Record<string, number> = {};
  const ordersByDay: Record<string, number> = {};
  days.forEach((d) => {
    revenueByDay[d.key] = 0;
    ordersByDay[d.key] = 0;
  });
  const { startMs, endMs } = windowBoundsOf(days);

  // fetchIncomingOrdersForSeller needs a seller id string; fall back to the
  // profile's own identifiers when the caller has no uid (admin view of a
  // uid-less account), exactly like the Orders page's identity seeding.
  const sellerId = String(retailerId ?? profile?.uid ?? profile?.id ?? profile?.phone ?? "").trim();
  const sellerType = profile?.role === "manufacturer" ? "manufacturer" : "retailer";
  let orders: OrderDoc[] = [];
  let ordersFailed = false;
  if (sellerId) {
    try {
      orders = await fetchIncomingOrdersForSeller(sellerId, sellerType, profile);
    } catch (err) {
      ordersFailed = true;
      errors.push(err);
      console.error("[analytics] orders read failed:", err);
    }
  }

  let totalOrders = 0;
  let totalRevenue = 0;
  const statusCounts: Record<string, number> = {};
  const productAgg = new Map<string, { name: string; quantity: number; revenue: number }>();
  // fetchIncomingOrdersForSeller already de-dupes by doc id (Map keyed by id),
  // so each order is seen once no matter how many identity queries matched it.
  for (const order of orders) {
    const ms = orderMillisOf(order.createdAt);
    // An order with no parseable createdAt can't be placed in any day window.
    if (ms < startMs || ms > endMs) continue;

    const status = String(order.status ?? "unknown");
    // Same business rule as the seller model and the Orders page: the order
    // COUNT includes every status (cancelled/rejected show on the Orders page
    // too), but REVENUE and products-sold leave out cancelled and rejected.
    const cancelled = status === "cancelled" || status === "rejected";
    totalOrders += 1;
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    const dayKey = getLocalDayKey(new Date(ms));
    if (dayKeys.has(dayKey)) ordersByDay[dayKey] += 1;

    if (cancelled) continue;

    // Revenue is the order's grand total net of any refund (full or partial),
    // so refunded money is not counted as earned. COD/unpaid orders still count
    // toward revenue (gross merchandise value) — the same scope the "Revenue"
    // tile has always meant, and the documented difference from the Payments
    // page's "Total Collected" (paid-online only).
    const refunded = Number(order.payment?.refundedAmount ?? 0) || 0;
    const net = Math.max(0, orderGrandTotal(order) - refunded);
    totalRevenue += net;
    if (dayKeys.has(dayKey)) revenueByDay[dayKey] += net;

    for (const item of normalizeOrderItems(order.items as any)) {
      const name = item.name || "Unknown product";
      const agg = productAgg.get(name) ?? { name, quantity: 0, revenue: 0 };
      agg.quantity += Number(item.qty ?? 0) || 0;
      agg.revenue += Number(item.lineTotal ?? 0) || 0;
      productAgg.set(name, agg);
    }
  }

  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Surface a real failure instead of silently rendering zeros — but only
  // when *nothing* succeeded; partial data is still worth showing.
  const everythingFailed =
    errors.length > 0 &&
    productsFailed &&
    ordersFailed;
  if (everythingFailed) {
    throw errors[0];
  }

  // Year (and any custom range too long for daily bars) is aggregated by month;
  // shorter windows stay daily, capped by bucketSeries. The same shaping drives
  // the engagement charts below, so every chart on the page groups alike.
  const useMonthly = customRange ? days.length > 92 : period === "year";
  const chartSeries = (valueByDay: Record<string, number>): SeriesPoint[] =>
    useMonthly
      ? monthlySeries(days, valueByDay)
      : bucketSeries(days.map((day) => ({ label: day.label, value: valueByDay[day.key] || 0 })));

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
    viewsOverTime: chartSeries(viewsByDay),
    callsOverTime: chartSeries(callsByDay),
    directionRequests: chartSeries(directionsByDay),
    orders: {
      totalOrders,
      totalRevenue,
      revenueOverTime: chartSeries(revenueByDay),
      ordersOverTime: chartSeries(ordersByDay),
      statusCounts,
      topProducts,
    },
    followers,
    reelViews,
    reelLikes,
    reelComments,
    socialSync: {
      available: socialAvailable,
      stale: socialStale,
      lastUpdatedAt: socialLastUpdatedAt,
    },
    hasAnyData:
      totalOrders > 0 ||
      totalImpressions > 0 ||
      totalClicks > 0 ||
      followers > 0 ||
      reelViews > 0,
  };
}
