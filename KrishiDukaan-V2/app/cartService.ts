import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { CartItem } from '../types/order';

export type StoredCartItem = {
  productId: string;
  /** Seller UID or phone — empty string for pending (no store selected) items */
  storeId: string;
  /** Seller phone (E164). Persisted so delivery-charge lookup never needs the
   *  uidIndex round-trip during reconstruction, even when storeId is a UID. */
  sellerPhone?: string;
  /** Seller display name — restored as a fallback when the availability entry is
   *  missing so the cart card still shows the correct store name. */
  sellerName?: string;
  /** Package variant unit string e.g. "500ml", "1kg" — empty string when not applicable */
  variantUnit: string;
  quantity: number;
  sellerType: 'retailer' | 'manufacturer';
  /**
   * Persisted pricing — the exact values the customer saw at add-to-cart time.
   * Using these directly on hydration avoids re-deriving prices from product docs,
   * which is fragile (requires matching identifiers across multiple Firestore docs).
   * Legacy stored items that pre-date this field fall back to live-data derivation.
   */
  sellingPrice?: number;    // post-discount price per unit (item.price)
  originalPrice?: number;   // pre-discount price per unit (undefined = no discount)
  discountPct?: number;     // active discount % (undefined = no discount)
};

function toStoredItem(item: CartItem): StoredCartItem {
  return {
    productId: item.productId,
    storeId: item.sellerId ?? '',
    ...(item.sellerPhone ? { sellerPhone: item.sellerPhone } : {}),
    ...(item.sellerName  ? { sellerName:  item.sellerName  } : {}),
    variantUnit: item.variantUnit ?? '',
    quantity: item.qty,
    sellerType: item.sellerType ?? 'retailer',
    // Persist pricing so hydration never needs to re-derive it from product docs
    sellingPrice: item.price,
    ...(item.originalPrice != null ? { originalPrice: item.originalPrice } : {}),
    ...(item.discountPct != null && item.discountPct > 0 ? { discountPct: item.discountPct } : {}),
  };
}

/** Persist cart to Firestore under carts/{phone}. */
export async function saveCart(phone: string, items: CartItem[]): Promise<void> {
  await setDoc(doc(db, 'carts', phone), {
    phone,
    updatedAt: serverTimestamp(),
    items: items.map(toStoredItem),
  });
}

/** Load the minimal stored items from Firestore. Returns [] if doc doesn't exist. */
export async function loadStoredCart(phone: string): Promise<StoredCartItem[]> {
  try {
    const snap = await getDoc(doc(db, 'carts', phone));
    if (!snap.exists()) return [];
    const data = snap.data();
    return Array.isArray(data?.items) ? (data.items as StoredCartItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Reconstruct full CartItem[] from stored minimal items by fetching live product data.
 *
 * Price resolution (highest priority first):
 *   1. product.availability[x].sellingPrice   — present when the canonical Firestore doc
 *      was updated to include store-specific pricing
 *   2. sellerCopy.price                        — seller's own product-copy doc, which is
 *      the authoritative source used by fetchMarketplaceProducts; fetched via
 *      where('originalProductId', '==', productId) (public read)
 *   3. product.price                            — canonical product base price; correct for
 *      standalone seller products where productId IS the seller's product
 *
 * Discount resolution (highest priority first):
 *   1. avail.discountPct          — canonical availability entry (synced from inventory)
 *   2. sellerCopy.discountPct     — seller copy's effective discount
 *   3. product.sellerDiscounts[]  — runtime field, may not exist on raw product doc
 *
 * sellerPhone resolution:
 *   1. storedPhone                — saved at add-to-cart time (most reliable)
 *   2. E164 regex on storeId      — fallback for old carts that predate the stored phone
 */
export async function reconstructCartItems(stored: StoredCartItem[]): Promise<CartItem[]> {
  if (stored.length === 0) return [];

  const uniqueProductIds = Array.from(new Set(stored.map(i => i.productId).filter(Boolean)));

  // ── Batch 1: canonical product docs ────────────────────────────────────────
  const productSnaps = await Promise.all(
    uniqueProductIds.map(id => getDoc(doc(db, 'products', id)).catch(() => null))
  );

  type ProductCache = {
    id: string;
    name: string;
    price: number;
    image: string;
    gstApplicable?: boolean;
    gstRate?: 0 | 5 | 12 | 18 | 28;
    variants?: { unit: string; price: number }[];
    availability?: {
      storeId: string;
      storePhone?: string;
      storeName?: string;
      sellingPrice?: number;
      discountPct?: number;
      variants?: { unit: string; price: number }[];
    }[];
    sellerDiscounts?: Record<string, number>;
    /** Discount stored directly on the canonical product doc — used as fallback when
     *  no copy doc exists for this seller (the seller IS the canonical product owner). */
    effectiveDiscountPct?: number;
    ownerId?: string;
    retailerPhone?: string;
    ownerPhone?: string;
    manufacturerPhone?: string;
  };

  const productMap = new Map<string, ProductCache>();
  for (const snap of productSnaps) {
    if (!snap?.exists()) continue;
    const d = snap.data();
    const gstRateNum = Number(d.gstRate);
    const GST_RATES = [0, 5, 12, 18, 28] as const;
    productMap.set(snap.id, {
      id: snap.id,
      name: String(d.name || ''),
      price: Number(d.price || 0),
      image: String(d.image || ''),
      gstApplicable: d.gstApplicable === true,
      gstRate: (GST_RATES as readonly number[]).includes(gstRateNum)
        ? (gstRateNum as 0 | 5 | 12 | 18 | 28)
        : undefined,
      variants: Array.isArray(d.variants) ? d.variants : undefined,
      availability: Array.isArray(d.availability) ? d.availability : undefined,
      // sellerDiscounts is a runtime-computed field not stored on the product doc.
      // Read it anyway as a best-effort fallback.
      sellerDiscounts: typeof d.sellerDiscounts === 'object' && d.sellerDiscounts !== null
        ? d.sellerDiscounts
        : undefined,
      // These owner/discount fields ARE stored on the canonical doc and are used
      // to restore pricing when the seller owns the product directly (no copy doc).
      effectiveDiscountPct: typeof d.effectiveDiscountPct === 'number' && d.effectiveDiscountPct > 0
        ? d.effectiveDiscountPct
        : undefined,
      ownerId: String(d.ownerId || ''),
      retailerPhone: String(d.retailerPhone || ''),
      ownerPhone: String(d.ownerPhone || ''),
      manufacturerPhone: String(d.manufacturerPhone || ''),
    });
  }

  // ── Batch 2: seller product copies ─────────────────────────────────────────
  // Mirrors what fetchMarketplaceProducts does: each seller's copy doc carries
  // the store-specific price + discount that may not be in the canonical doc's
  // availability[].sellingPrice.
  type SellerPriceEntry = { price: number; discountPct: number };
  // canonical productId → (seller UID or phone → SellerPriceEntry)
  const sellerPrices = new Map<string, Map<string, SellerPriceEntry>>();

  await Promise.all(
    uniqueProductIds.map(async (productId) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'products'), where('originalProductId', '==', productId))
        );
        const byKey = new Map<string, SellerPriceEntry>();
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const price = Number(d.price || 0);
          const discountPct = Number(d.effectiveDiscountPct ?? d.discountPct ?? 0);
          const entry: SellerPriceEntry = { price, discountPct };
          // Index by every identifier we might have saved as storeId / sellerPhone
          [
            String(d.ownerId       || ''),
            String(d.retailerId    || ''),
            String(d.retailerPhone || ''),
            String(d.ownerPhone    || ''),
            String(d.manufacturerPhone || ''),
          ]
            .filter(Boolean)
            .forEach(key => byKey.set(key, entry));
        });
        sellerPrices.set(productId, byKey);
      } catch { /* silent — non-existent or inaccessible */ }
    })
  );

  // ── Batch 2b: backfill sellerPrices from canonical product's effectiveDiscountPct ──
  // For sellers who own the product directly (no copy doc with originalProductId),
  // Batch 2 returns nothing. Their discount lives as effectiveDiscountPct on the
  // canonical doc. Backfill sellerPrices so the same lookup path applies uniformly.
  // Copy docs (from Batch 2) take precedence — only fill keys not already set.
  productMap.forEach((product, productId) => {
    const discountPct = product.effectiveDiscountPct ?? 0;
    if (discountPct <= 0) return;
    const byKey = sellerPrices.get(productId) ?? new Map<string, SellerPriceEntry>();
    const entry: SellerPriceEntry = { price: product.price, discountPct };
    [product.ownerId, product.retailerPhone, product.ownerPhone, product.manufacturerPhone].forEach(key => {
      if (key && !byKey.has(key)) byKey.set(key, entry);
    });
    sellerPrices.set(productId, byKey);
  });

  // ── Batch 3: resolve UID storeIds → phone via uidIndex ──────────────────────
  // Admin-assigned copy docs are keyed by phone (ownerId = sellerPhone), not UID.
  // If a cart item has storeId = Auth UID and no sellerPhone (e.g. saved before
  // the onAssignStore fix), sellerPrices lookup fails. Resolve UID → phone once
  // via uidIndex so the storedPhone fallback has a value to work with.
  // This is a backwards-compatibility pass; new items always have sellerPhone set.
  const uidToPhone = new Map<string, string>();
  const E164_RE = /^\+91[6-9]\d{9}$/;
  const TEN_RE = /^[6-9]\d{9}$/;

  const uidsToResolve = Array.from(
    new Set(
      stored
        .filter(i => {
          if (!i.storeId || i.sellerPhone) return false;
          // Only attempt resolution for storeIds that look like Auth UIDs, not phones
          return !E164_RE.test(i.storeId) && !TEN_RE.test(i.storeId);
        })
        .map(i => i.storeId)
    )
  );

  if (uidsToResolve.length > 0) {
    await Promise.all(
      uidsToResolve.map(async uid => {
        try {
          const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
          if (idxSnap.exists()) {
            const phone = String(idxSnap.data().phone ?? '');
            if (phone) uidToPhone.set(uid, phone);
          }
        } catch { /* silent */ }
      })
    );
  }

  // ── Batch 4: fallback for independent seller products merged by name ─────────
  // fetchMarketplaceProducts deduplicates by name: a retailer's own product
  // (source='retailer_inventory') with the same name as a manufacturer product gets
  // merged in-memory under the manufacturer's canonical ID. The cart stores the
  // canonical ID. But the retailer's product has no originalProductId, so Batch 2
  // (which queries by originalProductId) never finds it. This batch queries by
  // retailerPhone to find those independent products and read their discount.
  const phonesNeedingFallback = new Map<string, string[]>(); // phone → productIds[]

  for (const item of stored) {
    if (!item.storeId) continue;
    const storeId = item.storeId;
    const phone = item.sellerPhone || uidToPhone.get(storeId) || undefined;
    if (!phone) continue;
    const product = productMap.get(item.productId);
    if (!product) continue;
    // Only run fallback when Batches 1–3 didn't already provide seller pricing
    const priceMap = sellerPrices.get(item.productId);
    if (priceMap?.get(storeId) !== undefined || priceMap?.get(phone) !== undefined) continue;
    const arr = phonesNeedingFallback.get(phone) ?? [];
    if (!arr.includes(item.productId)) arr.push(item.productId);
    phonesNeedingFallback.set(phone, arr);
  }

  if (phonesNeedingFallback.size > 0) {
    await Promise.all(
      Array.from(phonesNeedingFallback.entries()).map(async ([phone, productIds]) => {
        try {
          const snap = await getDocs(
            query(collection(db, 'products'), where('retailerPhone', '==', phone))
          );
          // Build name → pricing map from all seller-owned product docs
          const byNameKey = new Map<string, SellerPriceEntry>();
          snap.forEach(docSnap => {
            const d = docSnap.data();
            const nameKey = String(d.name || '').toLowerCase().trim();
            if (!nameKey || byNameKey.has(nameKey)) return;
            byNameKey.set(nameKey, {
              price: Number(d.price || 0),
              discountPct: Number(d.effectiveDiscountPct ?? d.discountPct ?? 0),
            });
          });

          for (const productId of productIds) {
            const product = productMap.get(productId);
            if (!product) continue;
            const match = byNameKey.get(product.name.toLowerCase().trim());
            if (!match) continue;
            const byKey = sellerPrices.get(productId) ?? new Map<string, SellerPriceEntry>();
            // Key by phone so the storedPhone fallback in the Reconstruct loop finds it
            if (!byKey.has(phone)) byKey.set(phone, match);
            sellerPrices.set(productId, byKey);
          }
        } catch { /* silent */ }
      })
    );
  }

  // ── Reconstruct ─────────────────────────────────────────────────────────────
  const result: CartItem[] = [];

  for (const item of stored) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const variantUnit  = item.variantUnit  || undefined;
    const storeId      = item.storeId      || '';
    // storedPhone: prefer the value saved on the item; fall back to the uidIndex
    // resolution for legacy items saved before onAssignStore started setting sellerPhone.
    const storedPhone  = item.sellerPhone  || uidToPhone.get(storeId) || undefined;
    const storedName   = item.sellerName   || undefined;

    if (!storeId) {
      // Pending item — no store selected yet
      const variant = variantUnit ? product.variants?.find(v => v.unit === variantUnit) : undefined;
      const price = variant?.price ?? product.price;
      result.push({
        productId: item.productId,
        sellerId: '',
        sellerType: 'retailer',
        name: product.name,
        image: product.image,
        price,
        qty: item.quantity,
        sellMode: 'pending',
        ...(variantUnit ? { variantUnit } : {}),
        ...(product.gstApplicable ? { gstApplicable: true } : {}),
        ...(product.gstRate !== undefined ? { gstRate: product.gstRate } : {}),
      });
    } else {
      // Assigned item — restore store with pricing.

      // Availability entry — used for sellerName and as legacy pricing fallback.
      const avail = product.availability?.find(
        a =>
          a.storeId === storeId       ||
          a.storePhone === storeId    ||
          (storedPhone && (a.storeId === storedPhone || a.storePhone === storedPhone))
      );

      // ── Pricing: use persisted values first (set by toStoredItem since the pricing-
      //    persistence fix). Fall back to live-data derivation for legacy items that
      //    were saved before this field existed.
      let price: number;
      let originalPrice: number | undefined;
      let discountPct: number;

      if (item.sellingPrice != null && item.sellingPrice > 0) {
        // New path: pricing was persisted at save time — use it directly.
        price = item.sellingPrice;
        originalPrice = item.originalPrice;
        discountPct = item.discountPct ?? 0;
      } else {
        // Legacy path: derive pricing from live Firestore data.
        const sellerEntry =
          sellerPrices.get(item.productId)?.get(storeId) ??
          (storedPhone ? sellerPrices.get(item.productId)?.get(storedPhone) : undefined);

        const basePrice = (() => {
          if (variantUnit && avail?.variants) {
            const v = avail.variants.find(v => v.unit === variantUnit);
            return v?.price ?? avail.sellingPrice ?? sellerEntry?.price ?? product.price;
          }
          return avail?.sellingPrice ?? sellerEntry?.price ?? product.price;
        })();

        discountPct =
          avail?.discountPct ??
          sellerEntry?.discountPct ??
          product.sellerDiscounts?.[storeId] ??
          (storedPhone ? product.sellerDiscounts?.[storedPhone] : undefined) ??
          0;

        if (discountPct > 0) {
          originalPrice = basePrice;
          price = Math.round(basePrice * (1 - discountPct / 100) * 100) / 100;
        } else {
          price = basePrice;
        }
      }

      // sellerPhone: prefer the stored phone; fall back to E164 detection on storeId
      // for carts saved before sellerPhone was persisted.
      const resolvedPhone =
        storedPhone ??
        (/^\+91[6-9]\d{9}$/.test(storeId) ? storeId : undefined);

      result.push({
        productId: item.productId,
        sellerId: storeId,
        sellerType: item.sellerType ?? 'retailer',
        sellerName: avail?.storeName ?? storedName,
        ...(resolvedPhone ? { sellerPhone: resolvedPhone } : {}),
        name: product.name,
        image: product.image,
        price,
        ...(originalPrice !== undefined ? { originalPrice } : {}),
        ...(discountPct > 0 ? { discountPct } : {}),
        qty: item.quantity,
        sellMode: 'online_delivery',
        ...(variantUnit ? { variantUnit } : {}),
        ...(product.gstApplicable ? { gstApplicable: true } : {}),
        ...(product.gstRate !== undefined ? { gstRate: product.gstRate } : {}),
      });
    }
  }

  return result;
}

/**
 * Merge a local (guest) cart with a cart loaded from Firestore.
 * Items matching on productId + storeId + variantUnit get their quantities summed.
 */
export function mergeCartItems(local: CartItem[], fromFirestore: CartItem[]): CartItem[] {
  const merged = [...local];

  for (const fsItem of fromFirestore) {
    const key = `${fsItem.productId}__${fsItem.sellerId}__${fsItem.variantUnit ?? ''}`;
    const idx = merged.findIndex(
      i => `${i.productId}__${i.sellerId}__${i.variantUnit ?? ''}` === key
    );
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], qty: merged[idx].qty + fsItem.qty };
    } else {
      merged.push(fsItem);
    }
  }

  return merged;
}
