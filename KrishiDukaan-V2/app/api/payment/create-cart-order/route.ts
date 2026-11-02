import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { getAdminDb, getAdminAuth } from '../../../lib/firebase-admin';
import { recordAttempt, type AttemptItem } from '../../../lib/payment-attempts';
import { allocateShares, assertTransfersFit, computeSellerSplit, type SellerSplit } from '../../../lib/route-split';
import { loadRouteConfig, resolveSellerAccount } from '../../../lib/route-server';
import { parseVariantWeightKg } from '../../../utils/weight';
import type { DeliverySettingsLike } from '../../../utils/delivery';
import { licenceLoader, networkLockLoader, sellAreaBlockFor, sellAreaContext, type SellAreaContext } from '../../../lib/sell-area-server';
import { sellAreaMessage, type SellAreaBlock } from '../../../lib/sell-area';
import {
  commercialOf,
  computeSellerPricing,
  hasCommercial,
  makeSellerMatcher,
  pickSellerLadder,
  resolveVariant,
  type CartPricingLine,
  type SellerPricing,
} from '../../../lib/cart-pricing';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** One priced cart line plus the seller phone used to find its delivery settings. */
type ServerLine = CartPricingLine & { sellerPhone?: string };

/** A reason one cart line cannot be ordered — surfaced to the client so it can
 *  tell the shopper exactly which item to fix, never charging a wrong amount. */
type LineValidation = {
  productId: string;
  name: string;
  variantUnit: string;
  code: 'not_stocked' | 'invalid_price' | 'out_of_stock' | 'insufficient_stock' | 'seller_not_eligible';
};

/** A single human-readable message for a batch of line validation failures. */
function validationMessage(errors: LineValidation[]): string {
  const label = (e: LineValidation) => (e.variantUnit ? `${e.name} (${e.variantUnit})` : e.name) || e.productId;
  const first = errors[0]!;
  const extra = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';
  switch (first.code) {
    case 'seller_not_eligible':
      return `This store is not available for online ordering right now: ${label(first)}${extra}. Please choose another store.`;
    case 'out_of_stock':
      return `Out of stock: ${label(first)}${extra}. Please remove it to continue.`;
    case 'insufficient_stock':
      return `Not enough stock for ${label(first)}${extra}. Please reduce the quantity.`;
    case 'invalid_price':
    case 'not_stocked':
    default:
      return `This size is no longer available from the selected store: ${label(first)}${extra}. Please pick another size or store.`;
  }
}

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

    // Items are priced in PARALLEL — each needs several Firestore reads, and a
    // sequential loop made the Pay button wait roughly one round trip per
    // cart line. Results are folded back in the original item order below, so
    // totals (including floating-point summation order) are unchanged.
    // Manufacturer licences, read once per product for the whole cart.
    const licence = licenceLoader(db);
    const networkLock = networkLockLoader(db);
    const itemResults = await Promise.all(items.map(async (item) => {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
      // `let`: resolved from the product doc below when the cart item carries
      // no seller at all. That happens when a customer buys a manufacturer's
      // own canonical listing (no retailer copy, empty availability[]) — the
      // app sends sellerPhone: ''. Left unresolved, the order was unroutable
      // (no Route transfer, so the seller was never paid automatically) AND
      // the post-payment order write had nothing to key the order to, so no
      // order was created at all — a real ₹200 payment on 20 Sep 2026.
      let sellerKey = String(item.sellerPhone ?? '').trim() || String(item.sellerId ?? '').trim();
      const copyPhone = String(item.sellerPhone ?? '').trim();

      // The seller's own listing of this product — a product COPY or an INVENTORY
      // row — is where that store's real variant ladder, price, stock and
      // commercial settings live. It may be keyed by ANY identifier (ownerId,
      // retailerId, ownerPhone, retailerPhone or manufacturerPhone), so we fetch
      // every copy/inventory doc for the product and match the seller in memory,
      // exactly like reconstructCartItems indexes sellers client-side. (The old
      // code matched copies on retailerPhone ONLY, so a copy that carried the
      // seller's phone in ownerPhone/manufacturerPhone — a manufacturer selling
      // its own listing — was never found, and every non-canonical size it added
      // was wrongly rejected as "not stocked".)
      const [origCopies, mfrCopies, invAll, prodSnap] = await Promise.all([
        db.collection('products').where('originalProductId', '==', item.productId).limit(50).get(),
        db.collection('products').where('manufacturerProductId', '==', item.productId).limit(50).get(),
        db.collection('inventory').where('productId', '==', item.productId).limit(50).get(),
        db.collection('products').doc(item.productId).get(),
      ]);
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

      // Does a seller-shaped doc belong to THIS seller? One shared matcher over
      // every identifier the cart item and the owner-fallback gave us.
      const matchesSeller = makeSellerMatcher([item.sellerPhone, item.sellerId, sellerKey, copyPhone]);

      // An inactive copy is a withdrawn listing — never price from it.
      const copyDoc =
        [...origCopies.docs, ...mfrCopies.docs].find((s) => s.data().isActive !== false && matchesSeller(s.data())) ?? null;
      const invDoc = invAll.docs.find((s) => matchesSeller(s.data())) ?? null;

      const variantUnit = String(item.variantUnit ?? '').trim();
      // This store's entry in the canonical product's availability[], if any —
      // matched by the same seller-identity test, not copyPhone alone.
      const availList = Array.isArray(prodData?.availability)
        ? (prodData!.availability as Record<string, unknown>[])
        : [];
      const avEntry: Record<string, unknown> | null = availList.find((e) => matchesSeller(e)) ?? null;

      let finalPrice = 0;
      let priceSource: AttemptItem['priceSource'] = 'none';
      let itemName = '';
      // Variant resolution + stock, returned so the caller can reject the order
      // BEFORE charging. null when there is no product at all.
      let validation: LineValidation | null = null;

      // The seller's own documents, used for base price, stock, commercial
      // settings and discount. inventory → product copy → availability entry.
      const sellerDocData: FirebaseFirestore.DocumentData | Record<string, unknown> | null =
        invDoc?.data() ?? copyDoc?.data() ?? avEntry ?? null;
      const anySellerDoc = !!(invDoc || copyDoc || avEntry);
      const sellerBasePrice = Number(
        invDoc  ? (invDoc.data().sellingPrice ?? invDoc.data().price ?? 0)
        : copyDoc ? (copyDoc.data().price ?? copyDoc.data().sellingPrice ?? 0)
        : avEntry ? (avEntry.sellingPrice ?? 0)
        : 0,
      );

      // The seller's OWN per-size ladder, wherever they configured it (inventory,
      // copy, or availability entry) — the first non-empty one wins.
      const sellerLadder = pickSellerLadder([invDoc?.data().variants, copyDoc?.data().variants, avEntry?.variants]);

      // Only a RETAILER ASSIGNMENT (an availability[] entry) restricts a seller
      // that has no ladder to the base size. A bare inventory/copy doc with no
      // ladder does NOT — the manufacturer-direct / owner listing keeps the full
      // canonical ladder, exactly as the Product Detail page prices it. (Bug: a
      // manufacturer whose inventory row carried only a base sellingPrice had
      // every non-base size rejected as "not stocked".)
      const hasRetailerListing = !!avEntry;

      // Discount applies only from a live inventory / copy doc, as before — an
      // availability mirror or the canonical doc carry no checkout-time discount.
      const discSrc = invDoc?.data() ?? copyDoc?.data() ?? null;

      if (!prodData && !anySellerDoc) {
        console.warn('[create-cart-order] no product doc for', item.productId, '— skipping');
      } else {
        priceSource = sellerLadder && (invDoc || copyDoc)
          ? (invDoc ? 'inventory' : 'seller-copy')
          : avEntry ? 'availability'
          : invDoc ? 'inventory' : copyDoc ? 'seller-copy' : 'canonical';
        itemName = String(
          invDoc?.data().productName ?? invDoc?.data().name
          ?? copyDoc?.data().name ?? copyDoc?.data().productName
          ?? avEntry?.storeName ?? prodData?.name ?? prodData?.productName ?? '',
        );

        const resolved = resolveVariant({
          variantUnit,
          sellerVariants: sellerLadder,
          sellerBasePrice,
          hasSellerSource: hasRetailerListing,
          canonicalVariants: prodData?.variants,
          canonicalBasePrice: Number(prodData?.price ?? 0),
        });

        if (!resolved.ok) {
          // Missing / invalid variant price. Do NOT silently charge the base
          // price (the historic "1 L money for a 5 L can" bug) — reject instead.
          validation = { productId: item.productId, name: itemName, variantUnit, code: resolved.code };
          console.warn('[create-cart-order] variant resolution failed for', item.productId,
            '| size:', variantUnit || '-', '| code:', resolved.code);
        } else {
          const basePrice = Number(resolved.price ?? 0);
          const discPct   = discSrc ? serverActiveDiscountPct(discSrc) : 0;
          const discAmt   = Math.round((basePrice * discPct) / 100 * 100) / 100;
          const discFixed = discSrc && discSrc.discountType === 'fixed_amount' && discSrc.discountEnabled
            ? Math.max(0, Number(discSrc.discountFixedAmt ?? 0))
            : 0;
          finalPrice = Math.round(Math.max(0, basePrice - discAmt - discFixed) * 100) / 100;

          // Stock: a variant-level stock count is authoritative when present; an
          // explicit "Out of Stock" level blocks even without a count. Legacy docs
          // with neither are left alone (checkout unchanged).
          const variantStock = typeof resolved.stock === 'number' ? resolved.stock : null;
          const stockLevel = String((sellerDocData as Record<string, unknown> | null)?.stockLevel ?? '')
            .trim().toLowerCase();
          if (variantStock !== null && variantStock <= 0) {
            validation = { productId: item.productId, name: itemName, variantUnit, code: 'out_of_stock' };
          } else if (variantStock !== null && qty > variantStock) {
            validation = { productId: item.productId, name: itemName, variantUnit, code: 'insufficient_stock' };
          } else if (stockLevel === 'out of stock') {
            validation = { productId: item.productId, name: itemName, variantUnit, code: 'out_of_stock' };
          }

          console.log('[create-cart-order]', priceSource, 'price for', item.productId,
            '| size:', variantUnit || '-', '| base:', basePrice, 'disc:', discPct + '%', 'final:', finalPrice,
            '| stock:', variantStock ?? '-');
        }
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

      const priced: AttemptItem = {
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
      };
      const line: ServerLine | null = sellerKey
        ? {
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
          }
        : null;
      // Per-line eligibility inputs, evaluated after the parallel reads below:
      // the seller's phone (for the account-level onlineDelivery read) and this
      // listing's own isOnline flag (only an explicit false blocks).
      const listingOnline = avEntry ? (avEntry as Record<string, unknown>).isOnline !== false : true;
      // Licence / network lock that applies to this line (lib/sell-area-server.ts).
      const sellArea: SellAreaContext = await sellAreaContext({
        productId: item.productId,
        prodData: prodData as Record<string, unknown> | null,
        copyData: (copyDoc?.data() as Record<string, unknown> | undefined) ?? null,
        matchesSeller,
        licence,
        networkLock,
      });
      return { lineTotal, priced, sellerKey, line, validation, sellerPhone: copyPhone || sellerKey, listingOnline, sellArea };
    }));

    // ── Reject BEFORE charging: variant / price / stock ───────────────────────
    // Any line whose variant price is missing/invalid or whose stock is
    // insufficient fails the whole order rather than quietly charging a wrong
    // amount. Eligibility (seller online-delivery) is checked just below.
    const validationErrors = itemResults
      .map((r) => r.validation)
      .filter((v): v is LineValidation => v !== null);

    // ── Reject BEFORE charging: seller eligibility (online delivery) ──────────
    // Manufacturer-direct and retailer listings are judged independently: each
    // line's resolved seller must have online delivery ON at the account level
    // AND this listing's availability.isOnline must not be explicitly false.
    const onlinePhones = Array.from(
      new Set(itemResults.map((r) => r.sellerPhone).filter((p): p is string => !!p && SELLER_PHONE_RE.test(p))),
    );
    const onlineByPhone = new Map<string, boolean>();
    await Promise.all(onlinePhones.map(async (phone) => {
      onlineByPhone.set(phone, await fetchStoreOnlineDeliveryAdmin(db, phone));
    }));
    for (const r of itemResults) {
      if (!r.sellerKey || r.validation) continue; // already rejected or no seller
      const phone = r.sellerPhone;
      const accountOnline = phone && SELLER_PHONE_RE.test(phone) ? onlineByPhone.get(phone) === true : false;
      if (!accountOnline || !r.listingOnline) {
        validationErrors.push({
          productId: r.priced.productId,
          name: r.priced.name,
          variantUnit: (r.priced as { variantUnit?: string }).variantUnit ?? '',
          code: 'seller_not_eligible',
        });
      }
    }

    if (validationErrors.length > 0) {
      console.warn('[create-cart-order] rejected before payment:', validationErrors);
      return NextResponse.json(
        { error: validationMessage(validationErrors), code: 'order_validation_failed', items: validationErrors },
        { status: 422 },
      );
    }

    // Fold in the original cart order.
    for (const r of itemResults) {
      serverSubtotal += r.lineTotal;
      pricedItems.push(r.priced);
      if (r.sellerKey && r.line) {
        subtotalBySeller.set(r.sellerKey, (subtotalBySeller.get(r.sellerKey) ?? 0) + r.lineTotal);
        pricingLines.push(r.line);
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
    // Route payout lookups depend only on WHICH sellers are in the cart, not on
    // the amount — so start them now, alongside the delivery-settings reads,
    // instead of after. Both were sequential waits before Razorpay was called.
    const routePrefetch = prefetchRouteContext(Array.from(subtotalBySeller.keys()));
    const settingsBySeller = await loadDeliverySettings(db, pricingLines);

    // ── Reject BEFORE charging: where this product / store may sell ──────────
    // Manufacturer licence states, a manufacturer's in-store-only lock on a
    // network retailer, and a retailer's own "selected states" coverage —
    // lib/sell-area.ts. The cart runs the same check (/api/cart/availability)
    // as soon as the address is known, so this is normally just the backstop.
    if (!String(customerDeliveryState ?? '').trim()) {
      console.warn('[create-cart-order] no delivery state sent — licence/coverage states not checked');
    }
    const areaBlocks: { productId: string; name: string; variantUnit: string; block: SellAreaBlock }[] = [];
    for (const r of itemResults) {
      if (!r.sellerKey) continue;
      const block = sellAreaBlockFor(r.sellArea, settingsBySeller.get(r.sellerKey) ?? null, customerDeliveryState);
      if (block) {
        areaBlocks.push({
          productId: r.priced.productId,
          name: r.priced.name,
          variantUnit: (r.priced as { variantUnit?: string }).variantUnit ?? '',
          block,
        });
      }
    }
    if (areaBlocks.length > 0) {
      const first = areaBlocks[0]!;
      console.warn('[create-cart-order] rejected before payment (sell area):', areaBlocks);
      return NextResponse.json(
        {
          error: `${first.name}: ${sellAreaMessage(first.block)}` +
            (areaBlocks.length > 1 ? ` (and ${areaBlocks.length - 1} more)` : ''),
          code: 'sell_area',
          items: areaBlocks.map((a) => ({
            productId: a.productId,
            name: a.name,
            variantUnit: a.variantUnit,
            code: a.block.code,
            message: sellAreaMessage(a.block),
          })),
        },
        { status: 422 },
      );
    }
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
    const route = await buildRouteTransfers(
      amountPaise,
      isNewClient && totalsSum > 0 ? totalBySeller : subtotalBySeller,
      await routePrefetch,
    );
    let { splitSummary } = route;

    const orderBody = (transfers: typeof route.transfers) => ({
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
        routedSellers:   String(transfers.length),
      },
      ...(transfers.length > 0 ? { transfers } : {}),
    });

    const order = await razorpay.orders.create(orderBody(route.transfers)).catch(async (e) => {
      // A transfer Razorpay refuses (a linked account not active yet, still in
      // its first-day cooling period, or suspended) must not stop the customer
      // paying. Retry once without transfers: the payment then stays with
      // KrishiDukan and the seller is paid later (functions/src/payouts/
      // pay-after-kyc.ts or the payout run), exactly like a seller not on Route.
      if (route.transfers.length === 0) throw e;
      console.error('[create-cart-order] order with transfers refused, retrying without:', e);
      splitSummary = [];
      return razorpay.orders.create(orderBody([]));
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
 * Server mirror of the client's fetchStoreOnlineDelivery (app/firebase.ts): the
 * seller's account-level online-delivery switch, resolved with the same source
 * precedence — profiles → users → retailers → manufacturers → legacy retailers
 * queried by phone field. Returns false when the flag is off, missing, or
 * unreadable, exactly as the client does, so the backend gate and the UI agree.
 *
 * Manufacturers and retailers are read the same way, so a manufacturer-direct
 * listing and a retailer listing are each judged by their OWN account flag.
 */
async function fetchStoreOnlineDeliveryAdmin(
  db: FirebaseFirestore.Firestore,
  phone: string,
): Promise<boolean> {
  if (!phone) return false;
  try {
    const [profileSnap, userSnap] = await Promise.all([
      db.collection('profiles').doc(phone).get(),
      db.collection('users').doc(phone).get(),
    ]);
    if (profileSnap.exists && typeof profileSnap.data()?.onlineDelivery === 'boolean') {
      return !!profileSnap.data()!.onlineDelivery;
    }
    if (userSnap.exists && typeof userSnap.data()?.onlineDelivery === 'boolean') {
      return !!userSnap.data()!.onlineDelivery;
    }
    const [retailerSnap, mfrSnap] = await Promise.all([
      db.collection('retailers').doc(phone).get(),
      db.collection('manufacturers').doc(phone).get(),
    ]);
    if (retailerSnap.exists) return !!retailerSnap.data()?.onlineDelivery;
    if (mfrSnap.exists) return !!mfrSnap.data()?.onlineDelivery;

    // Legacy retailers keyed by a UID/GUID: the flag is only reachable via the
    // `phone` field. Query both E164 and 10-digit forms, like the client does.
    const phoneDigits = phone.replace(/^\+91/, '');
    const [byE164, byDigits] = await Promise.all([
      db.collection('retailers').where('phone', '==', phone).limit(1).get(),
      db.collection('retailers').where('phone', '==', phoneDigits).limit(1).get(),
    ]);
    const legacy = byE164.docs[0] ?? byDigits.docs[0];
    if (legacy) return !!legacy.data()?.onlineDelivery;
  } catch (e) {
    console.warn('[create-cart-order] online-delivery read failed for', phone, e);
  }
  return false;
}

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
type RouteContext = {
  config: Awaited<ReturnType<typeof loadRouteConfig>> | null;
  accounts: Map<string, Awaited<ReturnType<typeof resolveSellerAccount>>>;
};

/** Route config + each seller's linked account, fetched in parallel. Never
 *  throws: a failure yields an empty context and buildRouteTransfers falls
 *  back to its own lookups (or to an unsplit order). */
async function prefetchRouteContext(sellerKeys: string[]): Promise<RouteContext> {
  try {
    const [config, accounts] = await Promise.all([
      loadRouteConfig(),
      Promise.all(sellerKeys.map(async (k) => [k, await resolveSellerAccount(k)] as const)),
    ]);
    return { config, accounts: new Map(accounts) };
  } catch (e) {
    console.warn('[create-cart-order] route prefetch failed:', e);
    return { config: null, accounts: new Map() };
  }
}

async function buildRouteTransfers(
  orderAmountPaise: number,
  subtotalBySeller: Map<string, number>,
  prefetched?: RouteContext,
): Promise<{
  transfers: Array<{ account: string; amount: number; currency: string; on_hold: boolean; notes: Record<string, string> }>;
  splitSummary: SplitSummaryRow[];
}> {
  const empty = { transfers: [], splitSummary: [] };
  if (subtotalBySeller.size === 0 || orderAmountPaise <= 0) return empty;

  try {
    const config = prefetched?.config ?? await loadRouteConfig();

    // Allocate the ACTUAL captured amount across sellers in proportion to their
    // subtotals. Deriving each share from the order total rather than summing
    // per-seller figures means delivery charges and any client/server rounding
    // difference are distributed rather than left stranded.
    const shares = allocateShares(orderAmountPaise, Array.from(subtotalBySeller.entries()));
    if (shares.length === 0) return empty;

    const accounts = await Promise.all(
      shares.map(async (sh) => ({
        ...sh,
        seller: prefetched?.accounts.has(sh.key)
          ? prefetched.accounts.get(sh.key)!
          : await resolveSellerAccount(sh.key),
      })),
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
