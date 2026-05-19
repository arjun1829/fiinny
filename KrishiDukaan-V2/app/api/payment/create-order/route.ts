import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Price per seat for the entire duration (₹)
const PRICE_PER_SEAT: Record<number, number> = {
  1:  21,
  3:  54,
  6:  90,
  12: 144,
};

// Server-side promo code table (source of truth — never trust client-computed discounts)
const PROMO_DISCOUNTS: Record<string, number> = {
  // code → discount percent
  // Populated from environment variable JSON for flexibility
  // e.g. PROMO_CODES={"LAUNCH20":20,"AGRI10":10}
};

function loadPromos(): Record<string, number> {
  try {
    const raw = process.env.PROMO_CODES;
    if (raw) return { ...PROMO_DISCOUNTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return PROMO_DISCOUNTS;
}

export async function POST(request: Request) {
  try {
    const { seatCount, durationMonths, promoCode, userId } = await request.json();

    const seats    = Math.max(1, parseInt(String(seatCount), 10) || 1);
    const months   = PRICE_PER_SEAT[durationMonths] ? (durationMonths as number) : 1;
    const unitPrice = PRICE_PER_SEAT[months]!;
    let baseAmount  = seats * unitPrice;

    // Apply promo discount server-side
    if (promoCode) {
      const promos = loadPromos();
      const disc   = promos[String(promoCode).toUpperCase()];
      if (disc) baseAmount = Math.ceil(baseAmount * (1 - disc / 100));
    }

    const options = {
      amount: baseAmount * 100, // paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId:         userId || '',
        seatCount:      seats,
        durationMonths: months,
        promoCode:      promoCode || '',
      },
    };

    const order = await razorpay.orders.create(options);
    return NextResponse.json({ ...order, seatCount: seats, durationMonths: months });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
