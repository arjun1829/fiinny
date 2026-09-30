/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { ICONS, PRODUCTS, STORES, INVENTORY, MANUFACTURERS } from './constants';
import HomeView from './views/HomeView';
import MarketView from './views/MarketView';
import HubView from './views/HubView';
import ProductDetailView from './views/ProductDetailView';
import StoreLocatorView from './views/StoreLocatorView';
import ProfileView from './views/ProfileView';
import MyOrdersView from './views/MyOrdersView';
import AboutView from './views/AboutView';
import LoginView from './views/LoginView';
import SignupView from './views/SignupView';
import SubscriptionView from './views/SubscriptionView';
import CartView from './views/CartView';
import BrandView from './views/BrandView';
import RetailerJoinView from './views/RetailerJoinView';
import HelpView from './views/HelpView';
import { fetchManufacturerProfile } from './dashboard/_lib/brand-page-firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, fetchMarketplaceProducts, fetchStores, getUserProfile, fetchHubs, fetchBanners, createOrdersFromCart, updateOrderPayment, trackPageView, trackUserActivity, requestRoleUpgrade } from './firebase';
import type { Banner } from './firebase';
import { acceptManufacturerInvite } from './lib/invite/invite-acceptance-service';
import { readPendingReferral } from './lib/referral-client';
import { fetchInviteDetailsForSignup } from './lib/invite/fetch-invite-for-signup';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { MarketplaceProduct } from '../types/product';
import { LatLng } from './utils/haversine';
import { getUserLocation, DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, GeoResult } from './utils/geolocation';
import { computeStoreDistances, storeStocksProduct } from './utils/nearby';
import type { CartItem } from '../types/order';
import { cartItemKey } from '../types/order';
import { calcDiscount } from './utils/discount';
import { computeLinePricing } from './utils/gst';
import { saveCart, loadStoredCart, reconstructCartItems, mergeCartItems } from './cartService';

import { Navbar } from '../components/shared/navbar';
import Footer from '../components/shared/footer';
import AppPromoModal from '../components/shared/AppPromoModal';
import { StatusToast } from './components/shared/status-toast';
import { StorePickerModal } from './components/StorePickerModal';
import { GuidedTour, TourStep } from '../components/helpers';
import { useI18n } from './i18n/I18nContext';

type View = 'home' | 'market' | 'hub' | 'product' | 'map' | 'about' | 'profile' | 'orders' | 'login' | 'signup' | 'subscription' | 'cart' | 'brand' | 'become-retailer' | 'help';
type UserRole = 'customer' | 'retailer' | 'manufacturer' | 'admin';
type UserProfile = {
  name: string;
  phone: string;
  email: string;
  isPaid?: boolean;
  totalSeats?: number;
  productCount?: number;
};

const VALID_VIEWS: View[] = ['home', 'market', 'hub', 'product', 'map', 'about', 'profile', 'orders', 'login', 'signup', 'subscription', 'cart', 'brand', 'become-retailer', 'help'];
const HOME_PRODUCTS_LIMIT = 12;

/**
 * Resolve the RETAILER-SPECIFIC commercial settings (GST + delivery) for the cart
 * line. When the buyer has picked a store, its availability entry is authoritative —
 * absence of a field there means that seller doesn't apply it (e.g. no GST), so we
 * must NOT fall back to the master product. The canonical `product.*` is used only
 * when no per-seller entry exists at all. Returns a partial CartItem to spread.
 */
function resolveSellerCommercial(
  entry: NonNullable<MarketplaceProduct["availability"]>[number] | undefined,
  product: MarketplaceProduct,
): Partial<CartItem> {
  const hasEntry = !!entry;
  const gstApplicable = hasEntry ? entry!.gstApplicable === true : product.gstApplicable === true;
  const gstRate = hasEntry ? entry!.gstRate : product.gstRate;
  // Business default is INCLUDED — a line is only exclusive when explicitly false.
  // Always propagate the boolean (not just when true) so exclusive GST survives all
  // the way to the cart/checkout calculation instead of defaulting back to included.
  const gstIncluded = hasEntry ? entry!.gstIncluded !== false : product.gstIncluded !== false;
  const extraDeliveryCharge = hasEntry ? entry!.extraDeliveryCharge : product.extraDeliveryCharge;
  const freeDelivery = hasEntry ? entry!.freeDelivery === true : product.freeDelivery === true;
  return {
    ...(gstApplicable && gstRate ? { gstApplicable: true, gstRate, gstIncluded } : {}),
    ...(extraDeliveryCharge && extraDeliveryCharge > 0 ? { extraDeliveryCharge } : {}),
    ...(freeDelivery ? { freeDelivery: true } : {}),
  };
}

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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string | null>(null);
  const [mapFilterProductId, setMapFilterProductId] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('Pune, Maharashtra');
  const [coordinates, setCoordinates] = useState({ lat: 18.5204, lng: 73.8567 });
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole>('customer');
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', phone: '', email: '', isPaid: false });
  // Views below (ProfileView, SubscriptionView, Footer) only accept the
  // consumer-facing roles; map 'admin' to 'customer' for them.
  const consumerRole: 'customer' | 'retailer' | 'manufacturer' =
    userRole === 'admin' ? 'customer' : userRole;
  
  const [allProducts, setAllProducts] = useState<MarketplaceProduct[]>([]);
  const [allStores, setAllStores] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  /** True while auth state + Firestore cart are being resolved — blocks CartView render */
  const [cartHydrating, setCartHydrating] = useState(true);
  const firestoreSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True once a signed-in user has been observed, so the auth listener can tell a
   *  real sign-out from the null it emits on every logged-out cold load. */
  const hadUserRef = useRef(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [storePickerProduct, setStorePickerProduct] = useState<MarketplaceProduct | null>(null);
  const [checkoutInfo, setCheckoutInfo] = useState({
    customerName: "",
    customerPhone: "",
    addressArea: "",
    addressCity: "",
    addressDistrict: "",
    addressState: "",
    addressPincode: "",
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mfgUpgradeModal, setMfgUpgradeModal] = useState(false);
  const [mfgUpgradeLoading, setMfgUpgradeLoading] = useState(false);
  /** Preserved `inviteCode` query param for manufacturer → retailer signup links (legacy `invite` also read). */
  const [signupInviteCode, setSignupInviteCode] = useState<string | null>(null);
  /** Result of auto-accepting an invite for an already-logged-in user. */
  const [inviteAccept, setInviteAccept] = useState<{
    status: 'accepting' | 'success' | 'already_accepted' | 'error' | 'mismatch';
    message?: string;
    manufacturerName?: string | null;
    retailerShopName?: string | null;
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
    // The paid plans are for retailers and manufacturers only. Farmers never reach
    // this view through navigation, but 'subscription' is in VALID_VIEWS, so
    // ?view=subscription would render the retailer pitch to them — SubscriptionView
    // treats every non-manufacturer role as a retailer.
    // Exception: someone who arrived from a sales referral link may buy as a
    // customer — paying upgrades them to retailer (updateSubscriptionStatus),
    // same as the mobile app.
    if (view === 'subscription' && userRole !== 'retailer' && userRole !== 'manufacturer'
        && !(userRole && readPendingReferral())) {
      return 'home';
    }
    if (userRole === 'retailer' && view === 'become-retailer') {
      return 'home';
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
      mapLat?: number | null,
      mapLng?: number | null,
      mapLoc?: string | null,
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
      // Preserve map location params so shared URLs survive navigation.
      if (mapLat != null && mapLng != null && !isNaN(mapLat) && !isNaN(mapLng)) {
        params.set('lat', mapLat.toFixed(6));
        params.set('lng', mapLng.toFixed(6));
        if (mapLoc) params.set('loc', mapLoc);
      }
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
        manufacturerId: null as string | null,
      };
    }

    // ── Hash-route parsing ────────────────────────────────────────────────────
    // Support deep-link URLs like  #/product/{id}  and  #/brand/{slug}
    // that are shared from external sources (WhatsApp links, QR codes, etc.).
    // We convert them into the canonical query-param state and immediately
    // replace the URL so the rest of the app never sees the hash form again.
    const hash = window.location.hash; // e.g. "#/product/voFM67c..."
    if (hash && hash.startsWith('#/')) {
      const hashPath = hash.slice(2); // strip leading "#/"
      const [segment, id] = hashPath.split('/');
      if (segment === 'product' && id) {
        return {
          view: 'product' as View,
          productId: id,
          storeId: null,
          inviteCode: null,
          hubId: null,
          manufacturerId: null,
        };
      }
      if (segment === 'brand' && id) {
        return {
          view: 'brand' as View,
          productId: null,
          storeId: null,
          inviteCode: null,
          hubId: null,
          manufacturerId: id,
        };
      }
    }

    // ── Query-param parsing (canonical URL format) ────────────────────────────
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
      if (view === 'become-retailer' && userRole === 'retailer') {
        setToastMsg(t('footerAlreadyRetailerMsg'));
        setToastType('success');
        return;
      }
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
        // When navigating to the map view, carry any lat/lng/loc that are
        // already in the URL so shared location params survive view changes.
        let navLat: number | null = null;
        let navLng: number | null = null;
        let navLoc: string | null = null;
        if (nextView === 'map') {
          const cur = new URLSearchParams(window.location.search);
          const parsedLat = parseFloat(cur.get('lat') ?? '');
          const parsedLng = parseFloat(cur.get('lng') ?? '');
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            navLat = parsedLat;
            navLng = parsedLng;
            navLoc = cur.get('loc');
          }
        }
        const nextUrl = buildUrl(nextView, nextProductId, nextStoreId, inviteForUrl, nextHubId, nextManufacturerId, navLat, navLng, navLoc);
        if (options?.replace) {
          window.history.replaceState(null, '', nextUrl);
        } else {
          window.history.pushState(null, '', nextUrl);
        }
        // Always scroll to top when navigating
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    },
    [buildUrl, resolveViewForAccess, selectedProductId, selectedStoreId, selectedHubId, selectedManufacturerId, userRole, t],
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
    // Read lat/lng/loc from the current URL so the replaceState below doesn't
    // discard them. buildUrl previously knew nothing about these params and
    // silently stripped them every time it ran.
    const initParams = new URLSearchParams(window.location.search);
    const initLat = parseFloat(initParams.get('lat') ?? '');
    const initLng = parseFloat(initParams.get('lng') ?? '');
    const initLoc = initParams.get('loc');
    window.history.replaceState(null, '', buildUrl(
      routeView, route.productId, route.storeId, route.inviteCode, route.hubId, route.manufacturerId,
      !isNaN(initLat) ? initLat : null,
      !isNaN(initLng) ? initLng : null,
      initLoc,
    ));

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
    if (!cartLoaded) return;
    if (userProfile.phone) {
      // Logged-in users: cart lives in Firestore; keep localStorage clean to prevent
      // stale guest items from being double-merged on the next login.
      window.localStorage.removeItem("krishidukan_cart_v1");
    } else {
      window.localStorage.setItem("krishidukan_cart_v1", JSON.stringify(cartItems));
    }
  }, [cartItems, cartLoaded, userProfile.phone]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("krishidukan_cart_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) setCartItems(parsed);
      }
    } catch {}
    setCartLoaded(true);
  }, []);

  // Debounced Firestore cart sync for logged-in users
  useEffect(() => {
    const phone = userProfile.phone;
    if (!phone || !cartLoaded) return;
    if (firestoreSaveTimerRef.current) clearTimeout(firestoreSaveTimerRef.current);
    firestoreSaveTimerRef.current = setTimeout(() => {
      saveCart(phone, cartItems).catch((e) =>
        console.error('[Cart] Firestore save failed:', e)
      );
    }, 1500);
    return () => {
      if (firestoreSaveTimerRef.current) clearTimeout(firestoreSaveTimerRef.current);
    };
  }, [cartItems, userProfile.phone, cartLoaded]);

  useEffect(() => {
    if (currentView === 'become-retailer' && userRole === 'retailer') {
      navigate('home', { replace: true });
      setToastMsg(t('footerAlreadyRetailerMsg'));
      setToastType('success');
    }
  }, [currentView, userRole, navigate, t]);

  // Explicit invite acceptance for already-logged-in users who arrive via an invite link.
  // Called only by the "Accept Invite" button — never auto-fires, so no race conditions.
  const handleManualAcceptInvite = useCallback(async () => {
    if (!user || !signupInviteCode) return;
    const code = signupInviteCode;

    // Clear invite code from state AND URL immediately before any async work.
    // This prevents any re-render or URL change from re-triggering this path.
    setSignupInviteCode(null);
    window.history.replaceState(null, '', '/');
    setInviteAccept({ status: 'accepting' });

    const normalize10 = (p: string): string => {
      const d = p.replace(/\D/g, '');
      if (d.length === 10) return d;
      if (d.length === 12 && d.startsWith('91')) return d.slice(2);
      if (d.length === 13 && d.startsWith('91')) return d.slice(3);
      return d;
    };

    try {
      const [inviteDetails, idxSnap] = await Promise.all([
        fetchInviteDetailsForSignup(code),
        getDoc(doc(db, 'uidIndex', user.uid)),
      ]);

      const rawUserPhone = idxSnap.exists() ? String(idxSnap.data().phone ?? '') : '';
      const userPhone10 = normalize10(rawUserPhone);
      const invitePhone10 = inviteDetails?.retailerPhone ? normalize10(inviteDetails.retailerPhone) : '';

      if (
        inviteDetails?.found &&
        inviteDetails.claimable &&
        invitePhone10 &&
        userPhone10 &&
        invitePhone10 !== userPhone10
      ) {
        setInviteAccept({
          status: 'mismatch',
          message: `This invite was sent to +91 ${invitePhone10}. You are signed in with +91 ${userPhone10}.`,
          manufacturerName: inviteDetails.manufacturerName,
          retailerShopName: inviteDetails.retailerShopName,
        });
        return;
      }

      const result = await acceptManufacturerInvite({ uid: user.uid, inviteCode: code });
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
    } catch {
      setInviteAccept({ status: 'error', message: 'Could not accept invite. Please try again.' });
    }
  }, [user, signupInviteCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect logged-in users away from signup when there is no invite to process.
  // Must be a useEffect — never mutate state during render.
  useEffect(() => {
    if (currentView === 'signup' && user && !signupInviteCode && !inviteAccept) {
      navigate('home', { replace: true });
    }
  }, [currentView, user, signupInviteCode, inviteAccept, navigate]);

  // --- Geolocation state ---
  const [userLocation, setUserLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LOCATION_LABEL);
  const [locationSource, setLocationSource] = useState<'browser' | 'cached' | 'default'>('default');

  // Guards ensureStoresLoaded so the full /retailers read happens at most once
  // per session, no matter how many store-dependent views the user opens.
  const storesLoadedRef = useRef(false);
  const [storesLoading, setStoresLoading] = useState(false);

  // Lazily fetch the full store/retailer list the FIRST time the user opens a
  // store-dependent view (Stores/Map, Market, Product, Cart). Home never calls
  // this — that read used to run unconditionally on every home load and was the
  // single biggest source of Firestore reads. Idempotent: the ref is set before
  // the await so concurrent navigations coalesce into one fetch.
  const ensureStoresLoaded = useCallback(async () => {
    if (storesLoadedRef.current) return;
    storesLoadedRef.current = true;
    setStoresLoading(true);
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    try {
      const stores = await fetchStores();
      setAllStores(stores);
      if (process.env.NODE_ENV !== 'production') {
        const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
        // Dev diagnostic: confirms the full /retailers read fires exactly once,
        // on demand — and never on the home view.
        console.info(`[stores] lazy fetchStores() → ${stores.length} stores in ${ms}ms (one-time, on-demand)`);
      }
    } catch (err) {
      console.error('Failed to lazy-load stores:', err);
      storesLoadedRef.current = false; // allow a retry on the next store-view open
    } finally {
      setStoresLoading(false);
    }
  }, []);

  // Guards ensureHubsLoaded so the full /hubs read happens at most once per
  // session. Home used to read the entire hubs collection on every load just to
  // populate the "Shop by Crop" strip, which falls back to a static list until
  // real hubs arrive — so this read is now deferred until that section is
  // actually reached (see HomeView's onHubsNeeded).
  const hubsLoadedRef = useRef(false);

  const ensureHubsLoaded = useCallback(async () => {
    if (hubsLoadedRef.current) return;
    hubsLoadedRef.current = true;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    try {
      const fetchedHubs = await fetchHubs();
      setHubs(fetchedHubs);
      if (process.env.NODE_ENV !== 'production') {
        const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
        // Dev diagnostic: confirms the full /hubs read fires exactly once, on
        // demand (when the Shop-by-Crop section is reached) — never on home load.
        console.info(`[hubs] lazy fetchHubs() → ${fetchedHubs.length} hubs in ${ms}ms (one-time, on-demand)`);
      }
    } catch (err) {
      console.error('Failed to lazy-load hubs:', err);
      hubsLoadedRef.current = false; // allow a retry the next time the section is reached
    }
  }, []);

  // Single choke point for on-demand store loading. Watching currentView (rather
  // than hooking navigate) covers every entry path into a store-dependent view:
  // in-app navigation, direct deep links (route is applied via setCurrentView),
  // and browser back/forward. 'home' and 'hub' never trigger it.
  //
  // Market and Product Detail are deliberately EXCLUDED:
  //   • Market cards render from product-level data only (no retailer info), so
  //     Market must never trigger the full /retailers read.
  //   • Product Detail fetches ONLY the retailers that stock the open product,
  //     paginated on demand (see ProductDetailView) — not the whole collection.
  // Only the store picker (cart) and the locator (map) need the full list.
  useEffect(() => {
    const STORE_DEPENDENT_VIEWS = new Set(['cart', 'map']);
    if (STORE_DEPENDENT_VIEWS.has(currentView)) {
      void ensureStoresLoaded();
    }
  }, [currentView, ensureStoresLoaded]);

  const loadData = async (attempt = 1) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      trackPageView('home');

      let products = await fetchMarketplaceProducts();
      // NOTE: the full /retailers read (fetchStores) is deliberately NOT here.
      // It ran on every home load and dominated Firestore reads (~20M). Stores are
      // now lazy-loaded once via ensureStoresLoaded() the first time the user opens
      // a store-dependent view (Stores/Map, Market, Product, Cart). See the
      // currentView effect below.
      //
      // Hubs are likewise NOT read here. The "Shop by Crop" strip renders from a
      // static fallback until real hubs are needed, so the full /hubs read is now
      // lazy — triggered by HomeView's onHubsNeeded when that section scrolls into
      // view (see ensureHubsLoaded above).

      // An empty read is NOT a reason to write. This used to call
      // syncInitialData(PRODUCTS, STORES, INVENTORY), which had every visitor's
      // browser seed the hardcoded demo catalogue into production Firestore --
      // the likeliest source of the test shops in the live store locator. An
      // empty result now renders as empty, which is the truth.

      setAllProducts(products);

      // Banners are a non-critical homepage enhancement — HomeView falls back
      // to its built-in default slides if this fails or returns empty, so a
      // failure here must never block the rest of the page from loading.
      fetchBanners().then(setBanners).catch((err) => {
        console.warn('Failed to fetch banners, homepage will use default slides:', err);
      });

      if (products.length === 0) {
        setErrorMsg('No products found in database even after sync. Please check your Firestore rules.');
      }
    } catch (error: any) {
      console.error('Failed to load data from Firebase:', error);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        return loadData(attempt + 1);
      }
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
        hadUserRef.current = true;
        const profileData = await getUserProfile(firebaseUser.uid);
        if (profileData) {
          // Activity signal (DAU/MAU/retention). Throttled to ~1 write/user/day
          // and best-effort — never blocks the login flow.
          void trackUserActivity({
            userId: profileData.phone || firebaseUser.uid,
            role: profileData.role as string | undefined,
            registeredAt: (profileData as any).createdAt ?? null,
          });
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
          setCheckoutInfo({
            customerName: profileData.name || "",
            customerPhone: profileData.phone || "",
            addressArea: (profileData as any).addressArea || "",
            addressCity: (profileData as any).addressCity || "",
            addressDistrict: (profileData as any).addressDistrict || "",
            addressState: (profileData as any).addressState || "",
            addressPincode: (profileData as any).addressPincode || "",
          });

          // Paywall: only block if not paid AND not an invited retailer.
          // Invited retailers have isPaid set to true by the backfill; if it hasn't
          // propagated yet (race), also allow if they have a retailerDocId (invited).
          const isInvitedRetailer = profileData.role === 'retailer' && !!(profileData as any).retailerDocId;
          if ((profileData.role === 'retailer' || profileData.role === 'manufacturer') && !isPaid && !isInvitedRetailer) {
            setCurrentView('subscription');
          }

          // Cart: merge guest localStorage cart with Firestore cart, then clear localStorage.
          // We read localStorage directly here (not from state) to avoid stale-closure issues.
          const phone = profileData.phone || '';
          if (phone) {
            try {
              const guestCart: CartItem[] = (() => {
                try {
                  const raw = window.localStorage.getItem("krishidukan_cart_v1");
                  if (!raw) return [];
                  const parsed = JSON.parse(raw);
                  return Array.isArray(parsed) ? parsed : [];
                } catch { return []; }
              })();

              const storedItems = await loadStoredCart(phone);
              let merged: CartItem[];
              if (storedItems.length > 0) {
                const firestoreItems = await reconstructCartItems(storedItems);
                merged = mergeCartItems(guestCart, firestoreItems);
              } else {
                merged = guestCart;
              }

              if (merged.length > 0 || storedItems.length > 0) {
                setCartItems(merged);
                await saveCart(phone, merged);
              }
              window.localStorage.removeItem("krishidukan_cart_v1");
            } catch (e) {
              console.error('[Cart] Failed to sync Firestore cart on login:', e);
            }
          }
        }
        // Cart is fully hydrated — dismiss skeleton regardless of whether profile/phone existed
        setCartHydrating(false);
      } else {
        setUser(null);
        setUserRole('customer');
        setUserProfile({ name: '', phone: '', email: '', isPaid: false });
        // Clear cart on logout — Firestore copy is preserved for next login.
        // Only on an ACTUAL sign-out: this callback also fires with null on every
        // cold load for a logged-out visitor, and clearing there wiped the guest
        // cart that the localStorage effect had just hydrated — so nothing a guest
        // added ever survived a page load.
        if (hadUserRef.current) {
          setCartItems([]);
          window.localStorage.removeItem("krishidukan_cart_v1");
        }
        hadUserRef.current = false;
        setCheckoutInfo({
          customerName: '',
          customerPhone: '',
          addressArea: '',
          addressCity: '',
          addressDistrict: '',
          addressState: '',
          addressPincode: ''
        });
        setCartHydrating(false);
      }
    });

    void loadData();

    // If the URL carries explicit coordinates (shared map link), apply them to
    // coordinates only — NOT to locationQuery.  locationQuery drives the Navbar
    // location display; changing it from a URL param would make the app look
    // like the user's location changed, which is wrong.  The coordinates state
    // alone is enough to center the map and compute nearby stores correctly.
    const urlParams = new URLSearchParams(window.location.search);
    const urlLat = parseFloat(urlParams.get('lat') ?? '');
    const urlLng = parseFloat(urlParams.get('lng') ?? '');
    const hasUrlCoords = !isNaN(urlLat) && !isNaN(urlLng);
    if (hasUrlCoords) {
      setCoordinates({ lat: urlLat, lng: urlLng });
      // Show the human-readable label from the URL (e.g. "Ahilyanagar, Maharashtra")
      // or a neutral placeholder. This runs in a useEffect so there is no SSR
      // mismatch — the server always renders the default "Pune, Maharashtra".
      setLocationQuery(urlParams.get('loc') || 'Shared Location');
    }

    // Detect user location — GPS/cache.  Only update coordinates and the
    // location label when the URL did not supply explicit coords, so a shared
    // link always takes priority over the cached/GPS location.
    getUserLocation().then((result: GeoResult) => {
      setUserLocation(result.coords);
      setLocationLabel(result.label);
      setLocationSource(result.source);
      if (!hasUrlCoords) {
        setLocationQuery(result.label);
        setCoordinates(result.coords);
      }
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

    // Arrived from a sales referral link: straight to checkout, whatever the
    // role — an already-paid seller gets the buy-more page instead.
    if (readPendingReferral()) {
      if ((profile.role === 'retailer' || profile.role === 'manufacturer') && isPaid) {
        window.location.href = '/dashboard/upgrade';
      } else {
        navigate('subscription', { replace: true });
      }
      return;
    }

    if ((profile.role === 'retailer' || profile.role === 'manufacturer') && !isPaid) {
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

  const handleUpgradeRole = () => {
    if (userRole === 'manufacturer') {
      setToastMsg(t('footerAlreadyManufacturerMsg'));
      setToastType('success');
      return;
    }
    if (userRole === 'retailer') {
      if (!userProfile.isPaid) {
        navigate('subscription');
        return;
      }
      setMfgUpgradeModal(true);
      return;
    }
    navigate('become-retailer');
  };

  const handleConfirmMfgUpgrade = async () => {
    if (!user) return;
    setMfgUpgradeLoading(true);
    try {
      await requestRoleUpgrade(user.uid, 'manufacturer', {});
      setMfgUpgradeModal(false);
      setToastMsg(t('footerMfgUpgradeSuccess'));
      setToastType('success');
      setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
    } catch {
      setMfgUpgradeModal(false);
      setToastMsg(t('footerMfgUpgradeFail'));
      setToastType('error');
    } finally {
      setMfgUpgradeLoading(false);
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
  }, [mergedProducts, storesWithDistance]);

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

  const navigateToProduct = (id: string) => {
    navigate('product', { productId: id });
  };

  // Resolves a Banner Management "internal route" CTA (e.g. "/market",
  // "/hub/tomato", "/become-retailer") to the app's view-based navigation.
  // Unrecognized routes fall back to a full navigation via window.location
  // so an admin typo never dead-ends the click.
  const navigateToRoute = (route: string) => {
    const [path, query] = route.split('?');
    const segments = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query);

    switch (segments[0]) {
      case '':
      case undefined:
        navigate('home');
        return;
      case 'market':
        if (params.get('category')) setSelectedCategory(params.get('category')!);
        navigate('market');
        return;
      case 'hub':
        navigate('hub', { hubId: segments[1] });
        return;
      case 'product':
        if (segments[1]) navigateToProduct(segments[1]);
        return;
      case 'brand':
        navigate('brand', { manufacturerId: segments[1] });
        return;
      case 'become-retailer':
      case 'login':
        navigate('login');
        return;
      case 'stores':
      case 'map':
        navigate('map');
        return;
      case 'blog':
        window.location.href = route;
        return;
      default:
        window.location.href = route;
    }
  };

  const addToCart = (product: MarketplaceProduct, variant?: { unit: string; price: number; stock?: number }) => {
    if (product.sellMode === "offline_store_only") {
      setToastMsg("This product is not available for online ordering.");
      setToastType("error");
      return;
    }
    // Use the best available discount (maxDiscountPct) as a preview for the pending item.
    // The price will be updated to the specific store's price when the user selects a store.
    const maxPct = product.maxDiscountPct ?? product.effectiveDiscountPct ?? 0;
    const { finalPrice: discountedPrice } = calcDiscount(product.price, maxPct);


    setCartItems((prev) => {
      const variantUnit = variant?.unit;
      const found = prev.find(
        (i) => i.productId === product.id && i.sellMode === "pending" && i.variantUnit === variantUnit,
      );
      if (found) {
        return prev.map((i) =>
          i.productId === product.id && i.sellMode === "pending" && i.variantUnit === variantUnit
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sellerId: "",
          sellerType: "retailer" as const,
          name: product.name,
          image: product.image,
          price: variant ? variant.price : (maxPct > 0 ? discountedPrice : product.price),
          originalPrice: !variant && maxPct > 0 ? product.price : undefined,
          discountPct: !variant && maxPct > 0 ? maxPct : undefined,
          qty: 1,
          sellMode: "pending" as const,
          ...(variantUnit ? { variantUnit } : {}),
          // GST + delivery are retailer-specific and resolved when a store is chosen
          // (see onAssignStore). A pending line has no seller yet, so none are set.
        },
      ];
    });
    const label = variant ? `${product.name} (${variant.unit})` : product.name;
    setToastMsg(`${label} added to cart.`);
    setToastType("success");
  };

  // Compute formatted address from structured fields
  const customerAddress = [
    checkoutInfo.addressArea,
    checkoutInfo.addressCity,
    checkoutInfo.addressDistrict,
    checkoutInfo.addressState,
    checkoutInfo.addressPincode,
  ].filter(Boolean).join(", ");

  // Compute cart subtotal for ready items
  const cartSubtotal = cartItems
    .filter((i) => i.sellMode === "online_delivery" && i.sellerId)
    .reduce((sum, item) => sum + item.price * item.qty, 0);

  // Core order creation — called after successful payment
  const createOrdersAfterPayment = async (paymentDetails?: any) => {
    const readyItems = cartItems.filter((i) => i.sellMode === "online_delivery" && i.sellerId);
    const pendingItems = cartItems.filter((i) => i.sellMode === "pending" || !i.sellerId);

    const orderIds = await createOrdersFromCart({
      customerId: user!.uid,
      customerName: checkoutInfo.customerName,
      customerPhone: checkoutInfo.customerPhone,
      customerAddress,
      // The finalized delivery-address state — decides in/out-of-state slabs so
      // the order's persisted delivery charge matches what the server charged.
      customerDeliveryState: checkoutInfo.addressState.trim(),
      items: readyItems,
      payment: paymentDetails,
    });
    setCartItems(pendingItems);
    const pendingMsg = pendingItems.length > 0
      ? ` ${pendingItems.length} item${pendingItems.length > 1 ? "s" : ""} still in cart (store not selected).`
      : "";
    setCheckoutMessage(`✅ Payment successful! Order placed. ${orderIds.length} seller order(s) created.${pendingMsg}`);

    // Don't leave the customer on the checkout page — take them to their orders.
    // A global toast carries the confirmation across the navigation, and a short
    // beat lets the success state register before the view switches to /?view=orders.
    setToastMsg(`✅ Payment successful! ${orderIds.length} order${orderIds.length > 1 ? "s" : ""} placed.`);
    setToastType("success");
    setTimeout(() => navigate("orders"), 1200);
  };

  const placeOrders = async (grandTotal?: number) => {
    if (!user) {
      setCheckoutMessage("Please login to place an order.");
      return;
    }
    if (!cartItems.length) {
      setCheckoutMessage("Your cart is empty.");
      return;
    }
    if (!checkoutInfo.customerName.trim() || !checkoutInfo.customerPhone.trim()) {
      setCheckoutMessage("Please fill your name and phone number.");
      return;
    }
    if (!customerAddress.trim()) {
      setCheckoutMessage("Please enter your delivery address.");
      return;
    }

    const readyItems = cartItems.filter((i) => i.sellMode === "online_delivery" && i.sellerId);
    if (!readyItems.length) {
      setCheckoutMessage("No items are ready for ordering. Please select a store for your items first.");
      return;
    }

    // grandTotal (from CartView) = discounted subtotal + added GST (exclusive-GST
    // lines) + delivery. The server now computes delivery independently (state-aware,
    // from authoritative slabs) and MUST NOT trust a client delivery figure — so we
    // send the exclusive-GST-added portion on its own (clientGstAdded) and let the
    // server rebuild the payable total as serverSubtotal + serverDelivery + GST.
    // clientDelivery is still sent as a last-resort fallback only.
    const clientSubtotal = readyItems.reduce((s, i) => s + i.price * i.qty, 0);
    // Exclusive GST that is charged ON TOP of the price (inclusive GST is already in
    // the price and never added). Same helper the Cart/order/invoice use.
    const clientGstAdded = Number(
      readyItems.reduce((sum, item) => {
        const pricing = computeLinePricing({
          unitPrice: item.price,
          qty: item.qty,
          gstApplicable: item.gstApplicable,
          gstRate: item.gstRate,
          gstIncluded: item.gstIncluded,
        });
        return sum + (pricing.included ? 0 : pricing.gstTotal);
      }, 0).toFixed(2),
    );
    const clientGrandTotal = (grandTotal && grandTotal > 0) ? grandTotal : clientSubtotal;
    const clientDelivery = Math.max(0, clientGrandTotal - clientSubtotal - clientGstAdded);
    // The customer's finalized delivery-address state decides in/out-of-state slabs.
    const customerDeliveryState = checkoutInfo.addressState.trim();

    console.log("[Checkout] clientSubtotal:", clientSubtotal, "clientDelivery:", clientDelivery, "clientGstAdded:", clientGstAdded, "clientGrandTotal:", clientGrandTotal, "state:", customerDeliveryState);
    console.log("[Checkout] readyItems:", readyItems.map(i => ({ name: i.name, qty: i.qty, price: i.price, variantUnit: i.variantUnit, sellerPhone: i.sellerPhone })));

    setCheckoutLoading(true);
    setCheckoutMessage(null);

    try {
      // Step 1: Create Razorpay order on server.
      // We send clientGrandTotal (includes delivery) so the server uses it as the
      // Razorpay amount when its own inventory lookup can't find a matching price.
      // The route requires a Firebase ID token (Authorization: Bearer …).
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setCheckoutMessage("Please login again to place your order.");
        setCheckoutLoading(false);
        return;
      }
      const orderRes = await fetch("/api/payment/create-cart-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          items: readyItems.map((i) => ({
            productId:   i.productId,
            sellerId:    i.sellerId,
            sellerPhone: i.sellerPhone,
            qty:         i.qty,
            // variantUnit drives the server's weight-based slab lookup.
            variantUnit: i.variantUnit,
          })),
          userId:          user.uid,
          clientSubtotal,
          clientDelivery,
          clientGstAdded,
          clientGrandTotal,
          // Server picks the in/out-of-state slab from this vs the seller's state.
          customerDeliveryState,
          note: `Cart: ${readyItems.length} item(s)`,
          // Sent BEFORE payment so the server already holds everything needed
          // to rebuild this order if the post-payment write below never runs
          // (closed tab, dropped network). See app/lib/order-recovery.ts.
          customerName:    checkoutInfo.customerName.trim(),
          customerPhone:   checkoutInfo.customerPhone.trim(),
          customerAddress,
        }),
      });

      if (!orderRes.ok) {
        let errMsg = "Could not initiate payment. Please try again.";
        try {
          const errBody = await orderRes.json();
          console.error("[Checkout] create-cart-order API error:", orderRes.status, errBody);
          if (errBody?.error) errMsg = errBody.error;
        } catch { /* ignore parse error */ }
        throw new Error(errMsg);
      }

      const rzpOrder = await orderRes.json();
      console.log("[Checkout] rzpOrder:", { id: rzpOrder.id, amount: rzpOrder.amount, serverTotal: rzpOrder.serverTotal });

      // Step 2: Open Razorpay modal
      const rzp = new (window as any).Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: "INR",
        name: "KrishiDukan",
        description: `Order (${readyItems.length} item${readyItems.length > 1 ? "s" : ""})`,
        prefill: {
          name: checkoutInfo.customerName,
          contact: checkoutInfo.customerPhone,
        },
        theme: { color: "#1a6b2a" },
        handler: async (response: any) => {
          // Step 3: Verify payment
          try {
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.status === "ok") {
              // Step 4: Create Firestore orders
              await createOrdersAfterPayment({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                amount: rzpOrder.amount / 100,
                status: "paid",
                paidAt: new Date().toISOString(),
              });
            } else {
              setCheckoutMessage("❌ Payment verification failed. Contact support if money was deducted.");
            }
          } catch {
            setCheckoutMessage("❌ Payment verified but order creation failed. Please contact support.");
          } finally {
            setCheckoutLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setCheckoutLoading(false);
            setCheckoutMessage("Payment cancelled. Your cart is safe.");
          },
        },
      });
      // The SDK saying "failed" is not proof the payment failed: a UPI collect
      // approved slightly late is captured by Razorpay after the checkout has
      // already given up watching, which is how a customer gets charged and
      // told it failed in the same breath. So report the failure to the server,
      // which asks Razorpay directly before recording anything — and if the
      // money was in fact captured, finish the order instead of showing an
      // error. Mobile already reconciles this way (checkout_screen.dart).
      rzp.on("payment.failed", async (response: any) => {
        try {
          const idTokenForFailure = await user.getIdToken();
          const res = await fetch("/api/payment/attempt-failed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idTokenForFailure}`,
            },
            body: JSON.stringify({
              razorpay_order_id: rzpOrder.id,
              error: response?.error ?? null,
            }),
          });
          const data = await res.json();

          if (data?.status === "captured") {
            // Money is on Razorpay's books — create the order rather than
            // telling a paying customer their payment failed.
            await createOrdersAfterPayment({
              razorpayOrderId: rzpOrder.id,
              razorpayPaymentId: data.paymentId,
              // No signature exists on this path: the checkout reported failure,
              // so Razorpay never handed one back. The payment is confirmed by
              // the server reading Razorpay's own records instead, which is a
              // stronger guarantee than a client-supplied signature.
              reconciled: true,
              amount: rzpOrder.amount / 100,
              status: "paid",
              paidAt: new Date().toISOString(),
            });
            setCheckoutLoading(false);
            return;
          }
        } catch {
          // Reconciliation itself failed — fall through to the cautious message
          // below rather than leaving the customer with no feedback at all.
        }

        setCheckoutLoading(false);
        setCheckoutMessage(
          "❌ Payment failed. If any amount was deducted, it will be refunded automatically within 5-7 business days.",
        );
      });
      rzp.open();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to initiate payment.";
      setCheckoutMessage(msg);
      setCheckoutLoading(false);
    }
  };


  const handleAddToCartFromStore = useCallback((product: MarketplaceProduct, store: any, price?: number, variant?: { unit: string; price: number; stock?: number }) => {
    if (product.sellMode === "offline_store_only") {
      setToastMsg("This product is not available for online ordering.");
      setToastType("error");
      return;
    }
    const sellerId: string =
      (store as any).retailerId ||
      (store as any).userId ||
      store.id ||
      "";
    if (!sellerId) {
      setCheckoutMessage("This store is missing seller info and cannot be ordered from online.");
      return;
    }

    // Per-seller product-level check: this specific store's listing may have delivery off
    // even if the merged card is marked online (because another seller is online).
    const sellerPhone: string | undefined = (store as any).phone || undefined;
    const availEntry = product.availability?.find(
      (a) =>
        (sellerId && a.storeId === sellerId) ||
        (sellerPhone && (a.storePhone === sellerPhone || a.storeId === sellerPhone)),
    );
    if (availEntry && availEntry.isOnline === false) {
      setToastMsg("This product is not available for online ordering from this store.");
      setToastType("error");
      return;
    }

    const sellerType: "retailer" | "manufacturer" =
      (store as any).retailerId ? "retailer" : "manufacturer";
    const variantUnit = variant?.unit;

    setCartItems((prev) => {
      const found = prev.find(
        (i) => i.productId === product.id && i.sellerId === sellerId && i.variantUnit === variantUnit,
      );
      if (found) {
        // bump qty for existing online_delivery item from same seller
        return prev.map((i) =>
          i.productId === product.id && i.sellerId === sellerId && i.variantUnit === variantUnit
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }
      const storePhone: string | undefined = (store as any).phone || undefined;
      let storePrice: number;
      let originalStorePrice: number | undefined;
      let storeDiscountPct = 0;

      // Resolve base price: variant-specific → passed price → availability lookup
      let baseStorePrice: number;
      if (variant && variant.price > 0) {
        baseStorePrice = variant.price;
      } else if (price && price > 0) {
        baseStorePrice = price;
      } else {
        const availability = product.availability?.find(
          (a) => a.storeId === store.id || (storePhone && (a.storePhone === storePhone || a.storeId === storePhone))
        );
        baseStorePrice = (availability?.sellingPrice && availability.sellingPrice > 0)
          ? availability.sellingPrice
          : product.price;
      }

      // Apply store discount — same lookup used by ProductDetailView and CartView
      storeDiscountPct =
        (sellerId && product.sellerDiscounts?.[sellerId])
          ? product.sellerDiscounts[sellerId]
          : (storePhone && product.sellerDiscounts?.[storePhone])
            ? product.sellerDiscounts[storePhone]
            : (store.id && product.sellerDiscounts?.[store.id])
              ? product.sellerDiscounts[store.id]
              : 0;
      if (storeDiscountPct > 0) {
        originalStorePrice = baseStorePrice;
        const { finalPrice } = calcDiscount(baseStorePrice, storeDiscountPct);
        storePrice = finalPrice;
      } else {
        storePrice = baseStorePrice;
      }

      // Remove the existing pending item for THIS product + package size (prevents a
      // duplicate line for the size now being added from a store). Pending lines for
      // OTHER sizes of the same product are left untouched — each size is its own line.
      const withoutPending = prev.filter(
        (i) => !(i.productId === product.id && i.sellMode === "pending" && i.variantUnit === variantUnit)
      );
      return [
        ...withoutPending,
        {
          productId: product.id,
          sellerId,
          sellerType,
          sellerName: store.name || undefined,
          ...(storePhone ? { sellerPhone: storePhone } : {}),
          name: product.name,
          image: product.image,
          price: storePrice,
          originalPrice: storeDiscountPct > 0 ? originalStorePrice : undefined,
          discountPct: storeDiscountPct > 0 ? storeDiscountPct : undefined,
          qty: 1,
          sellMode: "online_delivery" as const,
          ...(variantUnit ? { variantUnit } : {}),
          // Retailer-specific GST + delivery from the SELECTED store's listing.
          ...resolveSellerCommercial(availEntry, product),
        },
      ];
    });
    const label = variant ? `${product.name} (${variant.unit})` : product.name;
    setToastMsg(`${label} added to cart from ${store.name || 'this store'}.`);
    setToastType("success");
  }, []);

  // Buy Now: add to cart (auto-select first online store if available) + go to cart
  //
  // The selected package size MUST be threaded through. ProductDetailView passes
  // the chosen variant to onBuyNow, but this handler used to drop it — so Buy Now
  // silently added the base size no matter which chip the buyer picked. It went
  // unnoticed while products effectively had one selectable size per store; the
  // moment a store stocked a second (5L alongside 1L), Buy Now charged for 1L.
  const handleBuyNow = useCallback((
    product: MarketplaceProduct,
    variant?: { unit: string; price: number; stock?: number },
  ) => {
    if (product.sellMode === "offline_store_only") {
      setToastMsg("This product is not available for online ordering.");
      setToastType("error");
      return;
    }
    // Find the first store that stocks this product AND can actually deliver it.
    //
    // This used to return the first entry in the product's availability array
    // with no delivery check whatsoever, despite the comment claiming otherwise.
    // Assignment pushes a retailer into that array the moment a manufacturer
    // assigns them stock — before the retailer has accepted their invite, and
    // regardless of whether they ever switched on online delivery. So Buy Now
    // could hand the buyer a shop that never joined KrishiDukan and cannot ship.
    //
    // Two independent switches must both be on:
    //   store.onlineDelivery      — THIS shop turned on online delivery
    //   availability[].isOnline   — this shop's listing of THIS product is online
    // The listing flag only blocks when explicitly false, so entries written
    // before it existed still behave as before and rely on the account switch.
    const onlineStore = storesWithDistance.find((store) => {
      const storePhone = (store as any).phone as string | undefined;
      const storeUserId = (store as any).userId as string | undefined;
      const storeRetailerId = (store as any).retailerId as string | undefined;

      const availEntry = product.availability?.find(
        (a) =>
          a.storeId === store.id ||
          (a.storePhone && storePhone && a.storePhone === storePhone) ||
          (a.storeId && storeUserId && a.storeId === storeUserId) ||
          (a.storeId && storeRetailerId && a.storeId === storeRetailerId)
      );
      if (!availEntry) return false;
      if ((store as any).onlineDelivery !== true) return false;
      if ((availEntry as any).isOnline === false) return false;
      return true;
    });

    if (onlineStore) {
      // Pass the variant's price as the explicit price too: handleAddToCartFromStore
      // resolves the store's own per-size price from it, and falling back to the
      // base price here would charge 1L money for a 5L can.
      handleAddToCartFromStore(product, onlineStore, variant?.price, variant);
    } else {
      // No specific store found — add as pending and navigate to cart
      addToCart(product, variant);
    }
    navigate("cart");
  }, [storesWithDistance, handleAddToCartFromStore, addToCart, navigate]);

  const navigateToMap = (storeId?: string, fromProductId?: string | null) => {
    setMapFilterProductId(fromProductId !== undefined ? fromProductId : null);
    navigate('map', { storeId: storeId || null });
  };

  const tourSteps: TourStep[] = useMemo(() => [
    { selector: '[data-tour="hero"]', textKey: 'tourWelcome', side: 'bottom' },
    { selector: '[data-tour="search"]', mobileSelector: '[data-tour="search-mobile"]', textKey: 'tourSearch', side: 'bottom' },
    { selector: '[data-tour="location"]', mobileSelector: '[data-tour="location-mobile"]', textKey: 'tourLocation', side: 'bottom' },
    { selector: '[data-tour="shop-by-crop"]', textKey: 'tourShopByCrop', side: 'top' },
    { selector: '[data-tour-nav="market"]', mobileSelector: '[data-tour-bottomnav] [data-tour-nav="market"]', textKey: 'tourMarket', side: 'top' },
    { selector: '[data-tour-nav="map"]', mobileSelector: '[data-tour-bottomnav] [data-tour-nav="map"]', textKey: 'tourStores', side: 'top' },
    { selector: '[data-tour-nav="hub"]', mobileSelector: '[data-tour-bottomnav] [data-tour-nav="hub"]', textKey: 'tourHubs', side: 'top' },
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
            onClick={() => void loadData()}
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
            banners={banners}
            onHubsNeeded={ensureHubsLoaded}
            onProductClick={navigateToProduct}
            onHubClick={(hubId) => {
              setProductSearch('');
              navigate('hub', { hubId });
            }}
            onCategoryClick={(cat) => {
              setSelectedCategory(cat);
              navigate('market');
            }}
            onMarketSearch={(query) => {
              setProductSearch(query);
              setSelectedCategory('all');
              navigate('market');
            }}
            onAddToCart={addToCart}
            onRegisterClick={() => navigate('login')}
            onNavigateRoute={navigateToRoute}
          />
        );
      case 'market':
        return (
          <MarketView
            searchQuery={productSearch}
            onProductClick={navigateToProduct}
            onAddToCart={addToCart}
            onBuyNow={handleBuyNow}
            cartItems={cartItems}
            onGoToCart={() => navigate("cart")}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
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
          userCoords={coordinates}
          onProductClick={navigateToProduct}
          onViewSellerAll={(storeName) => {
            setProductSearch(storeName);
            navigate('market');
          }}
          onViewBrand={(manufacturerId) => {
            navigate('brand', { manufacturerId });
          }}
          onCategoryClick={(cat) => {
            setProductSearch('');
            setSelectedCategory(cat);
            navigate('market');
          }}
          onAddToCart={addToCart}
          onAddToCartFromStore={handleAddToCartFromStore}
          onBuyNow={handleBuyNow}
        />;
      case 'cart':
        return (
          <CartView
            items={cartItems}
            isLoggedIn={Boolean(user)}
            isCustomer={userRole === "customer"}
            customerName={checkoutInfo.customerName}
            customerPhone={checkoutInfo.customerPhone}
            addressArea={checkoutInfo.addressArea}
            addressCity={checkoutInfo.addressCity}
            addressDistrict={checkoutInfo.addressDistrict}
            addressState={checkoutInfo.addressState}
            addressPincode={checkoutInfo.addressPincode}
            onCustomerFieldChange={(field, value) =>
              setCheckoutInfo((prev) => ({ ...prev, [field]: value }))
            }
            onQtyChange={(itemKey, qty) =>
              setCartItems((prev) =>
                prev.map((item) => (cartItemKey(item) === itemKey ? { ...item, qty } : item))
              )
            }
            onRemove={(itemKey) =>
              setCartItems((prev) => prev.filter((item) => cartItemKey(item) === itemKey ? false : true))
            }
            onAssignStore={(itemKey, sellerId, sellerType, sellerName, storePrice, discountPct, originalPrice) => {
              // Resolve the store's phone so sellerPhone is always persisted in the
              // cart item, enabling the storedPhone fallback in reconstructCartItems.
              // Without this, admin-assigned products (whose copy docs are keyed by phone,
              // not UID) lose their discount after Firestore hydration when storeId is a UID.
              const assignedStore = storesWithDistance.find(s =>
                (s as any).retailerId === sellerId ||
                (s as any).userId === sellerId ||
                s.id === sellerId
              );
              const resolvedSellerPhone: string | undefined = (assignedStore as any)?.phone || undefined;

              // Resolve the chosen store's OWN GST + delivery from its availability
              // entry (retailer-specific). This overrides anything the line carried.
              setCartItems((prev) => {
                const pendingItem = prev.find(item => cartItemKey(item) === itemKey);
                if (!pendingItem) return prev;

                const productForItem = mergedProducts.find(p => p.id === pendingItem.productId);
                const assignEntry = productForItem?.availability?.find(
                  (a) =>
                    (sellerId && a.storeId === sellerId) ||
                    (resolvedSellerPhone && (a.storePhone === resolvedSellerPhone || a.storeId === resolvedSellerPhone)),
                );
                // Absent fields mean this seller doesn't apply them — clear stale values.
                const commercial: Partial<CartItem> = productForItem
                  ? resolveSellerCommercial(assignEntry, productForItem)
                  : {};
                const commercialReset = {
                  gstApplicable: commercial.gstApplicable,
                  gstRate: commercial.gstRate,
                  gstIncluded: commercial.gstIncluded,
                  extraDeliveryCharge: commercial.extraDeliveryCharge,
                  freeDelivery: commercial.freeDelivery,
                };

                // An "online_delivery" line is the SAME cart entry only when it shares
                // the product, the newly-chosen seller AND the same package size.
                const existingItem = prev.find(item => item.productId === pendingItem.productId && item.sellerId === sellerId && item.sellMode === "online_delivery" && item.variantUnit === pendingItem.variantUnit && cartItemKey(item) !== itemKey);

                if (existingItem) {
                  return prev
                    .map(item => {
                      if (item === existingItem) {
                        return { ...item, qty: item.qty + pendingItem.qty };
                      }
                      if (item === pendingItem) {
                        return null;
                      }
                      return item;
                    })
                    .filter(Boolean) as CartItem[];
                }

                return prev.map((item) =>
                  cartItemKey(item) === itemKey && (item.sellMode === "pending" || item.sellMode === "online_delivery")
                    ? {
                        ...item,
                        sellerId, sellerType, sellerName,
                        ...(resolvedSellerPhone ? { sellerPhone: resolvedSellerPhone } : {}),
                        sellMode: "online_delivery" as const,
                        ...(storePrice != null ? { price: storePrice } : {}),
                        ...(discountPct != null ? { discountPct } : { discountPct: undefined }),
                        ...(originalPrice != null ? { originalPrice } : { originalPrice: undefined }),
                        // Retailer-specific GST + delivery (cleared if this seller has none).
                        ...commercialReset,
                      }
                    : item
                );
              });
            }}
            onCheckout={placeOrders}
            onSaveAddress={async () => {
              if (!user) return;
              try {
                const idxSnap = await getDoc(doc(db, 'uidIndex', user.uid));
                const phone = idxSnap.exists() ? idxSnap.data().phone : null;
                if (phone) {
                  await updateDoc(doc(db, 'users', phone), { 
                    addressArea: checkoutInfo.addressArea,
                    addressCity: checkoutInfo.addressCity,
                    addressDistrict: checkoutInfo.addressDistrict,
                    addressState: checkoutInfo.addressState,
                    addressPincode: checkoutInfo.addressPincode,
                  });
                }
              } catch (e) {
                console.warn('Could not save address:', e);
              }
            }}
            hasProfileAddress={!!checkoutInfo.addressArea}
            onGoLogin={() => navigate("login")}
            onGoOrders={() => navigate("orders")}
            loading={checkoutLoading}
            cartLoading={cartHydrating}
            message={checkoutMessage}
            storesWithDistance={storesWithDistance}
            allProducts={mergedProducts}
            subtotal={cartSubtotal}
            mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          />
        );
      case 'map':
        return (
          <StoreLocatorView
            onBack={() => { setMapFilterProductId(null); navigate('home'); }}
            selectedStoreId={selectedStoreId}
            onStoreSelect={setSelectedStoreId}
            loading={storesLoading}
            stores={mapFilterProductId
              ? (() => {
                  const prod = mergedProducts.find(p => p.id === mapFilterProductId);
                  const availability = prod?.availability;
                  if (!availability || availability.length === 0) return searchedStores;
                  // Match stores the same robust way ProductDetailView does (by id, phone,
                  // userId or retailerId) so admin-assigned copies — whose availability.storeId
                  // is the seller's phone — resolve to the store even when store.id isn't the phone.
                  const matched = searchedStores.filter(s => storeStocksProduct(s, availability));
                  return matched.length ? matched : searchedStores;
                })()
              : searchedStores
            }
            location={locationQuery}
            onLocationChange={(loc, coords) => {
              setLocationQuery(loc);
              if (coords) setCoordinates(coords);
            }}
            userCoords={coordinates}
            globalSearch={mapFilterProductId ? '' : productSearch}
            onClearGlobalSearch={() => setProductSearch('')}
            onBrowseProducts={(store) => {
              const name = store.name || store.shopName || '';
              if (name) setProductSearch(name);
              setSelectedCategory('all');
              navigate('market');
            }}
          />
        );
      case 'profile':
        return (
          <ProfileView
            uid={user?.uid}
            role={consumerRole}
            profile={userProfile}
            onProfileSave={handleProfileSave}
            onRetailerProductSaved={loadData}
            onNavigate={navigate}
          />
        );
      case 'orders':
        return (
          <div className="px-4 md:px-10 max-w-5xl mx-auto w-full py-8 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('profile')} className="p-2 rounded-xl hover:bg-surface-container transition-colors">
                  <svg className="w-5 h-5 text-on-surface-variant" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div>
                  <h1 className="text-2xl font-black text-on-surface">{t('myOrders')}</h1>
                  <p className="text-sm text-on-surface-variant">{t('ordersPageSubtitle')}</p>
                </div>
              </div>
            </div>
            <MyOrdersView customerId={user?.uid || ''} />
          </div>
        );
      case 'login':
        return <LoginView onBack={() => navigate('home')} onSuccess={handleAuthSuccess} />;
      case 'signup':
        // Signup is now unified into the login flow (phone → OTP → onboarding
        // for new numbers). The standalone signup form remains ONLY for
        // manufacturer invite links, which pre-fill and lock the phone number.
        if (!signupInviteCode && !user) {
          return <LoginView onBack={() => navigate('home')} onSuccess={handleAuthSuccess} />;
        }
        // Already-logged-in user arrived via an invite link — show accept result instead of signup form.
        // (Redirect for logged-in users with no invite is handled in the useEffect above.)
        if (user) {
          return (
            <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
              <div className="w-full max-w-md rounded-3xl border border-surface-container bg-white p-8 shadow-ambient text-center">
                <div className="flex flex-col items-center mb-6">
                  <img src="/images/krishidukan icon.webp" alt="KrishiDukan" className="w-16 h-16 object-contain mb-2" />
                  <span className="font-black text-2xl text-primary">Krishi<span className="text-secondary">Dukan</span></span>
                </div>

                {/* Confirm screen — shown before user explicitly accepts the invite */}
                {!inviteAccept && signupInviteCode && (
                  <>
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-on-surface mb-2">Retailer Invite</h2>
                    <p className="text-sm text-on-surface-variant mb-6">
                      You have been invited to join a manufacturer&apos;s retailer network on KrishiDukan.
                    </p>
                    <button
                      onClick={handleManualAcceptInvite}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity mb-3"
                    >
                      Accept Invite
                    </button>
                    <button
                      onClick={() => navigate('home', { clearInvite: true })}
                      className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
                    >
                      Decline
                    </button>
                  </>
                )}

                {/* Spinner shown only after the user has clicked Accept */}
                {inviteAccept?.status === 'accepting' && (
                  <>
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
                    <p className="font-semibold text-on-surface">Accepting your invite…</p>
                    <p className="text-sm text-on-surface-variant mt-1">Linking you to the manufacturer&apos;s network</p>
                  </>
                )}

                {inviteAccept?.status === 'mismatch' && (
                  <>
                    <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="h-8 w-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    {inviteAccept.retailerShopName && (
                      <p className="text-base font-bold text-primary mb-1">Welcome, {inviteAccept.retailerShopName}!</p>
                    )}
                    <h2 className="text-xl font-bold text-on-surface mb-2">Wrong Account Signed In</h2>
                    <p className="text-sm text-on-surface-variant mb-1">{inviteAccept.message}</p>
                    {inviteAccept.manufacturerName && (
                      <p className="text-xs text-on-surface-variant mb-6">
                        Invited by <span className="font-semibold text-primary">{inviteAccept.manufacturerName}</span>
                      </p>
                    )}
                    {!inviteAccept.manufacturerName && <div className="mb-6" />}
                    <p className="text-xs text-on-surface-variant mb-6">Please sign out and sign in with the mobile number this invite was sent to.</p>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={handleLogout}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
                      >
                        Sign Out &amp; Switch Account
                      </button>
                      <button
                        onClick={() => navigate('home', { clearInvite: true })}
                        className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors"
                      >
                        Back to home
                      </button>
                    </div>
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
            defaultRole={typeof window !== 'undefined' && readPendingReferral() ? 'retailer' : undefined}
            onInviteConsumed={() => {
              setSignupInviteCode(null);
              // Also remove the inviteCode from the URL immediately so the param
              // cannot re-trigger anything if the component re-mounts.
              window.history.replaceState(null, '', '/');
            }}
            onBack={() => navigate('home', { clearInvite: true })}
            onNavigateToLogin={() => navigate('login')}
            onSuccess={handleAuthSuccess}
          />
        );
      case 'subscription':
        return <SubscriptionView user={user} role={consumerRole} onSuccess={handleSubscriptionSuccess} onLogout={handleLogout} />;
      case 'brand': {
        const mfrPhone = selectedManufacturerId || '';
        return <BrandPageRedirect phone={mfrPhone} />;
      }
      case 'become-retailer':
        return (
          <RetailerJoinView
            onBack={() => navigate('home')}
          />
        );
      case 'about':
        return <AboutView />;
      case 'help':
        return <HelpView onNavigate={(view) => navigate(view as View)} user={user} userRole={userRole} />;
      default:
        return (
          <HomeView
            products={homeProducts}
            hubs={hubs}
            banners={banners}
            onHubsNeeded={ensureHubsLoaded}
            onProductClick={navigateToProduct}
            onHubClick={(hubId) => {
              setProductSearch('');
              navigate('hub', { hubId });
            }}
            onCategoryClick={(cat) => {
              setSelectedCategory(cat);
              navigate('market');
            }}
            onAddToCart={addToCart}
            onRegisterClick={() => navigate('login')}
            onNavigateRoute={navigateToRoute}
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
        userRole={consumerRole}
        onUpgradeRole={handleUpgradeRole}
      />

      {/* Manufacturer upgrade confirmation modal */}
      {mfgUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
            <h2 className="text-lg font-black text-on-surface mb-2">{t('footerMfgUpgradeTitle')}</h2>
            <p className="text-sm text-on-surface-variant mb-6">{t('footerMfgUpgradeDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setMfgUpgradeModal(false)}
                disabled={mfgUpgradeLoading}
                className="flex-1 rounded-2xl border border-surface-container py-3 text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                {t('footerMfgUpgradeCancel')}
              </button>
              <button
                onClick={handleConfirmMfgUpgrade}
                disabled={mfgUpgradeLoading}
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {mfgUpgradeLoading ? '…' : t('footerMfgUpgradeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Picker Modal — opened when consumer clicks Add to Cart from Home/Market */}
      {storePickerProduct && (
        <StorePickerModal
          product={storePickerProduct}
          storesWithDistance={storesWithDistance}
          onConfirm={handleAddToCartFromStore}
          onClose={() => setStorePickerProduct(null)}
        />
      )}

      {/* Onboarding Tour — only runs on first visit, only on home view */}
      {currentView === 'home' && !loading && !errorMsg ? (
        <GuidedTour steps={tourSteps} />
      ) : null}

      {/* "Get the app" popup — first-time visitors only, skippable, home view only */}
      {currentView === 'home' && !loading && !errorMsg ? <AppPromoModal /> : null}

      <StatusToast
        message={toastMsg}
        type={toastType}
        onDismiss={() => setToastMsg(null)}
      />

      {/* Mobile Bottom Nav */}
      <nav data-tour-bottomnav className="fixed bottom-0 left-0 right-0 z-50 border-t border-surface-container bg-white/95 px-3 py-2 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-2">
          {[
            { key: 'home', icon: ICONS.Home, label: t('home'), active: currentView === 'home', onClick: () => navigate('home') },
            { key: 'market', icon: ICONS.Market, label: t('market'), active: currentView === 'market', onClick: () => navigate('market') },
            { key: 'hub', icon: ICONS.Hub, label: t('hub'), active: currentView === 'hub', onClick: () => navigate('hub') },
            { key: 'map', icon: ICONS.Location, label: t('stores'), active: currentView === 'map', onClick: () => { setProductSearch(''); navigate('map'); } },
            // AgriReels lives on its own Next.js route (not an internal SPA
            // view), so it navigates with a real page load, same as the
            // desktop nav's <a href="/reels">. Account moved into the mobile
            // "More" menu (navbar.tsx) to make room for this in the primary
            // bottom tabs, matching the native app's bottom nav.
            { key: 'reels', icon: ICONS.Reels, label: 'Reels', active: false, onClick: () => { window.location.href = '/reels'; } },
          ].map((item) => (
            <button
              key={item.key}
              data-tour-nav={item.key}
              onClick={item.onClick}
              className={`relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 transition-all ${
                item.active
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="truncate text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
              {item.active && (
                <motion.div
                  layoutId="activeBottomNav"
                  className="absolute inset-0 -z-10 rounded-2xl border border-primary/15 bg-primary/10"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
