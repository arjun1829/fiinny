import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getClientDb } from '../../../lib/firebase-client-server';
import { collection, doc, getDocs, getDoc, query, where, limit } from 'firebase/firestore/lite';

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
 * POST /api/payment/create-cart-order
 *
 * Accepts the cart items (productId + sellerId + qty) and verifies prices
 * server-side using the public products collection (no admin credentials needed).
 * Creates a Razorpay order with the server-computed total — the client
 * cannot manipulate the amount.
 *
 * Note: Uses the Firebase client SDK lite (REST-based, no ADC/service account
 * required), reading only from the publicly-accessible `products` collection.
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

    const db = getClientDb();
    let serverTotal = 0;

    // Verify each item price using the public `products` collection.
    // inventory collection requires user auth which isn't available server-side
    // without service account credentials — we rely on products as the
    // authoritative price source for Razorpay order creation.
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

      // Try to read from `inventory` collection first (may work if public or
      // if rules allow anonymous reads). Fall back to `products` on any error.
      let resolvedPrice: number | null = null;
      let resolvedDiscountPct = 0;

      try {
        // Attempt inventory lookup via ownerId field (new schema)
        const invQuery = query(
          collection(db, 'inventory'),
          where('productId', '==', item.productId),
          where('ownerId', '==', item.sellerId),
          limit(1),
        );
        const invSnap = await getDocs(invQuery);
        if (!invSnap.empty) {
          const d = invSnap.docs[0].data();
          const basePrice = Number(d.sellingPrice ?? d.price ?? 0);
          // Check for active discount
          if (d.discountEnabled && d.discountPct && Number(d.discountPct) > 0) {
            const now = Date.now();
            const start: number = d.discountStartDate?.toMillis?.() ?? 0;
            const end: number   = d.discountEndDate?.toMillis?.()   ?? Infinity;
            if (now >= start && now <= end) {
              resolvedDiscountPct = Number(d.discountPct);
            }
          }
          resolvedPrice = basePrice;
        }
      } catch {
        // Inventory read failed (auth rules or network) — fall through to products
      }

      // Fall back to retailerId field on inventory if ownerId lookup missed
      if (resolvedPrice === null) {
        try {
          const invQuery2 = query(
            collection(db, 'inventory'),
            where('productId', '==', item.productId),
            where('retailerId', '==', item.sellerId),
            limit(1),
          );
          const invSnap2 = await getDocs(invQuery2);
          if (!invSnap2.empty) {
            const d = invSnap2.docs[0].data();
            const basePrice = Number(d.sellingPrice ?? d.price ?? 0);
            if (d.discountEnabled && d.discountPct && Number(d.discountPct) > 0) {
              const now = Date.now();
              const start: number = d.discountStartDate?.toMillis?.() ?? 0;
              const end: number   = d.discountEndDate?.toMillis?.()   ?? Infinity;
              if (now >= start && now <= end) {
                resolvedDiscountPct = Number(d.discountPct);
              }
            }
            resolvedPrice = basePrice;
          }
        } catch {
          // Also failed — continue to products fallback
        }
      }

      // Final fallback: public `products` collection
      if (resolvedPrice === null || resolvedPrice <= 0) {
        const prodSnap = await getDoc(doc(db, 'products', item.productId));
        if (!prodSnap.exists()) {
          return NextResponse.json(
            { error: `Product ${item.productId} not found` },
            { status: 400 },
          );
        }
        const prodData = prodSnap.data();
        resolvedPrice = Number(prodData.price ?? 0);

        // Apply seller-specific discount from products.sellerDiscounts map if available
        const sellerDiscount = prodData.sellerDiscounts?.[item.sellerId];
        if (sellerDiscount && Number(sellerDiscount) > 0) {
          resolvedDiscountPct = Number(sellerDiscount);
        }
      }

      const originalPrice = resolvedPrice;
      const discountAmt   = Math.round((originalPrice * resolvedDiscountPct) / 100 * 100) / 100;
      const finalPrice    = Math.round((originalPrice - discountAmt) * 100) / 100;
      const lineTotal     = Math.round(finalPrice * qty * 100) / 100;

      serverTotal += lineTotal;
      verifiedItems.push({
        productId: item.productId,
        sellerId: item.sellerId,
        qty,
        originalPrice,
        discountPct: resolvedDiscountPct,
        finalPrice,
        lineTotal,
      });
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
