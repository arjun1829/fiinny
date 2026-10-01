import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminAuth } from '../../../lib/firebase-admin';
import { markAttemptPaid } from '../../../lib/payment-attempts';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/**
 * POST /api/payment/order-status
 *
 * Reconciles a Razorpay order against Razorpay's own records, independent of
 * whatever the checkout SDK told the client.
 *
 * Why this exists: the native (Android/iOS) razorpay_flutter checkout has its
 * own internal wait for the payment to complete and fires PAYMENT_ERROR with
 * "you could not complete it in time" once that wait elapses — this is the
 * SDK giving up on WATCHING the payment, not Razorpay's own record of whether
 * it succeeded. A UPI collect request approved a little late (slow network,
 * switching apps, bank delay) lands after the SDK stops waiting, so the money
 * is captured on Razorpay's side while the app is already showing "Failed".
 * That is exactly what was reported: "we do get the payment but the app says
 * failed".
 *
 * So instead of trusting the SDK's local timeout as gospel, the client asks
 * THIS endpoint — which asks Razorpay directly — before it commits to telling
 * the customer their payment failed. Trust boundary: this reads Razorpay's
 * server records with our own secret key, so unlike the client-supplied
 * signature in /api/payment/verify, nothing here can be forged by the caller;
 * the only check needed is that the caller isn't probing a stranger's order.
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
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    const { razorpay_order_id } = await request.json();
    if (!razorpay_order_id || typeof razorpay_order_id !== 'string') {
      return NextResponse.json({ error: 'razorpay_order_id is required' }, { status: 400 });
    }

    const order = await razorpay.orders.fetch(razorpay_order_id);

    // Both create-order and create-cart-order stamp notes.userId with the
    // caller's own Firebase uid at order-creation time. Refuse to reveal
    // another user's payment status if it somehow doesn't match.
    const ownerUid = (order.notes as Record<string, unknown> | undefined)?.userId;
    if (ownerUid && ownerUid !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const paymentsRes = await razorpay.orders.fetchPayments(razorpay_order_id);
    const payments = (paymentsRes.items ?? []) as { id: string; status: string }[];

    // Auto-capture is on for every order this app creates (payment_capture is
    // never set to 0), so a successful payment reaches 'captured' on its own —
    // no separate capture step for this endpoint to trigger.
    const captured = payments.find((p) => p.status === 'captured');
    if (captured) {
      // The late-UPI path: the SDK already told the client "failed", so without
      // this the attempt would sit recorded as a failure despite the money
      // having been captured. markAttemptPaid also clears any error already
      // written by the client's failure callback.
      await markAttemptPaid(razorpay_order_id, captured.id);

      return NextResponse.json({
        status: 'captured',
        orderId: razorpay_order_id,
        paymentId: captured.id,
        // Same notes /api/payment/verify reads seatCount/durationMonths from —
        // set server-side at order-creation time (create-order/route.ts), so
        // the subscription-activation reconciliation path has the same
        // trustworthy values without a second round-trip that would need a
        // signature this path deliberately doesn't have.
        notes: order.notes ?? null,
      });
    }

    // Authorized-but-uncaptured would be unusual given auto-capture, but
    // surface it distinctly rather than folding it into 'not_captured' —
    // it means Razorpay DID receive a valid payment attempt, just not one
    // this endpoint should silently treat as money-in-hand.
    const authorized = payments.find((p) => p.status === 'authorized');
    if (authorized) {
      return NextResponse.json({
        status: 'authorized',
        orderId: razorpay_order_id,
        paymentId: authorized.id,
      });
    }

    return NextResponse.json({ status: 'not_captured', orderId: razorpay_order_id });
  } catch (error) {
    console.error('[order-status] reconciliation failed:', error);
    return NextResponse.json({ error: 'Could not check payment status' }, { status: 500 });
  }
}
