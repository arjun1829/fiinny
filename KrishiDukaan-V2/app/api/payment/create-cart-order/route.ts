import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(request: Request) {
  try {
    const { amount, userId, note } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // convert ₹ to paise
      currency: 'INR',
      receipt: `cart_${Date.now()}`,
      notes: {
        userId: userId || '',
        note: note || 'Cart Order',
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error('Cart order creation failed:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
