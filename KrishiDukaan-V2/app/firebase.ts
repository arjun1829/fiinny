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
  updateDoc,
  where,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
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

// Initialize analytics safely
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  });
}

export { db, auth };

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
  await setDoc(
    doc(db, 'retailers', retailerId),
    {
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
  const userRef = doc(db, 'users', retailerId);
  await setDoc(userRef, {
    productCount: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
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
          availability: data.availability || undefined
        } as MarketplaceProduct;
      })
      .filter((product) => product.name && product.image && Number.isFinite(product.price));
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
    const storesSnapshot = await getDocs(collection(db, 'stores'));
    const retailersSnapshot = await getDocs(collection(db, 'retailers'));
    
    const stores = storesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    } as Store));

    const retailers = retailersSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
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
      } as Store;
    });

    return [...stores, ...retailers];
  } catch (error) {
    console.error('Error fetching stores from Firestore:', error);
    throw error;
  }
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
  await setDoc(doc(db, 'users', uid), {
    ...profile,
    isPaid: false,
    totalSeats: 0,
    productCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function getUserProfile(uid: string) {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}

export async function updateSubscriptionStatus(
  uid: string,
  status: 'paid' | 'unpaid',
  paymentDetails?: any,
  seatCount: number = 1
): Promise<{ profileUpdated: true; paymentLogged: boolean; paymentLogError?: string }> {
  const docRef = doc(db, 'users', uid);
  const timestamp = serverTimestamp();
  
  // Get current user profile to update seats
  const userDoc = await getDoc(docRef);
  const userData = userDoc.exists() ? userDoc.data() : {};
  const currentSeats = userData.totalSeats || 0;

  // 1. Update user profile
  await setDoc(docRef, {
    isPaid: status === 'paid',
    subscriptionStatus: status,
    paymentDetails: paymentDetails || null,
    totalSeats: status === 'paid' ? currentSeats + seatCount : currentSeats,
    updatedAt: timestamp
  }, { merge: true });

  // 2. Create payment + subscription records for tracking
  if (status === 'paid') {
    try {
      await addDoc(collection(db, 'payments'), {
        userId: uid,
        amount: seatCount * 21,
        seatCount: seatCount,
        currency: 'INR',
        razorpayOrderId: paymentDetails?.orderId,
        razorpayPaymentId: paymentDetails?.paymentId,
        timestamp: timestamp,
        status: 'success'
      });

      // Write to subscriptions collection — one record per payment, never overwrite
      const now = new Date();
      const expiry = new Date(now);
      expiry.setMonth(expiry.getMonth() + 1); // 1-month seat validity
      const { Timestamp: FsTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'subscriptions'), {
        ownerId: uid,
        ownerType: 'manufacturer',
        planName: 'Standard',
        seatsPurchased: seatCount,
        amountPaid: seatCount * 21,
        currency: 'INR',
        razorpayOrderId: paymentDetails?.orderId ?? null,
        razorpayPaymentId: paymentDetails?.paymentId ?? null,
        subscriptionStatus: 'active',
        startDate: FsTimestamp.fromDate(now),
        expiryDate: FsTimestamp.fromDate(expiry),
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
  const userRef = doc(db, 'users', manufacturerId);
  await setDoc(userRef, {
    productCount: increment(1),
    updatedAt: serverTimestamp()
  }, { merge: true });
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

export async function syncInitialData(products: any[], stores: any[], inventory: any[] = []) {
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
    console.error('Firebase Sync Error (Check your Firestore Rules):', error);
    throw error;
  }
}

export interface Hub {
  id: string;
  name: string;
  heroImage: string;
  tagline: string;
  seeds: { name: string; price: number; img: string }[];
  nutrition: { name: string; desc: string; icon: string }[];
  irrigation: { image: string; items: { name: string; price: string }[] };
  advisory: { title: string; description: string };
  growthStages?: { phase: string; duration: string; description: string; products: string[] }[];
  commonMistakes?: string[];
  idealClimate?: string;
  soilType?: string;
  waterNeeds?: string;
  bestSeason?: string;
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
  const ref = await addDoc(collection(db, 'hubs'), { ...hub, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateHub(hubId: string, hub: Partial<Omit<Hub, 'id'>>): Promise<void> {
  await setDoc(doc(db, 'hubs', hubId), { ...hub, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteHub(hubId: string): Promise<void> {
  await deleteDoc(doc(db, 'hubs', hubId));
}
