import { MarketplaceProduct } from "../../types/product";
import { ICONS, PRODUCTS, STORES } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { StoreWithDistance } from '../utils/nearby';
import { db, trackDirectionRequest, trackProductClick, trackStoreCall, fetchUserProfileByPhone, fetchStoreOnlineDelivery } from '../firebase';
import { HelperIcon, HelperTooltip } from '../../components/helpers';
import { useI18n } from '../i18n/I18nContext';
import {
  fetchRetailerPublicProfile,
  fetchRetailerProductSummaries,
  type RetailerPublicProfile,
  type RetailerProductSummary,
} from '../dashboard/_lib/retailer-profile-firestore';

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
  storesWithDistance?: StoreWithDistance[];
  onAddToCart?: (product: MarketplaceProduct) => void;
  onAddToCartFromStore?: (product: MarketplaceProduct, store: any) => void;
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
      {/* Brand header */}
      <div className="flex items-center justify-between gap-4 p-6 bg-[#0d2b09]">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/80 mb-1">Manufactured by</p>
          <h2 className="text-xl font-bold text-white leading-tight truncate">{brandName}</h2>
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
            className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95"
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
  storesWithDistance = [],
  onAddToCart,
  onAddToCartFromStore,
}: ProductDetailViewProps) {
  const { t } = useI18n();
  const product = products.find(p => p.id === productId) || products[0];
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [storeOnlineMap, setStoreOnlineMap] = useState<Record<string, boolean>>({});
  const [selectedOrderStoreId, setSelectedOrderStoreId] = useState<string | null>(null);

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

  const displayStores = availableStores.length > 0
    ? availableStores
    : fallbackStore ? [fallbackStore] : [];

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
            className="rounded-3xl overflow-hidden bg-[#f7f5f0] shadow-ambient border border-surface-container relative flex items-center justify-center"
            style={{ minHeight: '280px', maxHeight: '480px', height: 'auto' }}
          >
            <img src={activeImage} className="w-full object-contain" style={{ maxHeight: '480px' }} alt={product.name} />
            <HelperTooltip side="bottom" textKey="productQualityBadge">
              <div className="absolute top-6 left-6 bg-primary-container text-on-primary-container px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-md cursor-help">
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

          {displayStores.length > 0 ? displayStores.map(store => {
            const storePhone = (store as any).phone as string | undefined;
            const availability = product.availability?.find(
              (a) =>
                a.storeId === store.id ||
                (a.storePhone && storePhone && a.storePhone === storePhone) ||
                (a.storePhone && a.storePhone === store.id),
            );
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
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
                          <ICONS.Location className="w-3 h-3" />{(store as any).distanceLabel || store.distance || t('nearby')}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${(store.status || '').includes('Open') ? 'bg-green-500' : 'bg-red-400'}`} />
                        <span className="text-[10px] font-bold text-on-surface-variant">{(store.status || t('active')).split('•')[0].trim()}</span>
                        {storeOnlineMap[(store as any).phone] && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border border-green-200">
                            <ICONS.Delivery className="w-2.5 h-2.5" /> Online Delivery
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {availability?.sellingPrice && availability.sellingPrice > 0 && (
                        <span className="text-sm font-bold text-secondary">
                          ₹{availability.sellingPrice.toLocaleString('en-IN')}
                        </span>
                      )}
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
                  {onAddToCartFromStore && storeOnlineMap[(store as any).phone] && (
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
                  )}
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

          {/* Sticky Add-to-Cart bar — shown when consumer selects an online-delivery store */}
          {selectedOrderStoreId && (() => {
            const selectedStore = displayStores.find(s => s.id === selectedOrderStoreId);
            if (!selectedStore) return null;
            const selectedStorePhone = (selectedStore as any).phone as string | undefined;
            const selectedAvailability = product.availability?.find(
              (a) => a.storeId === selectedStore.id || (selectedStorePhone && (a.storePhone === selectedStorePhone || a.storeId === selectedStorePhone))
            );
            const displayPrice = selectedAvailability?.sellingPrice && selectedAvailability.sellingPrice > 0
              ? selectedAvailability.sellingPrice
              : product.price;
            return (
              <div className="sticky bottom-4 z-10 rounded-2xl border-2 border-green-500 bg-white shadow-xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-green-700 mb-0.5">Order from</p>
                  <p className="text-sm font-bold text-on-surface truncate">{selectedStore.name}</p>
                  <p className="text-xs text-on-surface-variant">₹{displayPrice.toLocaleString('en-IN')} · Online Delivery</p>
                </div>
                <button
                  onClick={() => {
                    onAddToCartFromStore?.(product, selectedStore);
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
              {product.lowestPrice && product.lowestPrice < product.price ? (
                <>
                  <span className="text-4xl font-extrabold text-secondary tracking-tight">₹{product.lowestPrice.toLocaleString('en-IN')}</span>
                  <div className="flex flex-col mb-1">
                    <span className="text-sm text-outline line-through">₹{product.price.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Lowest nearby</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-4xl font-extrabold text-secondary tracking-tight">₹{product.price}</span>
                  {product.oldPrice && (
                    <span className="text-xl text-on-surface-variant line-through mb-1">₹{product.oldPrice}</span>
                  )}
                </>
              )}
              {product.oldPrice && (
                <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">{t('savePercent')}</span>
              )}
            </div>
          </HelperTooltip>

          <div className="flex items-center gap-4 sm:ml-auto">
            <button
              onClick={() => onAddToCart?.(product)}
              className="h-12 px-8 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
            >
              <ICONS.AddToCart className="w-5 h-5" /> {t('addToCart')}
            </button>
          </div>
        </div>
      </div>

      {/* Product Insights */}
      {(() => {
        const hasComposition = !!(product.nitrogen || product.phosphorus || product.potassium);
        const hasApplication = !!(product.applicationDesc || product.dosage);
        const hasCrops = !!(product.bestForCrops && product.bestForCrops.length > 0);
        const hasInsights = hasComposition || hasApplication || hasCrops;
        
        if (!hasInsights) return null;

        const cardCount = [hasComposition, hasApplication, hasCrops].filter(Boolean).length;
        const gridColsClass = cardCount === 3
          ? "md:grid-cols-3"
          : cardCount === 2
            ? "md:grid-cols-2 max-w-4xl"
            : "md:grid-cols-1 max-w-md";

        return (
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
            <div className={`grid grid-cols-1 ${gridColsClass} gap-6`}>
              {hasComposition && (
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
                    { label: t('nitrogenN'), val: product.nitrogen },
                    { label: t('phosphorusP'), val: product.phosphorus },
                    { label: t('potassiumK'), val: product.potassium }
                  ].filter(row => !!row.val).map((row, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-surface-container-low last:border-0">
                      <span className="text-on-surface text-sm opacity-60 font-semibold">{row.label}</span>
                      <span className="text-on-surface font-black">{row.val}</span>
                    </div>
                  ))}
                </div>
              )}

              {hasApplication && (
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
                  {product.applicationDesc && (
                    <p className="text-on-surface-variant font-medium text-sm">{product.applicationDesc}</p>
                  )}
                  {product.dosage && (
                    <HelperTooltip side="top" textKey="productDosage">
                      <div className="mt-auto bg-primary/5 rounded-2xl p-4 border border-primary/10 cursor-help">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1">{t('recommendedDosage')}</span>
                        <span className="text-2xl font-bold text-on-surface">{product.dosage}</span>
                      </div>
                    </HelperTooltip>
                  )}
                </div>
              )}

              {hasCrops && (
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
                    {product.bestForCrops?.map((crop, i) => (
                      <span key={i} className="bg-surface-container px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant border border-surface-container-highest">
                        {crop}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })()}

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
