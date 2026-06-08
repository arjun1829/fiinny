import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { CartItem } from '../types/order';

export type StoredCartItem = {
  productId: string;
  /** Seller phone / UID — empty string for pending (no store selected) items */
  storeId: string;
  /** Package variant unit string e.g. "500ml", "1kg" — empty string when not applicable */
  variantUnit: string;
  quantity: number;
  sellerType: 'retailer' | 'manufacturer';
};

function toStoredItem(item: CartItem): StoredCartItem {
  return {
    productId: item.productId,
    storeId: item.sellerId ?? '',
    variantUnit: item.variantUnit ?? '',
    quantity: item.qty,
    sellerType: item.sellerType ?? 'retailer',
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
 * Prices and availability are always fetched fresh — never trusted from the stored cart.
 */
export async function reconstructCartItems(stored: StoredCartItem[]): Promise<CartItem[]> {
  if (stored.length === 0) return [];

  const uniqueProductIds = Array.from(new Set(stored.map(i => i.productId).filter(Boolean)));

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
      sellerDiscounts: typeof d.sellerDiscounts === 'object' && d.sellerDiscounts !== null
        ? d.sellerDiscounts
        : undefined,
    });
  }

  const result: CartItem[] = [];

  for (const item of stored) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const variantUnit = item.variantUnit || undefined;
    const storeId = item.storeId || '';

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
      // Assigned item — has a store, fetch live price from availability
      const avail = product.availability?.find(
        a => a.storeId === storeId || a.storePhone === storeId
      );

      let price: number;
      let originalPrice: number | undefined;
      let discountPct = 0;

      if (variantUnit && avail?.variants) {
        const v = avail.variants.find(v => v.unit === variantUnit);
        price = v?.price ?? avail.sellingPrice ?? product.price;
      } else {
        const basePrice = avail?.sellingPrice ?? product.price;
        discountPct =
          avail?.discountPct ??
          product.sellerDiscounts?.[storeId] ??
          0;
        if (discountPct > 0) {
          originalPrice = basePrice;
          price = Math.round(basePrice * (1 - discountPct / 100) * 100) / 100;
        } else {
          price = basePrice;
        }
      }

      // Detect E164 Indian phone so delivery-charge lookup works without uidIndex round-trip
      const isPhone = /^\+91[6-9]\d{9}$/.test(storeId);

      result.push({
        productId: item.productId,
        sellerId: storeId,
        sellerType: item.sellerType ?? 'retailer',
        sellerName: avail?.storeName,
        ...(isPhone ? { sellerPhone: storeId } : {}),
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
