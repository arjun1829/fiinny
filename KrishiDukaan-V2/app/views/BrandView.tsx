'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import {
  MapPin, ShoppingBag, ArrowRight, Store, Tag,
  Leaf, ExternalLink, Package, BadgeCheck, Phone, Mail, ChevronRight, Navigation, Building2,
  Instagram, Facebook, Film,
} from 'lucide-react';
import { parseBrandVideos } from '../lib/brand-videos';
import { ReviewSection } from '../../components/shared/ReviewSection';
import type { ManufacturerBrandData, BrandProductSummary, BrandRetailerSummary } from '../dashboard/_lib/brand-page-types';
import { haversineDistance, formatDistance } from '../utils/haversine';
import { ShareLinkButton } from '../components/shared/share-link-button';
import { brandShareUrl } from '../lib/share-links';
import { useSharedCart } from '../lib/useSharedCart';
import type { MarketplaceProduct } from '../../types/product';
import { displayPrice } from '../lib/price-display';
import { PriceTag } from '../../components/shared/price-tag';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandViewProps {
  brand: ManufacturerBrandData;
  products: BrandProductSummary[];
  /**
   * Merged marketplace cards for THIS brand's products, assembled server-side
   * from the manufacturer's own docs (and their seller copies) — the bounded
   * replacement for the old client-side full-catalogue fetchMarketplaceProducts()
   * read. Carries the cross-seller pricing (discount / sellMode / lowest price)
   * the server-rendered summaries lack. Keyed by name below, matching the
   * marketplace dedup.
   */
  marketProducts?: MarketplaceProduct[];
  /**
   * Total active retailers in the network. The list itself is NOT passed from
   * the server — it loads on demand from GET /api/brand/retailers when the
   * visitor opens "Where to Find Us". Rendering hundreds of map markers + cards
   * up front was the brand page's dominant cost and retailers are not on the
   * purchase path. The count feeds the hero stat and whether to offer the panel.
   */
  retailerCount?: number;
  /** How many products the brand has (the grid starts with one page). */
  totalProducts?: number;
  /** Cursor for the next page of products; null when all are shown. */
  nextCursor?: string | null;
  onProductClick?: (id: string) => void;
  onFindNearYou?: () => void;
}

type GeoPoint = { latitude: number; longitude: number };
type RetailerWithDistance = BrandRetailerSummary & { distanceKm: number; distanceLabel: string };

// ─── Multi-pin map ────────────────────────────────────────────────────────────

function BrandGeoMap({
  manufacturerGeo,
  retailers = [],
}: {
  manufacturerGeo: GeoPoint | null;
  retailers?: BrandRetailerSummary[];
}) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });

  const center = useMemo<google.maps.LatLngLiteral | null>(() => {
    if (manufacturerGeo) return { lat: manufacturerGeo.latitude, lng: manufacturerGeo.longitude };
    const withGeo = retailers.filter((r) => r.geo);
    if (withGeo.length > 0) return { lat: withGeo[0].geo!.latitude, lng: withGeo[0].geo!.longitude };
    return null;
  }, [manufacturerGeo, retailers]);

  if (!center) return null;

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-container rounded-2xl">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Green manufacturer pin
  const mfrIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><circle cx="18" cy="18" r="14" fill="#154212" stroke="white" stroke-width="3"/><polygon points="13,30 18,44 23,30" fill="#154212"/><circle cx="18" cy="18" r="7" fill="white" fill-opacity="0.9"/></svg>';
  // Red retailer pin
  const retailerIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34"><circle cx="14" cy="14" r="10" fill="#d32f2f" stroke="white" stroke-width="2.5"/><polygon points="10,23 14,34 18,23" fill="#d32f2f"/><circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.9"/></svg>';

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1rem' }}
      center={center}
      zoom={retailers.filter((r) => r.geo).length > 0 ? 10 : 12}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e8f5' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f0e8' }] },
        ],
      }}
    >
      {manufacturerGeo && (
        <MarkerF
          position={{ lat: manufacturerGeo.latitude, lng: manufacturerGeo.longitude }}
          icon={{
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(mfrIconSvg)}`,
            scaledSize: new google.maps.Size(36, 44),
          }}
          title="Manufacturer"
          zIndex={10}
        />
      )}
      {retailers.filter((r) => r.geo).map((r) => (
        <MarkerF
          key={r.phone}
          position={{ lat: r.geo!.latitude, lng: r.geo!.longitude }}
          icon={{
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(retailerIconSvg)}`,
            scaledSize: new google.maps.Size(28, 34),
          }}
          title={r.shopName}
          zIndex={5}
        />
      ))}
    </GoogleMap>
  );
}

// ─── Retailer store card (matches ProductDetailView card sizing exactly) ─────────

function RetailerStoreCard({ retailer, isExpanded, onToggle }: {
  retailer: RetailerWithDistance;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const loc = [retailer.address.city, retailer.address.state].filter(Boolean).join(', ');
  const mapsHref = retailer.geo
    ? `https://www.google.com/maps/dir/?api=1&destination=${retailer.geo.latitude},${retailer.geo.longitude}`
    : loc
      ? `https://www.google.com/maps/search/${encodeURIComponent(`${retailer.shopName} ${loc}`)}`
      : null;

  return (
    <div className={`rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${
      isExpanded ? 'border-primary bg-white shadow-ambient' : 'border-surface-container bg-surface-container-low hover:border-outline-variant'
    }`}>
      <div className="w-full flex items-center gap-1.5 md:gap-2 p-2.5 md:p-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-3 md:gap-4 text-left"
        >
          <div className={`rounded-xl overflow-hidden shrink-0 transition-colors ${
            isExpanded ? 'bg-primary text-white' : 'bg-white shadow-sm text-on-surface-variant'
          } ${retailer.logo ? 'w-10 h-10' : 'p-2.5'}`}>
            {retailer.logo ? (
              <img loading="lazy" decoding="async" src={retailer.logo} alt={retailer.shopName} className="w-10 h-10 object-cover" />
            ) : (
              <Store className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="block font-bold text-on-surface text-sm md:text-base leading-snug truncate">
              {retailer.shopName || 'Store'}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1 whitespace-nowrap">
                <MapPin className="w-3 h-3 shrink-0" />
                {retailer.distanceLabel || loc || 'Nearby'}
              </span>
              {retailer.distanceLabel && loc && (
                <span className="text-[10px] text-on-surface-variant/60 whitespace-nowrap">{loc}</span>
              )}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-outline transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
          >
            <Navigation className="w-3.5 h-3.5" /> Map
          </a>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3 border-t border-surface-container">
              {loc && (
                <p className="pt-3 text-xs text-on-surface-variant flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 shrink-0 text-primary" /> {loc}
                </p>
              )}
              <div className="flex gap-2">
                {retailer.phone ? (
                  <a
                    href={`tel:${retailer.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                ) : null}
                {retailer.secondaryPhone ? (
                  <a
                    href={`tel:${retailer.secondaryPhone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call 2
                  </a>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Manufacturer card (always pinned first in the discovery panel) ────────────

function ManufacturerCard({ brand, isExpanded, onToggle }: {
  brand: ManufacturerBrandData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const loc = [brand.address.city, brand.address.state].filter(Boolean).join(', ');
  const mapsHref = brand.geo
    ? `https://www.google.com/maps?q=${brand.geo.latitude},${brand.geo.longitude}`
    : loc
      ? `https://www.google.com/maps/search/${encodeURIComponent(loc)}`
      : null;

  return (
    <div className={`rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${
      isExpanded
        ? 'border-amber-400 bg-amber-50 shadow-ambient'
        : 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
    }`}>
      <div className="w-full flex items-center gap-1.5 md:gap-2 p-2.5 md:p-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-3 md:gap-4 text-left"
        >
          <div className={`rounded-xl overflow-hidden shrink-0 transition-colors ${
            brand.logo ? 'w-10 h-10' : `p-2.5 ${isExpanded ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-600'}`
          }`}>
            {brand.logo ? (
              <img loading="lazy" decoding="async" src={brand.logo} alt={brand.businessName} className="w-10 h-10 object-contain" />
            ) : (
              <Building2 className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-on-surface text-sm md:text-base leading-snug truncate">
                {brand.businessName}
              </span>
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black text-white">
                <BadgeCheck className="w-2.5 h-2.5" /> Manufacturer
              </span>
            </div>
            {loc && (
              <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1 mt-0.5 whitespace-nowrap">
                <MapPin className="w-3 h-3 shrink-0" />{loc}
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-outline transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
        <a
          href="#brand-products"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-amber-500 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
        >
          <Package className="w-3.5 h-3.5" /> Products
        </a>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3 border-t border-amber-100">
              {(brand.address.line1 || loc) && (
                <p className="pt-3 text-xs text-on-surface-variant flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 shrink-0 text-amber-500" />
                  {[brand.address.line1, loc].filter(Boolean).join(', ')}
                </p>
              )}
              <div className="flex gap-2">
                {brand.phone && (
                  <a
                    href={`tel:${brand.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                )}
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-primary text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Directions
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function BrandView({
  brand,
  products,
  marketProducts = [],
  retailerCount = 0,
  totalProducts,
  nextCursor = null,
  onProductClick,
  onFindNearYou,
}: BrandViewProps) {
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { addToCart, isInCart } = useSharedCart();
  const [toast, setToast] = useState<string | null>(null);

  // Retailer network loads on demand, ONE bounded page at a time (see
  // BrandViewProps.retailerCount). Nothing is fetched until the visitor opens
  // the panel; "Show more" pulls the next page via cursor.
  const [retailers, setRetailers] = useState<BrandRetailerSummary[]>([]);
  const [retailerStatus, setRetailerStatus] =
    useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Guards against duplicate requests from repeated clicks / re-renders.
  const inFlight = useRef(false);

  const fetchRetailerPage = async (reset: boolean) => {
    if (inFlight.current) return;
    if (!reset && !hasMore) return;
    inFlight.current = true;
    if (reset) {
      cursorRef.current = null;
      setRetailerStatus('loading');
    } else {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams({ phone: brand.phone });
      if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);
      const res = await fetch(`/api/brand/retailers?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const page: BrandRetailerSummary[] = Array.isArray(data.retailers) ? data.retailers : [];
      setRetailers((prev) => {
        if (reset) return page;
        // Dedupe by phone so an overlapping cursor can never double-list a store.
        const seen = new Set(prev.map((r) => r.phone));
        return [...prev, ...page.filter((r) => !seen.has(r.phone))];
      });
      cursorRef.current = data.nextCursor ?? null;
      setHasMore(Boolean(data.nextCursor));
      setRetailerStatus('loaded');
    } catch {
      if (reset) setRetailerStatus('error');
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  };

  // Seller pricing lives on retailer product copies, not on the manufacturer's
  // catalog doc — so the server-rendered summaries carry no discount or sellMode.
  // The server now assembles the merged marketplace cards for exactly this
  // brand's products (bounded to the manufacturer, no full-catalogue read) and
  // passes them in. Key them by name — how that pipeline dedupes across sellers.
  // Products "Load more": the page ships the first dozen; the rest are fetched
  // a page at a time from /api/brand/products only when the visitor asks.
  const [extraProducts, setExtraProducts] = useState<BrandProductSummary[]>([]);
  const [extraMarket, setExtraMarket] = useState<MarketplaceProduct[]>([]);
  const [productCursor, setProductCursor] = useState<string | null>(nextCursor);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadFailed, setProductsLoadFailed] = useState(false);

  const allProducts = useMemo(() => {
    const seen = new Set<string>();
    return [...products, ...extraProducts].filter((p) => !seen.has(p.id) && !!seen.add(p.id));
  }, [products, extraProducts]);

  const loadMoreProducts = async () => {
    if (!productCursor || productsLoading) return;
    setProductsLoading(true);
    setProductsLoadFailed(false);
    try {
      const res = await fetch(`/api/brand/products?phone=${encodeURIComponent(brand.phone)}&after=${encodeURIComponent(productCursor)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { products: BrandProductSummary[]; marketProducts: MarketplaceProduct[]; nextCursor: string | null };
      setExtraProducts((prev) => [...prev, ...data.products]);
      setExtraMarket((prev) => [...prev, ...data.marketProducts]);
      setProductCursor(data.nextCursor);
    } catch {
      setProductsLoadFailed(true);
    } finally {
      setProductsLoading(false);
    }
  };

  const marketByName = useMemo(
    () => new Map([...marketProducts, ...extraMarket].map((p) => [p.name.toLowerCase().trim(), p])),
    [marketProducts, extraMarket],
  );

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  /** Adds to the shared cart. Returns false when the product isn't orderable. */
  const addProductToCart = (product: BrandProductSummary): boolean => {
    const market = marketByName.get(product.name.toLowerCase().trim());
    return addToCart(
      market ?? ({
        id: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        category: product.category,
      } as MarketplaceProduct),
    );
  };

  const handleAddToCart = (product: BrandProductSummary) => {
    const added = addProductToCart(product);
    setToast(
      added
        ? `${product.name} added to cart.`
        : 'This product is not available for online ordering.',
    );
  };

  /**
   * Buy Now — add to cart, then go straight to the cart.
   *
   * MarketView's card takes an onBuyNow from the SPA page, whose handler needs
   * storesWithDistance and the toast/navigate context that only page.tsx has.
   * /brand/[slug] is a standalone route with none of that, so this uses the
   * exact fallback MarketView itself declares when no onBuyNow is supplied:
   * add to cart, then send the buyer to the cart. Same destination, no
   * dependency on SPA state.
   */
  const handleBuyNow = (product: BrandProductSummary) => {
    if (!isInCart(marketByName.get(product.name.toLowerCase().trim())?.id ?? product.id)) {
      const added = addProductToCart(product);
      if (!added) {
        setToast('This product is not available for online ordering.');
        return;
      }
    }
    window.location.href = '/?view=cart';
  };

  // Request user location once (for distance sorting)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* no-op: distance sort falls back to original order */ },
      { timeout: 5000 },
    );
  }, []);

  // Attach distances and sort retailers nearest-first
  const retailersWithDistance = useMemo<RetailerWithDistance[]>(() => {
    const withDist = retailers.map((r) => {
      if (r.geo && userLocation) {
        const km = haversineDistance(userLocation, { lat: r.geo.latitude, lng: r.geo.longitude });
        return { ...r, distanceKm: km, distanceLabel: formatDistance(km) };
      }
      return { ...r, distanceKm: Infinity, distanceLabel: '' };
    });
    return [...withDist].sort((a, b) => a.distanceKm - b.distanceKm);
  }, [retailers, userLocation]);

  const locationDisplay = useMemo(() => {
    const parts = [brand.address.city, brand.address.state].filter(Boolean);
    return parts.length ? parts.join(', ') : brand.address.line1 || '';
  }, [brand.address]);

  const websiteHost = useMemo(() => {
    if (!brand.website) return '';
    try { return new URL(brand.website).hostname.replace('www.', ''); } catch { return brand.website; }
  }, [brand.website]);

  // Parse + sanitise stored "Tips & Videos" links (drops unsafe/malformed entries,
  // keeps legacy bare YouTube ids working). Runs during SSR too — the server-side gate.
  const brandVideos = useMemo(() => parseBrandVideos(brand.videos), [brand.videos]);

  const showWhereToBuy = brand.geo || locationDisplay || retailerCount > 0;
  const hasMapData = brand.geo || retailers.some((r) => r.geo);


  return (
    <div className="flex flex-col">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-primary">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{
            background: `linear-gradient(180deg, #0a1f08 0%, #122b10 35%, #1a3d14 60%, #2a5a1a 80%, #3d7a22 95%, #4a8f28 100%)`
          }} />
          {brand.banner && (
            <img src={brand.banner} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay" />
          )}
          <div className="absolute" style={{
            right: '15%', top: '20%', width: '280px', height: '280px',
            background: 'radial-gradient(circle, rgba(245,124,0,0.35) 0%, rgba(245,124,0,0.15) 40%, transparent 70%)',
            borderRadius: '50%',
          }} />
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 160" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <g opacity="0.6" fill="none" stroke="#4a8f28" strokeWidth="1.5">
              {[0,80,160,240,320,400,480,560,640,720,800,880,960,1040,1120,1200,1280,1360].map((x, i) => (
                <g key={x} transform={`translate(${x + (i%3)*12}, 0)`}>
                  <line x1="10" y1="160" x2="10" y2="60" />
                  <ellipse cx="10" cy="55" rx="5" ry="15" fill="rgba(74,143,40,0.5)" stroke="none" />
                  <line x1="10" y1="100" x2="0" y2="80" />
                  <line x1="10" y1="100" x2="20" y2="78" />
                </g>
              ))}
            </g>
          </svg>
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(10,31,8,0.82) 0%, rgba(10,31,8,0.55) 50%, rgba(10,31,8,0.35) 100%)',
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16 flex flex-col md:flex-row items-start md:items-center gap-10">
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center gap-2 w-fit">
              <BadgeCheck className="w-4 h-4 text-amber-400" />
              <span className="text-white/80 text-xs font-semibold">Verified Manufacturer on KrishiDukan</span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6 mt-2">
              {brand.logo ? (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white p-3 border-4 border-white/20 shadow-2xl shrink-0 flex items-center justify-center overflow-hidden transition-all duration-200 hover:scale-[1.03]">
                  <img src={brand.logo} alt={brand.businessName} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white/10 p-3 border-4 border-white/20 shadow-2xl shrink-0 flex items-center justify-center">
                  <Building2 className="w-12 h-12 text-white/50" />
                </div>
              )}
              <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-black text-white leading-none tracking-tight">{brand.businessName}</h1>
                {brand.tagline && <p className="text-white/80 text-base md:text-lg font-medium leading-relaxed max-w-xl">{brand.tagline}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ShareLinkButton
                url={brandShareUrl(brand.phone)}
                title={brand.businessName}
                text={`${brand.businessName} on KrishiDukan: products and stores near you`}
                label="Share"
                className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold text-white hover:bg-white/20"
              />
              {(brand.averageRating ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold text-white">
                  <span className="text-amber-400">{'★'.repeat(Math.round(brand.averageRating!))}</span>
                  {brand.averageRating!.toFixed(1)}
                  {brand.totalReviews ? <span className="text-white/60 font-normal">· {brand.totalReviews} reviews</span> : null}
                </span>
              )}
              {locationDisplay && (
                <a
                  href={brand.geo
                    ? `https://www.google.com/maps?q=${brand.geo.latitude},${brand.geo.longitude}`
                    : `https://www.google.com/maps/search/${encodeURIComponent(locationDisplay)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-white/70 text-xs hover:text-white transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400" /> {locationDisplay}
                </a>
              )}
              {brand.establishedYear && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="flex items-center gap-1.5 text-white/70 text-xs">
                    <Package className="w-3.5 h-3.5 text-amber-400" /> Est. {brand.establishedYear}
                  </span>
                </>
              )}
              {brand.website && (
                <>
                  <span className="text-white/30">·</span>
                  <a href={brand.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-white/70 text-xs hover:text-white transition-colors">
                    <ExternalLink className="w-3 h-3 text-amber-400" /> {websiteHost}
                  </a>
                </>
              )}
            </div>
            {brand.about && <p className="text-white/60 text-sm leading-relaxed max-w-lg">{brand.about}</p>}
            {(brand.phone || brand.secondaryPhone || brand.email) && (
              <div className="flex flex-wrap gap-4">
                {brand.phone && (
                  <a href={`tel:${brand.phone}`} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
                    <Phone className="w-3.5 h-3.5 text-amber-400" /> {brand.phone}
                  </a>
                )}
                {brand.secondaryPhone && (
                  <a href={`tel:${brand.secondaryPhone}`} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
                    <Phone className="w-3.5 h-3.5 text-amber-400" /> {brand.secondaryPhone}
                  </a>
                )}
                {brand.email && (
                  <a href={`mailto:${brand.email}`} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
                    <Mail className="w-3.5 h-3.5 text-amber-400" /> {brand.email}
                  </a>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              {onFindNearYou && (
                <button onClick={onFindNearYou}
                  className="flex items-center gap-2 bg-white hover:bg-white/90 text-primary px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/20">
                  <MapPin className="w-4 h-4 text-primary" /> Find Near You
                </button>
              )}
              <a href="#brand-products"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all border border-white/20">
                <ShoppingBag className="w-4 h-4" /> View Products
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-5 md:w-72 w-full shrink-0">
            {brand.socialProof && (
              <div className="flex items-center gap-3 pb-4 border-b border-white/15">
                <span className="text-3xl">🏆</span>
                <div>
                  <p className="text-white font-extrabold text-xl leading-tight">Highly in Demand!</p>
                  <p className="text-amber-300 text-sm font-bold mt-0.5">{brand.socialProof}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 pb-4 border-b border-white/15">
              {[
                { value: String(totalProducts ?? allProducts.length), label: 'Products' },
                { value: retailerCount > 0 ? retailerCount.toString() : '—', label: 'Retailers' },
                { value: brand.establishedYear ? String(new Date().getFullYear() - parseInt(brand.establishedYear, 10)) + '+' : '—', label: 'Years' },
              ].map(({ value, label }, i) => (
                <div key={label} className={`text-center ${i > 0 ? 'border-l border-white/15' : ''}`}>
                  <p className="text-3xl font-extrabold text-white">{value}</p>
                  <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest mt-1">{label}</p>
                </div>
              ))}
            </div>
            {brand.certifications.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {brand.certifications.map((cert) => (
                  <span key={cert} className="flex items-center gap-1.5 text-white/70 text-xs">
                    <Leaf className="w-3 h-3 text-green-400 shrink-0" /> {cert}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Where to Find Us — retailer discovery panel ──────────────────────── */}
      {showWhereToBuy && (
        <section className="bg-white border-b border-surface-container">
          <div className="max-w-7xl mx-auto w-full px-6 md:px-10 py-12 flex flex-col gap-6">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Where to Find Us</p>
                <h2 className="text-2xl font-bold text-on-surface">
                  {retailerCount > 0
                    ? `${retailerCount + 1} Locations`
                    : 'Our Location'}
                </h2>
                {locationDisplay && (
                  <p className="text-on-surface-variant text-sm mt-0.5">{locationDisplay}</p>
                )}
              </div>
              {onFindNearYou && (
                <button
                  onClick={onFindNearYou}
                  className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <MapPin className="w-3.5 h-3.5" /> Find Near You
                </button>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-5">

              {/* ── Map — LEFT, h-80 required so GoogleMap (height:100%) has a
                  concrete pixel height. Shows placeholder when no geo data. ── */}
              <div className="h-80 md:flex-1 rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-surface-container">
                {hasMapData ? (
                  <BrandGeoMap manufacturerGeo={brand.geo} retailers={retailersWithDistance} />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-on-surface-variant/30">
                    <MapPin className="w-8 h-8" />
                    <span className="text-xs font-medium">Location data not available</span>
                  </div>
                )}
              </div>

              {/* ── Retailers — RIGHT, min-h-0 breaks flex-child height ambiguity.
                  Block scroll container (not flex) avoids nested-flex + overflow-y
                  height-collapse when item count exceeds max-height. ── */}
              <div className="md:flex-1 min-h-0 flex flex-col">
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  <ManufacturerCard
                    brand={brand}
                    isExpanded={expandedStoreId === '__manufacturer__'}
                    onToggle={() =>
                      setExpandedStoreId(
                        expandedStoreId === '__manufacturer__' ? null : '__manufacturer__',
                      )
                    }
                  />

                  {/* Idle: offer to load the network (not fetched up front). */}
                  {retailerCount > 0 && retailerStatus === 'idle' && (
                    <button
                      type="button"
                      onClick={() => fetchRetailerPage(true)}
                      className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-colors"
                    >
                      <Store className="w-4 h-4" />
                      View {retailerCount} Retailer{retailerCount !== 1 ? 's' : ''}
                    </button>
                  )}

                  {/* Loading */}
                  {retailerStatus === 'loading' && (
                    <div className="flex items-center justify-center gap-2 py-6 text-on-surface-variant">
                      <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-xs font-semibold">Loading retailers…</span>
                    </div>
                  )}

                  {/* Error */}
                  {retailerStatus === 'error' && (
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <p className="text-xs text-on-surface-variant">Couldn’t load retailers.</p>
                      <button
                        type="button"
                        onClick={() => fetchRetailerPage(true)}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {/* Loaded but empty (count was stale) */}
                  {retailerStatus === 'loaded' && retailers.length === 0 && (
                    <p className="text-xs text-on-surface-variant text-center py-6">
                      No retailer stores listed yet.
                    </p>
                  )}

                  {/* Loaded — accumulated pages, sorted nearest-first */}
                  {retailerStatus === 'loaded' &&
                    retailersWithDistance.map((r) => (
                      <RetailerStoreCard
                        key={r.phone}
                        retailer={r}
                        isExpanded={expandedStoreId === r.phone}
                        onToggle={() =>
                          setExpandedStoreId(expandedStoreId === r.phone ? null : r.phone)
                        }
                      />
                    ))}

                  {retailerStatus === 'loaded' && hasMore && (
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => fetchRetailerPage(false)}
                      className="w-full border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-surface-container transition-colors disabled:opacity-60"
                    >
                      {loadingMore ? 'Loading…' : 'Show more'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Map legend */}
            {hasMapData && (
              <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#154212] border-2 border-white shadow-sm inline-block" />
                  Manufacturer
                </span>
                {retailers.some((r) => r.geo) && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#d32f2f] border-2 border-white shadow-sm inline-block" />
                    Retailer stores
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Products Section ─────────────────────────────────────────────────── */}
      {allProducts.length > 0 && (
        <section id="brand-products" className="bg-surface-container-low">
          <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Available on KrishiDukan</p>
                <h2 className="text-xl md:text-2xl font-bold text-on-surface">Our Products</h2>
              </div>
              {onFindNearYou && (
                <button onClick={onFindNearYou}
                  className="flex items-center gap-1.5 text-primary text-xs md:text-sm font-bold hover:gap-2.5 transition-all">
                  Find near you <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              )}
            </div>
            <div className={`grid gap-3 md:gap-5 ${allProducts.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-3'}`}>
              {allProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  market={marketByName.get(p.name.toLowerCase().trim())}
                  // The cart stores the merged marketplace product's id, which is
                  // not always the manufacturer catalog doc id this page renders.
                  inCart={isInCart(marketByName.get(p.name.toLowerCase().trim())?.id ?? p.id)}
                  onAddToCart={() => handleAddToCart(p)}
                  onBuyNow={() => handleBuyNow(p)}
                  onProductClick={onProductClick}
                />
              ))}
            </div>
            {productCursor && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <button
                  onClick={loadMoreProducts}
                  disabled={productsLoading}
                  className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-bold disabled:opacity-60"
                >
                  {productsLoading ? 'Loading…' : 'Load more products'}
                </button>
                {productsLoadFailed && <p className="text-xs text-error">Could not load more. Please try again.</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Tips & Videos ────────────────────────────────────────────────────── */}
      {brandVideos.length > 0 && (
        <section className="bg-white border-b border-surface-container">
          <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">In Action</p>
              <h2 className="text-xl md:text-2xl font-bold text-on-surface">Tips & Videos</h2>
              <p className="text-on-surface-variant text-sm mt-0.5">Watch tips and stories from {brand.businessName}</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
              {brandVideos.map((v, i) =>
                v.embedUrl ? (
                  // YouTube / Instagram / Facebook play inline in their embedded player.
                  <div key={v.href}
                    className="relative shrink-0 snap-center rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-black"
                    style={{ width: 'min(200px, calc(50vw - 24px))', aspectRatio: '9/16' }}>
                    <iframe
                      src={v.embedUrl}
                      title={`${brand.businessName} ${v.label} video ${i + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen className="w-full h-full" loading="lazy"
                    />
                    {/* Reliable fallback: open the original if the embed is blocked/private.
                        Omitted for YouTube, whose own player already links out. */}
                    {v.platform !== 'youtube' && (
                      <a href={v.href} target="_blank" rel="noopener noreferrer"
                        title={`Open on ${v.label}`}
                        className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/80 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ) : (
                  // Instagram / Facebook / other links: a clickable card that reliably
                  // opens the original content in a new tab.
                  <a key={v.href} href={v.href} target="_blank" rel="noopener noreferrer"
                    className="group shrink-0 snap-center rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-gradient-to-br from-primary/90 to-primary/50 relative flex flex-col items-center justify-center gap-2 text-white transition-transform hover:scale-[1.02]"
                    style={{ width: 'min(200px, calc(50vw - 24px))', aspectRatio: '9/16' }}>
                    {v.platform === 'instagram' ? <Instagram className="w-10 h-10 drop-shadow" />
                      : v.platform === 'facebook' ? <Facebook className="w-10 h-10 drop-shadow" />
                      : <Film className="w-10 h-10 drop-shadow" />}
                    <span className="text-sm font-bold drop-shadow">{v.label}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/90">
                      Open <ExternalLink className="w-3 h-3" />
                    </span>
                  </a>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Reviews ─────────────────────────────────────────────────────────── */}
      {brand.phone && (
        <section className="max-w-7xl mx-auto px-6 md:px-10">
          <ReviewSection targetId={brand.phone} targetType="store" />
        </section>
      )}

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <section className="bg-primary">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-white">Interested in {brand.businessName} products?</h3>
            <p className="text-white/60 text-sm mt-1">
              {allProducts.length > 0
                ? `Find the nearest store carrying ${allProducts.slice(0, 3).map((p) => p.name).join(', ')}${(totalProducts ?? allProducts.length) > 3 ? ' & more' : ''}.`
                : 'Find the nearest store carrying our full product range.'}
            </p>
          </div>
          {onFindNearYou ? (
            <button onClick={onFindNearYou}
              className="shrink-0 flex items-center gap-2 bg-white hover:bg-white/90 text-primary px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/20">
              Browse Products Near You <ArrowRight className="w-4 h-4 text-primary" />
            </button>
          ) : (
            <a href="/"
              className="shrink-0 flex items-center gap-2 bg-white hover:bg-white/90 text-primary px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/20">
              Explore KrishiDukan <ArrowRight className="w-4 h-4 text-primary" />
            </a>
          )}
        </div>
      </section>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-on-surface text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  market,
  inCart,
  onAddToCart,
  onBuyNow,
  onProductClick,
}: {
  product: BrandProductSummary;
  /** Merged marketplace record for this product, when one exists — carries the
   *  cross-seller pricing the brand page's own catalog summary doesn't have. */
  market?: MarketplaceProduct;
  inCart: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onProductClick?: (id: string) => void;
}) {
  // Same derivation as the Market grid (see displayPrice): "X% off" only for
  // a genuine seller discount, struck against that seller's own price.
  const dp = market ? displayPrice(market) : displayPrice({ price: product.price });
  const showsDiscount = dp.mrp !== null;
  const savingsPct = dp.pct;
  // Absent marketplace data we can't prove it's offline-only, so keep the CTA.
  const orderable = market ? market.sellMode !== 'offline_store_only' : true;

  const openProduct = () => {
    if (onProductClick) { onProductClick(product.id); return; }
    // Standalone /brand route — hand off to the SPA's product view.
    window.location.href = `/?view=product&product=${product.id}`;
  };

  return (
    <motion.article
      whileTap={{ scale: 0.97 }}
      onClick={openProduct}
      className={`flex flex-col bg-white rounded-2xl border shadow-sm overflow-hidden text-left hover:shadow-md transition-all group cursor-pointer ${
        showsDiscount
          ? 'border-green-400 shadow-green-100 hover:shadow-green-200'
          : 'border-surface-container hover:border-primary/40'
      }`}
    >
      <div className="aspect-square bg-[#f7f5f0] flex items-center justify-center overflow-hidden p-2 relative">
        {product.image ? (
          <img loading="lazy" decoding="async" src={product.image} alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <span className="text-4xl opacity-20">🌿</span>
        )}

        {/* Corner offer ribbon — mirrors the Market card */}
        {showsDiscount && savingsPct > 0 && (
          <div className="absolute top-0 left-0 w-24 h-24 overflow-hidden pointer-events-none">
            <div
              className="absolute bg-green-500 shadow-md text-white text-center"
              style={{ width: 130, top: 20, left: -32, transform: 'rotate(-45deg)', padding: '5px 0' }}
            >
              <span className="flex items-center justify-center gap-0.5 text-[10px] font-black tracking-wide">
                <Tag className="h-2.5 w-2.5 shrink-0" />
                {savingsPct}% OFF
              </span>
            </div>
          </div>
        )}
      </div>

      <div className={`p-2.5 md:p-4 flex flex-col gap-0.5 flex-1 ${showsDiscount ? 'bg-gradient-to-b from-green-50/30 to-white' : ''}`}>
        <p className="text-[10px] font-black uppercase tracking-wide text-primary">{product.category}</p>
        <p className="text-xs md:text-sm font-bold text-on-surface leading-tight line-clamp-2">{product.name}</p>

        <PriceTag value={dp} size="sm" className="mt-1.5" />

        {/* CTA block mirrors the Market grid card exactly: one compact button on
            mobile, Add to Cart + Buy Now side by side on desktop. Keeping the two
            in step matters — a buyer who learns the controls on Market should not
            meet a different layout on a brand page. */}
        {orderable && (
          <div onClick={(e) => e.stopPropagation()} className="mt-2">
            {inCart ? (
              <>
                {/* Mobile: single compact in-cart button */}
                <a
                  href="/?view=cart"
                  onClick={(e) => e.stopPropagation()}
                  className="md:hidden block w-full text-center border-2 border-green-600 text-green-700 text-xs font-bold py-1.5 rounded-lg hover:bg-green-600 hover:text-white transition-colors"
                >
                  ✓ In Cart
                </a>
                {/* Desktop: Go to Cart + Buy Now */}
                <div className="hidden md:flex gap-1">
                  <a
                    href="/?view=cart"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center border-2 border-green-600 text-green-700 text-xs font-bold py-1.5 rounded-lg hover:bg-green-600 hover:text-white transition-colors"
                  >
                    Go to Cart
                  </a>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onBuyNow(); }}
                    className="flex-1 bg-primary text-white text-xs font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Buy Now
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Mobile: single + Add button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddToCart(); }}
                  className="md:hidden w-full bg-primary text-white text-xs font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
                >
                  <span className="text-sm font-black leading-none">+</span> Add
                </button>
                {/* Desktop: Add to Cart + Buy Now */}
                <div className="hidden md:flex gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddToCart(); }}
                    className="flex-1 border-2 border-primary text-primary text-xs font-bold py-1.5 rounded-lg hover:bg-primary hover:text-white transition-colors"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onBuyNow(); }}
                    className="flex-1 bg-primary text-white text-xs font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Buy Now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}
