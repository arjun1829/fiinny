import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDh_Y67TDJc2KLLJ8Wcc2JvEeHzmfVL778",
  authDomain: "krishidukan-e8315.firebaseapp.com",
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
  const userProfileDocId = await resolveUserProfileDocId(uid);
  if (userProfileDocId) {
    try {
      const userSnap = await getDoc(doc(db, 'users', userProfileDocId));
      if (userSnap.exists()) {
        const retailerDocId = String(userSnap.data()?.retailerDocId ?? '').trim();
        if (retailerDocId) return retailerDocId;
      }
    } catch {
      // fall through
    }
  }
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
import type { CartItem, OrderDoc, OrderStatus, SellerType } from '../types/order';

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

  await addDoc(collection(db, 'retailers'), {
    ownerName: payload.ownerName.trim(),
    shopName: payload.shopName.trim(),
    phone: payload.phone.trim(),
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
  });
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

  const sellMode = product.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only";
  // 1. Create the product
  await addDoc(collection(db, 'products'), {
    retailerId,
    name: product.name.trim(),
    fullName: product.name.trim(),
    price: Number(product.price),
    category: product.category.trim() || 'general',
    description: product.description.trim(),
    image: product.image.trim(),
    stock: product.stock.trim() || 'In Stock',
    store: product.store.trim(),
    distance: product.distance.trim() || 'Nearby',
    sellMode,
    isOnline: sellMode === "online_delivery",
    source: 'retailer',
    createdAt: serverTimestamp()
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

export async function fetchMarketplaceProducts(): Promise<MarketplaceProduct[]> {
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    return snapshot.docs
      .map((item) => {
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
          manufacturerId: data.manufacturerId ? String(data.manufacturerId) : undefined,
          sellMode: data.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only",
          isOnline: data.isOnline === true || data.sellMode === "online_delivery",
          availability: data.availability || undefined,
          source: data.source ? String(data.source) : undefined,
        } as MarketplaceProduct;
      })
      // Exclude per-retailer copies — they are represented by the original product's
      // availability[] array, so they would appear as duplicates in the marketplace.
      .filter((product) =>
        product.name &&
        product.image &&
        Number.isFinite(product.price) &&
        (product as any).source !== 'manufacturer_assigned' &&
        (product as any).source !== 'retailer_inventory_copy'
      );
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
  location: { lat: number; lng: number };
};

export async function fetchStores(): Promise<Store[]> {
  try {
    const [storesSnapshot, retailersSnapshot, manufacturersSnapshot] = await Promise.all([
      getDocs(collection(db, 'stores')),
      getDocs(collection(db, 'retailers')),
      getDocs(collection(db, 'manufacturers')),
    ]);

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
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        distance: 'Nearby',
        status: data.status || 'Active',
        stock: Array.isArray(data.products) ? data.products.map((p: any) => p.name || p) : [],
        location: {
          lat: data.location?.latitude ?? data.location?.lat ?? 0,
          lng: data.location?.longitude ?? data.location?.lng ?? 0
        }
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
          name: data.businessName || data.ownerName || 'Manufacturer',
          ownerName: data.ownerName,
          phone: data.phone,
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
        } as Store;
      });

    return [...stores, ...dedupedRetailers, ...manufacturers];
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
    // ownerId == manufacturerId returns only own products — assigned copies now belong to retailer
    const q = query(
      collection(db, 'products'),
      where('ownerId', '==', manufacturerId),
      where('ownerType', '==', 'manufacturer'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketplaceProduct));
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
  const userProfileDocId = await resolveUserProfileDocId(manufacturerId);

  // 1. Create the product — strip any stale ownership fields from the input
  const { retailerId: _r, ownerType: _ot, ownerId: _oi, store: _s, distance: _d, stock: _st, ...rest } = product;
  const sellMode = product?.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only";
  
  await addDoc(collection(db, 'products'), {
    ...rest,
    ownerId: manufacturerId,
    ownerType: 'manufacturer',
    createdBy: manufacturerId,
    manufacturerId,
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
    if (item.sellMode !== "online_delivery") return;
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
    }));
    const subtotal = Number(
      normalizedItems.reduce((sum, row) => sum + row.lineTotal, 0).toFixed(2)
    );

    const ref = await addDoc(collection(db, "orders"), {
      customerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      sellerId,
      sellerType,
      items: normalizedItems,
      subtotal,
      deliveryMode: "delivery",
      status: "placed",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    createdOrderIds.push(ref.id);
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
    updatedAt: serverTimestamp(),
  });
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


export async function trackProductImpression(productId: string, position: number) {
  try {
    const ref = doc(db, 'products', productId);
    await updateDoc(ref, {
      impressions: increment(1),
      positionSum: increment(position)
    });
  } catch (error) {
    // Silent fail for analytics
    console.warn('Impression track failed', error);
  }
}

export async function trackProductClick(productId: string) {
  try {
    const ref = doc(db, 'products', productId);
    await updateDoc(ref, {
      clicks: increment(1)
    });
  } catch (error) {
    // Silent fail for analytics
    console.warn('Click track failed', error);
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
}): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.email !== undefined) payload.email = updates.email.trim().toLowerCase();
  if (updates.phone !== undefined) payload.phone = updates.phone.trim();
  if (updates.role !== undefined) {
    payload.role = updates.role;
    if (updates.role === 'admin') payload.isPaid = true;
  }
  await setDoc(doc(db, 'users', uid), payload, { merge: true });
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
