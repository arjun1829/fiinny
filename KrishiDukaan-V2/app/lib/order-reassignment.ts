import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { refundOrder } from "./order-refund";
import { computeSellerSplit } from "./route-split";
import { loadRouteConfig, resolveSellerAccount } from "./route-server";
import { createHeldTransferForSeller, reverseOrderSellerTransfer } from "./route-transfers";
import { grossFor, type OrderLike } from "../dashboard/_lib/seller-earnings";

/**
 * Seller reassignment — a rejected order offered to other sellers before the
 * customer is refunded.
 *
 * THE RULE (as agreed)
 *   1. Only the FIRST rejection starts a reassignment. If the replacement seller
 *      rejects too, the customer is refunded — one round, no loops.
 *   2. Eligible: every seller offering EVERY product in the order for online
 *      delivery, other than whoever already rejected it.
 *   3. The window is 24h from that first rejection. First accept wins.
 *   4. Nobody accepts, everyone declines, or the customer cancels → refund.
 *
 * STATE
 *   order.status        'reassigning' for the whole window
 *   order.reassignment  { status: 'open' | 'accepted' | 'refunding' | 'closed', ... }
 *   sellerOffers/{phoneKey}/offers/{orderId}  one per candidate — what the
 *                        candidate may see before accepting (no address, no
 *                        phone). Keyed by seller in the PATH so firestore.rules
 *                        can prove a list query only returns the caller's own
 *                        offers; a field-based rule can't, and would let any
 *                        signed-in user list every seller's offers.
 *
 * MONEY
 *   - The rejecting seller's held Route transfer is reversed when the order
 *     enters reassignment. They are never paid for an order they rejected,
 *     whatever happens next.
 *   - The accepting seller gets a fresh HELD transfer from the same payment,
 *     released on delivery like any order. If that can't be created they are
 *     paid by the manual payout run, which checks Razorpay first, so either
 *     way exactly once.
 *   - Every refund goes through refundOrder, the one refund implementation.
 *
 * CONCURRENCY
 *   Accept and every refund exit take the same transactional gate on
 *   `reassignment.status === 'open'`. Two sellers accepting together, or an
 *   accept racing the expiry sweep, resolve to exactly one winner.
 */

export const REASSIGN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A refund lock older than this, still unfinished, is safe to retry. */
const STALE_LOCK_MS = 15 * 60 * 1000;

function phoneKey(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(-10);
}

function phoneVariants(phone: string): string[] {
  const p = phone.trim();
  if (!p) return [];
  const out = new Set([p]);
  if (p.startsWith("+91")) out.add(p.slice(3));
  else out.add(`+91${p}`);
  return Array.from(out);
}

function firstPhone(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    const stripped = s.startsWith("+91") ? s.slice(3) : s;
    if (/^\d{10,13}$/.test(stripped)) return s;
  }
  return "";
}

export function offerRef(orderId: string, sellerPhone: string): FirebaseFirestore.DocumentReference {
  return getAdminDb()
    .collection("sellerOffers")
    .doc(phoneKey(sellerPhone))
    .collection("offers")
    .doc(orderId);
}

function candidatesOf(order: FirebaseFirestore.DocumentData): string[] {
  const c = order.reassignment?.candidatePhones;
  return Array.isArray(c) ? (c as string[]) : [];
}

function orderItems(order: FirebaseFirestore.DocumentData): Array<Record<string, unknown>> {
  return Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
}

function itemProductId(item: Record<string, unknown>): string {
  return String(item.catalogId ?? item.productId ?? "").trim();
}

// ─── Eligibility ─────────────────────────────────────────────────────────

/**
 * Every seller offering [productId] for ONLINE delivery, keyed by phone.
 *
 * Same rule the marketplace uses to show a Buy button, and the same one the
 * abandoned-checkout enquiries use (functions/src/notifications/enquiries.ts —
 * restated here because functions/ builds separately): the listing must not be
 * offline-only, and the seller's account-level Online Delivery flag must not
 * be EXPLICITLY off (most live seller docs predate that field, so a missing
 * flag counts as on).
 */
async function onlineSellersForProduct(productId: string): Promise<Map<string, string>> {
  const db = getAdminDb();
  const found = new Map<string, string>(); // phoneKey -> phone as stored
  const add = (raw: unknown) => {
    const phone = firstPhone(raw);
    const key = phoneKey(phone);
    if (key && !found.has(key)) found.set(key, phone);
  };

  const snap = await db.collection("products").doc(productId).get();
  if (!snap.exists) return found;
  const d = snap.data() ?? {};
  const canonicalId = String(d.originalProductId ?? d.manufacturerProductId ?? productId);
  let canonical = d;
  if (canonicalId !== productId) {
    const c = await db.collection("products").doc(canonicalId).get();
    if (c.exists) canonical = c.data() ?? {};
  }

  const online = (p: Record<string, unknown>) =>
    p.sellMode !== "offline_store_only" && p.isOnline !== false && p.isActive !== false;

  for (const av of Array.isArray(canonical.availability)
    ? (canonical.availability as Record<string, unknown>[])
    : []) {
    if (av.isOnline === true) add(av.storePhone ?? av.storeId);
  }
  if (online(canonical)) {
    add(canonical.retailerPhone ?? canonical.ownerPhone ?? canonical.manufacturerPhone);
  }
  for (const field of ["originalProductId", "manufacturerProductId"]) {
    const copies = await db
      .collection("products")
      .where(field, "==", canonicalId)
      .limit(100)
      .get()
      .catch(() => null);
    for (const doc of copies?.docs ?? []) {
      const c = doc.data() ?? {};
      if (online(c)) add(c.retailerPhone ?? c.ownerPhone);
    }
  }

  // Account-level Online Delivery gate.
  for (const [key, phone] of Array.from(found.entries())) {
    for (const variant of phoneVariants(phone)) {
      const u = await db.collection("users").doc(variant).get().catch(() => null);
      if (!u?.exists) continue;
      if (u.data()?.onlineDelivery === false) found.delete(key);
      break;
    }
  }
  return found;
}

/** Sellers who sell EVERY product in the order online, minus `exclude`. */
export async function findReassignmentCandidates(
  order: FirebaseFirestore.DocumentData,
  exclude: string[],
): Promise<string[]> {
  const productIds = Array.from(new Set(orderItems(order).map(itemProductId).filter(Boolean)));
  if (productIds.length === 0) return [];

  const perProduct = await Promise.all(productIds.map(onlineSellersForProduct));
  const excluded = new Set(exclude.map(phoneKey).filter(Boolean));

  // Intersection: a candidate must be able to deliver the whole order.
  const [first, ...rest] = perProduct;
  const out: string[] = [];
  for (const [key, phone] of Array.from(first!.entries())) {
    if (excluded.has(key)) continue;
    if (rest.every((m) => m.has(key))) out.push(phone);
  }
  return out;
}

// ─── Offer content ───────────────────────────────────────────────────────

/** City/pincode only — enough to judge "can I deliver there", nothing that
 *  identifies the customer before a seller has committed to the order. */
function deliveryArea(order: FirebaseFirestore.DocumentData): { city: string; pincode: string } {
  const a = order.customerAddress;
  if (a && typeof a === "object") {
    const m = a as Record<string, unknown>;
    return { city: String(m.city ?? "").trim(), pincode: String(m.pincode ?? "").trim() };
  }
  const text = String(a ?? "");
  const pin = text.match(/\b\d{6}\b/)?.[0] ?? "";
  return { city: "", pincode: pin };
}

function grossPaiseOf(orderId: string, order: FirebaseFirestore.DocumentData): number {
  return Math.round(grossFor({ id: orderId, ...(order as object) } as OrderLike) * 100);
}

// ─── Start ───────────────────────────────────────────────────────────────

export type StartOutcome =
  | { ok: true; reassigning: true; candidates: number }
  | { ok: true; reassigning: false }
  | { ok: false; status: number; error: string };

/**
 * Tries to move a just-rejected order into reassignment. `reassigning: false`
 * means there is nobody to offer it to — the caller refunds as before.
 */
export async function startReassignment(params: {
  orderId: string;
  order: FirebaseFirestore.DocumentData;
  reason: string;
  rejectedByUid: string;
}): Promise<StartOutcome> {
  const { orderId, order, reason, rejectedByUid } = params;
  const db = getAdminDb();
  const rejecter = String(order.sellerPhone ?? order.sellerId ?? "");

  const candidates = await findReassignmentCandidates(order, [rejecter]);
  if (candidates.length === 0) return { ok: true, reassigning: false };

  // The rejecting seller's money comes back to the platform NOW. If this fails
  // nothing else happens — no offers, no status change — so the order is left
  // exactly as it was and the seller sees an error to retry.
  const reversal = await reverseOrderSellerTransfer(orderId, order);
  if (reversal.ok === false) return { ok: false, status: 502, error: reversal.error };

  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + REASSIGN_WINDOW_MS);
  const nowIso = new Date(now).toISOString();
  const area = deliveryArea(order);
  const items = orderItems(order).map((i) => ({
    name: String(i.name ?? "Product"),
    qty: Math.max(1, Math.floor(Number(i.quantity ?? i.qty ?? 1))),
    variantLabel: String(i.variantLabel ?? i.variantUnit ?? i.unit ?? ""),
    price: Number(i.price ?? 0),
  }));
  const itemSummary =
    items.length === 0
      ? "an order"
      : `${items[0]!.name}${items.length > 1 ? ` +${items.length - 1} more` : ""}`;

  const grossPaise = grossPaiseOf(orderId, order);
  let sellerEarning: number | null = null;
  try {
    sellerEarning = computeSellerSplit(grossPaise, await loadRouteConfig()).transferPaise / 100;
  } catch {
    sellerEarning = null;
  }

  const ref = db.collection("orders").doc(orderId);
  let raced = false;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const f = fresh.data() ?? {};
    // Re-check inside the transaction: another request may have rejected,
    // cancelled or moved this order since the caller read it.
    if (f.status !== "placed" && f.status !== "accepted") {
      raced = true;
      return;
    }
    tx.update(ref, {
      status: "reassigning",
      statusHistory: FieldValue.arrayUnion({ status: "reassigning", at: nowIso }),
      rejectionReason: reason,
      reassignment: {
        round: 1,
        status: "open",
        fromSellerPhone: rejecter,
        fromSellerName: String(order.sellerName ?? ""),
        rejectedByUid,
        rejectedAt: nowIso,
        rejectionReason: reason,
        candidatePhones: candidates,
        expiresAt,
        originalTransferReversal: reversal.transferId
          ? { transferId: reversal.transferId, reversalId: reversal.reversalId, paise: reversal.reversedPaise }
          : null,
      },
      updatedAt: nowIso,
    });
    for (const phone of candidates) {
      tx.set(offerRef(orderId, phone), {
        orderId,
        sellerPhone: phone,
        sellerPhones: phoneVariants(phone),
        status: "open",
        items,
        itemSummary,
        orderValue: grossPaise / 100,
        sellerEarning,
        deliveryCity: area.city,
        deliveryPincode: area.pincode,
        expiresAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  });

  if (raced) {
    // The rejecting seller's transfer was already reversed above. That is the
    // safe side of this race — whatever the order became (cancelled, rejected
    // by an admin), the seller who rejected it is not owed money for it.
    console.error("[reassignment] order changed mid-reject; transfer already reversed", {
      orderId,
      reversal,
    });
    return { ok: false, status: 409, error: "This order changed while it was being rejected. Refresh and try again." };
  }
  return { ok: true, reassigning: true, candidates: candidates.length };
}

// ─── Accept / decline ────────────────────────────────────────────────────

export type AcceptOutcome =
  | { ok: true; transfer: "created" | "not_linked" | "no_payment" | "failed" }
  | { ok: false; status: number; error: string };

/**
 * First accept wins. The whole claim — seller swap, status, offer state — is
 * one transaction, so a second accepter sees the order already taken.
 */
export async function acceptReassignment(orderId: string, sellerPhone: string): Promise<AcceptOutcome> {
  const db = getAdminDb();
  const ref = db.collection("orders").doc(orderId);
  const myOffer = offerRef(orderId, sellerPhone);
  const seller = await resolveSellerAccount(sellerPhone);
  const nowIso = new Date().toISOString();

  let failure: { status: number; error: string } | null = null;
  let claimed: FirebaseFirestore.DocumentData | null = null;

  await db.runTransaction(async (tx) => {
    const [snap, offerSnap] = await Promise.all([tx.get(ref), tx.get(myOffer)]);
    if (!snap.exists) {
      failure = { status: 404, error: "Order not found." };
      return;
    }
    const o = snap.data()!;
    const r = (o.reassignment ?? {}) as Record<string, unknown>;
    const expiresMs = (r.expiresAt as Timestamp | undefined)?.toMillis?.() ?? 0;
    const isCandidate = Array.isArray(r.candidatePhones) &&
      (r.candidatePhones as string[]).some((p) => phoneKey(p) === phoneKey(sellerPhone));

    if (o.status !== "reassigning" || r.status !== "open") {
      failure = { status: 409, error: "Another seller has already taken this order, or it has closed." };
      return;
    }
    if (Date.now() >= expiresMs) {
      failure = { status: 409, error: "This request has expired." };
      return;
    }
    if (!isCandidate || !offerSnap.exists || offerSnap.data()?.status !== "open") {
      failure = { status: 403, error: "This request is not open to you." };
      return;
    }

    tx.update(ref, {
      sellerPhone,
      sellerId: sellerPhone,
      sellerName: seller?.shopName || sellerPhone,
      sellerType: seller?.collection === "manufacturers" ? "manufacturer" : "retailer",
      status: "accepted",
      statusHistory: FieldValue.arrayUnion({ status: "accepted", at: nowIso, reassigned: true }),
      "reassignment.status": "accepted",
      "reassignment.acceptedBy": sellerPhone,
      "reassignment.acceptedAt": nowIso,
      updatedAt: nowIso,
    });
    tx.update(myOffer, { status: "accepted", updatedAt: nowIso });
    claimed = o;
  });

  if (failure) return { ok: false, ...(failure as { status: number; error: string }) };
  const original = claimed as FirebaseFirestore.DocumentData | null;
  if (!original) return { ok: false, status: 500, error: "Could not take the order." };

  // Everything below runs only for the single winner, after the claim is
  // committed. Each step is independent and non-fatal to the claim.

  await closeOtherOffers(orderId, candidatesOf(original), "taken");
  await decrementSellerStock(original, sellerPhone);

  const paymentId = String(original.payment?.razorpayPaymentId ?? "").trim();
  const transfer = await createHeldTransferForSeller(
    orderId,
    paymentId,
    sellerPhone,
    grossPaiseOf(orderId, original),
  );
  await ref.update({
    "reassignment.transfer":
      transfer.status === "created"
        ? { status: "created", id: transfer.transferId, amountPaise: transfer.amountPaise }
        : { status: transfer.status, ...(transfer.status === "failed" ? { error: transfer.error } : {}) },
    ...(transfer.status === "created"
      ? { routeTransfer: { id: transfer.transferId, sellerKey: sellerPhone, amountPaise: transfer.amountPaise, via: "reassignment" } }
      : {}),
    updatedAt: new Date().toISOString(),
  });
  if (transfer.status === "failed") {
    console.error("[reassignment] held transfer not created — manual payout will cover it", orderId, transfer.error);
  }

  return { ok: true, transfer: transfer.status };
}

export async function declineReassignment(
  orderId: string,
  sellerPhone: string,
): Promise<{ ok: true; refunded: boolean } | { ok: false; status: number; error: string }> {
  const db = getAdminDb();
  const mine = offerRef(orderId, sellerPhone);
  const offer = await mine.get();
  if (!offer.exists || offer.data()?.status !== "open") {
    return { ok: false, status: 409, error: "This request is no longer open." };
  }
  await mine.update({ status: "declined", updatedAt: new Date().toISOString() });

  // Nobody left to ask: refund now rather than making the customer wait out
  // the rest of 24h for an answer that can no longer come.
  const order = (await db.collection("orders").doc(orderId).get()).data() ?? {};
  const others = await Promise.all(candidatesOf(order).map((p) => offerRef(orderId, p).get()));
  if (others.some((d) => d.exists && d.data()?.status === "open")) {
    return { ok: true, refunded: false };
  }

  const res = await finalizeReassignmentRefund(orderId, {
    finalStatus: "rejected",
    reason: "No other seller could take this order",
    trigger: "all_declined",
  });
  return { ok: true, refunded: res.ok };
}

// ─── Exits ───────────────────────────────────────────────────────────────

async function closeOtherOffers(
  orderId: string,
  candidates: string[],
  to: "taken" | "expired",
): Promise<void> {
  const db = getAdminDb();
  const snaps = await Promise.all(candidates.map((p) => offerRef(orderId, p).get()));
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const d of snaps) {
    if (d.exists && d.data()?.status === "open") batch.update(d.ref, { status: to, updatedAt: now });
  }
  await batch.commit();
}

export type FinalizeOutcome =
  | { ok: true; refunded: boolean }
  | { ok: false; status: number; error: string };

/**
 * The one way out of reassignment that isn't an accept: refund (when paid) and
 * close the order. Used by the expiry sweep, "everyone declined", and a
 * customer cancelling during the window.
 *
 * Takes the lock transactionally before touching money, so this and an accept
 * can never both succeed, and two sweeps can never refund twice. A lock left
 * behind by a crash mid-refund is retried once it goes stale; refundOrder's own
 * refundId check stops a second refund if the first one actually landed.
 */
export async function finalizeReassignmentRefund(
  orderId: string,
  opts: {
    finalStatus: "rejected" | "cancelled";
    reason: string;
    trigger: "expired" | "all_declined" | "customer_cancel";
    requireExpired?: boolean;
    customerUid?: string;
    customerPhone?: string;
  },
): Promise<FinalizeOutcome> {
  const db = getAdminDb();
  const ref = db.collection("orders").doc(orderId);
  const nowIso = new Date().toISOString();

  let failure: { status: number; error: string } | null = null;
  let order: FirebaseFirestore.DocumentData | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      failure = { status: 404, error: "Order not found." };
      return;
    }
    const o = snap.data()!;
    const r = (o.reassignment ?? {}) as Record<string, unknown>;
    if (o.status !== "reassigning") {
      failure = { status: 409, error: `Order is ${o.status}, not awaiting a new seller.` };
      return;
    }
    const lockedAtMs = r.lockedAt ? Date.parse(String(r.lockedAt)) : 0;
    const staleLock = r.status === "refunding" && Date.now() - lockedAtMs > STALE_LOCK_MS;
    if (r.status !== "open" && !staleLock) {
      failure = { status: 409, error: "This order is already being closed." };
      return;
    }
    if (opts.requireExpired) {
      const expiresMs = (r.expiresAt as Timestamp | undefined)?.toMillis?.() ?? 0;
      if (Date.now() < expiresMs && !staleLock) {
        failure = { status: 409, error: "Not expired yet." };
        return;
      }
    }
    if (opts.trigger === "customer_cancel") {
      const owns =
        (opts.customerUid && o.customerId === opts.customerUid) ||
        (opts.customerPhone && phoneKey(o.customerPhone) === phoneKey(opts.customerPhone));
      if (!owns) {
        failure = { status: 403, error: "This is not your order." };
        return;
      }
    }
    tx.update(ref, {
      "reassignment.status": "refunding",
      "reassignment.lockedAt": nowIso,
      "reassignment.closeTrigger": opts.trigger,
    });
    order = o;
  });

  if (failure) return { ok: false, ...(failure as { status: number; error: string }) };
  const o = order as FirebaseFirestore.DocumentData | null;
  if (!o) return { ok: false, status: 500, error: "Could not close the order." };

  const paid = Boolean(o.payment?.razorpayPaymentId) && !o.payment?.refundId;
  if (paid) {
    const refund = await refundOrder({ orderId, reason: opts.reason });
    if (refund.ok === false) {
      // Leave the lock in place with the error: the order stays visibly stuck
      // in 'refunding' for admin rather than looking settled, and the sweep
      // retries it once the lock is stale.
      await ref.update({ "reassignment.refundError": refund.error, updatedAt: new Date().toISOString() });
      return { ok: false, status: refund.status, error: refund.error };
    }
  }

  await ref.update({
    status: opts.finalStatus,
    statusHistory: FieldValue.arrayUnion({ status: opts.finalStatus, at: new Date().toISOString() }),
    "reassignment.status": "closed",
    "reassignment.closedAt": new Date().toISOString(),
    "reassignment.refundError": FieldValue.delete(),
    ...(opts.finalStatus === "cancelled" ? { cancellationReason: opts.reason } : {}),
    updatedAt: new Date().toISOString(),
  });
  await closeOtherOffers(orderId, candidatesOf(o), "expired");
  return { ok: true, refunded: paid };
}

// ─── Stock ───────────────────────────────────────────────────────────────

/**
 * Takes the order's quantities off the NEW seller's stock — what
 * decrementStockOnOrder (functions/src/index.ts) did for the original seller
 * when the order was created. Best-effort, like that trigger: a seller whose
 * copy has no numeric stock field simply isn't decremented.
 */
async function decrementSellerStock(order: FirebaseFirestore.DocumentData, sellerPhone: string): Promise<void> {
  const db = getAdminDb();
  for (const item of orderItems(order)) {
    const qty = Math.max(1, Math.floor(Number(item.quantity ?? item.qty ?? 1)));
    const productId = itemProductId(item);
    if (!productId) continue;
    try {
      const snap = await db.collection("products").doc(productId).get();
      const d = snap.data() ?? {};
      const canonicalId = String(d.originalProductId ?? d.manufacturerProductId ?? productId);

      let copyRef: FirebaseFirestore.DocumentReference | null = null;
      for (const field of ["manufacturerProductId", "originalProductId"]) {
        for (const sellerField of ["retailerPhone", "ownerPhone"]) {
          if (copyRef) break;
          const q = await db
            .collection("products")
            .where(field, "==", canonicalId)
            .where(sellerField, "==", sellerPhone)
            .limit(1)
            .get();
          if (!q.empty) copyRef = q.docs[0]!.ref;
        }
      }
      // The new seller may own the canonical product itself.
      if (!copyRef) {
        const c = await db.collection("products").doc(canonicalId).get();
        const cd = c.data() ?? {};
        if (phoneKey(cd.retailerPhone ?? cd.ownerPhone ?? cd.manufacturerPhone) === phoneKey(sellerPhone)) {
          copyRef = c.ref;
        }
      }
      if (copyRef) {
        await copyRef.update({ stockQuantity: FieldValue.increment(-qty) }).catch(() => undefined);
      }
    } catch (e) {
      console.warn("[reassignment] stock decrement skipped", productId, e);
    }
  }
}
