import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { addTo, applyOnce, diffContributions, fieldKey, istDayKey, millisOf, type Contribution } from "./increments";
import { orderTotal } from "./platform-daily";

/**
 * Per-seller order totals for the seller dashboard (website Home and
 * Analytics), kept by a trigger on orders so the dashboard stops reading the
 * seller's whole order history:
 *
 *   sellerStats/{sellerKey}            all time:
 *     { sellerKey, orders: { count, revenue, paid, paidAmount,
 *                            status: { placed: n, ... } },
 *       items: { <key>: { name, qty, revenue } } }
 *       earnings: { orders, gatewayFees, platformFees,
 *                   awaiting|delivered|transferred: { net, webNet, platformFee },
 *                   settled: { net, webNet } } }   part of transferred: in the bank
 *   sellerDailyStats/{sellerKey}_{YYYY-MM-DD}   (India dates):
 *     { sellerKey, date, orders: { count, revenue },
 *       holds: { <orderId>: { net, webNet, at, releaseAt? } } }   orders delivered that day
 *                                                   and not yet transferred
 *
 * Same rules as the dashboard's former order scan: revenue and products sold
 * leave out cancelled and rejected orders; the order count includes them.
 * sellerKey is the seller's phone as "+91" + 10 digits when the order has
 * one (sellerPhone, or a phone-shaped sellerId), else sellerId (an Auth UID),
 * so each order counts under exactly one key.
 * scripts/backfill-seller-stats.ts builds the history and can be re-run.
 */

const REGION = "asia-south1";
export const SELLER_STATS = "sellerStats";
export const SELLER_DAILY = "sellerDailyStats";

type Data = admin.firestore.DocumentData | undefined;

/** "+91" + 10 digits for anything phone-shaped, else the value as is. */
export function normalizeSellerKey(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^\+?\d{10,12}$/.test(raw.replace(/[\s-]/g, "")) && digits.length >= 10) return `+91${digits.slice(-10)}`;
  return raw;
}

export function sellerKeyOf(d: admin.firestore.DocumentData): string {
  return normalizeSellerKey(d.sellerPhone) || normalizeSellerKey(d.sellerId);
}

/** A map key for a product name that is safe in a field path, and stable. */
export function itemKey(name: string): string {
  return `${fieldKey(name, "item").slice(0, 40)}_${createHash("sha1").update(name).digest("hex").slice(0, 8)}`;
}

function itemName(item: Record<string, unknown> | null | undefined): string {
  return String(item?.name ?? "Unknown product");
}

// ─── Earnings (mirrors app/dashboard/_lib/seller-earnings.ts and the app's
// seller_earnings.dart; change them together) ──────────────────────────────

/** Gross before refunds: mobile writes `total`, web `grandTotal`. */
function earningsGross(d: admin.firestore.DocumentData): number {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return n(d.total) ?? n(d.grandTotal) ?? (n(d.subtotal) ?? 0) + (n(d.deliveryCharge) ?? 0) + (n(d.totalGst) ?? 0);
}

function toMs(v: unknown): number {
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
  }
  return millisOf(v);
}

/** When the order was last marked delivered (statusHistory), 0 if unknown. */
export function deliveredAtMs(d: admin.firestore.DocumentData): number {
  const history = Array.isArray(d.statusHistory) ? d.statusHistory : [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.status === "delivered") return toMs(history[i]?.at);
  }
  return 0;
}

/**
 * The time-independent part of an order's payout state. "delivered" covers
 * both "on hold" and "due": which one depends on the clock (7 days after
 * delivery), so the dashboard splits it using the hold entries.
 */
export function earningsPhase(d: admin.firestore.DocumentData): "transferred" | "not_payable" | "awaiting" | "delivered" {
  if (d.payment?.transferId) return "transferred";
  // A Route transfer Razorpay has released (or settled) is paid out too
  // (payout is kept by payouts/payout-status.ts).
  const payoutState = String(d.payout?.state ?? "");
  if (payoutState === "processing" || payoutState === "settled") return "transferred";
  const status = String(d.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "rejected" || status === "refunded") return "not_payable";
  const delivered = status === "delivered" || deliveredAtMs(d) > 0;
  return delivered ? "delivered" : "awaiting";
}

function addEarnings(c: Contribution, totals: string, key: string, d: admin.firestore.DocumentData, orderId?: string): void {
  const phase = earningsPhase(d);
  if (phase === "not_payable") return;
  const gross = Math.max(0, earningsGross(d) - (Number(d.payment?.refundedAmount ?? 0) || 0));
  const gatewayFee = (Number(d.payment?.gatewayFee ?? 0) || 0) + (Number(d.payment?.gatewayTax ?? 0) || 0);
  const platformFee = Number(d.payment?.platformFee ?? 0) || 0;
  // Net of the gateway fee (the app's figure); the website also takes off the
  // platform fee, kept separately per state.
  // Once a payout transfer has paid the order, what it sent is the answer
  // (same rule as netFor in seller-earnings.ts).
  const sent = Number(d.payment?.transferredNet ?? 0) || 0;
  const paid = Boolean(d.payment?.transferId) && sent > 0;
  const net = paid ? sent : Math.max(0, gross - gatewayFee);
  const webNet = paid ? sent : Math.max(0, gross - gatewayFee - platformFee);
  addTo(c, totals, "earnings.orders", 1);
  addTo(c, totals, `earnings.${phase}.net`, net);
  addTo(c, totals, `earnings.${phase}.platformFee`, platformFee);
  addTo(c, totals, `earnings.${phase}.webNet`, webNet);
  addTo(c, totals, "earnings.gatewayFees", gatewayFee);
  addTo(c, totals, "earnings.platformFees", platformFee);
  // Of the paid-out money, what has reached the seller's bank (Razorpay
  // settlement). A part of "transferred", so older screens still add up.
  if (phase === "transferred" && d.payout?.state === "settled") {
    addTo(c, totals, "earnings.settled.net", net);
    addTo(c, totals, "earnings.settled.webNet", webNet);
  }

  // A delivered order is on hold for 7 days from its delivery time: record it
  // on its delivery day so the dashboard reads only the last few days to
  // split "on hold" from "due". Gone again once it is transferred.
  const at = deliveredAtMs(d);
  if (phase === "delivered" && at > 0 && orderId && /^[A-Za-z0-9_-]{1,100}$/.test(orderId)) {
    const day = `${SELLER_DAILY}/${key}_${istDayKey(at)}`;
    addTo(c, day, `holds.${orderId}.net`, net);
    addTo(c, day, `holds.${orderId}.webNet`, Math.max(0, gross - gatewayFee - platformFee));
    addTo(c, day, `holds.${orderId}.at`, at);
    // The real release time when the Route transfer has one (24h after
    // delivery); screens fall back to `at` + 7 days without it.
    const releaseAt = Number(d.payout?.onHoldUntil ?? 0) || millisOf(d.routeRelease?.releaseAt);
    if (releaseAt > 0) addTo(c, day, `holds.${orderId}.releaseAt`, releaseAt);
  }
}

export function sellerContribution(d: Data, orderId?: string): Contribution {
  const c: Contribution = new Map();
  if (!d) return c;
  const key = sellerKeyOf(d);
  if (!key || key.includes("/")) return c;
  const totals = `${SELLER_STATS}/${key}`;
  const status = String(d.status ?? "unknown");
  const cancelled = status === "cancelled" || status === "rejected";
  const total = orderTotal(d);

  addTo(c, totals, "orders.count", 1);
  addTo(c, totals, `orders.status.${fieldKey(status)}`, 1);
  if (!cancelled) addTo(c, totals, "orders.revenue", total);
  // Paid online (the Orders page's "paid" tiles), whatever the status.
  if (d.payment?.status === "paid") {
    addTo(c, totals, "orders.paid", 1);
    addTo(c, totals, "orders.paidAmount", Number(d.payment.amount ?? 0) || 0);
  }

  const ms = millisOf(d.createdAt);
  if (ms > 0) {
    const day = `${SELLER_DAILY}/${key}_${istDayKey(ms)}`;
    addTo(c, day, "orders.count", 1);
    if (!cancelled) addTo(c, day, "orders.revenue", total);
  }

  if (!cancelled && Array.isArray(d.items)) {
    for (const item of d.items) {
      const k = itemKey(itemName(item));
      const qty = Number(item?.quantity ?? 0);
      addTo(c, totals, `items.${k}.qty`, qty);
      addTo(c, totals, `items.${k}.revenue`, Number(item?.price ?? 0) * qty);
    }
  }
  addEarnings(c, totals, key, d, orderId);
  return c;
}

/** Plain fields written alongside the increments: who and which day, and item names. */
export function sellerExtra(path: string, orders: Data[]): Record<string, unknown> {
  if (path.startsWith(`${SELLER_DAILY}/`)) {
    const id = path.slice(SELLER_DAILY.length + 1);
    return { sellerKey: id.slice(0, -11), date: id.slice(-10) };
  }
  const items: Record<string, { name: string }> = {};
  for (const d of orders) {
    if (!d || !Array.isArray(d.items)) continue;
    for (const item of d.items) items[itemKey(itemName(item))] = { name: itemName(item) };
  }
  return { sellerKey: path.slice(SELLER_STATS.length + 1), items };
}

export const sellerStatsOnOrderWrite = onDocumentWritten(
  { document: "orders/{id}", region: REGION, retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    try {
      await applyOnce(
        "seller",
        event.id,
        diffContributions(
          sellerContribution(before, event.params.id),
          sellerContribution(after, event.params.id),
        ),
        (path) => sellerExtra(path, [before, after]),
      );
    } catch (err) {
      logger.error("[sellerStats] update failed", { eventId: event.id, err: String(err) });
      throw err; // retried; the event marker keeps it exactly-once
    }
  },
);
