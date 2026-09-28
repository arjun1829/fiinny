import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  getFirestore,
  increment,
  limit,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  GeoPoint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  DEFAULT_DURATIONS,
  PRICING_DOC_PATH,
  computeAmount,
  parseDurations,
  type DurationPrice,
} from './lib/pricing';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const _projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "krishidukan-e8315";
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY             ?? "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN         ?? `${_projectId}.firebaseapp.com`,
  projectId:         _projectId,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      ?? `${_projectId}.firebasestorage.app`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "650303885415",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? "1:650303885415:web:7db7619260aa478b2b84c2",
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID      ?? "G-7MEFGCD4EX",
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
import type { CartItem, OrderDoc, OrderItem, OrderStatus, SellerType, StatusHistoryEntry } from '../types/order';
import { generateAndStoreInvoice } from './utils/invoice-storage';
import { buildRatingAgg, mapMarketplaceDoc, mergeMarketplaceProducts } from './lib/marketplace-merge';

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

    // Ratings computed straight from the review documents (source of truth), keyed
    // by catalogId — avoids depending on aggregate fields being kept in sync.
    const ratingAgg = buildRatingAgg(
      (reviewsSnap?.docs ?? []).map((d) => ({
        catalogId: String(d.data().catalogId || ''),
        rating: Number(d.data().rating || 0),
      })),
    );

    const allMapped = snapshot.docs
      .filter((item) => item.data().isActive !== false)
      .map((item) => mapMarketplaceDoc(item.id, item.data()));

    // Dedup by name + merge copies + finalize price/ratings/sellMode.
    // Shared with the paginated /api/marketplace/products route so both produce
    // identical merged cards.
    return mergeMarketplaceProducts(allMapped, ratingAgg);
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
  /** Manufacturer brand-page slug (manufacturers/{phone}.slug). Present only for
   *  manufacturers that have set up a brand page — retailers never have one.
   *  Search results use it to link to /brand/{slug} instead of the map. */
  slug?: string;
  /** Whether THIS store has switched on online delivery for itself.
   *
   *  Carried on the Store so callers can filter synchronously. Buy Now used to
   *  pick the first store in a product's availability array without checking
   *  this at all — which handed the buyer a store that had never enabled online
   *  delivery, and in some cases had not even accepted its invite. */
  onlineDelivery?: boolean;
};

export async function fetchStores(): Promise<Store[]> {
  try {
    const [storesSnapshot, retailersSnapshot, manufacturersSnapshot, storeReviewsSnap, profilesSnap] = await Promise.all([
      getDocs(collection(db, 'stores')),
      getDocs(collection(db, 'retailers')),
      getDocs(collection(db, 'manufacturers')),
      getDocs(collection(db, 'storeReviews')).catch(() => null),
      // profiles/{phone} is the unified new-schema profile and the mobile app's
      // primary store source. The web read every OTHER collection but this one,
      // so profile-only sellers never appeared in the locator.
      getDocs(collection(db, 'profiles')).catch(() => null),
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

    // Brand-page slugs, keyed by manufacturer phone. Collected before the
    // cross-collection dedup below so the slug survives even when a profiles/
    // or stores/ entry outscores the manufacturers/ one for the same phone.
    const manufacturerSlugByPhone = new Map<string, string>();
    for (const d of manufacturersSnapshot.docs) {
      const md = d.data();
      const slug = typeof md.slug === 'string' ? md.slug.trim() : '';
      if (!slug) continue;
      const phone = String(md.phone || (/^\+?\d{10,13}$/.test(d.id) ? d.id : ''));
      if (phone) manufacturerSlugByPhone.set(phone, slug);
    }

    const stores = storesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    } as Store));

    const retailers = retailersSnapshot.docs
      .filter((doc) => {
        const data = doc.data();
        // Explicit deactivation by an admin/manufacturer is the ONLY reason to
        // hide a store from search and the locator.
        const os = String(data.onboardingStatus ?? '');
        if (os === 'removed' || os === 'inactive') return false;

        // Deliberately NOT gating on `active`/`assignedSeat` for
        // manufacturer-network retailers. That gate was justified as "otherwise
        // they have no products", but the data says otherwise: it rejected 294
        // of 423 retailers and 293 of those DO have sellable products. On these
        // docs `active: false` is the un-activated DEFAULT (291 of 423, tracking
        // onboardingStatus: 'pending') — not a deactivation signal — so reading
        // it as one hid most of the network from the web while the mobile app,
        // which applies no such filter, showed them.
        return true;
      })
      .map((doc) => {
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
        onlineDelivery: data.onlineDelivery === true,
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
          onlineDelivery: data.onlineDelivery === true,
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

    // profiles/{phone} — unified new-schema profile. Address and geo are stored
    // as nested maps here, unlike the flat legacy shapes above.
    const profileStores = (profilesSnap?.docs ?? [])
      .filter((doc) => {
        const data = doc.data();
        const role = String(data.role ?? '');
        if (role !== 'retailer' && role !== 'manufacturer') return false;
        return !!(data.shopName || data.businessName || data.ownerName || data.name);
      })
      .map((doc) => {
        const data = doc.data();
        const addr = data.address;
        const addrIsMap = addr && typeof addr === 'object';
        return {
          id: doc.id,
          userId: data.uid || undefined,
          name: data.shopName || data.businessName || data.ownerName || data.name,
          ownerName: data.ownerName,
          phone: data.phone || (/^\+?\d{10,13}$/.test(doc.id) ? doc.id : undefined),
          logo: data.logo || undefined,
          address: addrIsMap ? (addr.line1 ?? addr.address) : addr,
          city: (addrIsMap ? addr.city : undefined) ?? data.city,
          state: (addrIsMap ? addr.state : undefined) ?? data.state,
          pincode: (addrIsMap ? addr.pincode : undefined) ?? data.pincode,
          onlineDelivery: data.onlineDelivery === true,
          distance: 'Nearby',
          status: data.status || 'Active',
          stock: [],
          location: {
            lat: data.geo?.latitude ?? data.geo?.lat ?? data.location?.latitude ?? data.location?.lat ?? 0,
            lng: data.geo?.longitude ?? data.geo?.lng ?? data.location?.longitude ?? data.location?.lng ?? 0,
          },
        } as Store & { userId?: string; city?: string; state?: string; pincode?: string };
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
    for (const entry of [...stores, ...profileStores, ...dedupedRetailers, ...manufacturers] as AnyStore[]) {
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
      const slug = phone ? manufacturerSlugByPhone.get(phone) : undefined;
      const agg = phone ? storeRatingAgg.get(phone) : undefined;
      const withSlug = slug ? { ...entry, slug } : entry;
      if (agg && agg.count > 0) {
        return { ...withSlug, averageRating: agg.sum / agg.count, totalReviews: agg.count };
      }
      return withSlug;
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

/**
 * The live plan for a billing period, read from settings/pricing.
 *
 * There used to be a `PRICE_PER_SEAT` literal here AND in adminManualActivate
 * AND in the mobile app, none of which the admin Pricing screen could reach.
 * Editing the price in admin changed what Razorpay charged but not what got
 * written to payments/ and subscriptions/, so the books recorded the old price
 * — Rs 21 for any period outside {1,3,6,12}. Both literals are gone; this is
 * the only price lookup left on the client, and the amount actually charged is
 * preferred over it wherever the gateway can tell us (see verify/).
 */
async function loadPlan(durationMonths: number): Promise<DurationPrice | null> {
  let ladder: DurationPrice[] = DEFAULT_DURATIONS;
  try {
    const snap = await getDoc(
      doc(db, PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc),
    );
    if (snap.exists()) ladder = parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch {
    /* unreachable settings doc degrades to the built-in ladder */
  }
  return ladder.find((d) => d.months === durationMonths) ?? null;
}

/**
 * What the seller was shown, and therefore accepted, at the moment of purchase.
 *
 * Recorded against the subscription and the payment so the question "which
 * version of the terms did this seller agree to, and where" is answerable from
 * the data years later. Version strings come from app/lib/legal-constants.ts.
 */
export interface TermsAcceptance {
  /** TERMS_VERSION at the time of purchase. */
  version: string;
  /** Routes of the documents the notice linked to. */
  documents: string[];
  /** ISO 8601, client clock — indicative, the server timestamp is authoritative. */
  acceptedAt: string;
  /** Which checkout showed the notice, e.g. 'web:subscription-checkout'. */
  surface: string;
}

export async function updateSubscriptionStatus(
  uid: string,
  status: 'paid' | 'unpaid',
  paymentDetails?: any,
  seatCount: number = 1,
  durationMonths: number = 1,
  /**
   * Rupees Razorpay actually captured, as returned by verify/. Pass it whenever
   * it is available: it is the only figure guaranteed to match the seller's card
   * statement. Omitted only by callers with no gateway round-trip behind them.
   */
  amountPaid?: number,
  /**
   * The terms notice the seller passed through on the way to paying. Optional
   * so older callers (and the admin-activation path, which has no seller in
   * front of it to accept anything) keep working — a missing record is honest
   * about the fact that no notice was shown, which is better than stamping one
   * that was not.
   */
  termsAcceptance?: TermsAcceptance,
  /**
   * The promo code this subscription was purchased with, as returned by
   * /api/payment/verify (which reads it from the Razorpay order notes, stamped
   * server-side at create-order time). Persisted on the subscription doc so
   * "which users bought with promo X" is answerable by querying subscriptions.
   * Omitted / empty when no promo was used. Never sourced from the checkout
   * input field — only the gateway-verified value flows through here.
   */
  promoCode?: string | null,
): Promise<{ profileUpdated: true; paymentLogged: boolean; paymentLogError?: string }> {
  const timestamp = serverTimestamp();
  const normalizedPromo = String(promoCode ?? '').trim().toUpperCase();

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
      // Prefer what the gateway captured; fall back to the live ladder only when
      // the caller had no verified amount to hand us.
      let totalAmount = Number(amountPaid);
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        const plan = await loadPlan(durationMonths);
        totalAmount = plan ? computeAmount(plan, seatsToAdd) : 0;
      }

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
        termsAcceptance: termsAcceptance ?? null,
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
        // Promo attribution — written only when a gateway-verified code was
        // used. Absent field = no promo, so usage queries filter on presence.
        ...(normalizedPromo ? { promoCode: normalizedPromo } : {}),
        startDate: Timestamp.fromDate(now),
        expiryDate: Timestamp.fromDate(expiry),
        createdAt: timestamp,
        updatedAt: timestamp,
        // Which standard terms this subscription was sold under. There are no
        // company-specific seller agreements, so this version string plus the
        // published documents is the whole contract for this period.
        termsAcceptance: termsAcceptance ?? null,
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
    //
    // The manufacturerId branch is scoped to ownerType=='manufacturer' —
    // every retailer-assignment copy of this manufacturer's products also
    // stamps manufacturerId with the original manufacturer's uid for
    // traceability, even though the copy is owned by the retailer
    // (ownerType: 'retailer'). Without this scope, a manufacturer with a
    // handful of real products assigned out to many retailers showed
    // hundreds of "products" here (and paid for every one of those reads).
    const [byOwnerId, byManufacturerId] = await Promise.all([
      getDocs(query(
        collection(db, 'products'),
        where('ownerId', '==', manufacturerId),
        where('ownerType', '==', 'manufacturer'),
      )),
      getDocs(query(
        collection(db, 'products'),
        where('manufacturerId', '==', manufacturerId),
        where('ownerType', '==', 'manufacturer'),
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
    // Dual-field read. This used to query ONLY `retailerId == uid`, which is
    // the LEGACY uid-keyed field — per CLAUDE.md the current schema keys
    // seller identity by `retailerPhone`/`ownerPhone`. A phone-keyed seller
    // therefore had this return 0 products, so the dashboard's "Products
    // Listed" tile and Inventory Health read empty while the app (which
    // queries all these fields) showed the real catalogue.
    //
    // Mirrors DashboardRepository.fetchStats on mobile: run the variants in
    // parallel and dedupe by doc id.
    const phone = await resolveUserProfileDocId(retailerId);
    const isPhone = !!phone && /^\+?\d{10,13}$/.test(phone);

    const queries = [
      query(collection(db, 'products'), where('retailerId', '==', retailerId)),
      query(collection(db, 'products'), where('ownerId', '==', retailerId)),
      ...(isPhone
        ? [
            query(collection(db, 'products'), where('retailerPhone', '==', phone)),
            query(collection(db, 'products'), where('ownerPhone', '==', phone)),
          ]
        : []),
    ];

    const snapshots = await Promise.all(
      // One unreadable/missing-index variant must not zero out the whole tile.
      queries.map((q) => getDocs(q).catch(() => null)),
    );

    const seen = new Set<string>();
    const results: MarketplaceProduct[] = [];
    for (const snapshot of snapshots) {
      if (!snapshot) continue;
      for (const doc of snapshot.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        if (doc.data().isActive === false) continue;
        results.push({ id: doc.id, ...doc.data() } as MarketplaceProduct);
      }
    }
    return results;
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
      ...(sellerPhoneHint ? { sellerPhone: sellerPhoneHint } : {}),
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

    // Generate PDF, upload to Storage, and write invoice metadata.
    // Wrapped in try/catch — a failure here must never roll back the order.
    try {
      await generateAndStoreInvoice(orderRef.id, {
        id: orderRef.id,
        customerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        sellerId,
        sellerType,
        ...(sellerName ? { sellerName } : {}),
        ...(sellerGstNumber ? { sellerGstNumber } : {}),
        items: normalizedItems as OrderItem[],
        mrpSubtotal,
        subtotal,
        ...(totalGst > 0 ? { totalGst } : {}),
        deliveryCharge,
        grandTotal,
        totalWeightKg,
        invoiceNumber,
        deliveryMode: "delivery",
        status: "placed",
        ...(payment ? { payment } : {}),
      });
    } catch (invoiceErr) {
      console.error("[invoice] Failed to generate or store invoice", orderRef.id, invoiceErr);
    }

    createdOrderIds.push(orderRef.id);
  }

  return createdOrderIds;
}

/**
 * Every identifier an order might carry for one seller.
 *
 * Seller identity is written three different ways across the codebase:
 *   - web checkout    → sellerId = Firebase UID
 *   - Flutter checkout→ sellerId = phone, plus sellerPhone = phone
 *   - phone formats   → "+919876543210" and bare "9876543210" both occur
 *
 * Mirrors the resolver in dashboard/_lib/analytics-firestore.ts, which hit
 * this same problem (seller totals silently reading zero).
 */
/** Adds a phone in every format that occurs in this database. */
function addPhoneForms(set: Set<string>, raw: unknown): void {
  const phone = String(raw ?? "").trim();
  if (!phone) return;
  set.add(phone);
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) { set.add(digits); set.add(`+91${digits}`); }
  if (digits.length === 12 && digits.startsWith("91")) {
    set.add(`+${digits}`);
    set.add(digits.slice(2));
  }
}

function sellerIdentityCandidates(sellerId: string, profile?: any): string[] {
  const out = new Set<string>();
  if (sellerId) out.add(sellerId);
  if (profile?.uid) out.add(String(profile.uid));
  if (profile?.id) out.add(String(profile.id));
  addPhoneForms(out, profile?.phone);
  addPhoneForms(out, profile?.ownerPhone);
  addPhoneForms(out, profile?.retailerPhone);
  return Array.from(out).filter(Boolean);
}

/**
 * Incoming orders for one seller, across every identity keying.
 *
 * Querying `sellerId == uid` alone hides every mobile-placed order from the
 * seller dashboard — paid for, visible in Razorpay, never surfaced to the
 * retailer. Cross both seller fields with every identifier variant and
 * dedupe; a wrong-shaped value against a field just returns empty, never
 * errors, so over-querying is safe.
 *
 * sellerType is deliberately NOT filtered: sellerId/sellerPhone already
 * identify the account uniquely, and mobile orders hardcode
 * sellerType: 'retailer' regardless of the account's actual role.
 */
export async function fetchIncomingOrdersForSeller(
  sellerId: string,
  _sellerType: SellerType,
  profile?: any
): Promise<OrderDoc[]> {
  const seed = new Set(sellerIdentityCandidates(sellerId, profile));

  // getUserProfile() returns snap.data() and drops the doc ID — but users are
  // keyed users/{phone}, so the phone can be missing from the profile object
  // entirely. uidIndex/{uid} is the canonical uid→phone map. Always consulted,
  // not just when the profile looks phone-less: the profile's phone and the
  // indexed one can differ in format, and either may be the one on the order.
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", sellerId));
    addPhoneForms(seed, idxSnap.data()?.phone);
  } catch {
    // Non-fatal: fall through with the identifiers we already have.
  }

  // sellerId may itself already be a phone (retailers keyed by phone).
  if (/^(\+91)?[6-9]\d{9}$/.test(sellerId.replace(/\s/g, ""))) {
    addPhoneForms(seed, sellerId);
  }

  const candidates = Array.from(seed).filter(Boolean);
  if (candidates.length === 0) return [];

  const byId = new Map<string, OrderDoc>();
  let succeeded = 0;

  const collect = (snap: Awaited<ReturnType<typeof getDocs>>) => {
    succeeded++;
    for (const d of snap.docs) {
      byId.set(d.id, { id: d.id, ...(d.data() as Omit<OrderDoc, "id">) });
    }
  };

  // Firestore caps `in` at 30 values — chunk so identity expansion can grow
  // without becoming one round-trip per candidate.
  const chunks: string[][] = [];
  for (let i = 0; i < candidates.length; i += 30) chunks.push(candidates.slice(i, i + 30));

  await Promise.all(
    ["sellerId", "sellerPhone"].flatMap((field) =>
      chunks.map(async (chunk) => {
        try {
          collect(await getDocs(query(collection(db, "orders"), where(field, "in", chunk))));
        } catch (err) {
          // Security rules reject a LIST if any matched doc is unreadable, so a
          // single foreign candidate would blank out its whole chunk. Retry
          // one value at a time so the seller's real orders still come back.
          console.warn(`[orders] ${field} chunk failed, retrying individually:`, err);
          await Promise.all(
            chunk.map((value) =>
              getDocs(query(collection(db, "orders"), where(field, "==", value)))
                .then(collect)
                .catch(() => {}),
            ),
          );
        }
      }),
    ),
  );

  // Every permutation failing means a real problem (rules/network), not
  // "this seller has no orders" — surface it instead of showing an empty list.
  if (succeeded === 0) {
    throw new Error("Could not read orders — all seller-identity queries failed.");
  }

  return Array.from(byId.values()).sort((a, b) => {
    const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
    const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

/**
 * Every order on the platform, newest first — backs the admin Orders tab.
 *
 * Deliberately NOT using orderBy("createdAt"): Firestore silently drops
 * documents missing the ordered field, which would hide any legacy order
 * written before createdAt existed — exactly the orders an admin chasing an
 * unexplained Razorpay payment is most likely looking for. Sorting client-side
 * keeps them visible (they sink to the bottom instead of disappearing).
 */
export async function fetchAllOrdersForAdmin(): Promise<OrderDoc[]> {
  const snapshot = await getDocs(collection(db, "orders"));
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
    // Primary: profiles/{phone} is the unified public profile and is ALWAYS
    // phone-keyed by the write path (dashboard profile page). The legacy
    // retailers/{phone} doc can be keyed by a UID/GUID instead of phone, so
    // reading it alone misses the flag for those sellers (Order button never
    // appears). users/{phone} is the same always-phone-keyed mirror.
    const profileSnap = await getDoc(doc(db, "profiles", phone));
    if (profileSnap.exists() && typeof (profileSnap.data() as any).onlineDelivery === "boolean") {
      return !!(profileSnap.data() as any).onlineDelivery;
    }
    const userSnap = await getDoc(doc(db, "users", phone));
    if (userSnap.exists() && typeof (userSnap.data() as any).onlineDelivery === "boolean") {
      return !!(userSnap.data() as any).onlineDelivery;
    }
    // Fallback: legacy account docs keyed BY phone (older data written before the mirror existed).
    const retailerSnap = await getDoc(doc(db, "retailers", phone));
    if (retailerSnap.exists()) return !!(retailerSnap.data() as any).onlineDelivery;
    const mfrSnap = await getDoc(doc(db, "manufacturers", phone));
    if (mfrSnap.exists()) return !!(mfrSnap.data() as any).onlineDelivery;

    // Last resort: GUID-keyed legacy retailers — the role doc id is a UID/GUID,
    // not phone, so the flag was never reachable by any phone-keyed lookup above.
    // Query the collection by the `phone` field instead (both E164 and 10-digit
    // formats), mirroring fetchRetailerPublicProfile. Self-heals old data with
    // no migration. Only runs when every cheap getDoc above missed.
    const phoneDigits = phone.replace(/^\+91/, "");
    const [byE164, byDigits] = await Promise.all([
      getDocs(query(collection(db, "retailers"), where("phone", "==", phone))),
      getDocs(query(collection(db, "retailers"), where("phone", "==", phoneDigits))),
    ]);
    const legacyRetailer = byE164.docs[0] ?? byDigits.docs[0];
    if (legacyRetailer) return !!(legacyRetailer.data() as any).onlineDelivery;
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

// syncInitialData() was removed here: it wrote the hardcoded demo catalogue
// (constants.ts PRODUCTS/STORES/INVENTORY) into production Firestore from the
// browser whenever a read came back empty. Seeding is a server-side task with
// admin credentials, never something a visitor's session should be able to do.


/** Detects the device category from the browser UA string. Returns 'web' (desktop),
 *  'mobile' (phone), or 'tablet'. Used to bucket DAU by platform. */
function detectPlatform(): 'web' | 'mobile' | 'tablet' {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return 'tablet';
  // Android tablets omit the "Mobile" token; Android phones include it.
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  return 'web';
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

/**
 * Records that a logged-in user was active today (DAU/MAU/retention signal).
 *
 * The ONLY client write in the whole activity pipeline. It is throttled to at
 * most one write per user per calendar day via localStorage — the same user
 * opening ten screens still writes zero extra times. The presence doc ID is the
 * user's stable phone, so a re-write on the same day is an idempotent overwrite;
 * the aggregation Cloud Function keys off create-only, so a user is never
 * double-counted (see functions/src/analytics/activity.ts).
 *
 * `userId` must be the users/{id} document key (normalized phone for phone
 * accounts, uid for legacy email accounts) so it matches the identity used
 * everywhere else and dedupes correctly across sessions.
 */
export async function trackUserActivity(opts: {
  userId: string;
  role?: string | null;
  registeredAt?: Timestamp | Date | string | null;
}) {
  try {
    const userId = String(opts.userId ?? '').trim();
    if (!userId) return;

    const dayKey = getLocalDayKey();
    const throttleKey = `kd_active_${userId}`;
    if (typeof window !== 'undefined') {
      // Cheap client-side throttle — no Firestore read needed to decide.
      if (window.localStorage.getItem(throttleKey) === dayKey) return;
    }

    // Registration day drives the retention cohort; carry it on the presence
    // doc so the Cloud Function needs no extra read.
    let registeredDayKey: string | null = null;
    const reg = opts.registeredAt;
    if (reg) {
      if (typeof reg === 'string') registeredDayKey = reg.slice(0, 10);
      else if (reg instanceof Date) registeredDayKey = getLocalDayKey(reg);
      else if (typeof (reg as Timestamp).toDate === 'function') {
        registeredDayKey = getLocalDayKey((reg as Timestamp).toDate());
      }
    }

    await setDoc(
      doc(db, 'activeUsers', dayKey, 'presence', userId),
      {
        role: opts.role ?? null,
        registeredDayKey,
        platform: detectPlatform(),
        at: serverTimestamp(),
      },
      { merge: true },
    );

    // Best-effort per-user last-active field. Same throttle window, so at most
    // one write/user/day here too.
    await setDoc(
      doc(db, 'users', userId),
      { lastActiveAt: serverTimestamp() },
      { merge: true },
    );

    // Only mark done AFTER a successful write, so a transient failure retries
    // on the next app open rather than silently skipping the day.
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(throttleKey, dayKey);
    }
  } catch {
    // silent fail — analytics must never break the app
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

/** One page of the users list, newest first — for admin "browse mode" instead of a full collection scan. */
export type UserRoleFilter = 'all' | 'retailer' | 'manufacturer' | 'admin' | 'customer';

/**
 * One page of users, optionally narrowed to a role by Firestore itself.
 *
 * The role argument is what keeps the admin Users tab cheap. Without it the page
 * had to download the ENTIRE users collection to filter in the browser, so
 * picking "Retailer" read ~1,300 docs to show 139 — the actual cause of that tab
 * being slow and read-heavy.
 *
 * 'customer' is deliberately NOT pushed into the query. A customer is a user
 * whose role is 'customer' OR who has no role field at all, and Firestore cannot
 * express "field missing OR equals" in a single query — a where('role','==','customer')
 * would silently drop every legacy user that predates the field. So that one case
 * pages through unfiltered and is narrowed by the caller, which is still
 * paginated and still far cheaper than loading everything.
 */
export async function fetchUsersPage(
  pageSize: number,
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
  role: UserRoleFilter = 'all',
): Promise<{ users: any[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
  const serverFilterable = role === 'retailer' || role === 'manufacturer' || role === 'admin';

  const constraints = [
    ...(serverFilterable ? [where('role', '==', role)] : []),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const snap = await getDocs(query(collection(db, 'users'), ...constraints));

  const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const users = role === 'customer'
    ? all.filter(u => !u.role || u.role === 'customer')
    : all;

  return {
    users,
    // Cursor tracks the RAW page, not the filtered rows — paging must continue
    // from where Firestore left off even when this page filtered everything out.
    lastDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === pageSize,
  };
}

/** Cheap server-side aggregate counts for the role chips — avoids pulling every user doc just to count them. */
export async function fetchUserRoleCounts(): Promise<{
  all: number; retailer: number; manufacturer: number; admin: number; customer: number;
}> {
  const usersCol = collection(db, 'users');
  const [all, retailer, manufacturer, admin] = await Promise.all([
    getCountFromServer(usersCol),
    getCountFromServer(query(usersCol, where('role', '==', 'retailer'))),
    getCountFromServer(query(usersCol, where('role', '==', 'manufacturer'))),
    getCountFromServer(query(usersCol, where('role', '==', 'admin'))),
  ]);
  const allCount = all.data().count;
  const retailerCount = retailer.data().count;
  const manufacturerCount = manufacturer.data().count;
  const adminCount = admin.data().count;
  // "Customer" has no dedicated role value (missing role field OR role === 'customer'),
  // which Firestore can't count directly — derive it as the remainder. This slightly
  // over-counts if internal-staff roles (team/salesExecutive) exist, an accepted
  // approximation since those accounts are few and the chip is informational.
  const customerCount = Math.max(0, allCount - retailerCount - manufacturerCount - adminCount);
  return { all: allCount, retailer: retailerCount, manufacturer: manufacturerCount, admin: adminCount, customer: customerCount };
}

/** Splits an array into chunks of at most `size` — Firestore 'in' queries cap at 30 values. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetches only the product docs owned (by any of the 6 legacy/current owner fields — see
 * productOwnerKeys below) by the given set of uid/phone/id keys, instead of the full
 * `products` collection. Used to scope per-row product counts to whatever page of users
 * is currently loaded in the admin Users & Roles browse mode.
 */
export async function fetchProductsForUserKeys(keys: string[]): Promise<RawProductDoc[]> {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean).map(String)));
  if (uniqueKeys.length === 0) return [];
  const fields = ['ownerId', 'retailerId', 'manufacturerId', 'ownerPhone', 'retailerPhone', 'manufacturerPhone'] as const;
  const productsCol = collection(db, 'products');
  const queries: Promise<any>[] = [];
  for (const field of fields) {
    for (const batch of chunk(uniqueKeys, 30)) {
      queries.push(getDocs(query(productsCol, where(field, 'in', batch))));
    }
  }
  const snaps = await Promise.all(queries);
  const byId = new Map<string, RawProductDoc>();
  for (const snap of snaps) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...(d.data() as Record<string, unknown>) });
  }
  return Array.from(byId.values());
}

/** Fetches only the subscription docs for the given owner phones — scoped equivalent of fetchAllSubscriptions. */
export async function fetchSubscriptionsForPhones(phones: string[]): Promise<any[]> {
  const uniquePhones = Array.from(new Set(phones.filter(Boolean).map(String)));
  if (uniquePhones.length === 0) return [];
  const subsCol = collection(db, 'subscriptions');
  const snaps = await Promise.all(
    chunk(uniquePhones, 30).map(batch => getDocs(query(subsCol, where('ownerPhone', 'in', batch)))),
  );
  const byId = new Map<string, any>();
  for (const snap of snaps) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...d.data() });
  }
  return Array.from(byId.values());
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

/** Updates which admin-portal tabs a "team" (limited-access) account can see. */
export async function adminUpdateTeamSections(uid: string, adminSections: string[]): Promise<void> {
  await setDoc(doc(db, 'users', uid), { adminSections, updatedAt: serverTimestamp() }, { merge: true });
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

// `plans` has a public read rule (see firestore.rules) — writes all go through
// app/api/admin/plans/* (Admin SDK), so this is read-only client access.
export async function fetchAllPlans(): Promise<any[]> {
  const snapshot = await getDocs(collection(db, 'plans'));
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

export async function adminSetSubscriptionExpiry(subId: string, userDocId: string, expiryDate: Date): Promise<void> {
  const subRef = doc(db, 'subscriptions', subId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error('Subscription not found.');
  await setDoc(subRef, {
    expiryDate: Timestamp.fromDate(expiryDate),
    subscriptionStatus: 'active',
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
  const plan = await loadPlan(durationMonths);
  const totalAmount = plan ? computeAmount(plan, seats) : 0;
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
  return mapAdminProductDocs(await fetchAllSellerProducts());
}

/**
 * Pure shape-mapper behind fetchAllProductsForAdmin(). Split out so callers that
 * already hold a cached raw `products` snapshot (see app/admin/_lib/admin-data.ts)
 * can render the admin table without triggering a second collection scan.
 */
export function mapAdminProductDocs(docs: RawProductDoc[]): MarketplaceProduct[] {
  return docs
    .map((item) => {
      const data = item as Record<string, any>;
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
  // Firestore rejects explicit `undefined` field values — strip them before writing.
  const clean = Object.fromEntries(
    Object.entries(product).filter(([, v]) => v !== undefined),
  );
  const ref = await addDoc(collection(db, 'products'), {
    ...clean,
    source: 'admin',
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function adminUpdateProduct(productId: string, product: Partial<MarketplaceProduct>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(product).filter(([, v]) => v !== undefined));
  await setDoc(doc(db, 'products', productId), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
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

  // Build a GeoPoint only when valid (non-zero) coordinates are provided.
  // profilePersistence.ts reads `data.geo` (GeoPoint) first, then `data.location`
  // as a fallback.  Saving as a real GeoPoint ensures the Profile page pre-fills
  // the map pin and the seller appears in nearby/map searches from day one.
  const geoPoint =
    seller.latitude && seller.longitude
      ? new GeoPoint(seller.latitude, seller.longitude)
      : null;

  // `address` must be saved as a nested object — addressFromDoc() in profile-persistence
  // reads data.address.line1 / .city / .state / .pincode. A flat string produces empty
  // fields on the Profile page.
  const addressObj = {
    line1:   (seller.address || '').trim(),
    city:    (seller.city    || '').trim(),
    state:   (seller.state   || '').trim(),
    pincode: (seller.pincode || '').trim(),
  };

  const common: Record<string, unknown> = {
    phone,
    ownerName: (seller.name || '').trim(),
    address: addressObj,
    // Keep flat city/state/pincode too — some map queries filter on these directly.
    city:    addressObj.city,
    state:   addressObj.state,
    pincode: addressObj.pincode,
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
      // Save as GeoPoint (primary) so parseGeo() returns a real GeoPoint.
      // Also keep `location` for backward compat with callers that read it directly.
      ...(geoPoint ? {
        geo: geoPoint,
        location: { latitude: geoPoint.latitude, longitude: geoPoint.longitude },
      } : {}),
      products: [],
    }, { merge: true });
  } else {
    await setDoc(ref, {
      ...common,
      uid: seller.uid ?? null,
      userId: idVal,
      manufacturerId: idVal,
      businessName: (seller.businessName || seller.shopName || seller.name || '').trim(),
      ...(geoPoint ? { geo: geoPoint } : {}),
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
    // New assigned copies always start offline — seller must explicitly enable delivery.
    sellMode: 'offline_store_only',
    isOnline: false,
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
      isOnline: false,
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
 * Toggles online delivery for a product from the admin panel.
 * Updates the product doc (sellMode + isOnline), syncs all availability[].isOnline
 * entries, and — when enabling — flips the account-level onlineDelivery flag on
 * the seller's retailers/manufacturers doc so ProductDetailView's canOrder passes.
 */
export async function adminUpdateProductSellMode(
  productId: string,
  sellMode: "online_delivery" | "offline_store_only",
  sellerPhone?: string,
): Promise<void> {
  const isOnline = sellMode === "online_delivery";
  const productSnap = await getDoc(doc(db, "products", productId));
  if (!productSnap.exists()) throw new Error("Product not found");
  const productData = productSnap.data() as Record<string, unknown>;
  const currentAv = Array.isArray(productData.availability) ? (productData.availability as any[]) : [];

  const patch: Record<string, unknown> = { sellMode, isOnline, updatedAt: serverTimestamp() };
  if (currentAv.length > 0) {
    patch.availability = currentAv.map((entry: any) => ({ ...entry, isOnline }));
  }
  await updateDoc(doc(db, "products", productId), patch);

  if (isOnline && sellerPhone) {
    const [rSnap, mSnap] = await Promise.all([
      getDoc(doc(db, "retailers", sellerPhone)),
      getDoc(doc(db, "manufacturers", sellerPhone)),
    ]);
    await Promise.all([
      rSnap.exists() ? setDoc(doc(db, "retailers", sellerPhone), { onlineDelivery: true, updatedAt: serverTimestamp() }, { merge: true }) : null,
      mSnap.exists() ? setDoc(doc(db, "manufacturers", sellerPhone), { onlineDelivery: true, updatedAt: serverTimestamp() }, { merge: true }) : null,
      // users/{phone} too: the Delivery Settings page gates its whole
      // charges/slabs UI on THIS copy of the flag (getUserProfile →
      // users/{phone}.onlineDelivery), so writing only the profile mirrors
      // above left the page locked even after an admin enabled delivery.
      setDoc(doc(db, "users", sellerPhone), { onlineDelivery: true, updatedAt: serverTimestamp() }, { merge: true }),
    ].filter(Boolean) as Promise<void>[]);
  }
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
  patch: { sellingPrice: number; stockQuantity: number; variants?: { unit: string; price: number; stock?: number }[] },
): Promise<void> {
  const now = serverTimestamp();
  const inStock = patch.stockQuantity > 0;
  const stockLabel = inStock ? 'In Stock' : 'Out of Stock';

  const pRef = doc(db, 'products', copyProductId);
  const pSnap = await getDoc(pRef);
  const data = (pSnap.exists() ? pSnap.data() : {}) as Record<string, any>;
  const av = Array.isArray(data.availability) && data.availability.length
    ? data.availability.map((a: any, i: number) =>
        i === 0 ? { ...a, sellingPrice: patch.sellingPrice, stockLevel: stockLabel, ...(patch.variants !== undefined ? { variants: patch.variants } : {}) } : a)
    : [{
        storeId: data.ownerId ?? data.retailerId ?? null,
        storePhone: data.retailerPhone ?? data.ownerPhone ?? null,
        storeName: data.store ?? null,
        stockLevel: stockLabel,
        sellingPrice: patch.sellingPrice,
        ...(patch.variants !== undefined ? { variants: patch.variants } : {}),
      }];

  const updateFields: any = {
    price: patch.sellingPrice,
    stock: stockLabel,
    availability: av,
    updatedAt: now,
  };
  if (patch.variants !== undefined) {
    updateFields.variants = patch.variants;
  }

  await updateDoc(pRef, updateFields);

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

  // Mirror the new price/stock into the CANONICAL product's availability[] entry —
  // that array (not the copy's own) is what the marketplace product page reads.
  const rootId = (data.manufacturerProductId ?? data.originalProductId) as string | undefined;
  if (rootId && rootId !== copyProductId) {
    await syncAvailabilityPriceStock(
      rootId,
      {
        ownerId: String(data.ownerId ?? data.retailerId ?? data.retailerDocId ?? ''),
        phone: String(data.retailerPhone ?? data.ownerPhone ?? ''),
      },
      patch.sellingPrice,
      stockLabel,
      patch.variants,
    ).catch(() => {});
  }
}

/**
 * Updates the matching seller's entry in a canonical product's `availability[]`
 * array with a new selling price and/or stock label. This keeps the
 * marketplace product page in sync when a seller (or admin) changes the price
 * on a product copy. Best-effort; matches by storeId/storePhone.
 */
export async function syncAvailabilityPriceStock(
  rootProductId: string,
  match: { ownerId: string; phone: string },
  sellingPrice: number,
  stockLevel: string,
  variants?: { unit: string; price: number; stock?: number }[],
): Promise<void> {
  const rootRef = doc(db, 'products', rootProductId);
  const snap = await getDoc(rootRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const availability = Array.isArray(data.availability)
    ? [...(data.availability as Record<string, unknown>[])]
    : [];
  if (!availability.length) return;

  let changed = false;
  const updated = availability.map((entry) => {
    const storeId = String(entry.storeId ?? '');
    const storePhone = String(entry.storePhone ?? '');
    const matches =
      (match.ownerId && (storeId === match.ownerId || storePhone === match.ownerId)) ||
      (match.phone && (storePhone === match.phone || storeId === match.phone));
    if (!matches) return entry;
    changed = true;
    const nextEntry = { ...entry, sellingPrice, stockLevel };
    if (variants !== undefined) {
      (nextEntry as any).variants = variants;
    }
    return nextEntry;
  });

  if (changed) await updateDoc(rootRef, { availability: updated });
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

export type RawProductDoc = Record<string, unknown> & { id: string };

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

/**
 * Fetches only the admin-assigned copy docs (source === 'admin_assigned') — the small
 * subset of the `products` collection the admin Products tab needs to compute "N sellers
 * assigned" badges and to deactivate stale duplicates on edit. A single-equality query,
 * so it stays cheap even though `products` itself is dominated by manufacturer_assigned
 * inventory copies (~95% of the collection) that this tab never needs to read.
 */
export async function fetchAdminAssignedCopies(): Promise<RawProductDoc[]> {
  const snap = await getDocs(query(collection(db, 'products'), where('source', '==', 'admin_assigned')));
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
      effectiveDiscountPct: Number(data.effectiveDiscountPct ?? 0),
      sellMode: data.sellMode as "online_delivery" | "offline_store_only" | undefined,
      isOnline: Boolean(data.isOnline),
      gstApplicable: Boolean(data.gstApplicable),
      gstRate: (data.gstRate ?? 0) as 0 | 5 | 12 | 18 | 28,
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

// ─── Homepage Banners ─────────────────────────────────────────────────────────
// Collection: banners/{bannerId}
//
// Drives the homepage hero carousel (app/views/HomeView.tsx). The schema is
// deliberately wider than what the current UI renders — badge/ctaButtons/
// countdown/video/schedule/analytics are reserved for future carousel
// features so they can be added without a document shape migration. Only
// `enabled && status === 'published'` banners render on the public site,
// sorted by `order` ascending.
export type BannerCtaLink = {
  /** 'internal' -> a Next.js route (e.g. /market); 'external' -> full URL, opened as-is. */
  type: 'internal' | 'external';
  value: string;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string;
  bgImg: string;
  /** Optional mobile-specific background; falls back to bgImg when unset. */
  bgImgMobile?: string;
  /** Optional foreground/product image shown beside the text block. */
  imgUrl?: string;
  /** Tailwind gradient classes applied over bgImg, e.g. "from-emerald-950 via-emerald-900/85 to-emerald-700/10". */
  bgClass: string;
  ctaLabel: string;
  ctaEnabled: boolean;
  ctaLink: BannerCtaLink;
  enabled: boolean;
  status: 'draft' | 'published';
  order: number;
  createdAt?: any;
  updatedAt?: any;
  // Reserved for future features — intentionally unused by the current UI.
  badge?: { label: string; color?: string };
  ctaButtons?: { label: string; link: BannerCtaLink }[];
  countdown?: { endsAt: any };
  video?: { url: string; poster?: string };
  schedule?: { startsAt?: any; endsAt?: any };
  analytics?: { impressions?: number; clicks?: number };
};

export async function fetchBanners(): Promise<Banner[]> {
  const snapshot = await getDocs(query(collection(db, 'banners'), orderBy('order', 'asc')));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Banner));
}

// Firestore's addDoc/setDoc reject a literal `undefined` field value outright
// (throws "Unsupported field value: undefined") rather than treating it as
// "omit this field" the way object spreads elsewhere in this file assume.
// Optional Banner fields (bgImgMobile, imgUrl) are built with `|| undefined`
// to mean "not set" — saveBanner (fresh doc) uses the shared stripUndefined()
// below since there's nothing to clear. updateBanner is a merge write onto an
// existing doc, where simply dropping the key would leave any previously
// saved value untouched (e.g. clearing "Mobile Background Image" back to
// empty would silently keep showing the old image), so it maps undefined to
// deleteField() instead, which actually removes the field from the document.
function undefinedToDeleteField(obj: Record<string, any>): Record<string, any> {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) out[key] = deleteField();
  }
  return out;
}

export async function saveBanner(banner: Omit<Banner, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'banners'), stripUndefined({
    ...banner,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function updateBanner(bannerId: string, banner: Partial<Omit<Banner, 'id'>>): Promise<void> {
  await setDoc(doc(db, 'banners', bannerId), undefinedToDeleteField({ ...banner, updatedAt: serverTimestamp() }), { merge: true });
}

export async function deleteBanner(bannerId: string): Promise<void> {
  await deleteDoc(doc(db, 'banners', bannerId));
}

export async function duplicateBanner(banner: Banner): Promise<string> {
  const { id, createdAt, updatedAt, ...rest } = banner;
  return saveBanner({
    ...rest,
    title: banner.title ? `${banner.title} (Copy)` : '',
    status: 'draft',
    order: banner.order + 1,
  });
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
    // Match Retailer Network dashboard logic: exclude only explicitly revoked/removed/inactive
    const activeMirrors = snap.docs.filter((d) => {
      const r = d.data();
      const status = String(r.status ?? 'invited');
      const onboarding = String(r.onboardingStatus ?? 'active');
      return (
        status !== 'revoked' &&
        onboarding !== 'removed' &&
        onboarding !== 'inactive'
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
  role?: string;
}

export async function saveContactMessage(
  name: string,
  email: string,
  message: string,
  extras?: { phone?: string; subject?: string; role?: string },
): Promise<string> {
  const ref = await addDoc(collection(db, 'contactMessages'), {
    name: name.trim(),
    email: email.trim(),
    message: message.trim(),
    ...(extras?.phone   ? { phone:   extras.phone.trim() } : {}),
    ...(extras?.subject ? { subject: extras.subject }      : {}),
    ...(extras?.role    ? { role:    extras.role }         : {}),
    createdAt: serverTimestamp(),
  });

  // Fire-and-forget email notification to admin. Failures are logged but never
  // surfaced to the user — the Firestore write above is the source of truth.
  const submittedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
  fetch("/api/email/support-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName:    name.trim(),
      phone:       extras?.phone?.trim() ?? "",
      role:        extras?.role ?? "",
      subject:     extras?.subject ?? "",
      message:     message.trim(),
      submittedAt,
    }),
  }).catch((err) => console.error("[support-message] email notification failed:", err));

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
      // This collection backs Admin -> Subscriptions -> Failed Payments, where
      // every row offers "Activate Subscription". Only subscription attempts
      // belong here; a failed product order goes to paymentAttempts instead
      // (Admin -> Payments), which also records what was in the basket.
      kind: 'subscription',
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
    // Product-order failures belong in Admin -> Payments, not here: every row
    // in this tab offers "Activate Subscription", which is meaningless for a
    // cart order. Mobile used to write both kinds into this one collection.
    // Rows predating the `kind` field are left visible rather than hidden,
    // since an untagged row cannot be proven to be an order.
    .filter((r: any) => r.kind !== 'cart')
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

// ─── Retailer → Manufacturer conversion ──────────────────────────────────────

/**
 * Converts a retailer account into a manufacturer account.
 * Copies the retailer's storefront doc to manufacturers/{phone}, updates
 * users/{phone}.role and profiles/{phone}.type, then deletes retailers/{phone}.
 * Products, subscriptions, inventory, and seat listings are all phone-keyed and
 * require no migration.
 */
export async function adminConvertRetailerToManufacturer(
  phone: string,
  callerUid: string,
): Promise<void> {
  const now = serverTimestamp();

  // Read existing retailer doc to copy into manufacturers/
  const retailerSnap = await getDoc(doc(db, "retailers", phone));
  const retailerData = retailerSnap.exists() ? retailerSnap.data() : {};

  const batch = writeBatch(db);

  // 1. Create manufacturers/{phone} from existing retailer data
  batch.set(doc(db, "manufacturers", phone), {
    ...retailerData,
    // Overwrite role-specific fields
    businessName: retailerData.businessName || retailerData.shopName || "",
    updatedAt: now,
    convertedFromRetailer: true,
    convertedByAdmin: callerUid,
    convertedAt: now,
  }, { merge: true });

  // 2. Update users/{phone}
  // Timestamp.now(), not serverTimestamp() — Firestore rejects sentinels inside
  // arrayUnion(). See adminConvertManufacturerToRetailer for the failure this
  // caused in the other direction.
  batch.set(doc(db, "users", phone), {
    role: "manufacturer",
    roleUpgradeHistory: arrayUnion({
      from: "retailer",
      to: "manufacturer",
      at: Timestamp.now(),
      byAdmin: callerUid,
    }),
    updatedAt: now,
  }, { merge: true });

  // 3. Update profiles/{phone}
  // `role` is the field readers use; `type` kept for back-compat.
  batch.set(doc(db, "profiles", phone), {
    role: "manufacturer",
    type: "manufacturer",
    updatedAt: now,
  }, { merge: true });

  await batch.commit();

  // 4. Delete old retailers/{phone} (non-batched — not critical if it fails)
  await deleteDoc(doc(db, "retailers", phone)).catch(() => {});
}

/**
 * Copies the manufacturer's storefront doc to retailers/{phone}, updates
 * users/{phone}.role and profiles/{phone}.type, then deletes manufacturers/{phone}.
 * Products, subscriptions, inventory, and seat listings are all phone-keyed and
 * require no migration.
 */
export async function adminConvertManufacturerToRetailer(
  phone: string,
  callerUid: string,
): Promise<void> {
  const now = serverTimestamp();

  // Read existing manufacturer doc to copy into retailers/
  const mfrSnap = await getDoc(doc(db, "manufacturers", phone));
  const mfrData = mfrSnap.exists() ? mfrSnap.data() : {};

  const batch = writeBatch(db);

  // 1. Create retailers/{phone} from existing manufacturer data
  batch.set(doc(db, "retailers", phone), {
    ...mfrData,
    shopName: mfrData.shopName || mfrData.businessName || "",
    updatedAt: now,
    convertedFromManufacturer: true,
    convertedByAdmin: callerUid,
    convertedAt: now,
  }, { merge: true });

  // 2. Update users/{phone}
  //
  // `at` uses Timestamp.now(), NOT serverTimestamp(). Firestore rejects sentinel
  // values inside arrayUnion() — passing serverTimestamp() here failed the whole
  // batch with "Function arrayUnion() called with invalid data", so the
  // conversion silently never happened. A client timestamp is fine for an audit
  // trail entry; only the top-level updatedAt needs server time.
  batch.set(doc(db, "users", phone), {
    role: "retailer",
    roleUpgradeHistory: arrayUnion({
      from: "manufacturer",
      to: "retailer",
      at: Timestamp.now(),
      byAdmin: callerUid,
    }),
    updatedAt: now,
  }, { merge: true });

  // 3. Update profiles/{phone}
  //
  // The profile's role field is `role` — that is what fetchStores() and the
  // store pages read. Writing only `type` left profiles.role saying
  // "manufacturer" after a conversion, so the locator kept classifying the
  // account as a manufacturer. `type` is still written for back-compat.
  batch.set(doc(db, "profiles", phone), {
    role: "retailer",
    type: "retailer",
    updatedAt: now,
  }, { merge: true });

  await batch.commit();

  // 4. Delete old manufacturers/{phone} (non-batched — not critical if it fails)
  await deleteDoc(doc(db, "manufacturers", phone)).catch(() => {});
}

// ─── Admin user deletion ──────────────────────────────────────────────────────

export type AdminDeleteUserResult = {
  productsDeactivated: number;
  inventoryDeleted: number;
  seatListingsDeleted: number;
  subscriptionsDeleted: number;
  networkRelationshipsDeleted: number;
};

/** Dedup-aware batch delete: collects doc refs into a Set then flushes in ≤400-write batches. */
async function batchDeleteDocs(
  refs: import("firebase/firestore").DocumentReference[],
): Promise<number> {
  if (refs.length === 0) return 0;
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const b = writeBatch(db);
    refs.slice(i, i + CHUNK).forEach((r) => b.delete(r));
    await b.commit();
  }
  return refs.length;
}

/**
 * Permanently deletes a user and all their data from the platform:
 *  - Deactivates their products (preserves order history)
 *  - Deletes all inventory records
 *  - Deletes all seat listings (any status)
 *  - Deletes all subscriptions (any status)
 *  - Deletes manufacturer-retailer relationship docs
 *  - Deletes brand/company pages, delivery settings, manufacturer contacts
 *  - Deletes subcollection mirrors (manufacturers/phone/retailers, /products, /inventory)
 *  - Removes user, profile, uidIndex, retailers/, manufacturers/ root docs
 *
 * Firebase Auth deletion is handled separately by POST /api/admin/delete-user
 * (requires Admin SDK) and should be called after this succeeds.
 */
export async function adminDeleteUser(
  phone: string,
  uid: string | null,
  role: string,
): Promise<AdminDeleteUserResult> {
  const now = serverTimestamp();
  let productsDeactivated = 0;

  // ── 1. Deactivate products (preserves order history — do not delete) ──────
  const productQueries = [
    getDocs(query(collection(db, "products"), where("ownerPhone", "==", phone))),
  ];
  if (uid) {
    productQueries.push(getDocs(query(collection(db, "products"), where("ownerId", "==", uid))));
  }
  const productSnaps = await Promise.all(productQueries);
  const productIds = new Set<string>();
  const productBatch = writeBatch(db);
  for (const snap of productSnaps) {
    for (const d of snap.docs) {
      if (productIds.has(d.id)) continue;
      productIds.add(d.id);
      if (d.data().isActive !== false) {
        productBatch.update(d.ref, { isActive: false, updatedAt: now });
        productsDeactivated++;
      }
    }
  }
  if (productsDeactivated > 0) await productBatch.commit();

  // ── 2. Delete inventory records ───────────────────────────────────────────
  const invQueries = [
    getDocs(query(collection(db, "inventory"), where("ownerPhone", "==", phone))),
  ];
  if (uid) {
    invQueries.push(getDocs(query(collection(db, "inventory"), where("ownerId", "==", uid))));
  }
  const invSnaps = await Promise.all(invQueries);
  const invIds = new Set<string>();
  const invRefs: import("firebase/firestore").DocumentReference[] = [];
  for (const snap of invSnaps) {
    for (const d of snap.docs) {
      if (invIds.has(d.id)) continue;
      invIds.add(d.id);
      invRefs.push(d.ref);
    }
  }
  const inventoryDeleted = await batchDeleteDocs(invRefs);

  // ── 3. Delete ALL seat listings (any status) ──────────────────────────────
  const seatQueries: Promise<import("firebase/firestore").QuerySnapshot>[] = [
    getDocs(query(collection(db, "retailerSeatListings"), where("ownerPhone", "==", phone))),
    getDocs(query(collection(db, "retailerSeatListings"), where("retailerPhone", "==", phone))),
  ];
  if (uid) {
    seatQueries.push(getDocs(query(collection(db, "retailerSeatListings"), where("ownerId", "==", uid))));
  }
  const seatSnaps = await Promise.all(seatQueries);
  const seatIds = new Set<string>();
  const seatRefs: import("firebase/firestore").DocumentReference[] = [];
  for (const snap of seatSnaps) {
    for (const d of snap.docs) {
      if (seatIds.has(d.id)) continue;
      seatIds.add(d.id);
      seatRefs.push(d.ref);
    }
  }
  const seatListingsDeleted = await batchDeleteDocs(seatRefs);

  // ── 4. Delete ALL subscriptions (any status) ─────────────────────────────
  const subQueries: Promise<import("firebase/firestore").QuerySnapshot>[] = [
    getDocs(query(collection(db, "subscriptions"), where("ownerPhone", "==", phone))),
  ];
  if (uid) {
    subQueries.push(getDocs(query(collection(db, "subscriptions"), where("ownerId", "==", uid))));
  }
  const subSnaps = await Promise.all(subQueries);
  const subIds = new Set<string>();
  const subRefs: import("firebase/firestore").DocumentReference[] = [];
  for (const snap of subSnaps) {
    for (const d of snap.docs) {
      if (subIds.has(d.id)) continue;
      subIds.add(d.id);
      subRefs.push(d.ref);
    }
  }
  const subscriptionsDeleted = await batchDeleteDocs(subRefs);

  // ── 5. Delete manufacturer-retailer relationship docs ─────────────────────
  // Cover all identity fields: manufacturer side (manufacturerId/Phone)
  // and retailer side (retailerDocId/Phone) so both roles are cleaned up.
  const mrQueries: Promise<import("firebase/firestore").QuerySnapshot>[] = [
    getDocs(query(collection(db, "manufacturerRetailers"), where("manufacturerPhone", "==", phone))),
    getDocs(query(collection(db, "manufacturerRetailers"), where("retailerDocId",     "==", phone))),
    getDocs(query(collection(db, "manufacturerRetailers"), where("retailerPhone",     "==", phone))),
  ];
  if (uid) {
    mrQueries.push(getDocs(query(collection(db, "manufacturerRetailers"), where("manufacturerId", "==", uid))));
  }
  const mrSnaps = await Promise.all(mrQueries);
  const mrIds = new Set<string>();
  const mrRefs: import("firebase/firestore").DocumentReference[] = [];
  for (const snap of mrSnaps) {
    for (const d of snap.docs) {
      if (mrIds.has(d.id)) continue;
      mrIds.add(d.id);
      mrRefs.push(d.ref);
    }
  }
  const networkRelationshipsDeleted = await batchDeleteDocs(mrRefs);

  // ── 6. Delete profile pages, delivery settings, contacts ─────────────────
  const miscDeletions: Promise<void>[] = [
    // Brand / company pages (phone-keyed and query-based)
    deleteDoc(doc(db, "brandPages",   phone)).catch(() => {}),
    deleteDoc(doc(db, "companyPages", phone)).catch(() => {}),
    // Delivery settings (always phone-keyed)
    deleteDoc(doc(db, "deliverySettings", phone)).catch(() => {}),
    // Carts (phone-keyed)
    deleteDoc(doc(db, "carts", phone)).catch(() => {}),
  ];
  if (uid) {
    miscDeletions.push(deleteDoc(doc(db, "brandPages",   uid)).catch(() => {}));
    miscDeletions.push(deleteDoc(doc(db, "companyPages", uid)).catch(() => {}));
  }
  // Brand/company pages stored with ownerPhone field
  const bpSnap  = await getDocs(query(collection(db, "brandPages"),   where("ownerPhone", "==", phone))).catch(() => null);
  const cpSnap  = await getDocs(query(collection(db, "companyPages"), where("ownerPhone", "==", phone))).catch(() => null);
  // manufacturer_contacts (manufacturers only — keyed by manufacturerId)
  const mcSnap  = uid
    ? await getDocs(query(collection(db, "manufacturer_contacts"), where("manufacturerId", "==", uid))).catch(() => null)
    : null;
  await Promise.all(miscDeletions);
  const miscRefs: import("firebase/firestore").DocumentReference[] = [];
  for (const snap of [bpSnap, cpSnap, mcSnap]) {
    if (!snap) continue;
    for (const d of snap.docs) miscRefs.push(d.ref);
  }
  await batchDeleteDocs(miscRefs);

  // ── 7. Delete subcollection mirrors ──────────────────────────────────────
  // manufacturers/{phone}/retailers, /products, /inventory
  // retailers/{phone}/products, /inventory
  const subcollectionPaths: string[] = [
    `manufacturers/${phone}/retailers`,
    `manufacturers/${phone}/products`,
    `manufacturers/${phone}/inventory`,
    `retailers/${phone}/products`,
    `retailers/${phone}/inventory`,
  ];
  if (uid) {
    subcollectionPaths.push(
      `manufacturers/${uid}/retailers`,
      `manufacturers/${uid}/products`,
      `manufacturers/${uid}/inventory`,
      `retailers/${uid}/products`,
      `retailers/${uid}/inventory`,
    );
  }
  const subcollSnaps = await Promise.all(
    subcollectionPaths.map((p) => {
      const [col, id, sub] = p.split("/");
      return getDocs(collection(db, col!, id!, sub!)).catch(() => null);
    }),
  );
  const subCollRefs: import("firebase/firestore").DocumentReference[] = [];
  const subCollIds = new Set<string>();
  for (const snap of subcollSnaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (subCollIds.has(d.ref.path)) continue;
      subCollIds.add(d.ref.path);
      subCollRefs.push(d.ref);
    }
  }
  await batchDeleteDocs(subCollRefs);

  // ── 8. Delete root identity documents ────────────────────────────────────
  const rootDeletions: Promise<void>[] = [
    deleteDoc(doc(db, "users",         phone)).catch(() => {}),
    deleteDoc(doc(db, "profiles",      phone)).catch(() => {}),
    deleteDoc(doc(db, "retailers",     phone)).catch(() => {}),
    deleteDoc(doc(db, "manufacturers", phone)).catch(() => {}),
  ];
  if (uid) {
    rootDeletions.push(deleteDoc(doc(db, "uidIndex",      uid)).catch(() => {}));
    rootDeletions.push(deleteDoc(doc(db, "users",         uid)).catch(() => {}));
    rootDeletions.push(deleteDoc(doc(db, "retailers",     uid)).catch(() => {}));
    rootDeletions.push(deleteDoc(doc(db, "manufacturers", uid)).catch(() => {}));
  }
  await Promise.all(rootDeletions);

  return { productsDeactivated, inventoryDeleted, seatListingsDeleted, subscriptionsDeleted, networkRelationshipsDeleted };
}

// ── WhatsApp Incoming Messages ────────────────────────────────────────────────

export interface WaIncomingMessage {
  id: string;
  phone: string;
  waId: string;
  messageText: string;
  messageType: string;
  timestamp: any;
  receivedAt: any;
  rawPayload?: any;
  mediaId?: string | null;
  mimeType?: string | null;
}

export interface WaResolvedUser {
  name: string;
  businessName: string;
  // "consumer" (mobile app) is normalised to "customer" before this reaches the UI
  role: "retailer" | "manufacturer" | "salesExecutive" | "admin" | "customer" | "farmer" | "unknown";
}

export interface WaConvMeta {
  phone: string;
  status: "open" | "resolved";
  unreadCount: number;
  lastIncomingAt?: any;
  lastIncomingText?: string;
  lastOutgoingAt?: any;
  lastOutgoingText?: string;
  resolvedAt?: any;
  updatedAt?: any;
}

export interface WaOutMessage {
  id: string;
  direction: "outgoing";
  text: string | null;
  messageType: string;
  timestamp: any;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  sentBy: string;
  // document-specific (optional)
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  mediaId?: string | null;
}

export interface WaNote {
  id: string;
  text: string;
  createdAt: any;
  createdBy: string;
}

// Normalise any role string coming out of Firestore to a known WaResolvedUser role.
// "consumer" is the mobile-app alias for "customer" and must resolve the same way.
function normalizeWaRole(raw: string): WaResolvedUser["role"] {
  switch (raw.toLowerCase().trim()) {
    case "retailer":       return "retailer";
    case "manufacturer":   return "manufacturer";
    case "salesexecutive": return "salesExecutive";
    case "admin":          return "admin";
    case "customer":
    case "consumer":       return "customer";
    case "farmer":         return "farmer";
    default:               return "unknown";
  }
}

export async function resolveWaUserByPhone(phone: string): Promise<WaResolvedUser | null> {
  // Build the full candidate set.
  //
  // The critical addition is `+${digits}` — saveUserProfile() calls toE164() which
  // returns "+91XXXXXXXXXX" (WITH the leading plus), so user documents are stored
  // at users/+919876543210, not users/919876543210. Without this candidate the
  // lookup always misses for consumers/customers and any web-onboarded user.
  const digits = phone.replace(/\D/g, "");
  const tenDigit = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  const withPlus = `+${digits}`;
  const withPlusFull = `+91${tenDigit}`;

  const candidates = Array.from(new Set([
    phone,          // as-is from Meta webhook ("919876543210")
    digits,         // stripped of non-digits (same as above for Meta format)
    withPlus,       // "+919876543210" — what saveUserProfile/toE164 writes ← KEY FIX
    withPlusFull,   // "+91" + 10-digit — handles edge-case format variance
    tenDigit,       // "9876543210" — 10-digit for admin-pre-created accounts
  ]));

  console.log(`[WA Resolve] phone="${phone}" candidates:`, candidates);

  for (const p of candidates) {
    const userSnap = await getDoc(doc(db, "users", p));
    if (userSnap.exists()) {
      const d = userSnap.data() as any;
      const rawRole = String(d.role ?? "");
      const result: WaResolvedUser = {
        name: d.name || d.ownerName || d.fullName || "",
        businessName: d.shopName || d.businessName || "",
        role: normalizeWaRole(rawRole),
      };
      console.log(`[WA Resolve] HIT users/${p} → name="${result.name}" role="${rawRole}"→"${result.role}"`);
      return result;
    }
  }

  for (const p of candidates) {
    const retailerSnap = await getDoc(doc(db, "retailers", p));
    if (retailerSnap.exists()) {
      const d = retailerSnap.data() as any;
      const result: WaResolvedUser = {
        name: d.name || d.ownerName || "",
        businessName: d.shopName || d.businessName || "",
        role: "retailer",
      };
      console.log(`[WA Resolve] HIT retailers/${p} → name="${result.name}"`);
      return result;
    }
  }

  for (const p of candidates) {
    const mfrSnap = await getDoc(doc(db, "manufacturers", p));
    if (mfrSnap.exists()) {
      const d = mfrSnap.data() as any;
      const result: WaResolvedUser = {
        name: d.name || d.ownerName || "",
        businessName: d.businessName || d.shopName || "",
        role: "manufacturer",
      };
      console.log(`[WA Resolve] HIT manufacturers/${p} → name="${result.name}"`);
      return result;
    }
  }

  console.log(`[WA Resolve] MISS — no document found for any candidate`);
  return null;
}

export async function fetchReels(limitCount = 10): Promise<any[]> {
  try {
    const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('Error fetching reels:', err);
    return [];
  }
}
