import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import {
  addTo,
  applyOnce,
  diffContributions,
  fieldKey,
  istDayKey,
  millisOf,
  type Contribution,
} from "./increments";

/**
 * platformDailyStats/{YYYY-MM-DD} (India time): the platform's totals per day,
 * for Admin → Analytics. Kept by triggers on orders, subscriptions,
 * paymentAttempts, users and products, so the analytics page reads one small
 * doc per day instead of every order, subscription, payment and user.
 *
 *   orders:   { count, gmv, platformFee, status: { placed: n, ... } }
 *   subs:     { count, seats, renewals,          // genuine (non-promotional) subs
 *               revenuePaid, revenueManual,       // from the payments ledger
 *               promoCount, promoSeats }          // promotional grants (not revenue)
 *   payments: { attempts, paid, failed, open, failedAmount }
 *   users:    { retailer, manufacturer, customer, admin }   (by current role)
 *   products: { added }                                     (existing products)
 *
 * Each doc is bucketed by its createdAt; docs without createdAt are not
 * counted (the analytics date-range queries never included them either).
 * scripts/backfill-platform-daily-stats.ts builds the history and can be
 * re-run to correct any drift.
 */

const REGION = "asia-south1";
export const PLATFORM_DAILY = "platformDailyStats";

type Data = admin.firestore.DocumentData | undefined;

const db = (): admin.firestore.Firestore => admin.firestore();

function dayPath(createdAt: unknown): string | null {
  const ms = millisOf(createdAt);
  return ms > 0 ? `${PLATFORM_DAILY}/${istDayKey(ms)}` : null;
}

/** Mobile writes `total`, web writes `grandTotal` (same as orderGrandTotal in types/order.ts). */
export function orderTotal(d: admin.firestore.DocumentData): number {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return n(d.grandTotal) ?? n(d.total) ?? (n(d.subtotal) ?? 0) + (n(d.deliveryCharge) ?? 0) + (n(d.totalGst) ?? 0);
}

export function orderContribution(d: Data): Contribution {
  const c: Contribution = new Map();
  const path = d && dayPath(d.createdAt);
  if (!d || !path) return c;
  addTo(c, path, "orders.count", 1);
  addTo(c, path, "orders.gmv", orderTotal(d));
  const fee = d.payment?.platformFee;
  if (typeof fee === "number") addTo(c, path, "orders.platformFee", fee);
  addTo(c, path, `orders.status.${fieldKey(d.status)}`, 1);
  return c;
}

/**
 * A promotional grant — a free seat award from /api/admin/promotions, flagged
 * `isPromotional` (with a `promotionId`). This is the authoritative signal; a
 * plain admin-assigned or manually-activated subscription is NOT promotional.
 */
export function isPromotionalSub(d: admin.firestore.DocumentData): boolean {
  return d.isPromotional === true || Boolean(d.promotionId);
}

/**
 * Per-day subscription COUNTS only — revenue is no longer derived here; it comes
 * from the payments ledger (paymentRevenueContribution), the actual record of
 * money taken. Promotional grants are free awards, not purchases, so they are
 * kept out of count/seats/renewals and tracked separately under subs.promo*.
 *
 * `isRenewal`: the owner had an earlier subscription when this one was created.
 */
export function subscriptionContribution(d: Data, isRenewal: boolean): Contribution {
  const c: Contribution = new Map();
  const path = d && dayPath(d.createdAt);
  if (!d || !path) return c;
  if (isPromotionalSub(d)) {
    addTo(c, path, "subs.promoCount", 1);
    addTo(c, path, "subs.promoSeats", Number(d.seatsPurchased ?? 0) || 0);
    return c;
  }
  addTo(c, path, "subs.count", 1);
  addTo(c, path, "subs.seats", Number(d.seatsPurchased ?? 0) || 0);
  if (isRenewal) addTo(c, path, "subs.renewals", 1);
  return c;
}

/**
 * Revenue bucket for a payments-ledger doc. Gateway checkout writes `success`;
 * admin manual activation writes `manual_admin`; the custom-assign flow writes
 * `admin_granted`. Promotional grants write NO payment doc, so promotional is
 * excluded from revenue by construction. Unknown/other statuses are ignored.
 */
export function paymentRevenueBucket(status: unknown): "paid" | "manual" | null {
  if (status === "success") return "paid";
  if (status === "manual_admin" || status === "admin_granted") return "manual";
  return null;
}

/**
 * Subscription REVENUE from the payments ledger, bucketed by the payment's
 * timestamp (IST day). `success` → gateway revenue; admin grants → manual
 * revenue. This is the source of truth that reconciles with Razorpay, and it
 * naturally excludes promotional grants (which record no payment).
 */
export function paymentRevenueContribution(d: Data): Contribution {
  const c: Contribution = new Map();
  if (!d) return c;
  const path = dayPath(d.timestamp);
  if (!path) return c;
  const bucket = paymentRevenueBucket(d.status);
  if (!bucket) return c;
  const amount = Number(d.amount ?? 0) || 0;
  addTo(c, path, bucket === "paid" ? "subs.revenuePaid" : "subs.revenueManual", amount);
  return c;
}

export function paymentBucket(status: unknown): "paid" | "failed" | "open" {
  return status === "paid" ? "paid" : status === "failed" ? "failed" : "open";
}

export function paymentContribution(d: Data): Contribution {
  const c: Contribution = new Map();
  const path = d && dayPath(d.createdAt);
  if (!d || !path) return c;
  const bucket = paymentBucket(d.status);
  addTo(c, path, "payments.attempts", 1);
  addTo(c, path, `payments.${bucket}`, 1);
  if (bucket === "failed") addTo(c, path, "payments.failedAmount", Number(d.amount ?? 0) || 0);
  return c;
}

export function userBucket(role: unknown): "retailer" | "manufacturer" | "admin" | "customer" {
  // Same split as the analytics page: anything else (consumer, missing) is a customer.
  return role === "retailer" || role === "manufacturer" || role === "admin" ? role : "customer";
}

export function userContribution(d: Data): Contribution {
  const c: Contribution = new Map();
  const path = d && dayPath(d.createdAt);
  if (!d || !path) return c;
  addTo(c, path, `users.${userBucket(d.role)}`, 1);
  return c;
}

export function productContribution(d: Data): Contribution {
  const c: Contribution = new Map();
  const path = d && dayPath(d.createdAt);
  if (!d || !path) return c;
  addTo(c, path, "products.added", 1);
  return c;
}

/** The owner key subscriptions are grouped by, as the analytics page did. */
export function subscriptionOwner(d: admin.firestore.DocumentData): string {
  return String(d.ownerPhone ?? d.ownerId ?? "");
}

async function isRenewal(d: Data): Promise<boolean> {
  if (!d) return false;
  const owner = subscriptionOwner(d);
  const createdMs = millisOf(d.createdAt);
  if (!owner || !createdMs) return false;
  const created = admin.firestore.Timestamp.fromMillis(createdMs);
  const field = d.ownerPhone ? "ownerPhone" : "ownerId";
  const earlier = await db().collection("subscriptions")
    .where(field, "==", owner)
    .where("createdAt", "<", created)
    .count()
    .get();
  return earlier.data().count > 0;
}

function dayExtra(path: string): Record<string, unknown> {
  return { date: path.slice(PLATFORM_DAILY.length + 1) };
}

async function apply(eventId: string, before: Contribution, after: Contribution, what: string): Promise<void> {
  try {
    await applyOnce("platform", eventId, diffContributions(before, after), dayExtra);
  } catch (err) {
    logger.error("[platformDailyStats] update failed", { what, eventId, err: String(err) });
    throw err; // retried; the event marker keeps it exactly-once
  }
}

const TRIGGER = { region: REGION, retry: true };

export const platformStatsOnOrderWrite = onDocumentWritten({ ...TRIGGER, document: "orders/{id}" }, async (event) => {
  await apply(event.id, orderContribution(event.data?.before.data()), orderContribution(event.data?.after.data()), "order");
});

export const platformStatsOnSubscriptionWrite = onDocumentWritten({ ...TRIGGER, document: "subscriptions/{id}" }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  // Whether it is a renewal depends only on the owner's earlier subscriptions;
  // compute it once so an update doesn't move a subscription between buckets.
  const renewal = await isRenewal(after ?? before);
  await apply(event.id, subscriptionContribution(before, renewal), subscriptionContribution(after, renewal), "subscription");
});

export const platformStatsOnPaymentAttemptWrite = onDocumentWritten({ ...TRIGGER, document: "paymentAttempts/{id}" }, async (event) => {
  await apply(event.id, paymentContribution(event.data?.before.data()), paymentContribution(event.data?.after.data()), "payment");
});

// Subscription revenue comes from the payments ledger (the record of money
// actually taken), not from subscription docs — so gateway/manual revenue
// reconciles with Razorpay and promotional grants (no payment) are excluded.
export const platformStatsOnPaymentWrite = onDocumentWritten({ ...TRIGGER, document: "payments/{id}" }, async (event) => {
  await apply(event.id, paymentRevenueContribution(event.data?.before.data()), paymentRevenueContribution(event.data?.after.data()), "paymentRevenue");
});

export const platformStatsOnUserWrite = onDocumentWritten({ ...TRIGGER, document: "users/{id}" }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  // Most user writes (profile, tokens) change neither day nor role: no transaction.
  if (before && after && millisOf(before.createdAt) === millisOf(after.createdAt) &&
      userBucket(before.role) === userBucket(after.role)) return;
  await apply(event.id, userContribution(before), userContribution(after), "user");
});

// Created/deleted only: product docs are written often (prices, stock, old
// apps' view counters) and an update never changes when a product was added.
export const platformStatsOnProductCreate = onDocumentCreated({ ...TRIGGER, document: "products/{id}" }, async (event) => {
  await apply(event.id, new Map(), productContribution(event.data?.data()), "product");
});

export const platformStatsOnProductDelete = onDocumentDeleted({ ...TRIGGER, document: "products/{id}" }, async (event) => {
  await apply(event.id, productContribution(event.data?.data()), new Map(), "product");
});
