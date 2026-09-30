"use client";

import { useEffect, useRef, useState } from 'react';
import { ICONS, CROPS, PRODUCTS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { MarketplaceProduct } from '../../types/product';
import { Hub, Banner } from '../firebase';
import { useI18n } from '../i18n/I18nContext';
import { PlayCircle, Video, Eye } from 'lucide-react';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { Tag } from 'lucide-react';
import { BannerSlideVisual } from '../components/BannerSlide';

interface HomeViewProps {
  products?: MarketplaceProduct[];
  hubs?: Hub[];
  /**
   * Called the first time the "Shop by Crop" section scrolls into view, so the
   * parent can lazily read the /hubs collection only when it's actually needed.
   * Until then the section renders from the static CROPS fallback.
   */
  onHubsNeeded?: () => void;
  /**
   * Banners from Firestore (Admin > Banners). When omitted/empty, HomeView
   * falls back to its built-in default slides so the homepage never renders
   * empty before any banners are migrated in.
   */
  banners?: Banner[];
  /**
   * Latest reels for the home rail. Owned by the parent (page.tsx) and passed in
   * so they survive HomeView's remount on every Home⇄detail navigation — HomeView
   * used to fetch these itself on mount, which re-hit /api/reels on every return
   * to Home. Kept alongside banners/products, which are already parent-owned.
   */
  reels?: any[];
  reelsLoading?: boolean;
  onProductClick: (id: string) => void;
  onHubClick: (hubId?: string) => void;
  onCategoryClick?: (categoryId: string) => void;
  onMarketSearch?: (query: string) => void;
  onAddToCart?: (product: MarketplaceProduct) => void;
  onRegisterClick?: () => void;
  onNavigateRoute?: (route: string) => void;
}

type Slide = {
  id: string;
  eyebrow: string;
  /** Falsy (empty string/null) means no title — the shared BannerSlideVisual skips rendering the title block entirely. */
  title: React.ReactNode;
  subtitle: string;
  ctaLabel: string;
  ctaEnabled: boolean;
  bgClass: string;
  bgImg?: string;
  bgImgMobile?: string;
  imgUrl?: string;
  onCta: 'powerPlus' | 'market' | 'retailer' | 'link';
  link?: { type: 'internal' | 'external'; value: string };
};

/** Maps a Firestore Banner doc to the Slide shape the carousel renders. */
function bannerToSlide(b: Banner): Slide {
  return {
    id: b.id,
    eyebrow: b.title,
    title: b.title.trim() ? b.title.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    )) : null,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    ctaEnabled: b.ctaEnabled,
    // '' means "No Overlay" (see GRADIENT_PRESETS / ImageField in the admin
    // Banners page) — pre-existing docs always carry a real gradient value.
    bgClass: b.bgClass ?? '',
    bgImg: b.bgImg,
    bgImgMobile: b.bgImgMobile,
    imgUrl: b.imgUrl,
    onCta: 'link',
    link: b.ctaLink,
  };
}

// Direction-aware slide+fade for the hero carousel (see the AnimatePresence
// block below). `direction` (+1/-1, from goToSlide) picks which side the
// incoming slide starts from and the outgoing slide exits toward, so
// forward and backward navigation always animate toward the correct side —
// module-level (not per-render) since it has no dependency on props/state.
const heroSlideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? '-100%' : '100%', opacity: 0 }),
};

export default function HomeView({
  products = PRODUCTS,
  hubs = [],
  banners = [],
  reels = [],
  reelsLoading = false,
  onHubsNeeded,
  onProductClick,
  onHubClick,
  onCategoryClick,
  onMarketSearch,
  onAddToCart,
  onRegisterClick,
  onNavigateRoute,
}: HomeViewProps) {
  const { t } = useI18n();

  // Lazily trigger the parent's /hubs read the first time the "Shop by Crop"
  // section is about to enter the viewport. The section renders from the static
  // CROPS fallback until real hubs arrive, so nothing blocks on this. Fires once.
  const shopByCropRef = useRef<HTMLElement | null>(null);
  const hubsRequestedRef = useRef(false);
  useEffect(() => {
    if (hubsRequestedRef.current || !onHubsNeeded) return;
    const el = shopByCropRef.current;
    if (!el) return;
    // No IntersectionObserver (very old browser / SSR edge) → just request now.
    if (typeof IntersectionObserver === 'undefined') {
      hubsRequestedRef.current = true;
      onHubsNeeded();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !hubsRequestedRef.current) {
        hubsRequestedRef.current = true;
        onHubsNeeded();
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHubsNeeded]);

  // Prepare crop list for "Shop by Crop"
  // If hubs are provided, use them. Otherwise fallback to static CROPS constant.
  const displayCrops = hubs.length > 0
    ? hubs.map(h => ({ 
        id: h.id, 
        name: h.name, 
        image: h.iconImage || h.heroImage 
      }))
    : CROPS;

  const powerPlusProducts = products
    .filter((p) => p.name === 'Power Plus' && p.manufacturerId === 'karanarjun-mfg')
    .sort((a, b) => a.price - b.price);

  // Built-in default slides — used only as a fallback when Banner Management
  // (Admin > Banners) has no published+enabled banners yet, so the homepage
  // never renders an empty hero section.
  const defaultSlides: Slide[] = [
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
      ctaEnabled: true,
      bgClass: 'from-emerald-950 via-emerald-900/85 to-emerald-700/10',
      bgImg: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1400&q=80',
      onCta: 'market',
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
      ctaEnabled: true,
      bgClass: 'from-emerald-950 via-emerald-900/85 to-emerald-700/10',
      bgImg: 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1400&q=80',
      onCta: 'market',
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
      ctaEnabled: true,
      bgClass: 'from-emerald-950 via-emerald-900/90 to-emerald-700/10',
      bgImg: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1400&q=80',
      imgUrl: '/product-images/Product_Images/Power Plus.png',
      onCta: 'powerPlus',
    },
    {
      id: 'retailer',
      eyebrow: 'Register Your Business',
      title: (
        <>
          Run your shop,<br />reach more farmers.
        </>
      ),
      subtitle:
        'Join 50+ dealers stocking trusted agri products. Manage inventory, get listed nearby.',
      ctaLabel: 'Join the network',
      ctaEnabled: true,
      bgClass: 'from-amber-950 via-orange-900/90 to-amber-800/10',
      bgImg: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1400&q=80',
      onCta: 'retailer',
    },
  ];

  // Dynamic banners (Firestore) take over once any exist; otherwise the
  // built-in default slides keep the homepage looking exactly as before.
  const publishedBanners = banners
    .filter(b => b.enabled && b.status === 'published')
    .sort((a, b) => a.order - b.order);
  const slides: Slide[] = publishedBanners.length > 0
    ? publishedBanners.map(bannerToSlide)
    : defaultSlides;

  // [index, direction] travel together so every navigation path (autoplay,
  // arrows, dots) can drive the same direction-aware slide animation below —
  // direction is +1 (advancing, slides in from the right) or -1 (going back,
  // slides in from the left). Framer Motion's `custom` prop reads it to pick
  // which side each slide's enter/exit variant animates from.
  const [[slideIdx, direction], setSlide] = useState<[number, number]>([0, 1]);
  const goToSlide = (next: number, dir: number) => setSlide([(next + slides.length) % slides.length, dir]);

  useEffect(() => {
    // Clamp immediately if the slide count shrinks/changes (e.g. banners
    // finish loading after the default slides were shown first).
    setSlide(([i, d]) => [i >= slides.length ? 0 : i, d]);
    const id = setInterval(() => setSlide(([i]) => [(i + 1) % slides.length, 1]), 6000);
    return () => clearInterval(id);
  }, [slides.length]);


  const goToSlideCta = (s: Slide) => {
    if (s.onCta === 'powerPlus') {
      if (powerPlusProducts[0]) onProductClick(powerPlusProducts[0].id);
      else onMarketSearch?.('Power Plus');
    } else if (s.onCta === 'market') {
      onCategoryClick?.('all');
    } else if (s.onCta === 'retailer') {
      onRegisterClick?.();
    } else if (s.onCta === 'link' && s.link) {
      if (s.link.type === 'external') {
        window.open(s.link.value, '_blank', 'noopener,noreferrer');
      } else if (onNavigateRoute) {
        onNavigateRoute(s.link.value);
      } else {
        window.location.href = s.link.value;
      }
    }
  };

  // Quick-access category tiles — IDs match Firestore product.category values (case-insensitive).
  const categoryTiles = [
    { id: 'Pesticides',    label: t('catPesticides'),    imgUrl: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-emerald-50 to-emerald-100' },
    { id: 'Fertilizers',  label: t('catFertilizers'),  imgUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-amber-50 to-orange-100' },
    { id: 'Herbicides',   label: t('catHerbicides'),   imgUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-rose-50 to-pink-100' },
    { id: 'Bio Pesticides', label: t('catBioStimulants'), imgUrl: 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-teal-50 to-cyan-100' },
    { id: 'Sprayers',     label: t('catSprayers'),     imgUrl: 'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-sky-50 to-blue-100' },
    { id: 'Seeds',        label: t('catSeeds'),        imgUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-yellow-50 to-amber-100' },
    { id: 'Tools',        label: t('catTools'),        imgUrl: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-slate-50 to-gray-100' },
    { id: 'all',          label: t('catViewAll'),      imgUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=120&h=120&q=80', color: 'from-primary/10 to-primary/20' },
  ];

  return (
    <div className="flex flex-col gap-10 py-6 md:py-10">
      {/* Hero — rotating carousel */}
      <section data-tour="hero" className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl overflow-hidden shadow-ambient min-h-[340px] md:min-h-[400px]">
          {/*
            mode="popLayout" (not "wait") lets the outgoing and incoming
            slides animate CONCURRENTLY instead of the old "wait" mode, which
            fully finished the exit fade before the enter animation even
            started — that gap was the abrupt disappear-then-appear cut.
            `custom={direction}` feeds slideVariants below so every nav path
            (autoplay, arrows, dots — all now going through goToSlide) drives
            the same direction-aware slide+fade, matching the +1/-1 they pass.
          */}
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            {slides.map((s, i) =>
              i === slideIdx ? (
                <motion.div
                  key={s.id}
                  custom={direction}
                  variants={heroSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 flex items-center overflow-hidden"
                >
                  <BannerSlideVisual slide={s} onCtaClick={() => goToSlideCta(s)} />
                </motion.div>
              ) : null
            )}
          </AnimatePresence>

          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i, i > slideIdx ? 1 : -1)}
                className={`h-1.5 rounded-full transition-all ${
                  i === slideIdx ? 'w-8 bg-white' : 'w-1.5 bg-white/50'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Arrows */}
          <button
            onClick={() => goToSlide(slideIdx - 1, -1)}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/20 backdrop-blur-md text-white rounded-full items-center justify-center hover:bg-white/30 transition-colors"
            aria-label="Previous slide"
          >
            <ICONS.ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <button
            onClick={() => goToSlide(slideIdx + 1, 1)}
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
      <section ref={shopByCropRef} data-tour="shop-by-crop" className="px-4 md:px-10 max-w-7xl mx-auto w-full">
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
          {displayCrops.map((crop) => (
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

      {/* Latest Reels */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 border-t border-surface-container mt-6">
        <div className="flex justify-between items-end mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl md:text-3xl font-bold text-on-surface">Latest Reels</h2>
          </div>
          <a
            href="/reels"
            className="text-primary font-bold flex items-center gap-2 hover:translate-x-1 transition-transform text-sm"
          >
            See all <ICONS.ArrowRight className="w-4 h-4" />
          </a>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
          {reelsLoading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="snap-start shrink-0 w-36 h-56 bg-surface-variant animate-pulse rounded-2xl border border-outline-variant" />
            ))
          ) : reels.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4">No reels yet. Check back soon!</p>
          ) : (
            reels.map((reel) => (
              <a
                key={reel.id}
                href={reel.slug ? `/reels/${reel.slug}` : `/reels?reelId=${reel.id}`}
                className="snap-start shrink-0 w-36 relative bg-surface-container rounded-2xl overflow-hidden shadow hover:shadow-md transition-shadow group border border-outline-variant"
                title={reel.caption}
              >
                {reel.thumbnailUrl ? (
                  <img src={reel.thumbnailUrl} alt="" className="w-full h-56 object-cover" />
                ) : (
                  <div className="w-full h-56 bg-surface-variant flex items-center justify-center">
                    <Video className="w-8 h-8 text-on-surface-variant/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3 opacity-90 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white font-semibold line-clamp-2 leading-tight drop-shadow-md">
                    {reel.caption || reel.title || 'Reel'}
                  </p>
                  <p className="text-[10px] text-white/80 mt-1 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {reel.viewsCount || 0}
                  </p>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg group-hover:scale-110 transition-transform">
                   <PlayCircle className="w-10 h-10 text-white/90" />
                </div>
              </a>
            ))
          )}
        </div>
      </section>

      {/* Trending — denser grid, contained product shots */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 bg-white shadow-sm border-y border-surface-container mt-6">
        <div className="flex justify-between items-end mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl md:text-3xl font-bold text-on-surface">{t('topPicks')}</h2>
            <HelperIcon
              size="sm"
              variant="ghost"
              side="right"
              textKey="homeTrending"
              ariaLabel="Trending near you help"
            />
          </div>
          <button
            onClick={() => onCategoryClick?.('all')}
            className="text-primary font-bold flex items-center gap-2 hover:translate-x-1 transition-transform text-sm"
          >
            {t('viewAll')} <ICONS.ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {products.length > 0 ? products.slice(0, 10).map((product) => {
            // "X% OFF" only appears for a GENUINE seller-configured discount —
            // lowestFinalPrice (each seller's price after their own discountPct)
            // being below lowestPrice (their plain price). We used to also treat
            // "cheapest seller's price is below the catalog's reference price" as
            // an offer, but that's just ordinary price variance between
            // independent sellers (nobody ran a promotion) — it produced a fake
            // "8% OFF" ribbon on products no seller had actually discounted.
            const sellerBasePrice = product.lowestPrice ?? product.price;
            const discountedPrice = product.lowestFinalPrice ?? sellerBasePrice;
            const hasOffer = discountedPrice < sellerBasePrice;
            const ribbonOriginal = sellerBasePrice;
            const ribbonFinal = discountedPrice;
            const maxPct = hasOffer && ribbonOriginal > 0
              ? Math.round((1 - ribbonFinal / ribbonOriginal) * 100)
              : 0;
            const savings = Math.round(ribbonOriginal - ribbonFinal);
            return (
            <motion.div
              key={product.id}
              whileHover={{ y: -4 }}
              className={`bg-white rounded-2xl overflow-hidden shadow-sm flex flex-col group cursor-pointer border ${
                hasOffer ? 'border-green-400 shadow-green-100' : 'border-surface-container'
              }`}
              onClick={() => onProductClick(product.id)}
            >
              <div className="aspect-square relative overflow-hidden bg-surface-container-low">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-contain bg-white p-2 group-hover:scale-105 transition-transform duration-500"
                />
                {/* Corner offer ribbon */}
                {hasOffer && maxPct > 0 && (
                  <div className="absolute top-0 left-0 w-20 h-20 overflow-hidden pointer-events-none">
                    <div
                      className="absolute bg-green-500 shadow text-white text-center"
                      style={{ width: 110, top: 17, left: -28, transform: 'rotate(-45deg)', padding: '4px 0' }}
                    >
                      <span className="flex items-center justify-center gap-0.5 text-[9px] font-black tracking-wide">
                        <Tag className="h-2 w-2 shrink-0" />{maxPct}% OFF
                      </span>
                    </div>
                  </div>
                )}
                {(product.averageRating ?? 0) > 0 && (
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                    <span className="text-amber-400">★</span>
                    {product.averageRating!.toFixed(1)}
                    {product.totalReviews ? <span className="text-white/70">({product.totalReviews})</span> : null}
                  </span>
                )}
              </div>
              <div className={`p-3 flex flex-col flex-1 ${hasOffer ? 'bg-gradient-to-b from-green-50/30 to-white' : ''}`}>
                <h3 className="text-sm font-bold text-on-surface line-clamp-2 mb-1 leading-tight">{product.name}</h3>
                {hasOffer ? (
                  <div className="mt-auto">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-black text-green-700">₹{ribbonFinal.toLocaleString('en-IN')}</span>
                      <span className="text-[11px] text-outline line-through">₹{ribbonOriginal.toLocaleString('en-IN')}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 mt-1 rounded-md bg-green-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                      <Tag className="h-2 w-2 shrink-0" />Save ₹{savings}
                    </span>
                  </div>
                ) : (
                  <div className="mt-auto flex items-baseline gap-1.5">
                    <span className="text-base font-bold text-secondary">₹{sellerBasePrice.toLocaleString('en-IN')}</span>
                    {product.oldPrice && product.oldPrice > sellerBasePrice && (
                      <span className="text-[11px] text-outline line-through">₹{product.oldPrice}</span>
                    )}
                  </div>
                )}
                {product.sellMode !== "offline_store_only" && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <HelperTooltip side="top" textKey="marketAddToCart">
                      <button
                        onClick={(e) => { e.stopPropagation(); onAddToCart ? onAddToCart(product) : onProductClick(product.id); }}
                        className={`w-full border-2 text-xs font-bold py-1.5 rounded-lg transition-colors ${
                          hasOffer
                            ? 'border-green-600 text-green-700 hover:bg-green-600 hover:text-white'
                            : 'border-primary text-primary hover:bg-primary hover:text-white'
                        }`}
                      >
                        {t('addToCart')}
                      </button>
                    </HelperTooltip>
                  </div>
                )}
              </div>
            </motion.div>
            );
          }) : (
            <div className="col-span-full py-10 text-center bg-surface-container-low rounded-3xl border border-dashed border-surface-container">
              <p className="text-on-surface-variant font-medium">{t('noTopPicks')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Service strip */}
      <section className="px-4 md:px-10 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
              onClick={() => onRegisterClick?.()}
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
          <button
              onClick={() => onHubClick()}
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
        </div>
      </section>
    </div>
  );
}
