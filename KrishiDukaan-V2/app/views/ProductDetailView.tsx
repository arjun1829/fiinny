import { MarketplaceProduct } from "../../types/product";
import { ICONS, PRODUCTS, STORES } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import { StoreWithDistance } from '../utils/nearby';
import { trackProductClick } from '../firebase';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { useI18n } from '../i18n/I18nContext';

type StoreListItem = {
  id: string;
  name: string;
  distance?: string;
  status?: string;
  stock?: string[];
};

interface ProductDetailViewProps {
  products?: MarketplaceProduct[];
  stores?: StoreListItem[];
  productId: string | null;
  onBack: () => void;
  onStoreClick: (storeId: string) => void;
  onProductClick?: (id: string) => void;
  onViewSellerAll?: (storeName: string) => void;
  storesWithDistance?: StoreWithDistance[];
  onAddToCart?: (product: MarketplaceProduct) => void;
}

export default function ProductDetailView({ 
  products = PRODUCTS, 
  stores = STORES, 
  productId, 
  onBack, 
  onStoreClick, 
  onProductClick, 
  onViewSellerAll,
  storesWithDistance = [],
  onAddToCart,
}: ProductDetailViewProps) {
  const { t } = useI18n();
  const product = products.find(p => p.id === productId) || products[0];
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (product && product.id) {
      trackProductClick(product.id);
    }
  }, [product.id]);

  const sellerProducts = products.filter(p => {
    if (p.id === product.id) return false;
    if (product.retailerId && p.retailerId) return p.retailerId === product.retailerId;
    return product.store !== 'Local Store' && p.store === product.store;
  }).slice(0, 6);

  // Use storesWithDistance for computed distances, fallback to STORES constant
  const availableStores = useMemo(() => {
    const sourceStores = storesWithDistance.length > 0 ? storesWithDistance : stores;
    const filtered = sourceStores.filter(store =>
      product.availability?.some(a => a.storeId === store.id)
    );
    // Sort by distance if we have computed distances
    if (storesWithDistance.length > 0) {
      return [...filtered].sort((a: any, b: any) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return filtered;
  }, [product, storesWithDistance, stores]);

  return (
    <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 flex flex-col gap-10">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs font-bold text-on-surface-variant uppercase tracking-widest">
        <button className="hover:text-primary transition-colors" onClick={onBack}>{t('breadcrumbMarket')}</button>
        <ICONS.ChevronRight className="w-3 h-3" />
        <span className="text-outline">{product.category}</span>
        <ICONS.ChevronRight className="w-3 h-3" />
        <span className="text-primary">{product.name}</span>
      </nav>

      {/* Top grid: image left, stores right */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

        {/* Left — Product image */}
        <div className="flex flex-col gap-4">
          <motion.div
            layoutId={`prod-img-${product.id}`}
            className="aspect-[4/3] rounded-3xl overflow-hidden bg-white shadow-ambient border border-surface-container relative"
          >
            <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
            <HelperTooltip side="bottom" textKey="productQualityBadge">
              <div className="absolute top-6 left-6 bg-primary-container text-on-primary-container px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-md cursor-help">
                <ICONS.Check className="w-4 h-4" />
                {t('premiumGrade')}
              </div>
            </HelperTooltip>
          </motion.div>
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-2xl border-2 border-primary overflow-hidden cursor-pointer shadow-sm">
              <img src={product.image} className="w-full h-full object-cover" alt="thumb1" />
            </div>
            <div className="w-24 h-24 rounded-2xl border border-surface-container-highest overflow-hidden opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDRy2KbS0xyVt7brjix_bSB7rxB4v7-foDeu7vBzhgbFNrZJwXRzXVQJIffFqGQN-xSvlGNa8GnrS4ej7VfxD6s7IdXzJbsi48RIR99heAy7LwMPJlXATrIo7Z_Hbh7nepdxevHns9C2UFx7XZ-MwcG8DQUEChNv7RfIr-Au9NoHXB1CkTBegc6gwZ6BjBVWrib4jdYGmBV6X1SNuftWfSkukjiJ1FjMfEfMp3RbOFzfiZ8wGfLGcxHfzWzeROMHKAh68-N5Oqavxuo" className="w-full h-full object-cover" alt="thumb2" />
            </div>
          </div>
        </div>

        {/* Right — Store cards (click to expand) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-on-surface uppercase tracking-widest text-xs">{t('availableAtStores')}</h3>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="right"
              textKey="productStoreAvailability"
              ariaLabel="Available stores help"
            />
          </div>

          {availableStores.length > 0 ? availableStores.map(store => {
            const availability = product.availability?.find(a => a.storeId === store.id);
            const isExpanded = expandedStoreId === store.id;
            return (
              <div
                key={store.id}
                className={`rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${
                  isExpanded ? 'border-primary bg-white shadow-ambient' : 'border-surface-container bg-surface-container-low hover:border-outline-variant'
                }`}
              >
                {/* Always-visible summary row */}
                <div className="w-full flex items-center gap-2 p-4">
                  <button
                    onClick={() => setExpandedStoreId(isExpanded ? null : store.id)}
                    className="flex-1 min-w-0 flex items-center gap-4 text-left"
                  >
                    <div className={`p-2.5 rounded-xl transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-white shadow-sm text-on-surface-variant'}`}>
                      <ICONS.Market className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block font-bold text-on-surface truncate">{store.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
                          <ICONS.Location className="w-3 h-3" />{(store as any).distanceLabel || store.distance || t('nearby')}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${(store.status || '').includes('Open') ? 'bg-green-500' : 'bg-red-400'}`} />
                        <span className="text-[10px] font-bold text-on-surface-variant">{(store.status || t('active')).split('•')[0].trim()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <HelperTooltip side="left" textKey="productStockStatus">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full cursor-help ${
                          availability?.stockLevel === 'In Stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {availability?.stockLevel}
                        </span>
                      </HelperTooltip>
                      <ICONS.ChevronRight className={`w-4 h-4 text-outline transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  <HelperTooltip side="left" textKey="storeDirections">
                    <button
                      onClick={() => onStoreClick(store.id)}
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <ICONS.Directions className="w-3.5 h-3.5" />
                      {t('mapShort')}
                    </button>
                  </HelperTooltip>
                </div>

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
                        <div className="pt-3 flex flex-wrap gap-1">
                          {(store.stock || []).map(item => (
                            <span key={item} className="px-2 py-0.5 rounded-lg bg-surface-container text-on-surface-variant text-[9px] font-black uppercase tracking-widest border border-surface-container-highest">
                              {item}
                            </span>
                          ))}
                          {(store.stock || []).length === 0 && (
                            <span className="text-xs text-on-surface-variant">{t('noStockInfo')}</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <HelperTooltip side="top" textKey="storeCallAction">
                            {(store as any).phone ? (
                              <a
                                href={`tel:${(store as any).phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full border border-outline-variant text-on-surface py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5"
                              >
                                <ICONS.Phone className="w-3.5 h-3.5" /> {t('callStoreShort')}
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="w-full border border-outline-variant text-on-surface-variant py-2.5 rounded-xl text-xs font-black uppercase tracking-widest opacity-60 cursor-not-allowed flex items-center justify-center gap-1.5"
                              >
                                <ICONS.Phone className="w-3.5 h-3.5" /> {t('callStoreShort')}
                              </button>
                            )}
                          </HelperTooltip>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }) : (
            <div className="p-4 rounded-2xl border-2 border-dashed border-surface-container text-center text-on-surface-variant text-sm">
              {t('onlyHomeDelivery')}
            </div>
          )}

          {/* Delivery option */}
          <HelperTooltip side="top" textKey="productDeliveryInfo">
            <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-surface-container hover:border-primary transition-all bg-surface-container-low group cursor-pointer">
              <div className="p-2.5 rounded-xl bg-white shadow-sm text-on-surface-variant group-hover:bg-primary group-hover:text-white transition-colors">
                <ICONS.Delivery className="w-5 h-5" />
              </div>
              <div>
                <span className="block font-bold text-on-surface">{t('deliverToFarm')}</span>
                <span className="text-[10px] uppercase font-black tracking-widest text-on-surface-variant">{t('arrivalTomorrow')}</span>
              </div>
            </div>
          </HelperTooltip>
        </div>
      </div>

      {/* Below — Product details */}
      <div className="bg-white rounded-3xl border border-surface-container shadow-sm p-6 md:p-8 flex flex-col gap-6">
        {/* Name + badges */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <HelperTooltip side="bottom" textKey="productQualityBadge">
              <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border border-secondary/20 cursor-help">
                {t('organicCertified')}
              </span>
            </HelperTooltip>
            <HelperTooltip side="bottom" textKey="productReviews">
              <div className="flex items-center gap-1 text-secondary cursor-help">
                <ICONS.Star className="w-4 h-4 fill-secondary" />
                <span className="text-sm font-black">4.8 (124 {t('reviewsLabel')})</span>
              </div>
            </HelperTooltip>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-on-surface tracking-tight leading-tight">{product.fullName || product.name}</h1>
          <p className="text-on-surface-variant leading-relaxed">
            {product.description} {t('productDescSuffix')}
          </p>
        </div>

        {/* Price + quantity + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 pt-4 border-t border-surface-container">
          <HelperTooltip side="top" textKey="marketPriceInfo">
            <div className="flex items-end gap-3 cursor-help">
              <span className="text-4xl font-extrabold text-secondary tracking-tight">₹{product.price}</span>
              {product.oldPrice && (
                <span className="text-xl text-on-surface-variant line-through mb-1">₹{product.oldPrice}</span>
              )}
              {product.oldPrice && (
                <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">{t('savePercent')}</span>
              )}
            </div>
          </HelperTooltip>

          <div className="flex items-center gap-4 sm:ml-auto">
            {product.isOnline ? (
              <button
                onClick={() => onAddToCart?.(product)}
                className="h-12 px-8 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
              >
                <ICONS.AddToCart className="w-5 h-5" /> {t('addToCart')}
              </button>
            ) : (
              <HelperTooltip side="top" textKey="productContact">
                <button className="h-12 px-8 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2">
                  <ICONS.Phone className="w-5 h-5" /> {t('contactForAvailability')}
                </button>
              </HelperTooltip>
            )}
          </div>
        </div>
      </div>

      {/* Product Insights */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <h2 className="text-2xl font-bold text-on-surface">{t('productInsightsTitle')}</h2>
          <HelperIcon
            size="sm"
            variant="ghost"
            side="right"
            textKey="productInsights"
            ariaLabel="Product insights help"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-surface-container flex flex-col gap-4">
            <div className="flex items-center gap-3 text-secondary">
              <ICONS.Science className="w-5 h-5" />
              <h3 className="font-bold uppercase tracking-widest text-xs">{t('composition')}</h3>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="productComposition"
                ariaLabel="Composition help"
              />
            </div>
            {[
              { label: t('nitrogenN'), val: '19%' },
              { label: t('phosphorusP'), val: '19%' },
              { label: t('potassiumK'), val: '19%' }
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-surface-container-low last:border-0">
                <span className="text-on-surface text-sm opacity-60 font-semibold">{row.label}</span>
                <span className="text-on-surface font-black">{row.val}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-surface-container flex flex-col gap-4">
            <div className="flex items-center gap-3 text-primary">
              <ICONS.Water className="w-5 h-5" />
              <h3 className="font-bold uppercase tracking-widest text-xs">{t('application')}</h3>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="productApplication"
                ariaLabel="Application help"
              />
            </div>
            <p className="text-on-surface-variant font-medium text-sm">{t('applicationDesc')}</p>
            <HelperTooltip side="top" textKey="productDosage">
              <div className="mt-auto bg-primary/5 rounded-2xl p-4 border border-primary/10 cursor-help">
                <span className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1">{t('recommendedDosage')}</span>
                <span className="text-2xl font-bold text-on-surface">{t('dosageValue')}</span>
              </div>
            </HelperTooltip>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-surface-container flex flex-col gap-4">
            <div className="flex items-center gap-3 text-secondary">
              <ICONS.Sprout className="w-5 h-5" />
              <h3 className="font-bold uppercase tracking-widest text-xs">{t('bestForCrops')}</h3>
              <HelperIcon
                size="xs"
                variant="ghost"
                side="right"
                textKey="productCropSupport"
                ariaLabel="Best for crops help"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[t('cropTomatoes'), t('cropWheat'), t('cropSugarcane'), t('cropGrapes')].map((crop, i) => (
                <span key={i} className="bg-surface-container px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant border border-surface-container-highest">
                  {crop}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Seller Portfolio */}
      {sellerProducts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-on-surface">{t('moreFrom')} {product.store}</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">{t('otherProductsBy')}</p>
            </div>
            {onViewSellerAll && (
              <button
                onClick={() => onViewSellerAll(product.store)}
                className="text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                {t('viewAll')} <ICONS.ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
            {sellerProducts.map(p => (
              <div
                key={p.id}
                onClick={() => onProductClick?.(p.id)}
                className="shrink-0 w-44 cursor-pointer rounded-2xl border border-surface-container bg-white shadow-sm hover:shadow-md hover:border-primary/30 transition-all hover:scale-[1.02] overflow-hidden"
              >
                <div className="aspect-square overflow-hidden bg-surface-container-low">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-3 flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">{p.category}</span>
                  <p className="font-bold text-on-surface text-sm truncate leading-tight">{p.name}</p>
                  <span className="text-secondary font-extrabold text-sm">₹{p.price}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
