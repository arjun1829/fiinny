'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import {
  MapPin, ShoppingBag, ArrowRight, Store,
  Leaf, ExternalLink, Package, BadgeCheck, Phone, Mail
} from 'lucide-react';
import { MarketplaceProduct } from '../../types/product';
import { MANUFACTURERS, PRODUCTS, STORES } from '../constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandViewProps {
  manufacturerId: string;
  products: MarketplaceProduct[];
  stores: any[];
  onProductClick: (id: string) => void;
  onFindNearYou: (manufacturerId: string) => void;
  onStoreClick: (storeId: string) => void;
}

// ─── Mini Map ─────────────────────────────────────────────────────────────────

function BrandMap({ stores, onStoreClick }: { stores: any[]; onStoreClick: (id: string) => void }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });

  const [activeStore, setActiveStore] = useState<string | null>(null);

  const center = useMemo(() => {
    if (!stores.length) return { lat: 16.705, lng: 74.2433 };
    const lat = stores.reduce((s, st) => s + (st.location?.lat ?? 0), 0) / stores.length;
    const lng = stores.reduce((s, st) => s + (st.location?.lng ?? 0), 0) / stores.length;
    return { lat, lng };
  }, [stores]);

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-container rounded-2xl">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1rem' }}
      center={center}
      zoom={10}
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
      {stores.map((store) =>
        store.location ? (
          <MarkerF
            key={store.id}
            position={store.location}
            onClick={() => {
              setActiveStore(store.id);
              onStoreClick(store.id);
            }}
            icon={{
              url: activeStore === store.id
                ? `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><circle cx="18" cy="18" r="14" fill="#154212" stroke="white" stroke-width="3"/><polygon points="13,30 18,44 23,30" fill="#154212"/><circle cx="18" cy="18" r="7" fill="white" fill-opacity="0.9"/></svg>')}`
                : `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><circle cx="14" cy="14" r="11" fill="#f57c00" stroke="white" stroke-width="2.5"/><polygon points="9,23 14,36 19,23" fill="#f57c00"/><circle cx="14" cy="14" r="5" fill="white" fill-opacity="0.9"/></svg>')}`,
              scaledSize: activeStore === store.id
                ? new google.maps.Size(36, 44)
                : new google.maps.Size(28, 36),
            }}
          />
        ) : null
      )}
    </GoogleMap>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function BrandView({
  manufacturerId,
  products,
  stores,
  onProductClick,
  onFindNearYou,
  onStoreClick,
}: BrandViewProps) {
  const brand = MANUFACTURERS[manufacturerId];

  const allKnownProducts = useMemo(() => {
    const fbIds = new Set(products.map((p) => p.id));
    const constOnly = PRODUCTS.filter((p) => !fbIds.has(p.id));
    return [...products, ...constOnly];
  }, [products]);

  const allKnownStores = useMemo(() => {
    const fbIds = new Set(stores.map((s) => s.id));
    const constOnly = STORES.filter((s) => !fbIds.has(s.id));
    return [...stores, ...constOnly];
  }, [stores]);

  const brandProducts = useMemo(
    () => allKnownProducts.filter((p) => p.manufacturerId === manufacturerId),
    [allKnownProducts, manufacturerId]
  );

  const brandStores = useMemo(
    () => allKnownStores.filter((s) => brand?.storeIds.includes(s.id)),
    [allKnownStores, brand]
  );

  if (!brand) {
    return <div className="p-20 text-center text-on-surface-variant">Brand not found.</div>;
  }

  return (
    <div className="flex flex-col">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-primary">
        {/* Natural agriculture background — SVG scene */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Sky gradient */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(180deg, #0a1f08 0%, #122b10 35%, #1a3d14 60%, #2a5a1a 80%, #3d7a22 95%, #4a8f28 100%)'
          }} />
          {/* Sun glow */}
          <div className="absolute" style={{
            right: '15%', top: '20%', width: '280px', height: '280px',
            background: 'radial-gradient(circle, rgba(245,124,0,0.35) 0%, rgba(245,124,0,0.15) 40%, transparent 70%)',
            borderRadius: '50%'
          }} />
          {/* Wheat field silhouette */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,200 L0,140 Q20,100 40,130 Q50,90 60,120 Q70,80 80,115 Q90,75 100,110 Q110,70 120,108 Q130,72 140,105 Q150,68 160,102 Q170,65 180,100 Q190,62 200,98 Q220,58 240,95 Q255,60 270,92 Q285,55 300,88 Q315,52 330,85 Q345,48 360,82 Q375,45 390,78 Q410,42 430,75 Q450,40 470,72 Q490,38 510,70 Q530,35 550,68 Q570,32 590,65 Q615,30 640,63 Q660,28 680,60 Q700,25 720,58 Q740,22 760,55 Q780,20 800,52 Q820,18 840,50 Q860,15 880,48 Q900,12 920,45 Q945,10 970,43 Q990,8 1010,40 Q1030,5 1050,38 Q1075,3 1100,36 Q1120,2 1140,34 Q1165,0 1190,32 Q1215,-2 1240,30 Q1265,0 1290,28 Q1315,-2 1340,26 Q1365,0 1390,24 L1440,22 L1440,200 Z" fill="rgba(10,31,8,0.9)" />
          </svg>
          {/* Wheat stalks layer 1 */}
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
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(10,31,8,0.82) 0%, rgba(10,31,8,0.55) 50%, rgba(10,31,8,0.35) 100%)'
          }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 md:px-10 py-12 md:py-16 flex flex-col md:flex-row items-start md:items-center gap-10">

          {/* Left */}
          <div className="flex-1 flex flex-col gap-5">
            <div className="flex items-center gap-2 w-fit">
              <BadgeCheck className="w-4 h-4 text-amber-400" />
              <span className="text-white/80 text-xs font-semibold">Verified Manufacturer on KrishiDukan</span>
            </div>

            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
                {brand.name}
              </h1>
              <p className="text-white/70 text-lg mt-3 leading-relaxed">{brand.tagline}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-white/70 text-xs">
                <MapPin className="w-3.5 h-3.5 text-amber-400" /> {brand.location}
              </span>
              <span className="text-white/30">·</span>
              <span className="flex items-center gap-1.5 text-white/70 text-xs">
                <Package className="w-3.5 h-3.5 text-amber-400" /> Est. {brand.founded}
              </span>
              {brand.website && (
                <>
                  <span className="text-white/30">·</span>
                  <a
                    href={brand.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-white/70 text-xs hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-amber-400" />
                    {(() => { try { return new URL(brand.website!).hostname.replace('www.', ''); } catch { return brand.website; } })()}
                  </a>
                </>
              )}
            </div>

            <p className="text-white/60 text-sm leading-relaxed max-w-lg">{brand.about}</p>

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
              <button
                onClick={() => onFindNearYou(manufacturerId)}
                className="flex items-center gap-2 bg-white hover:bg-white/90 text-primary px-6 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/20"
              >
                <MapPin className="w-4 h-4 text-primary" /> Find Near You
              </button>
              <a
                href="#brand-products"
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all border border-white/20"
              >
                <ShoppingBag className="w-4 h-4" /> View Products
              </a>
            </div>
          </div>

          {/* Right — stats (clean, no boxes) */}
          <div className="flex flex-col gap-5 md:w-72 w-full shrink-0">
            {/* Social proof */}
            <div className="flex items-center gap-3 pb-4 border-b border-white/15">
              <span className="text-3xl">🏆</span>
              <div>
                <p className="text-white font-extrabold text-xl leading-tight">Highly in Demand!</p>
                <p className="text-amber-300 text-sm font-bold mt-0.5">{brand.socialProof}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 pb-4 border-b border-white/15">
              {[
                { value: brandProducts.length.toString(), label: 'Products' },
                { value: brandStores.length.toString(), label: 'Stores' },
                { value: '5+', label: 'Districts' },
              ].map(({ value, label }, i) => (
                <div key={label} className={`text-center ${i > 0 ? 'border-l border-white/15' : ''}`}>
                  <p className="text-3xl font-extrabold text-white">{value}</p>
                  <p className="text-white/50 text-[9px] font-bold uppercase tracking-widest mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Certifications */}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {brand.certifications.map((cert) => (
                <span key={cert} className="flex items-center gap-1.5 text-white/70 text-xs">
                  <Leaf className="w-3 h-3 text-green-400 shrink-0" /> {cert}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Store Coverage (MAP FIRST) ───────────────────────────────────────── */}
      <section className="bg-white border-b border-surface-container">
        <div className="max-w-7xl mx-auto w-full px-6 md:px-10 py-12 flex flex-col gap-6">

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Where to Buy</p>
              <h2 className="text-2xl font-bold text-on-surface">Available at {brandStores.length} Stores</h2>
              <p className="text-on-surface-variant text-sm mt-0.5">Near {brand.location}</p>
            </div>
            <button
              onClick={() => onFindNearYou(manufacturerId)}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:scale-[1.02] active:scale-95 transition-all"
            >
              <MapPin className="w-3.5 h-3.5" /> Find Near You
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="h-80 rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-surface-container">
              <BrandMap stores={brandStores} onStoreClick={onStoreClick} />
            </div>

            <div className="flex flex-col gap-2.5">
              {brandStores.map((store, i) => (
                <motion.div
                  key={store.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-white rounded-xl border border-surface-container p-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => onStoreClick(store.id)}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                    <Store className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-on-surface text-sm truncate">{store.name}</p>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                      <MapPin className="w-2.5 h-2.5" /> {store.address}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[9px] font-black uppercase tracking-wide bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                      In Stock
                    </span>
                    <span className="text-[10px] text-on-surface-variant">{store.status?.startsWith('Open') ? store.status : 'Check hours'}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Products Section ─────────────────────────────────────────────────── */}
      <section id="brand-products" className="bg-surface-container-low">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-5">

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Available on KrishiDukan</p>
              <h2 className="text-xl md:text-2xl font-bold text-on-surface">Our Products</h2>
            </div>
            <button
              onClick={() => onFindNearYou(manufacturerId)}
              className="flex items-center gap-1.5 text-primary text-xs md:text-sm font-bold hover:gap-2.5 transition-all"
            >
              Find near you <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>

          {/* Compact product grid — all visible at once, 3 per row */}
          <div className={`grid gap-3 md:gap-5 ${brandProducts.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-3'}`}>
            {brandProducts.map((p) => (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => onProductClick(p.id)}
                className="flex flex-col bg-white rounded-2xl border border-surface-container shadow-sm overflow-hidden text-left hover:border-primary/40 hover:shadow-md transition-all group"
              >
                {/* Image */}
                <div className="aspect-square bg-[#f7f5f0] flex items-center justify-center overflow-hidden p-2">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                {/* Info */}
                <div className="p-2.5 md:p-4 flex flex-col gap-0.5">
                  <p className="text-[10px] font-black uppercase tracking-wide text-primary">{p.category}</p>
                  <p className="text-xs md:text-sm font-bold text-on-surface leading-tight line-clamp-2">{p.name}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-sm md:text-base font-extrabold text-secondary">₹{p.price}</span>
                    {p.oldPrice && (
                      <span className="text-[10px] text-on-surface-variant line-through">₹{p.oldPrice}</span>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ── YouTube Shorts ───────────────────────────────────────────────────── */}
      {brand.videos && brand.videos.length > 0 && (
        <section className="bg-white border-b border-surface-container">
          <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-10 flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">In Action</p>
              <h2 className="text-xl md:text-2xl font-bold text-on-surface">See the Results</h2>
              <p className="text-on-surface-variant text-sm mt-0.5">Farmers share their experience with {brand.name}</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
              {brand.videos.map((videoId, i) => (
                <div
                  key={videoId}
                  className="shrink-0 snap-center rounded-2xl overflow-hidden border border-surface-container shadow-sm bg-black"
                  style={{ width: 'min(200px, calc(50vw - 24px))', aspectRatio: '9/16' }}
                >
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                    title={`${brand.name} video ${i + 1}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                    loading="lazy"
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
            <h3 className="text-xl font-bold text-white">Interested in {brand.name} products?</h3>
            <p className="text-white/60 text-sm mt-1">Find the nearest store carrying {brand.productIds.length > 0 ? `${brandProducts.slice(0, 3).map(p => p.name).join(', ')}${brandProducts.length > 3 ? ' & more' : ''}.` : 'our full product range.'}</p>
          </div>
          <button
            onClick={() => onFindNearYou(manufacturerId)}
            className="shrink-0 flex items-center gap-2 bg-white hover:bg-white/90 text-primary px-7 py-3.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-black/20"
          >
            Browse Products Near You <ArrowRight className="w-4 h-4 text-primary" />
          </button>
        </div>
      </section>

    </div>
  );
}
