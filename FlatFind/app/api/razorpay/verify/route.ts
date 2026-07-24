import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminAuth } from '@/firebase/admin';

/**
 * POST /api/razorpay/verify
 *
 * Confirms a completed Razorpay payment is authentic — HMAC-SHA256 over
 * `${order_id}|${payment_id}` signed with RAZORPAY_KEY_SECRET, same scheme
 * KrishiDukaan-v2 uses. This route ONLY verifies; it never writes to
 * Firestore. The client calls subscription-firestore.ts's
 * activateProAfterPayment() itself immediately after receiving
 * {status:'ok'} from here — matching KrishiDukaan-v2's real architecture
 * (verify confirms, the client writes, firestore.rules is the actual
 * enforcement boundary on that write), not a stronger guarantee than that.
 *
 * Also requires the caller's Firebase ID token, re-verified here even
 * though create-order already checked it once — the client always holds a
 * fresh token by this point in the flow, so there's no cost to checking
 * again, and it stops this endpoint being usable by a signed-out caller who
 * somehow obtained a valid order/payment/signature triple.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }
    try {
      await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ status: 'failed', error: 'Missing payment fields' }, { status: 400 });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return NextResponse.json({ status: 'failed' }, { status: 400 });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
