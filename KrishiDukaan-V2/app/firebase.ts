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

    const allMapped = snapshot.docs.map((item) => {
      const data = item.data();
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
        sellMode: data.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only",
        isOnline: data.isOnline === true || data.sellMode === "online_delivery",
        availability: data.availability || undefined,
        source: data.source ? String(data.source) : undefined,
        averageRating: typeof data.averageRating === 'number' ? data.averageRating : undefined,
        totalReviews: typeof data.totalReviews === 'number' ? data.totalReviews : undefined,
        nitrogen: data.nitrogen ? String(data.nitrogen) : undefined,
        phosphorus: data.phosphorus ? String(data.phosphorus) : undefined,
        potassium: data.potassium ? String(data.potassium) : undefined,
        applicationDesc: data.applicationDesc ? String(data.applicationDesc) : undefined,
        dosage: data.dosage ? String(data.dosage) : undefined,
        bestForCrops: Array.isArray(data.bestForCrops) ? data.bestForCrops : undefined,
        variants: Array.isArray(data.variants) ? data.variants : undefined,
        images: Array.isArray(data.images) ? data.images : undefined,
      } as MarketplaceProduct;
    });

    // Retailer copies hold each store's selling price — collect separately before filtering
    const retailerCopies = allMapped.filter(
      (p) => p.source === 'retailer_inventory_copy' || p.source === 'manufacturer_assigned',
    );

    const raw = allMapped.filter(
      (product) =>
        product.name &&
        product.image &&
        Number.isFinite(product.price) &&
        product.source !== 'manufacturer_assigned' &&
        product.source !== 'retailer_inventory_copy',
    );

    // Deduplicate by name: if two products share the same name (case-insensitive),
    // keep the manufacturer_inventory card as canonical and merge the retailer's
    // store info into its availability array so farmers see one card with all sources.
    const byName = new Map<string, MarketplaceProduct>();
    for (const p of raw) {
      const key = p.name.toLowerCase().trim();
      // Record this source id under the dedup key for rating aggregation later
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

      // Also register the secondary product itself as an availability source
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
        });
      }

      byName.set(key, { ...canonical, availability: av.length > 0 ? av : undefined });
    }

    // Merge each retailer copy's price into the canonical product's availability
    for (const copy of retailerCopies) {
      if (!copy.name || !copy.price) continue;
      const key = copy.name.toLowerCase().trim();
      const canonical = byName.get(key);
      if (!canonical) continue;

      // A copy may also carry its own reviews — record its id for rating aggregation
      const copyIds = idsByKey.get(key) ?? [];
      if (!copyIds.includes(copy.id)) { copyIds.push(copy.id); idsByKey.set(key, copyIds); }

      const copyStoreId = (copy as any).ownerId || copy.retailerId || '';
      const copyPhone = copy.retailerPhone;
      if (!copyStoreId && !copyPhone) continue;

      const av: NonNullable<MarketplaceProduct['availability']> = [...(canonical.availability ?? [])];
      const existing = av.find(
        (a) =>
          (copyStoreId && a.storeId === copyStoreId) ||
          (copyPhone && a.storePhone === copyPhone),
      );
      if (existing) {
        existing.sellingPrice = copy.price;
      } else {
        av.push({
          storeId: copyStoreId,
          storePhone: copyPhone,
          storeName: copy.store || undefined,
          stockLevel: copy.stock || 'In Stock',
          sellingPrice: copy.price,
        });
      }
      byName.set(key, { ...canonical, availability: av });
    }

    // Compute lowestPrice + ratings across all merged store/variant sources for each product
    return Array.from(byName.entries()).map(([key, p]) => {
      const prices = (p.availability ?? [])
        .map((a) => a.sellingPrice)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : undefined;

      // Aggregate reviews across every source id that merged into this card
      let sum = 0, count = 0;
      for (const id of (idsByKey.get(key) ?? [p.id])) {
        const agg = ratingAgg.get(id);
        if (agg) { sum += agg.sum; count += agg.count; }
      }
      const averageRating = count > 0 ? sum / count : p.averageRating;
      const totalReviews = count > 0 ? count : p.totalReviews;

      return { ...p, lowestPrice, averageRating, totalReviews };
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

  // Resolve uid → phone via uidIndex (new schema).
  // Fall back to writing users/{uid} if uidIndex missing (shouldn't happen after new saveUserProfile).
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
    if (userDoc.exists()) userData = userDoc.data() as Record<string, unknown>;
  } catch { /* fall through with empty userData */ }

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

      // Write both legacy (userId) and new (userPhone) fields so all queries work.
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
    return snapshot.docs.map(doc => ({
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
}): Promise<string[]> {
  const { customerId, customerName, customerPhone, customerAddress, items } = params;
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

    const normalizedItems = groupItems.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      qty: item.qty,
      lineTotal: Number((item.price * item.qty).toFixed(2)),
      ...(item.variantUnit ? { variantUnit: item.variantUnit } : {}),
    }));

    const subtotal = Number(
      normalizedItems.reduce((sum, row) => sum + row.lineTotal, 0).toFixed(2),
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

    const grandTotal = Number((subtotal + deliveryCharge).toFixed(2));
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
      subtotal,
      deliveryCharge,
      grandTotal,
      totalWeightKg,
      invoiceNumber,
      deliveryMode: "delivery",
      status: "placed",
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

export async function adminCreateProduct(product: Omit<MarketplaceProduct, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'products'), {
    ...product,
    source: 'admin',
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
    try {
      const idxSnap = await getDoc(doc(db, 'uidIndex', uid));
      if (idxSnap.exists()) {
        phone = String(idxSnap.data().phone ?? '');
      }
    } catch { /* ignore */ }

    await addDoc(collection(db, 'failedPayments'), {
      userId: uid,
      userPhone: phone ?? uid,
      error: errorResponse,
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
  const q = query(collection(db, 'failedPayments'), orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
