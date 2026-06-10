import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  GeoPoint,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  authDomain: typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? "krishidukan-e8315.firebaseapp.com"
    : "krishidukan.com",
  projectId: "krishidukan-e8315",
  storageBucket: "krishidukan-e8315.firebasestorage.app",
  messagingSenderId: "650303885415",
  appId: "1:650303885415:web:7db7619260aa478b2b84c2",
  measurementId: "G-7MEFGCD4EX"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Initialize analytics safely
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  });
}

export { db, auth, storage };

async function resolveUserProfileDocId(uid: string): Promise<string | null> {
  const [idxSnap, legacyUserSnap] = await Promise.all([
    getDoc(doc(db, 'uidIndex', uid)),
    getDoc(doc(db, 'users', uid)),
  ]);

  if (idxSnap.exists()) {
    const phone = String(idxSnap.data().phone ?? '').trim();
    if (phone) return phone;
  }

  return legacyUserSnap.exists() ? uid : null;
}

async function resolveRetailerStoreDocId(uid: string): Promise<string> {
  // With the phone-based schema, the retailers/ document ID is the normalized phone.
  // Resolve from uidIndex first (authoritative), then fall back to uid for legacy accounts.
  try {
    const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
    if (idxSnap.exists()) {
      const phone = String(idxSnap.data().phone ?? '').trim();
      if (phone) return phone;
    }
  } catch { /* fall through */ }
  return uid;
}

export type RetailerProduct = {
  name: string;
  quantity: string;
  unit: string;
};

type CreateRetailProductInput = {
  name: string;
  price: string;
  description: string;
  image: string;
  stock: string;
  category: string;
  store: string;
  distance: string;
  sellMode?: "online_delivery" | "offline_store_only";
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];
};

export type RetailerApplication = {
  ownerName: string;
  shopName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  products: RetailerProduct[];
};

export type RetailerProfile = {
  ownerName: string;
  shopName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
};

import { MarketplaceProduct } from '../types/product';
import type { CartItem, OrderDoc, OrderStatus, SellerType, StatusHistoryEntry } from '../types/order';

export async function saveRetailerApplication(payload: RetailerApplication) {
  const products = payload.products
    .filter((item) => item.name.trim() && item.quantity.trim())
    .map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity.trim(),
      unit: item.unit.trim() || 'units'
    }));

  if (!products.length) {
    throw new Error('Please add at least one product with quantity.');
  }

  // Use normalized phone as the document ID so the record is deterministic and dedup-safe
  const normalizedPhone = toE164(payload.phone.trim());
  await setDoc(doc(db, 'retailers', normalizedPhone), {
    ownerName: payload.ownerName.trim(),
    shopName: payload.shopName.trim(),
    phone: normalizedPhone,
    email: payload.email.trim(),
    address: payload.address.trim(),
    city: payload.city.trim(),
    state: payload.state.trim(),
    pincode: payload.pincode.trim(),
    location: {
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude)
    },
    products,
    status: 'pending',
    userType: 'retailer',
    createdAt: serverTimestamp()
  }, { merge: true });
}

export async function saveRetailerProfile(retailerId: string, profile: RetailerProfile) {
  const retailerStoreDocId = await resolveRetailerStoreDocId(retailerId);
  await setDoc(
    doc(db, 'retailers', retailerStoreDocId),
    {
      userId: retailerId,
      retailerId,
      ownerName: profile.ownerName.trim(),
      shopName: profile.shopName.trim(),
      phone: profile.phone.trim(),
      email: profile.email.trim(),
      address: profile.address.trim(),
      city: profile.city.trim(),
      state: profile.state.trim(),
      pincode: profile.pincode.trim(),
      location: {
        latitude: Number(profile.latitude),
        longitude: Number(profile.longitude)
      },
      active: true,
      userType: 'retailer',
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveRetailerProduct(
  retailerId: string,
  product: CreateRetailProductInput
) {
  const userProfileDocId = await resolveUserProfileDocId(retailerId);
  const retailerPhone = userProfileDocId && userProfileDocId !== retailerId ? userProfileDocId : null;
  const storeDocId = await resolveRetailerStoreDocId(retailerId);

  const sellMode = product.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only";
  const storeName = product.store.trim();
  const stockLevel = product.stock.trim() || 'In Stock';
  const price = Number(product.price);

  await addDoc(collection(db, 'products'), {
    retailerId,
    ...(retailerPhone ? { retailerPhone } : {}),
    name: product.name.trim(),
    fullName: product.name.trim(),
    price,
    category: product.category.trim() || 'general',
    description: product.description.trim(),
    image: product.image.trim(),
    stock: stockLevel,
    store: storeName,
    distance: product.distance.trim() || 'Nearby',
    sellMode,
    isOnline: sellMode === "online_delivery",
    source: 'retailer',
    createdAt: serverTimestamp(),
    nitrogen: product.nitrogen?.trim() || null,
    phosphorus: product.phosphorus?.trim() || null,
    potassium: product.potassium?.trim() || null,
    applicationDesc: product.applicationDesc?.trim() || null,
    dosage: product.dosage?.trim() || null,
    bestForCrops: product.bestForCrops || null,
    availability: [{
      storeId: storeDocId,
      ...(retailerPhone ? { storePhone: retailerPhone } : {}),
      storeName,
      stockLevel,
      sellingPrice: price,
    }],
  });

  // 2. Increment productCount in user profile
  if (userProfileDocId) {
    const userRef = doc(db, 'users', userProfileDocId);
    await setDoc(userRef, {
      productCount: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // 3. Ensure a retailers doc exists so this store appears on product pages.
  // If the retailer never saved their full profile, fetchStores() won't find them.
  // Only creates if missing — a full profile save later will merge & overwrite.
  const retailersRef = doc(db, 'retailers', storeDocId);
  const retailersSnap = await getDoc(retailersRef);
  if (!retailersSnap.exists()) {
    const userPhone = retailerPhone ?? storeDocId;
    let shopName = storeName;
    let ownerName = '';
    if (userProfileDocId) {
      try {
        const uSnap = await getDoc(doc(db, 'users', userProfileDocId));
        if (uSnap.exists()) {
          const ud = uSnap.data() as Record<string, unknown>;
          shopName = String(ud.businessName ?? ud.shopName ?? ud.name ?? storeName);
          ownerName = String(ud.ownerName ?? ud.name ?? '');
        }
      } catch { /* non-critical */ }
    }
    await setDoc(retailersRef, {
      userId: retailerId,
      retailerId,
      role: 'retailer',
      shopName,
      ownerName,
      phone: userPhone,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export async function fetchMarketplaceProducts(): Promise<MarketplaceProduct[]> {
  try {
    const [snapshot, reviewsSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'productReviews')).catch(() => null),
    ]);

    // Compute ratings straight from the review documents (source of truth), keyed by catalogId.
    // This avoids depending on aggregate fields being kept in sync on product/catalog docs.
    const ratingAgg = new Map<string, { sum: number; count: number }>();
    if (reviewsSnap) {
      for (const d of reviewsSnap.docs) {
        const rd = d.data();
        const id = String(rd.catalogId || '');
        const rating = Number(rd.rating || 0);
        if (!id || !(rating > 0)) continue;
        const cur = ratingAgg.get(id) ?? { sum: 0, count: 0 };
        cur.sum += rating;
        cur.count += 1;
        ratingAgg.set(id, cur);
      }
    }
    // Track every source product id merged under each dedup key, so a review on any
    // variant (manufacturer/retailer copy) still contributes to the merged card's rating.
    const idsByKey = new Map<string, string[]>();

    const allMapped = snapshot.docs
      .filter((item) => item.data().isActive !== false)
      .map((item) => {
      const data = item.data();
      console.log("[fetchMarketplaceProducts] doc read:", {
        id: item.id,
        name: String(data.name || ''),
        source: String(data.source || ''),
        ownerId: String(data.ownerId || ''),
        ownerType: String(data.ownerType || ''),
        isOnline: data.isOnline,
        sellMode: data.sellMode,
      });
      return {
        id: item.id,
        name: String(data.name || ''),
        fullName: data.fullName ? String(data.fullName) : undefined,
        price: Number(data.price || 0),
        oldPrice: data.oldPrice ? Number(data.oldPrice) : undefined,
        category: String(data.category || 'general'),
        description: String(data.description || ''),
        image: String(data.image || ''),
        stock: String(data.stock || 'In Stock'),
        store: String(data.store || 'Local Store'),
        distance: String(data.distance || 'Nearby'),
        retailerId: data.retailerId ? String(data.retailerId) : undefined,
        retailerPhone: data.retailerPhone ? String(data.retailerPhone) : undefined,
        ownerId: data.ownerId ? String(data.ownerId) : undefined,
        manufacturerId: data.manufacturerId ? String(data.manufacturerId) : undefined,
        manufacturerPhone: data.manufacturerPhone ? String(data.manufacturerPhone) : undefined,
        sellMode: data.sellMode === "offline_store_only" ? "offline_store_only" : "online_delivery",
        isOnline: data.sellMode !== "offline_store_only",
        availability: data.availability || undefined,
        source: data.source ? String(data.source) : undefined,
        gstApplicable: data.gstApplicable === true,
        gstRate: [0, 5, 12, 18, 28].includes(Number(data.gstRate))
          ? (Number(data.gstRate) as 0 | 5 | 12 | 18 | 28)
          : undefined,
        averageRating: typeof data.averageRating === 'number' ? data.averageRating : undefined,
        totalReviews: typeof data.totalReviews === 'number' ? data.totalReviews : undefined,
        categoryInfo: (data.categoryInfo && typeof data.categoryInfo === "object" && !Array.isArray(data.categoryInfo))
          ? data.categoryInfo as Record<string, string | string[]>
          : undefined,
        // Legacy fertilizer flat fields — kept for backward compat
        nitrogen: data.nitrogen ? String(data.nitrogen) : undefined,
        phosphorus: data.phosphorus ? String(data.phosphorus) : undefined,
        potassium: data.potassium ? String(data.potassium) : undefined,
        applicationDesc: data.applicationDesc ? String(data.applicationDesc) : undefined,
        dosage: data.dosage ? String(data.dosage) : undefined,
        bestForCrops: Array.isArray(data.bestForCrops) ? data.bestForCrops : undefined,
        // Discount fields — written by updateDiscountRecord when a seller sets a discount
        effectiveDiscountPct: typeof data.effectiveDiscountPct === 'number' ? data.effectiveDiscountPct : 0,
        maxDiscountPct: typeof data.maxDiscountPct === 'number' ? data.maxDiscountPct : 0,
        variants: Array.isArray(data.variants) ? data.variants : undefined,
        images: Array.isArray(data.images) ? data.images : undefined,
      } as MarketplaceProduct;
    });

    // Retailer copies hold each store's selling price — collect separately before filtering.
    // admin_assigned copies are also per-seller and must NOT contribute to the canonical
    // raw dedup pool — they carry a stale isOnline inherited from the original at creation
    // time and would permanently keep anyOnlineByKey=true even after the original goes offline.
    const COPY_SOURCES = new Set(['retailer_inventory_copy', 'manufacturer_assigned', 'admin_assigned']);
    const retailerCopies = allMapped.filter((p) => COPY_SOURCES.has(p.source ?? ''));

    const raw = allMapped.filter(
      (product) =>
        product.name &&
        product.image &&
        Number.isFinite(product.price) &&
        !COPY_SOURCES.has(product.source ?? ''),
    );

    // Per-seller discount map: nameKey → { sellerUidOrPhone: discountPct }
    const sellerDiscountsByKey = new Map<string, Record<string, number>>();
    const recordSellerDiscount = (key: string, uid: string | undefined, phone: string | undefined, pct: number) => {
      if (!pct || pct <= 0) return;
      const map = sellerDiscountsByKey.get(key) ?? {};
      if (uid) map[uid] = pct;
      if (phone) map[phone] = pct;
      sellerDiscountsByKey.set(key, map);
    };

    // Per-key tracker: is ANY seller listing online for this product?
    // Used to compute the merged card's sellMode/isOnline without letting one
    // offline listing contaminate all sellers.
    const anyOnlineByKey = new Map<string, boolean>();
    const markOnline = (key: string, isOnline: boolean) => {
      if (isOnline) anyOnlineByKey.set(key, true);
    };

    // Deduplicate by name: if two products share the same name (case-insensitive),
    // keep the manufacturer_inventory card as canonical and merge the retailer's
    // store info into its availability array so farmers see one card with all sources.
    const byName = new Map<string, MarketplaceProduct>();
    for (const p of raw) {
      const key = p.name.toLowerCase().trim();
      recordSellerDiscount(key, (p as any).ownerId, p.retailerPhone, p.effectiveDiscountPct ?? 0);
      markOnline(key, p.isOnline === true);
      const ids = idsByKey.get(key) ?? [];
      ids.push(p.id);
      idsByKey.set(key, ids);
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...p, availability: p.availability ? [...p.availability] : [] });
        continue;
      }

      const existingIsManufacturer = existing.source === 'manufacturer_inventory';
      const pIsManufacturer = p.source === 'manufacturer_inventory';
      const canonical = (!existingIsManufacturer && pIsManufacturer) ? { ...p, availability: p.availability ? [...p.availability] : [] } : existing;
      const secondary = (!existingIsManufacturer && pIsManufacturer) ? existing : p;

      // Merge secondary's own availability entries into canonical
      const av: NonNullable<MarketplaceProduct['availability']> = [...(canonical.availability ?? [])];
      for (const entry of (secondary.availability ?? [])) {
        const dup = av.some(
          (a) => a.storeId === entry.storeId ||
                 (entry.storePhone && a.storePhone === entry.storePhone),
        );
        if (!dup) av.push(entry);
      }

      // Register the secondary product itself as an availability source,
      // carrying its per-seller isOnline so ProductDetailView can check it.
      const secondaryStoreId = (secondary as any).ownerId || secondary.retailerId || '';
      const secondaryPhone = secondary.retailerPhone;
      const alreadyPresent = av.some(
        (a) => (secondaryStoreId && a.storeId === secondaryStoreId) ||
               (secondaryPhone && a.storePhone === secondaryPhone),
      );
      if (!alreadyPresent && (secondaryStoreId || secondaryPhone)) {
        av.push({
          storeId: secondaryStoreId,
          storePhone: secondaryPhone,
          storeName: secondary.store || undefined,
          stockLevel: secondary.stock || 'In Stock',
          sellingPrice: secondary.price,
          isOnline: secondary.isOnline,
          // Carry this store's own per-package-size prices so the detail view can
          // resolve the correct price per selected variant (not just the base price).
          variants: Array.isArray(secondary.variants) ? secondary.variants : undefined,
        });
      }

      const mergedMaxDiscount = Math.max(
        canonical.maxDiscountPct ?? canonical.effectiveDiscountPct ?? 0,
        secondary.maxDiscountPct ?? secondary.effectiveDiscountPct ?? 0,
      );
      byName.set(key, {
        ...canonical,
        availability: av.length > 0 ? av : undefined,
        maxDiscountPct: mergedMaxDiscount,
        effectiveDiscountPct: mergedMaxDiscount,
      });
    }

    // Merge each retailer copy's price into the canonical product's availability
    for (const copy of retailerCopies) {
      if (!copy.name || !copy.price) continue;
      const key = copy.name.toLowerCase().trim();
      const canonical = byName.get(key);
      if (!canonical) continue;

      const copyIds = idsByKey.get(key) ?? [];
      if (!copyIds.includes(copy.id)) { copyIds.push(copy.id); idsByKey.set(key, copyIds); }

      const copyStoreId = (copy as any).ownerId || copy.retailerId || '';
      const copyPhone = copy.retailerPhone;
      if (!copyStoreId && !copyPhone) continue;

      markOnline(key, copy.isOnline === true);

      const av: NonNullable<MarketplaceProduct['availability']> = [...(canonical.availability ?? [])];
      const existing = av.find(
        (a) =>
          (copyStoreId && a.storeId === copyStoreId) ||
          (copyPhone && a.storePhone === copyPhone),
      );
      const copyDiscountPct = copy.effectiveDiscountPct ?? 0;
      recordSellerDiscount(key, copyStoreId, copyPhone, copyDiscountPct);

      if (existing) {
        existing.sellingPrice = copy.price;
        // Carry the copy's isOnline into the existing entry so ProductDetailView
        // can use it for per-seller ordering eligibility.
        if (copy.isOnline !== undefined) existing.isOnline = copy.isOnline;
        // Mirror this store's own per-package-size prices onto the entry.
        if (Array.isArray(copy.variants)) existing.variants = copy.variants;
      } else {
        av.push({
          storeId: copyStoreId,
          storePhone: copyPhone,
          storeName: copy.store || undefined,
          stockLevel: copy.stock || 'In Stock',
          sellingPrice: copy.price,
          isOnline: copy.isOnline,
          // Carry this store's own per-package-size prices so the detail view can
          // resolve the correct price per selected variant (not just the base price).
          variants: Array.isArray(copy.variants) ? copy.variants : undefined,
        });
      }
      const newMax = Math.max(canonical.maxDiscountPct ?? 0, copyDiscountPct);
      byName.set(key, { ...canonical, availability: av, maxDiscountPct: newMax });
    }

    // Compute lowestPrice + ratings + corrected sellMode across all merged sources.
    // CRITICAL: sellMode/isOnline on the merged card reflects ANY seller being online.
    // A single offline listing must never suppress the Order button for online sellers.
    return Array.from(byName.entries()).map(([key, p]) => {
      const prices = (p.availability ?? [])
        .map((a) => a.sellingPrice)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : undefined;

      let sum = 0, count = 0;
      for (const id of (idsByKey.get(key) ?? [p.id])) {
        const agg = ratingAgg.get(id);
        if (agg) { sum += agg.sum; count += agg.count; }
      }
      const averageRating = count > 0 ? sum / count : p.averageRating;
      const totalReviews = count > 0 ? count : p.totalReviews;

      const sellerDiscounts = sellerDiscountsByKey.get(key) ?? {};

      // Recompute isOnline/sellMode: true if ANY seller listing is online.
      const mergedOnline = anyOnlineByKey.get(key) ?? false;
      const mergedSellMode: "online_delivery" | "offline_store_only" =
        mergedOnline ? "online_delivery" : "offline_store_only";

      // Ensure the canonical product's own seller always has an availability entry.
      // Without this, ProductDetailView finds availEntry=undefined and falls back to
      // account-level alone — the product-level isOnline toggle has no effect for
      // single-seller products or manufacturer products with no retailer copies.
      const canonOwnerId = (p as any).ownerId as string | undefined;
      const canonPhone = ((p as any).manufacturerPhone as string | undefined) || p.retailerPhone;
      const currentAv = p.availability ?? [];
      const hasCanonEntry =
        !canonOwnerId && !canonPhone
          ? true
          : currentAv.some(
              (a) =>
                (canonOwnerId && (a.storeId === canonOwnerId || a.storePhone === canonOwnerId)) ||
                (canonPhone && (a.storePhone === canonPhone || a.storeId === canonPhone)),
            );
      const finalAvailability: NonNullable<MarketplaceProduct['availability']> = hasCanonEntry
        ? currentAv
        : [
            ...currentAv,
            {
              storeId: canonOwnerId || '',
              storePhone: canonPhone,
              storeName: p.store || undefined,
              stockLevel: p.stock || 'In Stock',
              sellingPrice: p.price,
              // Use the canonical's own isOnline (before merged OR correction),
              // so ProductDetailView shows the correct per-seller Order button.
              isOnline: p.isOnline,
              // Carry the owner's OWN per-package-size prices so the detail view can
              // resolve the correct price per selected variant and keep the store
              // visible for every configured size — not just the base. Without this,
              // resolveStoreVariant() finds an availability entry with no variants[]
              // and falls back to the legacy single-(base)-size path, hiding the
              // owner store for any non-base variant (e.g. 2L) it actually stocks.
              variants: Array.isArray(p.variants) ? p.variants : undefined,
            },
          ];

      console.log("[fetchMarketplaceProducts]", {
        name: p.name,
        id: p.id,
        source: p.source,
        ownerId: canonOwnerId,
        rawIsOnline: p.isOnline,
        mergedOnline,
        mergedSellMode,
        availabilityIsOnline: finalAvailability.map((a) => ({ storeId: a.storeId, storePhone: a.storePhone, isOnline: a.isOnline })),
      });

      return {
        ...p,
        isOnline: mergedOnline,
        sellMode: mergedSellMode,
        availability: finalAvailability.length > 0 ? finalAvailability : undefined,
        lowestPrice,
        averageRating,
        totalReviews,
        sellerDiscounts,
      };
    });
  } catch (error) {
    console.error('Error fetching products from Firestore:', error);
    throw error;
  }
}

export type Store = {
  id: string;
  name: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  distance: string;
  status: string;
  stock: string[];
  isHot?: boolean;
  logo?: string;
  location: { lat: number; lng: number };
  averageRating?: number;
  totalReviews?: number;
};

export async function fetchStores(): Promise<Store[]> {
  try {
    const [storesSnapshot, retailersSnapshot, manufacturersSnapshot, storeReviewsSnap] = await Promise.all([
      getDocs(collection(db, 'stores')),
      getDocs(collection(db, 'retailers')),
      getDocs(collection(db, 'manufacturers')),
      getDocs(collection(db, 'storeReviews')).catch(() => null),
    ]);

    // Aggregate store ratings straight from review docs (source of truth), keyed by storePhone.
    const storeRatingAgg = new Map<string, { sum: number; count: number }>();
    if (storeReviewsSnap) {
      for (const d of storeReviewsSnap.docs) {
        const rd = d.data();
        const phone = String(rd.storePhone || '');
        const rating = Number(rd.rating || 0);
        if (!phone || !(rating > 0)) continue;
        const cur = storeRatingAgg.get(phone) ?? { sum: 0, count: 0 };
        cur.sum += rating;
        cur.count += 1;
        storeRatingAgg.set(phone, cur);
      }
    }

    const stores = storesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    } as Store));

    const retailers = retailersSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        retailerId: data.retailerId,
        userId: data.userId,
        name: data.shopName || data.ownerName || 'Retailer',
        ownerName: data.ownerName,
        // Fall back to doc.id: for phone-keyed docs the doc ID is the phone number itself
        phone: data.phone || (/^\+?\d{10,13}$/.test(doc.id) ? doc.id : undefined),
        logo: data.logo || undefined,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        distance: 'Nearby',
        status: data.status || 'Active',
        stock: Array.isArray(data.products) ? data.products.map((p: any) => p.name || p) : [],
        location: {
          lat: data.geo?.latitude ?? data.location?.latitude ?? data.location?.lat ?? 0,
          lng: data.geo?.longitude ?? data.location?.longitude ?? data.location?.lng ?? 0,
        },
        averageRating: typeof data.averageRating === 'number' ? data.averageRating : undefined,
        totalReviews: typeof data.totalReviews === 'number' ? data.totalReviews : undefined,
      } as Store & { retailerId?: string; userId?: string; city?: string; state?: string; pincode?: string };
    });

    const dedupedRetailers = Array.from(
      retailers.reduce((map, store) => {
        const key = String(store.phone || store.id).trim();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, store);
          return map;
        }

        const currentScore =
          (store.retailerId ? 3 : 0) +
          (store.userId ? 3 : 0) +
          (store.name && store.name !== 'Retailer' ? 2 : 0) +
          (store.location?.lat || store.location?.lng ? 1 : 0);
        const existingScore =
          (existing.retailerId ? 3 : 0) +
          (existing.userId ? 3 : 0) +
          (existing.name && existing.name !== 'Retailer' ? 2 : 0) +
          (existing.location?.lat || existing.location?.lng ? 1 : 0);

        if (currentScore >= existingScore) map.set(key, store);
        return map;
      }, new Map<string, Store & { retailerId?: string; userId?: string }>())
      .values(),
    );

    // Manufacturers appear as stores — matched by store.id === product.manufacturerId
    // or by store.userId === product.manufacturerId (uid-keyed products)
    const manufacturers = manufacturersSnapshot.docs
      .filter((doc) => {
        const data = doc.data();
        // Only include manufacturers that have saved a profile with a name
        return !!(data.businessName || data.ownerName);
      })
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          // Expose the Firebase Auth UID so product filters can match on manufacturerId
          userId: data.uid || undefined,
          name: data.businessName || data.ownerName || 'Manufacturer',
          ownerName: data.ownerName,
          phone: data.phone || (/^\+?\d{10,13}$/.test(doc.id) ? doc.id : undefined),
          logo: data.logo || undefined,
          address: data.address,
          city: data.address?.city || data.city,
          state: data.address?.state || data.state,
          pincode: data.address?.pincode || data.pincode,
          distance: 'Nearby',
          status: 'Active',
          stock: [],
          // Manufacturers save geo as a Firestore GeoPoint; extract lat/lng
          location: {
            lat: data.geo?.latitude ?? data.location?.latitude ?? data.location?.lat ?? 0,
            lng: data.geo?.longitude ?? data.location?.longitude ?? data.location?.lng ?? 0,
          },
        } as Store & { userId?: string };
      });

    // Final cross-collection deduplication: retailers/ and manufacturers/ entries take priority
    // over legacy stores/ entries (which may have stale names/coordinates).
    // Key by phone; prefer entries with valid coordinates and richer metadata.
    type AnyStore = Store & { retailerId?: string; userId?: string; phone?: string };
    const scoreEntry = (s: AnyStore) =>
      (s.retailerId || (s as any).userId ? 4 : 0) +
      (s.name && s.name !== 'Retailer' && s.name !== 'Manufacturer' ? 2 : 0) +
      ((s.location?.lat || s.location?.lng) ? 1 : 0);

    const globalMap = new Map<string, AnyStore>();
    for (const entry of [...stores, ...dedupedRetailers, ...manufacturers] as AnyStore[]) {
      const phone = entry.phone || (/^\+?\d{10,13}$/.test(entry.id) ? entry.id : undefined);
      // Key by phone if available, otherwise fall back to id (non-phone doc IDs won't collide)
      const key = phone || entry.id;
      const existing = globalMap.get(key);
      if (!existing || scoreEntry(entry) > scoreEntry(existing)) {
        globalMap.set(key, entry);
      }
    }

    // Attach ratings computed from storeReviews, keyed by the store's phone
    return Array.from(globalMap.values()).map((entry) => {
      const phone = entry.phone || (/^\+?\d{10,13}$/.test(entry.id) ? entry.id : '');
      const agg = phone ? storeRatingAgg.get(phone) : undefined;
      if (agg && agg.count > 0) {
        return { ...entry, averageRating: agg.sum / agg.count, totalReviews: agg.count };
      }
      return entry;
    });
  } catch (error) {
    console.error('Error fetching stores from Firestore:', error);
    throw error;
  }
}

function toE164(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function saveUserProfile(
  uid: string,
  profile: {
    name: string;
    email: string;
    role: string;
    phone?: string;
    authEmail?: string;
    phoneNormalized?: string;
  }
) {
  const phone = toE164(profile.phone || profile.phoneNormalized || '');
  const now = serverTimestamp();

  // Step 1: write uidIndex FIRST — this rule only checks request.auth.uid == uid,
  // no myPhone() lookup needed, so it works even before the user doc exists.
  await setDoc(doc(db, 'uidIndex', uid), { phone, createdAt: now });

  // Step 2: now myPhone() resolves correctly, so users/{phone} write is allowed.
  // If the doc already exists (admin pre-created the account), preserve every
  // admin-set field (role, address, isPaid, etc.) — only link the real Auth UID.
  // For a brand new user, create the full record as usual.
  const existingSnap = await getDoc(doc(db, 'users', phone));
  if (existingSnap.exists()) {
    await updateDoc(doc(db, 'users', phone), { uid, updatedAt: now });
  } else {
    await setDoc(doc(db, 'users', phone), {
      uid,
      phone,
      name: profile.name,
      email: null,
      role: profile.role,
      roleUpgradeHistory: [],
      isPaid: false,
      totalSeats: 0,
      productCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getUserProfile(uid: string) {
  try {
    // New schema: resolve uid → phone via uidIndex, then read users/{phone}
    const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
    if (idxSnap.exists()) {
      const phone = String(idxSnap.data().phone ?? '');
      if (phone) {
        const userSnap = await getDoc(doc(db, 'users', phone));
        if (userSnap.exists()) return userSnap.data();
      }
    }
  } catch {
    // fall through
  }
  // Fallback: email-based admin accounts use users/{uid} directly (no uidIndex entry)
  try {
    const directSnap = await getDoc(doc(db, 'users', uid));
    if (directSnap.exists()) return directSnap.data();
  } catch {
    // fall through
  }
  return null;
}

export async function updateSubscriptionStatus(
  uid: string,
  status: 'paid' | 'unpaid',
  paymentDetails?: any,
  seatCount: number = 1,
  durationMonths: number = 1
): Promise<{ profileUpdated: true; paymentLogged: boolean; paymentLogError?: string }> {
  const timestamp = serverTimestamp();

  // Resolve uid → phone. Try uidIndex first; then scan users/{uid} directly (works for
  // admin-created / email-based accounts that have no uidIndex entry).
  let userDocRef = doc(db, 'users', uid);
  let userData: Record<string, unknown> = {};
  let phone: string | null = null;

  try {
    const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
    if (idxSnap.exists()) {
      phone = String(idxSnap.data().phone ?? '');
      userDocRef = doc(db, 'users', phone);
    }
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      userData = userDoc.data() as Record<string, unknown>;
      // If we landed on users/{uid} (no uidIndex), extract phone from the doc itself
      if (!phone && userData.phone) phone = String(userData.phone);
    }
  } catch { /* fall through with empty userData */ }

  // Last resort: if phone is still null and we have a users doc keyed by phone (admin pre-created),
  // the ownerId/ownerPhone in subscription docs must be phone-based for rules to pass.
  // Use the uid as the fallback only when no phone can be found at all.

  const currentSeats = Number(userData.totalSeats) || 0;
  const seatsToAdd = Number(seatCount) || 1;

  await setDoc(userDocRef, {
    isPaid: status === 'paid',
    subscriptionStatus: status,
    paymentDetails: paymentDetails || null,
    totalSeats: status === 'paid' ? currentSeats + seatsToAdd : currentSeats,
    updatedAt: timestamp,
  }, { merge: true });

  if (status === 'paid') {
    try {
      const PRICE_PER_SEAT: Record<number, number> = { 1: 21, 3: 54, 6: 90, 12: 144 };
      const pricePerSeat = PRICE_PER_SEAT[durationMonths] ?? 21;
      const totalAmount = seatsToAdd * pricePerSeat;

      // Write both legacy (userId/ownerId) and new (userPhone/ownerPhone) fields so all queries
      // and Firestore rules work. Rules check ownerPhone == myPhone() OR ownerId == uid.
      // When phone is null (rare edge case, no uidIndex + no phone in user doc) we fall
      // back to uid — rules then use the ownerId == request.auth.uid path.
      await addDoc(collection(db, 'payments'), {
        userId: uid,
        userPhone: phone ?? uid,
        amount: totalAmount,
        seatCount: seatsToAdd,
        durationMonths,
        currency: 'INR',
        razorpayOrderId: paymentDetails?.orderId ?? null,
        razorpayPaymentId: paymentDetails?.paymentId ?? null,
        timestamp,
        status: 'success',
      });

      const now = new Date();
      const expiry = new Date(now);
      expiry.setMonth(expiry.getMonth() + durationMonths);
      const role = userData.role === 'manufacturer' ? 'manufacturer' : 'retailer';

      // Write both legacy (ownerId) and new (ownerPhone) fields.
      await addDoc(collection(db, 'subscriptions'), {
        ownerId: uid,
        ownerPhone: phone ?? uid,
        ownerType: role,
        planName: 'Standard',
        seatsPurchased: seatsToAdd,
        durationMonths,
        amountPaid: totalAmount,
        currency: 'INR',
        razorpayOrderId: paymentDetails?.orderId ?? null,
        razorpayPaymentId: paymentDetails?.paymentId ?? null,
        subscriptionStatus: 'active',
        startDate: Timestamp.fromDate(now),
        expiryDate: Timestamp.fromDate(expiry),
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      return { profileUpdated: true, paymentLogged: true };
    } catch (error) {
      const paymentLogError = error instanceof Error ? error.message : 'Unable to write payment log.';
      console.warn('Payment succeeded but payment log write failed:', paymentLogError);
      return { profileUpdated: true, paymentLogged: false, paymentLogError };
    }
  }

  return { profileUpdated: true, paymentLogged: false };
}

export async function requestRoleUpgrade(
  uid: string,
  targetRole: 'retailer' | 'manufacturer',
  details: {
    shopName?: string;
    businessName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  }
): Promise<void> {
  const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
  if (!idxSnap.exists()) throw new Error('User profile not found. Please re-login.');
  const phone = String(idxSnap.data().phone ?? '').trim();
  if (!phone) throw new Error('Phone not found. Please re-login.');

  const userRef = doc(db, 'users', phone);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User profile not found.');

  const currentRole = String(userSnap.data().role ?? 'customer');

  if (targetRole === 'retailer' && !['customer', 'consumer'].includes(currentRole)) {
    throw new Error('Only customers can upgrade to retailer.');
  }
  if (targetRole === 'manufacturer' && currentRole !== 'retailer') {
    throw new Error('Only retailers can upgrade to manufacturer.');
  }

  const now = serverTimestamp();

  await setDoc(userRef, {
    role: targetRole,
    roleUpgradeHistory: arrayUnion({
      from: currentRole,
      to: targetRole,
      at: new Date().toISOString(),
    }),
    updatedAt: now,
  }, { merge: true });

  if (targetRole === 'retailer') {
    await setDoc(doc(db, 'retailers', phone), {
      userId: uid,
      retailerId: uid,
      phone,
      ownerName: userSnap.data().name || '',
      shopName: (details.shopName || '').trim(),
      address: (details.address || '').trim(),
      city: (details.city || '').trim(),
      state: (details.state || '').trim(),
      pincode: (details.pincode || '').trim(),
      status: 'active',
      userType: 'retailer',
      active: true,
      location: { latitude: 0, longitude: 0 },
      products: [],
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  } else {
    // Phone is the canonical document ID for manufacturers (matches subcollection structure)
    await setDoc(doc(db, 'manufacturers', phone), {
      uid,
      userId: uid,
      manufacturerId: uid,
      phone,
      ownerName: userSnap.data().name || '',
      businessName: (details.businessName || '').trim(),
      address: (details.address || '').trim(),
      city: (details.city || '').trim(),
      state: (details.state || '').trim(),
      pincode: (details.pincode || '').trim(),
      active: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // Auto-create a company page if none exists yet
    const cpRef = doc(db, 'companyPages', phone);
    const cpSnap = await getDoc(cpRef);
    if (!cpSnap.exists()) {
      const locationStr = [details.city, details.state].filter(Boolean).join(', ');
      await setDoc(cpRef, {
        id: phone,
        name: (details.businessName || userSnap.data().name || 'My Brand').trim(),
        tagline: '',
        about: '',
        location: locationStr,
        founded: '',
        website: '',
        socialProof: '',
        certifications: [],
        primaryColor: '#154212',
        accentColor: '#f57c00',
        phone: phone,
        email: userSnap.data().email || '',
        videos: [],
        ownerPhone: phone,
        createdAt: now,
        updatedAt: now,
      });
      await setDoc(userRef, { ownerCompanyId: phone, updatedAt: now }, { merge: true });
    }
  }
}

export async function adminAutoSeedCompanyPage(userDocId: string): Promise<void> {
  const userRef = doc(db, 'users', userDocId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found.');
  const u = userSnap.data();
  const now = serverTimestamp();
  const cpRef = doc(db, 'companyPages', userDocId);
  const locationStr = [u.city, u.state].filter(Boolean).join(', ');
  await setDoc(cpRef, {
    id: userDocId,
    name: (u.businessName || u.shopName || u.name || 'My Brand').trim(),
    tagline: '',
    about: '',
    location: locationStr,
    founded: '',
    website: u.website || '',
    socialProof: '',
    certifications: [],
    primaryColor: '#154212',
    accentColor: '#f57c00',
    phone: userDocId,
    email: u.email || '',
    videos: [],
    ownerPhone: userDocId,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  await setDoc(userRef, { ownerCompanyId: userDocId, updatedAt: now }, { merge: true });
}

export async function fetchAllMarketplaceProducts(): Promise<MarketplaceProduct[]> {
  try {
    const q = query(
      collection(db, 'products'),
      where('isActive', '==', true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketplaceProduct));
  } catch (error) {
    console.error('Error fetching all products:', error);
    throw error;
  }
}

export async function fetchManufacturerProducts(manufacturerId: string): Promise<MarketplaceProduct[]> {
  try {
    // Query both field names: legacy schema uses ownerId, newer schema uses manufacturerId.
    // The public brand page queries manufacturerId; the dashboard uses ownerId.
    // Both must return the same set so all views stay in sync.
    const [byOwnerId, byManufacturerId] = await Promise.all([
      getDocs(query(
        collection(db, 'products'),
        where('ownerId', '==', manufacturerId),
        where('ownerType', '==', 'manufacturer'),
      )),
      getDocs(query(
        collection(db, 'products'),
        where('manufacturerId', '==', manufacturerId),
      )),
    ]);
    const seen = new Set<string>();
    const results: MarketplaceProduct[] = [];
    for (const snap of [byOwnerId, byManufacturerId]) {
      for (const d of snap.docs) {
        if (d.data().isActive === false) continue;
        if (!seen.has(d.id)) {
          seen.add(d.id);
          results.push({ id: d.id, ...d.data() } as MarketplaceProduct);
        }
      }
    }
    return results;
  } catch (error) {
    console.error('Error fetching manufacturer products:', error);
    throw error;
  }
}

export async function fetchRetailerProducts(retailerId: string): Promise<MarketplaceProduct[]> {
  try {
    const q = query(collection(db, 'products'), where('retailerId', '==', retailerId));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .filter(doc => doc.data().isActive !== false)
      .map(doc => ({
      id: doc.id,
      ...doc.data()
    } as MarketplaceProduct));
  } catch (error) {
    console.error('Error fetching retailer products:', error);
    throw error;
  }
}

export async function saveManufacturerProduct(manufacturerId: string, product: any) {
  // resolveUserProfileDocId returns the phone (from uidIndex) — use it as manufacturerPhone
  const userProfileDocId = await resolveUserProfileDocId(manufacturerId);
  const manufacturerPhone = userProfileDocId && /^\+?\d{10,13}$/.test(userProfileDocId)
    ? userProfileDocId
    : undefined;

  // 1. Create the product — strip any stale ownership fields from the input
  const { retailerId: _r, ownerType: _ot, ownerId: _oi, store: _s, distance: _d, stock: _st, ...rest } = product;
  const sellMode = product?.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only";

  await addDoc(collection(db, 'products'), {
    ...rest,
    ownerId: manufacturerId,
    ownerType: 'manufacturer',
    createdBy: manufacturerId,
    manufacturerId,
    ...(manufacturerPhone ? { manufacturerPhone } : {}),
    source: 'manufacturer_inventory',
    sellMode,
    isOnline: sellMode === "online_delivery",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // 2. Increment productCount in user profile
  if (userProfileDocId) {
    const userRef = doc(db, 'users', userProfileDocId);
    await setDoc(userRef, {
      productCount: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}

export async function fetchDealers(): Promise<any[]> {
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'retailer'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching dealers:', error);
    throw error;
  }
}

export async function fetchRetailerOrders(retailerId: string): Promise<any[]> {
  try {
    const q = query(
      collection(db, 'orders'),
      where('sellerId', '==', retailerId),
      where('sellerType', '==', 'retailer')
    );
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return docs.sort((a: any, b: any) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
  } catch (error) {
    console.error('Error fetching retailer orders:', error);
    throw error;
  }
}

export async function fetchRetailerInventory(retailerId: string): Promise<any[]> {
  try {
    const q = query(collection(db, 'products'), where('retailerId', '==', retailerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching retailer inventory:', error);
    throw error;
  }
}

import { parseVariantWeightKg } from "./utils/weight";

async function fetchSellerGstin(
  sellerId: string,
  sellerType: SellerType,
  directPhone?: string,
): Promise<string | null> {
  try {
    let phone: string | null = directPhone || null;
    if (!phone) {
      const idxSnap = await getDoc(doc(db, "uidIndex", sellerId));
      phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
    }
    if (!phone && /^(\+91)?[6-9]\d{9}$/.test(sellerId.replace(/\s/g, ""))) {
      phone = sellerId;
    }
    const col = sellerType === "manufacturer" ? "manufacturers" : "retailers";
    const docId = phone || sellerId;
    const sellerSnap = await getDoc(doc(db, col, docId));
    if (sellerSnap.exists()) {
      const g = String(sellerSnap.data().gstin ?? "").trim();
      return g || null;
    }
  } catch { /* silent */ }
  return null;
}

/**
 * Resolves the delivery charge for a seller given total cart weight.
 *
 * Phone resolution order:
 *  1. `directPhone` argument (from CartItem.sellerPhone — most reliable)
 *  2. `uidIndex/{sellerId}` lookup (when sellerId is a Firebase Auth UID)
 *  3. sellerId treated as phone directly (when store.id is the phone)
 */
async function fetchSellerDeliveryCharge(
  sellerId: string,
  totalWeightKg: number,
  directPhone?: string,
): Promise<number> {
  try {
    // Resolve seller phone using the three-path strategy
    let phone: string | null = directPhone || null;

    if (!phone) {
      const idxSnap = await getDoc(doc(db, "uidIndex", sellerId));
      phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
    }

    // Fallback: sellerId may already be the phone (retailers keyed by phone)
    if (!phone && /^(\+91)?[6-9]\d{9}$/.test(sellerId.replace(/\s/g, ""))) {
      phone = sellerId;
    }

    if (!phone) return 0;

    const settingsSnap = await getDoc(doc(db, "deliverySettings", phone));
    if (!settingsSnap.exists()) return 0;

    const slabs = settingsSnap.data().weightSlabs as
      | { minKg: number; maxKg: number; charge: number }[]
      | undefined;
    if (!slabs?.length) return 0;

    const sorted = [...slabs].sort((a, b) => a.minKg - b.minKg);
    for (const slab of sorted) {
      if (totalWeightKg >= slab.minKg && totalWeightKg < slab.maxKg) return slab.charge;
    }
    // Open-ended last slab (covers weights above all configured maxKg values)
    const last = sorted[sorted.length - 1];
    if (last && totalWeightKg >= last.minKg) return last.charge;
  } catch { /* silent */ }
  return 0;
}

export async function createOrdersFromCart(params: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: CartItem[];
  payment?: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    amount: number;
    status: "paid";
    paidAt: string;
  };
}): Promise<string[]> {
  const { customerId, customerName, customerPhone, customerAddress, items, payment } = params;
  if (!items.length) return [];

  const groups = new Map<string, CartItem[]>();
  items.forEach((item) => {
    if (item.sellMode !== "online_delivery" || !item.sellerId) return;
    const key = `${item.sellerType}:${item.sellerId}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  });

  const createdOrderIds: string[] = [];

  for (const [key, groupItems] of Array.from(groups.entries())) {
    const [sellerType, sellerId] = key.split(":") as [SellerType, string];

    const normalizedItems = groupItems.map((item) => {
      const lineTotal = Number((item.price * item.qty).toFixed(2));
      const gstApplicable = item.gstApplicable === true && !!item.gstRate;
      const gstAmount = gstApplicable ? Number((item.price * (item.gstRate as number) / 100).toFixed(2)) : 0;
      const base: Record<string, unknown> = {
        productId: item.productId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        lineTotal,
        ...(item.variantUnit ? { variantUnit: item.variantUnit } : {}),
        ...(gstApplicable ? { gstApplicable: true, gstRate: item.gstRate, gstAmount } : {}),
      };
      if (item.discountPct && item.discountPct > 0 && item.originalPrice) {
        base.originalPrice = item.originalPrice;
        base.discountPct   = item.discountPct;
      }
      return base;
    });

    const subtotal = Number(
      normalizedItems.reduce((sum, row) => sum + (row.lineTotal as number), 0).toFixed(2)
    );
    const mrpSubtotal = Number(
      groupItems.reduce((sum, item) => {
        const mrp = (item.originalPrice && item.originalPrice > 0) ? item.originalPrice : item.price;
        return sum + mrp * item.qty;
      }, 0).toFixed(2)
    );
    const totalSavings = Number(
      groupItems.reduce((sum, item) => {
        if (!item.discountPct || !item.originalPrice) return sum;
        return sum + (item.originalPrice - item.price) * item.qty;
      }, 0).toFixed(2)
    );
    const totalGst = Number(
      normalizedItems.reduce((sum, row) => {
        const gstAmt = (row.gstAmount as number | undefined) ?? 0;
        return sum + gstAmt * (row.qty as number);
      }, 0).toFixed(2)
    );

    const totalWeightKg = Number(
      groupItems
        .reduce((sum, item) => sum + item.qty * parseVariantWeightKg(item.variantUnit), 0)
        .toFixed(3),
    );

    // Use the phone stored on CartItems (avoids UID→phone round-trip that fails
    // when the seller's document ID is already their phone).
    const sellerPhoneHint = groupItems[0]?.sellerPhone;

    const [deliveryCharge, sellerGstNumber] = await Promise.all([
      fetchSellerDeliveryCharge(sellerId, totalWeightKg, sellerPhoneHint),
      fetchSellerGstin(sellerId, sellerType, sellerPhoneHint),
    ]);

    const grandTotal = Number((subtotal + deliveryCharge + totalGst).toFixed(2));
    const sellerName = groupItems[0]?.sellerName ?? "";

    // Derive invoiceNumber from the document ref ID (generated before addDoc)
    const orderRef = doc(collection(db, "orders"));
    const invoiceNumber = `INV-${orderRef.id.slice(0, 8).toUpperCase()}`;

    await setDoc(orderRef, {
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      sellerId,
      sellerType,
      ...(sellerName ? { sellerName } : {}),
      ...(sellerGstNumber ? { sellerGstNumber } : {}),
      items: normalizedItems,
      mrpSubtotal,
      subtotal,
      ...(totalSavings > 0 ? { totalSavings } : {}),
      ...(totalGst > 0 ? { totalGst } : {}),
      deliveryCharge,
      grandTotal,
      totalWeightKg,
      invoiceNumber,
      deliveryMode: "delivery",
      status: "placed",
      ...(payment ? { payment } : {}),
      statusHistory: [{ status: "placed", at: new Date().toISOString() }] as StatusHistoryEntry[],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    createdOrderIds.push(orderRef.id);
  }

  return createdOrderIds;
}

export async function fetchIncomingOrdersForSeller(
  sellerId: string,
  sellerType: SellerType
): Promise<OrderDoc[]> {
  const q = query(
    collection(db, "orders"),
    where("sellerId", "==", sellerId),
    where("sellerType", "==", sellerType)
  );
  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }));
  return docs.sort((a, b) => {
    const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
    const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await updateDoc(doc(db, "orders", orderId), {
    status,
    statusHistory: arrayUnion({ status, at: new Date().toISOString() } as StatusHistoryEntry),
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrderPayment(orderId: string, paymentInfo: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  amount: number;
}): Promise<void> {
  await updateDoc(doc(db, "orders", orderId), {
    payment: {
      razorpayOrderId: paymentInfo.razorpayOrderId,
      razorpayPaymentId: paymentInfo.razorpayPaymentId,
      razorpaySignature: paymentInfo.razorpaySignature,
      status: "paid",
      amount: paymentInfo.amount,
      paidAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
}



export async function fetchOrdersForCustomer(customerId: string): Promise<OrderDoc[]> {
  const q = query(
    collection(db, "orders"),
    where("customerId", "==", customerId),
  );
  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }));
  return docs.sort((a, b) => {
    const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
    const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

export async function fetchStoreOnlineDelivery(phone: string): Promise<boolean> {
  if (!phone) return false;
  try {
    const retailerSnap = await getDoc(doc(db, "retailers", phone));
    if (retailerSnap.exists()) return !!(retailerSnap.data() as any).onlineDelivery;
    const mfrSnap = await getDoc(doc(db, "manufacturers", phone));
    if (mfrSnap.exists()) return !!(mfrSnap.data() as any).onlineDelivery;
  } catch { /* silent fail */ }
  return false;
}

export async function addDealerToContacts(manufacturerId: string, dealerId: string) {
  const dealerDoc = await getDoc(doc(db, 'users', dealerId));
  if (!dealerDoc.exists()) throw new Error('Dealer not found');
  
  const dealerData = dealerDoc.data();
  
  await addDoc(collection(db, 'manufacturer_contacts'), {
    manufacturerId,
    dealerId,
    dealerName: dealerData.name,
    shopName: dealerData.shopName || 'N/A',
    addedAt: serverTimestamp()
  });
}

export async function fetchManufacturerContacts(manufacturerId: string): Promise<any[]> {
  try {
    const q = query(collection(db, 'manufacturer_contacts'), where('manufacturerId', '==', manufacturerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching manufacturer contacts:', error);
    throw error;
  }
}

import { Hub, INITIAL_HUBS } from './initialHubs';

export type { Hub };

export async function syncInitialData(products: any[], stores: any[], inventory: any[] = []) {
  // Sync products
  try {
    const productsSnap = await getDocs(collection(db, 'products'));
    if (productsSnap.empty) {
      console.log('Firebase: Syncing initial products...');
      for (const product of products) {
        await addDoc(collection(db, 'products'), {
          ...product,
          createdAt: serverTimestamp(),
          source: 'initial_sync'
        });
      }
    }
  } catch (error) {
    console.warn('Firebase: Syncing initial products failed:', error);
  }

  // Sync stores
  try {
    const storesSnap = await getDocs(collection(db, 'stores'));
    if (storesSnap.empty) {
      console.log('Firebase: Syncing initial stores...');
      for (const store of stores) {
        await addDoc(collection(db, 'stores'), {
          ...store,
          createdAt: serverTimestamp(),
          source: 'initial_sync'
        });
      }
    }
  } catch (error) {
    console.warn('Firebase: Syncing initial stores failed:', error);
  }

  // Sync inventory
  try {
    const inventorySnap = await getDocs(collection(db, 'inventory'));
    if (inventorySnap.empty && inventory.length > 0) {
      console.log('Firebase: Syncing initial inventory...');
      for (const item of inventory) {
        await addDoc(collection(db, 'inventory'), {
          ...item,
          createdAt: serverTimestamp(),
          source: 'initial_sync'
        });
      }
    }
  } catch (error) {
    console.warn('Firebase: Syncing initial inventory failed:', error);
  }

  // Sync hubs
  try {
    const hubsSnap = await getDocs(collection(db, 'hubs'));
    if (hubsSnap.empty) {
      console.log('Firebase: Syncing initial hubs...');
      for (const hub of INITIAL_HUBS) {
        const { id, ...hubData } = hub;
        await setDoc(doc(db, 'hubs', id), {
          ...hubData,
          createdAt: serverTimestamp(),
          source: 'initial_sync'
        });
      }
    }
  } catch (error) {
    console.warn('Firebase: Syncing initial hubs failed:', error);
  }
}


function getLocalDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function trackPageView(page: string = 'home') {
  try {
    const dayKey = getLocalDayKey();
    const ref = doc(db, 'siteVisits', dayKey);
    await setDoc(ref, {
      date: dayKey,
      total: increment(1),
      [`pages.${page}`]: increment(1),
    }, { merge: true });
  } catch {
    // silent fail
  }
}

export async function trackProductImpression(productId: string, position: number) {
  try {
    const ref = doc(db, 'products', productId);
    const dayKey = getLocalDayKey();
    await updateDoc(ref, {
      impressions: increment(1),
      positionSum: increment(position),
      [`impressionsByDay.${dayKey}`]: increment(1),
    });
  } catch (error) {
    // Silent fail for analytics
    console.warn('Impression track failed', error);
  }
}

export async function trackProductClick(productId: string) {
  try {
    const ref = doc(db, 'products', productId);
    const dayKey = getLocalDayKey();
    await updateDoc(ref, {
      clicks: increment(1),
      [`clicksByDay.${dayKey}`]: increment(1),
    });
  } catch (error) {
    // Silent fail for analytics
    console.warn('Click track failed', error);
  }
}

export async function trackStoreCall(productId: string) {
  try {
    const ref = doc(db, 'products', productId);
    const dayKey = getLocalDayKey();
    await updateDoc(ref, {
      calls: increment(1),
      [`callsByDay.${dayKey}`]: increment(1),
    });
  } catch (error) {
    console.warn('Call track failed', error);
  }
}

export async function trackDirectionRequest(productId: string) {
  try {
    const ref = doc(db, 'products', productId);
    const dayKey = getLocalDayKey();
    await updateDoc(ref, {
      directionRequests: increment(1),
      [`directionRequestsByDay.${dayKey}`]: increment(1),
    });
  } catch (error) {
    console.warn('Direction request track failed', error);
  }
}

export async function fetchHubs(): Promise<Hub[]> {
  try {
    const snapshot = await getDocs(collection(db, 'hubs'));
    if (snapshot.empty) {
      console.log('Firebase: Hubs collection is empty. Seeding initial hubs...');
      try {
        for (const hub of INITIAL_HUBS) {
          const { id, ...hubData } = hub;
          await setDoc(doc(db, 'hubs', id), {
            ...hubData,
            createdAt: serverTimestamp(),
            source: 'initial_sync'
          });
        }
        const newSnapshot = await getDocs(collection(db, 'hubs'));
        return newSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Hub));
      } catch (seedError) {
        console.warn('Firebase: Seeding initial hubs failed (likely permission denied). Falling back to local INITIAL_HUBS:', seedError);
        return INITIAL_HUBS;
      }
    }
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Hub));
  } catch (error) {
    console.error('Error fetching hubs:', error);
    throw error;
  }
}

// ─── Admin functions ──────────────────────────────────────────────────────────

export async function fetchAllUsers(): Promise<any[]> {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export type StoreAutocompleteOption = {
  phone: string;
  shopName: string;
  ownerName: string;
  address: string;
  lat: number;
  lng: number;
};

export async function fetchRetailerProfiles(): Promise<StoreAutocompleteOption[]> {
  const q = query(collection(db, 'users'), where('role', '==', 'retailer'));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        phone: d.id,
        shopName: data.shopName || data.businessName || data.name || d.id,
        ownerName: data.name || '',
        address: [data.address, data.city, data.state, data.pincode].filter(Boolean).join(', '),
        lat: data.latitude ? Number(data.latitude) : 0,
        lng: data.longitude ? Number(data.longitude) : 0,
      };
    })
    .filter(r => r.shopName && r.address);
}

export async function fetchAllRetailers(): Promise<any[]> {
  const snapshot = await getDocs(collection(db, 'retailers'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchAllPayments(): Promise<any[]> {
  const snapshot = await getDocs(collection(db, 'payments'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function promoteToAdmin(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { role: 'admin', isPaid: true, updatedAt: serverTimestamp() }, { merge: true });
}

export async function adminUpdateUser(uid: string, updates: {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isPaid?: boolean;
  productCount?: number;
  subscriptionStatus?: string;
  shopName?: string;
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  socialLinks?: { instagram?: string; facebook?: string; whatsapp?: string; youtube?: string };
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.email !== undefined) payload.email = updates.email.trim().toLowerCase();
  if (updates.phone !== undefined) payload.phone = updates.phone.trim();
  if (updates.role !== undefined) {
    payload.role = updates.role;
    if (updates.role === 'admin') payload.isPaid = true;
  }
  if (updates.isPaid !== undefined) payload.isPaid = updates.isPaid;
  if (updates.productCount !== undefined) payload.productCount = Number(updates.productCount);
  if (updates.subscriptionStatus !== undefined) payload.subscriptionStatus = updates.subscriptionStatus;
  if (updates.shopName !== undefined) payload.shopName = updates.shopName.trim();
  if (updates.businessName !== undefined) payload.businessName = updates.businessName.trim();
  if (updates.address !== undefined) payload.address = updates.address.trim();
  if (updates.city !== undefined) payload.city = updates.city.trim();
  if (updates.state !== undefined) payload.state = updates.state.trim();
  if (updates.pincode !== undefined) payload.pincode = updates.pincode.trim();
  if (updates.socialLinks !== undefined) payload.socialLinks = updates.socialLinks;
  if (updates.latitude !== undefined) payload.latitude = updates.latitude;
  if (updates.longitude !== undefined) payload.longitude = updates.longitude;
  
  // 1. Update users/{uid}
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, payload, { merge: true });

  // 2. Fetch current user data to see current role & phone
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const userData = userSnap.data();
    const role = updates.role || userData.role;
    const phone = updates.phone || userData.phone || (uid.startsWith('+') ? uid : '');
    const userAuthUid = userData.uid || (uid.startsWith('+') ? '' : uid);

    if (role === 'retailer' || role === 'manufacturer') {
      const isRetailer = role === 'retailer';
      const profileCol = isRetailer ? 'retailers' : 'manufacturers';
      const profileDocId = isRetailer ? (userAuthUid || phone || uid) : (phone || userAuthUid || uid);

      if (profileDocId) {
        const profileRef = doc(db, profileCol, profileDocId);
        const profileUpdates: Record<string, any> = {
          updatedAt: serverTimestamp(),
        };

        if (updates.name !== undefined) profileUpdates.ownerName = updates.name.trim();
        if (updates.phone !== undefined) profileUpdates.phone = updates.phone.trim();
        if (updates.email !== undefined) profileUpdates.email = updates.email.trim();

        if (isRetailer) {
          if (updates.shopName !== undefined) profileUpdates.shopName = updates.shopName.trim();
        } else {
          if (updates.businessName !== undefined) profileUpdates.businessName = updates.businessName.trim();
        }

        if (updates.address !== undefined || updates.city !== undefined || updates.state !== undefined || updates.pincode !== undefined) {
          const existingSnap = await getDoc(profileRef);
          const existingData = existingSnap.exists() ? existingSnap.data() : {};
          const existingAddr = existingData.address || {};

          profileUpdates.address = {
            line1: updates.address !== undefined ? updates.address.trim() : (existingAddr.line1 || ''),
            city: updates.city !== undefined ? updates.city.trim() : (existingAddr.city || ''),
            state: updates.state !== undefined ? updates.state.trim() : (existingAddr.state || ''),
            pincode: updates.pincode !== undefined ? updates.pincode.trim() : (existingAddr.pincode || ''),
          };
        }

        if (updates.latitude !== undefined && updates.longitude !== undefined && updates.latitude !== null && updates.longitude !== null) {
          profileUpdates.geo = new GeoPoint(updates.latitude, updates.longitude);
        }

        if (updates.socialLinks !== undefined) {
          profileUpdates.socialLinks = updates.socialLinks;
        }

        await setDoc(profileRef, profileUpdates, { merge: true });
      }

      // Sync to profiles/{phone}
      if (phone) {
        const globalProfileRef = doc(db, 'profiles', phone);
        const globalUpdates: Record<string, any> = {
          phone,
          role,
          updatedAt: serverTimestamp(),
        };

        if (updates.name !== undefined) globalUpdates.ownerName = updates.name.trim();
        if (isRetailer) {
          if (updates.shopName !== undefined) {
            globalUpdates.shopName = updates.shopName.trim();
            globalUpdates.businessName = updates.shopName.trim();
          }
        } else {
          if (updates.businessName !== undefined) globalUpdates.businessName = updates.businessName.trim();
        }

        if (updates.email !== undefined) globalUpdates.email = updates.email.trim();

        if (updates.address !== undefined || updates.city !== undefined || updates.state !== undefined || updates.pincode !== undefined) {
          const existingSnap = await getDoc(globalProfileRef);
          const existingData = existingSnap.exists() ? existingSnap.data() : {};
          const existingAddr = existingData.address || {};

          globalUpdates.address = {
            line1: updates.address !== undefined ? updates.address.trim() : (existingAddr.line1 || ''),
            city: updates.city !== undefined ? updates.city.trim() : (existingAddr.city || ''),
            state: updates.state !== undefined ? updates.state.trim() : (existingAddr.state || ''),
            pincode: updates.pincode !== undefined ? updates.pincode.trim() : (existingAddr.pincode || ''),
          };
        }

        if (updates.latitude !== undefined && updates.longitude !== undefined && updates.latitude !== null && updates.longitude !== null) {
          globalUpdates.geo = new GeoPoint(updates.latitude, updates.longitude);
        }

        await setDoc(globalProfileRef, globalUpdates, { merge: true });
      }
    }
  }

}

export async function fetchAllSubscriptions(): Promise<any[]> {
  const snapshot = await getDocs(collection(db, 'subscriptions'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adminUpdateSubscriptionSeats(subId: string, userDocId: string, newSeats: number): Promise<void> {
  if (newSeats < 0) throw new Error('Seats cannot be negative.');
  const subRef = doc(db, 'subscriptions', subId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('Subscription not found.');
  await updateDoc(subRef, {
    seatsPurchased: newSeats,
    updatedAt: serverTimestamp(),
  });
  // Keep users.totalSeats in sync
  await setDoc(doc(db, 'users', userDocId), {
    totalSeats: newSeats,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function adminRevokeSubscription(userDocId: string): Promise<void> {
  await setDoc(doc(db, 'users', userDocId), {
    isPaid: false,
    subscriptionStatus: 'revoked',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function adminExtendSubscription(subId: string, userDocId: string, extraMonths: number): Promise<void> {
  const subRef = doc(db, 'subscriptions', subId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('Subscription not found.');
  const data = subSnap.data();
  const currentExpiry: Date = data.expiryDate?.toDate ? data.expiryDate.toDate() : new Date();
  const newExpiry = new Date(currentExpiry);
  newExpiry.setMonth(newExpiry.getMonth() + extraMonths);
  await setDoc(subRef, {
    expiryDate: Timestamp.fromDate(newExpiry),
    subscriptionStatus: 'active',
    durationMonths: (data.durationMonths || 0) + extraMonths,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await setDoc(doc(db, 'users', userDocId), {
    isPaid: true,
    subscriptionStatus: 'paid',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function adminManualActivate(
  userDocId: string,
  paymentId: string,
  orderId: string,
  seats: number,
  durationMonths: number,
): Promise<void> {
  const userRef = doc(db, 'users', userDocId);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const currentSeats = Number(userData.totalSeats) || 0;
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + durationMonths);
  const PRICE_PER_SEAT: Record<number, number> = { 1: 21, 3: 54, 6: 90, 12: 144 };
  const pricePerSeat = PRICE_PER_SEAT[durationMonths] ?? 21;
  const totalAmount = seats * pricePerSeat;
  const ts = serverTimestamp();

  await setDoc(userRef, {
    isPaid: true,
    subscriptionStatus: 'paid',
    totalSeats: currentSeats + seats,
    updatedAt: ts,
  }, { merge: true });

  await addDoc(collection(db, 'payments'), {
    userId: userDocId,
    userPhone: userDocId,
    amount: totalAmount,
    seatCount: seats,
    durationMonths,
    currency: 'INR',
    razorpayOrderId: orderId || null,
    razorpayPaymentId: paymentId,
    timestamp: ts,
    status: 'manual_admin',
  });

  const role = userData.role === 'manufacturer' ? 'manufacturer' : 'retailer';
  const authUid = (userData as any).uid || '';
  await addDoc(collection(db, 'subscriptions'), {
    ownerId: authUid || userDocId,
    ownerPhone: userDocId,
    ownerType: role,
    planName: 'Standard',
    seatsPurchased: seats,
    durationMonths,
    amountPaid: totalAmount,
    currency: 'INR',
    razorpayOrderId: orderId || null,
    razorpayPaymentId: paymentId,
    subscriptionStatus: 'active',
    startDate: Timestamp.fromDate(now),
    expiryDate: Timestamp.fromDate(expiry),
    activatedByAdmin: true,
    createdAt: ts,
    updatedAt: ts,
  });
}

/**
 * Lists every document in the `products` collection for the admin management table.
 *
 * Unlike fetchMarketplaceProducts() (which is the farmer-facing feed and therefore
 * dedups by name, requires a top-level `image`, and hides assigned/inventory copies),
 * the admin needs to see and manage every product doc individually. So this does NO
 * dedup, NO source exclusion, and NO image requirement. Sorted newest-first.
 */
export async function fetchAllProductsForAdmin(): Promise<MarketplaceProduct[]> {
  const snapshot = await getDocs(collection(db, 'products'));
  return snapshot.docs
    .map((item) => {
      const data = item.data();
      const images = Array.isArray(data.images) ? data.images : undefined;
      const ts = (data.updatedAt ?? data.createdAt) as { toMillis?: () => number } | undefined;
      return {
        id: item.id,
        name: String(data.name || ''),
        fullName: data.fullName ? String(data.fullName) : undefined,
        price: Number(data.price || 0),
        category: String(data.category || 'general'),
        description: String(data.description || ''),
        image: String(data.image || (images?.[0] ?? '')),
        images,
        stock: String(data.stock || 'In Stock'),
        store: String(data.store || ''),
        distance: String(data.distance || 'Nearby'),
        source: data.source ? String(data.source) : undefined,
        _sort: ts?.toMillis?.() ?? 0,
      } as MarketplaceProduct & { _sort: number };
    })
    .sort((a, b) => b._sort - a._sort)
    .map(({ _sort, ...rest }) => rest as MarketplaceProduct);
}

export async function adminCreateProduct(product: Omit<MarketplaceProduct, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'products'), {
    ...product,
    source: 'admin',
    // Mark active so the product surfaces in every isActive-filtered query
    // (assignment dropdown, marketplace feeds, etc.), not just the admin table.
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function adminUpdateProduct(productId: string, product: Partial<MarketplaceProduct>): Promise<void> {
  await setDoc(doc(db, 'products', productId), { ...product, updatedAt: serverTimestamp() }, { merge: true });
}

export async function adminDeleteProduct(productId: string): Promise<void> {
  await deleteDoc(doc(db, 'products', productId));
}

// ─── Admin → Seller product assignment ──────────────────────────────────────
// Centralized here so Users & Roles and the Products page share one implementation.

export type SellerRole = 'retailer' | 'manufacturer';

/**
 * Ensures a seller has an active storefront record in `retailers`/`manufacturers`
 * (keyed by phone). Without it the seller never appears in `fetchStores()` and
 * their assigned products have no store to attach to. Idempotent: skips the write
 * if an active record already exists; otherwise creates/merges one. Safe to call
 * from the admin (rules allow `isAdmin()` / `isAuthed()` on these collections).
 */
export async function ensureSellerStorefront(seller: {
  phone?: string; id?: string; uid?: string | null; role?: string;
  name?: string; shopName?: string; businessName?: string;
  address?: string; city?: string; state?: string; pincode?: string;
  latitude?: number | null; longitude?: number | null;
  createdByAdmin?: string;
}): Promise<void> {
  const role = seller.role;
  if (role !== 'retailer' && role !== 'manufacturer') return;
  const phone = seller.phone || seller.id;
  if (!phone) return;

  const ref = doc(db, role === 'retailer' ? 'retailers' : 'manufacturers', phone);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.active === true) return; // already live

  const idVal = seller.uid || phone;
  const now = serverTimestamp();
  const common: Record<string, unknown> = {
    phone,
    ownerName: (seller.name || '').trim(),
    address: (seller.address || '').trim(),
    city: (seller.city || '').trim(),
    state: (seller.state || '').trim(),
    pincode: (seller.pincode || '').trim(),
    active: true,
    updatedAt: now,
    ...(seller.createdByAdmin ? { preCreatedByAdmin: seller.createdByAdmin } : {}),
    ...(snap.exists() ? {} : { createdAt: now }),
  };

  if (role === 'retailer') {
    await setDoc(ref, {
      ...common,
      userId: idVal,
      retailerId: idVal,
      shopName: (seller.shopName || seller.businessName || seller.name || '').trim(),
      status: 'active',
      userType: 'retailer',
      location: { latitude: seller.latitude ?? 0, longitude: seller.longitude ?? 0 },
      products: [],
    }, { merge: true });
  } else {
    await setDoc(ref, {
      ...common,
      uid: seller.uid ?? null,
      userId: idVal,
      manufacturerId: idVal,
      businessName: (seller.businessName || seller.shopName || seller.name || '').trim(),
    }, { merge: true });
  }
}

/**
 * Resolves a seller's latest ACTIVE subscription expiry date (by phone), or null
 * if they have no active subscription. Used to expire admin-created seat listings
 * in lockstep with the seller's plan. Reads only — admin is permitted on the
 * subscriptions collection. Non-fatal: any error resolves to null so assignment
 * still proceeds with the caller's fallback expiry.
 */
async function resolveSellerSubscriptionExpiry(sellerPhone: string): Promise<Date | null> {
  try {
    const [byPhone, byId] = await Promise.all([
      getDocs(query(collection(db, 'subscriptions'), where('ownerPhone', '==', sellerPhone))),
      getDocs(query(collection(db, 'subscriptions'), where('ownerId', '==', sellerPhone))),
    ]);
    const now = Date.now();
    let maxMs = 0;
    const consider = (data: Record<string, unknown>) => {
      const status = data.subscriptionStatus;
      if (status === 'expired' || status === 'cancelled') return;
      const exp = data.expiryDate as Timestamp | undefined;
      const ms = exp?.toMillis?.() ?? 0;
      if (ms > now && ms > maxMs) maxMs = ms;
    };
    byPhone.forEach((d) => consider(d.data() as Record<string, unknown>));
    byId.forEach((d) => consider(d.data() as Record<string, unknown>));
    return maxMs > 0 ? new Date(maxMs) : null;
  } catch {
    return null;
  }
}

/**
 * Assigns a marketplace product to a seller by creating a seller-owned copy in
 * `products` plus an `inventory` record, and an `adminLogs` audit entry.
 *
 * Idempotent: if the seller already has an active copy of this product
 * (matched by originalProductId + ownership), no new copy is created and
 * `{ alreadyAssigned: true }` is returned — this prevents the duplicate copies
 * that previously inflated a seller's product list.
 */
export async function adminAssignProductToSeller(
  productId: string,
  productName: string,
  sellerPhone: string,
  sellerName: string,
  sellerRole: SellerRole,
  adminUid: string,
): Promise<{ alreadyAssigned: boolean; copyProductId?: string }> {
  const productSnap = await getDoc(doc(db, 'products', productId));
  if (!productSnap.exists()) throw new Error('Product not found.');

  // Duplicate guard: already assigned an active copy of this product to this seller?
  const existing = await getDocs(query(
    collection(db, 'products'),
    where('originalProductId', '==', productId),
    where('ownerId', '==', sellerPhone),
  ));
  if (existing.docs.some(d => d.data().isActive !== false)) {
    return { alreadyAssigned: true };
  }

  const src = productSnap.data() as Record<string, unknown>;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  // Set this seller's ownership ids and clear the opposite role's ids (use null,
  // never undefined — the Firestore SDK rejects undefined field values, and ...src
  // may carry a stale manufacturerId/retailerId from the source product).
  const roleFields = sellerRole === 'retailer'
    ? { retailerId: sellerPhone, retailerPhone: sellerPhone, manufacturerId: null, manufacturerPhone: null }
    : { manufacturerId: sellerPhone, manufacturerPhone: sellerPhone, retailerId: null, retailerPhone: null };

  const copyRef = doc(collection(db, 'products'));
  batch.set(copyRef, {
    ...src,
    id: copyRef.id,
    ownerId: sellerPhone,
    ownerPhone: sellerPhone,
    ownerType: sellerRole,
    ...roleFields,
    store: sellerName,
    source: 'admin_assigned',
    isActive: true,
    // Live and in-stock immediately so the product is testable without the
    // seller logging in to set stock/availability themselves.
    stock: 'In Stock',
    // Point availability at THIS seller's store (replacing any inherited from the
    // source product) so the copy is matched to the seller's storefront in the
    // marketplace and store-detail views.
    availability: [{
      storeId: sellerPhone,
      storePhone: sellerPhone,
      storeName: sellerName,
      stockLevel: 'In Stock',
      sellingPrice: Number(src.price ?? 0),
      isOnline: src.isOnline === true || src.sellMode === 'online_delivery',
    }],
    assignedByAdmin: adminUid,
    assignedAt: now,
    originalProductId: productId,
    createdAt: now,
    updatedAt: now,
  });

  const invRef = doc(collection(db, 'inventory'));
  batch.set(invRef, {
    id: invRef.id,
    ownerId: sellerPhone,
    ownerPhone: sellerPhone,
    ownerType: sellerRole,
    productId: copyRef.id,
    originalProductId: productId,
    stockQuantity: 50,
    sellingPrice: Number(src.price ?? 0),
    reorderThreshold: 5,
    isAvailable: true,
    assignedByAdmin: adminUid,
    updatedAt: now,
  });

  // Seat listing — an admin-assigned product occupies the seller's catalogue space
  // exactly like an own product, so it must consume a listing seat. The seller's
  // Inventory page counts active retailerSeatListings (not inventory rows), so
  // without this the counter never moves. Keyed by sellerPhone as ownerId so the
  // seller's phone-aware fetchSeatListingsForOwner finds it; listingType "own"
  // because the seat belongs to the seller. expiresAt tracks the seller's active
  // subscription so the seat frees with their plan (1-month fallback if none).
  const sellerSubExpiry = await resolveSellerSubscriptionExpiry(sellerPhone);
  const seatExpiry = sellerSubExpiry ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const seatRef = doc(collection(db, 'retailerSeatListings'));
  batch.set(seatRef, {
    ownerId: sellerPhone,
    ownerPhone: sellerPhone,
    ownerType: sellerRole,
    manufacturerId: null,
    manufacturerPhone: null,
    retailerDocId: null,
    retailerId: null,
    retailerPhone: sellerRole === 'retailer' ? sellerPhone : null,
    productId: copyRef.id,
    manufacturerProductId: null,
    listingType: 'own',
    status: 'active',
    assignedByAdmin: adminUid,
    assignedAt: now,
    expiresAt: Timestamp.fromDate(seatExpiry),
    releasedAt: null,
  });

  batch.set(doc(collection(db, 'adminLogs')), {
    action: 'admin_assign_product',
    productId,
    productName,
    copyProductId: copyRef.id,
    inventoryId: invRef.id,
    seatListingId: seatRef.id,
    sellerPhone,
    sellerName,
    sellerRole,
    performedBy: adminUid,
    createdAt: now,
  });

  await batch.commit();

  // Make sure the seller has a live storefront so the assigned product is visible.
  await ensureSellerStorefront({ phone: sellerPhone, role: sellerRole, name: sellerName, shopName: sellerName })
    .catch(err => console.error('ensureSellerStorefront failed', err));

  return { alreadyAssigned: false, copyProductId: copyRef.id };
}

/**
 * Reverses an assignment: deactivates the seller's product copy and its
 * inventory record (looked up by productId), and logs the removal. Only used
 * for admin-assigned copies — never deletes a seller's self-created products.
 */
export async function adminRemoveAssignment(
  copyProductId: string,
  productName: string,
  sellerPhone: string,
  adminUid: string,
): Promise<void> {
  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, 'products', copyProductId), { isActive: false, updatedAt: now });

  const invSnap = await getDocs(query(
    collection(db, 'inventory'),
    where('productId', '==', copyProductId),
  ));
  invSnap.forEach(d => batch.update(d.ref, { isAvailable: false, updatedAt: now }));

  // Release the seat listing created at assignment time so the seller's seat frees.
  const seatSnap = await getDocs(query(
    collection(db, 'retailerSeatListings'),
    where('productId', '==', copyProductId),
  ));
  seatSnap.forEach(d => {
    if ((d.data() as Record<string, unknown>).status === 'active') {
      batch.update(d.ref, { status: 'released', releasedAt: now });
    }
  });

  batch.set(doc(collection(db, 'adminLogs')), {
    action: 'admin_remove_assignment',
    copyProductId,
    inventoryId: invSnap.docs[0]?.id ?? null,
    seatListingId: seatSnap.docs[0]?.id ?? null,
    productName,
    sellerPhone,
    performedBy: adminUid,
    createdAt: now,
  });
  await batch.commit();
}

/**
 * Updates a single seller's assignment pricing/stock from the admin Products tab.
 * Syncs both the seller's product copy (price, stock label, availability[0]) and
 * its inventory record(s) so the marketplace and that store reflect the change.
 */
export async function adminUpdateAssignmentPricing(
  copyProductId: string,
  patch: { sellingPrice: number; stockQuantity: number },
): Promise<void> {
  const now = serverTimestamp();
  const inStock = patch.stockQuantity > 0;
  const stockLabel = inStock ? 'In Stock' : 'Out of Stock';

  const pRef = doc(db, 'products', copyProductId);
  const pSnap = await getDoc(pRef);
  const data = (pSnap.exists() ? pSnap.data() : {}) as Record<string, any>;
  const av = Array.isArray(data.availability) && data.availability.length
    ? data.availability.map((a: any, i: number) =>
        i === 0 ? { ...a, sellingPrice: patch.sellingPrice, stockLevel: stockLabel } : a)
    : [{
        storeId: data.ownerId ?? data.retailerId ?? null,
        storePhone: data.retailerPhone ?? data.ownerPhone ?? null,
        storeName: data.store ?? null,
        stockLevel: stockLabel,
        sellingPrice: patch.sellingPrice,
      }];

  await updateDoc(pRef, {
    price: patch.sellingPrice,
    stock: stockLabel,
    availability: av,
    updatedAt: now,
  });

  const invSnap = await getDocs(query(collection(db, 'inventory'), where('productId', '==', copyProductId)));
  if (!invSnap.empty) {
    const batch = writeBatch(db);
    invSnap.forEach(d => batch.update(d.ref, {
      sellingPrice: patch.sellingPrice,
      stockQuantity: patch.stockQuantity,
      isAvailable: inStock,
      updatedAt: now,
    }));
    await batch.commit();
  }
}

/** Loads inventory (price + stock) for a set of product copies, keyed by productId. */
export async function fetchInventoryForProducts(
  productIds: string[],
): Promise<Record<string, { id: string; sellingPrice: number; stockQuantity: number }>> {
  const out: Record<string, { id: string; sellingPrice: number; stockQuantity: number }> = {};
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    if (!chunk.length) continue;
    const snap = await getDocs(query(collection(db, 'inventory'), where('productId', 'in', chunk)));
    snap.forEach(d => {
      const x = d.data() as Record<string, unknown>;
      out[String(x.productId)] = {
        id: d.id,
        sellingPrice: Number(x.sellingPrice ?? 0),
        stockQuantity: Number(x.stockQuantity ?? 0),
      };
    });
  }
  return out;
}

export type UserProduct = MarketplaceProduct & {
  /** How many raw product docs collapsed into this entry. */
  copies: number;
  /** All doc ids collapsed into this entry (admin can remove any of them). */
  docIds: string[];
  /** Subset of docIds that are admin-assigned copies. */
  assignedDocIds: string[];
};

type RawProductDoc = Record<string, unknown> & { id: string };

/** Every owner identifier a product doc can be keyed by. */
function productOwnerKeys(d: RawProductDoc): string[] {
  return [d.ownerId, d.retailerId, d.manufacturerId, d.ownerPhone, d.retailerPhone, d.manufacturerPhone]
    .filter(Boolean)
    .map(String);
}

/** Fetches every product doc once (raw, with ownership fields) for client-side indexing. */
export async function fetchAllSellerProducts(): Promise<RawProductDoc[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
}

/** Selects the product docs owned by a user, matching by uid AND phone. */
export function selectUserProductDocs(
  all: RawProductDoc[],
  user: { id?: string; uid?: string | null; phone?: string },
): RawProductDoc[] {
  const keys = new Set([user.uid, user.phone, user.id].filter(Boolean).map(String));
  if (keys.size === 0) return [];
  return all.filter(d => productOwnerKeys(d).some(k => keys.has(k)));
}

/**
 * Collapses raw product docs into de-duplicated display entries.
 * Docs representing the same product (same originalProductId, else lowercased
 * name) collapse into one row with a `copies` count, so re-assigned copies stop
 * appearing multiple times. Inactive docs (isActive === false) are dropped.
 */
export function collapseUserProductDocs(docs: RawProductDoc[]): UserProduct[] {
  const byId = new Map<string, RawProductDoc>();
  for (const d of docs) if (!byId.has(d.id)) byId.set(d.id, d);

  const groups = new Map<string, UserProduct>();
  for (const data of Array.from(byId.values())) {
    if (data.isActive === false) continue;
    const name = String(data.name ?? '');
    const groupKey = String(data.originalProductId ?? (name.toLowerCase().trim() || data.id));
    const isAssigned = data.source === 'admin_assigned';
    const existing = groups.get(groupKey);
    if (existing) {
      existing.copies += 1;
      existing.docIds.push(data.id);
      if (isAssigned) existing.assignedDocIds.push(data.id);
      continue;
    }
    const images = Array.isArray(data.images) ? (data.images as string[]) : undefined;
    groups.set(groupKey, {
      id: data.id,
      name,
      fullName: data.fullName ? String(data.fullName) : undefined,
      price: Number(data.price ?? 0),
      category: String(data.category ?? 'general'),
      description: String(data.description ?? ''),
      image: String(data.image ?? (images?.[0] ?? '')),
      images,
      stock: String(data.stock ?? 'In Stock'),
      store: String(data.store ?? ''),
      distance: String(data.distance ?? 'Nearby'),
      source: data.source ? String(data.source) : undefined,
      copies: 1,
      docIds: [data.id],
      assignedDocIds: isAssigned ? [data.id] : [],
    } as UserProduct);
  }

  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveHub(hub: Omit<Hub, 'id'>): Promise<string> {
  const id = hub.name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  await setDoc(doc(db, 'hubs', id), {
    ...hub,
    createdAt: serverTimestamp()
  });
  return id;
}

export async function updateHub(hubId: string, hub: Partial<Omit<Hub, 'id'>>): Promise<void> {
  await setDoc(doc(db, 'hubs', hubId), { ...hub, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteHub(hubId: string): Promise<void> {
  await deleteDoc(doc(db, 'hubs', hubId));
}

export async function importHubs(hubsList: Hub[]): Promise<void> {
  for (const hub of hubsList) {
    const { id, ...hubData } = hub;
    await setDoc(doc(db, 'hubs', id), {
      ...hubData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: 'admin_import'
    });
  }
}

// ─── Company Pages (Brand Pages) ──────────────────────────────────────────────
// Collection: companyPages/{companyId}
// Products:   companyProducts/{productId}  (field: companyId)
// Stores:     companyStores/{storeId}       (field: companyId)

export type CompanyPageDoc = {
  id: string;
  name: string;
  tagline: string;
  location: string;
  about: string;
  founded: string;
  website?: string;
  socialProof: string;
  certifications: string[];
  primaryColor: string;
  accentColor: string;
  phone?: string;
  email?: string;
  videos?: string[];
  ownerPhone?: string;        // phone of the assigned owner (THE LINK)
  heroImage?: string;
  logoUrl?: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    youtube?: string;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CompanyProduct = {
  id?: string;
  companyId: string;
  name: string;
  fullName?: string;
  price: number;
  oldPrice?: number;
  category: string;
  description: string;
  image: string;
  images?: string[];
  composition?: { name: string; value: string; color: string }[];
  benefits?: string[];
  application?: string;
  stock?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CompanyStore = {
  id?: string;
  companyId: string;
  name: string;
  ownerName?: string;
  phone?: string;
  address: string;
  status?: string;
  lat: number;
  lng: number;
  stock?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export async function fetchAllCompanyPages(): Promise<CompanyPageDoc[]> {
  const snap = await getDocs(collection(db, 'companyPages'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyPageDoc));
}

export async function fetchCompanyPageByOwnerPhone(phone: string): Promise<CompanyPageDoc | null> {
  const q = query(collection(db, 'companyPages'), where('ownerPhone', '==', phone));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CompanyPageDoc;
}

export async function fetchCompanyPageById(companyId: string): Promise<CompanyPageDoc | null> {
  const snap = await getDoc(doc(db, 'companyPages', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CompanyPageDoc;
}

export async function saveCompanyPage(companyId: string, data: Partial<CompanyPageDoc>): Promise<void> {
  const clean = stripUndefined(data as any);
  await setDoc(doc(db, 'companyPages', companyId), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
}

/** Admin: assign a phone number as the owner of a company page.
 *  Also writes ownerCompanyId to users/{phone} so the dashboard sidebar
 *  can detect ownership without an extra query. */
export async function assignCompanyOwner(companyId: string, ownerPhone: string): Promise<void> {
  const phone = ownerPhone.trim();
  // Write ownerPhone to the company doc
  await setDoc(doc(db, 'companyPages', companyId), {
    ownerPhone: phone,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  // Write ownerCompanyId back to the user doc so getUserProfile returns it
  if (phone) {
    await setDoc(doc(db, 'users', phone), {
      ownerCompanyId: companyId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

/** Admin: remove ownership from a company page. */
export async function removeCompanyOwner(companyId: string, previousPhone: string): Promise<void> {
  await setDoc(doc(db, 'companyPages', companyId), {
    ownerPhone: '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (previousPhone) {
    await setDoc(doc(db, 'users', previousPhone), {
      ownerCompanyId: '',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

// ── Company Products ───────────────────────────────────────────────────────────

export async function fetchCompanyProducts(companyId: string): Promise<CompanyProduct[]> {
  const q = query(collection(db, 'companyProducts'), where('companyId', '==', companyId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyProduct));
}

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [
        k,
        v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
          ? stripUndefined(v)
          : v,
      ])
  );
}

export async function saveCompanyProduct(product: Omit<CompanyProduct, 'id'>, productId?: string): Promise<string> {
  const clean = stripUndefined(product as any);
  if (productId) {
    await setDoc(doc(db, 'companyProducts', productId), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
    return productId;
  } else {
    const ref = await addDoc(collection(db, 'companyProducts'), { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  }
}

export async function deleteCompanyProduct(productId: string): Promise<void> {
  await deleteDoc(doc(db, 'companyProducts', productId));
}

// ── Company Stores ─────────────────────────────────────────────────────────────

export async function fetchCompanyStores(companyId: string): Promise<CompanyStore[]> {
  const q = query(collection(db, 'companyStores'), where('companyId', '==', companyId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyStore));
}

export async function saveCompanyStore(store: Omit<CompanyStore, 'id'>, storeId?: string): Promise<string> {
  const clean = stripUndefined(store as any);
  if (storeId) {
    await setDoc(doc(db, 'companyStores', storeId), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
    return storeId;
  } else {
    const ref = await addDoc(collection(db, 'companyStores'), { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  }
}

export async function fetchUserProfileByPhone(phone: string): Promise<Record<string, any> | null> {
  try {
    const snap = await getDoc(doc(db, 'users', phone));
    return snap.exists() ? (snap.data() as Record<string, any>) : null;
  } catch {
    return null;
  }
}

export type RetailerNetworkStore = {
  id: string;
  phone: string;
  name: string;
  ownerName: string;
  address: string;
  lat: number;
  lng: number;
  storePhone: string;
};

export async function fetchManufacturerNetworkStores(manufacturerPhone: string): Promise<RetailerNetworkStore[]> {
  try {
    const snap = await getDocs(collection(db, 'manufacturers', manufacturerPhone, 'retailers'));
    const activeMirrors = snap.docs.filter((d) => {
      const r = d.data();
      return (
        String(r.status ?? '') === 'active' &&
        String(r.onboardingStatus ?? 'active') !== 'pending'
      );
    });

    const profiles = await Promise.all(
      activeMirrors.map(async (d) => {
        const r = d.data();
        const mirrorAddr = r.address || {};
        const mirrorGeo = r.geo || {};
        const shopName = String(r.shopName ?? r.ownerName ?? '');
        const ownerName = String(r.ownerName ?? '');

        let addressStr = '';
        let lat = 0;
        let lng = 0;

        const retailerDocId = String(r.retailerDocId ?? d.id);
        try {
          const rSnap = await getDoc(doc(db, 'retailers', retailerDocId));
          if (rSnap.exists()) {
            const rd = rSnap.data();
            const rdAddr = rd.address || {};
            const rdGeo = rd.geo || {};

            addressStr = [
              rdAddr.line1 || mirrorAddr.line1,
              rdAddr.city || mirrorAddr.city,
              rdAddr.state || mirrorAddr.state,
              rdAddr.pincode || mirrorAddr.pincode
            ].filter(Boolean).join(', ');

            lat = Number(rdGeo.latitude ?? rdGeo.lat ?? mirrorGeo.latitude ?? mirrorGeo.lat ?? 0);
            lng = Number(rdGeo.longitude ?? rdGeo.lng ?? mirrorGeo.longitude ?? mirrorGeo.lng ?? 0);
          }
        } catch {
          // ignore and fall back to mirror
        }

        if (!addressStr) {
          addressStr = [
            mirrorAddr.line1,
            mirrorAddr.city,
            mirrorAddr.state,
            mirrorAddr.pincode
          ].filter(Boolean).join(', ');
        }
        if (lat === 0 && lng === 0) {
          lat = Number(mirrorGeo.latitude ?? mirrorGeo.lat ?? 0);
          lng = Number(mirrorGeo.longitude ?? mirrorGeo.lng ?? 0);
        }

        return {
          id: d.id,
          phone: d.id,
          name: shopName || d.id,
          ownerName,
          address: addressStr || '—',
          lat,
          lng,
          storePhone: r.retailerPhone || d.id,
        } as RetailerNetworkStore;
      })
    );
    return profiles;
  } catch (error) {
    console.error("Error in fetchManufacturerNetworkStores:", error);
    return [];
  }
}

export async function deleteCompanyStore(storeId: string): Promise<void> {
  await deleteDoc(doc(db, 'companyStores', storeId));
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: any;
  phone?: string;
  subject?: string;
}

export async function saveContactMessage(
  name: string,
  email: string,
  message: string,
  extras?: { phone?: string; subject?: string },
): Promise<string> {
  const ref = await addDoc(collection(db, 'contactMessages'), {
    name: name.trim(),
    email: email.trim(),
    message: message.trim(),
    ...(extras?.phone ? { phone: extras.phone.trim() } : {}),
    ...(extras?.subject ? { subject: extras.subject } : {}),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchContactMessages(): Promise<ContactMessage[]> {
  try {
    const q = query(collection(db, 'contactMessages'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ContactMessage[];
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    throw error;
  }
}

export async function deleteContactMessage(id: string): Promise<void> {
  await deleteDoc(doc(db, 'contactMessages', id));
}

export interface BusinessProfileDetails {
  shopName?: string;
  businessName?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  latitude?: number | null;
  longitude?: number | null;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    youtube?: string;
  };
}

export async function fetchBusinessProfile(uid: string, role: string, phone?: string): Promise<BusinessProfileDetails | null> {
  try {
    const col = role === 'manufacturer' ? 'manufacturers' : 'retailers';
    let snap;
    if (role === 'manufacturer') {
      const docId = phone || uid;
      snap = await getDoc(doc(db, col, docId));
      if (!snap.exists() && docId !== uid) {
        snap = await getDoc(doc(db, col, uid));
      }
    } else {
      snap = await getDoc(doc(db, col, uid));
      if (!snap.exists() && phone) {
        snap = await getDoc(doc(db, col, phone));
      }
    }

    if (snap.exists()) {
      const data = snap.data();
      if (!data) return null;
      const addr = data.address || {};
      const geo = data.geo;
      let lat = data.latitude ?? null;
      let lng = data.longitude ?? null;
      if (geo && typeof geo.latitude === 'number') {
        lat = geo.latitude;
        lng = geo.longitude;
      }
      return {
        shopName: data.shopName || undefined,
        businessName: data.businessName || undefined,
        address: {
          line1: addr.line1 || undefined,
          city: addr.city || undefined,
          state: addr.state || undefined,
          pincode: addr.pincode || undefined,
        },
        latitude: lat,
        longitude: lng,
        socialLinks: data.socialLinks || data.social || undefined,
      };
    }
  } catch (error) {
    console.error('Error fetching business profile:', error);
  }
  return null;
}

// ─── Blog Posts ───────────────────────────────────────────────────────────────

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  tags: string[];
  author: string;
  status: 'draft' | 'published';
  readTime?: number;
  publishedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeBlogSlug(value: string): string {
  return decodeSlug(value)
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097F\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function fetchBlogPosts(status: 'published' | 'all' = 'published'): Promise<BlogPost[]> {
  let q;
  if (status === 'published') {
    q = query(collection(db, 'blogPosts'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'));
  } else {
    q = query(collection(db, 'blogPosts'), orderBy('createdAt', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BlogPost, 'id'>) }));
}

export async function fetchBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const decodedSlug = decodeSlug(slug);
  const candidates = Array.from(new Set([
    slug,
    decodedSlug,
    normalizeBlogSlug(slug),
    encodeURIComponent(decodedSlug),
  ].filter(Boolean)));

  for (const candidate of candidates) {
    const q = query(collection(db, 'blogPosts'), where('slug', '==', candidate));
    const snap = await getDocs(q);
    const docSnap = snap.docs.find((d) => (d.data() as BlogPost).status === 'published');
    if (docSnap) return { id: docSnap.id, ...(docSnap.data() as Omit<BlogPost, 'id'>) };
  }

  const allPublished = await fetchBlogPosts('published');
  const normalizedSlug = normalizeBlogSlug(slug);
  return allPublished.find((post) => normalizeBlogSlug(post.slug || post.title) === normalizedSlug) ?? null;
}

export async function createBlogPost(data: Omit<BlogPost, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'blogPosts'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: data.status === 'published' ? serverTimestamp() : null,
  });
  return ref.id;
}

export async function updateBlogPost(id: string, data: Partial<Omit<BlogPost, 'id'>>): Promise<void> {
  const updates: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
  if (data.status === 'published') updates.publishedAt = serverTimestamp();
  await updateDoc(doc(db, 'blogPosts', id), updates);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await deleteDoc(doc(db, 'blogPosts', id));
}

// --- Failed Payments ---

export async function logFailedPayment(
  uid: string,
  errorResponse: any,
  context?: { orderId?: string; amount?: number; seatCount?: number; durationMonths?: number }
): Promise<void> {
  try {
    const timestamp = serverTimestamp();
    let phone: string | null = null;

    // Try uidIndex first (phone-keyed users).
    try {
      const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
      if (idxSnap.exists()) phone = String(idxSnap.data().phone ?? '');
    } catch { /* ignore */ }

    // Fallback: the user doc itself may be keyed by phone directly (pre-created accounts
    // that have logged in via OTP already have users/{phone}.uid === uid).
    if (!phone) {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) phone = String(userSnap.data().phone ?? '');
      } catch { /* ignore */ }
    }

    const resolvedPhone = phone || null;

    await addDoc(collection(db, 'failedPayments'), {
      userId: uid,
      // Write both uid and phone so admin panel matching works whether the
      // subscription record was keyed by uid or phone.
      userPhone: resolvedPhone ?? uid,
      userUid: uid,
      error: {
        reason: errorResponse?.reason ?? null,
        description: errorResponse?.description ?? null,
        code: errorResponse?.code ?? null,
        source: errorResponse?.source ?? null,
        step: errorResponse?.step ?? null,
        metadata: errorResponse?.metadata ?? null,
      },
      orderId: context?.orderId ?? errorResponse?.metadata?.order_id ?? null,
      amount: context?.amount ?? null,
      seatCount: context?.seatCount ?? null,
      durationMonths: context?.durationMonths ?? null,
      timestamp,
      status: 'failed',
    });
  } catch (err) {
    console.error('Error logging failed payment:', err);
  }
}

export async function fetchFailedPayments(): Promise<any[]> {
  // No orderBy — avoids needing a composite index on failedPayments.
  // Sort newest-first client-side instead.
  const snapshot = await getDocs(collection(db, 'failedPayments'));
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => {
      const ta = a.timestamp?.toMillis?.() ?? a.timestamp?.seconds ?? 0;
      const tb = b.timestamp?.toMillis?.() ?? b.timestamp?.seconds ?? 0;
      return tb - ta;
    });
}

// ─── Admin profile save (phone-keyed — works before first OTP login) ──────────

export interface AdminSaveProfileInput {
  businessName: string;
  ownerName: string;
  email: string;
  secondaryPhone: string;
  gstin: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  website: string;
  logoUrl: string;
  bannerUrl: string;
  social: { instagram: string; facebook: string; whatsapp: string; youtube: string };
  geo: { latitude: number; longitude: number } | null;
  onlineDelivery: boolean;
}

export async function adminSaveProfile(
  phone: string,
  role: string,
  data: AdminSaveProfileInput,
): Promise<void> {
  const now = serverTimestamp();
  const isSeller = role === "retailer" || role === "manufacturer";
  const geoPoint = data.geo ? new GeoPoint(data.geo.latitude, data.geo.longitude) : null;
  const addressObj = {
    line1:   data.line1.trim()   || null,
    city:    data.city.trim()    || null,
    state:   data.state.trim()   || null,
    pincode: data.pincode.trim() || null,
  };

  const userFields: Record<string, unknown> = {
    businessName:   data.businessName.trim()              || null,
    ownerName:      data.ownerName.trim()                 || null,
    name:           data.ownerName.trim()                 || null,
    email:          data.email.trim().toLowerCase()       || null,
    secondaryPhone: data.secondaryPhone.trim()            || null,
    gstin:          data.gstin.trim().toUpperCase()       || null,
    address:        data.line1.trim()                     || null,
    city:           data.city.trim()                      || null,
    state:          data.state.trim()                     || null,
    pincode:        data.pincode.trim()                   || null,
    website:        data.website.trim()                   || null,
    logoUrl:        data.logoUrl                          || null,
    bannerUrl:      data.bannerUrl                        || null,
    socialLinks:    data.social,
    updatedAt: now,
  };
  if (geoPoint) { userFields.latitude = geoPoint.latitude; userFields.longitude = geoPoint.longitude; }
  if (isSeller) {
    userFields.onlineDelivery = data.onlineDelivery;
    if (role === "retailer") userFields.shopName = data.businessName.trim() || null;
  }
  await setDoc(doc(db, "users", phone), userFields, { merge: true });

  if (isSeller) {
    const col = role === "manufacturer" ? "manufacturers" : "retailers";
    const profileFields: Record<string, unknown> = {
      ownerName:      data.ownerName.trim(),
      phone,
      email:          data.email.trim().toLowerCase()   || null,
      secondaryPhone: data.secondaryPhone.trim()        || null,
      gstin:          data.gstin.trim().toUpperCase()   || null,
      address:        addressObj,
      website:        data.website.trim()               || null,
      logoUrl:        data.logoUrl                      || null,
      bannerUrl:      data.bannerUrl                    || null,
      socialLinks:    data.social,
      onlineDelivery: data.onlineDelivery,
      active: true,
      updatedAt: now,
    };
    if (geoPoint) profileFields.geo = geoPoint;
    if (role === "manufacturer") profileFields.businessName = data.businessName.trim();
    else profileFields.shopName = data.businessName.trim();
    await setDoc(doc(db, col, phone), profileFields, { merge: true });

    await setDoc(doc(db, "profiles", phone), {
      type: role, ownerPhone: phone,
      businessName: data.businessName.trim(),
      ownerName:    data.ownerName.trim(),
      phone,
      email:        data.email.trim().toLowerCase() || null,
      address:      addressObj,
      ...(geoPoint ? { geo: geoPoint } : {}),
      website:        data.website.trim() || null,
      logoUrl:        data.logoUrl        || null,
      bannerUrl:      data.bannerUrl      || null,
      socialLinks:    data.social,
      onlineDelivery: data.onlineDelivery,
      updatedAt: now,
    }, { merge: true });
  }
}

export async function adminFetchSubscriptionsByPhone(phone: string): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, "subscriptions"), where("ownerPhone", "==", phone))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

export async function adminActivateSubscriptionForPhone(
  phone: string,
  role: string,
  seats: number,
  durationMonths: number,
  callerUid: string,
): Promise<void> {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + durationMonths);
  const ts = serverTimestamp();
  await setDoc(doc(db, "users", phone), {
    isPaid: true, subscriptionStatus: "active", totalSeats: seats, updatedAt: ts,
  }, { merge: true });
  await addDoc(collection(db, "subscriptions"), {
    ownerPhone: phone, ownerId: null,
    ownerType: role === "manufacturer" ? "manufacturer" : "retailer",
    planName: "Admin Assigned",
    seatsPurchased: seats, durationMonths, amountPaid: 0, currency: "INR",
    subscriptionStatus: "active",
    startDate: Timestamp.fromDate(now), expiryDate: Timestamp.fromDate(expiry),
    activatedByAdmin: true, createdByAdmin: callerUid,
    createdAt: ts, updatedAt: ts,
  });
}
