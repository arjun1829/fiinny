/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client'

import { useEffect, useState, useMemo, useCallback } from 'react';
import { ICONS, PRODUCTS, STORES, INVENTORY } from './constants';
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
import { motion, AnimatePresence } from 'framer-motion';
import { auth, fetchMarketplaceProducts, fetchStores, syncInitialData, getUserProfile, fetchHubs, createOrdersFromCart } from './firebase';
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

type View = 'home' | 'market' | 'hub' | 'product' | 'map' | 'about' | 'profile' | 'login' | 'signup' | 'subscription' | 'cart';
type UserRole = 'customer' | 'retailer' | 'manufacturer';
type UserProfile = {
  name: string;
  phone: string;
  email: string;
  isPaid?: boolean;
  totalSeats?: number;
  productCount?: number;
};

const VALID_VIEWS: View[] = ['home', 'market', 'hub', 'product', 'map', 'about', 'profile', 'login', 'signup', 'subscription', 'cart'];
const HOME_PRODUCTS_LIMIT = 12;

export default function App() {
  const { t } = useI18n();
  const [currentView, setCurrentView] = useState<View>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
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

  const resolveViewForAccess = useCallback((view: View): View => {
    if (
      (userRole === 'retailer' || userRole === 'manufacturer') &&
      !userProfile.isPaid &&
      view !== 'home' &&
      view !== 'about' &&
      view !== 'subscription' &&
      view !== 'login' &&
      view !== 'signup'
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
    ) => {
      const params = new URLSearchParams();
      if (view !== 'home') params.set('view', view);
      if (productId) params.set('product', productId);
      if (storeId) params.set('store', storeId);
      if (hubId) params.set('hub', hubId);
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
    };
  }, []);

  const navigate = useCallback(
    (
      view: View,
      options?: {
        productId?: string | null;
        storeId?: string | null;
        hubId?: string | null;
        replace?: boolean;
        clearInvite?: boolean;
      },
    ) => {
      const nextView = resolveViewForAccess(view);
      const nextProductId = options?.productId ?? (nextView === 'product' ? selectedProductId : null);
      const nextStoreId = options?.storeId ?? (nextView === 'map' ? selectedStoreId : null);
      const nextHubId = options?.hubId ?? (nextView === 'hub' ? selectedHubId : null);

      if (options?.clearInvite) {
        setSignupInviteCode(null);
      }

      setCurrentView(nextView);
      setSelectedProductId(nextProductId);
      setSelectedStoreId(nextStoreId);
      setSelectedHubId(nextHubId);

      if (typeof window !== 'undefined') {
        const inviteForUrl = options?.clearInvite ? null : undefined;
        const nextUrl = buildUrl(nextView, nextProductId, nextStoreId, inviteForUrl, nextHubId);
        if (options?.replace) {
          window.history.replaceState(null, '', nextUrl);
        } else {
          window.history.pushState(null, '', nextUrl);
        }
      }
    },
    [buildUrl, resolveViewForAccess, selectedProductId, selectedStoreId, selectedHubId],
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
    window.history.replaceState(null, '', buildUrl(routeView, route.productId, route.storeId, route.inviteCode, route.hubId));

    const onPopState = () => {
      const next = readRouteFromUrl();
      setSignupInviteCode(next.inviteCode);
      setCurrentView(resolveViewForAccess(next.view));
      setSelectedProductId(next.productId);
      setSelectedStoreId(next.storeId);
      setSelectedHubId(next.hubId);
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

  // --- Geolocation state ---
  const [userLocation, setUserLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LOCATION_LABEL);
  const [locationSource, setLocationSource] = useState<'browser' | 'cached' | 'default'>('default');

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      console.log('Fetching products, stores and hubs...');
      let products = await fetchMarketplaceProducts();
      let stores = await fetchStores();
      let fetchedHubs = await fetchHubs();

      if (products.length === 0 || stores.length === 0) {
        console.log('Firebase data incomplete, attempting sync...', { 
          productsCount: products.length, 
          storesCount: stores.length 
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

          // Paywall logic: if retailer/manufacturer and NOT paid, force subscription view
          if ((profileData.role === 'retailer' || profileData.role === 'manufacturer') && !isPaid) {
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
      navigate('subscription', { replace: true, clearInvite: true });
    } else {
      navigate('home', { replace: true, clearInvite: true });
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

  const storeNameById = useMemo(() => {
    return new Map(
      allStores.map((store) => [
        String(store.id),
        String(store.name || store.shopName || store.ownerName || '')
      ])
    );
  }, [allStores]);

  const storesWithDistance = useMemo(
    () => computeStoreDistances(allStores, coordinates),
    [allStores, coordinates]
  );

  const productsWithDistance = useMemo(() => {
    const storeMap = new Map(storesWithDistance.map(s => [s.name, s]));
    const storeIdMap = new Map(storesWithDistance.map(s => [s.id, s]));

    return allProducts.map(product => {
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

  const navigateToMap = (storeId?: string) => {
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
        return <HubView searchQuery={productSearch} initialHubId={selectedHubId} />;
      case 'product':
        return <ProductDetailView
          products={allProducts}
          productId={selectedProductId}
          onBack={() => navigate('market')}
          onStoreClick={navigateToMap}
          storesWithDistance={storesWithDistance}
          onProductClick={navigateToProduct}
          onViewSellerAll={(storeName) => {
            setProductSearch(storeName);
            navigate('market');
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
            onBack={() => navigate('home')} 
            selectedStoreId={selectedStoreId} 
            onStoreSelect={setSelectedStoreId}
            stores={searchedStores}
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
      case 'about':
        return <AboutView />;
      default:
        return (
          <HomeView
            products={homeProducts}
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
        onNavigate={navigate}
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
        {[
          { id: 'home', icon: ICONS.Home, label: t('home') },
          { id: 'market', icon: ICONS.Market, label: t('market') },
          { id: 'hub', icon: ICONS.Hub, label: t('hub') },
          { id: 'map', icon: ICONS.Location, label: t('stores') },
          { id: 'about', icon: ICONS.Info, label: t('mobileAbout') }
        ].map((item) => (
          <button
            key={item.id}
            data-tour-nav={item.id}
            onClick={() => navigate(item.id as View)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              currentView === item.id ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <item.icon className={`w-5 h-5 ${currentView === item.id ? 'fill-primary/20' : ''}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
            {currentView === item.id && (
              <motion.div 
                layoutId="activeBubble" 
                className="absolute -z-10 w-12 h-12 bg-primary-container/20 rounded-full"
                initial={false}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
