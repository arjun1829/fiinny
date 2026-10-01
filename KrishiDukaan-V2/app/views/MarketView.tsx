"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarketplaceProduct } from "../../types/product";
import { ICONS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { trackProductImpression } from '../firebase';
import { useI18n } from '../i18n/I18nContext';
import type { CartItem } from '../../types/order';
import { Tag } from 'lucide-react';

interface MarketViewProps {
  /**
   * Active search text. Both browse and search are served by the same
   * cursor-paginated /api/marketplace/products route — a non-empty query is just
   * forwarded as `?search=` so results paginate identically. MarketView never
   * holds the full product catalogue in memory (see the infinite-scroll feed).
   */
  searchQuery?: string;
  onProductClick: (id: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onAddToCart?: (product: MarketplaceProduct) => void;
  onBuyNow?: (product: MarketplaceProduct) => void;
  cartItems?: CartItem[];
  onGoToCart?: () => void;
}

type SortKey = 'default' | 'price-asc' | 'price-desc' | 'name-asc';

// ─── Cross-mount feed cache ───────────────────────────────────────────────────
// MarketView is unmounted whenever the app switches views (page.tsx renders a
// single view keyed by currentView inside <AnimatePresence mode="wait">), so
// navigating Market → Product Detail → Market destroys and recreates the
// component, losing all its in-component feed state and refetching page 1.
//
// This module-scoped cache preserves the loaded feed (products, cursor, hasMore,
// the search/category it belongs to, scroll position and already-tracked
// impression ids) for the lifetime of the JS module. Returning to Market with a
// matching search/category restores it verbatim — no refetch, no reorder, no
// reset. A real browser refresh reloads the module, so the cache is empty again
// and a fresh page is fetched. Changing search/category invalidates the match
// and triggers a normal reset + fetch.
type MarketFeedCache = {
  feed: MarketplaceProduct[];
  cursor: string | null;
  hasMore: boolean;
  search: string;
  category: string;
  scrollY: number;
  trackedIds: string[];
};
let marketFeedCache: MarketFeedCache | null = null;

// ─── Category scroll strip with mobile scroll arrows ──────────────────────────

function CategoryStrip({
  categories,
  selectedCategory,
  onCategoryChange,
}: {
  categories: { id: string; name: string; icon: React.ComponentType<{ className?: string }> | null }[];
  selectedCategory: string;
  onCategoryChange: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
  }, [categories]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  return (
    <div className="relative flex-1 md:flex-initial min-w-0 flex items-center">
      {/* Left fade + arrow — mobile only */}
      {canScrollLeft && (
        <div className="md:hidden absolute left-0 top-0 bottom-0 z-10 flex items-center pointer-events-none">
          <div className="w-10 h-full bg-gradient-to-r from-white to-transparent" />
          <button
            type="button"
            aria-label="Scroll categories left"
            onClick={() => scroll('left')}
            className="pointer-events-auto absolute left-0 flex items-center justify-center w-7 h-7 rounded-full bg-white shadow-md border border-outline-variant/30 text-on-surface"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 md:mx-0 md:px-0"
      >
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

      {/* Right fade + arrow — mobile only */}
      {canScrollRight && (
        <div className="md:hidden absolute right-0 top-0 bottom-0 z-10 flex items-center justify-end pointer-events-none">
          <div className="w-10 h-full bg-gradient-to-l from-white to-transparent" />
          <button
            type="button"
            aria-label="Scroll categories right"
            onClick={() => scroll('right')}
            className="pointer-events-auto absolute right-0 flex items-center justify-center w-7 h-7 rounded-full bg-white shadow-md border border-outline-variant/30 text-on-surface"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function inferBrand(name: string): string {
  // First word of product name is a reasonable brand proxy for this catalog.
  return name.trim().split(/\s+/)[0] || 'Other';
}

export default function MarketView({
  searchQuery = '',
  onProductClick,
  selectedCategory,
  onCategoryChange,
  onAddToCart,
  onBuyNow,
  cartItems = [],
  onGoToCart,
}: MarketViewProps) {
  const { t } = useI18n();
  const trackedIds = useRef<Set<string>>(new Set());

  // ─── Infinite-scroll feed (server cursor pagination) ────────────────────────
  // Both browse and search are served by /api/marketplace/products. A search term
  // is forwarded as `?search=` and the server scans + filters + paginates it the
  // same way as browse, so results arrive in cursor pages too — MarketView never
  // loads the full product catalogue to search client-side.
  // Debounce the search term so Market issues ONE request after typing settles,
  // not one per keystroke. The navbar updates the shared search state on every
  // keystroke; without this, each letter kicked off a fresh server scan and their
  // out-of-order responses raced into the feed (the repeated-results bug).
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery.trim());
  useEffect(() => {
    const q = searchQuery.trim();
    if (q === debouncedSearch) return;
    const id = setTimeout(() => setDebouncedSearch(q), 300);
    return () => clearTimeout(id);
  }, [searchQuery, debouncedSearch]);

  const searchParam = debouncedSearch;
  const categoryParam =
    selectedCategory && selectedCategory !== 'all' ? selectedCategory : '';
  // True on the FIRST render of a mount when a preserved feed exists for exactly
  // this search + category (i.e. we're returning from Product Detail). Drives the
  // lazy state/ref initializers and the mount effect so the feed is restored
  // rather than refetched. Snapshotted once here so those all agree.
  const restoringFromCache =
    marketFeedCache !== null &&
    marketFeedCache.search === searchParam &&
    marketFeedCache.category === categoryParam;
  // Bumped on every reset (search/category change). Each in-flight request captures
  // the current value; a response whose generation no longer matches is discarded,
  // so a stale query's results can never land in — or re-trigger pagination on —
  // the current feed.
  const requestGenRef = useRef(0);

  const [feed, setFeed] = useState<MarketplaceProduct[]>(
    () => (restoringFromCache ? marketFeedCache!.feed : []),
  );
  const [feedHasMore, setFeedHasMore] = useState(
    () => (restoringFromCache ? marketFeedCache!.hasMore : true),
  );
  const [feedLoading, setFeedLoading] = useState(false);
  // Refs are the authoritative pagination state for the fetch logic, so
  // loadFeedPage can stay stable (deps: search + category only) without
  // reading stale cursor/hasMore from a closure.
  const feedCursorRef = useRef<string | null>(
    restoringFromCache ? marketFeedCache!.cursor : null,
  );
  const feedHasMoreRef = useRef(restoringFromCache ? marketFeedCache!.hasMore : true);
  // Guards duplicate in-flight requests (rapid scroll / re-renders) and ensures
  // the same cursor is never fetched twice.
  const inFlightRef = useRef(false);
  const requestedCursorsRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Whether the end sentinel is currently on screen — lets us keep loading when a
  // short page fails to grow the list enough to push the sentinel back out of
  // view (IntersectionObserver only fires on a change, not while it stays visible).
  const sentinelVisibleRef = useRef(false);
  // TEMP diagnostics — remove after verification.
  const pagesRequestedRef = useRef(0);
  const cardsLoadedRef = useRef(0);

  const loadFeedPage = useCallback(async (reset: boolean) => {
    // TEMP diagnostics — remove after verification.
    if (inFlightRef.current) {
      console.debug('[market] loadFeedPage BLOCKED', { reset, why: 'inFlight' });
      return;
    }
    if (!reset && !feedHasMoreRef.current) {
      console.debug('[market] loadFeedPage BLOCKED', { reset, why: 'noMore' });
      return;
    }

    const cursor = reset ? null : feedCursorRef.current;
    const cursorKey = `${searchParam}|${categoryParam}|${cursor ?? 'INITIAL'}`;
    if (requestedCursorsRef.current.has(cursorKey)) {
      console.debug('[market] loadFeedPage BLOCKED', { reset, why: 'cursorAlreadyRequested', cursorKey });
      return;
    }
    console.debug('[market] loadFeedPage PROCEED', { reset, cursor, cursorKey });
    requestedCursorsRef.current.add(cursorKey);

    const gen = requestGenRef.current;
    inFlightRef.current = true;
    setFeedLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '20' });
      if (searchParam) params.set('search', searchParam);
      if (categoryParam) params.set('category', categoryParam);
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/marketplace/products?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        products: MarketplaceProduct[];
        nextCursor: string | null;
        hasMore: boolean;
      };

      // A newer search/category reset happened while this was in flight — discard
      // so stale results never merge into the current feed.
      if (gen !== requestGenRef.current) {
        console.debug('[market] discarding stale response', { reset, gen, current: requestGenRef.current });
        return;
      }

      pagesRequestedRef.current += 1;
      cardsLoadedRef.current = (reset ? 0 : cardsLoadedRef.current) + json.products.length;

      // TEMP dev log — remove after verification.
      console.debug('[market] page', {
        trigger: reset ? 'initial' : 'paginate',
        requestedLimit: 20,
        cursorIn: cursor ?? null,
        returned: json.products.length,
        hasMore: json.hasMore,
        totalPagesRequested: pagesRequestedRef.current,
        totalCardsLoaded: cardsLoadedRef.current,
      });

      setFeed((prev) => {
        if (reset) {
          console.debug('[market] initial page -> replace', {
            feedBefore: prev.length, feedAfter: json.products.length, added: json.products.length, cursor: json.nextCursor,
          });
          return json.products;
        }
        // Append-only, but dedup by canonical id so an overlapping cursor or a
        // product whose name-group straddles a boundary can never render twice.
        const seen = new Set(prev.map((p) => p.id));
        const additions = json.products.filter((p) => !seen.has(p.id));
        const next = [...prev, ...additions];
        // TEMP diagnostics — remove after verification.
        console.debug('[market] pagination page -> append', {
          feedBefore: prev.length, feedAfter: next.length,
          added: additions.length, dropped: json.products.length - additions.length,
          cursor: json.nextCursor,
        });
        return next;
      });
      feedCursorRef.current = json.nextCursor;
      feedHasMoreRef.current = json.hasMore;
      setFeedHasMore(json.hasMore);
    } catch (err) {
      console.warn('[market] product page load failed:', err);
      // Allow this cursor to be retried after a transient failure.
      requestedCursorsRef.current.delete(cursorKey);
      feedHasMoreRef.current = false;
      setFeedHasMore(false);
    } finally {
      // Stale responses (a newer reset owns the feed now) must not clear the
      // in-flight guard or re-trigger pagination on the current generation.
      if (gen !== requestGenRef.current) return;
      inFlightRef.current = false;
      setFeedLoading(false);
      // A short page can leave the sentinel still on screen; the change-only
      // IntersectionObserver won't re-fire in that case. So after the new cards
      // paint, measure the sentinel's REAL position (rAF runs post-layout) and
      // load the next page only if it's genuinely within range. This is bounded:
      // it stops the moment the sentinel leaves the 400px band and defers to the
      // observer for further scrolling — it never prefetches the whole catalogue.
      if (feedHasMoreRef.current) {
        requestAnimationFrame(() => {
          const el = sentinelRef.current;
          if (!el) return;
          const inRange = el.getBoundingClientRect().top <= window.innerHeight + 400;
          // TEMP diagnostics — remove after verification.
          console.debug('[market] finally re-trigger check', {
            sentinelTop: Math.round(el.getBoundingClientRect().top),
            threshold: window.innerHeight + 400,
            hasMore: feedHasMoreRef.current,
            willSchedule: inRange && feedHasMoreRef.current,
          });
          if (inRange && feedHasMoreRef.current) void loadFeedPage(false);
        });
      }
    }
  }, [searchParam, categoryParam]);

  // Restore-or-reset the feed for the current search/category.
  //
  // This is intentionally IDEMPOTENT rather than "run once per mount": React
  // StrictMode double-invokes effects in dev, and this component is fully
  // unmounted/remounted on every view switch (page.tsx keys the view by
  // currentView). The decision is driven purely by whether the module cache
  // already owns THIS search+category:
  //   • cache matches  → reuse the preserved feed, never fetch (the return path,
  //                       AND the StrictMode second pass).
  //   • cache missing/stale → claim the context synchronously (so a second pass
  //                       sees a match and won't refetch) then fetch page 1.
  useEffect(() => {
    const cacheMatches =
      marketFeedCache !== null &&
      marketFeedCache.search === searchParam &&
      marketFeedCache.category === categoryParam;

    if (cacheMatches) {
      // Returning from Product Detail (feed already seeded from cache by the
      // state/ref initializers), or a StrictMode re-invoke. Sync refs, restore
      // the impression set + scroll position, and skip the fetch entirely.
      feedCursorRef.current = marketFeedCache!.cursor;
      feedHasMoreRef.current = marketFeedCache!.hasMore;
      trackedIds.current = new Set(marketFeedCache!.trackedIds);
      const y = marketFeedCache!.scrollY;
      // navigate() scrolls to top on the way back in; restore after that + after
      // the restored cards have painted.
      requestAnimationFrame(() =>
        window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }),
      );
      return;
    }

    // Genuine reset (cold load, hard refresh, or search/category change). Claim
    // the context in the module cache NOW, synchronously, so StrictMode's second
    // effect pass (and any rapid remount) sees a match above and does not fire a
    // duplicate page-1 request.
    marketFeedCache = {
      feed: [],
      cursor: null,
      hasMore: true,
      search: searchParam,
      category: categoryParam,
      scrollY: 0,
      trackedIds: [],
    };
    requestGenRef.current += 1;
    requestedCursorsRef.current.clear();
    feedCursorRef.current = null;
    feedHasMoreRef.current = true;
    inFlightRef.current = false;
    pagesRequestedRef.current = 0;
    cardsLoadedRef.current = 0;
    setFeed([]);
    setFeedHasMore(true);
    void loadFeedPage(true);
  }, [searchParam, categoryParam, loadFeedPage]);

  // Persist the live feed into the module cache so a remount (return from Product
  // Detail) can restore it without refetching. Refresh clears this via module reload.
  useEffect(() => {
    marketFeedCache = {
      feed,
      cursor: feedCursorRef.current,
      hasMore: feedHasMoreRef.current,
      search: searchParam,
      category: categoryParam,
      scrollY: marketFeedCache?.scrollY ?? 0,
      trackedIds: Array.from(trackedIds.current),
    };
  }, [feed, searchParam, categoryParam]);

  // Fetch the next page only when the sentinel near the list end scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    // TEMP diagnostics — remove after verification.
    console.debug('[market] observer effect run', { hasEl: !!el });
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        sentinelVisibleRef.current = visible;
        // TEMP diagnostics — remove after verification.
        console.debug('[market] observer callback', {
          isIntersecting: visible,
          hasMore: feedHasMoreRef.current,
          isLoading: inFlightRef.current,
          cursor: feedCursorRef.current,
          willCall: visible,
        });
        if (visible) void loadFeedPage(false);
      },
      { rootMargin: '400px' },
    );
    console.debug('[market] observer created + observing sentinel');
    obs.observe(el);
    return () => {
      console.debug('[market] observer disconnected');
      obs.disconnect();
    };
  }, [loadFeedPage]);

  // The grid is always the paginated feed — browse and search alike.
  const sourceProducts = feed;

  useEffect(() => {
    // Track impressions for products currently in view
    sourceProducts.forEach((p, index) => {
      if (!trackedIds.current.has(p.id)) {
        trackProductImpression(p.id, index + 1);
        trackedIds.current.add(p.id);
      }
    });
  }, [sourceProducts]);

  const categories = [
    { id: 'all',           name: t('allProducts'),      icon: null },
    { id: 'Seeds',         name: t('catSeeds'),         icon: ICONS.Sprout },
    { id: 'Fertilizers',  name: t('catFertilizers'),  icon: ICONS.Science },
    { id: 'Pesticides',   name: t('catPesticides'),   icon: ICONS.Science },
    { id: 'Herbicides',   name: t('catHerbicides'),   icon: ICONS.Science },
    { id: 'Bio Pesticides', name: t('catBioStimulants'), icon: ICONS.Science },
    { id: 'Sprayers',     name: t('catSprayers'),     icon: ICONS.Market },
    { id: 'Tools',        name: t('catTools'),        icon: ICONS.Market },
  ];

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('default');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  // Price ceiling is data-driven so the slider always spans the full catalogue and
  // no product is silently hidden. A user only narrows the range; until they do,
  // priceMax sits at the ceiling and the filter is a no-op (see visibleProducts).
  // Rounded up to the next ₹100 and floored at ₹3000 so the control still has a
  // sensible range when the catalogue is small/cheap.
  const priceCeiling = useMemo(() => {
    const maxPrice = sourceProducts.reduce((m, p) => Math.max(m, (p.lowestPrice ?? p.price) || 0), 0);
    return Math.max(3000, Math.ceil(maxPrice / 100) * 100);
  }, [sourceProducts]);
  const [priceMax, setPriceMax] = useState<number>(priceCeiling);

  // Keep priceMax pinned to the ceiling while the user hasn't narrowed it, so a
  // newly-loaded higher-priced product expands the range instead of being hidden.
  const userSetPriceRef = useRef(false);
  useEffect(() => {
    if (!userSetPriceRef.current) setPriceMax(priceCeiling);
  }, [priceCeiling]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of sourceProducts) set.add(inferBrand(p.name));
    return ['all', ...Array.from(set).sort()];
  }, [sourceProducts]);

  const visibleProducts = useMemo(() => {
    let list = sourceProducts.slice();

    if (brandFilter !== 'all') {
      list = list.filter((p) => inferBrand(p.name) === brandFilter);
    }
    // Only apply the price cap when the user has actually narrowed it below the
    // catalogue ceiling. At the ceiling it's a no-op, so high-priced products are
    // never hidden by default.
    if (priceMax < priceCeiling) {
      list = list.filter((p) => (p.lowestPrice ?? p.price) <= priceMax);
    }
    switch (sortBy) {
      case 'price-asc':
        list.sort((a, b) => (a.lowestPrice ?? a.price) - (b.lowestPrice ?? b.price));
        break;
      case 'price-desc':
        list.sort((a, b) => (b.lowestPrice ?? b.price) - (a.lowestPrice ?? a.price));
        break;
      case 'name-asc':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // Append-only browse: preserve the server's pagination order (name-group
        // order from /api/marketplace/products) so accumulated pages never
        // reorder when a new page arrives. Explicit sorts above are opt-in.
        break;
    }
    return list;
  }, [sourceProducts, brandFilter, priceMax, priceCeiling, sortBy]);

  const activeFilterCount =
    (brandFilter !== 'all' ? 1 : 0) +
    (priceMax < priceCeiling ? 1 : 0) +
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
          {/* Category scroll strip with arrow indicators on mobile */}
          <CategoryStrip
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={onCategoryChange}
          />
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
              onClick={() => setFilterOpen((v) => !v)}
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
                      max={priceCeiling}
                      step={50}
                      value={priceMax}
                      onChange={(e) => {
                        userSetPriceRef.current = true;
                        setPriceMax(Number(e.target.value));
                      }}
                      className="w-full mt-1 accent-primary"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setBrandFilter('all');
                      userSetPriceRef.current = false;
                      setPriceMax(priceCeiling);
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

        </div>
      </div>

      <p className="text-sm text-outline mb-4 font-medium">
        {t('showing')} <span className="text-on-surface font-bold">{visibleProducts.length}</span> {t('productsLabel')}
        {brandFilter !== 'all' ? ` ${t('fromBrand')} ${brandFilter}` : ''}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {visibleProducts.length > 0 ? (
          visibleProducts.map((product, idx) => {
            // lowestFinalPrice = min(sellingPrice × (1 − discountPct/100)) across all sellers.
            // lowestPrice      = min(sellingPrice) before discounts.
            // "X% OFF" only appears for a GENUINE seller-configured discount — a seller's
            // lowestFinalPrice below their own lowestPrice. We used to also flag "cheapest
            // seller's price is below the catalog's reference price" as an offer, but that's
            // just ordinary price variance between independent sellers (nobody ran a
            // promotion) — it produced a fake "X% OFF" ribbon on products no seller had
            // actually discounted, and mixed lowestPrice with product.price, which can
            // belong to a seller other than the cheapest one.
            const sellerBasePrice = product.lowestPrice ?? product.price;
            const discountedPrice = product.lowestFinalPrice ?? sellerBasePrice;
            const showsDiscount = discountedPrice < sellerBasePrice;
            const ribbonOriginal = sellerBasePrice;
            const ribbonFinal = discountedPrice;
            const savingsPct = showsDiscount && ribbonOriginal > 0
              ? Math.round((1 - ribbonFinal / ribbonOriginal) * 100)
              : 0;
            return (
              <motion.article
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(idx * 0.03, 0.6) }}
                onClick={() => {
                  // Capture scroll BEFORE navigating (navigate() scrolls to top),
                  // so returning to Market can restore this exact position.
                  if (marketFeedCache) marketFeedCache.scrollY = window.scrollY;
                  onProductClick(product.id);
                }}
                className={`bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-ambient transition-all duration-300 flex flex-col border group cursor-pointer ${
                  showsDiscount
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

                  {/* Rating badge — bottom left */}
                  {(product.averageRating ?? 0) > 0 && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                      <span className="text-amber-400">★</span>
                      {product.averageRating!.toFixed(1)}
                      {product.totalReviews ? <span className="text-white/70">({product.totalReviews})</span> : null}
                    </span>
                  )}
                </div>

                <div className={`p-3 md:p-4 flex flex-col flex-1 ${showsDiscount ? 'bg-gradient-to-b from-green-50/30 to-white' : ''}`}>
                  {/* Out-of-stock badge (product-level). Retailer/store name + distance
                      were removed from Market cards — that data required a full
                      /retailers read on Market open; it now lives on Product Detail,
                      fetched on demand per product. */}
                  {product.stock && product.stock.toLowerCase().includes('out') && (
                    <div className="flex justify-end mb-2">
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-red-500 border border-red-200 bg-red-50 px-1.5 py-0.5 rounded-full">
                        Out of Stock
                      </span>
                    </div>
                  )}

                  {/* Product name */}
                  <h3 className="font-bold text-on-surface line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>

                  {/* Price */}
                  <div className={`mt-auto pt-2.5 border-t ${showsDiscount ? 'border-green-100' : 'border-surface-container'} mt-2`}>
                    {showsDiscount ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[9px] font-bold text-outline uppercase tracking-wide">From</span>
                        <span className="text-xl font-black text-green-700 leading-none">
                          ₹{discountedPrice.toLocaleString('en-IN')}
                        </span>
                        <span className="text-sm font-semibold text-outline line-through leading-none">
                          ₹{sellerBasePrice.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-secondary">
                          ₹{sellerBasePrice.toLocaleString('en-IN')}
                        </span>
                        {product.oldPrice && product.oldPrice > sellerBasePrice && (
                          <span className="text-[10px] text-outline line-through">
                            ₹{product.oldPrice}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {product.sellMode !== "offline_store_only" && (() => {
                    const inCart = cartItems.some((ci) => ci.productId === product.id);
                    if (inCart) {
                      return (
                        <div onClick={(e) => e.stopPropagation()} className="mt-2">
                          {/* Mobile: single compact in-cart button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); onGoToCart?.(); }}
                            className="md:hidden w-full border-2 border-green-600 text-green-700 text-xs font-bold py-1.5 rounded-lg hover:bg-green-600 hover:text-white transition-colors"
                          >
                            ✓ In Cart
                          </button>
                          {/* Desktop: Go to Cart + Buy Now */}
                          <div className="hidden md:flex gap-1">
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
                        </div>
                      );
                    }
                    return (
                      <div onClick={(e) => e.stopPropagation()} className="mt-2">
                        {/* Mobile: single + Add button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onAddToCart ? onAddToCart(product) : onProductClick(product.id); }}
                          className="md:hidden w-full bg-primary text-white text-xs font-bold py-1.5 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
                        >
                          <span className="text-sm font-black leading-none">+</span> Add
                        </button>
                        {/* Desktop: Add to Cart + Buy Now */}
                        <div className="hidden md:flex gap-1">
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
                      </div>
                    );
                  })()}
                </div>
              </motion.article>
            );
          })
        ) : feedLoading ? null : (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-surface-container">
            <ICONS.Search className="w-10 h-10 text-outline-variant mx-auto mb-4" />
            <h3 className="text-xl font-bold text-on-surface mb-2">{t('noProducts')}</h3>
            <p className="text-on-surface-variant">{t('noProductsHint')}</p>
          </div>
        )}
      </div>

      {/* Infinite-scroll sentinel + loader. The observer fetches the next 20
          (browse or search) only when this scrolls near the viewport. */}
      <div ref={sentinelRef} className="w-full py-8 flex items-center justify-center">
        {feedLoading && (
          <div className="flex items-center gap-2 text-outline text-sm font-medium">
            <span className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
