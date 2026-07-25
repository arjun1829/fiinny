import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminAuth } from '@/firebase/admin';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// FlatFind Pro is a single flat plan — unlike KrishiDukaan's seat/duration
// pricing table, there's no client-supplied quantity to validate, so the
// amount is just this one hardcoded constant. Still server-side only: the
// client never sends an amount, and none would be trusted if it did.
const PRO_PRICE_RUPEES = 499;

/**
 * POST /api/payment/razorpay/create-order
 *
 * Creates a Razorpay order for the FlatFind Pro subscription (₹499/mo,
 * 30-day access). Requires a Firebase ID token — stricter than
 * KrishiDukaan-v2's equivalent create-order route (which has no auth
 * check), matching this project's "follow the same security practices"
 * instruction rather than its most permissive example.
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

    const order = await razorpay.orders.create({
      amount: PRO_PRICE_RUPEES * 100, // paise
      currency: 'INR',
      receipt: `pro_${Date.now()}`,
      notes: { uid, plan: 'pro_monthly' },
    });

    return NextResponse.json({
      ...order,
      // Public key echoed back so the client always opens Checkout with the
      // matching key_id — same rationale as KrishiDukaan-v2's routes.
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
