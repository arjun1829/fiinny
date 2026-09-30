import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminDb, getAdminAuth } from '../../../lib/firebase-admin';
import { recordAttempt, type AttemptItem } from '../../../lib/payment-attempts';
import { allocateShares, assertTransfersFit, computeSellerSplit, type SellerSplit } from '../../../lib/route-split';
import { loadRouteConfig, resolveSellerAccount } from '../../../lib/route-server';
import { parseVariantWeightKg } from '../../../utils/weight';
import type { DeliverySettingsLike } from '../../../utils/delivery';
import {
  commercialOf,
  computeSellerPricing,
  hasCommercial,
  variantPriceFor,
  type CartPricingLine,
  type SellerPricing,
} from '../../../lib/cart-pricing';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** One priced cart line plus the seller phone used to find its delivery settings. */
type ServerLine = CartPricingLine & { sellerPhone?: string };

type CartItemInput = {
  productId:    string;
  sellerId:     string;
  sellerPhone?: string;
  qty:          number;
  /** Package size string e.g. "1kg", "500ml" — drives server-side weight/slab. */
  variantUnit?: string;
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
    let callerUid: string;
    try {
      callerUid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    const body = await request.json();
    const {
      items,
      userId,
      clientSubtotal,
      clientDelivery,
      clientGstAdded,
      clientGrandTotal,
      customerDeliveryState,
      note,
      customerName,
      customerPhone,
      customerAddress,
      deliveryBySeller,
    } = body as {
      items:             CartItemInput[];
      userId:            string;
      clientSubtotal?:   number;
      clientDelivery?:   number;
      // Exclusive GST added ON TOP of item prices (inclusive GST is already in the
      // price). Sent separately so the server owns the delivery figure entirely.
      clientGstAdded?:   number;
      clientGrandTotal?: number;
      // Finalized delivery-address state — server picks in/out-of-state slabs from it.
      customerDeliveryState?: string;
      note?:             string;
      // Captured before payment so a payment.captured webhook can rebuild the
      // order server-side if the client never gets to write it. Optional:
      // an older app build that doesn't send them still checks out fine.
      customerName?:     string;
      customerPhone?:    string;
      customerAddress?:  unknown;
      deliveryBySeller?: Record<string, number>;
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
    // Built as prices are resolved so the attempt record shows exactly which
    // products, at which price, a failed payment was for.
    const pricedItems: AttemptItem[] = [];
    // Per-seller subtotals, keyed the same way orders are: phone first, falling
    // back to the id. Route pays a linked account, so an ambiguous seller key
    // here is not a mismatched dashboard query - it is money to the wrong shop.
    const subtotalBySeller = new Map<string, number>();
    // Per-line GST + delivery inputs, all from authoritative docs. The client
    // supplies only the pack size (for weight); price, GST and delivery flags
    // never come from it.
    const pricingLines: ServerLine[] = [];

    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
      // `let`: resolved from the product doc below when the cart item carries
      // no seller at all. That happens when a customer buys a manufacturer's
      // own canonical listing (no retailer copy, empty availability[]) — the
      // app sends sellerPhone: ''. Left unresolved, the order was unroutable
      // (no Route transfer, so the seller was never paid automatically) AND
      // the post-payment order write had nothing to key the order to, so no
      // order was created at all — a real ₹200 payment on 20 Sep 2026.
      let sellerKey = String(item.sellerPhone ?? '').trim() || String(item.sellerId ?? '').trim();

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

      // Fetched in parallel with the pricing queries: the product names the item
      // for the attempt record, and the seller's own COPY of it (when there is
      // one) is the source of truth for that store's GST + delivery settings.
      const copyPhone = String(item.sellerPhone ?? '').trim();
      const copyQueries: Promise<FirebaseFirestore.QuerySnapshot>[] = copyPhone
        ? [
            db.collection('products')
              .where('manufacturerProductId', '==', item.productId)
              .where('retailerPhone', '==', copyPhone)
              .limit(1).get(),
            db.collection('products')
              .where('originalProductId', '==', item.productId)
              .where('retailerPhone', '==', copyPhone)
              .limit(1).get(),
          ]
        : [];
      const [snaps, prodSnap, copySnaps] = await Promise.all([
        Promise.all(queries),
        db.collection('products').doc(item.productId).get(),
        Promise.all(copyQueries),
      ]);
      const invDoc = snaps.find((s) => !s.empty)?.docs[0] ?? null;
      const copyDoc = copySnaps.find((s) => !s.empty)?.docs[0] ?? null;
      const prodData = prodSnap.exists ? prodSnap.data()! : null;

      if (!sellerKey && prodData) {
        // Canonical product bought directly: its owner IS the seller.
        sellerKey =
          String(prodData.ownerPhone ?? prodData.manufacturerPhone ?? prodData.retailerPhone ?? '').trim();
        if (!sellerKey && prodData.ownerId) {
          // Legacy UID-keyed owner — map through uidIndex, same as everywhere else.
          const idx = await db.collection('uidIndex').doc(String(prodData.ownerId)).get();
          sellerKey = idx.exists ? String(idx.data()?.phone ?? '').trim() : '';
        }
        if (sellerKey) {
          console.log('[create-cart-order] resolved seller for', item.productId, 'from product doc →', sellerKey);
        }
      }

      const variantUnit = String(item.variantUnit ?? '').trim();
      // This store's entry in the canonical product's availability[], if any.
      const availList = Array.isArray(prodData?.availability)
        ? (prodData!.availability as Record<string, unknown>[])
        : [];
      const avEntry: Record<string, unknown> | null = copyPhone
        ? availList.find((e) => e.storePhone === copyPhone || e.storeId === copyPhone) ?? null
        : null;

      let finalPrice: number;
      let priceSource: AttemptItem['priceSource'] = 'none';
      let itemName = '';
      // The price of the pack size the customer chose, from whichever document
      // prices the item; the document's own base price when it lists no such
      // size. The server used to charge the BASE price whatever size was sent,
      // so a 500 ml bottle of a 1 L-priced product was charged as 1 L.
      const priceOf = (d: FirebaseFirestore.DocumentData, base: number) =>
        variantPriceFor(d.variants, variantUnit) ?? base;

      if (invDoc) {
        const d         = invDoc.data();
        const basePrice = priceOf(d, Number(d.sellingPrice ?? d.price ?? 0));
        const discPct   = serverActiveDiscountPct(d);
        const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
        const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
          ? Math.max(0, Number(d.discountFixedAmt ?? 0))
          : 0;
        finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;
        priceSource = 'inventory';
        itemName = String(d.productName ?? d.name ?? '');
        console.log('[create-cart-order] inventory doc found for', item.productId,
          '| size:', variantUnit || '-', '| base:', basePrice, 'disc:', discPct + '%', 'fixed:', discFixed, 'final:', finalPrice);
      } else if (copyDoc) {
        const d = copyDoc.data();
        const basePrice = priceOf(d, Number(d.price ?? d.sellingPrice ?? 0));
        const discPct   = serverActiveDiscountPct(d);
        const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
        const discFixed = d.discountType === 'fixed_amount' && d.discountEnabled
          ? Math.max(0, Number(d.discountFixedAmt ?? 0))
          : 0;
        finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;
        priceSource = 'seller-copy';
        itemName = String(d.name ?? d.productName ?? '');
        console.log('[create-cart-order] seller copy found for', item.productId,
          '| size:', variantUnit || '-', '| base:', basePrice, 'disc:', discPct + '%', 'final:', finalPrice);
      } else if (!prodData) {
        console.warn('[create-cart-order] no product doc for', item.productId, '— skipping');
        finalPrice = 0;
        priceSource = 'none';
      } else {
        // Fallback 2: this store's availability[] entry on the canonical product —
        // its size ladder, then its selling price — else the canonical price.
        const sizePrice = variantPriceFor(avEntry?.variants, variantUnit);
        if (sizePrice !== null) {
          finalPrice = sizePrice;
          priceSource = 'availability';
        } else if (avEntry && Number(avEntry.sellingPrice) > 0) {
          finalPrice = Number(avEntry.sellingPrice);
          priceSource = 'availability';
        } else {
          finalPrice = priceOf(prodData, Number(prodData.price ?? 0));
          priceSource = 'canonical';
        }
        console.log('[create-cart-order]', priceSource, 'price for', item.productId,
          '| size:', variantUnit || '-', '| price:', finalPrice);
      }

      // This store's GST + delivery settings: its own product copy first (the
      // source of truth the web cart reads), then its inventory row, its
      // availability[] entry, and finally the canonical product. The first
      // source that carries any of these fields wins, so an older copy that
      // predates them is not read as "explicitly no GST".
      const commercial = commercialOf(
        ([copyDoc?.data(), invDoc?.data(), avEntry, prodData] as Array<Record<string, unknown> | null | undefined>)
          .find((d) => hasCommercial(d)) ?? null,
      );

      const lineTotal = Math.round(finalPrice * qty * 100) / 100;
      serverSubtotal += lineTotal;

      pricedItems.push({
        productId:   item.productId,
        name:        itemName || String(prodData?.name ?? prodData?.productName ?? item.productId),
        qty,
        unitPrice:   finalPrice,
        lineTotal,
        // Whatever was resolved above — so the attempt record (and any order
        // rebuilt from it by the webhook) always names the seller.
        sellerId:    String(item.sellerId ?? '').trim() || sellerKey,
        sellerPhone: String(item.sellerPhone ?? '').trim() || sellerKey || null,
        sellerName:  null,
        priceSource,
        ...(variantUnit ? { variantUnit } : {}),
        ...(commercial.gstApplicable
          ? { gstApplicable: true, gstRate: commercial.gstRate, gstIncluded: commercial.gstIncluded }
          : {}),
      });
      if (sellerKey) {
        subtotalBySeller.set(sellerKey, (subtotalBySeller.get(sellerKey) ?? 0) + lineTotal);
        pricingLines.push({
          sellerKey,
          sellerPhone: String(item.sellerPhone ?? '').trim() || undefined,
          unitPrice: finalPrice,
          qty,
          weightKg: Number((qty * parseVariantWeightKg(item.variantUnit)).toFixed(3)),
          gstApplicable: commercial.gstApplicable,
          gstRate: commercial.gstRate,
          gstIncluded: commercial.gstIncluded,
          extraDeliveryCharge: commercial.extraDeliveryCharge,
          freeDelivery: commercial.freeDelivery,
        });
      }
    }

    serverSubtotal = Math.round(serverSubtotal * 100) / 100;

    // ── Server-authoritative GST + delivery ───────────────────────────────────
    // Both are computed here from the store's own configured settings and the
    // customer's finalized delivery state — never from a client-sent figure.
    // Per seller: subtotal, GST (included / added), and the delivery breakdown
    // (slab, extra, free, waived). The same numbers go back to the client and
    // onto the payment attempt, so the order a client writes and the order the
    // webhook rebuilds both match what was charged.
    const settingsBySeller = await loadDeliverySettings(db, pricingLines);
    const linesBySeller = new Map<string, ServerLine[]>();
    for (const l of pricingLines) {
      const list = linesBySeller.get(l.sellerKey) ?? [];
      list.push(l);
      linesBySeller.set(l.sellerKey, list);
    }
    const sellerPricing: SellerPricing[] = Array.from(linesBySeller.entries()).map(
      ([key, lines]) =>
        computeSellerPricing(key, lines, settingsBySeller.get(key) ?? null, customerDeliveryState),
    );
    const serverDeliveryBySeller: Record<string, number> = {};
    const serverGstBySeller: Record<string, number> = {};
    const totalBySeller = new Map<string, number>();
    for (const sp of sellerPricing) {
      serverDeliveryBySeller[sp.sellerKey] = sp.deliveryCharge;
      serverGstBySeller[sp.sellerKey] = sp.gstAdded;
      totalBySeller.set(sp.sellerKey, sp.total);
    }
    const serverDelivery = Number(sellerPricing.reduce((sum, sp) => sum + sp.deliveryCharge, 0).toFixed(2));
    const serverGstAdded = Number(sellerPricing.reduce((sum, sp) => sum + sp.gstAdded, 0).toFixed(2));
    console.log('[create-cart-order] serverDelivery:', serverDelivery,
      '| serverGstAdded:', serverGstAdded, '| bySeller:', serverDeliveryBySeller,
      '| state:', customerDeliveryState);

    console.log('[create-cart-order] serverSubtotal:', serverSubtotal,
      '| clientSubtotal:', clientSubtotal,
      '| clientDelivery:', clientDelivery,
      '| clientGstAdded:', clientGstAdded,
      '| clientGrandTotal:', clientGrandTotal);

    // ── Determine the Razorpay amount ─────────────────────────────────────────
    // Prefer the server-computed subtotal (can't be tampered with).
    // Fall back to the client-computed subtotal only if the server lookup returned 0.
    const safeClientSubtotal  = Math.max(0, Number(clientSubtotal)  || 0);
    const safeClientDelivery  = Math.max(0, Number(clientDelivery)  || 0);
    const safeClientGstAdded  = Math.max(0, Number(clientGstAdded)  || 0);
    const safeClientGrand     = Math.max(0, Number(clientGrandTotal)|| 0);

    // A "new client" splits exclusive GST out (clientGstAdded) and sends the
    // variantUnit + delivery state the server needs to price delivery itself.
    // Older builds (notably an un-updated mobile app) send neither — for them we
    // must keep the legacy behavior of trusting clientDelivery (which bundled
    // delivery + exclusive GST together) so their checkout is not broken.
    const isNewClient = clientGstAdded !== undefined;

    const subtotalForPayment  = serverSubtotal > 0 ? serverSubtotal : safeClientSubtotal;

    // DELIVERY and GST: server-computed for new clients — a client can neither
    // skip GST nor inflate it. clientDelivery is honoured only for legacy
    // clients, where delivery and GST arrive folded together.
    const deliveryForPayment = isNewClient ? serverDelivery : safeClientDelivery;
    const gstForPayment      = isNewClient ? serverGstAdded : 0;
    if (isNewClient && Math.abs(safeClientGstAdded - serverGstAdded) > 0.5) {
      console.warn('[create-cart-order] client GST differs from server:',
        { client: safeClientGstAdded, server: serverGstAdded });
    }
    let   totalForPayment    = Math.round(
      (subtotalForPayment + deliveryForPayment + gstForPayment) * 100,
    ) / 100;

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

    // Each seller's payout share follows their OWN order total (items + added
    // GST + their delivery) — what their order record will say. Legacy clients
    // don't give us per-seller totals, so they keep the subtotal proportions.
    const totalsSum = Array.from(totalBySeller.values()).reduce((a, b) => a + b, 0);
    const { transfers, splitSummary } = await buildRouteTransfers(
      amountPaise,
      isNewClient && totalsSum > 0 ? totalBySeller : subtotalBySeller,
    );

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `cart_${Date.now()}`,
      notes: {
        userId:          userId   || '',
        note:            note     || 'Cart Order',
        itemCount:       String(items.length),
        serverSubtotal:  String(serverSubtotal),
        deliveryCharge:  String(deliveryForPayment),
        gstAdded:        String(gstForPayment),
        routedSellers:   String(splitSummary.length),
      },
      ...(transfers.length > 0 ? { transfers } : {}),
    });

    // Recorded before the customer sees the checkout sheet, so a lost sale is
    // visible to admin even when the client never reports back — a killed app,
    // a closed tab, or a dismissed sheet all leave this row as 'created'.
    // Awaited but internally non-throwing: it cannot fail the order.
    await recordAttempt({
      razorpayOrderId: order.id,
      kind:            'cart',
      userId:          callerUid,
      amount:          totalForPayment,
      subtotal:        subtotalForPayment,
      deliveryCharge:  deliveryForPayment,
      items:           pricedItems,
      source:          request.headers.get('x-client') === 'mobile' ? 'mobile' : 'web',
      note:            note || 'Cart Order',
      customerName:    typeof customerName === 'string' ? customerName.trim() : undefined,
      customerPhone:   typeof customerPhone === 'string' ? customerPhone.trim() : undefined,
      customerAddress: customerAddress ?? undefined,
      // Server-computed per-seller split so the webhook recovery path rebuilds
      // orders with the same authoritative delivery figures (not a client claim).
      // Legacy clients fall back to whatever split they sent.
      deliveryBySeller:
        isNewClient && Object.keys(serverDeliveryBySeller).length > 0
          ? serverDeliveryBySeller
          : (deliveryBySeller && typeof deliveryBySeller === 'object' ? deliveryBySeller : undefined),
      // New clients only: GST added and the full per-seller breakdown, so the
      // webhook can rebuild an order with the same GST and delivery detail.
      ...(isNewClient
        ? {
            gstAdded: gstForPayment,
            gstBySeller: serverGstBySeller,
            sellerBreakdown: sellerPricing,
            customerDeliveryState:
              typeof customerDeliveryState === 'string' ? customerDeliveryState.trim() : undefined,
          }
        : {}),
    });

    return NextResponse.json({
      ...order,
      serverSubtotal,
      deliveryCharge: deliveryForPayment,
      // Authoritative extras for new clients. A client that writes the order
      // itself should persist THESE (per seller) rather than recompute them, so
      // the order always equals what was charged.
      gstAdded:       gstForPayment,
      sellerBreakdown: isNewClient ? sellerPricing : undefined,
      serverTotal:    totalForPayment,
      splitSummary,
      // Return the key used to create this order so the mobile client
      // always opens Razorpay with the matching key (prevents key-mismatch errors).
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[create-cart-order] unhandled error:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}

const SELLER_PHONE_RE = /^(\+91)?[6-9]\d{9}$/;

/**
 * Load each seller's `deliverySettings` document, keyed the way checkout groups
 * sellers. A seller whose phone can't be resolved, whose settings are missing,
 * or whose read fails maps to null — computeSellerPricing then charges only the
 * per-product extra, exactly as the cart estimate and the order write do.
 */
async function loadDeliverySettings(
  db: FirebaseFirestore.Firestore,
  lines: ServerLine[],
): Promise<Map<string, DeliverySettingsLike | null>> {
  const phoneByKey = new Map<string, string>();
  for (const line of lines) {
    if (!line.sellerKey) continue;
    const phone =
      line.sellerPhone ||
      (SELLER_PHONE_RE.test(line.sellerKey) ? line.sellerKey : '');
    if (phone && !phoneByKey.has(line.sellerKey)) phoneByKey.set(line.sellerKey, phone);
  }

  const out = new Map<string, DeliverySettingsLike | null>();
  await Promise.all(
    Array.from(new Set(lines.map((l) => l.sellerKey))).map(async (key) => {
      const phone = phoneByKey.get(key);
      if (!phone) { out.set(key, null); return; }
      try {
        const snap = await db.collection('deliverySettings').doc(phone).get();
        out.set(key, snap.exists ? (snap.data() as DeliverySettingsLike) : null);
      } catch {
        out.set(key, null);
      }
    }),
  );
  return out;
}

interface SplitSummaryRow {
  sellerKey: string;
  accountId: string;
  grossPaise: number;
  commissionPaise: number;
  gatewayFeePaise: number;
  transferPaise: number;
}

/**
 * Turn per-seller subtotals into Razorpay Route transfers.
 *
 * Two properties this has to guarantee, because Razorpay enforces the first at
 * checkout in front of the customer and nobody enforces the second:
 *
 *  1. Transfers never exceed the order amount.
 *  2. Every paise of the order is accounted for - the seller shares are
 *     allocated by largest remainder rather than independent rounding, so three
 *     sellers on a Rs 100.01 order cannot silently lose a paise between them.
 *
 * Sellers WITHOUT a linked account are skipped, not failed. Onboarding is lazy:
 * a seller is asked to set up payouts when they get their first order, so most
 * orders early on will have no transfer at all and settle exactly as they do
 * today. An unroutable seller must never block a customer's payment.
 */
async function buildRouteTransfers(
  orderAmountPaise: number,
  subtotalBySeller: Map<string, number>,
): Promise<{
  transfers: Array<{ account: string; amount: number; currency: string; on_hold: boolean; notes: Record<string, string> }>;
  splitSummary: SplitSummaryRow[];
}> {
  const empty = { transfers: [], splitSummary: [] };
  if (subtotalBySeller.size === 0 || orderAmountPaise <= 0) return empty;

  try {
    const config = await loadRouteConfig();

    // Allocate the ACTUAL captured amount across sellers in proportion to their
    // subtotals. Deriving each share from the order total rather than summing
    // per-seller figures means delivery charges and any client/server rounding
    // difference are distributed rather than left stranded.
    const shares = allocateShares(orderAmountPaise, Array.from(subtotalBySeller.entries()));
    if (shares.length === 0) return empty;

    const accounts = await Promise.all(
      shares.map(async (sh) => ({ ...sh, seller: await resolveSellerAccount(sh.key) })),
    );

    const transfers: Array<{ account: string; amount: number; currency: string; on_hold: boolean; notes: Record<string, string> }> = [];
    const splitSummary: SplitSummaryRow[] = [];
    const splits: SellerSplit[] = [];

    for (const row of accounts) {
      const accountId = row.seller?.razorpayAccountId;
      if (!accountId || row.paise <= 0) continue;

      let split: SellerSplit;
      try {
        split = computeSellerSplit(row.paise, config);
      } catch (e) {
        // A share too small to survive the deductions is left with the platform
        // rather than sent as an invalid transfer that would fail the payment.
        console.warn('[create-cart-order] skipping transfer for', row.key, String(e));
        continue;
      }

      splits.push(split);
      transfers.push({
        account: accountId,
        amount: split.transferPaise,
        currency: 'INR',
        on_hold: config.holdTransfers,
        notes: { sellerKey: row.key, commissionPaise: String(split.commissionPaise) },
      });
      splitSummary.push({
        sellerKey: row.key,
        accountId,
        grossPaise: split.grossPaise,
        commissionPaise: split.commissionPaise,
        gatewayFeePaise: split.gatewayFeePaise,
        transferPaise: split.transferPaise,
      });
    }

    if (transfers.length === 0) return empty;
    assertTransfersFit(orderAmountPaise, splits);
    return { transfers, splitSummary };
  } catch (e) {
    // Route is an improvement on settlement, not a prerequisite for selling.
    // If anything here fails the order is created without transfers and the
    // money settles the way it does today.
    console.error('[create-cart-order] transfer build failed, creating order unsplit:', e);
    return empty;
  }
}
