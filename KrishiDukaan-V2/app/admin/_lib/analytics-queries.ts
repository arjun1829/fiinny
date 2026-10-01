"use client";

/**
 * Phase-1 admin analytics data access.
 *
 * Design rules (see the analytics audit):
 *  - NEVER scan a whole collection just to count/sum. Use Firestore aggregation
 *    queries (`getCountFromServer`, `getAggregateFromServer` with `sum`).
 *  - For time-series / range metrics read only the documents inside the selected
 *    date window (a bounded `createdAt` range query), then bucket in memory.
 *  - Reuse existing single-field indexes and the one existing composite
 *    (`subscriptions: subscriptionStatus + expiryDate`). No new indexes are added.
 *
 * Nothing here uses a real-time listener; every function is a one-shot read the
 * caller can cache via the existing admin cache / snapshot layer.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  getCountFromServer,
  getAggregateFromServer,
  getDocs,
  sum,
} from "firebase/firestore";
import { db } from "../../firebase";
import { orderGrandTotal } from "../../../types/order";
import { getProducts } from "./admin-data";
import { countMarketplaceProducts } from "./marketplace-count";

export type DateRange = { from: Date; to: Date };

/** Local YYYY-MM-DD key, matching the site-visit / engagement day bucketing. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Inclusive list of day keys spanning [from, to] — the x-axis for every chart. */
export function dayKeysInRange({ from, to }: DateRange): string[] {
  const keys: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  // Guard against an inverted or absurd range producing an unbounded loop.
  let guard = 0;
  while (cur <= end && guard < 1000) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return keys;
}

/** Half-open range constraints on `createdAt`, so a doc is counted in exactly one bucket. */
function createdAtRange(field: string, { from, to }: DateRange) {
  return [
    where(field, ">=", Timestamp.fromDate(from)),
    where(field, "<=", Timestamp.fromDate(to)),
  ];
}

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserCounts = {
  all: number;
  retailer: number;
  manufacturer: number;
  admin: number;
  customer: number;
};

/**
 * All-time user totals + role split, entirely from aggregation `count()` — a few
 * reads regardless of table size. "Customer" has no role value of its own
 * (missing role OR role === 'customer'), so it is the remainder, exactly as the
 * existing `fetchUserRoleCounts` derives it.
 */
export async function getUserCounts(): Promise<UserCounts> {
  const users = collection(db, "users");
  const [all, retailer, manufacturer, admin] = await Promise.all([
    getCountFromServer(users),
    getCountFromServer(query(users, where("role", "==", "retailer"))),
    getCountFromServer(query(users, where("role", "==", "manufacturer"))),
    getCountFromServer(query(users, where("role", "==", "admin"))),
  ]);
  const allCount = all.data().count;
  const retailerCount = retailer.data().count;
  const manufacturerCount = manufacturer.data().count;
  const adminCount = admin.data().count;
  return {
    all: allCount,
    retailer: retailerCount,
    manufacturer: manufacturerCount,
    admin: adminCount,
    customer: Math.max(0, allCount - retailerCount - manufacturerCount - adminCount),
  };
}

/** New-user count in a window — one aggregation read, no documents fetched. */
export async function countNewUsers(range: DateRange): Promise<number> {
  const snap = await getCountFromServer(
    query(collection(db, "users"), ...createdAtRange("createdAt", range)),
  );
  return snap.data().count;
}

export type RoleBucket = "retailer" | "manufacturer" | "customer";
export type NewUsersSeries = {
  total: number;
  byRole: Record<RoleBucket, number>;
  /** Per-day counts stacked by role, ordered by the range's day keys. */
  perDay: { date: string; retailer: number; manufacturer: number; customer: number }[];
};

const ROLE_BUCKET = (role: unknown): RoleBucket =>
  role === "retailer" ? "retailer" : role === "manufacturer" ? "manufacturer" : "customer";

/**
 * New registrations over time, broken down by role. This reads only the user
 * docs created inside the window (a bounded range query) — the one place a role
 * breakdown forces per-doc reads, because Firestore cannot `count()` the
 * "customer = missing role" case. Admins are folded out of the chart (kept only
 * in the all-time totals) so the three business roles read cleanly.
 */
export async function getNewUsersSeries(range: DateRange): Promise<NewUsersSeries> {
  const snap = await getDocs(
    query(collection(db, "users"), ...createdAtRange("createdAt", range), orderBy("createdAt", "asc")),
  );

  const perDayMap = new Map<string, { retailer: number; manufacturer: number; customer: number }>();
  for (const k of dayKeysInRange(range)) perDayMap.set(k, { retailer: 0, manufacturer: 0, customer: 0 });

  const byRole: Record<RoleBucket, number> = { retailer: 0, manufacturer: 0, customer: 0 };
  let total = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (data.role === "admin") continue; // internal accounts are not "growth"
    const bucket = ROLE_BUCKET(data.role);
    const ts = data.createdAt as Timestamp | undefined;
    const key = ts?.toDate ? dayKey(ts.toDate()) : null;
    byRole[bucket] += 1;
    total += 1;
    if (key && perDayMap.has(key)) perDayMap.get(key)![bucket] += 1;
  }

  return {
    total,
    byRole,
    perDay: dayKeysInRange(range).map((date) => ({ date, ...perDayMap.get(date)! })),
  };
}

// ─── Platform totals ───────────────────────────────────────────────────────────

/**
 * Unique product count matching what buyers see in the marketplace.
 *
 * Uses countMarketplaceProducts() — the single source of truth that mirrors
 * fetchMarketplaceProducts exactly: canonical products (name + image + price,
 * not a per-seller copy) deduplicated by name, plus retailer-only "promoted
 * copies" whose name has no canonical match. This is why the number agrees
 * with the market rather than being lower (canonical-only) or higher (raw docs).
 */
export async function getUniqueProductCount(): Promise<number> {
  const products = await getProducts();
  return countMarketplaceProducts(products as Parameters<typeof countMarketplaceProducts>[0]).total;
}

export type PlatformCounts = {
  totalProducts: number;
  totalOrders: number;
  activeSubscriptions: number;
};

/** All-time platform counts, aggregation only. */
export async function getPlatformCounts(): Promise<PlatformCounts> {
  const [totalProducts, orders, activeSubs] = await Promise.all([
    getUniqueProductCount(),
    getCountFromServer(collection(db, "orders")),
    getCountFromServer(query(collection(db, "subscriptions"), where("subscriptionStatus", "==", "active"))),
  ]);
  return {
    totalProducts,
    totalOrders: orders.data().count,
    activeSubscriptions: activeSubs.data().count,
  };
}

/**
 * GMV (total monetary value of orders placed) for a window.
 *
 * Both paths use orderGrandTotal() (grandTotal ?? total ?? subtotal+delivery+gst)
 * so All Time and the bounded ranges use the same field-fallback logic and agree.
 * The earlier All Time path used sum("grandTotal") aggregation, which silently
 * dropped pre-canonical-fix orders that only carry "total" — those orders were
 * included in bounded windows (which read docs) but excluded from All Time,
 * making All Time lower than the sum of all bounded periods.
 *
 *  - All Time (from ≤ epoch): full orders collection scan, no range filter.
 *  - Bounded range: bounded createdAt doc read, only docs in the window.
 *
 * A sum() aggregation with a createdAt range filter requires a composite index
 * (createdAt + grandTotal) which we don't have; that is why we read docs rather
 * than aggregate for bounded ranges, and why All Time does the same.
 */
export async function getGmvSum(range: DateRange): Promise<number> {
  const snap = await getDocs(
    range.from.getTime() <= 0
      ? collection(db, "orders")
      : query(collection(db, "orders"), ...createdAtRange("createdAt", range), orderBy("createdAt", "asc")),
  );
  let gmv = 0;
  for (const d of snap.docs) {
    gmv += orderGrandTotal(d.data() as unknown as Parameters<typeof orderGrandTotal>[0]);
  }
  return gmv;
}

// ─── Orders ────────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  "placed",
  "accepted",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "rejected",
] as const;
export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

export type OrderMetrics = {
  count: number;
  gmv: number;
  aov: number;
  platformFee: number;
  byStatus: Record<string, number>;
  deliveredRate: number;
  rejectionRate: number;
  perDay: { date: string; orders: number; gmv: number }[];
};

/**
 * Order economics for a window. Reads only the orders created inside the range
 * (bounded query) so GMV can be summed with the canonical-total fallback
 * (`orderGrandTotal` = grandTotal ?? total ?? subtotal+delivery+gst) — a plain
 * `sum('grandTotal')` aggregation would silently drop mobile/legacy orders that
 * only carry `total`.
 */
export async function getOrderMetrics(range: DateRange): Promise<OrderMetrics> {
  const snap = await getDocs(
    query(collection(db, "orders"), ...createdAtRange("createdAt", range), orderBy("createdAt", "asc")),
  );

  const perDayMap = new Map<string, { orders: number; gmv: number }>();
  for (const k of dayKeysInRange(range)) perDayMap.set(k, { orders: 0, gmv: 0 });

  const byStatus: Record<string, number> = {};
  for (const s of ORDER_STATUSES) byStatus[s] = 0;

  let count = 0;
  let gmv = 0;
  let platformFee = 0;

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const total = orderGrandTotal(data as unknown as Parameters<typeof orderGrandTotal>[0]);
    const status = String(data.status ?? "unknown");

    count += 1;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const fee = (data.payment as { platformFee?: number } | undefined)?.platformFee;
    if (typeof fee === "number") platformFee += fee;

    // GMV = total value of orders placed (gross of rejections), matching the
    // Overview's sum() aggregation so the two never disagree. Rejection is
    // surfaced separately via rejectionRate.
    gmv += total;

    const ts = data.createdAt as Timestamp | undefined;
    const key = ts?.toDate ? dayKey(ts.toDate()) : null;
    if (key && perDayMap.has(key)) {
      const bucket = perDayMap.get(key)!;
      bucket.orders += 1;
      bucket.gmv += total;
    }
  }

  const delivered = byStatus["delivered"] ?? 0;
  const rejected = byStatus["rejected"] ?? 0;

  return {
    count,
    gmv,
    // AOV = gross GMV over every order placed, consistent with the GMV definition.
    aov: count > 0 ? gmv / count : 0,
    platformFee,
    byStatus,
    deliveredRate: count > 0 ? delivered / count : 0,
    rejectionRate: count > 0 ? rejected / count : 0,
    perDay: dayKeysInRange(range).map((date) => ({ date, ...perDayMap.get(date)! })),
  };
}

// ─── Subscriptions / revenue ────────────────────────────────────────────────────

export type SubscriptionRevenue = {
  totalRevenue: number;
  paidRevenue: number;
  manualRevenue: number;
  newSubscriptions: number;
  /** Repeat subscriptions by the same owner *within the window* (see caveat in report). */
  renewalsInRange: number;
  seatsPurchasedInRange: number;
  /** Revenue per day, split so the chart can stack paid (gateway) vs manual (admin). */
  perDay: { date: string; paid: number; manual: number }[];
};

/**
 * Subscription revenue for a window, split paid (gateway) vs manual (admin)
 * using the existing `activatedByAdmin` flag — no new classification. Bounded
 * read on `createdAt`, so cost scales with subscriptions sold in the window.
 */
export async function getSubscriptionRevenue(range: DateRange): Promise<SubscriptionRevenue> {
  const snap = await getDocs(
    query(collection(db, "subscriptions"), ...createdAtRange("createdAt", range), orderBy("createdAt", "asc")),
  );

  const perDayMap = new Map<string, { paid: number; manual: number }>();
  for (const k of dayKeysInRange(range)) perDayMap.set(k, { paid: 0, manual: 0 });

  let totalRevenue = 0;
  let paidRevenue = 0;
  let manualRevenue = 0;
  let seatsPurchasedInRange = 0;
  const ownerSeen = new Map<string, number>();

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const amount = Number(data.amountPaid ?? 0) || 0;
    const isManual = data.activatedByAdmin === true;
    totalRevenue += amount;
    if (isManual) manualRevenue += amount;
    else paidRevenue += amount;
    seatsPurchasedInRange += Number(data.seatsPurchased ?? 0) || 0;

    const owner = String(data.ownerPhone ?? data.ownerId ?? "");
    if (owner) ownerSeen.set(owner, (ownerSeen.get(owner) ?? 0) + 1);

    const ts = data.createdAt as Timestamp | undefined;
    const key = ts?.toDate ? dayKey(ts.toDate()) : null;
    if (key && perDayMap.has(key)) {
      const bucket = perDayMap.get(key)!;
      if (isManual) bucket.manual += amount;
      else bucket.paid += amount;
    }
  }

  // A renewal (within the window) is any subscription beyond an owner's first.
  let renewalsInRange = 0;
  for (const n of Array.from(ownerSeen.values())) if (n > 1) renewalsInRange += n - 1;

  return {
    totalRevenue,
    paidRevenue,
    manualRevenue,
    newSubscriptions: snap.size,
    renewalsInRange,
    seatsPurchasedInRange,
    perDay: dayKeysInRange(range).map((date) => ({ date, ...perDayMap.get(date)! })),
  };
}

export type SubscriptionStatusCounts = {
  active: number;
  expired: number;
  expiringSoon: number;
};

/**
 * Live subscription health, aggregation only. `expiringSoon` uses the existing
 * `subscriptionStatus + expiryDate` composite index.
 */
export async function getSubscriptionStatusCounts(): Promise<SubscriptionStatusCounts> {
  const subs = collection(db, "subscriptions");
  const now = Timestamp.now();
  const in30 = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [active, expired, expiring] = await Promise.all([
    getCountFromServer(query(subs, where("subscriptionStatus", "==", "active"))),
    getCountFromServer(query(subs, where("subscriptionStatus", "==", "expired"))),
    getCountFromServer(
      query(
        subs,
        where("subscriptionStatus", "==", "active"),
        where("expiryDate", ">=", now),
        where("expiryDate", "<=", in30),
      ),
    ),
  ]);
  return {
    active: active.data().count,
    expired: expired.data().count,
    expiringSoon: expiring.data().count,
  };
}

export type SeatMetrics = { seatsPurchased: number; seatsUsed: number; seatsVacant: number };

/**
 * Seats owned vs. consumed. `seatsPurchased` is the sum of `users.totalSeats`
 * (one aggregation read); `seatsUsed` is the count of active seat listings
 * (each consumes one seat). Vacant = the difference.
 */
export async function getSeatMetrics(): Promise<SeatMetrics> {
  const [seatsAgg, usedSnap] = await Promise.all([
    getAggregateFromServer(collection(db, "users"), { seats: sum("totalSeats") }),
    getCountFromServer(query(collection(db, "retailerSeatListings"), where("status", "==", "active"))),
  ]);
  const seatsPurchased = Number(seatsAgg.data().seats ?? 0);
  const seatsUsed = usedSnap.data().count;
  return { seatsPurchased, seatsUsed, seatsVacant: Math.max(0, seatsPurchased - seatsUsed) };
}

// ─── Products & engagement ──────────────────────────────────────────────────────

export type ProductMetrics = {
  totalProducts: number;
  addedInRange: number;
  impressions: number;
  clicks: number;
  calls: number;
  directionRequests: number;
  perDay: { date: string; added: number }[];
};

/**
 * Product totals + engagement. Counts and engagement sums come from aggregation
 * (`count`, `sum`) — no full scan. The per-day "added" series is a bounded
 * `createdAt` range read.
 *
 * Caveat: the engagement sums span the whole `products` collection including the
 * per-retailer inventory copies. Those copies never receive impressions/clicks
 * (tracking writes only to the canonical marketplace doc), so their contribution
 * is ~0 — accepted for Phase 1 in exchange for avoiding a full-collection scan.
 *
 * Each engagement field is summed in its OWN aggregation call: combining several
 * `sum()`s in one query would demand a composite index spanning all of them,
 * whereas single-field sums use only the automatic per-field indexes.
 */
export async function getProductMetrics(range: DateRange): Promise<ProductMetrics> {
  const products = collection(db, "products");
  const sumField = (field: string) => getAggregateFromServer(products, { v: sum(field) });
  const [total, added, impressions, clicks, calls, directionRequests, addedDocs] = await Promise.all([
    getUniqueProductCount(),
    getCountFromServer(query(products, ...createdAtRange("createdAt", range))),
    sumField("impressions"),
    sumField("clicks"),
    sumField("calls"),
    sumField("directionRequests"),
    getDocs(query(products, ...createdAtRange("createdAt", range), orderBy("createdAt", "asc"))),
  ]);

  const perDayMap = new Map<string, number>();
  for (const k of dayKeysInRange(range)) perDayMap.set(k, 0);
  for (const d of addedDocs.docs) {
    const ts = d.data().createdAt as Timestamp | undefined;
    const key = ts?.toDate ? dayKey(ts.toDate()) : null;
    if (key && perDayMap.has(key)) perDayMap.set(key, perDayMap.get(key)! + 1);
  }

  return {
    totalProducts: total,
    addedInRange: added.data().count,
    impressions: Number(impressions.data().v ?? 0),
    clicks: Number(clicks.data().v ?? 0),
    calls: Number(calls.data().v ?? 0),
    directionRequests: Number(directionRequests.data().v ?? 0),
    perDay: dayKeysInRange(range).map((date) => ({ date, added: perDayMap.get(date)! })),
  };
}

// ─── Network ────────────────────────────────────────────────────────────────────

export type NetworkMetrics = {
  totalLinks: number;
  activeLinks: number;
  activeRetailers: number;
  activeManufacturers: number;
};

/**
 * Manufacturer→retailer network size + active-account counts, aggregation only.
 * Growth-over-time is intentionally omitted (see report): `manufacturerRetailers`
 * has no reliably-populated creation timestamp to bucket on.
 */
export async function getNetworkMetrics(counts: UserCounts): Promise<NetworkMetrics> {
  const links = collection(db, "manufacturerRetailers");
  const [total, active] = await Promise.all([
    getCountFromServer(links),
    getCountFromServer(query(links, where("status", "==", "active"))),
  ]);
  return {
    totalLinks: total.data().count,
    activeLinks: active.data().count,
    activeRetailers: counts.retailer,
    activeManufacturers: counts.manufacturer,
  };
}

// ─── Payment funnel ─────────────────────────────────────────────────────────────

/** Same 30-minute abandonment window the admin Payments page uses. */
const ABANDON_AFTER_MS = 30 * 60 * 1000;

export type PaymentFunnel = {
  attempts: number;
  paid: number;
  failed: number;
  abandoned: number;
  conversionRate: number;
  lostValue: number;
};

/**
 * Checkout funnel for a window from `paymentAttempts` (bounded `createdAt` read).
 * Buckets mirror the existing Payments page: paid / failed / abandoned (a stale
 * 'created' attempt). Lost value = amount on FAILED attempts only.
 */
export async function getPaymentFunnel(range: DateRange): Promise<PaymentFunnel> {
  const snap = await getDocs(
    query(collection(db, "paymentAttempts"), ...createdAtRange("createdAt", range), orderBy("createdAt", "asc")),
  );

  let paid = 0;
  let failed = 0;
  let abandoned = 0;
  let lostValue = 0;
  const now = Date.now();

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const status = String(data.status ?? "created");
    const amount = Number(data.amount ?? 0) || 0;
    if (status === "paid") {
      paid += 1;
    } else if (status === "failed") {
      failed += 1;
      // Lost value counts FAILED payments only — an abandoned checkout is a
      // customer who never committed, not money the platform lost at the gateway.
      lostValue += amount;
    } else {
      const created = (data.createdAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      if (now - created > ABANDON_AFTER_MS) {
        abandoned += 1;
      }
      // else: still in flight — not counted yet.
    }
  }

  const attempts = snap.size;
  return {
    attempts,
    paid,
    failed,
    abandoned,
    conversionRate: attempts > 0 ? paid / attempts : 0,
    lostValue,
  };
}

// ─── Engagement (DAU / MAU / stickiness) ─────────────────────────────────────
//
// Everything here reads only the pre-aggregated summary docs written by the
// `onActiveUserPresence` Cloud Function — one `activeUsers/{YYYY-MM-DD}` doc per
// day and one `mau/{YYYY-MM}` doc per month. The Admin page NEVER touches the
// per-user presence subcollections, so cost is a few dozen reads regardless of
// how many users are active.

/** YYYY-MM month key from a day key. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive list of YYYY-MM month keys spanning [from, to]. */
function monthKeysInRange({ from, to }: DateRange): string[] {
  const keys: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  let guard = 0;
  while (cur <= end && guard < 240) {
    keys.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
    guard++;
  }
  return keys;
}

/** Whole-day difference between two YYYY-MM-DD keys (later - earlier). */
function dayKeyDiff(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Earliest day for which activity data exists — the honest floor below which
 * DAU/MAU/retention cannot be claimed. One read (orderBy date asc, limit 1).
 * Returns null when tracking has not produced any data yet.
 */
export async function getEarliestActivityDate(): Promise<string | null> {
  try {
    const snap = await getDocs(
      query(collection(db, "activeUsers"), orderBy("date", "asc"), limit(1)),
    );
    if (snap.empty) return null;
    const d = snap.docs[0];
    return String(d.data().date ?? d.id);
  } catch {
    return null;
  }
}

export type EngagementMetrics = {
  /** Earliest date activity data exists (null = tracking has no data yet). */
  reliableFrom: string | null;
  dauPerDay: { date: string; dau: number; retailer: number; manufacturer: number; customer: number }[];
  avgDau: number;
  peakDau: number;
  latestDau: number;
  /** Sum of DAU over the range — labelled as active user-days, not unique users. */
  activeUserDays: number;
  newActiveDays: number;
  returningDays: number;
  mauPerMonth: { date: string; mau: number; retailer: number; manufacturer: number; customer: number }[];
  /** MAU of the most recent month covered by the range. */
  currentMau: number;
  currentMauMonth: string | null;
  /** DAU/MAU × 100 for the current month, or null when data is too thin. */
  stickiness: number | null;
  /** Distinct days in the range that actually have activity data. */
  daysWithData: number;
};

/**
 * DAU + MAU + stickiness for a window, from summary docs only.
 *
 * The day series is clamped to start no earlier than the first day tracking has
 * data (`reliableFrom`), so an "all time" or long range never fabricates a flat
 * zero line for the pre-tracking past. MAU is read as the real monthly-unique
 * figure the CF maintains — never derived by summing DAU (which double-counts).
 */
export async function getEngagementMetrics(range: DateRange): Promise<EngagementMetrics> {
  const reliableFrom = await getEarliestActivityDate();

  // Effective start = later of the requested range and the tracking floor.
  const floorDate = reliableFrom ? new Date(`${reliableFrom}T00:00:00`) : range.from;
  const effFrom = range.from > floorDate ? range.from : floorDate;
  const effRange: DateRange = { from: effFrom, to: range.to };

  const fromKey = dayKey(effFrom);
  const toKey = dayKey(range.to);

  // ── DAU: one bounded read over the daily summary docs ──────────────────────
  const dauSnap = reliableFrom
    ? await getDocs(
        query(
          collection(db, "activeUsers"),
          where("date", ">=", fromKey),
          where("date", "<=", toKey),
          orderBy("date", "asc"),
        ),
      )
    : null;

  const dauMap = new Map<string, { dau: number; retailer: number; manufacturer: number; customer: number }>();
  let activeUserDays = 0;
  let newActiveDays = 0;
  let returningDays = 0;
  let daysWithData = 0;
  if (dauSnap) {
    for (const d of dauSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const dau = Number(data.count ?? 0) || 0;
      dauMap.set(String(data.date ?? d.id), {
        dau,
        retailer: Number(data.retailer ?? 0) || 0,
        manufacturer: Number(data.manufacturer ?? 0) || 0,
        customer: Number(data.customer ?? 0) || 0,
      });
      activeUserDays += dau;
      newActiveDays += Number(data.newActive ?? 0) || 0;
      returningDays += Number(data.returning ?? 0) || 0;
      if (dau > 0) daysWithData += 1;
    }
  }

  const dayKeys = reliableFrom ? dayKeysInRange(effRange) : [];
  const dauPerDay = dayKeys.map((date) => {
    const v = dauMap.get(date);
    return {
      date,
      dau: v?.dau ?? 0,
      retailer: v?.retailer ?? 0,
      manufacturer: v?.manufacturer ?? 0,
      customer: v?.customer ?? 0,
    };
  });

  const calendarDays = dauPerDay.length || 1;
  const avgDau = activeUserDays / calendarDays;
  const peakDau = dauPerDay.reduce((m, p) => Math.max(m, p.dau), 0);
  const latestDau = dauPerDay.length ? dauPerDay[dauPerDay.length - 1].dau : 0;

  // ── MAU: one bounded read over the monthly summary docs ────────────────────
  const monthKeys = monthKeysInRange(effRange);
  const fromMonth = monthKeys[0] ?? monthKey(effFrom);
  const toMonth = monthKeys[monthKeys.length - 1] ?? monthKey(range.to);
  const mauSnap = reliableFrom
    ? await getDocs(
        query(
          collection(db, "mau"),
          where("month", ">=", fromMonth),
          where("month", "<=", toMonth),
          orderBy("month", "asc"),
        ),
      )
    : null;

  const mauMap = new Map<string, { mau: number; retailer: number; manufacturer: number; customer: number }>();
  if (mauSnap) {
    for (const d of mauSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      mauMap.set(String(data.month ?? d.id), {
        mau: Number(data.count ?? 0) || 0,
        retailer: Number(data.retailer ?? 0) || 0,
        manufacturer: Number(data.manufacturer ?? 0) || 0,
        customer: Number(data.customer ?? 0) || 0,
      });
    }
  }
  // Chart points use the first-of-month as the date so the shared line chart's
  // date axis renders "Feb '24" style labels.
  const mauPerMonth = monthKeys.map((m) => {
    const v = mauMap.get(m);
    return {
      date: `${m}-01`,
      mau: v?.mau ?? 0,
      retailer: v?.retailer ?? 0,
      manufacturer: v?.manufacturer ?? 0,
      customer: v?.customer ?? 0,
    };
  });

  const currentMauMonth = monthKeys.length ? monthKeys[monthKeys.length - 1] : null;
  const currentMau = currentMauMonth ? mauMap.get(currentMauMonth)?.mau ?? 0 : 0;

  // ── Stickiness (DAU/MAU) — only when there is enough data to be honest ──────
  // Uses avg DAU across the days *of the current month that have data* over that
  // month's MAU. Suppressed unless the current month has at least a week of
  // activity days, so an almost-empty month never shows a wild percentage.
  let stickiness: number | null = null;
  if (currentMauMonth && currentMau > 0) {
    const monthDays = dauPerDay.filter((p) => p.date.slice(0, 7) === currentMauMonth);
    const daysWithDataThisMonth = monthDays.filter((p) => p.dau > 0).length;
    if (daysWithDataThisMonth >= 7) {
      const sumDau = monthDays.reduce((s, p) => s + p.dau, 0);
      const avgDauThisMonth = sumDau / monthDays.length;
      stickiness = (avgDauThisMonth / currentMau) * 100;
    }
  }

  return {
    reliableFrom,
    dauPerDay,
    avgDau,
    peakDau,
    latestDau,
    activeUserDays,
    newActiveDays,
    returningDays,
    mauPerMonth,
    currentMau,
    currentMauMonth,
    stickiness,
    daysWithData,
  };
}

// ─── Retention (cohort by registration day) ──────────────────────────────────

export type RetentionCohort = {
  cohort: string; // YYYY-MM-DD registration day
  registered: number;
  returned7: number;
  returned30: number;
  rate7: number | null;
  rate30: number | null;
  /** A cohort is only "complete" for a window once that many days have elapsed. */
  mature7: boolean;
  mature30: boolean;
};

export type RetentionData = {
  reliableFrom: string | null;
  cohorts: RetentionCohort[];
  overall7: { registered: number; returned: number; rate: number | null };
  overall30: { registered: number; returned: number; rate: number | null };
};

/**
 * 7-day & 30-day retention by registration cohort.
 *
 * Cohort size (registered) is a bounded `users.createdAt` range read (only the
 * cohort window, admins excluded). Return counts come straight from the
 * CF-maintained `retention/{cohortDay}` summary docs — one bounded read. No
 * per-user scanning.
 *
 * Cohorts never predate `reliableFrom`: we cannot claim a user "did not return"
 * during days we were not yet tracking activity, so those cohorts are omitted.
 */
export async function getRetentionCohorts(): Promise<RetentionData> {
  const reliableFrom = await getEarliestActivityDate();
  if (!reliableFrom) {
    return {
      reliableFrom: null,
      cohorts: [],
      overall7: { registered: 0, returned: 0, rate: null },
      overall30: { registered: 0, returned: 0, rate: null },
    };
  }

  const today = new Date();
  const todayKey = dayKey(today);

  // Show cohorts for up to the last 30 days, but never before tracking began —
  // a cohort older than the tracking floor would understate returns.
  const floor = new Date(`${reliableFrom}T00:00:00`);
  const thirtyAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
  const windowStart = floor > thirtyAgo ? floor : thirtyAgo;
  const range: DateRange = {
    from: new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate(), 0, 0, 0, 0),
    to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
  };
  const cohortKeys = dayKeysInRange(range);

  // Registrations per cohort day (bounded read, admins excluded).
  const regSnap = await getDocs(
    query(collection(db, "users"), ...createdAtRange("createdAt", range), orderBy("createdAt", "asc")),
  );
  const registeredMap = new Map<string, number>();
  for (const k of cohortKeys) registeredMap.set(k, 0);
  for (const d of regSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.role === "admin") continue;
    const ts = data.createdAt as Timestamp | undefined;
    const key = ts?.toDate ? dayKey(ts.toDate()) : null;
    if (key && registeredMap.has(key)) registeredMap.set(key, registeredMap.get(key)! + 1);
  }

  // Return counts per cohort (bounded read of the summary docs).
  const retSnap = await getDocs(
    query(
      collection(db, "retention"),
      where("cohort", ">=", cohortKeys[0]),
      where("cohort", "<=", todayKey),
      orderBy("cohort", "asc"),
    ),
  );
  const returnMap = new Map<string, { returned7: number; returned30: number }>();
  for (const d of retSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    returnMap.set(String(data.cohort ?? d.id), {
      returned7: Number(data.returned7 ?? 0) || 0,
      returned30: Number(data.returned30 ?? 0) || 0,
    });
  }

  const cohorts: RetentionCohort[] = cohortKeys.map((cohort) => {
    const registered = registeredMap.get(cohort) ?? 0;
    const ret = returnMap.get(cohort) ?? { returned7: 0, returned30: 0 };
    const age = dayKeyDiff(cohort, todayKey);
    return {
      cohort,
      registered,
      returned7: ret.returned7,
      returned30: ret.returned30,
      rate7: registered > 0 ? ret.returned7 / registered : null,
      rate30: registered > 0 ? ret.returned30 / registered : null,
      mature7: age >= 7,
      mature30: age >= 30,
    };
  });

  // Overall rates aggregate only MATURE cohorts, so an in-progress cohort can't
  // drag the headline retention down with a not-yet-complete window.
  const mature7 = cohorts.filter((c) => c.mature7);
  const mature30 = cohorts.filter((c) => c.mature30);
  const sum7Reg = mature7.reduce((s, c) => s + c.registered, 0);
  const sum7Ret = mature7.reduce((s, c) => s + c.returned7, 0);
  const sum30Reg = mature30.reduce((s, c) => s + c.registered, 0);
  const sum30Ret = mature30.reduce((s, c) => s + c.returned30, 0);

  return {
    reliableFrom,
    // Newest cohort first reads best in a table.
    cohorts: cohorts.slice().reverse(),
    overall7: { registered: sum7Reg, returned: sum7Ret, rate: sum7Reg > 0 ? sum7Ret / sum7Reg : null },
    overall30: { registered: sum30Reg, returned: sum30Ret, rate: sum30Reg > 0 ? sum30Ret / sum30Reg : null },
  };
}

// ─── Traffic ─────────────────────────────────────────────────────────────────
//
// Two distinct signals are shown side-by-side on the Traffic tab:
//
//  1. Anonymous page visits (`siteVisits/{date}`) — a simple daily increment
//     that counts every page load, regardless of login status. These are NOT
//     unique users and are clearly labelled as such.
//
//  2. Unique logged-in user sessions (`activeUsers/{date}` summaries written by
//     the `onActiveUserPresence` Cloud Function). Each user is counted at most
//     once per calendar day. Device breakdown (web / mobile / tablet) is
//     available from the date the CF was updated to read the `platform` field;
//     earlier days show everything under `web` because the client hardcoded
//     `platform: 'web'`. Do NOT present these as anonymous visitor counts.

export type TrafficDayPoint = {
  date: string;
  visits: number;
  uniqueUsers: number;
  web: number;
  mobile: number;
  tablet: number;
};

export type TrafficMetrics = {
  /** Earliest day siteVisits data exists (null = never written). */
  visitsFrom: string | null;
  /** Earliest day activeUsers data exists — also the floor for device data. */
  usersFrom: string | null;
  /** Earliest day device breakdown is meaningful (platform field added to presence docs). */
  deviceFrom: string | null;
  totalVisits: number;
  totalUniqueUsers: number;
  web: number;
  mobile: number;
  tablet: number;
  perDay: TrafficDayPoint[];
};

/**
 * Site traffic + unique logged-in user activity for a date range.
 *
 * Reads two collections in parallel:
 *  - `siteVisits/{YYYY-MM-DD}`: anonymous page visit counters (one read/day in range).
 *  - `activeUsers/{YYYY-MM-DD}`: pre-aggregated DAU summaries written by the CF
 *    (also one read/day). Device fields (web/mobile/tablet) are present only
 *    from the date the CF started reading the `platform` field from presence docs.
 *
 * For "All Time" (range.from ≤ epoch) the siteVisits scan is unconstrained but
 * bounded by the number of calendar days with data, which is small.
 */
export async function getTrafficMetrics(range: DateRange): Promise<TrafficMetrics> {
  const isAllTime = range.from.getTime() <= 0;
  const fromKey = isAllTime ? "2000-01-01" : dayKey(range.from);
  const toKey = dayKey(range.to);

  const [visitsSnap, dauSnap, firstVisit, firstDau] = await Promise.all([
    getDocs(
      query(
        collection(db, "siteVisits"),
        where("date", ">=", fromKey),
        where("date", "<=", toKey),
        orderBy("date", "asc"),
      ),
    ),
    getDocs(
      query(
        collection(db, "activeUsers"),
        where("date", ">=", fromKey),
        where("date", "<=", toKey),
        orderBy("date", "asc"),
      ),
    ),
    // Earliest siteVisits doc
    getDocs(query(collection(db, "siteVisits"), orderBy("date", "asc"), limit(1))),
    // Earliest activeUsers summary doc
    getDocs(query(collection(db, "activeUsers"), orderBy("date", "asc"), limit(1))),
  ]);

  const visitsFrom = firstVisit.empty ? null : String(firstVisit.docs[0].data().date ?? firstVisit.docs[0].id);
  const usersFrom = firstDau.empty ? null : String(firstDau.docs[0].data().date ?? firstDau.docs[0].id);

  // Device data is only reliable from when the CF started writing device buckets.
  // We surface this so the UI can display an honest "since <date>" note.
  // Store the CF deploy date here; until then all presence docs wrote platform:'web'
  // which means historical web counts are inflated and mobile/tablet are zero.
  // We derive this as the first activeUsers day that has a non-zero mobile or tablet
  // count — if none exists, device data has not started accumulating yet.
  let deviceFrom: string | null = null;
  for (const d of dauSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (Number(data.mobile ?? 0) > 0 || Number(data.tablet ?? 0) > 0) {
      deviceFrom = String(data.date ?? d.id);
      break;
    }
  }

  // Build per-day map from visits
  const visitMap = new Map<string, number>();
  for (const d of visitsSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    visitMap.set(String(data.date ?? d.id), Number(data.total ?? 0) || 0);
  }

  // Build per-day map from DAU summaries
  type DauEntry = { uniqueUsers: number; web: number; mobile: number; tablet: number };
  const dauMap = new Map<string, DauEntry>();
  for (const d of dauSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    dauMap.set(String(data.date ?? d.id), {
      uniqueUsers: Number(data.count ?? 0) || 0,
      web: Number(data.web ?? 0) || 0,
      mobile: Number(data.mobile ?? 0) || 0,
      tablet: Number(data.tablet ?? 0) || 0,
    });
  }

  // Union of all days that appear in either collection within the range
  const allDays = new Set<string>([...Array.from(visitMap.keys()), ...Array.from(dauMap.keys())]);
  const sortedDays = Array.from(allDays).sort();

  let totalVisits = 0;
  let totalUniqueUsers = 0;
  let web = 0;
  let mobile = 0;
  let tablet = 0;

  const perDay: TrafficDayPoint[] = sortedDays.map((date) => {
    const v = visitMap.get(date) ?? 0;
    const u = dauMap.get(date);
    totalVisits += v;
    totalUniqueUsers += u?.uniqueUsers ?? 0;
    web += u?.web ?? 0;
    mobile += u?.mobile ?? 0;
    tablet += u?.tablet ?? 0;
    return {
      date,
      visits: v,
      uniqueUsers: u?.uniqueUsers ?? 0,
      web: u?.web ?? 0,
      mobile: u?.mobile ?? 0,
      tablet: u?.tablet ?? 0,
    };
  });

  return { visitsFrom, usersFrom, deviceFrom, totalVisits, totalUniqueUsers, web, mobile, tablet, perDay };
}
