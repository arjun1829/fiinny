import { getAdminDb } from './firebase-admin';

/**
 * Payment attempt tracking.
 *
 * Every Razorpay order this app creates gets a `paymentAttempts/{razorpayOrderId}`
 * document written server-side at creation time, before the customer ever sees
 * the checkout sheet. The status is then moved to 'paid' or 'failed' as the
 * payment resolves.
 *
 * Why server-side, when the clients already logged failures to `failedPayments`:
 *
 *  1. The client cannot be relied on to report. A killed app, a closed browser
 *     tab, a dropped connection mid-UPI — all produce a real lost sale that the
 *     old client-side logging never recorded at all.
 *  2. An abandoned checkout (customer dismisses the Razorpay sheet) was never
 *     recorded by anything. Those attempts simply stay 'created' here, which is
 *     how the admin view surfaces them.
 *  3. Only the server knows what was in the basket. `create-cart-order` already
 *     resolves every item's real price from Firestore to build the charge; that
 *     same resolved list is stored here, so admin can see WHICH products and at
 *     what price a failed payment was for. The old failedPayments record had
 *     only an amount and a Razorpay order id.
 *
 * Written exclusively through the Admin SDK, which bypasses Firestore rules —
 * the matching rule denies all client writes so a customer cannot forge or
 * tamper with the record of what they tried to buy.
 */

/** One line of a cart attempt, priced by the server. */
export type AttemptItem = {
  productId: string;
  name: string;
  qty: number;
  /** Rupees, after any active discount — the price actually charged. */
  unitPrice: number;
  lineTotal: number;
  sellerId: string;
  sellerPhone: string | null;
  sellerName: string | null;
  /**
   * How the price was resolved. A value other than 'inventory' means the
   * primary lookup missed, which is worth seeing when a charge looks wrong.
   */
  priceSource: 'inventory' | 'seller-copy' | 'availability' | 'canonical' | 'none';
};

export type AttemptKind = 'cart' | 'subscription';

export type AttemptStatus = 'created' | 'paid' | 'failed';

/** Where a record came from: our own client reporting it live, a Razorpay
 *  webhook firing independent of the client, or a manual backfill sweep. */
export type AttemptOrigin = 'client' | 'razorpay_webhook' | 'razorpay_backfill';

export type RecordAttemptInput = {
  razorpayOrderId: string;
  kind: AttemptKind;
  userId: string;
  /** Rupees. */
  amount: number;
  source: 'web' | 'mobile' | 'unknown';
  items?: AttemptItem[];
  subtotal?: number;
  deliveryCharge?: number;
  /**
   * Checkout details captured BEFORE payment. Until these were recorded, the
   * delivery address only ever existed on the customer's device and reached
   * the server in the final client-side order write — the one step that can
   * fail after money has already moved (killed app, dropped network, a UPI
   * confirmation arriving after the customer left the screen). Storing them
   * here is what lets the payment.captured webhook rebuild a complete order
   * server-side when that client step never runs.
   */
  customerName?: string;
  customerPhone?: string;
  /** String (web) or {name, phone, address, city, pincode} (mobile) — both
   *  shapes are live on orders, see types/order.ts CustomerAddress. */
  customerAddress?: unknown;
  /** Per-seller delivery split, keyed the way orders key sellers (phone).
   *  Lets a recovered multi-seller order allocate delivery correctly. */
  deliveryBySeller?: Record<string, number>;
  /** Subscription attempts only. */
  seatCount?: number;
  durationMonths?: number;
  promoCode?: string | null;
  discountPercent?: number;
  /**
   * Validated, active referral code (lib/referrals.ts) — set only by
   * create-order after checking it, so attribution can't be client-forged.
   */
  referralCode?: string | null;
  note?: string;
};

/**
 * Resolves a buyer's phone and display name so admin can contact them without a
 * second lookup per row. Best-effort: a missing user doc must never stop an
 * order being created, so every failure here degrades to nulls.
 */
async function resolveBuyer(
  userId: string,
): Promise<{ phone: string | null; name: string | null }> {
  const db = getAdminDb();
  try {
    // Phone-keyed accounts reach their doc through uidIndex; email-keyed ones
    // live at users/{uid} directly. Try both, same as the sales-role lookup.
    const idx = await db.collection('uidIndex').doc(userId).get();
    const phone = idx.exists ? String(idx.data()?.phone ?? '') : '';

    const userSnap = phone
      ? await db.collection('users').doc(phone).get()
      : await db.collection('users').doc(userId).get();

    const data = userSnap.exists ? userSnap.data() ?? {} : {};
    return {
      phone: phone || (data.phone ? String(data.phone) : null),
      name:
        (data.name && String(data.name)) ||
        (data.businessName && String(data.businessName)) ||
        (data.ownerName && String(data.ownerName)) ||
        null,
    };
  } catch {
    return { phone: null, name: null };
  }
}

/**
 * Writes the attempt record. Never throws — a logging failure must not stop a
 * customer from paying, so the caller can await this without a try/catch and
 * still be sure the checkout proceeds.
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<void> {
  try {
    const buyer = await resolveBuyer(input.userId);
    await getAdminDb()
      .collection('paymentAttempts')
      .doc(input.razorpayOrderId)
      .set(
        {
          razorpayOrderId: input.razorpayOrderId,
          kind: input.kind,
          status: 'created' as AttemptStatus,

          userId: input.userId,
          userPhone: buyer.phone,
          userName: buyer.name,

          amount: input.amount,
          subtotal: input.subtotal ?? null,
          deliveryCharge: input.deliveryCharge ?? null,

          items: input.items ?? [],
          itemCount: input.items?.length ?? 0,

          // Client-supplied checkout details take precedence over the profile
          // lookup above — they are what the customer typed for THIS order.
          ...(input.customerName ? { customerName: input.customerName } : {}),
          ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
          ...(input.customerAddress ? { customerAddress: input.customerAddress } : {}),
          ...(input.deliveryBySeller ? { deliveryBySeller: input.deliveryBySeller } : {}),

          seatCount: input.seatCount ?? null,
          durationMonths: input.durationMonths ?? null,
          promoCode: input.promoCode ?? null,
          discountPercent: input.discountPercent ?? null,
          referralCode: input.referralCode ?? null,

          note: input.note ?? null,
          source: input.source,

          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true },
      );
  } catch (e) {
    console.error('[paymentAttempts] could not record attempt:', e);
  }
}

/**
 * Marks an attempt paid. Called from both the signature-verify path and the
 * order-status reconciliation path, so an attempt is closed out no matter which
 * one confirmed the money — including the mobile late-UPI case, where the SDK
 * reported failure but Razorpay had in fact captured.
 */
export async function markAttemptPaid(
  razorpayOrderId: string,
  razorpayPaymentId: string | null,
): Promise<void> {
  try {
    await getAdminDb()
      .collection('paymentAttempts')
      .doc(razorpayOrderId)
      .set(
        {
          status: 'paid' as AttemptStatus,
          razorpayPaymentId: razorpayPaymentId ?? null,
          paidAt: new Date(),
          updatedAt: new Date(),
          // A late capture can arrive after a failure was already recorded, so
          // clear the error rather than leaving a paid row showing one.
          error: null,
        },
        { merge: true },
      );
  } catch (e) {
    console.error('[paymentAttempts] could not mark paid:', e);
  }
}

export type AttemptError = {
  code?: string | null;
  description?: string | null;
  reason?: string | null;
  source?: string | null;
  step?: string | null;
};

/**
 * Marks an attempt failed with whatever Razorpay told the client.
 *
 * Deliberately refuses to overwrite an attempt already marked 'paid': the
 * client's failure signal is not authoritative (see /api/payment/order-status),
 * so a late-arriving failure callback must not bury a confirmed payment.
 */
export async function markAttemptFailed(
  razorpayOrderId: string,
  error: AttemptError,
): Promise<void> {
  try {
    const ref = getAdminDb().collection('paymentAttempts').doc(razorpayOrderId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.status === 'paid') return;

    await ref.set(
      {
        status: 'failed' as AttemptStatus,
        error: {
          code: error.code ?? null,
          description: error.description ?? null,
          reason: error.reason ?? null,
          source: error.source ?? null,
          step: error.step ?? null,
        },
        failedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } catch (e) {
    console.error('[paymentAttempts] could not mark failed:', e);
  }
}

/** Minimal shape of the fields this file reads off a Razorpay order — not the
 *  full SDK type, just what create-cart-order/create-order actually stamp
 *  into `notes` at order-creation time. */
type RazorpayOrderLike = {
  id: string;
  notes?: Record<string, unknown> | null;
};

/** Minimal shape of a Razorpay payment entity, as seen in both the List
 *  Payments API and a `payment.failed` webhook payload. */
type RazorpayPaymentLike = {
  id: string;
  order_id: string;
  amount: number; // paise
  method?: string | null;
  contact?: string | null;
  email?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  created_at?: number; // unix seconds
};

/** create-order (subscription) stamps seatCount/durationMonths;
 *  create-cart-order stamps itemCount/serverSubtotal. Neither is ambiguous —
 *  an order is one or the other, never both. Unrecognized notes (an order
 *  this app didn't create — shouldn't happen, but a Razorpay account is
 *  sometimes shared) fall back to 'cart' as the more common case rather than
 *  dropping the record. */
function kindFromOrderNotes(notes: Record<string, unknown> | null | undefined): AttemptKind {
  if (notes && ('seatCount' in notes || 'durationMonths' in notes || 'planId' in notes)) {
    return 'subscription';
  }
  return 'cart';
}

/**
 * Records a failure straight from Razorpay's own records — self-sufficient,
 * unlike markAttemptFailed: it does not require a 'created' attempt to
 * already exist, because both the webhook and the backfill sweep exist
 * specifically to catch failures the client never got a chance to report in
 * the first place.
 *
 * Deliberately does NOT touch `items`/`subtotal` — those come only from the
 * client-resolved basket at checkout (create-cart-order), which Razorpay has
 * no knowledge of. A merge write leaves them untouched if a 'created' attempt
 * already recorded them, and simply absent if this is the first anyone has
 * heard of the order.
 *
 * Also refuses to downgrade a 'paid' attempt, same rule as markAttemptFailed —
 * a webhook retry or a backfill sweep running after the order-status
 * reconciliation already confirmed capture must never re-mark it failed.
 */
export async function recordFailureFromRazorpay(
  payment: RazorpayPaymentLike,
  order: RazorpayOrderLike,
  origin: AttemptOrigin,
): Promise<void> {
  try {
    const ref = getAdminDb().collection('paymentAttempts').doc(order.id);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.status === 'paid') return;

    const userId = String(order.notes?.userId ?? '');
    const buyer = userId ? await resolveBuyer(userId) : { phone: null, name: null };

    await ref.set(
      {
        razorpayOrderId: order.id,
        razorpayPaymentId: payment.id,
        kind: kindFromOrderNotes(order.notes),
        status: 'failed' as AttemptStatus,

        userId: userId || null,
        // Razorpay's own contact/email are what actually reaches the
        // customer when support follows up — kept alongside (not instead
        // of) our resolved profile, since an old/guest order may have no
        // matching user doc at all.
        userPhone: buyer.phone ?? payment.contact ?? null,
        userName: buyer.name ?? null,
        razorpayContact: payment.contact ?? null,
        razorpayEmail: payment.email ?? null,

        amount: payment.amount / 100,
        method: payment.method ?? null,

        error: {
          code: payment.error_code ?? null,
          description: payment.error_description ?? null,
          reason: payment.error_reason ?? null,
          source: payment.error_source ?? null,
          step: payment.error_step ?? null,
        },

        source: origin,
        // The real moment Razorpay recorded the failure, not when this sweep
        // happened to run — a backfilled row must sort and read like it
        // occurred when it actually did.
        createdAt: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
        failedAt: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } catch (e) {
    console.error('[paymentAttempts] could not record failure from Razorpay:', e);
    throw e; // caller (webhook/backfill) needs to know a row was NOT saved
  }
}
