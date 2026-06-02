import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminDb } from '../../../lib/firebase-admin';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type CartItemInput = {
  productId: string;
  sellerId: string;
  qty: number;
};

/**
 * Returns the active discount percentage from inventory fields, or 0.
 * Mirrors the client-side getActiveDiscountPct() logic — must stay in sync.
 */
function serverActiveDiscountPct(data: FirebaseFirestore.DocumentData): number {
  if (!data.discountEnabled || !data.discountPct || data.discountPct <= 0) return 0;
  const now = Date.now();
  const start: number = data.discountStartDate?.toMillis?.() ?? 0;
  const end: number   = data.discountEndDate?.toMillis?.()   ?? Infinity;
  if (now < start || now > end) return 0;
  return Number(data.discountPct);
}

/**
 * POST /api/payment/create-cart-order
 *
 * Accepts the cart items (productId + sellerId + qty) and verifies prices
 * server-side by reading inventory from Firestore Admin.
 * Creates a Razorpay order with the server-computed total — the client
 * cannot manipulate the amount.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, userId, note } = body as {
      items: CartItemInput[];
      userId: string;
      note?: string;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const db = getAdminDb();
    let serverTotal = 0;

    // Verify each item: fetch inventory, apply server-side discount
    const verifiedItems: Array<{
      productId: string;
      sellerId: string;
      qty: number;
      originalPrice: number;
      discountPct: number;
      finalPrice: number;
      lineTotal: number;
    }> = [];

    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));

      // Find the inventory document for this product owned by this seller.
      // We try ownerId first (uid-keyed), then retailerId (legacy).
      const [snapOwner, snapRetailer] = await Promise.all([
        db.collection('inventory')
          .where('productId', '==', item.productId)
          .where('ownerId', '==', item.sellerId)
          .limit(1)
          .get(),
        db.collection('inventory')
          .where('productId', '==', item.productId)
          .where('retailerId', '==', item.sellerId)
          .limit(1)
          .get(),
      ]);

      const invDoc = !snapOwner.empty
        ? snapOwner.docs[0]
        : !snapRetailer.empty
          ? snapRetailer.docs[0]
          : null;

      if (!invDoc) {
        // Fallback: read price from the product doc itself
        const prodSnap = await db.collection('products').doc(item.productId).get();
        if (!prodSnap.exists) {
          return NextResponse.json(
            { error: `Product ${item.productId} not found` },
            { status: 400 },
          );
        }
        const originalPrice = Number(prodSnap.data()!.price ?? 0);
        const lineTotal = Math.round(originalPrice * qty * 100) / 100;
        serverTotal += lineTotal;
        verifiedItems.push({ productId: item.productId, sellerId: item.sellerId, qty, originalPrice, discountPct: 0, finalPrice: originalPrice, lineTotal });
        continue;
      }

      const invData = invDoc.data();
      const originalPrice = Number(invData.sellingPrice ?? invData.price ?? 0);
      const discountPct   = serverActiveDiscountPct(invData);
      const discountAmt   = Math.round((originalPrice * discountPct) / 100 * 100) / 100;
      const finalPrice    = Math.round((originalPrice - discountAmt) * 100) / 100;
      const lineTotal     = Math.round(finalPrice * qty * 100) / 100;

      serverTotal += lineTotal;
      verifiedItems.push({ productId: item.productId, sellerId: item.sellerId, qty, originalPrice, discountPct, finalPrice, lineTotal });
    }

    serverTotal = Math.round(serverTotal * 100) / 100;

    if (serverTotal <= 0) {
      return NextResponse.json({ error: 'Order total must be greater than zero' }, { status: 400 });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(serverTotal * 100), // paise — computed server-side
      currency: 'INR',
      receipt: `cart_${Date.now()}`,
      notes: {
        userId: userId || '',
        note: note || 'Cart Order',
        itemCount: String(items.length),
      },
    });

    return NextResponse.json({
      ...order,
      serverTotal,       // client uses this to display the verified amount
      verifiedItems,     // client can reconcile line items if needed
    });
  } catch (error) {
    console.error('Cart order creation failed:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
