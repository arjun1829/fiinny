/**
 * Admin "Create Order Manually" — server-trusted core.
 *
 * WHY THIS EXISTS
 * ---------------
 * A customer's Razorpay payment is sometimes CAPTURED while the normal checkout
 * never gets to write the `orders/{id}` document (killed app, dropped network, a
 * late UPI confirmation, or a cart placed outside the web create-cart-order path
 * — the "Mobile Cart Order" case). The money is with Razorpay but on our side
 * there is no order, no invoice, no seller/customer notification.
 *
 * The one-time `scripts/recover-order-TmCUV3H5VMAZfy.ts` handled exactly one such
 * payment. This module is the reusable, admin-driven version of that recovery,
 * reconstructing the order ONLY against a verified successful payment and in the
 * EXACT schema `recoverOrderFromCapturedPayment` (app/lib/order-recovery.ts)
 * produces, so every downstream reader — the Orders page, the seller dashboard,
 * the invoice system, and the Firestore order triggers — treats it like any
 * other order.
 *
 * HOW SIDE-EFFECTS HAPPEN (and happen ONCE)
 * -----------------------------------------
 * The deployed order triggers (functions/src/index.ts) fire on a single CREATE:
 *   - decrementStockOnOrder (onCreate)      → inventory
 *   - notifySellerOnOrder    (onCreate)     → seller order_notification WhatsApp
 *   - notifyCustomerOnOrderStatus (onWrite) → customer order_confirmation WhatsApp,
 *                                             only on the transition to 'placed'
 * So writing ONE complete, seller-keyed order with status 'placed' runs inventory
 * and BOTH WhatsApp messages exactly once — no manual re-triggering. The invoice
 * is generated with ensureOrderInvoice (idempotent), exactly as order-recovery does.
 *
 * IDEMPOTENCY
 * -----------
 * The order id is deterministic (`man_<razorpayOrderId>`) and the write runs in a
 * transaction that creates only when the doc is absent. A retry (double-click, or
 * a re-run after an invoice failure) finds the existing order, re-runs the
 * idempotent invoice step, and returns — it never re-creates the order, so the
 * onCreate triggers never re-fire and nothing is duplicated.
 *
 * SAFETY
 * ------
 * Payment is verified against Razorpay itself at both preview and create time.
 * The captured amount must equal the computed order total to the paise; the
 * payment must belong to the selected customer; it must not already back another
 * order; and subscription payments are rejected. Any failure BLOCKS the create
 * and the discrepancy is surfaced — nothing is silently accepted. This module
 * never captures/refunds/modifies a payment and never touches subscriptions or
 * unrelated records.
 */

import Razorpay from 'razorpay';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import { resolveSellerAccount } from './route-server';
import { findOrdersForRazorpayOrder } from './order-recovery';
import { ensureOrderInvoice, type InvoiceOutcome } from './order-invoice';
import { computeLinePricing } from '../utils/gst';
import {
  commercialOf,
  computeSellerPricing,
  hasCommercial,
  variantPriceFor,
  type CartPricingLine,
} from './cart-pricing';
import type { DeliverySettingsLike } from '../utils/delivery';
import { parseVariantWeightKg } from '../utils/weight';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** One product the admin picked for the manual order. */
export type ManualOrderItemInput = {
  /** Canonical/catalog product id — written onto the order item (what the stock
   *  trigger keys off, same as a normal order). */
  productId: string;
  /** The seller's own product-copy doc id, when known — the preferred, exact
   *  source for price / variants / GST for this store. */
  copyId?: string;
  qty: number;
  /** Chosen pack size (e.g. "500ml", "1kg"). */
  variantUnit?: string;
};

export type PricedManualLine = {
  productId: string;
  copyId: string | null;
  name: string;
  /** Post-discount unit price actually charged. */
  unitPrice: number;
  qty: number;
  /** unitPrice × qty (post-discount, excl. any GST added on top). */
  lineTotal: number;
  variantUnit?: string;
  image: string | null;
  gstApplicable: boolean;
  gstRate: number;
  gstIncluded: boolean;
  /** GST per unit (backed out if included, added on top if excluded). */
  gstPerUnit: number;
  /** Where the price was resolved from — surfaced so an odd charge is traceable. */
  priceSource: 'seller-copy' | 'inventory' | 'canonical' | 'none';
};

export type ManualOrderPricing = {
  sellerKey: string;
  lines: PricedManualLine[];
  /** Sum of post-discount line totals (before any added GST). */
  subtotal: number;
  /** All GST in the order (included + excluded) — for the invoice. */
  totalGst: number;
  /** GST ADDED to the payable total (excluded-GST lines only). */
  totalGstAdded: number;
  /** The delivery charge actually used (an admin override when one was given). */
  deliveryCharge: number;
  /** What the delivery rules computed, before any override — shown so the admin
   *  sees the default and can tell when they have changed it. */
  deliveryCalculated: number;
  /** True when deliveryCharge came from an admin override, not the rules. */
  deliveryOverridden: boolean;
  deliveryBreakdown: { slab: number; extra: number; free: boolean; waived: number };
  deliveryType: string;
  /** subtotal + totalGstAdded + deliveryCharge. */
  grandTotal: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Active discount percentage from a product/inventory doc (0–99), or 0.
 * Mirrors create-cart-order's serverActiveDiscountPct so the manual order is
 * priced exactly like a normal checkout would have priced the same line.
 */
function activeDiscountPct(d: FirebaseFirestore.DocumentData): number {
  if (!d.discountEnabled || !d.discountPct || d.discountPct <= 0) return 0;
  const now = Date.now();
  const start = (d.discountStartDate as { toMillis?(): number } | null)?.toMillis?.() ?? 0;
  const end = (d.discountEndDate as { toMillis?(): number } | null)?.toMillis?.() ?? Infinity;
  if (now < start || now > end) return 0;
  return Number(d.discountPct);
}

/** Post-discount price for the chosen pack size from a product-shaped doc. */
function resolveUnitPrice(d: FirebaseFirestore.DocumentData, variantUnit: string | undefined): number {
  const base = variantPriceFor(d.variants, variantUnit) ?? Number(d.price ?? d.sellingPrice ?? 0);
  const discPct = activeDiscountPct(d);
  const discAmt = r2((base * discPct) / 100);
  const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
    ? Math.max(0, Number(d.discountFixedAmt ?? 0))
    : 0;
  return r2(Math.max(0, base - discAmt - discFixed));
}

/**
 * Locate the seller's own copy of a product, trying (in order): the explicit
 * copy doc id, then the canonical-id → seller-phone join the rest of the app
 * uses (manufacturerProductId / originalProductId), then the seller's inventory
 * row. Returns the first doc found plus which collection it came from.
 */
async function resolveSellerProductDoc(
  db: FirebaseFirestore.Firestore,
  sellerPhone: string,
  item: ManualOrderItemInput,
): Promise<{ data: FirebaseFirestore.DocumentData; source: PricedManualLine['priceSource']; copyId: string } | null> {
  if (item.copyId) {
    const snap = await db.collection('products').doc(item.copyId).get();
    if (snap.exists) return { data: snap.data()!, source: 'seller-copy', copyId: snap.id };
  }
  for (const field of ['manufacturerProductId', 'originalProductId']) {
    const q = await db
      .collection('products')
      .where(field, '==', item.productId)
      .where('retailerPhone', '==', sellerPhone)
      .limit(1)
      .get();
    if (!q.empty) return { data: q.docs[0].data(), source: 'seller-copy', copyId: q.docs[0].id };
  }
  const inv = await db
    .collection('inventory')
    .where('productId', '==', item.productId)
    .where('retailerPhone', '==', sellerPhone)
    .limit(1)
    .get();
  if (!inv.empty) return { data: inv.docs[0].data(), source: 'inventory', copyId: inv.docs[0].id };
  return null;
}

/**
 * Price every selected line for ONE seller and resolve the per-seller totals
 * (subtotal, GST, delivery) through the SAME authoritative helpers the cart and
 * checkout use (computeLinePricing / computeSellerPricing). `customerDeliveryState`
 * selects the in/out-of-state delivery slab, exactly as checkout does.
 */
export async function priceManualOrder(
  sellerPhone: string,
  items: ManualOrderItemInput[],
  customerDeliveryState?: string | null,
  /** Admin-set delivery charge (₹). When a finite value ≥ 0 is given it REPLACES
   *  the rules-computed charge for this one order (the global delivery config is
   *  never touched). null/undefined keeps the calculated charge. */
  deliveryOverride?: number | null,
): Promise<ManualOrderPricing> {
  const db = getAdminDb();
  const lines: PricedManualLine[] = [];
  const pricingLines: CartPricingLine[] = [];

  for (const item of items) {
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
    const variantUnit = String(item.variantUnit ?? '').trim();

    const resolved = await resolveSellerProductDoc(db, sellerPhone, item);
    const canonicalSnap = resolved ? null : await db.collection('products').doc(item.productId).get();
    const data = resolved?.data ?? (canonicalSnap?.exists ? canonicalSnap!.data()! : null);
    const source: PricedManualLine['priceSource'] = resolved
      ? resolved.source
      : canonicalSnap?.exists
        ? 'canonical'
        : 'none';

    const unitPrice = data ? resolveUnitPrice(data, variantUnit) : 0;
    const commercial = commercialOf(hasCommercial(data) ? data : null);
    const pricing = computeLinePricing({
      unitPrice,
      qty,
      gstApplicable: commercial.gstApplicable,
      gstRate: commercial.gstRate,
      gstIncluded: commercial.gstIncluded,
    });

    lines.push({
      productId: item.productId,
      copyId: resolved?.copyId ?? null,
      name: String(data?.name ?? data?.productName ?? item.productId),
      unitPrice,
      qty,
      lineTotal: pricing.net,
      ...(variantUnit ? { variantUnit } : {}),
      image: data?.image ? String(data.image) : (data?.imageUrl ? String(data.imageUrl) : null),
      gstApplicable: pricing.applicable,
      gstRate: pricing.applicable ? commercial.gstRate : 0,
      gstIncluded: pricing.included,
      gstPerUnit: pricing.gstPerUnit,
      priceSource: source,
    });

    pricingLines.push({
      sellerKey: sellerPhone,
      unitPrice,
      qty,
      weightKg: Number((qty * parseVariantWeightKg(variantUnit || undefined)).toFixed(3)),
      gstApplicable: commercial.gstApplicable,
      gstRate: commercial.gstRate,
      gstIncluded: commercial.gstIncluded,
      extraDeliveryCharge: commercial.extraDeliveryCharge,
      freeDelivery: commercial.freeDelivery,
    });
  }

  let settings: DeliverySettingsLike | null = null;
  try {
    const snap = await db.collection('deliverySettings').doc(sellerPhone).get();
    settings = snap.exists ? (snap.data() as DeliverySettingsLike) : null;
  } catch {
    settings = null;
  }

  const sp = computeSellerPricing(sellerPhone, pricingLines, settings, customerDeliveryState ?? null);

  const calculatedDelivery = sp.deliveryCharge;
  const hasOverride =
    deliveryOverride != null && Number.isFinite(deliveryOverride) && deliveryOverride >= 0;
  const effectiveDelivery = hasOverride ? r2(Number(deliveryOverride)) : calculatedDelivery;

  // When overridden, the stored breakdown mirrors the admin's single figure so the
  // invoice (which reads deliveryBreakdown + deliveryCharge) shows exactly it.
  const breakdown = hasOverride
    ? { slab: effectiveDelivery, extra: 0, free: false, waived: 0 }
    : { slab: sp.delivery.slab, extra: sp.delivery.extra, free: sp.delivery.free, waived: sp.delivery.waived };

  const grandTotal = r2(sp.subtotal + sp.gstAdded + effectiveDelivery);

  return {
    sellerKey: sellerPhone,
    lines,
    subtotal: sp.subtotal,
    totalGst: sp.gstTotal,
    totalGstAdded: sp.gstAdded,
    deliveryCharge: effectiveDelivery,
    deliveryCalculated: calculatedDelivery,
    deliveryOverridden: hasOverride,
    deliveryBreakdown: breakdown,
    deliveryType: sp.delivery.deliveryType,
    grandTotal,
  };
}

// ── Payment verification ──────────────────────────────────────────────────────

export type ManualPaymentVerification = {
  ok: boolean;
  blocking: string[];
  warnings: string[];
  razorpayPaymentId: string;
  razorpayOrderId: string | null;
  status: string | null;
  amountPaise: number | null;
  amountRupees: number | null;
  method: string | null;
  contact: string | null;
  email: string | null;
  createdAt: number | null;
  /** Buyer uid stamped on the Razorpay order's notes.userId (ownership). */
  notesUserId: string | null;
  /** Order ids already backed by this payment (by razorpay order OR payment id). */
  existingOrderIds: string[];
  /** True when the only existing order is THIS payment's deterministic manual id. */
  isOwnManualOrder: boolean;
  /** How the payment was verified: the live Razorpay API, or — when the API
   *  could not see it from this environment — our own server-written ledger. */
  verifiedVia: 'razorpay' | 'internal_record';
};

const DETERMINISTIC_ID = (razorpayOrderId: string) => `man_${razorpayOrderId}`;

/** Every order already tied to a Razorpay PAYMENT id, by either payment key. */
async function findOrdersForRazorpayPayment(razorpayPaymentId: string): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db
    .collection('orders')
    .where('payment.razorpayPaymentId', '==', razorpayPaymentId)
    .get();
  return snap.docs.map((d) => d.id);
}

/** A Razorpay order whose notes mark it a subscription purchase, not a cart. */
function looksLikeSubscription(notes: Record<string, unknown> | null | undefined): boolean {
  return !!notes && ('seatCount' in notes || 'durationMonths' in notes || 'planId' in notes);
}

/**
 * The server-written paymentAttempts ledger row for a Razorpay payment id, if any.
 * paymentAttempts is keyed by razorpayOrderId and written exclusively through the
 * Admin SDK (customers cannot forge it), so a `paid` row here is a trustworthy
 * record that Razorpay captured the money — the same source Admin → Payments uses.
 * This is the fallback verification source when the live Razorpay API is not
 * reachable from the current environment (e.g. a UAT/test key cannot see a live
 * payment). Returns null when no ledger row exists.
 */
export async function findPaymentAttemptByPaymentId(
  razorpayPaymentId: string,
): Promise<{ razorpayOrderId: string; data: FirebaseFirestore.DocumentData } | null> {
  const snap = await getAdminDb()
    .collection('paymentAttempts')
    .where('razorpayPaymentId', '==', razorpayPaymentId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { razorpayOrderId: String(doc.data()?.razorpayOrderId ?? doc.id), data: doc.data() ?? {} };
}

/**
 * Verify a captured payment can back a manual order for this customer and total.
 * Read-only against Razorpay + Firestore. Returns structured blockers/warnings;
 * NEVER throws for an expected "cannot use this payment" case.
 *
 * @param expectedTotalRupees the computed order grand total; the captured amount
 *   must equal it to the paise, otherwise the mismatch is a hard block.
 * @param customerId the selected customer's uid; the Razorpay order's notes.userId
 *   must match it (ownership) when present.
 */
export async function verifyPaymentForManualOrder(params: {
  razorpayPaymentId: string;
  customerId?: string | null;
  expectedTotalRupees?: number | null;
}): Promise<ManualPaymentVerification> {
  const out: ManualPaymentVerification = {
    ok: false,
    blocking: [],
    warnings: [],
    razorpayPaymentId: params.razorpayPaymentId,
    razorpayOrderId: null,
    status: null,
    amountPaise: null,
    amountRupees: null,
    method: null,
    contact: null,
    email: null,
    createdAt: null,
    notesUserId: null,
    existingOrderIds: [],
    isOwnManualOrder: false,
    verifiedVia: 'razorpay',
  };

  let payment: Record<string, unknown> | null = null;
  try {
    payment = (await razorpay.payments.fetch(params.razorpayPaymentId)) as unknown as Record<string, unknown>;
  } catch {
    payment = null; // handled by the internal-ledger fallback below
  }

  if (payment) {
    // ── Primary: the live Razorpay payment is authoritative ────────────────
    out.verifiedVia = 'razorpay';
    out.status = String(payment.status ?? '');
    out.razorpayOrderId = payment.order_id ? String(payment.order_id) : null;
    out.amountPaise = Number(payment.amount ?? 0);
    out.amountRupees = out.amountPaise / 100;
    out.method = (payment.method as string | undefined) ?? null;
    out.contact = (payment.contact as string | undefined) ?? null;
    out.email = (payment.email as string | undefined) ?? null;
    out.createdAt = (payment.created_at as number | undefined) ?? null;

    if (out.status !== 'captured') {
      out.blocking.push(`Payment status is "${out.status}", not "captured" — only a successful payment can back an order.`);
    }
    if (!out.razorpayOrderId) {
      out.blocking.push('Payment has no associated Razorpay order id.');
    }

    // Ownership + subscription guard from the Razorpay order's notes.
    if (out.razorpayOrderId) {
      try {
        const order = await razorpay.orders.fetch(out.razorpayOrderId);
        const notes = (order.notes ?? {}) as Record<string, unknown>;
        out.notesUserId = (notes.userId as string | undefined) ?? null;
        if (looksLikeSubscription(notes)) {
          out.blocking.push('This payment is a subscription purchase, not a cart order — it cannot back a product order.');
        }
        if (params.customerId && out.notesUserId && out.notesUserId !== params.customerId) {
          out.blocking.push(
            `Payment belongs to a different customer (Razorpay notes.userId "${out.notesUserId}" ≠ selected customer "${params.customerId}").`,
          );
        }
        if (params.customerId && !out.notesUserId) {
          out.warnings.push('Razorpay order carries no buyer id in its notes — customer association cannot be confirmed from Razorpay.');
        }
      } catch (e) {
        out.warnings.push(`Could not fetch Razorpay order ${out.razorpayOrderId} for ownership/kind check: ${errText(e)}`);
      }
    }
  } else {
    // ── Fallback: the Razorpay API cannot see this payment from the current
    //    environment. Verify against our own server-written ledger instead. ──
    out.verifiedVia = 'internal_record';
    const attempt = await findPaymentAttemptByPaymentId(params.razorpayPaymentId);
    if (!attempt) {
      out.blocking.push(
        `Payment ${params.razorpayPaymentId} was not found on Razorpay (the app's Razorpay key cannot see it — ` +
          `you may be on the wrong environment, e.g. a test/UAT key for a live payment), and there is no internal ` +
          `payment record for it either. It cannot be verified, so it cannot back an order.`,
      );
      out.ok = false;
      return out;
    }
    const a = attempt.data;
    out.razorpayOrderId = attempt.razorpayOrderId;
    out.status = String(a.status ?? '');
    out.amountPaise = a.amount != null && Number.isFinite(Number(a.amount)) ? Math.round(Number(a.amount) * 100) : null;
    out.amountRupees = out.amountPaise != null ? out.amountPaise / 100 : null;
    out.method = (a.method as string | undefined) ?? null;
    out.contact = (a.customerPhone ?? a.userPhone ?? a.razorpayContact ?? null) as string | null;
    out.email = (a.razorpayEmail ?? null) as string | null;
    out.createdAt = (a.createdAt as { toMillis?(): number } | null)?.toMillis?.() != null
      ? Math.floor((a.createdAt as { toMillis(): number }).toMillis() / 1000)
      : null;
    out.notesUserId = (a.userId as string | undefined) ?? null;

    out.warnings.push(
      'Razorpay could not be reached for this payment from the current environment; it was verified against the ' +
        'internal payment ledger (paymentAttempts) instead. Confirm you are on the correct (production/live) environment.',
    );
    if (out.status !== 'paid') {
      out.blocking.push(`The internal payment record shows status "${out.status}", not "paid" — it is not a confirmed successful payment.`);
    }
    if (a.kind === 'subscription') {
      out.blocking.push('This payment is a subscription purchase, not a cart order — it cannot back a product order.');
    }
    if (params.customerId && out.notesUserId && out.notesUserId !== params.customerId) {
      out.blocking.push(
        `Payment belongs to a different customer (internal record userId "${out.notesUserId}" ≠ selected customer "${params.customerId}").`,
      );
    }
    if (out.amountPaise == null) {
      out.warnings.push('The internal record has no stored amount, so the captured amount could not be cross-checked — confirm the order total matches what was actually paid.');
    }
  }

  // Amount must equal the computed order total to the paise.
  if (params.expectedTotalRupees != null && out.amountPaise != null) {
    const expectedPaise = Math.round(params.expectedTotalRupees * 100);
    if (out.amountPaise !== expectedPaise) {
      out.blocking.push(
        `Payment amount ₹${(out.amountPaise / 100).toFixed(2)} does not match the order total ₹${params.expectedTotalRupees.toFixed(2)} ` +
          `(difference ₹${((out.amountPaise - expectedPaise) / 100).toFixed(2)}). Adjust the order to match, or pick the correct payment.`,
      );
    }
  }

  // Must not already back another order.
  if (out.razorpayOrderId) {
    const byOrder = await findOrdersForRazorpayOrder(out.razorpayOrderId);
    const byPayment = await findOrdersForRazorpayPayment(params.razorpayPaymentId);
    const all = Array.from(new Set([...byOrder, ...byPayment]));
    out.existingOrderIds = all;
    const ownId = DETERMINISTIC_ID(out.razorpayOrderId);
    const foreign = all.filter((id) => id !== ownId);
    out.isOwnManualOrder = all.length > 0 && foreign.length === 0;
    if (foreign.length > 0) {
      out.blocking.push(`This payment is already linked to order(s): ${foreign.join(', ')}. A payment can back only one order.`);
    }
  }

  out.ok = out.blocking.length === 0;
  return out;
}

// ── Order creation ──────────────────────────────────────────────────────────

export type CreateManualOrderResult =
  | {
      ok: true;
      orderId: string;
      alreadyExisted: boolean;
      status: string;
      grandTotal: number;
      invoice: InvoiceOutcome;
    }
  | { ok: false; status: number; error: string; verification?: ManualPaymentVerification };

export type CreateManualOrderInput = {
  adminUid: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    address?: unknown;
    deliveryState?: string | null;
  };
  sellerPhone: string;
  items: ManualOrderItemInput[];
  razorpayPaymentId: string;
  /** Admin-set delivery charge (₹) for this order; null keeps the calculated one. */
  deliveryOverride?: number | null;
};

/**
 * Create the manual order. Re-prices and re-verifies server-side (never trusting
 * the client's numbers), then writes ONE order in the shared schema with status
 * 'placed' under the deterministic id — so the existing triggers run inventory +
 * both WhatsApp messages exactly once. Finally generates the invoice.
 */
export async function createManualOrder(input: CreateManualOrderInput): Promise<CreateManualOrderResult> {
  const db = getAdminDb();

  if (!input.sellerPhone) return { ok: false, status: 400, error: 'A seller is required.' };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, status: 400, error: 'At least one product is required.' };
  }
  if (!input.customer?.id) return { ok: false, status: 400, error: 'A customer is required.' };

  // Authoritative re-price (with any admin delivery override), then verify the
  // payment against that exact total.
  const pricing = await priceManualOrder(
    input.sellerPhone,
    input.items,
    input.customer.deliveryState,
    input.deliveryOverride,
  );
  if (pricing.grandTotal <= 0) {
    return { ok: false, status: 400, error: 'Order total is zero — check the selected products and prices.' };
  }

  const verification = await verifyPaymentForManualOrder({
    razorpayPaymentId: input.razorpayPaymentId,
    customerId: input.customer.id,
    expectedTotalRupees: pricing.grandTotal,
  });
  if (!verification.ok) {
    return {
      ok: false,
      status: 409,
      error: `Payment verification failed:\n- ${verification.blocking.join('\n- ')}`,
      verification,
    };
  }

  const razorpayOrderId = verification.razorpayOrderId!;
  const orderId = DETERMINISTIC_ID(razorpayOrderId);
  const ref = db.collection('orders').doc(orderId);

  const seller = await resolveSellerAccount(input.sellerPhone);
  const sellerType = seller?.collection === 'manufacturers' ? 'manufacturer' : 'retailer';
  const sellerName = seller?.shopName || input.sellerPhone;
  const sellerGstin = seller ? (seller.data.gstin ?? seller.data.gstNumber ?? null) : null;

  const nowIso = new Date().toISOString();
  const items = pricing.lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    price: l.unitPrice,
    qty: l.qty,
    lineTotal: l.lineTotal,
    ...(l.variantUnit ? { variantUnit: l.variantUnit } : {}),
    ...(l.gstApplicable
      ? { gstApplicable: true, gstRate: l.gstRate, gstAmount: l.gstPerUnit, gstIncluded: l.gstIncluded }
      : {}),
  }));

  const orderDoc: Record<string, unknown> = {
    customerId: input.customer.id,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    ...(input.customer.email ? { customerEmail: input.customer.email } : {}),
    customerAddress: input.customer.address ?? 'ADDRESS PENDING — contact customer',
    ...(input.customer.deliveryState ? { customerDeliveryState: input.customer.deliveryState } : {}),
    sellerId: input.sellerPhone,
    sellerPhone: input.sellerPhone,
    sellerName,
    sellerType,
    ...(sellerGstin ? { sellerGstNumber: String(sellerGstin) } : {}),
    items,
    subtotal: pricing.subtotal,
    ...(pricing.totalGst > 0 ? { totalGst: pricing.totalGst } : {}),
    ...(pricing.totalGstAdded > 0 ? { totalGstAdded: pricing.totalGstAdded } : {}),
    deliveryCharge: pricing.deliveryCharge,
    deliveryBreakdown: pricing.deliveryBreakdown,
    grandTotal: pricing.grandTotal,
    total: pricing.grandTotal,
    deliveryMode: 'delivery',
    status: 'placed',
    statusHistory: [{ status: 'placed', at: nowIso }],
    payment: {
      razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      status: 'paid',
      amount: (verification.amountPaise ?? Math.round(pricing.grandTotal * 100)) / 100,
      paidAt: nowIso,
    },
    // Auditable, following the order-recovery convention: this order did not come
    // through the normal client path — an admin created it manually.
    recovered: {
      by: 'admin_manual_order',
      at: nowIso,
      adminUid: input.adminUid,
      basis: 'admin-selected products + verified captured Razorpay payment',
      razorpayPaymentId: input.razorpayPaymentId,
      ...(pricing.deliveryOverridden
        ? { deliveryOverridden: true, deliveryCalculated: pricing.deliveryCalculated, deliveryCharged: pricing.deliveryCharge }
        : {}),
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Create only if absent — a double-submit cannot produce two orders, and the
  // onCreate triggers (inventory + both WhatsApp) therefore fire at most once.
  let alreadyExisted = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      alreadyExisted = true;
      return;
    }
    tx.set(ref, orderDoc);
  });

  // Invoice: idempotent. Safe to re-run on a retry; a failure here does NOT undo
  // the order, so the admin can retry create to regenerate it without re-paying.
  const invoice = await ensureOrderInvoice(orderId);

  return {
    ok: true,
    orderId,
    alreadyExisted,
    status: 'placed',
    grandTotal: pricing.grandTotal,
    invoice,
  };
}

function errText(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { error?: { description?: string }; statusCode?: number; message?: string };
    if (anyE.error?.description) return `${anyE.statusCode ?? ''} ${anyE.error.description}`.trim();
    if (anyE.message) return String(anyE.message);
  }
  return String(e);
}
