import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminDb, getAdminAuth } from '../../../lib/firebase-admin';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type CartItemInput = {
  productId:    string;
  sellerId:     string;
  sellerPhone?: string;
  qty:          number;
};

/**
 * Returns the active discount percentage from inventory fields (0–99), or 0.
 * Mirrors the client-side getActiveDiscountPct() logic.
 */
function serverActiveDiscountPct(data: FirebaseFirestore.DocumentData): number {
  if (!data.discountEnabled || !data.discountPct || data.discountPct <= 0) return 0;
  const now   = Date.now();
  const start = (data.discountStartDate as { toMillis?(): number } | null)?.toMillis?.() ?? 0;
  const end   = (data.discountEndDate   as { toMillis?(): number } | null)?.toMillis?.() ?? Infinity;
  if (now < start || now > end) return 0;
  return Number(data.discountPct);
}

/**
 * POST /api/payment/create-cart-order
 *
 * Verifies item prices server-side (Firestore Admin), adds the client-supplied
 * delivery charge, then creates a Razorpay order with the final amount.
 *
 * Body:
 *   items[]          – cart items (productId, sellerId, sellerPhone?, qty)
 *   userId           – Firebase Auth UID of the buyer
 *   clientSubtotal   – product subtotal computed client-side
 *   clientDelivery   – delivery charge computed client-side
 *   clientGrandTotal – clientSubtotal + clientDelivery
 *   note?            – human-readable label for the Razorpay order
 */
export async function POST(request: Request) {
  try {
    // Verify Firebase ID token from Authorization header
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

    const body = await request.json();
    const {
      items,
      userId,
      clientSubtotal,
      clientDelivery,
      clientGrandTotal,
      note,
    } = body as {
      items:             CartItemInput[];
      userId:            string;
      clientSubtotal?:   number;
      clientDelivery?:   number;
      clientGrandTotal?: number;
      note?:             string;
    };

    console.log('[create-cart-order] received:', {
      itemCount: items?.length,
      clientSubtotal,
      clientDelivery,
      clientGrandTotal,
      userId,
    });

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    // ── Server-side price verification ────────────────────────────────────────
    const db = getAdminDb();
    let serverSubtotal = 0;

    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));

      // Try multiple query strategies to find the inventory doc:
      //   1. ownerId == sellerId (UID-keyed, most common for new accounts)
      //   2. retailerId == sellerId (legacy UID field)
      //   3. ownerPhone == sellerPhone (phone-keyed, when sellerId is a phone)
      //   4. retailerPhone == sellerPhone (legacy phone field)
      const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
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
      ];

      if (item.sellerPhone) {
        queries.push(
          db.collection('inventory')
            .where('productId', '==', item.productId)
            .where('ownerPhone', '==', item.sellerPhone)
            .limit(1)
            .get(),
          db.collection('inventory')
            .where('productId', '==', item.productId)
            .where('retailerPhone', '==', item.sellerPhone)
            .limit(1)
            .get(),
        );
      }

      const snaps = await Promise.all(queries);
      const invDoc = snaps.find((s) => !s.empty)?.docs[0] ?? null;

      let finalPrice: number;

      if (invDoc) {
        const d         = invDoc.data();
        const basePrice = Number(d.sellingPrice ?? d.price ?? 0);
        const discPct   = serverActiveDiscountPct(d);
        const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
        const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
          ? Math.max(0, Number(d.discountFixedAmt ?? 0))
          : 0;
        finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;
        console.log('[create-cart-order] inventory doc found for', item.productId,
          '| base:', basePrice, 'disc:', discPct + '%', 'fixed:', discFixed, 'final:', finalPrice);
      } else {
        // Fallback 1: look up the seller's product copy by manufacturerProductId/originalProductId
        // (this is what mobile sends as productId — the canonical doc ID)
        const sellerCopyQueries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
        const phoneKey = item.sellerPhone;
        if (phoneKey) {
          sellerCopyQueries.push(
            db.collection('products')
              .where('manufacturerProductId', '==', item.productId)
              .where('retailerPhone', '==', phoneKey)
              .limit(1).get(),
            db.collection('products')
              .where('originalProductId', '==', item.productId)
              .where('retailerPhone', '==', phoneKey)
              .limit(1).get(),
          );
        }
        const copySnaps = sellerCopyQueries.length > 0 ? await Promise.all(sellerCopyQueries) : [];
        const copyDoc = copySnaps.find(s => !s.empty)?.docs[0] ?? null;

        if (copyDoc) {
          const d = copyDoc.data();
          const basePrice = Number(d.price ?? d.sellingPrice ?? 0);
          const discPct   = serverActiveDiscountPct(d);
          const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
          const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
            ? Math.max(0, Number(d.discountFixedAmt ?? 0))
            : 0;
          finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;
          console.log('[create-cart-order] seller copy found for', item.productId,
            '| base:', basePrice, 'disc:', discPct + '%', 'final:', finalPrice);
        } else {
          // Fallback 2: read seller's sellingPrice from canonical product's availability[]
          const prodSnap = await db.collection('products').doc(item.productId).get();
          if (!prodSnap.exists) {
            console.warn('[create-cart-order] no product doc for', item.productId, '— skipping');
            finalPrice = 0;
          } else {
            const prodData = prodSnap.data()!;
            const availability = Array.isArray(prodData.availability) ? prodData.availability : [];
            const avEntry = phoneKey
              ? availability.find((e: Record<string,unknown>) =>
                  e.storePhone === phoneKey || e.storeId === phoneKey)
              : null;
            if (avEntry && Number(avEntry.sellingPrice) > 0) {
              finalPrice = Number(avEntry.sellingPrice);
              console.log('[create-cart-order] availability[] entry found for', item.productId,
                '| price:', finalPrice);
            } else {
              finalPrice = Number(prodData.price ?? 0);
              console.log('[create-cart-order] canonical price fallback for', item.productId,
                '| price:', finalPrice);
            }
          }
        }
      }

      serverSubtotal += Math.round(finalPrice * qty * 100) / 100;
    }

    serverSubtotal = Math.round(serverSubtotal * 100) / 100;

    console.log('[create-cart-order] serverSubtotal:', serverSubtotal,
      '| clientSubtotal:', clientSubtotal,
      '| clientDelivery:', clientDelivery,
      '| clientGrandTotal:', clientGrandTotal);

    // ── Determine the Razorpay amount ─────────────────────────────────────────
    // Prefer the server-computed subtotal (can't be tampered with).
    // Fall back to the client-computed subtotal only if the server lookup returned 0.
    // Always add client-provided delivery charge (trusted: independently verified
    // by the same delivery-settings Firestore doc read during order creation).
    const safeClientSubtotal  = Math.max(0, Number(clientSubtotal)  || 0);
    const safeClientDelivery  = Math.max(0, Number(clientDelivery)  || 0);
    const safeClientGrand     = Math.max(0, Number(clientGrandTotal)|| 0);

    const subtotalForPayment  = serverSubtotal > 0 ? serverSubtotal : safeClientSubtotal;
    let   totalForPayment     = Math.round((subtotalForPayment + safeClientDelivery) * 100) / 100;

    // Last resort: use the client grand total if everything else is still 0
    if (totalForPayment <= 0 && safeClientGrand > 0) {
      totalForPayment = safeClientGrand;
      console.warn('[create-cart-order] falling back to clientGrandTotal:', totalForPayment);
    }

    if (totalForPayment <= 0) {
      console.error('[create-cart-order] total is still 0 after all fallbacks');
      return NextResponse.json(
        { error: 'Order total is zero. Please ensure your items have valid prices.' },
        { status: 400 },
      );
    }

    const amountPaise = Math.round(totalForPayment * 100);
    console.log('[create-cart-order] creating Razorpay order | ₹', totalForPayment,
      '| paise:', amountPaise);

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `cart_${Date.now()}`,
      notes: {
        userId:          userId   || '',
        note:            note     || 'Cart Order',
        itemCount:       String(items.length),
        serverSubtotal:  String(serverSubtotal),
        deliveryCharge:  String(safeClientDelivery),
      },
    });

    return NextResponse.json({
      ...order,
      serverSubtotal,
      deliveryCharge: safeClientDelivery,
      serverTotal:    totalForPayment,
      // Return the key used to create this order so the mobile client
      // always opens Razorpay with the matching key (prevents key-mismatch errors).
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[create-cart-order] unhandled error:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
