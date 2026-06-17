import { MarketplaceProduct } from "../../types/product";
import { ICONS, PRODUCTS, STORES } from '../constants';
import { CATEGORY_FIELDS, CHIPS_FIELDS, isStandardCategory, type ProductCategory, effectiveCategoryInfo } from '../dashboard/_lib/category-info';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { calcDiscount } from '../utils/discount';
import { getBulkDiscountPct, getNextBulkTier, fmtPrice } from '../utils/discount';
import type { BulkDiscountTier } from '../dashboard/_types/inventory';
import { Tag, Layers } from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { StoreWithDistance, storeStocksProduct } from '../utils/nearby';
import { normalizeUnit } from '../utils/weight';
import { db, trackDirectionRequest, trackProductClick, trackStoreCall, fetchUserProfileByPhone, fetchStoreOnlineDelivery } from '../firebase';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { useI18n } from '../i18n/I18nContext';
import {
  fetchRetailerPublicProfile,
  fetchRetailerProductSummaries,
  type RetailerPublicProfile,
  type RetailerProductSummary,
} from '../dashboard/_lib/retailer-profile-firestore';
import { ReviewSection } from '../../components/shared/ReviewSection';

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
  onViewBrand?: (manufacturerId: string) => void;
  /** Open Market filtered by category — used by the Similar Products "View All" CTA. */
  onCategoryClick?: (categoryId: string) => void;
  storesWithDistance?: StoreWithDistance[];
  onAddToCart?: (product: MarketplaceProduct, variant?: { unit: string; price: number; stock?: number }) => void;
  onAddToCartFromStore?: (product: MarketplaceProduct, store: any, price: number, variant?: { unit: string; price: number; stock?: number }) => void;
  onBuyNow?: (product: MarketplaceProduct, variant?: { unit: string; price: number; stock?: number }) => void;
}

// ─── Bulk Discount Tiers Section (lazy-loaded per store) ─────────────────────

function BulkTiersSection({
  storePhone,
  productId,
  basePrice,
}: {
  storePhone: string;
  productId: string;
  basePrice: number;
}) {
  const [tiers, setTiers] = useState<BulkDiscountTier[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!storePhone || !productId) return;
    let cancelled = false;

    async function fetchTiers() {
      try {
        const { getDocs, query, collection, where } = await import("firebase/firestore");
        const { db: fdb } = await import("../firebase");

        // Find inventory by ownerPhone + (productId or originalProductId)
        const [snap1, snap2] = await Promise.all([
          getDocs(query(
            collection(fdb, "inventory"),
            where("ownerPhone", "==", storePhone),
            where("productId", "==", productId),
          )),
          getDocs(query(
            collection(fdb, "inventory"),
            where("ownerPhone", "==", storePhone),
            where("originalProductId", "==", productId),
          )),
        ]);

        const docs = [...snap1.docs, ...snap2.docs];
        for (const d of docs) {
          const data = d.data() as Record<string, unknown>;
          if (data.bulkDiscountEnabled && Array.isArray(data.bulkDiscountTiers) && data.bulkDiscountTiers.length) {
            if (!cancelled) setTiers(
              (data.bulkDiscountTiers as { minQty: number; discountPct: number }[])
                .sort((a, b) => a.minQty - b.minQty)
            );
            break;
          }
        }
      } catch { /* non-critical */ }
      if (!cancelled) setLoaded(true);
    }

    fetchTiers();
    return () => { cancelled = true; };
  }, [storePhone, productId]);

  if (!loaded || tiers.length === 0) return null;

  return (
    <div className="rounded-xl border border-secondary/20 bg-secondary/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/10">
        <Layers className="h-3.5 w-3.5 text-secondary shrink-0" />
        <p className="text-[10px] font-black uppercase tracking-widest text-secondary">
          Bulk Discount Tiers
        </p>
      </div>
      <div className="divide-y divide-secondary/10">
        {tiers.map((t, i) => {
          const { finalPrice, discountAmt } = calcDiscount(basePrice, t.discountPct);
          return (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-on-surface-variant">Buy {t.minQty}+ units</span>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant line-through text-[10px]">₹{fmtPrice(basePrice)}</span>
                <span className="font-bold text-green-700">₹{fmtPrice(finalPrice)}</span>
                <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-black text-white">
                  {t.discountPct}% OFF
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-on-surface-variant px-3 py-2">
        Add more units to your cart to unlock bigger savings.
      </p>
    </div>
  );
}

// ─── Retailer Profile Section ─────────────────────────────────────────────────

function RetailerProfileSection({
  retailerPhone,
  currentProductId,
  onProductClick,
}: {
  retailerPhone: string;
  currentProductId: string;
  onProductClick?: (id: string) => void;
}) {
  const [profile, setProfile] = useState<RetailerPublicProfile | null>(null);
  const [products, setProducts] = useState<RetailerProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchRetailerPublicProfile(retailerPhone),
      fetchRetailerProductSummaries(retailerPhone, currentProductId, 8),
    ])
      .then(([prof, prods]) => {
        setProfile(prof);
        setProducts(prods);
      })
      .finally(() => setLoading(false));
  }, [retailerPhone, currentProductId]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-surface-container bg-white p-6 animate-pulse">
        <div className="h-4 w-48 rounded-full bg-surface-container-highest mb-3" />
        <div className="h-3 w-32 rounded-full bg-surface-container-highest" />
      </div>
    );
  }

  if (!profile && products.length === 0) return null;

  const shopName = profile?.shopName || "This Retailer";
  const locationParts = [profile?.city, profile?.state].filter(Boolean);

  return (
    <section className="rounded-3xl border border-surface-container bg-white shadow-sm overflow-hidden">
      {/* Profile header */}
      <div className="flex items-center gap-4 p-6 border-b border-surface-container">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ICONS.Market className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-0.5">
            Sold &amp; fulfilled by
          </p>
          <h3 className="text-lg font-bold text-on-surface truncate">{shopName}</h3>
          {locationParts.length > 0 && (
            <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
              <ICONS.Location className="h-3 w-3" />
              {locationParts.join(", ")}
            </p>
          )}
          {profile?.bio && (
            <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{profile.bio}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 text-secondary">
            <ICONS.Star className="w-4 h-4 fill-secondary" />
            <span className="text-sm font-black">
              {profile?.averageRating ? profile.averageRating.toFixed(1) : "0.0"}
            </span>
          </div>
          <span className="text-[10px] text-on-surface-variant">
            {profile?.totalReviews || 0} reviews
          </span>
        </div>
      </div>
      
      {/* Store Reviews */}
      <div className="px-6 pt-4 border-b border-surface-container pb-4">
        <ReviewSection targetId={retailerPhone} targetType="store" />
      </div>

      {/* "More products" prompt + grid */}
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">
              Would you like to see more products from this retailer?
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {products.length > 0
                ? `${products.length} other product${products.length !== 1 ? "s" : ""} available from ${shopName}`
                : `Browse all products listed by ${shopName}`}
            </p>
          </div>
        </div>

        {products.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
            {products.map((p) => (
              <button
                key={p.productId}
                type="button"
                onClick={() => onProductClick?.(p.productId)}
                className="shrink-0 w-40 text-left rounded-2xl border border-surface-container bg-surface-container-low hover:border-primary/40 hover:shadow-md hover:scale-[1.02] transition-all overflow-hidden"
              >
                <div className="aspect-square overflow-hidden bg-surface-container">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-on-surface-variant/30">
                      <ICONS.Market className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="p-2.5 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                    {p.category}
                  </span>
                  <p className="text-sm font-bold text-on-surface truncate leading-tight">
                    {p.name}
                  </p>
                  <span className="text-sm font-extrabold text-secondary">₹{p.price}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant italic">
            No other products listed yet from this retailer.
          </p>
        )}
      </div>
    </section>
  );
}

// ─── Manufacturer Brand Section (Firestore-backed) ────────────────────────────

type MfrProduct = { id: string; name: string; category: string; price: number; image: string };
type MfrInfo = { name: string; slug: string; location: string; founded: string } | null;

function ManufacturerBrandSection({
  manufacturerId,
  currentProductId,
  onProductClick,
  onViewBrand,
}: {
  manufacturerId: string;
  currentProductId: string;
  onProductClick?: (id: string) => void;
  onViewBrand?: (manufacturerId: string) => void;
}) {
  const [mfrInfo, setMfrInfo] = useState<MfrInfo>(null);
  const [mfrProducts, setMfrProducts] = useState<MfrProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!manufacturerId) return;
    setLoading(true);

    async function fetchAll() {
      // Resolve manufacturer profile doc (keyed by phone, uid stored as field)
      const mfrSnap = await getDocs(
        query(collection(db, "manufacturers"), where("uid", "==", manufacturerId), limit(1)),
      );
      if (!mfrSnap.empty) {
        const d = mfrSnap.docs[0].data() as Record<string, unknown>;
        const addr = (d.address ?? {}) as Record<string, unknown>;
        setMfrInfo({
          name: String(d.businessName ?? d.ownerName ?? ""),
          slug: String(d.slug ?? ""),
          location: [addr.city, addr.state].filter(Boolean).join(", "),
          founded: String(d.establishedYear ?? ""),
        });
      }

      // Fetch manufacturer-owned catalog products (exclude assigned retailer copies)
      const prodsSnap = await getDocs(
        query(
          collection(db, "products"),
          where("manufacturerId", "==", manufacturerId),
          where("isActive", "==", true),
          limit(20),
        ),
      );
      const others = prodsSnap.docs
        .filter((d) => {
          const r = d.data() as Record<string, unknown>;
          return d.id !== currentProductId && r.source !== "manufacturer_assigned";
        })
        .slice(0, 6)
        .map((d) => {
          const r = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: String(r.name ?? ""),
            category: String(r.category ?? ""),
            price: Number(r.price ?? 0),
            image: String(r.image ?? ""),
          };
        });
      setMfrProducts(others);
    }

    fetchAll().finally(() => setLoading(false));
  }, [manufacturerId, currentProductId]);

  // Nothing to show while loading or if we got no data at all
  if (loading) {
    return (
      <div className="rounded-3xl border border-surface-container bg-white p-6 animate-pulse">
        <div className="h-4 w-48 rounded-full bg-surface-container-highest mb-3" />
        <div className="h-3 w-32 rounded-full bg-surface-container-highest" />
      </div>
    );
  }

  if (!mfrInfo && mfrProducts.length === 0) return null;

  const brandName = mfrInfo?.name || "This Manufacturer";
  const hasBrandPage = !!mfrInfo?.slug;

  return (
    <section className="rounded-3xl overflow-hidden border border-surface-container shadow-sm">
      {/* Brand header — stacks on mobile so the brand name stays fully visible, row layout on sm+ (desktop unchanged) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6 bg-[#0d2b09]">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/80 mb-1">Manufactured by</p>
          <h2 className="text-xl font-bold text-white leading-tight break-words sm:truncate">{brandName}</h2>
          {(mfrInfo?.location || mfrInfo?.founded) && (
            <p className="text-white/60 text-xs mt-0.5">
              {[mfrInfo.location, mfrInfo.founded ? `Est. ${mfrInfo.founded}` : ""].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {hasBrandPage && mfrInfo?.slug && (
          <a
            href={`/brand/${mfrInfo.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full justify-center sm:w-auto sm:justify-start shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95"
          >
            Visit Brand Store <ICONS.ChevronRight className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* More from this manufacturer */}
      {mfrProducts.length > 0 && (
        <div className="p-6 bg-white flex flex-col gap-4">
          <p className="text-sm font-semibold text-on-surface">More from {brandName}</p>
          <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
            {mfrProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onProductClick?.(p.id)}
                className="shrink-0 w-40 text-left rounded-2xl border border-surface-container bg-surface-container-low hover:border-primary/40 hover:shadow-md hover:scale-[1.02] transition-all overflow-hidden"
              >
                <div className="aspect-square overflow-hidden bg-surface-container">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-on-surface-variant/30">
                      <ICONS.Market className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="p-2.5 flex flex-col gap-0.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">{p.category}</span>
                  <p className="text-sm font-bold text-on-surface truncate leading-tight">{p.name}</p>
                  <span className="text-sm font-extrabold text-secondary">₹{p.price}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Similar Products Section ─────────────────────────────────────────────────

function SimilarProductsSection({
  products,
  currentProduct,
  onProductClick,
  onCategoryClick,
}: {
  products: MarketplaceProduct[];
  currentProduct: MarketplaceProduct;
  onProductClick?: (id: string) => void;
  onCategoryClick?: (categoryId: string) => void;
}) {
  const { t } = useI18n();

  // Same-category, exclude the current product. No extra API — pure in-memory filter
  // over the products the marketplace already loaded.
  const similar = useMemo(() => {
    if (!currentProduct.category) return [];
    return products
      .filter((p) => p.id !== currentProduct.id && p.category === currentProduct.category)
      .slice(0, 12);
  }, [products, currentProduct.id, currentProduct.category]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-on-surface">{t('similarProducts')}</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">{t('similarProductsSubtitle')}</p>
        </div>
        {similar.length > 0 && onCategoryClick && currentProduct.category && (
          <button
            onClick={() => onCategoryClick(currentProduct.category)}
            className="shrink-0 text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            {t('viewAll')} <ICONS.ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {similar.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
          {similar.map((p) => (
            <button
              key={p.id}
              onClick={() => onProductClick?.(p.id)}
              className="shrink-0 w-44 text-left cursor-pointer rounded-2xl border border-surface-container bg-white shadow-sm hover:shadow-md hover:border-primary/30 transition-all hover:scale-[1.02] overflow-hidden"
            >
              <div className="aspect-square overflow-hidden bg-surface-container-low">
                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-3 flex flex-col gap-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{p.category}</span>
                <p className="font-bold text-on-surface text-sm truncate leading-tight">{p.name}</p>
                {(p.averageRating ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-on-surface-variant">
                    <span className="text-amber-500">★</span>
                    {p.averageRating!.toFixed(1)}
                    {p.totalReviews ? <span className="text-outline">({p.totalReviews})</span> : null}
                  </span>
                )}
                <span className="text-secondary font-extrabold text-sm">₹{p.price.toLocaleString('en-IN')}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-surface-container bg-surface-container-low px-6 py-8 text-center">
          <p className="text-sm text-on-surface-variant font-medium">{t('noSimilarProducts')}</p>
        </div>
      )}
    </section>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ProductDetailView({
  products = PRODUCTS,
  stores = STORES,
  productId,
  onBack,
  onStoreClick,
  onProductClick,
  onViewSellerAll,
  onViewBrand,
  onCategoryClick,
  storesWithDistance = [],
  onAddToCart,
  onAddToCartFromStore,
  onBuyNow,
}: ProductDetailViewProps) {
  const { t } = useI18n();
  const product = products.find(p => p.id === productId) || products[0];
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [storeOnlineMap, setStoreOnlineMap] = useState<Record<string, boolean>>({});
  const [selectedOrderStoreId, setSelectedOrderStoreId] = useState<string | null>(null);
  const [mobileStoresExpanded, setMobileStoresExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // Variant selection — default to the first variant (or the product itself if no variants)
  const productVariants = product.variants && product.variants.length > 0 ? product.variants : null;
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const selectedVariant = productVariants ? productVariants[selectedVariantIdx] : null;
  const displayPrice = selectedVariant ? selectedVariant.price : product.price;
  const displayStock = selectedVariant?.stock;
  // Live store ratings keyed by phone — reflects new reviews instantly without a full refetch.
  const [liveStoreRatings, setLiveStoreRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const handleStoreAggregate = useCallback((phone: string, avg: number, count: number) => {
    setLiveStoreRatings((prev) => {
      const cur = prev[phone];
      if (cur && cur.avg === avg && cur.count === count) return prev;
      return { ...prev, [phone]: { avg, count } };
    });
  }, []);

  // Gallery: use product.images if available, else fall back to product.image alone
  const galleryImages = (product.images && product.images.length > 0)
    ? product.images.slice(0, 5)
    : [product.image];
  const [activeImage, setActiveImage] = useState(galleryImages[0]);

  useEffect(() => {
    if (product && product.id) {
      trackProductClick(product.id);
      const imgs = (product.images && product.images.length > 0) ? product.images.slice(0, 5) : [product.image];
      setActiveImage(imgs[0]);
      setSelectedOrderStoreId(null);
      setSelectedVariantIdx(0);
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
    const filtered = sourceStores.filter(store => {
      const storePhone = (store as any).phone as string | undefined;
      const storeUserId = (store as any).userId as string | undefined;
      const storeRetailerId = (store as any).retailerId as string | undefined;

      // 1. Check if assigned via availability array
      const inAvailability = product.availability?.some(
        (a) =>
          a.storeId === store.id ||
          (a.storePhone && storePhone && a.storePhone === storePhone) ||
          (a.storePhone && a.storePhone === store.id) ||
          (a.storeId && storePhone && a.storeId === storePhone) ||
          (a.storeId && storeUserId && a.storeId === storeUserId) ||
          (a.storeId && storeRetailerId && a.storeId === storeRetailerId),
      );
      if (inAvailability) return true;

      // 2. Check if this is the primary owner's store (match by UID, phone, or name)
      const rid = product.retailerId;
      const rPhone = product.retailerPhone;
      const storeMfrId = (store as any).userId as string | undefined;
      const mfrPhone = product.manufacturerPhone;
      const isOwnerStore =
        (rid && (store.id === rid || storeUserId === rid || storeRetailerId === rid)) ||
        (rPhone && (store.id === rPhone || storePhone === rPhone)) ||
        // Match manufacturer by UID (primary) — store.userId = data.uid from manufacturers doc
        (product.manufacturerId && storeMfrId && storeMfrId === product.manufacturerId) ||
        // Match manufacturer by phone (belt-and-suspenders for phone-keyed schema)
        (mfrPhone && (store.id === mfrPhone || storePhone === mfrPhone)) ||
        // Legacy: store.id is the phone doc ID, product.manufacturerId was incorrectly set to phone
        store.id === product.manufacturerId ||
        store.name === product.store ||
        (store as any).shopName === product.store ||
        (store as any).ownerName === product.store;

      return isOwnerStore;
    });

    // Deduplicate: same store can match via both availability array and owner-store check,
    // or exist in multiple Firestore collections (stores + retailers). Key by phone, then name.
    const seen = new Map<string, typeof filtered[number]>();
    for (const store of filtered) {
      const phone = (store as any).phone as string | undefined;
      const key = phone || store.name?.toLowerCase().trim() || store.id;
      if (!seen.has(key)) {
        seen.set(key, store);
      } else {
        // Keep the entry with the smaller distance
        const existing = seen.get(key)!;
        if (((store as any).distanceKm ?? Infinity) < ((existing as any).distanceKm ?? Infinity)) {
          seen.set(key, store);
        }
      }
    }
    const deduped = Array.from(seen.values());

    // Sort by distance if we have computed distances
    if (storesWithDistance.length > 0) {
      return deduped.sort((a: any, b: any) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return deduped;
  }, [product, storesWithDistance, stores]);

  // Fallback: if no store matched from pre-loaded list, fetch the retailer's profile
  // directly. This handles retailers who listed a product before saving their profile
  // (no retailers doc yet) or before retailerPhone was stored on the product.
  const [fallbackStore, setFallbackStore] = useState<any | null>(null);
  useEffect(() => {
    if (availableStores.length > 0) { setFallbackStore(null); return; }
    const phone = product.retailerPhone;
    const uid = product.retailerId;
    if (!phone && !uid) return;

    const resolve = async () => {
      let profile: Record<string, unknown> | null = null;
      let resolvedPhone = phone ?? '';

      if (phone) {
        profile = await fetchUserProfileByPhone(phone).catch(() => null);
      } else if (uid) {
        // Resolve UID → phone via uidIndex, then fetch user profile
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('../firebase');
        const idxSnap = await getDoc(doc(firestoreDb, 'uidIndex', uid)).catch(() => null);
        if (idxSnap?.exists()) {
          resolvedPhone = String(idxSnap.data().phone ?? '');
          if (resolvedPhone) {
            profile = await fetchUserProfileByPhone(resolvedPhone).catch(() => null);
          }
        }
      }

      if (!profile) return;
      setFallbackStore({
        id: resolvedPhone || uid || 'retailer',
        name: String(profile.businessName ?? profile.shopName ?? profile.name ?? 'Retailer'),
        ownerName: String(profile.ownerName ?? profile.name ?? ''),
        phone: resolvedPhone,
        distance: 'Nearby',
        status: 'Active',
        stock: [],
        location: { lat: 0, lng: 0 },
        userId: String(profile.uid ?? uid ?? ''),
        retailerId: String(profile.uid ?? uid ?? ''),
      });
    };

    resolve();
  }, [availableStores.length, product.retailerPhone, product.retailerId]);

  const displayStores = useMemo(
    () => (availableStores.length > 0 ? availableStores : fallbackStore ? [fallbackStore] : []),
    [availableStores, fallbackStore],
  );

  // ── Per-variant pricing (single source of truth) ──────────────────────────
  // Resolve a store's OWN active discount % from the per-seller map. Keyed by
  // store userId → phone → store.id (same precedence used in the store cards).
  const resolveStoreDiscountPct = useCallback((store: any): number => {
    const map = product.sellerDiscounts ?? {};
    const uid = String(store.userId ?? '');
    if (uid && map[uid]) return map[uid];
    const phone = store.phone as string | undefined;
    if (phone && map[phone]) return map[phone];
    if (store.id && map[store.id]) return map[store.id];
    return 0;
  }, [product.sellerDiscounts]);

  // The product's base `unit`/`price` is what each store's availability.sellingPrice
  // refers to. Identify which variant that base price corresponds to so we know when
  // store prices apply directly vs. when only the variant's own list price exists.
  const baseVariantIdx = useMemo(() => {
    if (!productVariants) return -1;
    const match = productVariants.findIndex((v) => v.price === product.price);
    return match >= 0 ? match : 0;
  }, [productVariants, product.price]);

  // ── Per-store variant resolution (SINGLE SOURCE OF TRUTH) ─────────────────
  // For the CURRENTLY SELECTED package size, resolve this store's own configured
  // price + stock from its availability entry. This one function drives store
  // visibility, the store-card price, the price block, and Add/Buy/Order — so
  // visibility and pricing always stay in sync.
  //
  // Rules:
  //  • availability.variants[] (the store's own per-size prices) is authoritative.
  //    - If it has the selected unit  → store stocks it; use that variant's price.
  //    - If it has variants but NOT the selected unit → store does NOT stock it.
  //  • No availability.variants[] (legacy single-price store) → it only provides the
  //    base size: stocks the base variant (use availability.sellingPrice), and does
  //    NOT provide any other size.
  //  • No variants on the product at all → single-size product; always "stocked".
  const findStoreAvailability = useCallback((store: any) => {
    const storePhone = store.phone as string | undefined;
    return product.availability?.find(
      (a) =>
        a.storeId === store.id ||
        (a.storePhone && storePhone && a.storePhone === storePhone) ||
        (a.storePhone && a.storePhone === store.id),
    );
  }, [product.availability]);

  const resolveStoreVariant = useCallback((store: any): { stocked: boolean; price?: number } => {
    const availability = findStoreAvailability(store);

    // Single-size product (no variant selector) — nothing to filter on.
    if (!selectedVariant) {
      const sp = availability?.sellingPrice ?? (store.sellingPrice ?? store.price);
      return { stocked: true, price: sp && sp > 0 ? Number(sp) : product.price };
    }

    const selectedKey = normalizeUnit(selectedVariant.unit);

    // Helper: match a unit-keyed variant list against the selected size, comparing
    // on the NORMALIZED unit so "2L" / "2 l" / "2ltr" / "2 Liter" all resolve equal.
    const matchInList = (
      list: { unit: string; price: number; stock?: number }[],
    ): { stocked: boolean; price?: number } | null => {
      if (!list || list.length === 0) return null;
      const match = list.find((v) => normalizeUnit(v.unit) === selectedKey);
      if (!match) return { stocked: false };
      if (match.stock !== undefined && match.stock === 0) return { stocked: false, price: match.price };
      return { stocked: true, price: match.price };
    };

    const storeVariants = availability?.variants;
    if (storeVariants && storeVariants.length > 0) {
      // Store configured explicit per-size prices — authoritative, normalized match.
      return matchInList(storeVariants)!;
    }

    // No per-store availability entry → this is the product's OWNER store (the
    // manufacturer/retailer that owns this catalogue item). Its real inventory is
    // the product's own `variants[]`, so use that as this store's source of truth.
    if (!availability && productVariants && productVariants.length > 0) {
      return matchInList(productVariants)!;
    }

    // Legacy store with an availability entry but no per-size prices: it only
    // provides the BASE size.
    if (selectedVariantIdx === baseVariantIdx) {
      const base = availability?.sellingPrice && availability.sellingPrice > 0
        ? availability.sellingPrice
        : (store.sellingPrice ?? store.price);
      return { stocked: true, price: base && base > 0 ? Number(base) : selectedVariant.price };
    }
    // Non-base size requested but store has no configured price for it → not stocked.
    return { stocked: false };
  }, [findStoreAvailability, selectedVariant, selectedVariantIdx, baseVariantIdx, productVariants, product.price]);

  // Stores that actually provide the SELECTED package size. Driven entirely by
  // resolveStoreVariant so the rendered list, the price block, and the order
  // actions all show the same set of stores. Sorting/dedup already done upstream
  // in displayStores; this only removes stores that don't stock the chosen size.
  const visibleStores = useMemo(
    () => displayStores.filter((s) => resolveStoreVariant(s).stocked),
    [displayStores, resolveStoreVariant],
  );

  // Compute the displayed price block (current price, MRP, savings, discount %,
  // "lowest nearby") for the CURRENTLY SELECTED variant only. Never uses the
  // base product price, the merged maxDiscountPct, or product.lowestPrice — those
  // mix data across variants/sellers.
  const variantPricing = useMemo(() => {
    // List price (MRP) for the selected package size.
    const variantListPrice = selectedVariant ? selectedVariant.price : product.price;

    // Resolve each STOCKING store's original + discounted price FOR THE SELECTED
    // VARIANT via the single shared resolver, then apply each store's discount %.
    // Only stores that actually provide the selected size contribute here.
    const perStore = visibleStores.map((store) => {
      const resolved = resolveStoreVariant(store);
      const original = resolved.price && resolved.price > 0 ? resolved.price : variantListPrice;
      const discountPct = resolveStoreDiscountPct(store);
      const { finalPrice } = calcDiscount(original, discountPct);
      return { original, discountPct, finalPrice };
    }).filter((s) => s.original > 0);

    if (perStore.length === 0) {
      // No matched stores yet — derive price from availability[].sellingPrice directly.
      // These entries are kept up to date by syncAvailabilityPriceStock whenever a
      // retailer changes their inventory price, so they are authoritative even before
      // the store list has been loaded/matched. Only fall back to the source product
      // price (variantListPrice) when no seller has a price on record.
      const availPrices = (product.availability ?? [])
        .map((a) => a.sellingPrice)
        .filter((v): v is number => typeof v === 'number' && v > 0);
      const fallbackPrice = availPrices.length > 0 ? Math.min(...availPrices) : variantListPrice;
      return {
        currentPrice: fallbackPrice,
        mrp: fallbackPrice,
        discountPct: 0,
        savings: 0,
        hasOffer: false,
        isLowestNearby: availPrices.length > 1,
      };
    }

    // Lowest available SELLING price for this variant across all stores.
    const lowest = perStore.reduce((best, s) => (s.finalPrice < best.finalPrice ? s : best));
    const savings = Math.round((lowest.original - lowest.finalPrice) * 100) / 100;
    // "Lowest nearby" only when multiple sources exist AND the chosen one is cheaper
    // than the most expensive — i.e. there's a genuinely lower price to highlight.
    const maxFinal = Math.max(...perStore.map((s) => s.finalPrice));
    const isLowestNearby = perStore.length > 1 && lowest.finalPrice < maxFinal;

    return {
      currentPrice: lowest.finalPrice,
      mrp: lowest.original,
      discountPct: lowest.discountPct,
      savings,
      hasOffer: lowest.discountPct > 0 && savings > 0,
      isLowestNearby,
    };
  }, [visibleStores, resolveStoreVariant, product.price, selectedVariant, resolveStoreDiscountPct]);

  useEffect(() => {
    if (displayStores.length === 0) return;
    let cancelled = false;
    const phones = displayStores
      .map((s) => (s as any).phone as string | undefined)
      .filter((p): p is string => !!p);
    if (phones.length === 0) return;
    Promise.all(phones.map(async (phone) => {
      const isOnline = await fetchStoreOnlineDelivery(phone);
      return [phone, isOnline] as [string, boolean];
    })).then((results) => {
      if (!cancelled) setStoreOnlineMap(Object.fromEntries(results));
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayStores.length, product.id]);

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
            className={`rounded-3xl overflow-hidden bg-[#f7f5f0] shadow-ambient border relative flex items-center justify-center ${
              (product.maxDiscountPct ?? product.effectiveDiscountPct ?? 0) > 0
                ? 'border-green-400 shadow-green-100'
                : 'border-surface-container'
            }`}
            style={{ minHeight: '280px', maxHeight: '480px', height: 'auto' }}
          >
            <img src={activeImage} className="w-full object-contain" style={{ maxHeight: '480px' }} alt={product.name} />

            {/* Corner offer ribbon on product image */}
            {(product.maxDiscountPct ?? product.effectiveDiscountPct ?? 0) > 0 && (() => {
              const pct = product.maxDiscountPct ?? product.effectiveDiscountPct!;
              return (
                <div className="absolute top-0 left-0 w-28 h-28 overflow-hidden pointer-events-none">
                  <div
                    className="absolute bg-green-500 shadow-md text-white text-center"
                    style={{ width: 150, top: 26, left: -38, transform: 'rotate(-45deg)', padding: '6px 0' }}
                  >
                    <span className="flex items-center justify-center gap-1 text-xs font-black tracking-wide">
                      <Tag className="h-3 w-3 shrink-0" />
                      Up to {pct}% OFF
                    </span>
                  </div>
                </div>
              );
            })()}

            <HelperTooltip side="bottom" textKey="productQualityBadge">
              <div className="absolute top-6 right-6 bg-primary-container text-on-primary-container px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-md cursor-help">
                <ICONS.Check className="w-4 h-4" />
                {t('premiumGrade')}
              </div>
            </HelperTooltip>
          </motion.div>
          {galleryImages.length > 1 && (
            <div className="flex gap-3">
              {galleryImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(img)}
                  className={`w-20 h-20 rounded-2xl overflow-hidden shrink-0 transition-all bg-[#f7f5f0] flex items-center justify-center ${
                    activeImage === img
                      ? 'border-2 border-primary shadow-sm scale-105'
                      : 'border border-surface-container-highest opacity-60 hover:opacity-100 hover:border-outline-variant'
                  }`}
                >
                  <img src={img} className="w-full h-full object-contain" alt={`${product.name} view ${i + 1}`} />
                </button>
              ))}
            </div>
          )}

          {/* Variant selector — moved directly below the product image/gallery.
              Selection, variant-switching and price-update logic are unchanged. */}
          {productVariants && productVariants.length > 1 && (
            <div className="flex flex-col gap-2 pt-4 border-t border-surface-container">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                Package Size
              </p>
              <div className="flex flex-wrap gap-2">
                {productVariants.map((v, i) => {
                  const isSelected = selectedVariantIdx === i;
                  const outOfStock = v.stock !== undefined && v.stock === 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => setSelectedVariantIdx(i)}
                      className={`rounded-xl border-2 px-4 py-2 text-sm font-bold transition-all flex flex-col items-center min-w-[72px] ${
                        isSelected
                          ? "border-primary bg-primary text-white shadow-md"
                          : outOfStock
                            ? "border-outline-variant/30 bg-surface-container text-on-surface-variant/40 cursor-not-allowed"
                            : "border-outline-variant/40 bg-white text-on-surface hover:border-primary hover:text-primary"
                      }`}
                    >
                      <span>{v.unit}</span>
                      <span className={`text-xs font-extrabold mt-0.5 ${isSelected ? "text-white/90" : "text-secondary"}`}>
                        ₹{v.price.toLocaleString("en-IN")}
                      </span>
                      {outOfStock && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-red-400 mt-0.5">
                          Out of stock
                        </span>
                      )}
                      {!outOfStock && v.stock !== undefined && v.stock <= 10 && (
                        <span className={`text-[9px] font-bold uppercase tracking-wide mt-0.5 ${isSelected ? "text-white/80" : "text-amber-600"}`}>
                          Only {v.stock} left
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

          {/* Store list — desktop only gets a capped height with internal scroll so a
              long list (>5–6 stores) doesn't create whitespace beside the image. Mobile
              keeps its natural flow (no cap).
              NOTE: this is a *block* container using space-y-3 (NOT flex). A flex column
              would let the cards shrink to fit the max-height and visually compress them;
              block layout keeps every card at its natural size and just scrolls. */}
          <div className="space-y-2 md:space-y-3 md:max-h-[560px] md:overflow-y-auto md:pr-2 store-scrollbar">
          {visibleStores.length > 0 ? visibleStores.map((store, storeIdx) => {
            const storePhone = (store as any).phone as string | undefined;
            const availability = product.availability?.find(
              (a) =>
                a.storeId === store.id ||
                (a.storePhone && storePhone && a.storePhone === storePhone) ||
                (a.storePhone && a.storePhone === store.id),
            );
            const isExpanded = expandedStoreId === store.id;

            // Resolve price FOR THE SELECTED VARIANT via the single shared resolver
            // (same source that drives visibility + the price block). Falls back to
            // displayPrice only if the resolver returns no price (shouldn't happen for
            // a visible/stocking store).
            const resolvedPrice: number | undefined = (() => {
              const r = resolveStoreVariant(store);
              if (r.price && r.price > 0) return r.price;
              if (displayPrice > 0) return displayPrice;
              return undefined;
            })();

            // Resolve discount: this store's OWN discount from the per-seller map
            // (shared helper — keyed by userId → phone → store.id). Never the merged
            // effectiveDiscountPct and never the stale availability.discountPct.
            const resolvedDiscountPct: number = resolveStoreDiscountPct(store);

            const hasStoreOffer = resolvedDiscountPct > 0;
            const { finalPrice: resolvedFinalPrice } =
              calcDiscount(resolvedPrice ?? 0, resolvedDiscountPct);

            return (
              <div
                key={store.id}
                className={`rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${
                  isExpanded
                    ? 'border-primary bg-white shadow-ambient'
                    : hasStoreOffer
                      ? 'border-green-400 bg-green-50/20 hover:border-green-500'
                      : 'border-surface-container bg-surface-container-low hover:border-outline-variant'
                }${storeIdx >= 3 && !mobileStoresExpanded ? ' hidden md:block' : ''}`}
              >
                {/* Always-visible summary row — compact on mobile (no logo, tighter padding) */}
                <div className="w-full flex items-center gap-1.5 md:gap-2 p-2.5 md:p-4">
                  <button
                    onClick={() => setExpandedStoreId(isExpanded ? null : store.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 md:gap-4 text-left"
                  >
                    <div className={`hidden md:block rounded-xl overflow-hidden transition-colors ${isExpanded ? 'bg-primary text-white' : 'bg-white shadow-sm text-on-surface-variant'} ${store.logo ? 'w-10 h-10' : 'p-2.5'}`}>
                      {store.logo ? (
                        <img src={store.logo} alt={store.name} className="w-10 h-10 object-cover" />
                      ) : (
                        <ICONS.Market className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-on-surface text-sm md:text-base leading-snug break-words">{store.name}</span>
                        {hasStoreOffer && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-green-600 px-2 py-0.5 text-[9px] font-black text-white shadow-sm shrink-0">
                            <Tag className="h-2.5 w-2.5" />{resolvedDiscountPct}% OFF
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 md:mt-0.5">
                        <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1 whitespace-nowrap">
                          <ICONS.Location className="w-3 h-3 shrink-0" />{(store as any).distanceLabel || store.distance || t('nearby')}
                        </span>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(store.status || '').includes('Open') ? 'bg-green-500' : 'bg-red-400'}`} />
                          <span className="text-[10px] font-bold text-on-surface-variant">{(store.status || t('active')).split('•')[0].trim()}</span>
                        </span>
                        {(() => {
                          const live = storePhone ? liveStoreRatings[storePhone] : undefined;
                          const avg = live ? live.avg : ((store as any).averageRating ?? 0);
                          const count = live ? live.count : ((store as any).totalReviews ?? 0);
                          if (!(avg > 0)) return null;
                          return (
                            <span className="flex items-center gap-0.5 whitespace-nowrap">
                              <span className="text-amber-400 text-[10px] leading-none">★</span>
                              <span className="text-[10px] font-bold text-on-surface-variant tabular-nums">
                                {avg.toFixed(1)}{count ? ` (${count})` : ''}
                              </span>
                            </span>
                          );
                        })()}
                        {/* Stock badge + price — mobile */}
                        <span className="flex items-center gap-2 md:hidden">
                          {resolvedPrice && (
                            hasStoreOffer ? (
                              <span className="flex items-baseline gap-1 whitespace-nowrap">
                                <span className="text-sm font-bold text-green-700">₹{resolvedFinalPrice.toLocaleString('en-IN')}</span>
                                <span className="text-[10px] text-on-surface-variant line-through">₹{resolvedPrice.toLocaleString('en-IN')}</span>
                              </span>
                            ) : (
                              <span className="text-sm font-bold text-secondary whitespace-nowrap">
                                ₹{resolvedPrice.toLocaleString('en-IN')}
                              </span>
                            )
                          )}
                          {availability?.stockLevel && (
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap ${
                              availability.stockLevel === 'In Stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {availability.stockLevel}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    {/* Desktop-only right cluster (price / discount / stock / chevron) */}
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                      {resolvedPrice && (
                        hasStoreOffer ? (
                          <span className="flex flex-col items-end">
                            <span className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-green-700">₹{resolvedFinalPrice.toLocaleString('en-IN')}</span>
                            </span>
                            <span className="text-[10px] text-on-surface-variant line-through">₹{resolvedPrice.toLocaleString('en-IN')}</span>
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-secondary">
                            ₹{resolvedPrice.toLocaleString('en-IN')}
                          </span>
                        )
                      )}
                      {availability?.stockLevel && (
                        <HelperTooltip side="left" textKey="productStockStatus">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full cursor-help ${
                            availability.stockLevel === 'In Stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {availability.stockLevel}
                          </span>
                        </HelperTooltip>
                      )}
                      <ICONS.ChevronRight className={`w-4 h-4 text-outline transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  {/* Chevron for mobile — sits outside the desktop cluster so it stays aligned with the MAP button */}
                  <ICONS.ChevronRight className={`md:hidden shrink-0 w-4 h-4 text-outline transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <HelperTooltip side="left" textKey="storeDirections">
                    <button
                      onClick={() => {
                        void trackDirectionRequest(product.id);
                        onStoreClick(store.id);
                      }}
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <ICONS.Directions className="w-3.5 h-3.5" />
                      {t('mapShort')}
                    </button>
                  </HelperTooltip>
                  {onAddToCartFromStore && (() => {
                    const phone = (store as any).phone as string | undefined;
                    // Account-level: seller has online delivery enabled.
                    // Product-level: this specific listing's isOnline flag (from availability entry).
                    // Legacy entries without isOnline default to true — account-level check is sufficient.
                    const availEntry = product.availability?.find(
                      (a) =>
                        (phone && (a.storePhone === phone || a.storeId === phone)) ||
                        a.storeId === store.id,
                    );
                    const productLevelOnline = availEntry?.isOnline !== false;
                    const canOrder = !!phone && storeOnlineMap[phone] === true && productLevelOnline;
                    console.log("[ProductDetailView] per-store canOrder", {
                      storeId: store.id,
                      storePhone: phone,
                      accountLevelOnline: phone ? storeOnlineMap[phone] : undefined,
                      availEntryIsOnline: availEntry?.isOnline,
                      productLevelOnline,
                      canOrder,
                    });
                    if (!canOrder) return null;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderStoreId(selectedOrderStoreId === store.id ? null : store.id);
                        }}
                        className={`shrink-0 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          selectedOrderStoreId === store.id
                            ? 'bg-green-600 text-white border-green-600 scale-[1.02]'
                            : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                        }`}
                      >
                        <ICONS.AddToCart className="w-3.5 h-3.5" />
                        {selectedOrderStoreId === store.id ? 'Selected' : 'Order'}
                      </button>
                    );
                  })()}
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
                        {/* Discount breakdown — shown when seller has an active discount */}
                        {hasStoreOffer && resolvedPrice && (() => {
                          const { finalPrice, discountAmt } = calcDiscount(resolvedPrice, resolvedDiscountPct);
                          return (
                            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-on-surface-variant">Original price</span>
                                <span className="text-xs font-medium text-on-surface-variant line-through">₹{resolvedPrice.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-on-surface-variant">Discount</span>
                                <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-black text-white">
                                  {resolvedDiscountPct}% OFF
                                </span>
                              </div>
                              <div className="flex items-center justify-between border-t border-green-200 pt-1.5">
                                <span className="text-sm font-bold text-green-700">Final price</span>
                                <span className="text-lg font-black text-green-700">₹{finalPrice.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-green-600">You save</span>
                                <span className="text-xs font-bold text-green-600">₹{discountAmt.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Bulk discount tiers — lazy loaded */}
                        {storePhone && (
                          <BulkTiersSection
                            storePhone={storePhone}
                            productId={product.id}
                            basePrice={resolvedPrice ?? product.price}
                          />
                        )}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void trackStoreCall(product.id);
                                }}
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

                        {/* Rate this store — write/read reviews for this specific store */}
                        {storePhone && (
                          <ReviewSection targetId={storePhone} targetType="store" onAggregateChange={handleStoreAggregate} />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }) : (
            <div className="p-5 rounded-2xl border-2 border-dashed border-surface-container flex flex-col items-center gap-2 text-center">
              <span className="text-sm font-semibold text-on-surface">Currently unavailable</span>
              <span className="text-xs text-on-surface-variant">This product is not listed at any store right now.</span>
            </div>
          )}
          </div>

          {/* Mobile-only expand/collapse toggle — shown when there are more than 3 stores */}
          {visibleStores.length > 3 && (
            <button
              type="button"
              onClick={() => setMobileStoresExpanded(prev => !prev)}
              className="md:hidden w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors"
            >
              {mobileStoresExpanded
                ? <>{t('hideStores')} ▲</>
                : <>{t('viewAllStores', { count: visibleStores.length })} ▼</>}
            </button>
          )}

          {/* Delivery option — temporarily hidden (restore by uncommenting) */}
          {/*
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


          {/* Sticky Add-to-Cart bar — shown when consumer selects an online-delivery store */}
          {selectedOrderStoreId && (() => {
            const selectedStore = displayStores.find(s => s.id === selectedOrderStoreId);
            if (!selectedStore) return null;
            // Price for the SELECTED variant comes from the single shared resolver — the
            // store's OWN configured price for the chosen package size. Fall back to the
            // selected variant/base list price only if the resolver has none.
            const orderPrice = resolveStoreVariant(selectedStore).price ?? displayPrice;
            // Pass the store-resolved price as the variant price so the cart/discount
            // engine (unchanged) charges the correct per-size price, not the list price.
            const orderVariant = selectedVariant
              ? { ...selectedVariant, price: orderPrice }
              : undefined;
            return (
              <div className="sticky bottom-4 z-10 rounded-2xl border-2 border-green-500 bg-white shadow-xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-green-700 mb-0.5">Order from</p>
                  <p className="text-sm font-bold text-on-surface truncate">{selectedStore.name}</p>
                  <p className="text-xs text-on-surface-variant">₹{orderPrice.toLocaleString('en-IN')} · Online Delivery</p>
                </div>
                <button
                  onClick={() => {
                    onAddToCartFromStore?.(product, selectedStore, orderPrice, orderVariant);
                    setSelectedOrderStoreId(null);
                  }}
                  className="shrink-0 h-11 px-5 bg-green-600 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-green-500/25 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 text-[11px]"
                >
                  <ICONS.AddToCart className="w-4 h-4" /> Add to Cart
                </button>
              </div>
            );
          })()}
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
                <span className="text-sm font-black">
                  {product.averageRating ? product.averageRating.toFixed(1) : "0.0"} ({product.totalReviews || 0} {t('reviewsLabel')})
                </span>
              </div>
            </HelperTooltip>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-on-surface tracking-tight leading-tight">{product.fullName || product.name}</h1>
        </div>

        {/* Price + quantity + CTA */}
        {(() => {
          // All values come from variantPricing — the lowest available SELLING price
          // for the CURRENTLY SELECTED variant, never the base product or merged data.
          const { currentPrice, mrp, discountPct, savings, hasOffer, isLowestNearby } = variantPricing;
          const showStrikethrough = mrp > currentPrice;

          // Add-to-Cart / Buy Now carry the SELECTED size at its best store-configured
          // price (mrp = lowest per-store original for this size). The existing cart +
          // discount engine then applies the store discount, matching the price shown.
          const cartVariant = selectedVariant
            ? { ...selectedVariant, price: mrp }
            : undefined;

          return (
        <div className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pt-3 border-t ${hasOffer ? 'border-green-100' : 'border-surface-container'}`}>
          <HelperTooltip side="top" textKey="marketPriceInfo">
            <div className="flex flex-col gap-1.5 cursor-help">
              {hasOffer ? (
                /* ── Offer price block ── */
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold text-green-700 tracking-tight">₹{currentPrice.toLocaleString('en-IN')}</span>
                    <span className="text-lg text-outline line-through">₹{mrp.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-1 text-sm font-black text-white shadow-sm shadow-green-600/30">
                      <Tag className="h-3.5 w-3.5 shrink-0" />
                      Save ₹{savings.toLocaleString('en-IN')} ({discountPct}% OFF)
                    </span>
                    {isLowestNearby && (
                      <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Lowest nearby</span>
                    )}
                  </div>
                </>
              ) : showStrikethrough ? (
                /* ── Lowest price (no discount) ── */
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-extrabold text-secondary tracking-tight">₹{currentPrice.toLocaleString('en-IN')}</span>
                  <div className="flex flex-col mb-1">
                    <span className="text-sm text-outline line-through">₹{mrp.toLocaleString('en-IN')}</span>
                    {isLowestNearby && (
                      <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Lowest nearby</span>
                    )}
                  </div>
                </div>
              ) : (
                /* ── Regular price ── */
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-extrabold text-secondary tracking-tight">₹{currentPrice.toLocaleString('en-IN')}</span>
                  {!selectedVariant && product.oldPrice && (
                    <span className="text-xl text-on-surface-variant line-through mb-1">₹{product.oldPrice}</span>
                  )}
                  {!selectedVariant && product.oldPrice && (
                    <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">{t('savePercent')}</span>
                  )}
                </div>
              )}
              {displayStock !== undefined && displayStock > 0 && displayStock <= 20 && (
                <span className="mb-1 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                  {displayStock} in stock
                </span>
              )}
            </div>
          </HelperTooltip>

          <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto flex-wrap">
            {product.sellMode === "offline_store_only" ? (
              <span className="inline-flex items-center gap-2 h-10 sm:h-12 px-5 sm:px-8 rounded-2xl bg-surface-container text-on-surface-variant font-black uppercase tracking-widest text-xs sm:text-sm">
                In-Store Only
              </span>
            ) : visibleStores.length === 0 ? (
              <span className="inline-flex items-center gap-2 h-10 sm:h-12 px-5 sm:px-8 rounded-2xl bg-surface-container text-on-surface-variant font-black uppercase tracking-widest text-xs sm:text-sm">
                Currently unavailable
              </span>
            ) : (
              <>
                <button
                  onClick={() => onAddToCart?.(product, cartVariant)}
                  disabled={displayStock === 0}
                  className="h-10 sm:h-12 px-4 sm:px-6 border-2 border-primary text-primary font-black uppercase tracking-widest rounded-2xl hover:bg-primary/5 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                >
                  <ICONS.AddToCart className="w-4 h-4 sm:w-5 sm:h-5" />
                  {displayStock === 0 ? "Out of Stock" : t('addToCart')}
                </button>
                {onBuyNow && displayStock !== 0 && (
                  <button
                    onClick={() => onBuyNow(product, cartVariant)}
                    className="h-10 sm:h-12 px-5 sm:px-8 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                  >
                    Buy Now
                  </button>
                )}
              </>
            )}
          </div>
        </div>
          );
        })()}

        {/* Product description — moved below the pricing & action section */}
        {product.description && (
          <div className="pt-4 border-t border-surface-container">
            <p className={`text-on-surface-variant leading-relaxed text-sm ${descExpanded ? "" : "line-clamp-3"}`}>
              {product.description} {t('productDescSuffix')}
            </p>
            {product.description.length > 120 && (
              <button
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1 text-xs font-semibold text-primary hover:underline focus:outline-none"
              >
                {descExpanded ? "Show Less" : "Read More"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Product Info — renders from categoryInfo (new) or legacy flat fields */}
      {(() => {
        // Resolve the effective category info using the backward-compat helper
        const rawData = product as unknown as Record<string, unknown>;
        const ci = product.categoryInfo && Object.keys(product.categoryInfo).length > 0
          ? product.categoryInfo
          : effectiveCategoryInfo(rawData);

        if (!ci || Object.keys(ci).length === 0) return null;

        // Find the field schema for this product's category
        const cat = product.category?.trim() || "";
        const activeCat: ProductCategory = isStandardCategory(cat) ? cat : "Other";
        const fields = CATEGORY_FIELDS[activeCat];
        // Only show fields that have data
        const filledFields = fields.filter(({ key }) => {
          const v = ci[key];
          return Array.isArray(v) ? v.length > 0 : !!(v as string)?.trim();
        });

        if (!filledFields.length) return null;

        return (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-2xl font-bold text-on-surface">{t('productInsightsTitle')}</h2>
              <HelperIcon size="sm" variant="ghost" side="right" textKey="productInsights" ariaLabel="Product insights help" />
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-surface-container overflow-hidden">
              <div className="px-6 pt-5 pb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{activeCat} Information</span>
              </div>
              <div className="divide-y divide-surface-container">
                {filledFields.map(({ key, label, type }) => {
                  const val = ci[key];
                  const isChips = CHIPS_FIELDS.has(key) || Array.isArray(val);
                  const isEmpty = Array.isArray(val) ? val.length === 0 : !(val as string)?.trim();
                  if (isEmpty) return null;
                  return (
                    <div key={key} className="px-6 py-4">
                      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">{label}</p>
                      {isChips && Array.isArray(val) ? (
                        <div className="flex flex-wrap gap-2">
                          {val.map((chip, i) => (
                            <span key={i} className="bg-surface-container px-3 py-1 rounded-full text-xs font-semibold text-on-surface-variant border border-surface-container-highest">
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : type === "textarea" ? (
                        <p className="text-sm text-on-surface leading-relaxed">{val as string}</p>
                      ) : (
                        <p className="text-sm font-bold text-on-surface">{val as string}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/*
        Similar Products — same-category items from the products already loaded into the
        view. No extra fetch: reuses the in-memory `products` prop the marketplace already
        provides. Empty-state copy is shown when no other products exist in this category.
      */}
      <SimilarProductsSection
        products={products}
        currentProduct={product}
        onProductClick={onProductClick}
        onCategoryClick={onCategoryClick}
      />

      {/* Product Reviews */}
      {product.id && (
        <ReviewSection targetId={product.id} targetType="product" />
      )}

      {/* Seller Portfolio — legacy fallback (products already in memory, no extra reads) */}
      {sellerProducts.length > 0 && !product.retailerPhone && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-on-surface">{t('moreFrom')} {product.store}</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">{t('otherProductsBy')}</p>
            </div>
            {onViewSellerAll && (
              <button
                onClick={() => onViewSellerAll(product.store || "")}
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

      {/* Manufacturer brand section — Firestore-backed, replaces legacy MANUFACTURERS constant */}
      {product.manufacturerId && (
        <ManufacturerBrandSection
          manufacturerId={product.manufacturerId}
          currentProductId={product.id}
          onProductClick={onProductClick}
          onViewBrand={onViewBrand}
        />
      )}

      {/* Retailer Profile Section — phone-keyed, efficient subcollection fetch */}
      {product.retailerPhone && (
        <RetailerProfileSection
          retailerPhone={product.retailerPhone}
          currentProductId={product.id}
          onProductClick={onProductClick}
        />
      )}
    </div>
  );
}
