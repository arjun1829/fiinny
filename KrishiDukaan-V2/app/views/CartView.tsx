"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CartItem, SellerType } from "../../types/order";
import type { MarketplaceProduct } from "../../types/product";
import type { StoreWithDistance } from "../utils/nearby";
import { fetchStoreOnlineDelivery } from "../firebase";
import { ICONS } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { HelperIcon } from "../../components/helpers";
import { ShieldCheck, CreditCard, Lock } from "lucide-react";

type AddressField = "customerName" | "customerPhone" | "addressArea" | "addressCity" | "addressDistrict" | "addressState" | "addressPincode";

type CartViewProps = {
  items: CartItem[];
  isLoggedIn: boolean;
  isCustomer: boolean;
  customerName: string;
  customerPhone: string;
  addressArea: string;
  addressCity: string;
  addressDistrict: string;
  addressState: string;
  addressPincode: string;
  onCustomerFieldChange: (field: AddressField, value: string) => void;
  onQtyChange: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onAssignStore: (productId: string, sellerId: string, sellerType: SellerType, sellerName: string, storePrice?: number) => void;
  onCheckout: () => Promise<void>;
  onRazorpayCheckout?: (amount: number, saveAddress: boolean) => void;
  onSaveAddress?: (address: string) => Promise<void>;
  onGoLogin: () => void;
  onGoOrders?: () => void;
  loading: boolean;
  message: string | null;
  storesWithDistance: StoreWithDistance[];
  allProducts: MarketplaceProduct[];
  hasProfileAddress?: boolean;
  subtotal: number;
  mapsApiKey?: string;
};

function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km === Infinity) return "Nearby";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function useStoreAvailability(product: MarketplaceProduct | undefined, stores: StoreWithDistance[]) {
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const availableStores = stores.filter((store) => {
    if (!product) return false;
    const storePhone = (store as any).phone as string | undefined;
    const storeUserId = (store as any).userId as string | undefined;
    const storeRetailerId = (store as any).retailerId as string | undefined;

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

    const rid = product.retailerId;
    const rPhone = product.retailerPhone;
    const storeMfrId = (store as any).userId as string | undefined;
    const mfrPhone = product.manufacturerPhone;
    return (
      (rid && (store.id === rid || storeUserId === rid || storeRetailerId === rid)) ||
      (rPhone && (store.id === rPhone || storePhone === rPhone)) ||
      // Match manufacturer by UID (primary)
      (product.manufacturerId && storeMfrId && storeMfrId === product.manufacturerId) ||
      // Match manufacturer by phone (phone-keyed schema)
      (mfrPhone && (store.id === mfrPhone || storePhone === mfrPhone)) ||
      // Legacy: store.id is phone, product.manufacturerId was set to phone
      store.id === product.manufacturerId ||
      store.name === product.store ||
      (store as any).shopName === product.store
    );
  });

  useEffect(() => {
    if (!product || availableStores.length === 0) { setLoading(false); return; }
    const phones = availableStores
      .map((s) => (s as any).phone as string | undefined)
      .filter((p): p is string => !!p);
    if (phones.length === 0) { setLoading(false); return; }

    Promise.all(phones.map(async (phone) => {
      const isOnline = await fetchStoreOnlineDelivery(phone);
      return [phone, isOnline] as [string, boolean];
    })).then((results) => {
      setOnlineMap(Object.fromEntries(results));
    }).finally(() => setLoading(false));
  }, [product?.id]);

  const onlineStores = availableStores.filter((s) => onlineMap[(s as any).phone]);
  const offlineStores = availableStores.filter((s) => !onlineMap[(s as any).phone]);

  return { loading, onlineStores, offlineStores, availableStores };
}

function OfflineStoresModal({
  product,
  stores,
  onClose,
  t,
}: {
  product: MarketplaceProduct;
  stores: StoreWithDistance[];
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-surface-container shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {product.image && (
                <img src={product.image} alt={product.name} className="w-12 h-12 rounded-xl object-cover shrink-0 bg-surface-container-low" />
              )}
              <div className="min-w-0">
                <h3 className="font-black text-on-surface text-base leading-tight truncate">{product.name}</h3>
                <p className="text-sm font-bold text-secondary">₹{product.price.toLocaleString("en-IN")}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-5 pt-5 pb-3">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-center">
            <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
              <ICONS.Delivery className="w-5 h-5 text-amber-600" />
            </div>
            <p className="font-bold text-on-surface text-sm">{t('cartOnlineUnavailableTitle')}</p>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              {t('cartOnlineUnavailableDesc')}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {stores.length > 0 ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                {t('cartAvailableAtStores', { count: stores.length, storeWord: stores.length === 1 ? t('cartStoreSingular') : t('cartStorePlural') })}
              </p>
              {stores.map((store) => {
                const phone = (store as any).phone as string | undefined;
                const availability = product.availability?.find(
                  (a) => a.storeId === store.id || (phone && (a.storePhone === phone || a.storeId === phone))
                );
                return (
                  <div key={store.id} className="rounded-2xl border border-surface-container bg-white p-4 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                        <ICONS.Location className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-on-surface text-sm truncate">{store.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-on-surface-variant font-medium flex-wrap">
                          <span>{(store as any).distanceLabel || formatDistance((store as any).distanceKm)}</span>
                          {availability?.sellingPrice && availability.sellingPrice > 0 && (
                            <span className="font-bold text-secondary">₹{availability.sellingPrice.toLocaleString("en-IN")}</span>
                          )}
                          {availability?.stockLevel && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                              availability.stockLevel === "In Stock" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                            }`}>{availability.stockLevel}</span>
                          )}
                        </div>
                      </div>
                      {phone && (
                        <a href={`tel:${phone}`} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors">
                          <ICONS.Phone className="w-4 h-4" /> {t('cartCall')}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="text-center py-6 text-on-surface-variant">
              <p className="text-sm font-medium">{t('cartNoNearbyStores')}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-surface-container shrink-0">
          <button type="button" onClick={onClose} className="w-full h-11 border border-outline-variant text-on-surface font-bold rounded-2xl hover:bg-surface-container transition-colors text-sm">
            {t('cartClose')}
          </button>
        </div>
      </div>
    </div>
  );
}

function StorePickerInline({
  product,
  stores,
  onSelect,
  currentSellerId,
  t,
}: {
  product: MarketplaceProduct;
  stores: StoreWithDistance[];
  onSelect: (sellerId: string, sellerType: SellerType, sellerName: string, storePrice?: number) => void;
  currentSellerId?: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { loading, onlineStores, offlineStores } = useStoreAvailability(product, stores);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-on-surface-variant">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        {t('cartCheckingAvailability')}
      </div>
    );
  }

  if (onlineStores.length === 0) {
    return (
      <>
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <ICONS.Delivery className="w-3 h-3" /> {t('cartNotAvailableOnline')}
          </span>
          <button type="button" onClick={() => setShowOfflineModal(true)} className="text-xs font-bold text-primary hover:underline">
            {t('cartViewNearbyStores')}
          </button>
        </div>
        {showOfflineModal && (
          <OfflineStoresModal product={product} stores={offlineStores} onClose={() => setShowOfflineModal(false)} t={t} />
        )}
      </>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
        {currentSellerId ? t('cartChangeStoreLabel') : t('cartSelectStoreForDelivery')}
      </p>
      <div className="flex flex-col gap-1.5">
        {onlineStores.map((store) => {
          const phone = (store as any).phone as string | undefined;
          const sellerId = (store as any).retailerId || (store as any).userId || store.id || "";
          const sellerType: SellerType = (store as any).retailerId ? "retailer" : "manufacturer";
          const isCurrent = currentSellerId === sellerId;
          const availability = product.availability?.find(
            (a) => a.storeId === store.id || (phone && (a.storePhone === phone || a.storeId === phone))
          );
          const storePrice = availability?.sellingPrice && availability.sellingPrice > 0 ? availability.sellingPrice : undefined;

          const displayPrice = storePrice ?? product.price;
          return (
            <button
              key={store.id}
              type="button"
              onClick={() => !isCurrent && onSelect(sellerId, sellerType, store.name || "Store", displayPrice)}
              disabled={isCurrent}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                isCurrent
                  ? "border-green-400 bg-green-50 cursor-default"
                  : "border-surface-container hover:border-green-300 bg-white hover:bg-green-50/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-bold text-on-surface block truncate">{store.name}</span>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-on-surface-variant font-medium flex-wrap">
                    <span className="flex items-center gap-0.5">
                      <ICONS.Location className="w-3 h-3" />
                      {(store as any).distanceLabel || formatDistance((store as any).distanceKm)}
                    </span>
                    <span className="font-bold text-secondary">₹{displayPrice.toLocaleString("en-IN")}</span>
                    <span className="inline-flex items-center gap-0.5 text-green-700">
                      <ICONS.Delivery className="w-3 h-3" /> {t('cartOnline')}
                    </span>
                  </div>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-lg">
                    {t('cartSelected')}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-bold text-primary border border-primary/30 px-2 py-1 rounded-lg">
                    {t('cartSelect')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CartItemCard({
  item,
  product,
  stores,
  onQtyChange,
  onRemove,
  onAssignStore,
  isPending,
  t,
}: {
  item: CartItem;
  product: MarketplaceProduct | undefined;
  stores: StoreWithDistance[];
  onQtyChange: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onAssignStore: (productId: string, sellerId: string, sellerType: SellerType, sellerName: string, storePrice?: number) => void;
  isPending: boolean;
  t: (key: string) => string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showPicker && pickerRef.current) {
      pickerRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [showPicker]);

  return (
    <div className={`rounded-2xl border bg-white p-4 mb-2 ${isPending ? "border-amber-200" : "border-green-200"}`}>
      <div className="flex gap-4">
        <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover border border-surface-container shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-on-surface truncate">{item.name}</p>

          {!isPending && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                <ICONS.Delivery className="w-3 h-3" />
                {item.sellerName || t('cartStoreSelected')}
              </span>
              <span className="text-sm font-bold text-secondary">₹{item.price.toLocaleString("en-IN")}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                {showPicker ? t('cartHide') : t('cartChangeStore')}
              </button>
            </div>
          )}

          {isPending && (
            <p className="text-xs text-on-surface-variant mt-0.5">₹{item.price.toFixed(2)}</p>
          )}

          <div className={`flex items-center gap-2 flex-wrap ${isPending ? "mt-2" : "mt-2.5"}`}>
            {isPending && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker); }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <ICONS.Delivery className="w-3.5 h-3.5" />
                {showPicker ? t('cartHideStores') : t('cartSelectStore')}
              </button>
            )}
            <div className="flex items-center gap-1">
              <button onClick={() => onQtyChange(item.productId, Math.max(1, item.qty - 1))} className={`${isPending ? "w-7 h-7 text-sm" : "w-8 h-8"} rounded-lg border border-outline-variant/40`}>-</button>
              <span className={`${isPending ? "w-6" : "w-8"} text-center font-bold text-sm`}>{item.qty}</span>
              <button onClick={() => onQtyChange(item.productId, item.qty + 1)} className={`${isPending ? "w-7 h-7 text-sm" : "w-8 h-8"} rounded-lg border border-outline-variant/40`}>+</button>
            </div>
            <button onClick={() => onRemove(item.productId)} className="text-xs font-bold text-primary ml-1">{t('removeBtn')}</button>
          </div>
        </div>
        <div className="font-black text-on-surface text-right shrink-0">
          ₹{(item.price * item.qty).toLocaleString("en-IN")}
        </div>
      </div>

      {showPicker && product && (
        <div ref={pickerRef}>
          <StorePickerInline
            product={product}
            stores={stores}
            t={t}
            currentSellerId={isPending ? undefined : item.sellerId}
            onSelect={(sellerId, sellerType, sellerName, storePrice) => {
              onAssignStore(item.productId, sellerId, sellerType, sellerName, storePrice);
              setShowPicker(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function CartView({
  items,
  isLoggedIn,
  isCustomer,
  customerName,
  customerPhone,
  addressArea,
  addressCity,
  addressDistrict,
  addressState,
  addressPincode,
  onCustomerFieldChange,
  onQtyChange,
  onRemove,
  onAssignStore,
  onCheckout,
  onRazorpayCheckout,
  onSaveAddress,
  onGoLogin,
  onGoOrders,
  loading,
  message,
  storesWithDistance,
  allProducts,
  hasProfileAddress,
  subtotal,
  mapsApiKey,
}: CartViewProps) {
  const { t } = useI18n();
  const [saveAddress, setSaveAddress] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteListenerRef = useRef<any>(null);

  const readyItems = items.filter((i) => i.sellMode === "online_delivery" && i.sellerId);
  const pendingItems = items.filter((i) => i.sellMode === "pending" || !i.sellerId);
  const canCheckout = readyItems.length > 0;

  // Address parsing — same logic as Dashboard → Profile Edit (extractAddressFields),
  // extended to also fill the cart's Area / District fields. Maps a Google place /
  // geocoder result onto the existing Delivery Address inputs.
  const applyPlaceToFields = useCallback((place: {
    formatted_address?: string;
    address_components?: { long_name: string; short_name: string; types: string[] }[];
  }) => {
    const parts = place?.address_components || [];
    const pick = (type: string) =>
      parts.find((p) => p.types?.includes(type) && p.long_name)?.long_name || "";

    // City — same priority order as the Dashboard Profile parser.
    let city = "";
    for (const want of ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2", "neighborhood"]) {
      const v = pick(want);
      if (v) { city = v; break; }
    }
    const district = pick("administrative_area_level_2") || pick("administrative_area_level_3");
    const state = pick("administrative_area_level_1");
    const pincode = pick("postal_code");

    // Area / Locality — prefer the most PRECISE part so the delivery address is
    // exact (street-level), not just the neighborhood. Build "street number +
    // route", fall back to premise/sublocality, then the formatted address's
    // leading segments (everything before the city), then neighborhood.
    const streetNumber = pick("street_number");
    const route = pick("route");
    const premise = pick("premise") || pick("subpremise");
    const sublocality = pick("sublocality_level_1") || pick("sublocality") || pick("neighborhood");

    let areaValue = [streetNumber, route].filter(Boolean).join(" ").trim();
    if (!areaValue && premise) areaValue = premise;
    if (!areaValue && place.formatted_address) {
      // Take the formatted address up to (but excluding) the city to keep precise
      // street/locality detail.
      const fa = place.formatted_address;
      const cutAt = city ? fa.indexOf(city) : -1;
      areaValue = (cutAt > 0 ? fa.slice(0, cutAt) : fa.split(",")[0]).replace(/,\s*$/, "").trim();
    }
    if (!areaValue) areaValue = sublocality;

    if (areaValue) onCustomerFieldChange("addressArea", areaValue);
    if (city) onCustomerFieldChange("addressCity", city);
    if (district) onCustomerFieldChange("addressDistrict", district);
    if (state) onCustomerFieldChange("addressState", state);
    if (pincode) onCustomerFieldChange("addressPincode", pincode);
  }, [onCustomerFieldChange]);

  // Use Current Location — fetch a fresh GPS fix, then reverse-geocode via the
  // app's same-origin /api/geocode/reverse route. That route runs the Google
  // Geocoding call SERVER-SIDE (no browser referer restriction) with an OSM
  // fallback, so it returns structured address components reliably even when the
  // in-browser Google JS Geocoder is blocked. Fills the existing fields directly.
  const ADDRESS_ERROR = "Unable to fetch current location. Please enter address manually.";

  const handleUseLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError(ADDRESS_ERROR);
      return;
    }
    setLocating(true);

    const reverseGeocode = async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        const c = data?.components;
        if (c && (c.area || c.city || c.district || c.state || c.pincode)) {
          if (c.area) onCustomerFieldChange("addressArea", c.area);
          if (c.city) onCustomerFieldChange("addressCity", c.city);
          if (c.district) onCustomerFieldChange("addressDistrict", c.district);
          if (c.state) onCustomerFieldChange("addressState", c.state);
          if (c.pincode) onCustomerFieldChange("addressPincode", c.pincode);
        } else if (typeof data?.formatted_address === "string" && data.formatted_address.trim()) {
          // Last resort: drop the readable address into Area so it isn't empty.
          onCustomerFieldChange("addressArea", data.formatted_address.trim());
        } else {
          setLocationError(ADDRESS_ERROR);
        }
      } catch {
        setLocationError(ADDRESS_ERROR);
      } finally {
        setLocating(false);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => void reverseGeocode(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        // High-accuracy can time out on first request — retry once at low accuracy.
        if (err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            (pos) => void reverseGeocode(pos.coords.latitude, pos.coords.longitude),
            () => { setLocating(false); setLocationError(ADDRESS_ERROR); },
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 }
          );
        } else {
          setLocating(false);
          setLocationError(ADDRESS_ERROR);
        }
      },
      // maximumAge: 0 → force a fresh, accurate GPS fix (no stale cached position).
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Attach Google Maps Places Autocomplete to the Area / Locality input — the
  // same engine used in Dashboard → Profile Edit. Loads the Maps JS (places lib)
  // if not already present, then binds the input.
  useEffect(() => {
    const apiKey = mapsApiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !addressInputRef.current) return;

    let cancelled = false;

    const setupAutocomplete = () => {
      if (cancelled || !addressInputRef.current || !(window as any).google?.maps?.places) return;
      if (autocompleteListenerRef.current && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      const ac = new (window as any).google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      autocompleteListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (place) applyPlaceToFields(place);
      });
    };

    const attachWhenReady = () => setTimeout(setupAutocomplete, 50);

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if ((window as any).google?.maps?.places) {
      attachWhenReady();
    } else if (existing) {
      if (existing.dataset.loaded === "true") attachWhenReady();
      else existing.addEventListener("load", attachWhenReady, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true; script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; attachWhenReady(); };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (autocompleteListenerRef.current && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.removeListener(autocompleteListenerRef.current);
      }
      autocompleteListenerRef.current = null;
    };
  }, [mapsApiKey, applyPlaceToFields]);

  return (
    <div className="px-4 md:px-10 max-w-5xl mx-auto w-full py-8">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold text-on-surface">{t('cartTitle')}</h1>
        {onGoOrders && (
          <button
            type="button"
            onClick={onGoOrders}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/40 bg-white text-sm font-bold text-on-surface hover:bg-surface-container transition-colors"
          >
            <ICONS.Delivery className="w-4 h-4 text-primary" />
            {t('myOrders')}
          </button>
        )}
      </div>
      <p className="text-sm text-on-surface-variant mb-6 inline-flex items-center gap-1.5">
        {t('cartSubtitle')}
        <HelperIcon size="xs" variant="ghost" side="right" textKey="cartSellerGrouping" ariaLabel={`${t('cartTitle')} help`} />
      </p>

      {!items.length ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
          {t('cartEmpty')}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Ready to order items */}
          {readyItems.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-green-700 mb-2 px-1">
                {t('cartReadyToOrder')} ({readyItems.length})
              </p>
              {readyItems.map((item) => (
                <CartItemCard
                  key={item.productId}
                  item={item}
                  product={allProducts.find((p) => p.id === item.productId)}
                  stores={storesWithDistance}
                  onQtyChange={onQtyChange}
                  onRemove={onRemove}
                  onAssignStore={onAssignStore}
                  isPending={false}
                  t={t}
                />
              ))}
            </div>
          )}

          {/* Pending items — need store selection */}
          {pendingItems.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2 px-1">
                {t('cartSelectStore')} ({pendingItems.length})
              </p>
              {pendingItems.map((item) => (
                <CartItemCard
                  key={item.productId}
                  item={item}
                  product={allProducts.find((p) => p.id === item.productId)}
                  stores={storesWithDistance}
                  onQtyChange={onQtyChange}
                  onRemove={onRemove}
                  onAssignStore={onAssignStore}
                  isPending={true}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checkout section */}
      <div className="mt-8 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
        {/* Subtotal — only ready items */}
        <div className="flex items-center justify-between text-lg font-bold">
          <span className="inline-flex items-center gap-1.5">
            {t('cartSubtotal')}
            {readyItems.length > 0 && readyItems.length < items.length && (
              <span className="text-xs font-medium text-on-surface-variant">({t('cartItemsOf', { ready: readyItems.length, total: items.length })})</span>
            )}
            <HelperIcon size="xs" variant="ghost" side="right" textKey="cartSubtotal" ariaLabel={`${t('cartSubtotal')} help`} />
          </span>
          <span>₹{subtotal.toLocaleString("en-IN")}</span>
        </div>

        {pendingItems.length > 0 && canCheckout && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-800">
              {t('cartPendingExcluded', { count: pendingItems.length })}
            </p>
          </div>
        )}

        {pendingItems.length > 0 && !canCheckout && (
          <p className="text-xs text-amber-700 font-semibold mt-2">
            {t('cartSelectAtLeastOne')}
          </p>
        )}

        {isLoggedIn && isCustomer ? (
          <div className="mt-5 grid gap-3">
            {/* Name */}
            <input
              value={customerName}
              onChange={(e) => onCustomerFieldChange("customerName", e.target.value)}
              placeholder={t('cartFullNamePlaceholder')}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm"
            />
            {/* Phone — auto-populated from profile */}
            <input
              value={customerPhone}
              onChange={(e) => onCustomerFieldChange("customerPhone", e.target.value)}
              placeholder={t('cartPhonePlaceholder')}
              type="tel"
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm"
            />
            {/* Address — structured fields */}
            <div className="rounded-xl border border-outline-variant/40 bg-white p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Delivery Address</span>
                <button
                  type="button"
                  onClick={handleUseLocation}
                  disabled={locating}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline disabled:opacity-60"
                >
                  {locating ? (
                    <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
                  ) : (
                    <ICONS.Location className="w-3 h-3" />
                  )}
                  {locating ? "Locating…" : "Use My Location"}
                </button>
              </div>
              {locationError && (
                <p className="text-[11px] font-semibold text-amber-700 -mt-0.5">{locationError}</p>
              )}
              <input
                ref={addressInputRef}
                value={addressArea}
                onChange={(e) => { onCustomerFieldChange("addressArea", e.target.value); setLocationError(null); }}
                placeholder="Area / Locality"
                autoComplete="off"
                className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-sm w-full"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={addressCity}
                  onChange={(e) => onCustomerFieldChange("addressCity", e.target.value)}
                  placeholder="City"
                  className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-sm"
                />
                <input
                  value={addressDistrict}
                  onChange={(e) => onCustomerFieldChange("addressDistrict", e.target.value)}
                  placeholder="District"
                  className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={addressState}
                  onChange={(e) => onCustomerFieldChange("addressState", e.target.value)}
                  placeholder="State"
                  className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-sm"
                />
                <input
                  value={addressPincode}
                  onChange={(e) => onCustomerFieldChange("addressPincode", e.target.value)}
                  placeholder="Pincode"
                  type="number"
                  maxLength={6}
                  className="rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-sm"
                />
              </div>
              
              {/* Save address checkbox */}
              {onSaveAddress && (addressArea.trim() || addressCity.trim() || addressDistrict.trim() || addressState.trim() || addressPincode.trim()) && (
                <label className="flex items-center gap-2 mt-2 px-1 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                  <span className="text-xs text-on-surface-variant group-hover:text-on-surface transition-colors">
                    Save as my default delivery address
                  </span>
                </label>
              )}
            </div>

            {/* Pay & Place Order */}
            <div className="flex flex-col gap-2">
              <button
                disabled={loading || !canCheckout}
                onClick={() => {
                  if (saveAddress && onSaveAddress) {
                    onSaveAddress(addressArea); // Trigger save via prop before checkout
                  }
                  void onCheckout();
                }}
                className="rounded-xl bg-gradient-to-r from-primary to-secondary text-white px-4 py-3.5 text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing Payment…
                  </>
                ) : canCheckout ? (
                  <><CreditCard className="w-4 h-4" /> Pay ₹{subtotal.toLocaleString("en-IN")} &amp; Place Order ({readyItems.length})</>
                ) : (
                  t('cartSelectStoresToOrder')
                )}
              </button>
              <div className="flex items-center justify-center gap-2 text-[11px] text-on-surface-variant/70">
                <Lock className="w-3 h-3" />
                <span>Secured by Razorpay · UPI · Cards · NetBanking</span>
              </div>
            </div>
          </div>
        ) : isLoggedIn && !isCustomer ? (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-800">
            Orders can only be placed from a customer account. Please log in with your customer account.
          </div>
        ) : (
          <button onClick={onGoLogin} className="mt-4 rounded-xl bg-primary text-white px-4 py-3 text-sm font-bold w-full">
            {t('cartLoginToCheckout')}
          </button>
        )}

        {message ? (
          <p className="mt-3 text-sm font-medium text-on-surface-variant">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
