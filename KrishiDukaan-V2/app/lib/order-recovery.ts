import { getAdminDb } from './firebase-admin';
import { resolveSellerAccount } from './route-server';
import { markAttemptPaid } from './payment-attempts';
import { ensureOrderInvoice } from './order-invoice';
import { computeLinePricing } from '../utils/gst';
import type { SellerPricing } from './cart-pricing';

/**
 * Server-side order recovery for a captured payment whose order never got
 * written.
 *
 * WHY THIS EXISTS
 * ---------------
 * The normal flow creates the `orders` document CLIENT-side, after the
 * Razorpay SDK's success callback: the app calls /api/payment/verify, then
 * writes the order to Firestore itself. If that callback never fires — the
 * app is killed, the network drops, or a UPI confirmation lands after the
 * customer has already left the screen — nothing after payment happens at
 * all. Razorpay has the money (and has already executed the seller's Route
 * transfer, which is baked into the order at creation), but on our side
 * there is no order, no seller notification, nothing. That is exactly what
 * happened to a real ₹1,311 order on 16 Sep 2026.
 *
 * Razorpay's payment.captured webhook is the server-to-server signal that
 * does not depend on the client surviving. When it arrives and no order
 * exists, this rebuilds the order from the paymentAttempts record — which
 * create-cart-order wrote BEFORE the customer ever saw the checkout sheet,
 * and which carries every server-priced line item plus (for app builds that
 * send it) the delivery address.
 *
 * SHAPE
 * -----
 * Mirrors mobile's OrderRepository.createOrdersAfterPayment: one order per
 * seller, items grouped by seller phone, status 'placed'. Field names follow
 * the web/mobile union documented in types/order.ts so every reader — seller
 * dashboards, admin ledger, the stock-decrement and notification functions
 * that trigger on order creation — treats a recovered order exactly like a
 * normal one.
 *
 * IDEMPOTENT
 * ----------
 * Order ids are deterministic (`rcv_<razorpayOrderId>_<n>`) and each write
 * is skipped if the doc already exists, so a webhook retry, or the client
 * path finishing late, cannot produce duplicates.
 */

type RecoveredItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  sellerId: string;
  sellerPhone: string | null;
  sellerName: string | null;
  variantUnit?: string;
  gstApplicable?: boolean;
  gstRate?: number;
  gstIncluded?: boolean;
};

export type RecoveryOutcome =
  | { action: 'already_exists'; orderIds: string[] }
  | { action: 'recovered'; orderIds: string[]; addressMissing: boolean }
  | { action: 'skipped'; reason: string };

const PHONE_RE = /^\+?[0-9]{10,13}$/;

/** Every existing order tied to a Razorpay order id, by either payment key. */
export async function findOrdersForRazorpayOrder(razorpayOrderId: string): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db
    .collection('orders')
    .where('payment.razorpayOrderId', '==', razorpayOrderId)
    .get();
  return snap.docs.map((d) => d.id);
}

export async function recoverOrderFromCapturedPayment(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** Paise, as Razorpay reports it — the authoritative captured amount. */
  amountPaise: number;
}): Promise<RecoveryOutcome> {
  const { razorpayOrderId, razorpayPaymentId, amountPaise } = params;
  const db = getAdminDb();

  // Whatever else happens, a captured payment closes out its attempt row.
  await markAttemptPaid(razorpayOrderId, razorpayPaymentId);

  const existing = await findOrdersForRazorpayOrder(razorpayOrderId);
  if (existing.length > 0) {
    return { action: 'already_exists', orderIds: existing };
  }

  const attemptSnap = await db.collection('paymentAttempts').doc(razorpayOrderId).get();
  if (!attemptSnap.exists) {
    // Not an order this app created through create-cart-order (a
    // subscription, or something older) — nothing to rebuild from.
    return { action: 'skipped', reason: 'no paymentAttempts record' };
  }
  const attempt = attemptSnap.data() as Record<string, unknown>;

  if (attempt.kind !== 'cart') {
    return { action: 'skipped', reason: `attempt kind is ${String(attempt.kind)}, not cart` };
  }

  const items = (Array.isArray(attempt.items) ? attempt.items : []) as RecoveredItem[];
  if (items.length === 0) {
    return { action: 'skipped', reason: 'attempt has no line items' };
  }

  const customerId = String(attempt.userId ?? '');
  const customerName = String(attempt.customerName ?? attempt.userName ?? '').trim();
  const customerPhone = String(attempt.customerPhone ?? attempt.userPhone ?? '').trim();
  const customerAddress = attempt.customerAddress ?? null;
  const addressMissing = !customerAddress;
  const deliveryBySeller = (attempt.deliveryBySeller ?? {}) as Record<string, number>;
  const totalDelivery = Number(attempt.deliveryCharge ?? 0);
  // New clients: the server's own per-seller pricing (items, GST, delivery
  // breakdown), stored by create-cart-order. When present the order is rebuilt
  // from it verbatim, so it carries the GST and delivery detail an invoice
  // needs and its total is exactly what was charged. Legacy attempts have none
  // and fall through to the older subtotal + delivery path.
  const breakdownBySeller = new Map<string, SellerPricing>();
  for (const sp of (Array.isArray(attempt.sellerBreakdown) ? attempt.sellerBreakdown : []) as SellerPricing[]) {
    if (sp && typeof sp.sellerKey === 'string') breakdownBySeller.set(sp.sellerKey, sp);
  }
  const customerDeliveryState = String(attempt.customerDeliveryState ?? '').trim();

  // Group by seller the same way checkout does: phone first, id as fallback.
  const bySeller = new Map<string, RecoveredItem[]>();
  for (const it of items) {
    const key = String(it.sellerPhone ?? '').trim() || String(it.sellerId ?? '').trim();
    if (!key) continue;
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key)!.push(it);
  }
  if (bySeller.size === 0) {
    return { action: 'skipped', reason: 'no item carries a seller key' };
  }

  // Delivery allocation: use the per-seller split if the client sent one;
  // otherwise give the whole charge to a single seller, or split it across
  // sellers in proportion to their subtotals.
  const subtotals = new Map<string, number>();
  let grandSubtotal = 0;
  for (const [key, its] of Array.from(bySeller.entries())) {
    const s = its.reduce((acc, i) => acc + Number(i.lineTotal ?? i.unitPrice * i.qty), 0);
    subtotals.set(key, s);
    grandSubtotal += s;
  }
  const deliveryFor = (key: string): number => {
    if (Object.keys(deliveryBySeller).length > 0) return Number(deliveryBySeller[key] ?? 0);
    if (bySeller.size === 1) return totalDelivery;
    return grandSubtotal > 0
      ? Math.round(((subtotals.get(key) ?? 0) / grandSubtotal) * totalDelivery * 100) / 100
      : 0;
  };

  const now = new Date();
  const nowIso = now.toISOString();
  const batch = db.batch();
  const orderIds: string[] = [];
  let index = 0;

  for (const [sellerKey, sellerItems] of Array.from(bySeller.entries())) {
    index += 1;
    const orderId = `rcv_${razorpayOrderId}_${index}`;
    const ref = db.collection('orders').doc(orderId);
    // Re-check per doc: a retry racing with a first attempt must not double-write.
    if ((await ref.get()).exists) {
      orderIds.push(orderId);
      continue;
    }

    const seller = await resolveSellerAccount(sellerKey);
    const sellerType = seller?.collection === 'manufacturers' ? 'manufacturer' : 'retailer';
    const sellerName =
      seller?.shopName || String(sellerItems[0]?.sellerName ?? '').trim() || sellerKey;

    const bd = breakdownBySeller.get(sellerKey);
    const subtotal = bd ? bd.subtotal : subtotals.get(sellerKey) ?? 0;
    const deliveryCharge = bd ? bd.deliveryCharge : deliveryFor(sellerKey);
    const gstAdded = bd ? bd.gstAdded : 0;
    const total = Math.round((subtotal + gstAdded + deliveryCharge) * 100) / 100;

    batch.set(ref, {
      customerId,
      customerName,
      customerPhone,
      // Both shapes are valid on an order (types/order.ts). When the attempt
      // predates address capture this is an explicit marker rather than a
      // blank, so the seller/admin knows to reach out before dispatching.
      customerAddress: customerAddress ?? 'ADDRESS PENDING — contact customer',
      sellerId: sellerKey,
      sellerPhone: PHONE_RE.test(sellerKey) ? sellerKey : '',
      sellerName,
      sellerType,
      items: sellerItems.map((i) => {
        const pricing = computeLinePricing({
          unitPrice: i.unitPrice,
          qty: i.qty,
          gstApplicable: i.gstApplicable,
          gstRate: i.gstRate,
          gstIncluded: i.gstIncluded,
        });
        return {
          productId: i.productId,
          name: i.name,
          price: i.unitPrice,
          qty: i.qty,
          lineTotal: Number(i.lineTotal ?? i.unitPrice * i.qty),
          ...(i.variantUnit ? { variantUnit: i.variantUnit } : {}),
          ...(pricing.applicable
            ? {
                gstApplicable: true,
                gstRate: i.gstRate,
                gstAmount: pricing.gstPerUnit,
                gstIncluded: pricing.included,
              }
            : {}),
        };
      }),
      subtotal,
      ...(bd && bd.gstTotal > 0 ? { totalGst: bd.gstTotal } : {}),
      ...(gstAdded > 0 ? { totalGstAdded: gstAdded } : {}),
      deliveryCharge,
      ...(bd ? { deliveryBreakdown: bd.delivery } : {}),
      ...(customerDeliveryState ? { customerDeliveryState } : {}),
      grandTotal: total,
      total,
      deliveryMode: 'delivery',
      status: 'placed',
      statusHistory: [{ status: 'placed', at: nowIso }],
      payment: {
        razorpayOrderId,
        razorpayPaymentId,
        status: 'paid',
        amount: bySeller.size === 1 ? Math.round(amountPaise) / 100 : total,
        paidAt: nowIso,
      },
      // Auditable: this order did not come through the normal client path.
      recovered: {
        by: 'razorpay_webhook',
        at: nowIso,
        addressMissing,
        attemptSource: String(attempt.source ?? 'unknown'),
      },
      createdAt: now,
      updatedAt: now,
    });
    orderIds.push(orderId);
  }

  await batch.commit();

  // The invoice the customer's WhatsApp link points at. Best effort — it never
  // fails a recovery; the invoice sweep catches anything missed here.
  for (const id of orderIds) {
    await ensureOrderInvoice(id).catch((e) =>
      console.error('[order-recovery] invoice failed', id, e),
    );
  }
  return { action: 'recovered', orderIds, addressMissing };
}
