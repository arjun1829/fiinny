"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { MarketplaceProduct } from "../../types/product";
import { ICONS, PRODUCTS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { trackProductImpression } from '../firebase';
import type { StoreWithDistance } from '../utils/nearby';
import { useI18n } from '../i18n/I18nContext';
import type { CartItem } from '../../types/order';
import { Tag } from 'lucide-react';
import { calcDiscount } from '../utils/discount';

interface MarketViewProps {
  products?: MarketplaceProduct[];
  onProductClick: (id: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  storesWithDistance?: StoreWithDistance[];
  onAddToCart?: (product: MarketplaceProduct) => void;
  onBuyNow?: (product: MarketplaceProduct) => void;
  cartItems?: CartItem[];
  onGoToCart?: () => void;
}

type SortKey = 'default' | 'price-asc' | 'price-desc' | 'name-asc';

function inferBrand(name: string): string {
  // First word of product name is a reasonable brand proxy for this catalog.
  return name.trim().split(/\s+/)[0] || 'Other';
}

function formatDistance(km: number, nearbyLabel: string): string {
  if (!Number.isFinite(km)) return nearbyLabel;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function MarketView({
  products = PRODUCTS,
  onProductClick,
  selectedCategory,
  onCategoryChange,
  storesWithDistance = [],
  onAddToCart,
  onBuyNow,
  cartItems = [],
  onGoToCart,
}: MarketViewProps) {
  const { t } = useI18n();
  const DISTANCE_OPTIONS = useMemo(() => [
    { label: t('anyDistance'), km: Infinity },
    { label: t('within5km'), km: 5 },
    { label: t('within25km'), km: 25 },
    { label: t('within100km'), km: 100 },
    { label: t('within500km'), km: 500 },
  ], [t]);
  const trackedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Track impressions for products currently in view
    products.forEach((p, index) => {
      if (!trackedIds.current.has(p.id)) {
        trackProductImpression(p.id, index + 1);
        trackedIds.current.add(p.id);
      }
    });
  }, [products]);

  const categories = [
    { id: 'all', name: t('allProducts'), icon: null },
    { id: 'seeds', name: t('catSeeds'), icon: ICONS.Sprout },
    { id: 'fertilizers', name: t('catFertilizers'), icon: ICONS.Science },
    { id: 'pesticides', name: t('catPesticides'), icon: ICONS.Science },
    { id: 'tools', name: t('catTools'), icon: ICONS.Market },
  ];

  const [filterOpen, setFilterOpen] = useState(false);
  const [distanceOpen, setDistanceOpen] = useState(false);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(Infinity);
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [priceMax, setPriceMax] = useState<number>(3000);

  const storeDistanceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of storesWithDistance) m.set(s.id, s.distanceKm);
    return m;
  }, [storesWithDistance]);

  const productDistance = (p: MarketplaceProduct): number => {
    const candidates: number[] = [];
    for (const a of p.availability || []) {
      const d = storeDistanceMap.get(a.storeId);
      if (typeof d === 'number' && Number.isFinite(d)) candidates.push(d);
    }
    if (!candidates.length) return Infinity;
    return Math.min(...candidates);
  };

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(inferBrand(p.name));
    return ['all', ...Array.from(set).sort()];
  }, [products]);

  const visibleProducts = useMemo(() => {
    let list = products.slice();

    if (brandFilter !== 'all') {
      list = list.filter((p) => inferBrand(p.name) === brandFilter);
    }
    if (Number.isFinite(priceMax)) {
      list = list.filter((p) => p.price <= priceMax);
    }
    if (Number.isFinite(maxDistanceKm)) {
      list = list.filter((p) => productDistance(p) <= maxDistanceKm);
    }
    switch (sortBy) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'name-asc':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        list.sort((a, b) => productDistance(a) - productDistance(b));
    }
    return list;
  }, [products, brandFilter, priceMax, maxDistanceKm, sortBy, storeDistanceMap]);

  const distanceLabel =
    DISTANCE_OPTIONS.find((o) => o.km === maxDistanceKm)?.label || t('within5km');

  const activeFilterCount =
    (brandFilter !== 'all' ? 1 : 0) +
    (priceMax < 3000 ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0);

  return (
    <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8">
      <header className="mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-on-surface mb-3 tracking-tight">
          {t('localMarketplace')}
        </h1>
        <p className="text-on-surface-variant text-lg">
          {t('marketSubtitle')}
        </p>
      </header>

      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-6 mb-6 pb-2">
        <div className="flex items-center gap-2 min-w-0 w-full md:w-auto">
          {/*
            Categories row — horizontally scrollable on mobile.
            Negative margin + matching padding lets chips bleed into the page's edge padding
            so a partial chip on the right acts as a visual scroll affordance. Desktop is
            reset via md:* to the original `flex gap-3 overflow-x-auto`.
          */}
          <div className="flex-1 md:flex-initial min-w-0 flex gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`flex-shrink-0 px-6 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 transition-all shadow-sm ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-white text-on-surface border border-surface-container-highest hover:bg-surface-container-low'
                }`}
              >
                {cat.icon && <cat.icon className="w-4 h-4 text-secondary" />}
                {cat.name}
              </button>
            ))}
          </div>
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey="marketCategories"
            ariaLabel="Category help"
          />
        </div>
        <div className="flex items-center gap-3 relative" data-tour="market-filters">
          {/* Filter */}
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => {
                setFilterOpen((v) => !v);
                setDistanceOpen(false);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold shadow-sm transition-colors border ${
                filterOpen || activeFilterCount > 0
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-on-surface border-surface-container-highest hover:bg-surface-container'
              }`}
            >
              <ICONS.Efficiency className="w-4 h-4 rotate-90" />
              {t('filter')}
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-white text-primary text-[10px] font-black rounded-full px-1.5 py-0.5">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="bottom"
              textKey="marketFilter"
              ariaLabel="Filter help"
            />

            <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute left-0 md:left-auto md:right-0 top-full mt-2 w-[min(280px,calc(100vw-2rem))] md:w-[280px] bg-white rounded-2xl shadow-2xl border border-surface-container p-4 z-50"
                >
                  <div className="mb-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-outline">
                      {t('sortBy')}
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortKey)}
                      className="mt-1 w-full border border-surface-container-highest rounded-xl px-3 py-2 text-sm font-medium bg-surface-container-low"
                    >
                      <option value="default">{t('sortNearest')}</option>
                      <option value="price-asc">{t('sortPriceLow')}</option>
                      <option value="price-desc">{t('sortPriceHigh')}</option>
                      <option value="name-asc">{t('sortNameAsc')}</option>
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-outline">
                      {t('brand')}
                    </label>
                    <select
                      value={brandFilter}
                      onChange={(e) => setBrandFilter(e.target.value)}
                      className="mt-1 w-full border border-surface-container-highest rounded-xl px-3 py-2 text-sm font-medium bg-surface-container-low"
                    >
                      {brandOptions.map((b) => (
                        <option key={b} value={b}>
                          {b === 'all' ? t('allBrands') : b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-outline">
                      {t('maxPrice')}: ₹{priceMax.toLocaleString('en-IN')}
                    </label>
                    <input
                      type="range"
                      min={100}
                      max={3000}
                      step={50}
                      value={priceMax}
                      onChange={(e) => setPriceMax(Number(e.target.value))}
                      className="w-full mt-1 accent-primary"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setBrandFilter('all');
                      setPriceMax(3000);
                      setSortBy('default');
                    }}
                    className="text-xs font-bold text-primary hover:underline mt-2"
                  >
                    {t('resetFilters')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Distance */}
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => {
                setDistanceOpen((v) => !v);
                setFilterOpen(false);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold shadow-sm transition-colors border ${
                Number.isFinite(maxDistanceKm)
                  ? 'bg-secondary-container/30 text-on-surface border-secondary-container'
                  : 'bg-white text-on-surface border-surface-container-highest'
              }`}
            >
              <ICONS.Location className="w-4 h-4 text-secondary" />
              {distanceLabel}
              <ICONS.ChevronRight className="w-4 h-4 rotate-90" />
            </button>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="bottom"
              textKey="marketDistance"
              ariaLabel="Distance help"
            />
            <AnimatePresence>
              {distanceOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute right-0 top-full mt-2 w-[min(200px,calc(100vw-2rem))] md:w-[200px] bg-white rounded-2xl shadow-2xl border border-surface-container py-2 z-50"
                >
                  {DISTANCE_OPTIONS.map((o) => (
                    <button
                      key={o.label}
                      onClick={() => {
                        setMaxDistanceKm(o.km);
                        setDistanceOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm font-medium hover:bg-surface-container-low ${
                        maxDistanceKm === o.km ? 'text-primary font-bold' : 'text-on-surface'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <p className="text-sm text-outline mb-4 font-medium">
        {t('showing')} <span className="text-on-surface font-bold">{visibleProducts.length}</span> {t('productsLabel')}
        {brandFilter !== 'all' ? ` ${t('fromBrand')} ${brandFilter}` : ''}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {visibleProducts.length > 0 ? (
          visibleProducts.map((product, idx) => {
            const dist = productDistance(product);
            const distText = formatDistance(dist, t('nearby'));
            const brand = inferBrand(product.name);
            // Try to derive size by stripping the brand-like prefix from fullName.
            const size =
              product.fullName && product.fullName !== product.name
                ? product.fullName.replace(product.name, '').trim() || null
                : null;
            const maxPct = product.maxDiscountPct ?? product.effectiveDiscountPct ?? 0;
            const hasOffer = maxPct > 0;
            const { finalPrice: discountedPrice } = calcDiscount(product.price, maxPct);
            return (
              <motion.article
                key={`${product.id}-${idx}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(idx * 0.03, 0.6) }}
                onClick={() => onProductClick(product.id)}
                className={`bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-ambient transition-all duration-300 flex flex-col border group cursor-pointer ${
                  hasOffer
                    ? 'border-green-400 shadow-green-100 hover:shadow-green-200'
                    : 'border-surface-container'
                }`}
              >
                <div className="aspect-[4/3] relative overflow-hidden bg-surface-container">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105 bg-white"
                  />

                  {/* ── Corner offer ribbon (top-left) ── */}
                  {hasOffer && (
                    <div className="absolute top-0 left-0 w-24 h-24 overflow-hidden pointer-events-none">
                      <div
                        className="absolute bg-green-500 shadow-md text-white text-center"
                        style={{ width: 130, top: 20, left: -32, transform: 'rotate(-45deg)', padding: '5px 0' }}
                      >
                        <span className="flex items-center justify-center gap-0.5 text-[10px] font-black tracking-wide">
                          <Tag className="h-2.5 w-2.5 shrink-0" />
                          {maxPct}% OFF
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Category badge — top right */}
                  {product.category && product.category !== 'general' && (
                    <span className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-md text-on-surface text-[10px] uppercase font-black px-2 py-0.5 rounded-full shadow-sm capitalize">
                      {product.category}
                    </span>
                  )}

                  {/* Rating badge — bottom left */}
                  {(product.averageRating ?? 0) > 0 && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                      <span className="text-amber-400">★</span>
                      {product.averageRating!.toFixed(1)}
                      {product.totalReviews ? <span className="text-white/70">({product.totalReviews})</span> : null}
                    </span>
                  )}
                </div>

                <div className={`p-4 flex flex-col flex-1 ${hasOffer ? 'bg-gradient-to-b from-green-50/30 to-white' : ''}`}>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div onClick={(e) => e.stopPropagation()} className="self-start">
                      <HelperTooltip side="bottom" textKey="marketNearbyStore">
                        <div className="flex items-center gap-1.5 text-secondary bg-secondary/5 px-2 py-0.5 rounded-lg cursor-help">
                          <ICONS.Market className="w-3 h-3" />
                          <span className="text-[10px] font-bold tracking-tight">
                            {product.store} • {formatDistance(dist, t('nearby'))}
                          </span>
                        </div>
                      </HelperTooltip>
                    </div>
                    {/* Out of Stock label — shown only when all known sellers report no stock */}
                    {product.stock && product.stock.toLowerCase().includes('out') && (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-red-500 border border-red-200 bg-red-50 px-1.5 py-0.5 rounded-full">
                        Out of Stock
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-on-surface line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  {product.description && product.description.trim() && (
                    <p className="text-on-surface-variant text-xs mt-1 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  {hasOffer ? (
                    /* ── Offer price block ── */
                    <div className="mt-auto pt-2.5 border-t border-green-100">
                      {/* Unit label */}
                      <span className="text-[10px] text-outline font-bold uppercase tracking-widest">
                        {size || t('perUnitCaps')}
                      </span>
                      {/* Price row: big discounted + strikethrough original */}
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xl font-black text-green-700 leading-none">
                          ₹{discountedPrice.toLocaleString('en-IN')}
                        </span>
                        <span className="text-sm font-semibold text-outline line-through leading-none">
                          ₹{product.price.toLocaleString('en-IN')}
                        </span>
                      </div>
                      {/* Save badge */}
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm shadow-green-600/30">
                          <Tag className="h-2.5 w-2.5 shrink-0" />
                          Save ₹{(product.price - discountedPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                        {brand.toLowerCase() !== product.name.toLowerCase().trim() && (
                          <span className="text-[10px] text-outline font-semibold">{brand}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Regular price block ── */
                    <div className={`mt-auto pt-3 flex justify-between items-end border-t border-surface-container`}>
                      <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <HelperTooltip side="top" textKey="marketUnits">
                          <span className="text-[10px] text-outline font-bold uppercase tracking-widest cursor-help">
                            {size || t('perUnitCaps')}
                          </span>
                        </HelperTooltip>
                        <HelperTooltip side="top" textKey="marketPriceInfo">
                          <div className="flex items-baseline gap-1 cursor-help">
                            {product.lowestPrice && product.lowestPrice < product.price ? (
                              <>
                                <span className="text-[9px] font-bold text-outline uppercase tracking-wide">From</span>
                                <span className="text-lg font-bold text-secondary">
                                  ₹{product.lowestPrice.toLocaleString('en-IN')}
                                </span>
                                <span className="text-[10px] text-outline line-through">
                                  ₹{product.price.toLocaleString('en-IN')}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-lg font-bold text-secondary">
                                  ₹{product.price.toLocaleString('en-IN')}
                                </span>
                                {product.oldPrice && product.oldPrice > product.price && (
                                  <span className="text-[10px] text-outline line-through">
                                    ₹{product.oldPrice}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </HelperTooltip>
                      </div>
                      {brand.toLowerCase() !== product.name.toLowerCase().trim() && (
                        <span className="text-[10px] text-outline font-semibold">{brand}</span>
                      )}
                    </div>
                  )}
                  {/* Cart CTA — changes state once item is in cart */}
                  {(() => {
                    const inCart = cartItems.some((ci) => ci.productId === product.id);
                    if (inCart) {
                      return (
                        <div onClick={(e) => e.stopPropagation()} className="mt-2 flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); onGoToCart?.(); }}
                            className="flex-1 border-2 border-green-600 text-green-700 text-xs font-bold py-1.5 rounded-lg hover:bg-green-600 hover:text-white transition-colors"
                          >
                            Go to Cart
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onBuyNow ? onBuyNow(product) : onGoToCart?.(); }}
                            className="flex-1 bg-primary text-white text-xs font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            Buy Now
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div onClick={(e) => e.stopPropagation()} className="mt-2 flex gap-1">
                        <HelperTooltip side="top" textKey="marketAddToCart">
                          <button
                            onClick={(e) => { e.stopPropagation(); onAddToCart ? onAddToCart(product) : onProductClick(product.id); }}
                            className="flex-1 border-2 border-primary text-primary text-xs font-bold py-1.5 rounded-lg hover:bg-primary hover:text-white transition-colors"
                          >
                            {t('addToCart')}
                          </button>
                        </HelperTooltip>
                        <button
                          onClick={(e) => { e.stopPropagation(); onBuyNow ? onBuyNow(product) : (onAddToCart ? onAddToCart(product) : onProductClick(product.id)); }}
                          className="flex-1 bg-primary text-white text-xs font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          Buy Now
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </motion.article>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-surface-container">
            <ICONS.Search className="w-10 h-10 text-outline-variant mx-auto mb-4" />
            <h3 className="text-xl font-bold text-on-surface mb-2">{t('noProducts')}</h3>
            <p className="text-on-surface-variant">{t('noProductsHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
