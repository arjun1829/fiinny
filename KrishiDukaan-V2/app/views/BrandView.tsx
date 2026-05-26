'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import {
  MapPin, ShoppingBag, ArrowRight, Store,
  Leaf, ExternalLink, Package, BadgeCheck, Phone, Mail, ChevronRight, Navigation, Building2,
} from 'lucide-react';
import type { ManufacturerBrandData, BrandProductSummary, BrandRetailerSummary } from '../dashboard/_lib/brand-page-types';
import { haversineDistance, formatDistance } from '../utils/haversine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandViewProps {
  brand: ManufacturerBrandData;
  products: BrandProductSummary[];
  retailers?: BrandRetailerSummary[];
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

// ─── Retailer store card (matches ProductDetailView expandable card style) ─────

function RetailerStoreCard({ retailer, isExpanded, onToggle }: {
  retailer: RetailerWithDistance;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const loc = [retailer.address.city, retailer.address.state].filter(Boolean).join(', ');

  return (
    <div className={`rounded-2xl border-2 transition-all overflow-hidden ${
      isExpanded
        ? 'border-primary bg-white shadow-ambient'
        : 'border-surface-container bg-surface-container-low hover:border-outline-variant'
    }`}>
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left"
      >
        <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${isExpanded ? 'bg-primary text-white' : 'bg-white shadow-sm text-on-surface-variant'}`}>
          <Store className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="block font-bold text-on-surface truncate">{retailer.shopName || 'Store'}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {retailer.distanceKm < Infinity ? retailer.distanceLabel : loc || 'Nearby'}
            </span>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-outline transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded details */}
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
                {/* View on Map — links to Google Maps directions if geo available, else text query */}
                {retailer.geo ? (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${retailer.geo.latitude},${retailer.geo.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-primary text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Navigation className="w-3.5 h-3.5" /> View on Map
                  </a>
                ) : loc ? (
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(`${retailer.shopName} ${loc}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-primary text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Navigation className="w-3.5 h-3.5" /> View on Map
                  </a>
                ) : null}
                {/* Call Store */}
                {retailer.phone ? (
                  <a
                    href={`tel:${retailer.phone}`}
                    className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="w-3.5 h-3.5" /> Call Store
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

// ─── Main View ────────────────────────────────────────────────────────────────

export default function BrandView({
  brand,
  products,
  retailers = [],
  onProductClick,
  onFindNearYou,
}: BrandViewProps) {
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

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

  const showWhereToBuy = brand.geo || locationDisplay || retailers.length > 0;
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
              {locationDisplay && (
                <span className="flex items-center gap-1.5 text-white/70 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" /> {locationDisplay}
                </span>
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
            {brand.about && <p className="text-white/75 text-sm leading-relaxed max-w-lg">{brand.about}</p>}
            {(brand.phone || brand.email) && (
              <div className="flex flex-wrap gap-4">
                {brand.phone && (
                  <a href={`tel:${brand.phone}`} className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
                    <Phone className="w-3.5 h-3.5 text-amber-400" /> {brand.phone}
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
                { value: products.length.toString(), label: 'Products' },
                { value: retailers.length > 0 ? retailers.length.toString() : '—', label: 'Retailers' },
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

      {/* ── Where to Buy ─────────────────────────────────────────────────────── */}
      {showWhereToBuy && (
        <section className="bg-white border-b border-surface-container">
          <div className="max-w-7xl mx-auto w-full px-6 md:px-10 py-12 flex flex-col gap-6">

            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Where to Find Us</p>
                <h2 className="text-2xl font-bold text-on-surface">
                  {retailers.length > 0
                    ? `Available at ${retailers.length} Store${retailers.length !== 1 ? 's' : ''}`
                    : 'Our Location'}
                </h2>
                {locationDisplay && <p className="text-on-surface-variant text-sm mt-0.5">{locationDisplay}</p>}
              </div>
              {onFindNearYou && (
                <button onClick={onFindNearYou}
                  className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:scale-[1.02] active:scale-95 transition-all">
                  <MapPin className="w-3.5 h-3.5" /> Find Near You
                </button>
              )}
            </div>

            {/* Map left + store cards right */}
            <div className="flex flex-col md:flex-row gap-5">

              {/* Map */}
              {hasMapData && (
                <div className={`h-80 rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-surface-container shrink-0 ${
                  retailersWithDistance.length > 0 ? 'md:flex-1' : 'w-full'
                }`}>
                  <BrandGeoMap manufacturerGeo={brand.geo} retailers={retailers} />
                </div>
              )}

              {/* Retailer store cards — same expandable style as ProductDetailView */}
              {retailersWithDistance.length > 0 && (
                <div className="md:w-80 flex flex-col gap-3 max-h-80 overflow-y-auto pr-0.5">
                  {retailersWithDistance.map((r) => (
                    <RetailerStoreCard
                      key={r.phone}
                      retailer={r}
                      isExpanded={expandedStoreId === r.phone}
                      onToggle={() => setExpandedStoreId(expandedStoreId === r.phone ? null : r.phone)}
                    />
                  ))}
                </div>
              )}

              {/* No map, no retailers — plain address fallback */}
              {!hasMapData && retailers.length === 0 && locationDisplay && (
                <div className="flex items-center gap-3 rounded-2xl border border-surface-container bg-surface-container-low p-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface text-sm">{brand.businessName}</p>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                      <MapPin className="w-2.5 h-2.5" /> {locationDisplay}
                    </p>
                  </div>
                </div>
              )}
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
      {products.length > 0 && (
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
            <div className={`grid gap-3 md:gap-5 ${products.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-3'}`}>
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onProductClick={onProductClick} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── YouTube Videos ───────────────────────────────────────────────────── */}
      {brand.videos.length > 0 && (
        <section className="bg-white border-b border-surface-container">
          <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">In Action</p>
              <h2 className="text-xl md:text-2xl font-bold text-on-surface">See the Results</h2>
              <p className="text-on-surface-variant text-sm mt-0.5">Farmers share their experience with {brand.businessName}</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
              {brand.videos.map((videoId, i) => (
                <div key={videoId}
                  className="shrink-0 snap-center rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-black"
                  style={{ width: 'min(200px, calc(50vw - 24px))', aspectRatio: '9/16' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                    title={`${brand.businessName} video ${i + 1}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen className="w-full h-full" loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Bottom CTA ──────────────────────────────────────────────────────── */}
      <section className="bg-primary">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-white">Interested in {brand.businessName} products?</h3>
            <p className="text-white/60 text-sm mt-1">
              {products.length > 0
                ? `Find the nearest store carrying ${products.slice(0, 3).map((p) => p.name).join(', ')}${products.length > 3 ? ' & more' : ''}.`
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

    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onProductClick,
}: {
  product: BrandProductSummary;
  onProductClick?: (id: string) => void;
}) {
  const inner = (
    <>
      <div className="aspect-square bg-[#f7f5f0] flex items-center justify-center overflow-hidden p-2">
        {product.image ? (
          <img src={product.image} alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <span className="text-4xl opacity-20">🌿</span>
        )}
      </div>
      <div className="p-2.5 md:p-4 flex flex-col gap-0.5">
        <p className="text-[10px] font-black uppercase tracking-wide text-primary">{product.category}</p>
        <p className="text-xs md:text-sm font-bold text-on-surface leading-tight line-clamp-2">{product.name}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-sm md:text-base font-extrabold text-secondary">₹{product.price}</span>
        </div>
      </div>
    </>
  );

  const cls = "flex flex-col bg-white rounded-2xl border border-surface-container shadow-sm overflow-hidden text-left hover:border-primary/40 hover:shadow-md transition-all group";

  if (onProductClick) {
    return (
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => onProductClick(product.id)} className={cls}>
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.a whileTap={{ scale: 0.97 }} href={`/?view=product&product=${product.id}`} className={cls}>
      {inner}
    </motion.a>
  );
}
