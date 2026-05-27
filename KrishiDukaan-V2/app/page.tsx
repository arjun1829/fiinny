/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client'

import { useEffect, useState, useMemo, useCallback } from 'react';
import { ICONS, PRODUCTS, STORES, INVENTORY, MANUFACTURERS } from './constants';
import HomeView from './views/HomeView';
import MarketView from './views/MarketView';
import HubView from './views/HubView';
import ProductDetailView from './views/ProductDetailView';
import StoreLocatorView from './views/StoreLocatorView';
import ProfileView from './views/ProfileView';
import AboutView from './views/AboutView';
import LoginView from './views/LoginView';
import SignupView from './views/SignupView';
import SubscriptionView from './views/SubscriptionView';
import CartView from './views/CartView';
import BrandView from './views/BrandView';
import HelpView from './views/HelpView';
import { fetchManufacturerProfile } from './dashboard/_lib/brand-page-firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, fetchMarketplaceProducts, fetchStores, syncInitialData, getUserProfile, fetchHubs, createOrdersFromCart, trackPageView } from './firebase';
import { acceptManufacturerInvite } from './lib/invite/invite-acceptance-service';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { MarketplaceProduct } from '../types/product';
import { LatLng } from './utils/haversine';
import { getUserLocation, DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, GeoResult } from './utils/geolocation';
import { computeStoreDistances } from './utils/nearby';
import type { CartItem } from '../types/order';

import { Navbar } from '../components/shared/navbar';
import Footer from '../components/shared/footer';
import { GuidedTour, TourStep } from '../components/helpers';
import { useI18n } from './i18n/I18nContext';

type View = 'home' | 'market' | 'hub' | 'product' | 'map' | 'about' | 'profile' | 'login' | 'signup' | 'subscription' | 'cart' | 'brand' | 'help';
type UserRole = 'customer' | 'retailer' | 'manufacturer';
type UserProfile = {
  name: string;
  phone: string;
  email: string;
  isPaid?: boolean;
  totalSeats?: number;
  productCount?: number;
};

const VALID_VIEWS: View[] = ['home', 'market', 'hub', 'product', 'map', 'about', 'profile', 'login', 'signup', 'subscription', 'cart', 'brand', 'help'];
const HOME_PRODUCTS_LIMIT = 12;

// Redirects /?view=brand&manufacturer=PHONE to the canonical /brand/{slug} route.
// Falls back to a "not found" message if the manufacturer has no slug set up yet.
function BrandPageRedirect({ phone }: { phone: string }) {
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!phone) { setNotFound(true); return; }
    fetchManufacturerProfile(phone)
      .then((mfr) => {
        const slug = mfr?.slug as string | undefined;
        if (slug) {
          window.location.replace(`/brand/${slug}`);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true));
  }, [phone]);

  if (notFound) {
    return (
      <div className="flex flex-col h-60 items-center justify-center gap-3 text-sm text-on-surface-variant px-6 text-center">
        <p className="font-semibold text-on-surface">Brand page not found</p>
        <p className="text-xs">This manufacturer hasn&apos;t set up their brand page yet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-60 items-center justify-center gap-2 text-sm text-on-surface-variant">
      <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
      Loading brand page…
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string | null>(null);
  const [mapFilterProductId, setMapFilterProductId] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('Pune, Maharashtra');
  const [coordinates, setCoordinates] = useState({ lat: 18.5204, lng: 73.8567 }); // Default Pune
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [maxDistance, setMaxDistance] = useState(1000);
  const [showFilters, setShowFilters] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'none' | 'price-low' | 'price-high'>('none');
  
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>('customer');
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', phone: '', email: '', isPaid: false });
  
  const [allProducts, setAllProducts] = useState<MarketplaceProduct[]>([]);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutInfo, setCheckoutInfo] = useState({
    customerName: "",
    customerPhone: "",
    customerAddress: "",
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Preserved `inviteCode` query param for manufacturer → retailer signup links (legacy `invite` also read). */
  const [signupInviteCode, setSignupInviteCode] = useState<string | null>(null);
  /** Result of auto-accepting an invite for an already-logged-in user. */
  const [inviteAccept, setInviteAccept] = useState<{
    status: 'accepting' | 'success' | 'already_accepted' | 'error';
    message?: string;
  } | null>(null);

  const resolveViewForAccess = useCallback((view: View): View => {
    if (
      (userRole === 'retailer' || userRole === 'manufacturer') &&
      !userProfile.isPaid &&
      view !== 'home' &&
      view !== 'about' &&
      view !== 'subscription' &&
      view !== 'login' &&
      view !== 'signup' &&
      view !== 'help'
    ) {
      return 'subscription';
    }
    return view;
  }, [userRole, userProfile.isPaid]);

  const buildUrl = useCallback(
    (
      view: View,
      productId?: string | null,
      storeId?: string | null,
      inviteCodeParam?: string | null,
      hubId?: string | null,
      manufacturerId?: string | null,
    ) => {
      const params = new URLSearchParams();
      if (view !== 'home') params.set('view', view);
      if (productId) params.set('product', productId);
      if (storeId) params.set('store', storeId);
      if (hubId) params.set('hub', hubId);
      if (manufacturerId) params.set('manufacturer', manufacturerId);
      const code =
        inviteCodeParam === undefined
          ? signupInviteCode?.trim() || null
          : inviteCodeParam?.trim() || null;
      if (code) params.set("inviteCode", code);
      const query = params.toString();
      return query ? `/?${query}` : '/';
    },
    [signupInviteCode],
  );

  const readRouteFromUrl = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        view: 'home' as View,
        productId: null as string | null,
        storeId: null as string | null,
        inviteCode: null as string | null,
        hubId: null as string | null,
      };
    }

    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    let view = VALID_VIEWS.includes(viewParam as View) ? (viewParam as View) : 'home';
    const inviteCode =
      params.get("inviteCode")?.trim() || params.get("invite")?.trim() || null;
    if (inviteCode && view === 'home') {
      view = 'signup';
    }

    return {
      view,
      productId: params.get('product'),
      storeId: params.get('store'),
      inviteCode,
      hubId: params.get('hub'),
      manufacturerId: params.get('manufacturer')?.replace(/^ /, '+') ?? null,
    };
  }, []);

  const navigate = useCallback(
    (
      view: View,
      options?: {
        productId?: string | null;
        storeId?: string | null;
        hubId?: string | null;
        manufacturerId?: string | null;
        replace?: boolean;
        clearInvite?: boolean;
      },
    ) => {
      const nextView = resolveViewForAccess(view);
      const nextProductId = options?.productId ?? (nextView === 'product' ? selectedProductId : null);
      const nextStoreId = options?.storeId ?? (nextView === 'map' ? selectedStoreId : null);
      const nextHubId = options?.hubId ?? (nextView === 'hub' ? selectedHubId : null);
      const nextManufacturerId = options?.manufacturerId ?? (nextView === 'brand' ? selectedManufacturerId : null);

      if (options?.clearInvite) {
        setSignupInviteCode(null);
      }

      setCurrentView(nextView);
      setSelectedProductId(nextProductId);
      setSelectedStoreId(nextStoreId);
      setSelectedHubId(nextHubId);
      setSelectedManufacturerId(nextManufacturerId);
      window.scrollTo({ top: 0, behavior: 'instant' });

      if (typeof window !== 'undefined') {
        const inviteForUrl = options?.clearInvite ? null : undefined;
        const nextUrl = buildUrl(nextView, nextProductId, nextStoreId, inviteForUrl, nextHubId, nextManufacturerId);
        if (options?.replace) {
          window.history.replaceState(null, '', nextUrl);
        } else {
          window.history.pushState(null, '', nextUrl);
        }
        // Always scroll to top when navigating
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    },
    [buildUrl, resolveViewForAccess, selectedProductId, selectedStoreId, selectedHubId, selectedManufacturerId],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const route = readRouteFromUrl();
    const routeView = resolveViewForAccess(route.view);
    setSignupInviteCode(route.inviteCode);
    setCurrentView(routeView);
    setSelectedProductId(route.productId);
    setSelectedStoreId(route.storeId);
    setSelectedHubId(route.hubId);
    setSelectedManufacturerId(route.manufacturerId);
    window.history.replaceState(null, '', buildUrl(routeView, route.productId, route.storeId, route.inviteCode, route.hubId, route.manufacturerId));

    const onPopState = () => {
      const next = readRouteFromUrl();
      setSignupInviteCode(next.inviteCode);
      setCurrentView(resolveViewForAccess(next.view));
      setSelectedProductId(next.productId);
      setSelectedStoreId(next.storeId);
      setSelectedHubId(next.hubId);
      setSelectedManufacturerId(next.manufacturerId);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [buildUrl, readRouteFromUrl, resolveViewForAccess]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("krishidukan_cart_v1");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CartItem[];
      if (Array.isArray(parsed)) setCartItems(parsed);
    } catch {
      // ignore malformed local cart
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("krishidukan_cart_v1", JSON.stringify(cartItems));
  }, [cartItems]);

  // Auto-accept invite for already-logged-in users who click an invite link.
  // Fires whenever both user and signupInviteCode become non-null.
  useEffect(() => {
    if (!user || !signupInviteCode) return;
    const code = signupInviteCode;
    setSignupInviteCode(null); // clear immediately so effect doesn't re-run
    setInviteAccept({ status: 'accepting' });
    acceptManufacturerInvite({ uid: user.uid, inviteCode: code })
      .then((result) => {
        if (!result.ok) {
          const msg = (result as { ok: false; message: string }).message;
          const isAlreadyUsed = /already|active/i.test(msg);
          setInviteAccept({ status: isAlreadyUsed ? 'already_accepted' : 'error', message: msg });
          return;
        }
        if (result.alreadyActive) {
          setInviteAccept({ status: 'already_accepted' });
        } else {
          setInviteAccept({ status: 'success' });
          setTimeout(() => { window.location.href = '/dashboard'; }, 1800);
        }
      })
      .catch(() =>
        setInviteAccept({ status: 'error', message: 'Could not accept invite. Please try again.' })
      );
  }, [user, signupInviteCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Geolocation state ---
  const [userLocation, setUserLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LOCATION_LABEL);
  const [locationSource, setLocationSource] = useState<'browser' | 'cached' | 'default'>('default');

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      trackPageView('home');

      console.log('Fetching products, stores and hubs...');
      let products = await fetchMarketplaceProducts();
      let stores = await fetchStores();
      let fetchedHubs = await fetchHubs();

      if (products.length === 0 || stores.length === 0 || fetchedHubs.length === 0) {
        console.log('Firebase data incomplete, attempting sync...', { 
          productsCount: products.length, 
          storesCount: stores.length,
          hubsCount: fetchedHubs.length
        });
        await syncInitialData(PRODUCTS, STORES, INVENTORY);
        // Fetch again after sync
        products = await fetchMarketplaceProducts();
        stores = await fetchStores();
        fetchedHubs = await fetchHubs();
      }

      console.log('Data loaded successfully:', { 
        products: products.length, 
        stores: stores.length,
        hubs: fetchedHubs.length
      });
      setAllProducts(products);
      setAllStores(stores);
      setHubs(fetchedHubs);
      
      if (products.length === 0) {
        setErrorMsg('No products found in database even after sync. Please check your Firestore rules.');
      }
    } catch (error: any) {
      console.error('Failed to load data from Firebase:', error);
      setErrorMsg(`Firebase Connection Error: ${error.message || 'Unknown error'}. Check your browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Firebase Auth Listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const profileData = await getUserProfile(firebaseUser.uid);
        if (profileData) {
          setUserRole(profileData.role as UserRole);
          const isPaid = profileData.isPaid || false;
          setUserProfile({
            name: profileData.name || '',
            email: profileData.email || firebaseUser.email || '',
            phone: profileData.phone || '',
            isPaid: isPaid,
            totalSeats: profileData.totalSeats || 0,
            productCount: profileData.productCount || 0
          });
          setCheckoutInfo((prev) => ({
            customerName: prev.customerName || profileData.name || "",
            customerPhone: prev.customerPhone || profileData.phone || "",
            customerAddress: prev.customerAddress || profileData.address || "",
          }));

          // Paywall: only block if not paid AND not an invited retailer.
          // Invited retailers have isPaid set to true by the backfill; if it hasn't
          // propagated yet (race), also allow if they have a retailerDocId (invited).
          const isInvitedRetailer = profileData.role === 'retailer' && !!(profileData as any).retailerDocId;
          if ((profileData.role === 'retailer' || profileData.role === 'manufacturer') && !isPaid && !isInvitedRetailer) {
            setCurrentView('subscription');
          }
        }
      } else {
        setUser(null);
        setUserRole('customer');
        setUserProfile({ name: '', phone: '', email: '', isPaid: false });
      }
    });

    void loadData();

    // Detect user location
    getUserLocation().then((result: GeoResult) => {
      setUserLocation(result.coords);
      setLocationLabel(result.label);
      setLocationSource(result.source);
      setLocationQuery(result.label);
      setCoordinates(result.coords);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (firebaseUser: any, profile: any) => {
    setUser(firebaseUser);
    setUserRole(profile.role);
    const isPaid = profile.isPaid || false;
    setUserProfile({
      name: profile.name,
      email: profile.email,
      phone: profile.phone || '',
      isPaid: isPaid,
      totalSeats: profile.totalSeats || 0,
      productCount: profile.productCount || 0
    });

    if ((profile.role === 'retailer' || profile.role === 'manufacturer') && !isPaid) {
      // Keep invite code in state so the auto-accept effect can claim it after redirect
      navigate('subscription', { replace: true });
    } else if ((profile.role === 'retailer' || profile.role === 'manufacturer') && isPaid) {
      window.location.href = '/dashboard';
    } else {
      navigate('home', { replace: true });
    }
  };

  const handleSubscriptionSuccess = async () => {
    if (user) {
      const profileData = await getUserProfile(user.uid);
      if (profileData) {
        setUserProfile({
          name: profileData.name || '',
          email: profileData.email || user.email || '',
          phone: profileData.phone || '',
          isPaid: profileData.isPaid || false,
          totalSeats: profileData.totalSeats || 0,
          productCount: profileData.productCount || 0,
        });
        if (profileData.role === 'retailer' || profileData.role === 'manufacturer') {
          window.location.href = '/dashboard';
          return;
        }
      } else {
        setUserProfile(prev => ({ ...prev, isPaid: true }));
      }
    } else {
      setUserProfile(prev => ({ ...prev, isPaid: true }));
    }

    if (userRole === 'retailer' || userRole === 'manufacturer') {
      window.location.href = '/dashboard';
    } else {
      navigate('profile', { replace: true });
    }
  };

  const handleProfileSave = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('home', { replace: true, clearInvite: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Always include constant-defined manufacturer products/stores not yet in Firebase
  const mergedProducts = useMemo(() => {
    const fbIds = new Set(allProducts.map((p) => p.id));
    const constManufacturerProducts = PRODUCTS.filter(
      (p) => p.manufacturerId && !fbIds.has(p.id)
    );
    return constManufacturerProducts.length > 0
      ? [...allProducts, ...constManufacturerProducts]
      : allProducts;
  }, [allProducts]);

  const mergedStores = useMemo(() => {
    const fbIds = new Set(allStores.map((s) => s.id));
    const constManufacturerStores = STORES.filter(
      (s) => Object.values(MANUFACTURERS).some((m) => m.storeIds.includes(s.id)) && !fbIds.has(s.id)
    );
    return constManufacturerStores.length > 0
      ? [...allStores, ...constManufacturerStores]
      : allStores;
  }, [allStores]);

  const storeNameById = useMemo(() => {
    return new Map(
      mergedStores.map((store) => [
        String(store.id),
        String(store.name || store.shopName || store.ownerName || '')
      ])
    );
  }, [mergedStores]);

  const storesWithDistance = useMemo(
    () => computeStoreDistances(mergedStores, coordinates),
    [mergedStores, coordinates]
  );

  const productsWithDistance = useMemo(() => {
    const storeMap = new Map(storesWithDistance.map(s => [s.name, s]));
    const storeIdMap = new Map(storesWithDistance.map(s => [s.id, s]));

    return mergedProducts.map(product => {
      let minDistance = Infinity;
      let distanceLabel = 'Unknown';

      if (product.availability && product.availability.length > 0) {
        product.availability.forEach(av => {
          const store = storeIdMap.get(av.storeId);
          if (store && store.distanceKm < minDistance) {
            minDistance = store.distanceKm;
            distanceLabel = store.distanceLabel;
          }
        });
      } else {
        const store = storeMap.get(product.store);
        if (store) {
          minDistance = store.distanceKm;
          distanceLabel = store.distanceLabel;
        }
      }

      return {
        ...product,
        distance: distanceLabel,
        distanceKm: minDistance
      };
    });
  }, [allProducts, storesWithDistance]);

  const searchedProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return productsWithDistance.filter(p => {
      if (!query) return true;

      const availabilityStoreNames = (p.availability || [])
        .map((item) => storeNameById.get(item.storeId)?.toLowerCase())
        .filter((storeName): storeName is string => Boolean(storeName));

      return (
        p.name.toLowerCase().includes(query) ||
        (p.fullName && p.fullName.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        p.store.toLowerCase().includes(query) ||
        availabilityStoreNames.some((storeName) => storeName.includes(query))
      );
    });
  }, [productsWithDistance, productSearch, storeNameById]);

  const homeProducts = useMemo(
    () => searchedProducts.slice(0, HOME_PRODUCTS_LIMIT),
    [searchedProducts]
  );

  const searchedStores = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return storesWithDistance;

    return storesWithDistance.filter((store) => {
      const stockItems = Array.isArray(store.stock) ? store.stock.join(' ') : '';
      const shopName = 'shopName' in store ? String(store.shopName || '') : '';
      const ownerName = 'ownerName' in store ? String(store.ownerName || '') : '';
      const searchable = [
        String(store.name || ''),
        shopName,
        ownerName,
        String(store.address || ''),
        String(store.distance || ''),
        stockItems
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [storesWithDistance, productSearch]);

  const marketProducts = useMemo(() => {
    let filtered = searchedProducts;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((product) => product.category === selectedCategory);
    }

    if (maxDistance < 1000) { 
      filtered = filtered.filter((product) => (product as any).distanceKm <= maxDistance);
    }

    if (inStockOnly) {
      filtered = filtered.filter((product) => {
        const stock = product.stock.toLowerCase();
        return stock === 'in stock' || stock === 'fast selling' || stock === 'trending';
      });
    }

    if (sortBy === 'price-low') {
      filtered = [...filtered].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      filtered = [...filtered].sort((a, b) => b.price - a.price);
    }

    return filtered;
  }, [searchedProducts, selectedCategory, maxDistance, inStockOnly, sortBy]);

  const navigateToProduct = (id: string) => {
    navigate('product', { productId: id });
  };

  const addToCart = (product: MarketplaceProduct) => {
    if (!product.isOnline) {
      setCheckoutMessage("This product is offline store-only.");
      return;
    }
    const sellerId = product.retailerId || product.manufacturerId || "";
    if (!sellerId) {
      setCheckoutMessage("This product is missing seller info and cannot be ordered online.");
      return;
    }
    const sellerType = product.retailerId ? "retailer" : "manufacturer";
    setCartItems((prev) => {
      const found = prev.find((i) => i.productId === product.id);
      if (found) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sellerId,
          sellerType,
          name: product.name,
          image: product.image,
          price: product.price,
          qty: 1,
          sellMode: "online_delivery",
        },
      ];
    });
    setCheckoutMessage("Added to cart.");
  };

  const placeOrders = async () => {
    if (!user || userRole !== "customer") {
      setCheckoutMessage("Please login with a customer account.");
      return;
    }
    if (!cartItems.length) {
      setCheckoutMessage("Your cart is empty.");
      return;
    }
    if (!checkoutInfo.customerName.trim() || !checkoutInfo.customerPhone.trim() || !checkoutInfo.customerAddress.trim()) {
      setCheckoutMessage("Please fill name, phone, and delivery address.");
      return;
    }

    setCheckoutLoading(true);
    setCheckoutMessage(null);
    try {
      const orderIds = await createOrdersFromCart({
        customerId: user.uid,
        customerName: checkoutInfo.customerName,
        customerPhone: checkoutInfo.customerPhone,
        customerAddress: checkoutInfo.customerAddress,
        items: cartItems,
      });
      setCartItems([]);
      setCheckoutMessage(`Order placed successfully. Created ${orderIds.length} seller order(s).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to place order.";
      setCheckoutMessage(msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const navigateToMap = (storeId?: string, fromProductId?: string | null) => {
    setMapFilterProductId(fromProductId !== undefined ? fromProductId : null);
    navigate('map', { storeId: storeId || null });
  };

  const tourSteps: TourStep[] = useMemo(() => [
    { selector: '[data-tour="hero"]', textKey: 'tourWelcome', side: 'bottom' },
    { selector: '[data-tour="search"]', textKey: 'tourSearch', side: 'bottom' },
    { selector: '[data-tour="location"]', textKey: 'tourLocation', side: 'bottom' },
    { selector: '[data-tour="shop-by-crop"]', textKey: 'tourShopByCrop', side: 'top' },
    { selector: '[data-tour-nav="market"]', textKey: 'tourMarket', side: 'top' },
    { selector: '[data-tour-nav="map"]', textKey: 'tourStores', side: 'top' },
    { selector: '[data-tour-nav="hub"]', textKey: 'tourHubs', side: 'top' },
  ], []);

  const renderView = () => {
    if (loading) return (
      <div className="p-20 text-center">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="font-bold text-primary">{t('connectingFirebase')}</p>
      </div>
    );

    if (errorMsg) return (
      <div className="p-20 text-center">
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 max-w-lg mx-auto">
          <h3 className="text-xl font-bold mb-2">{t('dataLoadingIssue')}</h3>
          <p className="mb-4">{errorMsg}</p>
          <button
            onClick={loadData}
            className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors"
          >
            {t('retryConnection')}
          </button>
        </div>
      </div>
    );

    switch (currentView) {
      case 'home':
        return (
          <HomeView
            products={homeProducts}
            hubs={hubs}
            onProductClick={navigateToProduct}
            onHubClick={(hubId) => {
              setProductSearch('');
              navigate('hub', { hubId });
            }}
            onCategoryClick={(cat) => {
              setSelectedCategory(cat);
              navigate('market');
            }}
          />
        );
      case 'market':
        return (
          <MarketView
            products={marketProducts}
            onProductClick={navigateToProduct}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            storesWithDistance={storesWithDistance}
          />
        );
      case 'hub':
        return (
          <HubView 
            searchQuery={productSearch} 
            initialHubId={selectedHubId}
            onSearchProduct={(query) => {
              setProductSearch(query);
              setSelectedCategory('all');
              navigate('market');
            }}
            onCategoryClick={(category) => {
              setProductSearch('');
              setSelectedCategory(category);
              navigate('market');
            }}
          />
        );
      case 'product':
        return <ProductDetailView
          products={mergedProducts}
          productId={selectedProductId}
          onBack={() => navigate('market')}
          onStoreClick={(storeId) => navigateToMap(storeId, selectedProductId)}
          storesWithDistance={storesWithDistance}
          onProductClick={navigateToProduct}
          onViewSellerAll={(storeName) => {
            setProductSearch(storeName);
            navigate('market');
          }}
          onViewBrand={(manufacturerId) => {
            navigate('brand', { manufacturerId });
          }}
          onAddToCart={addToCart}
        />;
      case 'cart':
        return (
          <CartView
            items={cartItems}
            isLoggedIn={Boolean(user)}
            isCustomer={userRole === "customer"}
            customerName={checkoutInfo.customerName}
            customerPhone={checkoutInfo.customerPhone}
            customerAddress={checkoutInfo.customerAddress}
            onCustomerFieldChange={(field, value) =>
              setCheckoutInfo((prev) => ({ ...prev, [field]: value }))
            }
            onQtyChange={(productId, qty) =>
              setCartItems((prev) =>
                prev.map((item) => (item.productId === productId ? { ...item, qty } : item))
              )
            }
            onRemove={(productId) =>
              setCartItems((prev) => prev.filter((item) => item.productId !== productId))
            }
            onCheckout={placeOrders}
            onGoLogin={() => navigate("login")}
            loading={checkoutLoading}
            message={checkoutMessage}
          />
        );
      case 'map':
        return (
          <StoreLocatorView
            onBack={() => { setMapFilterProductId(null); navigate('home'); }}
            selectedStoreId={selectedStoreId}
            onStoreSelect={setSelectedStoreId}
            stores={mapFilterProductId
              ? (() => {
                  const prod = mergedProducts.find(p => p.id === mapFilterProductId);
                  const ids = new Set((prod?.availability ?? []).map(a => a.storeId));
                  return ids.size ? searchedStores.filter(s => ids.has(s.id)) : searchedStores;
                })()
              : searchedStores
            }
            location={locationQuery}
            onLocationChange={(loc, coords) => {
              setLocationQuery(loc);
              if (coords) setCoordinates(coords);
            }}
            userCoords={coordinates}
          />
        );
      case 'profile':
        return (
          <ProfileView
            uid={user?.uid}
            role={userRole}
            profile={userProfile}
            onProfileSave={handleProfileSave}
            onRetailerProductSaved={loadData}
            onNavigate={navigate}
          />
        );
      case 'login':
        return <LoginView onBack={() => navigate('home')} onNavigateToSignup={() => navigate('signup')} onSuccess={handleAuthSuccess} />;
      case 'signup':
        // Already-logged-in user with no invite — send them home
        if (user && !signupInviteCode) {
          navigate('home');
          return null;
        }
        // Already-logged-in user arrived via an invite link — show accept result instead of signup form
        if (user) {
          return (
            <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
              <div className="w-full max-w-md rounded-3xl border border-surface-container bg-white p-8 shadow-ambient text-center">
                <div className="flex flex-col items-center mb-6">
                  <img src="/images/krishidukan icon.webp" alt="KrishiDukan" className="w-16 h-16 object-contain mb-2" />
                  <span className="font-black text-2xl text-primary">Krishi<span className="text-secondary">Dukan</span></span>
                </div>

                {(!inviteAccept || inviteAccept.status === 'accepting') && (
                  <>
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
                    <p className="font-semibold text-on-surface">Accepting your invite…</p>
                    <p className="text-sm text-on-surface-variant mt-1">Linking you to the manufacturer&apos;s network</p>
                  </>
                )}

                {inviteAccept?.status === 'success' && (
                  <>
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-on-surface mb-2">Invite Accepted!</h2>
                    <p className="text-sm text-on-surface-variant">You are now part of the retailer network. Redirecting to your dashboard…</p>
                  </>
                )}

                {inviteAccept?.status === 'already_accepted' && (
                  <>
                    <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-on-surface mb-2">Already Accepted</h2>
                    <p className="text-sm text-on-surface-variant mb-6">
                      {inviteAccept.message || "You have already accepted this invitation."}
                    </p>
                    <a href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity">
                      Go to Dashboard →
                    </a>
                  </>
                )}

                {inviteAccept?.status === 'error' && (
                  <>
                    <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-on-surface mb-2">Could not accept invite</h2>
                    <p className="text-sm text-on-surface-variant mb-6">{inviteAccept.message || 'Something went wrong.'}</p>
                    <div className="flex flex-col gap-3">
                      <a href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity">
                        Go to Dashboard →
                      </a>
                      <button
                        onClick={() => navigate('home', { clearInvite: true })}
                        className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
                      >
                        Back to home
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        }
        return (
          <SignupView
            inviteCode={signupInviteCode}
            onInviteConsumed={() => setSignupInviteCode(null)}
            onBack={() => navigate('home', { clearInvite: true })}
            onNavigateToLogin={() => navigate('login')}
            onSuccess={handleAuthSuccess}
          />
        );
      case 'subscription':
        return <SubscriptionView user={user} role={userRole} onSuccess={handleSubscriptionSuccess} onLogout={handleLogout} />;
      case 'brand': {
        const mfrPhone = selectedManufacturerId || '';
        return <BrandPageRedirect phone={mfrPhone} />;
      }
      case 'about':
        return <AboutView />;
      case 'help':
        return <HelpView onNavigate={(view) => navigate(view as View)} user={user} userRole={userRole} />;
      default:
        return (
          <HomeView
            products={homeProducts}
            hubs={hubs}
            onProductClick={navigateToProduct}
            onHubClick={(hubId) => {
              setProductSearch('');
              navigate('hub', { hubId });
            }}
            onCategoryClick={(cat) => {
              setSelectedCategory(cat);
              navigate('market');
            }}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'map') setMapFilterProductId(null);
          navigate(view);
        }}
        productSearch={productSearch}
        setProductSearch={setProductSearch}
        locationQuery={locationQuery}
        onLocationChange={(loc, coords) => {
          setLocationQuery(loc);
          if (coords) setCoordinates(coords);
        }}
        externalUser={user}
        externalUserRole={userRole}
        externalUserProfile={userProfile}
        allProducts={allProducts}
        allStores={allStores}
        onProductClick={navigateToProduct}
        onStoreClick={navigateToMap}
        cartCount={cartItems.reduce((sum, item) => sum + item.qty, 0)}
        onCartClick={() => navigate("cart")}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">

        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer
        onNavigate={(view) => navigate(view as View)}
        onCategoryClick={(cat) => { setSelectedCategory(cat); navigate('market'); }}
      />

      {/* Onboarding Tour — only runs on first visit, only on home view */}
      {currentView === 'home' && !loading && !errorMsg ? (
        <GuidedTour steps={tourSteps} />
      ) : null}

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-surface-container flex items-center justify-around px-4 z-50">
        {([
          { id: 'home', icon: ICONS.Home, label: t('home') },
          { id: 'market', icon: ICONS.Market, label: t('market') },
          { id: 'hub', icon: ICONS.Hub, label: t('hub') },
          { id: 'map', icon: ICONS.Location, label: t('stores') },
          // Reuses the existing header Account dropdown — opens the same flow
          // (login / dashboard / logout / language) by triggering the header button.
          { id: 'account', icon: ICONS.Account, label: t('account'), action: 'account-menu' },
        ] as { id: string; icon: typeof ICONS.Home; label: string; action?: 'account-menu' }[]).map((item) => {
          const isActive = item.id !== 'account' && currentView === item.id;
          const handleClick = () => {
            if (item.action === 'account-menu') {
              const trigger = document.querySelector<HTMLButtonElement>('[data-account-trigger]');
              trigger?.click();
              return;
            }
            navigate(item.id as View);
          };
          return (
            <button
              key={item.id}
              data-tour-nav={item.id}
              onClick={handleClick}
              className={`flex flex-col items-center gap-1 transition-colors ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'fill-primary/20' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="activeBubble"
                  className="absolute -z-10 w-12 h-12 bg-primary-container/20 rounded-full"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
