"use client";

import { useEffect, useState } from 'react';
import { ICONS, CROPS, PRODUCTS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { MarketplaceProduct } from '../../types/product';
import { useI18n } from '../i18n/I18nContext';
import { HelperIcon, HelperTooltip } from '../../components/helpers';

interface HomeViewProps {
  products?: MarketplaceProduct[];
  onProductClick: (id: string) => void;
  onHubClick: (hubId?: string) => void;
  onCategoryClick?: (categoryId: string) => void;
}

type Slide = {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  ctaLabel: string;
  bgClass: string;
  bgImg?: string;
  imgUrl?: string;
  onCta: 'powerPlus' | 'hub' | 'retailer';
};

export default function HomeView({
  products = PRODUCTS,
  onProductClick,
  onHubClick,
  onCategoryClick,
}: HomeViewProps) {
  const { t } = useI18n();

  const powerPlusProducts = products
    .filter((p) => p.name === 'Power Plus' && p.manufacturerId === 'karanarjun-mfg')
    .sort((a, b) => a.price - b.price);

  const slides: Slide[] = [
    {
      id: 'rooted',
      eyebrow: 'Modern Produce, Rooted Locally',
      title: (
        <>
          Modern Produce,<br />Rooted Locally.
        </>
      ),
      subtitle:
        'Find the freshest harvest and agricultural supplies directly from local stores in your area.',
      ctaLabel: 'Explore Products',
      bgClass: 'from-emerald-950 via-emerald-900/85 to-emerald-700/10',
      bgImg: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1400&q=80',
      onCta: 'hub',
    },
    {
      id: 'genuine',
      eyebrow: 'Genuine inputs',
      title: (
        <>
          Genuine inputs,<br />grown for your soil.
        </>
      ),
      subtitle:
        'Fresh agri supplies from trusted local stores — no middlemen, no fakes.',
      ctaLabel: 'Explore products',
      bgClass: 'from-emerald-950 via-emerald-900/85 to-emerald-700/10',
      bgImg: 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1400&q=80',
      onCta: 'hub',
    },
    {
      id: 'manufacturer',
      eyebrow: 'Direct from Manufacturer',
      title: (
        <>
          KaranArjun<br />Power Plus™
        </>
      ),
      subtitle: 'Trusted by 75,800+ farmers. Stimulates root growth, improves fruit colour & weight.',
      ctaLabel: 'Shop Power Plus',
      bgClass: 'from-emerald-950 via-emerald-900/90 to-emerald-700/10',
      bgImg: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1400&q=80',
      imgUrl: '/product-images/Product_Images/Power Plus.png',
      onCta: 'powerPlus',
    },
    {
      id: 'retailer',
      eyebrow: 'Become a Retailer',
      title: (
        <>
          Run your shop,<br />reach more farmers.
        </>
      ),
      subtitle:
        'Join 50+ dealers stocking trusted agri products. Manage inventory, get listed nearby.',
      ctaLabel: 'Join the network',
      bgClass: 'from-amber-950 via-orange-900/90 to-amber-800/10',
      bgImg: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=80',
      onCta: 'retailer',
    },
  ];

  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(id);
  }, [slides.length]);

  const goToSlideCta = (s: Slide) => {
    if (s.onCta === 'powerPlus' && powerPlusProducts[0]) onProductClick(powerPlusProducts[0].id);
    else if (s.onCta === 'hub') onHubClick();
    else if (s.onCta === 'retailer') onHubClick();
  };

  // Quick-access category tiles. Map clicks to Market with that category preselected.
  const categoryTiles = [
    { id: 'pesticides', label: t('catPesticides'), imgUrl: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-emerald-50 to-emerald-100' },
    { id: 'fertilizers', label: t('catFertilizers'), imgUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-amber-50 to-orange-100' },
    { id: 'pesticides', label: t('catHerbicides'), imgUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-rose-50 to-pink-100' },
    { id: 'fertilizers', label: t('catBioStimulants'), imgUrl: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-teal-50 to-cyan-100' },
    { id: 'tools', label: t('catSprayers'), imgUrl: 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-sky-50 to-blue-100' },
    { id: 'seeds', label: t('catSeeds'), imgUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-yellow-50 to-amber-100' },
    { id: 'tools', label: t('catTools'), imgUrl: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-slate-50 to-gray-100' },
    { id: 'all', label: t('catViewAll'), imgUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-primary/10 to-primary/20' },
  ];

  return (
    <div className="flex flex-col gap-10 py-6 md:py-10">
      {/* Hero — rotating carousel */}
      <section data-tour="hero" className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl overflow-hidden shadow-ambient min-h-[340px] md:min-h-[400px]">
          <AnimatePresence mode="wait">
            {slides.map((s, i) =>
              i === slideIdx ? (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex items-center overflow-hidden"
                >
                  {s.bgImg && (
                    <img
                      src={s.bgImg}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <div className={`absolute inset-0 bg-gradient-to-r ${s.bgClass}`} />
                  <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
                  <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-black/10 blur-3xl" />
                  <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 w-full px-8 md:px-14 py-10">
                    <div className="flex-1 max-w-xl text-white">
                      <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] mb-4">
                        {s.title}
                      </h1>
                      <p className="text-white/85 text-base md:text-lg mb-7 max-w-md">
                        {s.subtitle}
                      </p>
                      <HelperTooltip side="bottom" textKey="homeHeroCta">
                        <button
                          onClick={() => goToSlideCta(s)}
                          className="bg-white text-on-surface font-bold px-6 py-2.5 rounded-xl hover:scale-105 transition-transform shadow-xl inline-flex items-center gap-2"
                        >
                          <ICONS.ArrowRight className="w-5 h-5" />
                          {s.ctaLabel}
                        </button>
                      </HelperTooltip>
                    </div>
                    {s.imgUrl && (
                      <div className="flex-shrink-0 w-48 md:w-64">
                        <img
                          src={s.imgUrl}
                          alt=""
                          className="w-full h-auto object-contain drop-shadow-2xl"
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : null
            )}
          </AnimatePresence>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === slideIdx ? 'w-8 bg-white' : 'w-1.5 bg-white/50'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Arrows */}
          <button
            onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/20 backdrop-blur-md text-white rounded-full items-center justify-center hover:bg-white/30 transition-colors"
            aria-label="Previous slide"
          >
            <ICONS.ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <button
            onClick={() => setSlideIdx((i) => (i + 1) % slides.length)}
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/20 backdrop-blur-md text-white rounded-full items-center justify-center hover:bg-white/30 transition-colors"
            aria-label="Next slide"
          >
            <ICONS.ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Shop by Category — 8 tiles */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-2xl md:text-3xl font-bold text-on-surface">{t('shopByCategory')}</h2>
          <HelperIcon
            size="sm"
            variant="ghost"
            side="right"
            textKey="homeCategories"
            ariaLabel="Shop by category help"
          />
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {categoryTiles.map((c, i) => (
            <motion.button
              key={`${c.id}-${i}`}
              whileHover={{ y: -3 }}
              onClick={() => onCategoryClick?.(c.id)}
              className={`group bg-gradient-to-br ${c.color} rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm hover:shadow-ambient border border-white transition-all`}
            >
              <div className="w-12 h-12 rounded-full overflow-hidden shadow-sm bg-white group-hover:scale-110 transition-transform">
                <img src={c.imgUrl} alt={c.label} className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] font-bold text-on-surface text-center leading-tight">
                {c.label}
              </span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Shop by Crop */}
      <section data-tour="shop-by-crop" className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-on-surface">{t('shopByCrop')}</h2>
          <HelperIcon
            size="sm"
            side="right"
            textKey="shopByCrop"
            ariaLabel="Shop by crop help"
          />
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {CROPS.map((crop) => (
            <motion.button
              key={crop.id}
              whileHover={{ y: -3 }}
              onClick={() => onHubClick(crop.id)}
              className="group bg-surface-container-low rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm hover:shadow-ambient hover:bg-surface-container transition-all border border-transparent hover:border-outline-variant"
            >
              <div className="w-14 h-14 rounded-full bg-white shadow-sm overflow-hidden border border-surface-container-highest group-hover:scale-110 transition-transform">
                <img src={crop.image} alt={crop.name} className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] font-bold text-on-surface text-center leading-tight">
                {crop.name}
              </span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Trending — denser grid, contained product shots */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 bg-white shadow-sm border-y border-surface-container">
        <div className="flex justify-between items-end mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl md:text-3xl font-bold text-on-surface">{t('trendingNearYou')}</h2>
            <HelperIcon
              size="sm"
              variant="ghost"
              side="right"
              textKey="homeTrending"
              ariaLabel="Trending near you help"
            />
          </div>
          <button className="text-primary font-bold flex items-center gap-2 hover:translate-x-1 transition-transform text-sm">
            {t('viewAll')} <ICONS.ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {products.length > 0 ? products.slice(0, 10).map((product) => (
            <motion.div
              key={product.id}
              whileHover={{ y: -4 }}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-surface-container flex flex-col group cursor-pointer"
              onClick={() => onProductClick(product.id)}
            >
              <div className="aspect-square relative overflow-hidden bg-surface-container-low">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-contain bg-white p-2 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
                  <HelperTooltip side="bottom" textKey="stockBadge">
                    <span className="bg-primary-container/90 text-on-primary-container backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help">
                      {product.stock}
                    </span>
                  </HelperTooltip>
                </div>
              </div>
              <div className="p-3 flex flex-col flex-1">
                <h3 className="text-sm font-bold text-on-surface line-clamp-2 mb-1 leading-tight">{product.name}</h3>
                <div className="mt-auto flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-secondary">₹{product.price}</span>
                  {product.oldPrice && product.oldPrice > product.price && (
                    <span className="text-[11px] text-outline line-through">₹{product.oldPrice}</span>
                  )}
                </div>
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <HelperTooltip side="top" textKey="marketAddToCart">
                    <button
                      onClick={(e) => { e.stopPropagation(); onProductClick(product.id); }}
                      className="w-full border-2 border-primary text-primary text-xs font-bold py-1.5 rounded-lg hover:bg-primary hover:text-white transition-colors"
                    >
                      {t('addToCart')}
                    </button>
                  </HelperTooltip>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="col-span-full py-10 text-center bg-surface-container-low rounded-3xl border border-dashed border-surface-container">
              <p className="text-on-surface-variant font-medium">{t('noTrending')}</p>
            </div>
          )}
        </div>
      </section>

      {/* KaranArjun Power Plus bestsellers */}
      {powerPlusProducts.length > 0 && (
        <section className="px-4 md:px-10 max-w-7xl mx-auto w-full">
          <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-primary/95 via-primary to-primary/90 p-8 md:p-12 relative">
            <div className="absolute -top-12 -right-12 w-80 h-80 rounded-full bg-secondary/20 blur-3xl" />
            <div className="absolute -bottom-20 -left-12 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-center">
              <div className="flex-1 text-white">
                <HelperTooltip side="bottom" textKey="homePowerPlus">
                  <span className="inline-block text-[11px] uppercase tracking-[0.2em] font-black bg-white/20 px-3 py-1 rounded-full mb-4 cursor-help">
                    {t('directFromMfg')}
                  </span>
                </HelperTooltip>
                <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-3">
                  KaranArjun<br />Power Plus™
                </h2>
                <p className="text-white/90 text-base mb-2 max-w-md">
                  {t('powerPlusDesc')}
                </p>
                <p className="text-white/80 text-sm font-semibold">
                  {t('trustedByFarmers')} <span className="text-white font-black">75,800+ {t('farmersSuffix')}</span>.
                </p>
              </div>
              <div className="flex-1 w-full">
                <div className="grid grid-cols-3 gap-3">
                  {powerPlusProducts.map((p) => {
                    const sizeLabel =
                      p.fullName?.replace('Power Plus', '').trim() || 'Pack';
                    return (
                      <motion.button
                        key={p.id}
                        whileHover={{ y: -6 }}
                        onClick={() => onProductClick(p.id)}
                        className="bg-white rounded-2xl p-3 shadow-xl text-left flex flex-col group"
                      >
                        <div className="aspect-square bg-surface-container-low rounded-xl overflow-hidden mb-2">
                          <img
                            src={p.image}
                            alt={p.fullName || p.name}
                            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                          />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          {sizeLabel}
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-bold text-secondary">
                            ₹{p.price.toLocaleString('en-IN')}
                          </span>
                          {p.oldPrice && p.oldPrice > p.price && (
                            <span className="text-[10px] text-outline line-through">
                              ₹{p.oldPrice}
                            </span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Service strip */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HelperTooltip side="top" textKey="homeServicePowerPlus">
            <button
              onClick={() => powerPlusProducts[0] && onProductClick(powerPlusProducts[0].id)}
              className="text-left rounded-3xl p-6 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white relative overflow-hidden group min-h-[170px] w-full"
            >
              <ICONS.Sprout className="absolute -bottom-4 -right-4 w-32 h-32 text-white/15 group-hover:scale-110 transition-transform" />
              <div className="relative z-10">
                <h3 className="text-xl font-black mb-1">{t('serviceOrderPowerPlusTitle')}</h3>
                <p className="text-white/85 text-sm mb-4 max-w-[200px]">
                  {t('serviceOrderPowerPlusDesc')}
                </p>
                <span className="inline-block bg-white text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full">
                  {t('serviceShopNow')}
                </span>
              </div>
            </button>
          </HelperTooltip>
          <HelperTooltip side="top" textKey="homeServiceRetailer">
            <button
              onClick={onHubClick}
              className="text-left rounded-3xl p-6 bg-gradient-to-br from-amber-500 to-orange-600 text-white relative overflow-hidden group min-h-[170px] w-full"
            >
              <ICONS.Market className="absolute -bottom-4 -right-4 w-32 h-32 text-white/15 group-hover:scale-110 transition-transform" />
              <div className="relative z-10">
                <h3 className="text-xl font-black mb-1">{t('serviceBecomeRetailerTitle')}</h3>
                <p className="text-white/85 text-sm mb-4 max-w-[220px]">
                  {t('serviceBecomeRetailerDesc')}
                </p>
                <span className="inline-block bg-white text-orange-700 text-xs font-bold px-3 py-1.5 rounded-full">
                  {t('serviceJoinNetwork')}
                </span>
              </div>
            </button>
          </HelperTooltip>
          <HelperTooltip side="top" textKey="homeServiceAdvisory">
            <button
              onClick={onHubClick}
              className="text-left rounded-3xl p-6 bg-gradient-to-br from-sky-500 to-indigo-600 text-white relative overflow-hidden group min-h-[170px] w-full"
            >
              <ICONS.Science className="absolute -bottom-4 -right-4 w-32 h-32 text-white/15 group-hover:scale-110 transition-transform" />
              <div className="relative z-10">
                <h3 className="text-xl font-black mb-1">{t('serviceAdvisoryTitle')}</h3>
                <p className="text-white/85 text-sm mb-4 max-w-[220px]">
                  {t('serviceAdvisoryDesc')}
                </p>
                <span className="inline-block bg-white text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full">
                  {t('serviceExploreHubs')}
                </span>
              </div>
            </button>
          </HelperTooltip>
        </div>
      </section>
    </div>
  );
}
