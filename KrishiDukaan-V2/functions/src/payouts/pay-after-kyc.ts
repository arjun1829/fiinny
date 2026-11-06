/**
 * Pays sellers automatically once their KYC is verified.
 *
 * WHY
 * Sellers may sell before finishing KYC. An online order from a seller with no
 * Razorpay Route account has no transfer at checkout, so the whole payment
 * stays with KrishiDukan. Razorpay settles it to KrishiDukan's bank in about
 * two days, so it is not "on hold in Razorpay" for long: a transfer tied to
 * that payment would fail later. This job pays those orders from KrishiDukan's
 * Razorpay balance (POST /transfers, the same kind of transfer the admin
 * payout run makes) once the seller can be paid. New orders after
 * verification are split at checkout like any Route seller.
 *
 * WHEN AN ORDER IS PAID (all of these)
 *   - settings/payouts.transfersEnabled AND settings/payouts.autoPayout are on
 *     (both default off; admins switch them in Seller payments → Payout run).
 *   - The seller's payoutAccounts doc is verified with a linked account id, and
 *     24 hours have passed since verification and since the account was
 *     created (Razorpay's cooling period for new linked accounts).
 *   - The order was paid online, is delivered, and PAYOUT_HOLD_DAYS have
 *     passed since delivery (the same hold as the payout run, so the customer
 *     stays protected).
 *   - Nothing has paid it: no payment.transferId, no claim, and Razorpay shows
 *     no live Route transfer for this seller on the payment.
 *
 * HOW MUCH
 * Exactly what a Route seller nets at checkout: the order total less any
 * refund, less KrishiDukan's commission and the gateway fee from settings/route
 * (computeSellerSplit in app/lib/route-split.ts; mirrored here, a test checks
 * they agree).
 *
 * NEVER TWICE
 *   - Each order is claimed in a transaction (payment.payoutClaim) before any
 *     money moves; a claimed order is skipped by this job and the payout run.
 *   - If the transfer fails, the claim is removed and the error kept; the
 *     order is tried again after RETRY_AFTER_MS.
 *   - If the job stops after the transfer but before writing it down, the
 *     claim stays and the order is never paid again automatically; the admin
 *     page lists it to check against Razorpay.
 *
 * Writes the same fields as the payout run (payment.transferId, transferredAt,
 * transferredNet), so every seller and admin screen, refunds and the payout
 * status sync treat it the same way.
 */
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { matchOrderTransfer, type RazorpayTransfer } from "./payout-status";

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
const RAZORPAY_API = "https://api.razorpay.com/v1";
const REGION = "asia-south1";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Same as PAYOUT_HOLD_DAYS in app/dashboard/_lib/seller-earnings.ts. */
export const PAYOUT_HOLD_DAYS = 7;
/** Razorpay accepts transfers to a new linked account only after a day. */
export const COOLING_MS = DAY;
/** Wait this long after a failed transfer before trying the order again. */
export const RETRY_AFTER_MS = 6 * HOUR;
/** Orders per transfer: the order ids go in the transfer's notes (256 chars). */
const ORDERS_PER_TRANSFER = 10;
const LINKED_ID_RE = /^acc_[A-Za-z0-9]{14}$/;

// ─── Split maths: mirror of app/lib/route-split.ts ──────────────────────────

export interface RouteConfig {
  commissionPercent: number;
  gatewayFeePercent: number;
  gatewayFeeGstPercent: number;
  feeBearer: "seller" | "platform";
}

export const DEFAULT_ROUTE_CONFIG: RouteConfig = {
  commissionPercent: 1,
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
  feeBearer: "seller",
};

/** settings/route, or null when a rate is missing or out of range. */
export function parseRouteConfig(raw: unknown): RouteConfig | null {
  const d = raw as Partial<RouteConfig> | null | undefined;
  if (!d || typeof d !== "object") return null;
  const pct = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const c = pct(d.commissionPercent);
  const g = pct(d.gatewayFeePercent);
  const t = pct(d.gatewayFeeGstPercent);
  if (c === null || g === null || t === null) return null;
  return { commissionPercent: c, gatewayFeePercent: g, gatewayFeeGstPercent: t, feeBearer: d.feeBearer === "platform" ? "platform" : "seller" };
}

function pctOfPaise(paise: number, percent: number): number {
  if (percent <= 0) return 0;
  return Math.ceil((paise * Math.round(percent * 100)) / 10_000);
}

export interface SellerSplit {
  grossPaise: number;
  commissionPaise: number;
  gatewayFeePaise: number;
  transferPaise: number;
}

/** What reaches the seller from `grossPaise`; null when fees would eat it all. */
export function computeSellerSplit(grossPaise: number, config: RouteConfig): SellerSplit | null {
  const gross = Math.round(Number(grossPaise));
  if (!Number.isFinite(gross) || gross <= 0) return null;
  const commissionPaise = pctOfPaise(gross, config.commissionPercent);
  const feeBase = pctOfPaise(gross, config.gatewayFeePercent);
  const gatewayFeePaise = config.feeBearer === "seller" ? feeBase + pctOfPaise(feeBase, config.gatewayFeeGstPercent) : 0;
  const transferPaise = gross - commissionPaise - gatewayFeePaise;
  return transferPaise > 0 ? { grossPaise: gross, commissionPaise, gatewayFeePaise, transferPaise } : null;
}

// ─── Planning (pure) ────────────────────────────────────────────────────────

type Order = admin.firestore.DocumentData;

export function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v) || 0;
  const t = v as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  const s = t.seconds ?? t._seconds;
  return typeof s === "number" ? s * 1000 : 0;
}

/** When the order was last marked delivered, from its status history. */
function deliveredAtMs(o: Order): number {
  const h = Array.isArray(o.statusHistory) ? o.statusHistory : [];
  for (let i = h.length - 1; i >= 0; i--) if (h[i]?.status === "delivered") return toMs(h[i]?.at);
  return 0;
}

/** The seller's share before fees: their order total less any refund (paise). */
export function payableGrossPaise(o: Order): number {
  const total = typeof o.total === "number" ? o.total
    : typeof o.grandTotal === "number" ? o.grandTotal
      : (Number(o.subtotal) || 0) + (Number(o.deliveryCharge) || 0) + (Number(o.totalGst) || 0);
  const refunded = Number(o.payment?.refundedAmount ?? 0) || 0;
  return Math.max(0, Math.round((total - refunded) * 100));
}

/** Payout states that mean a Route transfer already carries this seller's money. */
const ROUTED_STATES = new Set(["on_hold", "scheduled", "processing", "settled", "failed", "reversed"]);

export type OrderDecision =
  | { orderId: string; action: "pay"; split: SellerSplit }
  | { orderId: string; action: "wait" | "skip"; reason: string };

/** Whether this job should pay one order now. */
export function decideOrder(orderId: string, o: Order, config: RouteConfig, now: number): OrderDecision {
  const skip = (reason: string): OrderDecision => ({ orderId, action: "skip", reason });
  const wait = (reason: string): OrderDecision => ({ orderId, action: "wait", reason });
  const pay = o.payment ?? {};
  if (!String(pay.razorpayPaymentId ?? "").trim()) return skip("not paid online");
  if (String(pay.transferId ?? "").trim()) return skip("already paid");
  if (pay.payoutClaim) return skip("claimed");
  const status = String(o.status ?? "").toLowerCase();
  if (status !== "delivered") return wait("not delivered");
  if (pay.status === "refunded") return skip("refunded");
  if (ROUTED_STATES.has(String(o.payout?.state ?? ""))) return skip("on Route");
  const delivered = deliveredAtMs(o);
  if (delivered && now - delivered < PAYOUT_HOLD_DAYS * DAY) return wait("in hold after delivery");
  if (toMs(pay.payoutErrorAt) && now - toMs(pay.payoutErrorAt) < RETRY_AFTER_MS) return wait("retrying after a failure");
  const split = computeSellerSplit(payableGrossPaise(o), config);
  if (!split) return skip("nothing payable after fees");
  return { orderId, action: "pay", split };
}

/** When a verified seller can be paid (ms), or null when they can't. */
export function sellerReadyAt(account: Record<string, unknown>): number | null {
  if (account.status !== "verified") return null;
  if (!LINKED_ID_RE.test(String(account.razorpayLinkedAccountId ?? ""))) return null;
  const verified = toMs(account.verifiedAt);
  const created = toMs(account.linkedAccountCreatedAt);
  return Math.max(verified, created) + COOLING_MS;
}

// ─── Razorpay ───────────────────────────────────────────────────────────────

function authHeader(): string {
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`).toString("base64")}`;
}

async function razorpay<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: { Authorization: authHeader(), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ─── Run ────────────────────────────────────────────────────────────────────

/** Every delivered order of one seller, by phone in both stored forms. */
async function deliveredOrders(db: admin.firestore.Firestore, phone: string) {
  const ten = phone.replace(/\D/g, "").slice(-10);
  const forms = Array.from(new Set([phone, ten, `+91${ten}`]));
  const snaps = await Promise.all(
    ["sellerPhone", "sellerId"].map((f) =>
      db.collection("orders").where(f, "in", forms).where("status", "==", "delivered").get()),
  );
  const byId = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  for (const s of snaps) for (const d of s.docs) byId.set(d.id, d);
  return Array.from(byId.values());
}

/** Claims the order for this run, or returns false when someone else has. */
async function claim(db: admin.firestore.Firestore, ref: admin.firestore.DocumentReference, runId: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.get("payment") ?? {};
    if (p.transferId || p.payoutClaim) return false;
    tx.update(ref, { "payment.payoutClaim": { by: "after_kyc", run: runId, at: admin.firestore.FieldValue.serverTimestamp() } });
    return true;
  });
}

export async function payVerifiedSellers(now = Date.now()) {
  const db = admin.firestore();
  const settings = (await db.doc("settings/payouts").get()).data() ?? {};
  if (settings.transfersEnabled !== true || settings.autoPayout !== true) {
    logger.info("[pay-after-kyc] off (settings/payouts.transfersEnabled and autoPayout)");
    return { sellers: 0, transfers: 0, orders: 0, failed: 0 };
  }
  const config = parseRouteConfig((await db.doc("settings/route").get()).data()) ?? DEFAULT_ROUTE_CONFIG;
  const runId = `run_${now}`;
  let sellers = 0, transfers = 0, paidOrders = 0, failed = 0;

  const accounts = await db.collection("payoutAccounts").where("status", "==", "verified").get();
  for (const acc of accounts.docs) {
    const a = acc.data();
    const readyAt = sellerReadyAt(a);
    if (readyAt === null || readyAt > now) continue;
    const phone = acc.id;
    const linked = String(a.razorpayLinkedAccountId);

    const docs = await deliveredOrders(db, phone);
    const due = docs
      .map((d) => ({ doc: d, decision: decideOrder(d.id, d.data(), config, now) }))
      .filter((x) => x.decision.action === "pay");
    if (!due.length) continue;
    sellers++;

    // Ask Razorpay, not our own fields, whether a Route transfer already
    // carries this seller's money on the payment (the payout run does the same).
    const payable: { doc: admin.firestore.QueryDocumentSnapshot; split: SellerSplit }[] = [];
    for (const { doc, decision } of due) {
      const o = doc.data();
      try {
        const r = await razorpay<{ items?: RazorpayTransfer[] }>("GET", `/payments/${encodeURIComponent(o.payment.razorpayPaymentId)}/transfers`);
        const t = matchOrderTransfer(r.items ?? [], o);
        if (t && Number(t.amount ?? 0) - Number(t.amount_reversed ?? 0) > 0) continue;
      } catch (err) {
        logger.warn("[pay-after-kyc] could not check Route transfers; skipping this run", { orderId: doc.id, error: String(err).slice(0, 200) });
        continue;
      }
      if (await claim(db, doc.ref, runId)) payable.push({ doc, split: (decision as { split: SellerSplit }).split });
    }

    for (let i = 0; i < payable.length; i += ORDERS_PER_TRANSFER) {
      const group = payable.slice(i, i + ORDERS_PER_TRANSFER);
      const amount = group.reduce((s, g) => s + g.split.transferPaise, 0);
      const commission = group.reduce((s, g) => s + g.split.commissionPaise, 0);
      try {
        const t = await razorpay<{ id: string }>("POST", "/transfers", {
          account: linked,
          amount,
          currency: "INR",
          notes: {
            sellerKey: phone,
            via: "after_kyc",
            orderCount: String(group.length),
            orderIds: group.map((g) => g.doc.id).join(","),
            commissionPaise: String(commission),
          },
        });
        const batch = db.batch();
        const at = new Date(now).toISOString();
        for (const g of group) {
          batch.update(g.doc.ref, {
            "payment.transferId": t.id,
            "payment.transferredAt": at,
            // This order's own share; refunds reverse exactly this.
            "payment.transferredNet": g.split.transferPaise / 100,
            // KrishiDukan's cut, so the order shows what was deducted.
            "payment.platformFee": g.split.commissionPaise / 100,
            "payment.payoutVia": "after_kyc",
            "payment.payoutSplit": g.split,
            "payment.payoutClaim": admin.firestore.FieldValue.delete(),
            "payment.payoutError": admin.firestore.FieldValue.delete(),
            "payment.payoutErrorAt": admin.firestore.FieldValue.delete(),
          });
        }
        await batch.commit();
        transfers++;
        paidOrders += group.length;
        logger.info("[pay-after-kyc] paid", { phone, transferId: t.id, amount, orders: group.length });
      } catch (err) {
        failed += group.length;
        const message = String(err instanceof Error ? err.message : err).slice(0, 300);
        logger.error("[pay-after-kyc] transfer failed", { phone, amount, error: message });
        const batch = db.batch();
        for (const g of group) {
          batch.update(g.doc.ref, {
            "payment.payoutClaim": admin.firestore.FieldValue.delete(),
            "payment.payoutError": message,
            "payment.payoutErrorAt": now,
          });
        }
        await batch.commit().catch((e) => logger.error("[pay-after-kyc] could not release claims", { phone, error: String(e) }));
      }
    }
  }
  logger.info("[pay-after-kyc] run", { sellers, transfers, orders: paidOrders, failed });
  return { sellers, transfers, orders: paidOrders, failed };
}

export const payAfterKyc = onSchedule(
  { schedule: "every 60 minutes", region: REGION, timeZone: "Asia/Kolkata", secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET], timeoutSeconds: 540 },
  async () => {
    await payVerifiedSellers();
  },
);
