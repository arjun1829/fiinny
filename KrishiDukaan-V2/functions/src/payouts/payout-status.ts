/**
 * Where each seller's money is, as Razorpay sees it, kept on the order.
 *
 *   orders/{id}.payout = {
 *     via: "route" | "balance",      Route transfer made at checkout, or the
 *                                    admin payout run's balance transfer
 *     transferId, account,           trf_… and the seller's acc_…
 *     amount, reversed,              rupees still with the seller / pulled back
 *     transferStatus,                Razorpay transfer status (processed, failed…)
 *     settlementStatus,              Razorpay settlement status (on_hold, pending, settled)
 *     onHoldUntil,                   when a held transfer is set to release
 *     settlementId,                  setl_… once settled to the seller's bank
 *     state,                         one value for screens, see PayoutState
 *     processedAt,                   when Razorpay processed the transfer (ms)
 *     settlementAt, utr,             when it settled to the seller's bank (ms) and
 *                                    the bank reference (UTR), from the settlement
 *     settledAt,                     first time we saw it settled
 *     checkedAt, nextCheckAt         when we last / next ask Razorpay (ms)
 *   }
 *
 * READ ONLY. This never creates, releases or reverses a transfer: it asks
 * Razorpay and writes down the answer. Releasing stays with
 * route-release.ts (on delivery) and the admin tools, so there is still one
 * place that moves money.
 *
 * WHEN IT ASKS. Each order carries `payout.nextCheckAt`; a job every 15 minutes
 * reads only the orders that are due (a query on that field), so a quiet day
 * costs a handful of reads, not a scan. Orders are re-checked quickly while
 * money is moving (released, waiting to settle) and rarely while it is parked
 * on hold; once settled, failed or reversed they stop being checked. Order
 * changes that move money (delivered, refunded, a payout run) and Razorpay's
 * transfer / settlement webhooks make an order due again at once.
 */
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { callerIsAdmin } from "../reels/media/backfillReelTranscodes";

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
const RAZORPAY_API = "https://api.razorpay.com/v1";
const REGION = "asia-south1";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Orders older than this are no longer followed (their state stays as last seen). */
const FOLLOW_FOR_MS = 120 * DAY;
/** Orders checked per scheduled run; the rest wait for the next run. */
const BATCH = 150;

export type PayoutState =
  | "on_hold" // transfer held, no release date (waiting for delivery / release)
  | "scheduled" // held with a release date (on_hold_until)
  | "processing" // released, Razorpay is settling it to the seller's bank
  | "settled" // in the seller's bank account
  | "failed" // Razorpay could not make the transfer
  | "reversed" // all of it pulled back (refund / reassignment)
  | "not_routed"; // paid online but no transfer for this seller (paid by the payout run)

export interface RazorpayTransfer {
  id: string;
  status?: string;
  amount: number;
  amount_reversed?: number;
  on_hold?: boolean;
  on_hold_until?: number | null;
  settlement_status?: string | null;
  recipient?: string;
  recipient_settlement_id?: string | null;
  processed_at?: number | null;
  notes?: Record<string, string> | unknown[];
  error?: { description?: string | null; reason?: string | null } | null;
}

type Order = admin.firestore.DocumentData;

function authHeader(): string {
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`).toString("base64")}`;
}

async function razorpayGet<T>(path: string): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

function notesOf(t: RazorpayTransfer): Record<string, string> {
  return t.notes && !Array.isArray(t.notes) ? (t.notes as Record<string, string>) : {};
}

const phoneKey = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/**
 * This order's transfer among a payment's transfers. Same strict rule as
 * matchSellerTransfer in app/lib/route-transfers.ts (change them together):
 * the id the order recorded; else the transfer whose notes.sellerKey names
 * this seller; else the payment's only transfer if it carries no sellerKey.
 * A transfer tagged for a different seller never matches.
 */
export function matchOrderTransfer(transfers: RazorpayTransfer[], order: Order): RazorpayTransfer | null {
  const recorded = String(order.routeTransfer?.id ?? order.routeRelease?.transferId ?? "").trim();
  if (recorded) return transfers.find((t) => t.id === recorded) ?? null;
  const ids = [order.sellerPhone, order.sellerId].map((v) => String(v ?? "").trim()).filter(Boolean);
  const keys = new Set(ids.map(phoneKey).filter((k) => k.length === 10));
  const tagged = transfers.find((t) => {
    const note = String(notesOf(t).sellerKey ?? "").trim();
    return Boolean(note) && (ids.includes(note) || keys.has(phoneKey(note)));
  });
  if (tagged) return tagged;
  // A reassigned order never falls back to the payment's only transfer: that is
  // the original/rejecting seller's transfer, so it would resolve the wrong
  // seller (see route-release.ts). Covers both seller-rejection (reassignment)
  // and admin "Route Order" (adminReassignment) reassignments.
  if (!order.reassignment && !order.adminReassignment && transfers.length === 1 && !notesOf(transfers[0]).sellerKey) return transfers[0];
  return null;
}

/** One state for screens, from Razorpay's transfer. */
export function stateOf(t: RazorpayTransfer, now: number): PayoutState {
  const status = String(t.status ?? "").toLowerCase();
  if (status === "failed") return "failed";
  if (Number(t.amount ?? 0) - Number(t.amount_reversed ?? 0) <= 0 || status === "reversed") return "reversed";
  if (String(t.settlement_status ?? "").toLowerCase() === "settled") return "settled";
  if (t.on_hold) {
    if (t.on_hold_until && t.on_hold_until * 1000 > now) return "scheduled";
    if (!t.on_hold_until) return "on_hold";
  }
  return "processing";
}

/** When to ask Razorpay about this order again; null = stop following it. */
export function nextCheck(state: PayoutState | "none", order: Order, payout: { onHoldUntil?: number | null }, now: number): number | null {
  const created = millis(order.createdAt);
  if (created && now - created > FOLLOW_FOR_MS) return null;
  switch (state) {
    case "settled":
    case "failed":
    case "reversed":
    case "none":
      return null; // order changes (refund, payout run) re-open it
    case "scheduled":
      return Math.max(now + HOUR, (payout.onHoldUntil ?? now) + HOUR);
    case "processing":
      return now + 3 * HOUR; // settles in about a working day
    case "on_hold":
      // Parked until delivery (which re-opens it); a daily look catches holds
      // changed in the Razorpay dashboard.
      return now + DAY;
    case "not_routed":
      // A transfer can appear after capture (reassignment); look a few times.
      return created && now - created < 3 * DAY ? now + 6 * HOUR : null;
  }
}

function millis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  const t = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  const s = t.seconds ?? t._seconds;
  return typeof s === "number" ? s * 1000 : 0;
}

/** The payout fields for an order whose transfer is `t`. */
export function payoutFromTransfer(
  t: RazorpayTransfer,
  via: "route" | "balance",
  now: number,
  /** Balance transfers pay several orders at once: this order's share, rupees. */
  shareRupees?: number,
): Record<string, unknown> {
  const state = stateOf(t, now);
  const amountPaise = Number(t.amount ?? 0);
  const reversedPaise = Number(t.amount_reversed ?? 0);
  const outstanding = Math.max(0, amountPaise - reversedPaise) / 100;
  // A balance transfer's reversal is taken pro rata from its orders; show this
  // order's share of what is left.
  const amount = shareRupees != null && amountPaise > 0 ? Math.round(shareRupees * (outstanding * 100 / amountPaise) * 100) / 100 : outstanding;
  return {
    via,
    transferId: t.id,
    account: t.recipient ?? null,
    amount,
    reversed: shareRupees != null ? Math.max(0, Math.round((shareRupees - amount) * 100) / 100) : reversedPaise / 100,
    transferStatus: t.status ?? null,
    settlementStatus: t.settlement_status ?? null,
    onHoldUntil: t.on_hold && t.on_hold_until ? t.on_hold_until * 1000 : null,
    settlementId: t.recipient_settlement_id ?? null,
    processedAt: t.processed_at ? t.processed_at * 1000 : null,
    state,
    error: t.error?.description || t.error?.reason || null,
  };
}

const SAME_KEYS = ["via", "transferId", "account", "amount", "reversed", "transferStatus", "settlementStatus", "onHoldUntil", "settlementId", "processedAt", "settlementAt", "utr", "state", "error"];

/** A Linked Account settlement, as `expand[]=recipient_settlement` returns it. */
type RecipientSettlement = { id?: string; utr?: string | null; created_at?: number | null; status?: string };

/**
 * The bank reference (UTR) and time of a settlement to a seller. Read with
 * Razorpay's documented "Fetch Settlement Details" call: the transfers of
 * that settlement, expanded with the settlement itself. Null when Razorpay
 * has no UTR yet.
 */
async function settlementDetails(settlementId: string): Promise<{ utr: string | null; at: number | null }> {
  const body = await razorpayGet<{ items?: (RazorpayTransfer & { recipient_settlement?: RecipientSettlement })[] }>(
    `/transfers?recipient_settlement_id=${encodeURIComponent(settlementId)}&expand[]=recipient_settlement&count=1`,
  );
  const s = body.items?.[0]?.recipient_settlement;
  return { utr: s?.utr || null, at: s?.created_at ? s.created_at * 1000 : null };
}

function samePayout(a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean {
  if (!a) return false;
  return SAME_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/**
 * Asks Razorpay about these orders and writes what it says. One request per
 * payment (all its sellers' transfers) or per balance transfer, however many
 * orders share it. Returns how many orders changed.
 */
export async function syncOrders(
  docs: admin.firestore.DocumentSnapshot[],
  now = Date.now(),
): Promise<{ checked: number; changed: number; errors: number }> {
  const byPayment = new Map<string, Promise<RazorpayTransfer[]>>();
  const byTransfer = new Map<string, Promise<RazorpayTransfer>>();
  const paymentTransfers = (id: string) => {
    if (!byPayment.has(id)) {
      byPayment.set(id, razorpayGet<{ items?: RazorpayTransfer[] }>(`/payments/${encodeURIComponent(id)}/transfers`).then((b) => b.items ?? []));
    }
    return byPayment.get(id)!;
  };
  const transfer = (id: string) => {
    if (!byTransfer.has(id)) byTransfer.set(id, razorpayGet<RazorpayTransfer>(`/transfers/${encodeURIComponent(id)}`));
    return byTransfer.get(id)!;
  };
  const bySettlement = new Map<string, Promise<{ utr: string | null; at: number | null }>>();
  const settlement = (id: string) => {
    if (!bySettlement.has(id)) bySettlement.set(id, settlementDetails(id));
    return bySettlement.get(id)!;
  };

  let changed = 0;
  let errors = 0;
  const work = docs.filter((d) => d.exists).map(async (doc) => {
    const order = doc.data()!;
    const old = order.payout as Record<string, unknown> | undefined;
    let fields: Record<string, unknown> | null = null;
    let state: PayoutState | "none" = "none";
    try {
      const balanceId = String(order.payment?.transferId ?? "").trim();
      const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
      if (balanceId) {
        const t = await transfer(balanceId);
        const share = Number(order.payment?.transferredNet);
        fields = payoutFromTransfer(t, "balance", now, Number.isFinite(share) && share > 0 ? share : undefined);
        state = fields.state as PayoutState;
      } else if (paymentId) {
        const match = matchOrderTransfer(await paymentTransfers(paymentId), order);
        if (match) {
          fields = payoutFromTransfer(match, "route", now);
          state = fields.state as PayoutState;
        } else {
          fields = { via: "route", transferId: null, account: null, amount: 0, reversed: 0, transferStatus: null, settlementStatus: null, onHoldUntil: null, settlementId: null, state: "not_routed", error: null };
          state = "not_routed";
        }
      }
      // Settled: add the bank reference (UTR) and settlement time, once.
      if (fields && state === "settled" && fields.settlementId) {
        if (old?.utr && old?.settlementId === fields.settlementId) {
          fields.utr = old.utr;
          fields.settlementAt = old.settlementAt ?? null;
        } else {
          try {
            const d = await settlement(String(fields.settlementId));
            fields.utr = d.utr;
            fields.settlementAt = d.at;
          } catch (err) {
            // The settled state still counts; the UTR is filled in on a later check.
            logger.warn("[payout-status] settlement read failed", { orderId: doc.id, error: String(err).slice(0, 200) });
            fields.utr = null;
            fields.settlementAt = null;
          }
        }
      }
    } catch (err) {
      errors++;
      logger.warn("[payout-status] Razorpay read failed", { orderId: doc.id, error: String(err).slice(0, 300) });
      // Try again later without touching what we knew, waiting longer after
      // each failure (1h, 2h, 4h … a day); stop with the order's follow window.
      const failures = (Number(old?.failures ?? 0) || 0) + 1;
      const created = millis(order.createdAt);
      const giveUp = created > 0 && now - created > FOLLOW_FOR_MS;
      await doc.ref.update({
        "payout.failures": failures,
        "payout.nextCheckAt": giveUp ? admin.firestore.FieldValue.delete() : now + Math.min(DAY, HOUR * 2 ** (failures - 1)),
        "payout.checkedAt": admin.firestore.Timestamp.fromMillis(now),
      });
      return;
    }

    let next = fields ? nextCheck(state, order, fields as { onHoldUntil?: number | null }, now) : null;
    // Settled but no UTR yet (Razorpay adds it when the bank confirms): look
    // again every 6 hours for 3 days after it settled.
    if (state === "settled" && fields && !fields.utr) {
      const seen = millis(old?.settledAt) || now;
      if (now - seen < 3 * DAY) next = now + 6 * HOUR;
    }
    const update: Record<string, unknown> = {
      "payout.checkedAt": admin.firestore.Timestamp.fromMillis(now),
      "payout.failures": admin.firestore.FieldValue.delete(),
      "payout.nextCheckAt": next ?? admin.firestore.FieldValue.delete(),
    };
    if (fields && !samePayout(old, fields)) {
      for (const [k, v] of Object.entries(fields)) update[`payout.${k}`] = v;
      if (state === "settled" && !old?.settledAt) update["payout.settledAt"] = admin.firestore.Timestamp.fromMillis(now);
      changed++;
    }
    if (!fields && !old) {
      // Nothing paid online: nothing to follow.
      await doc.ref.update({ payout: admin.firestore.FieldValue.delete() });
      return;
    }
    await doc.ref.update(update);
  });

  // A few at a time: Razorpay rate limits, and the requests are shared anyway.
  for (let i = 0; i < work.length; i += 10) await Promise.all(work.slice(i, i + 10));
  return { checked: docs.length, changed, errors };
}

/** Orders whose next check is due, oldest first. */
async function dueOrders(now: number, max: number): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const snap = await admin.firestore().collection("orders")
    .where("payout.nextCheckAt", "<=", now)
    .orderBy("payout.nextCheckAt")
    .limit(max)
    .get();
  return snap.docs;
}

export const syncPayoutStatus = onSchedule(
  { schedule: "every 15 minutes", region: REGION, timeZone: "Asia/Kolkata", secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET], timeoutSeconds: 300 },
  async () => {
    const now = Date.now();
    const docs = await dueOrders(now, BATCH);
    if (!docs.length) return;
    // Work through the run in chunks so it is limited by time, not by size.
    let checked = 0, changed = 0, errors = 0;
    for (let i = 0; i < docs.length; i += 50) {
      const r = await syncOrders(docs.slice(i, i + 50), now);
      checked += r.checked; changed += r.changed; errors += r.errors;
    }
    logger.info("[payout-status] run", { checked, changed, errors });
  },
);

/** Fields whose change can move a seller's money. */
function moneyFingerprint(o: Order | undefined): string {
  if (!o) return "";
  return JSON.stringify([
    o.status ?? null,
    o.payment?.razorpayPaymentId ?? null,
    o.payment?.transferId ?? null,
    o.payment?.refundedAmount ?? null,
    Array.isArray(o.payment?.transferReversals) ? o.payment.transferReversals.length : 0,
    o.routeRelease?.transferId ?? null,
    o.routeRelease?.releaseAt ? millis(o.routeRelease.releaseAt) : null,
    o.routeTransfer?.id ?? null,
    o.sellerPhone ?? null,
  ]);
}

/**
 * Starts following an order once it is paid online, and makes it due again
 * when something that moves money changes (delivered → release, refund →
 * reversal, payout run → balance transfer). Writes only payout.nextCheckAt;
 * its own write changes nothing it looks at, so it cannot loop.
 */
/**
 * When an order write should make it due for a check (ms), or null. Pure, so
 * it is testable: start following once paid online; look again when something
 * that moves money changed. Its own write (payout.nextCheckAt) changes nothing
 * it looks at, so the trigger cannot loop.
 */
export function followUpFor(before: Order | undefined, after: Order | undefined, now: number): number | null {
  if (!after) return null;
  const paid = Boolean(String(after.payment?.razorpayPaymentId ?? "").trim() || String(after.payment?.transferId ?? "").trim());
  if (!paid) return null;
  const startFollowing = !after.payout;
  if (!startFollowing && moneyFingerprint(before) === moneyFingerprint(after)) return null;
  // New: give Razorpay a minute after capture. Changed: the release trigger
  // patches the transfer in the same moment, so look a little later.
  const due = now + (startFollowing ? MINUTE : 2 * MINUTE);
  const current = Number(after.payout?.nextCheckAt ?? NaN);
  if (Number.isFinite(current) && current <= due) return null;
  return due;
}

export const trackPayoutOnOrderWrite = onDocumentWritten(
  { document: "orders/{id}", region: REGION },
  async (event) => {
    const due = followUpFor(event.data?.before.data(), event.data?.after.data(), Date.now());
    if (due != null) await event.data!.after.ref.update({ "payout.nextCheckAt": due });
  },
);

/**
 * Admin "Check with Razorpay now": the given orders, or every followed order
 * that is due within the next day. Returns what changed.
 */
export const syncPayoutsNow = onCall(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET], timeoutSeconds: 300 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    if (!(await callerIsAdmin(uid, request.auth?.token?.phone_number as string))) {
      throw new HttpsError("permission-denied", "Admins only.");
    }
    const now = Date.now();
    const ids = Array.isArray(request.data?.orderIds)
      ? (request.data.orderIds as unknown[]).map(String).filter((s) => /^[A-Za-z0-9_-]{1,120}$/.test(s)).slice(0, 100)
      : [];
    const docs = ids.length
      ? await admin.firestore().getAll(...ids.map((id) => admin.firestore().doc(`orders/${id}`)))
      : await dueOrders(now + DAY, 300);
    let checked = 0, changed = 0, errors = 0;
    for (let i = 0; i < docs.length; i += 50) {
      const r = await syncOrders(docs.slice(i, i + 50), now);
      checked += r.checked; changed += r.changed; errors += r.errors;
    }
    return { checked, changed, errors };
  },
);
