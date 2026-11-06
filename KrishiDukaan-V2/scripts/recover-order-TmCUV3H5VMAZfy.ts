/**
 * SUPERSEDED — this is a ONE-TIME, single-payment reconstruction. The reusable
 * production path for the same problem is now the admin feature
 * "Orders → Create order manually" (UI app/admin/orders/create/page.tsx,
 * core app/lib/manual-order.ts, API /api/admin/manual-order/*), which verifies a
 * captured payment and writes the order through the same shared machinery with
 * full admin auth, idempotency and duplicate-prevention. Prefer that for any new
 * recovery. This script is kept only for the historical pay_TmCUV3H5VMAZfy case
 * and its investigation/verification helpers; do NOT use it as a general order-
 * creation path.
 *
 * ONE-TIME recovery for a single captured Razorpay payment whose KrishiDukan
 * order + invoice never got written.
 *
 *   Payment : pay_TmCUV3H5VMAZfy   (Captured, ₹1,060, note "Mobile Cart Order")
 *   Order   : order_TmCSjFE7dyCLNS
 *   Buyer   : Balu Babu / +918138031576 / UID Z8WfTqbLnaPC9ZKqOUSW7anSR2l1
 *   Seller  : Varad Agro Narkhed (+919370505272)
 *   Line    : 2 × Bayer Roundup Herbicide (Glyphosate 41% SL), 1 L @ ₹530 = ₹1,060
 *
 * TWO RECOVERY PATHS
 * ------------------
 * A. AUTOMATED (preferred): when paymentAttempts/{razorpayOrderId} holds the
 *    server-side checkout snapshot (kind:'cart' with items + sellerBreakdown),
 *    this reuses recoverOrderFromCapturedPayment — the exact path the Razorpay
 *    payment.captured webhook uses — with no manual input.
 *
 * B. MANUAL RECONSTRUCTION (this payment): the paymentAttempts record for this
 *    order is a bare "paid" stub (only status/paidAt/razorpayPaymentId) — the
 *    rich snapshot was never written because the order was placed outside the
 *    web create-cart-order path (the "Mobile Cart Order" note). There is NOTHING
 *    to auto-rebuild from. So, ONLY when explicitly authorized (--manual), this
 *    reconstructs the order from the verified transaction details in CASE below
 *    plus live Razorpay + existing Firestore records, in the SAME schema a
 *    normal/automated recovery produces, marked recovered.by = 'manual_reconstruction'.
 *
 * HARD VERIFICATION GATES (manual path) — any failure STOPS the run:
 *   1. Live Razorpay: payment captured, order_id matches, amount matches, and
 *      the order's notes.userId == the buyer UID (ownership).
 *   2. No existing application order for this payment (else → repair/verify, no new write).
 *   3. Seller identity: resolveSellerAccount(sellerPhone) exists and its shopName
 *      matches; its registered GSTIN/address are read for billing (never invented).
 *   4. Product identity: the product doc exists; its GST config is read from the
 *      record (NOT invented). HSN is whatever the record holds (this catalog
 *      stores none, and the invoice does not render HSN).
 *   5. Seller↔product association: verified from the seller's own catalog copy
 *      when present; when the seller has no copy (as here), this ESSENTIAL detail
 *      cannot be confirmed from records and the run STOPS unless the operator
 *      explicitly affirms it with --affirm-seller-product.
 *
 * TRIGGERS & DUPLICATE SIDE-EFFECTS (inspected, see functions/src/index.ts)
 * ------------------------------------------------------------------------
 * On orders/{id} the deployed Cloud Functions are:
 *   - decrementStockOnOrder   (onCreate)  — inventory; keys off items + sellerPhone.
 *   - notifySellerOnOrder      (onCreate)  — queues the SELLER order_notification WA.
 *   - backfillOrderSeller      (onCreate)  — fills a missing sellerId (no WA).
 *   - notifyCustomerOnOrderStatus (onWrite) — queues the CUSTOMER order_confirmation
 *                                             WA only when status transitions to 'placed'.
 *   - sendWaNotification       (onCreate waNotifications/{id}) — actually sends.
 * To keep inventory single and hold BOTH WhatsApp messages for a SEPARATE
 * approval, the commit writes the order in a non-notifying HELD shape:
 *   (a) first set with items:[] and no seller key and status 'recovered_hold'
 *       → decrementStockOnOrder loops over nothing, notifySellerOnOrder/
 *         backfillOrderSeller resolve no seller (resolveSellerForOrder([])==null)
 *         so neither queues anything, and 'recovered_hold' is not 'placed' so
 *         notifyCustomerOnOrderStatus returns — ZERO side effects;
 *   (b) then update() with the real items/seller/totals, keeping status
 *       'recovered_hold' → onCreate triggers do not re-fire, and the onWrite
 *       customer trigger early-returns (status unchanged).
 * Only at the SEPARATE WhatsApp approval does the run ACTIVATE the order
 * (status → 'placed', which fires the customer confirmation via the real
 * trigger), queue the seller notification via the existing helper, and apply a
 * guarded, idempotent inventory deduction. Deterministic id rcv_<orderId>_1 +
 * per-step markers make every step re-runnable without duplicates.
 *
 * INVOICE is a SEPARATE step (ensureOrderInvoice). It reuses the app's
 * generator and numbering. Tax shown is exactly the product record's config
 * (0% here) + the seller's real GSTIN; nothing is invented. If a product ever
 * lacks the GST config an invoice needs, invoice generation is deferred and
 * reported rather than guessed.
 *
 * SAFETY
 * ------
 * Default mode is read-only investigation. Writes require explicit flags + --yes.
 * Never captures/refunds/modifies the payment; never touches unrelated records;
 * never deploys or changes configuration. Never logs tokens/secrets (only the
 * Razorpay key MODE). Never claims success for anything it has not re-read.
 *
 * USAGE
 * -----
 *   # read-only investigation + verification report (default)
 *   npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts
 *
 *   # AUTOMATED recovery (only if a usable cart snapshot exists)
 *   npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --apply --yes
 *
 *   # MANUAL reconstruction — preview the proposed order document, write nothing
 *   npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --manual
 *
 *   # MANUAL reconstruction — COMMIT the held order + invoice (approval #1).
 *   # Requires affirming the seller↔product association that records can't confirm.
 *   npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --manual --commit --affirm-seller-product --yes
 *
 *   # ACTIVATE + NOTIFY — send customer & seller WhatsApp + inventory (approval #2)
 *   npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --manual --send-whatsapp --yes
 *
 *   # re-verify a done recovery via the app's own retrieval paths (read-only)
 *   npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --verify
 *
 * CREDENTIALS (prod) — this acts on LIVE data, which .env.local does NOT carry:
 *   - RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET : the rzp_live_… pair (Secret Manager).
 *   - Firebase Admin: FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or
 *     GOOGLE_APPLICATION_CREDENTIALS, or ADC for krishidukan-e8315.
 *   - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET for the invoice PDF.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Razorpay from 'razorpay';

// ── Case constants (verified facts from the recovery request) ───────────────
const CASE = {
  razorpayPaymentId: 'pay_TmCUV3H5VMAZfy',
  razorpayOrderId: 'order_TmCSjFE7dyCLNS',
  expectedAmountPaise: 106000, // ₹1,060
  paymentNote: 'Mobile Cart Order',
  customer: {
    uid: 'Z8WfTqbLnaPC9ZKqOUSW7anSR2l1',
    name: 'Balu Babu',
    phone: '+918138031576',
    email: 'balukrishi4468@gmail.com',
    address: 'MQR3+GRG, Vakkom, Keralam 695308',
    city: 'Vakkom',
    state: 'Keralam',
    pincode: '695308',
  },
  seller: {
    // Verified from Firestore: retailers/+919370505272, shopName "Varad Agro Narkhed".
    phone: '+919370505272',
    expectedShopName: 'Varad Agro Narkhed',
  },
  product: {
    // Verified canonical product doc (source: admin). Its GST config (0% here)
    // is re-read from the record at runtime and is authoritative — the values
    // below are only the expectation we check against.
    productId: 'UJyyVrej45NiK2DvxRaD',
    marketplaceCardId: '44a56a26e1fc911a389e7d6fa515748fa8c68a9f',
    nameMustMatch: /roundup.*glyphosate\s*41|glyphosate\s*41.*%/i,
    displayName: 'Bayer Roundup Herbicide (Glyphosate 41% SL)',
    variantUnit: '1 L',
    qty: 2,
    unitPrice: 530, // ₹ per unit, from the verified transaction details
    expectedGstApplicable: false,
    expectedGstRate: 0,
  },
  order: {
    deliveryCharge: 0,
    deliveryMode: 'delivery' as const,
    heldStatus: 'recovered_hold',
  },
} as const;

const RECONSTRUCTED_ORDER_ID = `rcv_${CASE.razorpayOrderId}_1`;

// ── CLI ─────────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const argValue = (f: string): string | undefined => {
  const i = ARGV.indexOf(f);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
const CONFIRMED = has('--yes');
const MANUAL = has('--manual');
const AFFIRM_SELLER_PRODUCT = has('--affirm-seller-product');
const OPERATOR = argValue('--operator') ?? process.env.USER ?? 'unknown';
type Mode = 'investigate' | 'apply' | 'manual-preview' | 'commit' | 'send-whatsapp' | 'verify';
const MODE: Mode = has('--verify')
  ? 'verify'
  : has('--send-whatsapp')
    ? 'send-whatsapp'
    : has('--commit')
      ? 'commit'
      : has('--apply')
        ? 'apply'
        : MANUAL
          ? 'manual-preview'
          : 'investigate';

// ── Structured logging (never pass secrets as data) ─────────────────────────
type Level = 'info' | 'warn' | 'error' | 'step' | 'ok' | 'stop';
const ICON: Record<Level, string> = {
  info: '  ', warn: '⚠ ', error: '✖ ', step: '▶ ', ok: '✓ ', stop: '■ ',
};
function log(level: Level, msg: string, data?: Record<string, unknown>) {
  const line = `${ICON[level]}${msg}`;
  if (data && Object.keys(data).length) {
    console.log(line);
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), level, msg, ...data }, null, 2)
        .split('\n').map((l) => '    ' + l).join('\n'),
    );
  } else {
    console.log(line);
  }
}
function heading(t: string) {
  console.log('\n' + '─'.repeat(72) + `\n${t}\n` + '─'.repeat(72));
}
function errText(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as any;
    if (anyE.error?.description) return `${anyE.statusCode ?? ''} ${anyE.error.description}`.trim();
    if (anyE.message) return String(anyE.message);
  }
  return String(e);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  const explicit = argValue('--env');
  const candidates = explicit ? [explicit] : ['.env.local', '.env'];
  for (const rel of candidates) {
    const p = path.resolve(process.cwd(), rel);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      log('info', `Loaded env from ${rel}`);
    }
  }
}
function razorpayMode(): 'test' | 'live' | 'unknown' {
  const id = process.env.RAZORPAY_KEY_ID ?? '';
  if (id.startsWith('rzp_live_')) return 'live';
  if (id.startsWith('rzp_test_')) return 'test';
  return 'unknown';
}

// ── Lazily imported app modules (after env load) ────────────────────────────
type AppModules = {
  getAdminDb: () => FirebaseFirestore.Firestore;
  getAdminStorage: () => import('firebase-admin/storage').Storage;
  FieldValue: typeof import('firebase-admin/firestore').FieldValue;
  findOrdersForRazorpayOrder: (id: string) => Promise<string[]>;
  recoverOrderFromCapturedPayment: (p: {
    razorpayOrderId: string; razorpayPaymentId: string; amountPaise: number;
  }) => Promise<
    | { action: 'already_exists'; orderIds: string[] }
    | { action: 'recovered'; orderIds: string[]; addressMissing: boolean }
    | { action: 'skipped'; reason: string }
  >;
  ensureOrderInvoice: (
    orderId: string, opts?: { force?: boolean },
  ) => Promise<
    | { ok: true; generated: boolean; storagePath: string; invoiceNumber: string }
    | { ok: false; status: number; error: string }
  >;
  resolveSellerAccount: (phone: string) => Promise<import('../app/lib/route-server').SellerAccount | null>;
  computeLinePricing: typeof import('../app/utils/gst').computeLinePricing;
  queueOrderNotification: (phone: string, shopName: string, opts?: { orderId?: string }) => Promise<string>;
  queueOrderConfirmationCustomer: (phone: string, customerName: string, orderId: string) => Promise<string>;
};
async function appModules(): Promise<AppModules> {
  const admin = await import('../app/lib/firebase-admin');
  const fsAdmin = await import('firebase-admin/firestore');
  const recovery = await import('../app/lib/order-recovery');
  const invoice = await import('../app/lib/order-invoice');
  const route = await import('../app/lib/route-server');
  const gst = await import('../app/utils/gst');
  const wa = await import('../app/lib/wa-notify');
  return {
    getAdminDb: admin.getAdminDb,
    getAdminStorage: admin.getAdminStorage,
    FieldValue: fsAdmin.FieldValue,
    findOrdersForRazorpayOrder: recovery.findOrdersForRazorpayOrder,
    recoverOrderFromCapturedPayment: recovery.recoverOrderFromCapturedPayment,
    ensureOrderInvoice: invoice.ensureOrderInvoice,
    resolveSellerAccount: route.resolveSellerAccount,
    computeLinePricing: gst.computeLinePricing,
    queueOrderNotification: wa.queueOrderNotification,
    queueOrderConfirmationCustomer: wa.queueOrderConfirmationCustomer,
  };
}

// ── Razorpay payment verification (read-only) ───────────────────────────────
type PaymentVerification = {
  ok: boolean;
  blocking: string[];
  warnings: string[];
  payment?: Record<string, unknown>;
  amountPaise?: number;
  ownerUid?: string | null;
};
async function verifyPayment(): Promise<PaymentVerification> {
  const out: PaymentVerification = { ok: false, blocking: [], warnings: [] };
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const mode = razorpayMode();
  log('info', `Razorpay key mode: ${mode}`);
  if (!keyId || !keySecret) {
    out.blocking.push('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set — cannot verify the payment.');
    return out;
  }
  if (mode === 'test') {
    out.warnings.push(
      'Razorpay key is TEST mode; the live payment will not be found. Provide the rzp_live_ pair to verify.',
    );
  }
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

  let payment: any;
  try {
    payment = await rzp.payments.fetch(CASE.razorpayPaymentId);
  } catch (e) {
    out.blocking.push(`Could not fetch payment ${CASE.razorpayPaymentId}: ${errText(e)}`);
    return out;
  }
  out.payment = payment;
  if (payment.status !== 'captured') {
    out.blocking.push(`Payment status is "${payment.status}", expected "captured".`);
  }
  if (payment.order_id !== CASE.razorpayOrderId) {
    out.blocking.push(`Payment order_id "${payment.order_id}" != expected "${CASE.razorpayOrderId}".`);
  }
  out.amountPaise = Number(payment.amount ?? 0);
  if (out.amountPaise !== CASE.expectedAmountPaise) {
    out.warnings.push(
      `Captured amount ${out.amountPaise} paise != stated ${CASE.expectedAmountPaise} paise. ` +
      'The captured amount is authoritative.',
    );
  }
  try {
    const order = await rzp.orders.fetch(CASE.razorpayOrderId);
    const notes = (order.notes ?? {}) as Record<string, unknown>;
    out.ownerUid = (notes.userId as string | undefined) ?? null;
    if (out.ownerUid && out.ownerUid !== CASE.customer.uid) {
      out.blocking.push(
        `Razorpay order notes.userId "${out.ownerUid}" != expected UID "${CASE.customer.uid}" — ownership unconfirmed.`,
      );
    }
    if (!out.ownerUid) {
      out.warnings.push('Razorpay order has no notes.userId — ownership cannot be confirmed from Razorpay.');
    }
  } catch (e) {
    out.warnings.push(`Could not fetch order ${CASE.razorpayOrderId} for ownership check: ${errText(e)}`);
  }
  out.ok = out.blocking.length === 0;
  return out;
}

// ── Firestore investigation (read-only) ─────────────────────────────────────
type WaRow = { id: string; template: string; status: string; metaMessageId: string | null };
type Investigation = {
  existingOrderIds: string[];
  reconstructedExists: boolean;
  reconstructedStatus?: string;
  attemptExists: boolean;
  attemptKind?: string;
  attemptItems: number;
  attemptUsable: boolean;
  attemptPaidStub: boolean;
  invoiceByOrder: Record<string, { invoiceNumber?: string; storagePath?: string } | null>;
  waByOrder: Record<string, WaRow[]>;
  notes: string[];
};
async function investigate(M: AppModules): Promise<Investigation> {
  const db = M.getAdminDb();
  const inv: Investigation = {
    existingOrderIds: [], reconstructedExists: false, attemptExists: false,
    attemptItems: 0, attemptUsable: false, attemptPaidStub: false,
    invoiceByOrder: {}, waByOrder: {}, notes: [],
  };

  inv.existingOrderIds = await M.findOrdersForRazorpayOrder(CASE.razorpayOrderId);
  const recSnap = await db.collection('orders').doc(RECONSTRUCTED_ORDER_ID).get();
  inv.reconstructedExists = recSnap.exists;
  inv.reconstructedStatus = recSnap.exists ? String(recSnap.data()?.status ?? '') : undefined;

  const attemptSnap = await db.collection('paymentAttempts').doc(CASE.razorpayOrderId).get();
  inv.attemptExists = attemptSnap.exists;
  if (attemptSnap.exists) {
    const a = attemptSnap.data() as Record<string, unknown>;
    inv.attemptKind = String(a.kind ?? '');
    const items = Array.isArray(a.items) ? (a.items as unknown[]) : [];
    inv.attemptItems = items.length;
    inv.attemptUsable = inv.attemptKind === 'cart' && items.length > 0;
    inv.attemptPaidStub = items.length === 0 && !inv.attemptKind && String(a.status ?? '') === 'paid';
    if (inv.attemptPaidStub) {
      inv.notes.push(
        `paymentAttempts/${CASE.razorpayOrderId} is a paid-stub (fields: ${Object.keys(a).join(', ')}) — ` +
        'no checkout snapshot. Automated recovery is impossible; use the manual path (--manual).',
      );
    }
  } else {
    inv.notes.push(`paymentAttempts/${CASE.razorpayOrderId} does not exist.`);
  }

  const allOrderIds = Array.from(new Set([...inv.existingOrderIds, ...(inv.reconstructedExists ? [RECONSTRUCTED_ORDER_ID] : [])]));
  for (const id of allOrderIds) {
    const snap = await db.collection('orders').doc(id).get();
    const d = snap.data() ?? {};
    inv.invoiceByOrder[id] = (d.invoice as { invoiceNumber?: string; storagePath?: string }) ?? null;
    inv.waByOrder[id] = await waRowsForOrder(db, id);
  }
  return inv;
}
async function waRowsForOrder(db: FirebaseFirestore.Firestore, orderId: string): Promise<WaRow[]> {
  const snap = await db.collection('waNotifications').where('source.entityId', '==', orderId).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, template: String(d.template ?? ''), status: String(d.status ?? ''), metaMessageId: (d.metaMessageId as string | null) ?? null };
  });
}

// ── Reference verification (seller + product) for the manual path ───────────
type RefVerification = {
  ok: boolean;
  blocking: string[];
  warnings: string[];
  seller?: { phone: string; shopName: string; collection: string; gstin: string | null; address: string | null; city: string | null; state: string | null };
  product?: { id: string; name: string; gstApplicable: boolean; gstRate: number; gstIncluded: boolean; hsn: string | null };
  sellerHasCatalogCopy?: boolean;
};
async function verifyReferences(M: AppModules): Promise<RefVerification> {
  const out: RefVerification = { ok: false, blocking: [], warnings: [] };
  const db = M.getAdminDb();

  // Seller
  const seller = await M.resolveSellerAccount(CASE.seller.phone);
  if (!seller) {
    out.blocking.push(`Seller ${CASE.seller.phone} not found — seller identity cannot be verified.`);
  } else {
    const d = seller.data as Record<string, unknown>;
    const gstin = (d.gstin ?? d.gstNumber ?? null) as string | null;
    out.seller = {
      phone: seller.phone, shopName: seller.shopName, collection: seller.collection,
      gstin: gstin ? String(gstin) : null,
      address: d.address ? String(d.address) : null,
      city: d.city ? String(d.city) : null,
      state: d.state ? String(d.state) : null,
    };
    if (seller.shopName.toLowerCase() !== CASE.seller.expectedShopName.toLowerCase()) {
      out.warnings.push(`Seller shopName "${seller.shopName}" != expected "${CASE.seller.expectedShopName}".`);
    }
    if (!out.seller.gstin) {
      out.warnings.push('Seller has no registered GSTIN — invoice will omit the seller GSTIN (not invented).');
    }
  }

  // Product
  const prodSnap = await db.collection('products').doc(CASE.product.productId).get();
  if (!prodSnap.exists) {
    out.blocking.push(`Product ${CASE.product.productId} not found — product identity cannot be verified.`);
  } else {
    const p = prodSnap.data() as Record<string, unknown>;
    const name = String(p.name ?? p.productName ?? '');
    if (!CASE.product.nameMustMatch.test(name)) {
      out.blocking.push(`Product ${CASE.product.productId} name "${name}" does not match the expected herbicide.`);
    }
    // GST read from the record — authoritative, never invented.
    const gstApplicable = p.gstApplicable === true;
    const gstRate = Number(p.gstRate ?? 0);
    out.product = {
      id: CASE.product.productId, name,
      gstApplicable, gstRate, gstIncluded: p.gstIncluded === true,
      hsn: (p.hsn ?? p.hsnCode ?? null) as string | null,
    };
    if (gstApplicable !== CASE.product.expectedGstApplicable || gstRate !== CASE.product.expectedGstRate) {
      out.warnings.push(
        `Product GST config (applicable=${gstApplicable}, rate=${gstRate}) differs from the expectation ` +
        `(applicable=${CASE.product.expectedGstApplicable}, rate=${CASE.product.expectedGstRate}). The RECORD is authoritative.`,
      );
    }
  }

  // Seller↔product association: does the seller stock a copy of this product?
  try {
    const bySeller = await db.collection('products').where('retailerPhone', '==', CASE.seller.phone).get();
    const prodName = out.product?.name ?? CASE.product.displayName;
    out.sellerHasCatalogCopy = bySeller.docs.some((d) => {
      const pd = d.data() as Record<string, unknown>;
      const nm = String(pd.name ?? pd.productName ?? '');
      const mpid = String(pd.manufacturerProductId ?? pd.originalProductId ?? '');
      return nm === prodName || mpid === CASE.product.productId;
    });
  } catch {
    out.sellerHasCatalogCopy = undefined;
  }
  if (out.sellerHasCatalogCopy === false) {
    const msg =
      `Seller ${CASE.seller.phone} has NO catalog copy of "${CASE.product.displayName}" — the ` +
      'seller↔product association (an essential order detail) cannot be confirmed from records.';
    if (AFFIRM_SELLER_PRODUCT) {
      out.warnings.push(`${msg} Proceeding on explicit operator affirmation (--affirm-seller-product).`);
    } else {
      out.blocking.push(`${msg} Re-run with --affirm-seller-product to proceed on operator authority, or stop.`);
    }
  }

  out.ok = out.blocking.length === 0;
  return out;
}

// ── Build the proposed order document (manual reconstruction) ───────────────
function buildProposedOrder(M: AppModules, ref: RefVerification, amountPaise: number, nowIso: string) {
  const unitPrice = CASE.product.unitPrice;
  const qty = CASE.product.qty;
  const pricing = M.computeLinePricing({
    unitPrice, qty,
    gstApplicable: ref.product!.gstApplicable,
    gstRate: ref.product!.gstRate,
    gstIncluded: ref.product!.gstIncluded,
  });
  const lineTotal = Math.round(unitPrice * qty * 100) / 100;
  const subtotal = lineTotal;
  const gstAdded = pricing.applicable && !pricing.included ? Math.round(pricing.gstPerUnit * qty * 100) / 100 : 0;
  const deliveryCharge = CASE.order.deliveryCharge;
  const grandTotal = Math.round((subtotal + gstAdded + deliveryCharge) * 100) / 100;

  const item: Record<string, unknown> = {
    productId: CASE.product.productId,
    name: ref.product!.name,
    price: unitPrice,
    qty,
    lineTotal,
    variantUnit: CASE.product.variantUnit,
  };
  if (pricing.applicable) {
    item.gstApplicable = true;
    item.gstRate = ref.product!.gstRate;
    item.gstAmount = pricing.gstPerUnit;
    item.gstIncluded = pricing.included;
  }

  const order: Record<string, unknown> = {
    customerId: CASE.customer.uid,
    customerName: CASE.customer.name,
    customerPhone: CASE.customer.phone,
    customerEmail: CASE.customer.email,
    customerAddress: CASE.customer.address,
    customerDeliveryState: CASE.customer.state,
    sellerId: ref.seller!.phone,
    sellerPhone: ref.seller!.phone,
    sellerName: ref.seller!.shopName,
    sellerType: ref.seller!.collection === 'manufacturers' ? 'manufacturer' : 'retailer',
    ...(ref.seller!.gstin ? { sellerGstNumber: ref.seller!.gstin } : {}),
    items: [item],
    subtotal,
    ...(gstAdded > 0 ? { totalGstAdded: gstAdded } : {}),
    deliveryCharge,
    grandTotal,
    total: grandTotal,
    deliveryMode: CASE.order.deliveryMode,
    status: CASE.order.heldStatus, // HELD — activated to 'placed' only at WA approval
    statusHistory: [{ status: CASE.order.heldStatus, at: nowIso }],
    payment: {
      razorpayOrderId: CASE.razorpayOrderId,
      razorpayPaymentId: CASE.razorpayPaymentId,
      status: 'paid',
      amount: Math.round(amountPaise) / 100,
      paidAt: nowIso,
      note: CASE.paymentNote,
    },
    recovered: {
      by: 'manual_reconstruction',
      at: nowIso,
      operator: OPERATOR,
      basis: 'verified transaction details (task) + live Razorpay payment + Firestore seller/product records',
      razorpayPaymentId: CASE.razorpayPaymentId,
      note: CASE.paymentNote,
      sellerProductAffirmed: ref.sellerHasCatalogCopy === false ? true : undefined,
      inventoryApplied: false,
      activated: false,
    },
  };
  return { order, totals: { subtotal, gstAdded, deliveryCharge, grandTotal } };
}

// ── Commit (approval #1): write the held order with zero trigger side-effects ─
async function commitHeldOrder(M: AppModules, proposed: Record<string, unknown>) {
  const db = M.getAdminDb();
  const ref = db.collection('orders').doc(RECONSTRUCTED_ORDER_ID);
  if ((await ref.get()).exists) {
    log('ok', `Order ${RECONSTRUCTED_ORDER_ID} already exists — not re-created (duplicate prevention).`);
    return;
  }
  // (a) Minimal set: items:[] + no seller + held status → all onCreate triggers no-op.
  await ref.set({
    customerId: proposed.customerId,
    customerName: proposed.customerName,
    customerPhone: proposed.customerPhone,
    items: [],
    status: CASE.order.heldStatus,
    recovered: proposed.recovered,
    createdAt: M.FieldValue.serverTimestamp(),
    updatedAt: M.FieldValue.serverTimestamp(),
  });
  // Brief settle so the no-op onCreate triggers observe the empty, seller-less doc.
  await sleep(1500);
  // (b) Fill real data via update (does not re-fire onCreate triggers; onWrite
  //     customer trigger early-returns because status is unchanged).
  const { createdAt, ...fill } = proposed as any;
  await ref.update({ ...fill, updatedAt: M.FieldValue.serverTimestamp() });
  log('ok', `Order ${RECONSTRUCTED_ORDER_ID} committed in HELD state (status=${CASE.order.heldStatus}) — no inventory, no WhatsApp.`);
}

// ── Invoice (separate step) ──────────────────────────────────────────────────
async function generateInvoice(M: AppModules, ref: RefVerification) {
  if (ref.product && (ref.product.gstApplicable && (!ref.product.gstRate && ref.product.gstRate !== 0))) {
    log('warn', 'Product is GST-applicable but has no rate on record — deferring invoice (tax detail unavailable).');
    return;
  }
  const r = await M.ensureOrderInvoice(RECONSTRUCTED_ORDER_ID);
  if (r.ok) {
    log('ok', `Invoice for ${RECONSTRUCTED_ORDER_ID}`, {
      generated: r.generated, invoiceNumber: r.invoiceNumber, storagePath: r.storagePath,
      taxBasis: ref.product ? `gstApplicable=${ref.product.gstApplicable}, gstRate=${ref.product.gstRate}% (from product record)` : 'unknown',
      sellerGstin: ref.seller?.gstin ?? '(none on record)',
    });
  } else {
    const fail = r as { status: number; error: string };
    log('error', `Invoice for ${RECONSTRUCTED_ORDER_ID} FAILED`, { status: fail.status, error: fail.error });
  }
}

// ── Activate + notify (approval #2): status→placed, seller WA, inventory ─────
const SELLER_TEMPLATE = 'order_notification';
const CUSTOMER_TEMPLATE = 'order_confirmation_customer';
async function activateAndNotify(M: AppModules) {
  const db = M.getAdminDb();
  const ref = db.collection('orders').doc(RECONSTRUCTED_ORDER_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    log('error', `Cannot activate — ${RECONSTRUCTED_ORDER_ID} does not exist. Run --commit first.`);
    return;
  }
  const d = snap.data() as Record<string, unknown>;
  const sellerPhone = String(d.sellerPhone ?? d.sellerId ?? '').trim();
  const sellerName = String(d.sellerName ?? '').trim();
  const customerPhone = String(d.customerPhone ?? '').trim() || CASE.customer.phone;
  const customerName = String(d.customerName ?? '').trim() || CASE.customer.name;
  const nowIso = new Date().toISOString();

  // 1) Activate: flip held → placed. Fires notifyCustomerOnOrderStatus (onWrite)
  //    → queues the CUSTOMER order_confirmation_customer WA via the real trigger.
  if (String(d.status) !== 'placed') {
    const history = Array.isArray(d.statusHistory) ? (d.statusHistory as unknown[]) : [];
    await ref.update({
      status: 'placed',
      statusHistory: [...history, { status: 'placed', at: nowIso }],
      'recovered.activated': true,
      'recovered.activatedAt': nowIso,
      updatedAt: M.FieldValue.serverTimestamp(),
    });
    log('ok', 'Order activated (status → placed); customer confirmation queued by notifyCustomerOnOrderStatus.');
  } else {
    log('ok', 'Order already placed — not re-activated.');
  }

  // 2) Customer WA dedup / independent retry (the trigger only fires on the flip above).
  await sleep(4000);
  let rows = await waRowsForOrder(db, RECONSTRUCTED_ORDER_ID);
  if (rows.filter((r) => r.template === CUSTOMER_TEMPLATE).length === 0) {
    const id = await M.queueOrderConfirmationCustomer(customerPhone, customerName, RECONSTRUCTED_ORDER_ID);
    log('ok', `[WA] customer ${CUSTOMER_TEMPLATE} was missing → queued (retry)`, { waNotificationId: id, to: customerPhone });
  } else {
    log('ok', `[WA] customer ${CUSTOMER_TEMPLATE} present — not re-queued`, { rows: rows.filter((r) => r.template === CUSTOMER_TEMPLATE) });
  }

  // 3) Seller WA — notifySellerOnOrder (onCreate) will NOT fire for the held/updated
  //    doc, so queue it explicitly via the existing helper, with dedup.
  if (!sellerPhone) {
    log('error', '[WA] seller phone missing on order — cannot send seller notification.');
  } else if (rows.filter((r) => r.template === SELLER_TEMPLATE).length === 0) {
    const id = await M.queueOrderNotification(sellerPhone, sellerName, { orderId: RECONSTRUCTED_ORDER_ID });
    log('ok', `[WA] seller ${SELLER_TEMPLATE} queued`, { waNotificationId: id, to: sellerPhone });
  } else {
    log('ok', `[WA] seller ${SELLER_TEMPLATE} present — not re-queued`, { rows: rows.filter((r) => r.template === SELLER_TEMPLATE) });
  }

  // 4) Inventory — single, guarded, idempotent. The create trigger was suppressed,
  //    so no deduction has happened. Only decrement a NUMERIC stock; never corrupt
  //    a string like "In Stock". Marked so it can never repeat.
  await applyInventoryOnce(M, d);

  const finalRows = await waRowsForOrder(db, RECONSTRUCTED_ORDER_ID);
  log('info', '[WA] final waNotifications for order', { orderId: RECONSTRUCTED_ORDER_ID, rows: finalRows });
}

async function applyInventoryOnce(M: AppModules, orderData: Record<string, unknown>) {
  const db = M.getAdminDb();
  const ref = db.collection('orders').doc(RECONSTRUCTED_ORDER_ID);
  const recovered = (orderData.recovered ?? {}) as Record<string, unknown>;
  if (recovered.inventoryApplied === true) {
    log('ok', '[inventory] already applied for this order — skipping (no repeat deduction).');
    return;
  }
  const sellerPhone = String(orderData.sellerPhone ?? '').trim();
  const items = Array.isArray(orderData.items) ? (orderData.items as Record<string, unknown>[]) : [];
  const report: Record<string, unknown>[] = [];
  for (const it of items) {
    const catalogId = String(it.productId ?? '');
    const qty = Math.max(1, Math.floor(Number(it.qty ?? 1)));
    let copy: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    for (const field of ['manufacturerProductId', 'originalProductId']) {
      const q = await db.collection('products').where(field, '==', catalogId).where('retailerPhone', '==', sellerPhone).limit(1).get();
      if (!q.empty) { copy = q.docs[0]; break; }
    }
    if (!copy) { report.push({ productId: catalogId, result: 'no seller catalog copy — nothing to decrement' }); continue; }
    const stock = copy.data().stockQuantity ?? copy.data().stock;
    if (typeof stock === 'number' && Number.isFinite(stock)) {
      await copy.ref.update({ stockQuantity: M.FieldValue.increment(-qty), updatedAt: M.FieldValue.serverTimestamp() });
      report.push({ productId: catalogId, copyId: copy.id, from: stock, to: stock - qty, decremented: qty });
    } else {
      report.push({ productId: catalogId, copyId: copy.id, stock, result: 'non-numeric stock — not decremented (would corrupt)' });
    }
  }
  await ref.update({ 'recovered.inventoryApplied': true, 'recovered.inventoryAt': new Date().toISOString(), updatedAt: M.FieldValue.serverTimestamp() });
  log('ok', '[inventory] applied once (idempotent marker set).', { report });
}

// ── Verify through the app's own retrieval paths ────────────────────────────
async function verifyRetrieval(M: AppModules, orderId: string) {
  const db = M.getAdminDb();
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) { log('error', `Retrieval: orders/${orderId} does NOT exist`); return; }
  const d = snap.data()!;
  log('ok', `Retrieval: orders/${orderId} exists`, {
    status: d.status, grandTotal: d.grandTotal ?? d.total, subtotal: d.subtotal,
    deliveryCharge: d.deliveryCharge, totalGstAdded: d.totalGstAdded ?? 0,
    sellerName: d.sellerName, sellerPhone: d.sellerPhone, sellerGstNumber: d.sellerGstNumber ?? null,
    items: (Array.isArray(d.items) ? d.items : []).map((i: any) => ({ name: i.name, qty: i.qty, price: i.price, lineTotal: i.lineTotal, gstRate: i.gstRate ?? null })),
    customerPhone: d.customerPhone, payment: d.payment, recovered: d.recovered ?? null,
  });
  const invoice = d.invoice as { invoiceNumber?: string; storagePath?: string } | undefined;
  if (!invoice?.storagePath) { log('warn', `Retrieval: order has no invoice.storagePath yet (/invoice/${orderId} would 404)`); return; }
  try {
    const file = M.getAdminStorage().bucket().file(invoice.storagePath);
    const [exists] = await file.exists();
    if (!exists) { log('error', 'Retrieval: invoice file missing in Storage', { storagePath: invoice.storagePath }); return; }
    const [bytes] = await file.download();
    const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
    log(isPdf ? 'ok' : 'warn', 'Retrieval: invoice PDF readable', {
      invoiceNumber: invoice.invoiceNumber, storagePath: invoice.storagePath, bytes: bytes.length,
      looksLikePdf: isPdf, invoiceUrl: `https://krishidukan.com/invoice/${orderId}`,
    });
  } catch (e) {
    log('error', `Retrieval: could not read invoice from Storage: ${errText(e)}`);
  }
}

// ── Report printers ─────────────────────────────────────────────────────────
function printPaymentReport(v: PaymentVerification) {
  heading('1) PAYMENT VERIFICATION (Razorpay, read-only)');
  if (v.payment) {
    const p = v.payment as any;
    log('info', 'Razorpay payment', {
      id: p.id, status: p.status, order_id: p.order_id, amountPaise: p.amount,
      amountRupees: Number(p.amount ?? 0) / 100, method: p.method ?? null,
      contact: p.contact ?? null, email: p.email ?? null, rrn: p.acquirer_data?.rrn ?? null,
    });
  }
  log('info', 'Ownership (Razorpay order notes.userId)', {
    found: v.ownerUid ?? null, expected: CASE.customer.uid, match: v.ownerUid ? v.ownerUid === CASE.customer.uid : 'unknown',
  });
  v.warnings.forEach((w) => log('warn', w));
  v.blocking.forEach((b) => log('error', `BLOCKING: ${b}`));
  log(v.ok ? 'ok' : 'stop', v.ok ? 'Payment verified.' : 'Payment NOT verified.');
}
function printInvestigation(inv: Investigation) {
  heading('2) FIRESTORE INVESTIGATION (read-only)');
  log('info', 'Existing orders for this Razorpay order', { orderIds: inv.existingOrderIds });
  log('info', 'Reconstruction target', { id: RECONSTRUCTED_ORDER_ID, exists: inv.reconstructedExists, status: inv.reconstructedStatus ?? null });
  log('info', 'paymentAttempts snapshot', {
    exists: inv.attemptExists, kind: inv.attemptKind ?? null, items: inv.attemptItems,
    usableForAutomatedRecovery: inv.attemptUsable, paidStub: inv.attemptPaidStub,
  });
  for (const id of Object.keys(inv.invoiceByOrder)) {
    log('info', `order ${id}`, { invoice: inv.invoiceByOrder[id], whatsapp: inv.waByOrder[id] });
  }
  inv.notes.forEach((n) => log('warn', n));
}
function printRefReport(ref: RefVerification) {
  heading('3) SELLER & PRODUCT VERIFICATION (read-only)');
  log('info', 'Seller', ref.seller ?? { found: false });
  log('info', 'Product', ref.product ?? { found: false });
  log('info', 'Seller stocks this product (catalog copy)?', { sellerHasCatalogCopy: ref.sellerHasCatalogCopy ?? 'unknown' });
  ref.warnings.forEach((w) => log('warn', w));
  ref.blocking.forEach((b) => log('error', `BLOCKING: ${b}`));
  log(ref.ok ? 'ok' : 'stop', ref.ok ? 'References verified.' : 'References NOT fully verified.');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  heading(`KrishiDukan order recovery · ${CASE.razorpayPaymentId} · mode=${MODE}${MANUAL ? ' (manual)' : ''}`);
  log('info', 'Case', {
    payment: CASE.razorpayPaymentId, order: CASE.razorpayOrderId,
    buyer: `${CASE.customer.name} / ${CASE.customer.phone} / ${CASE.customer.uid}`,
    seller: `${CASE.seller.expectedShopName} / ${CASE.seller.phone}`,
    line: `${CASE.product.qty}× ${CASE.product.displayName} (${CASE.product.variantUnit}) @ ₹${CASE.product.unitPrice} = ₹${CASE.product.qty * CASE.product.unitPrice}`,
    reconstructedOrderId: RECONSTRUCTED_ORDER_ID,
  });

  loadEnv();
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  log('info', `Firebase project: ${projectId}`);
  if (projectId !== 'krishidukan-e8315') log('warn', 'Project is NOT prod (krishidukan-e8315).');

  let M: AppModules;
  try { M = await appModules(); }
  catch (e) { log('error', `Could not init Admin SDK: ${errText(e)}`); process.exitCode = 1; return; }

  // Always: payment verification + investigation (read-only)
  const pv = await verifyPayment();
  printPaymentReport(pv);

  let inv: Investigation;
  try { inv = await investigate(M); }
  catch (e) {
    log('error', `Investigation failed (likely missing Firebase admin credentials): ${errText(e)}`);
    log('stop', 'Cannot continue without read access to prod Firestore. See CREDENTIALS in the header.');
    process.exitCode = 1; return;
  }
  printInvestigation(inv);

  // VERIFY mode
  if (MODE === 'verify') {
    heading('VERIFY — re-checking order(s) via normal retrieval paths');
    const ids = Array.from(new Set([...inv.existingOrderIds, ...(inv.reconstructedExists ? [RECONSTRUCTED_ORDER_ID] : [])]));
    if (ids.length === 0) log('warn', 'No order exists yet for this payment — nothing to verify.');
    for (const id of ids) await verifyRetrieval(M, id);
    return;
  }

  // AUTOMATED path (only when a usable cart snapshot exists)
  if (MODE === 'apply') {
    if (!pv.ok) { log('stop', 'Payment not verified — automated recovery aborted.'); process.exitCode = 1; return; }
    if (!inv.attemptUsable) {
      log('stop', 'No usable cart snapshot — automated recovery is impossible here. Use the manual path: --manual --commit --affirm-seller-product --yes');
      process.exitCode = 1; return;
    }
    if (!CONFIRMED) { log('stop', '--apply requires --yes.'); return; }
    heading('AUTOMATED RECOVERY');
    const outcome = await M.recoverOrderFromCapturedPayment({
      razorpayOrderId: CASE.razorpayOrderId, razorpayPaymentId: CASE.razorpayPaymentId,
      amountPaise: pv.amountPaise ?? CASE.expectedAmountPaise,
    });
    log(outcome.action === 'skipped' ? 'error' : 'ok', `recoverOrderFromCapturedPayment → ${outcome.action}`, { ...outcome });
    if (outcome.action !== 'skipped') for (const id of outcome.orderIds) await verifyRetrieval(M, id);
    return;
  }

  // ── MANUAL RECONSTRUCTION PATH ───────────────────────────────────────────
  if (!MANUAL) {
    heading('STOP — investigation complete');
    if (inv.attemptPaidStub) {
      log('stop', 'Automated recovery is impossible (paid-stub, no snapshot). Authorized manual reconstruction:');
      log('info', '  Preview : npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --manual');
    } else {
      log('stop', 'Read-only run. No data was modified.');
    }
    return;
  }

  // Manual gates: payment + references
  if (!pv.ok) { log('stop', 'Payment not verified — manual reconstruction cannot proceed.'); process.exitCode = 1; return; }
  if (inv.existingOrderIds.length > 0 && !inv.reconstructedExists) {
    log('stop', 'An order already exists for this payment under a different id — would duplicate. Resolve manually.', { orderIds: inv.existingOrderIds });
    process.exitCode = 1; return;
  }
  const ref = await verifyReferences(M);
  printRefReport(ref);
  if (!ref.ok) { log('stop', 'Essential references not verified — stopping (no write).'); process.exitCode = 1; return; }

  // Build + show the proposed order document
  const nowIso = new Date().toISOString();
  const { order: proposed, totals } = buildProposedOrder(M, ref, pv.amountPaise ?? CASE.expectedAmountPaise, nowIso);
  heading('4) PROPOSED ORDER DOCUMENT (nothing written yet)');
  log('info', `orders/${RECONSTRUCTED_ORDER_ID}`, proposed);
  log('info', 'Totals cross-check', {
    computed: totals, razorpayRupees: (pv.amountPaise ?? CASE.expectedAmountPaise) / 100, taskTotal: CASE.product.qty * CASE.product.unitPrice,
    match: totals.grandTotal === (pv.amountPaise ?? CASE.expectedAmountPaise) / 100,
  });
  log('info', 'Recovery actions that WOULD run', {
    commit: 'write held order (status recovered_hold), no inventory, no WhatsApp',
    invoice: `ensureOrderInvoice (tax: gstRate=${ref.product?.gstRate}% from record; sellerGstin=${ref.seller?.gstin ?? 'none'})`,
    activate_and_notify: 'status → placed (customer WA via trigger), seller WA via helper, single guarded inventory deduction',
  });

  if (MODE === 'manual-preview') {
    heading('STOP — preview only');
    log('stop', 'No data written. To COMMIT the held order + invoice (approval #1):');
    log('info', `  npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --manual --commit${ref.sellerHasCatalogCopy === false ? ' --affirm-seller-product' : ''} --yes`);
    return;
  }

  if (MODE === 'commit') {
    if (!CONFIRMED) { log('stop', '--commit requires --yes.'); return; }
    heading('5) COMMIT — write held order (approval #1)');
    log('warn', 'Writing the reconstructed order in HELD state. No inventory, no WhatsApp yet.');
    await commitHeldOrder(M, proposed);
    heading('6) INVOICE (separate step)');
    await generateInvoice(M, ref);
    heading('7) VERIFY via normal retrieval paths');
    await verifyRetrieval(M, RECONSTRUCTED_ORDER_ID);
    heading('STOP — awaiting separate WhatsApp approval');
    log('stop', 'Order + invoice reconstructed and verified. NO WhatsApp sent. To activate + notify (approval #2):');
    log('info', '  npx tsx scripts/recover-order-TmCUV3H5VMAZfy.ts --manual --send-whatsapp --yes');
    return;
  }

  if (MODE === 'send-whatsapp') {
    if (!inv.reconstructedExists) { log('stop', 'No reconstructed order yet — run --commit first.'); process.exitCode = 1; return; }
    if (!CONFIRMED) { log('stop', '--send-whatsapp requires --yes.'); return; }
    heading('8) ACTIVATE + NOTIFY (approval #2) — sends real WhatsApp');
    log('warn', 'This sends WhatsApp to the real customer and seller and decrements inventory once.');
    await activateAndNotify(M);
    heading('9) FINAL VERIFY');
    await verifyRetrieval(M, RECONSTRUCTED_ORDER_ID);
    heading('DONE');
    log('ok', 'Manual reconstruction complete.', { orderId: RECONSTRUCTED_ORDER_ID });
    return;
  }
}

main().catch((e) => { log('error', `Unhandled: ${errText(e)}`); process.exitCode = 1; });
