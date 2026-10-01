import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminAuth } from '../../../lib/firebase-admin';
import { markAttemptFailed, markAttemptPaid } from '../../../lib/payment-attempts';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * POST /api/payment/attempt-failed
 *
 * Records that a checkout failed, against the attempt row the create-order
 * routes wrote. Body: { razorpay_order_id, error? }
 *
 * The client's word is NOT taken as final. The native Razorpay SDK reports
 * failure when its own wait for the payment elapses, which is not the same as
 * Razorpay having no payment on record — a UPI collect approved slightly late
 * is captured after the SDK has given up (see /api/payment/order-status for the
 * full explanation). So this endpoint asks Razorpay first, and if the money is
 * actually captured it marks the attempt PAID and tells the caller, instead of
 * filing a failure that never happened.
 *
 * Only when Razorpay agrees there is no capture is the attempt marked failed.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }
    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    const body = (await request.json()) as {
      razorpay_order_id?: string;
      error?: Record<string, unknown> | null;
    };
    const orderId = body.razorpay_order_id;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'razorpay_order_id is required' }, { status: 400 });
    }

    // Same ownership guard as order-status: both create routes stamp
    // notes.userId, so a caller cannot write a failure onto someone else's order.
    let order;
    try {
      order = await razorpay.orders.fetch(orderId);
    } catch {
      return NextResponse.json({ error: 'Unknown order' }, { status: 404 });
    }
    const ownerUid = (order.notes as Record<string, unknown> | undefined)?.userId;
    if (ownerUid && ownerUid !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ask Razorpay before believing the client.
    try {
      const paymentsRes = await razorpay.orders.fetchPayments(orderId);
      const payments = (paymentsRes.items ?? []) as { id: string; status: string }[];
      const captured = payments.find((p) => p.status === 'captured');
      if (captured) {
        await markAttemptPaid(orderId, captured.id);
        return NextResponse.json({
          status: 'captured',
          paymentId: captured.id,
          note: 'Payment was actually captured — attempt recorded as paid, not failed.',
        });
      }
    } catch (e) {
      // Razorpay unreachable. Record the failure the client reported rather
      // than losing the signal entirely; a later order-status check can still
      // flip it to paid, since markAttemptPaid clears the error.
      console.error('[attempt-failed] could not reach Razorpay, trusting client:', e);
    }

    const err = body.error ?? {};
    await markAttemptFailed(orderId, {
      code:        err.code        ? String(err.code)        : null,
      description: err.description ? String(err.description) : null,
      reason:      err.reason      ? String(err.reason)      : null,
      source:      err.source      ? String(err.source)      : null,
      step:        err.step        ? String(err.step)        : null,
    });

    return NextResponse.json({ status: 'failed' });
  } catch (error) {
    console.error('[attempt-failed] unhandled error:', error);
    return NextResponse.json({ error: 'Could not record the failure' }, { status: 500 });
  }
}
