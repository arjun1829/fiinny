"use client";

import { useEffect, useState } from "react";
import { MarketplaceProduct } from "../../types/product";
import { StoreWithDistance } from "../utils/nearby";
import { fetchStoreOnlineDelivery } from "../firebase";
import { ICONS } from "../constants";

interface StorePickerModalProps {
  product: MarketplaceProduct;
  storesWithDistance: StoreWithDistance[];
  onConfirm: (product: MarketplaceProduct, store: StoreWithDistance) => void;
  onClose: () => void;
}

function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km === Infinity) return "Nearby";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function StorePickerModal({ product, storesWithDistance, onConfirm, onClose }: StorePickerModalProps) {
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // Filter stores that carry this product (same logic as ProductDetailView)
  const availableStores = storesWithDistance.filter((store) => {
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
    return (
      (rid && (store.id === rid || storeUserId === rid || storeRetailerId === rid)) ||
      (rPhone && (store.id === rPhone || storePhone === rPhone)) ||
      store.id === product.manufacturerId ||
      store.name === product.store ||
      (store as any).shopName === product.store
    );
  });

  useEffect(() => {
    if (availableStores.length === 0) { setLoading(false); return; }
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
  }, [product.id]);

  const onlineStores = availableStores.filter((s) => onlineMap[(s as any).phone]);
  const offlineStores = availableStores.filter((s) => !onlineMap[(s as any).phone]);

  const selectedStore = availableStores.find((s) => s.id === selected);

  const handleConfirm = () => {
    if (!selectedStore) return;
    onConfirm(product, selectedStore);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-surface-container shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {product.image && (
              <img src={product.image} alt={product.name} className="w-12 h-12 rounded-xl object-cover shrink-0 bg-surface-container-low" />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-0.5">Select store to order from</p>
              <h3 className="font-black text-on-surface text-base leading-tight truncate">{product.name}</h3>
              <p className="text-sm font-bold text-secondary">₹{product.price.toLocaleString("en-IN")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableStores.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant">
              <ICONS.Location className="w-10 h-10 mx-auto mb-3 text-outline-variant" />
              <p className="font-bold text-on-surface">No stores found for this product</p>
              <p className="text-sm mt-1">This product is not available at any nearby store right now.</p>
            </div>
          ) : onlineStores.length === 0 ? (
            <>
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <ICONS.Delivery className="w-6 h-6 text-amber-600" />
                </div>
                <p className="font-bold text-on-surface">Online delivery not available</p>
                <p className="text-sm text-on-surface-variant mt-1 max-w-xs mx-auto">
                  None of the stores carrying this product currently offer online delivery. You can visit or call these stores directly.
                </p>
              </div>

              {/* Show offline stores so user can call/visit */}
              {offlineStores.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 px-1">
                    Available at ({offlineStores.length} {offlineStores.length === 1 ? 'store' : 'stores'})
                  </p>
                  {offlineStores.map((store) => {
                    const phone = (store as any).phone as string | undefined;
                    const availability = product.availability?.find(
                      (a) => a.storeId === store.id || (phone && (a.storePhone === phone || a.storeId === phone))
                    );
                    return (
                      <div
                        key={store.id}
                        className="rounded-2xl border border-surface-container bg-white p-4 mb-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="font-black text-on-surface text-sm block mb-1">{store.name}</span>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant font-semibold">
                              <span className="flex items-center gap-1">
                                <ICONS.Location className="w-3 h-3" />
                                {(store as any).distanceLabel || formatDistance((store as any).distanceKm)}
                              </span>
                              {availability?.sellingPrice && availability.sellingPrice > 0 && (
                                <span className="font-black text-secondary">₹{availability.sellingPrice.toLocaleString("en-IN")}</span>
                              )}
                              {availability?.stockLevel && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                  availability.stockLevel === "In Stock"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-orange-100 text-orange-700"
                                }`}>
                                  {availability.stockLevel}
                                </span>
                              )}
                            </div>
                          </div>
                          {phone && (
                            <a
                              href={`tel:${phone}`}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
                            >
                              <ICONS.Phone className="w-3.5 h-3.5" /> Call
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Online delivery stores */}
              {onlineStores.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-green-700 mb-2 px-1">
                    Online Delivery Available ({onlineStores.length})
                  </p>
                  {onlineStores.map((store) => {
                    const phone = (store as any).phone as string | undefined;
                    const availability = product.availability?.find(
                      (a) => a.storeId === store.id || (phone && (a.storePhone === phone || a.storeId === phone))
                    );
                    const isSelected = selected === store.id;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => setSelected(isSelected ? null : store.id)}
                        className={`w-full text-left rounded-2xl border-2 p-4 mb-2 transition-all ${
                          isSelected
                            ? "border-green-500 bg-green-50 shadow-sm"
                            : "border-surface-container hover:border-green-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? "border-green-500 bg-green-500" : "border-outline-variant"
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-black text-on-surface text-sm">{store.name}</span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border border-green-200">
                                <ICONS.Delivery className="w-2.5 h-2.5" /> Online
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant font-semibold">
                              <span className="flex items-center gap-1">
                                <ICONS.Location className="w-3 h-3" />
                                {(store as any).distanceLabel || formatDistance((store as any).distanceKm)}
                              </span>
                              {availability?.sellingPrice && availability.sellingPrice > 0 && (
                                <span className="font-black text-secondary">₹{availability.sellingPrice.toLocaleString("en-IN")}</span>
                              )}
                              {availability?.stockLevel && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                  availability.stockLevel === "In Stock"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-orange-100 text-orange-700"
                                }`}>
                                  {availability.stockLevel}
                                </span>
                              )}
                              {phone && (
                                <a
                                  href={`tel:${phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  <ICONS.Phone className="w-3 h-3" /> Call
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Offline-only stores */}
              {offlineStores.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 px-1">
                    In-Store Only ({offlineStores.length})
                  </p>
                  {offlineStores.map((store) => {
                    const phone = (store as any).phone as string | undefined;
                    const availability = product.availability?.find(
                      (a) => a.storeId === store.id || (phone && (a.storePhone === phone || a.storeId === phone))
                    );
                    return (
                      <div
                        key={store.id}
                        className="rounded-2xl border border-surface-container bg-surface-container-low/50 p-4 mb-2 opacity-70"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-outline-variant/50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-black text-on-surface text-sm">{store.name}</span>
                              <span className="text-[9px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant/30">
                                Visit Store
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant font-semibold">
                              <span className="flex items-center gap-1">
                                <ICONS.Location className="w-3 h-3" />
                                {(store as any).distanceLabel || formatDistance((store as any).distanceKm)}
                              </span>
                              {availability?.sellingPrice && availability.sellingPrice > 0 && (
                                <span className="font-black text-secondary">₹{availability.sellingPrice.toLocaleString("en-IN")}</span>
                              )}
                              {availability?.stockLevel && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                  availability.stockLevel === "In Stock"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-orange-100 text-orange-700"
                                }`}>
                                  {availability.stockLevel}
                                </span>
                              )}
                              {phone && (
                                <a
                                  href={`tel:${phone}`}
                                  className="flex items-center gap-1 text-primary hover:underline"
                                >
                                  <ICONS.Phone className="w-3 h-3" /> Call
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {onlineStores.length === 0 && (
                    <p className="text-xs text-center text-on-surface-variant mt-2 px-2">
                      None of these stores currently offer online delivery for this product.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && onlineStores.length > 0 && (
          <div className="p-4 border-t border-surface-container shrink-0">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selected}
              className="w-full h-12 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              <ICONS.AddToCart className="w-5 h-5" />
              {selected ? `Add to Cart · ${selectedStore?.name}` : "Select a store above"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
