"use client";

import { useEffect, useState } from "react";
import type { CartItem, SellerType } from "../../types/order";
import type { MarketplaceProduct } from "../../types/product";
import type { StoreWithDistance } from "../utils/nearby";
import { fetchStoreOnlineDelivery } from "../firebase";
import { ICONS } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { HelperIcon } from "../../components/helpers";

type CartViewProps = {
  items: CartItem[];
  isLoggedIn: boolean;
  isCustomer: boolean;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  onCustomerFieldChange: (field: "customerName" | "customerPhone" | "customerAddress", value: string) => void;
  onQtyChange: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onAssignStore: (productId: string, sellerId: string, sellerType: SellerType, sellerName: string, storePrice?: number) => void;
  onCheckout: () => Promise<void>;
  onGoLogin: () => void;
  loading: boolean;
  message: string | null;
  storesWithDistance: StoreWithDistance[];
  allProducts: MarketplaceProduct[];
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
    return (
      (rid && (store.id === rid || storeUserId === rid || storeRetailerId === rid)) ||
      (rPhone && (store.id === rPhone || storePhone === rPhone)) ||
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
}: {
  product: MarketplaceProduct;
  stores: StoreWithDistance[];
  onClose: () => void;
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
            <p className="font-bold text-on-surface text-sm">Online delivery is not available</p>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              This product is not available for online ordering right now. You can call or visit any of the stores below to purchase it directly.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {stores.length > 0 ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                Available at {stores.length} {stores.length === 1 ? 'store' : 'stores'} near you
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
                          <ICONS.Phone className="w-4 h-4" /> Call
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="text-center py-6 text-on-surface-variant">
              <p className="text-sm font-medium">No nearby stores carry this product right now.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-surface-container shrink-0">
          <button type="button" onClick={onClose} className="w-full h-11 border border-outline-variant text-on-surface font-bold rounded-2xl hover:bg-surface-container transition-colors text-sm">
            Close
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
}: {
  product: MarketplaceProduct;
  stores: StoreWithDistance[];
  onSelect: (sellerId: string, sellerType: SellerType, sellerName: string, storePrice?: number) => void;
  currentSellerId?: string;
}) {
  const { loading, onlineStores, offlineStores } = useStoreAvailability(product, stores);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-on-surface-variant">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Checking store availability...
      </div>
    );
  }

  if (onlineStores.length === 0) {
    return (
      <>
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <ICONS.Delivery className="w-3 h-3" /> Not available online
          </span>
          <button type="button" onClick={() => setShowOfflineModal(true)} className="text-xs font-bold text-primary hover:underline">
            View nearby stores
          </button>
        </div>
        {showOfflineModal && (
          <OfflineStoresModal product={product} stores={offlineStores} onClose={() => setShowOfflineModal(false)} />
        )}
      </>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
        {currentSellerId ? "Change store" : "Select store for delivery"}
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

          return (
            <button
              key={store.id}
              type="button"
              onClick={() => !isCurrent && onSelect(sellerId, sellerType, store.name || "Store", storePrice)}
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
                    {storePrice && (
                      <span className="font-bold text-secondary">₹{storePrice.toLocaleString("en-IN")}</span>
                    )}
                    <span className="inline-flex items-center gap-0.5 text-green-700">
                      <ICONS.Delivery className="w-3 h-3" /> Online
                    </span>
                  </div>
                </div>
                {isCurrent ? (
                  <span className="shrink-0 text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-lg">
                    Selected
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-bold text-primary border border-primary/30 px-2 py-1 rounded-lg">
                    Select
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

export default function CartView({
  items,
  isLoggedIn,
  isCustomer,
  customerName,
  customerPhone,
  customerAddress,
  onCustomerFieldChange,
  onQtyChange,
  onRemove,
  onAssignStore,
  onCheckout,
  onGoLogin,
  loading,
  message,
  storesWithDistance,
  allProducts,
}: CartViewProps) {
  const { t } = useI18n();
  const [expandedPicker, setExpandedPicker] = useState<string | null>(null);

  const readyItems = items.filter((i) => i.sellMode === "online_delivery" && i.sellerId);
  const pendingItems = items.filter((i) => i.sellMode === "pending" || !i.sellerId);
  const subtotal = readyItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const canCheckout = readyItems.length > 0;

  return (
    <div className="px-4 md:px-10 max-w-5xl mx-auto w-full py-8">
      <h1 className="text-3xl font-bold text-on-surface mb-2">{t('cartTitle')}</h1>
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
                Ready to Order ({readyItems.length})
              </p>
              {readyItems.map((item) => {
                const isExpanded = expandedPicker === `ready-${item.productId}`;
                const product = allProducts.find((p) => p.id === item.productId);

                return (
                  <div key={item.productId} className="rounded-2xl border border-green-200 bg-white p-4 mb-2">
                    <div className="flex gap-4">
                      <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover border border-surface-container" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-on-surface truncate">{item.name}</p>

                        {/* Store info */}
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            <ICONS.Delivery className="w-3 h-3" />
                            {item.sellerName || "Store selected"}
                          </span>
                          <span className="text-sm font-bold text-secondary">₹{item.price.toLocaleString("en-IN")}</span>
                          <button
                            type="button"
                            onClick={() => setExpandedPicker(isExpanded ? null : `ready-${item.productId}`)}
                            className="text-[11px] font-bold text-primary hover:underline"
                          >
                            {isExpanded ? "Hide" : "Change store"}
                          </button>
                        </div>

                        <div className="mt-2.5 flex items-center gap-2">
                          <button onClick={() => onQtyChange(item.productId, Math.max(1, item.qty - 1))} className="w-8 h-8 rounded-lg border border-outline-variant/40">-</button>
                          <span className="w-8 text-center font-bold text-sm">{item.qty}</span>
                          <button onClick={() => onQtyChange(item.productId, item.qty + 1)} className="w-8 h-8 rounded-lg border border-outline-variant/40">+</button>
                          <button onClick={() => onRemove(item.productId)} className="ml-3 text-xs font-bold text-primary">{t('removeBtn')}</button>
                        </div>
                      </div>
                      <div className="font-black text-on-surface text-right shrink-0">
                        ₹{(item.price * item.qty).toLocaleString("en-IN")}
                      </div>
                    </div>

                    {isExpanded && product && (
                      <StorePickerInline
                        product={product}
                        stores={storesWithDistance}
                        currentSellerId={item.sellerId}
                        onSelect={(sellerId, sellerType, sellerName, storePrice) => {
                          onAssignStore(item.productId, sellerId, sellerType, sellerName, storePrice);
                          setExpandedPicker(null);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending items — need store selection */}
          {pendingItems.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2 px-1">
                Select Store ({pendingItems.length})
              </p>
              {pendingItems.map((item) => {
                const isExpanded = expandedPicker === `pending-${item.productId}`;
                const product = allProducts.find((p) => p.id === item.productId);

                return (
                  <div key={item.productId} className="rounded-2xl border border-amber-200 bg-white p-4 mb-2">
                    <div className="flex gap-4">
                      <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover border border-surface-container" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-on-surface truncate">{item.name}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">₹{item.price.toFixed(2)}</p>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setExpandedPicker(isExpanded ? null : `pending-${item.productId}`)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                          >
                            <ICONS.Delivery className="w-3.5 h-3.5" />
                            {isExpanded ? "Hide Stores" : "Select Store"}
                          </button>
                          <div className="flex items-center gap-1">
                            <button onClick={() => onQtyChange(item.productId, Math.max(1, item.qty - 1))} className="w-7 h-7 rounded-lg border border-outline-variant/40 text-sm">-</button>
                            <span className="w-6 text-center font-bold text-sm">{item.qty}</span>
                            <button onClick={() => onQtyChange(item.productId, item.qty + 1)} className="w-7 h-7 rounded-lg border border-outline-variant/40 text-sm">+</button>
                          </div>
                          <button onClick={() => onRemove(item.productId)} className="text-xs font-bold text-primary ml-1">{t('removeBtn')}</button>
                        </div>
                      </div>
                      <div className="font-black text-on-surface">₹{(item.price * item.qty).toFixed(2)}</div>
                    </div>

                    {isExpanded && product && (
                      <StorePickerInline
                        product={product}
                        stores={storesWithDistance}
                        onSelect={(sellerId, sellerType, sellerName, storePrice) => {
                          onAssignStore(item.productId, sellerId, sellerType, sellerName, storePrice);
                          setExpandedPicker(null);
                        }}
                      />
                    )}
                  </div>
                );
              })}
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
              <span className="text-xs font-medium text-on-surface-variant">({readyItems.length} of {items.length} items)</span>
            )}
            <HelperIcon size="xs" variant="ghost" side="right" textKey="cartSubtotal" ariaLabel={`${t('cartSubtotal')} help`} />
          </span>
          <span>₹{subtotal.toLocaleString("en-IN")}</span>
        </div>

        {pendingItems.length > 0 && canCheckout && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-800">
              {pendingItems.length} item{pendingItems.length > 1 ? 's' : ''} won&apos;t be included in this order (no store selected).
              They will stay in your cart for later.
            </p>
          </div>
        )}

        {pendingItems.length > 0 && !canCheckout && (
          <p className="text-xs text-amber-700 font-semibold mt-2">
            Select a store for at least one item to place an order.
          </p>
        )}

        {isLoggedIn && isCustomer ? (
          <div className="mt-5 grid gap-3">
            <input
              value={customerName}
              onChange={(e) => onCustomerFieldChange("customerName", e.target.value)}
              placeholder={t('cartFullNamePlaceholder')}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm"
            />
            <input
              value={customerPhone}
              onChange={(e) => onCustomerFieldChange("customerPhone", e.target.value)}
              placeholder={t('cartPhonePlaceholder')}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm"
            />
            <textarea
              value={customerAddress}
              onChange={(e) => onCustomerFieldChange("customerAddress", e.target.value)}
              placeholder={t('cartAddressPlaceholder')}
              rows={3}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm"
            />
            <button
              disabled={loading || !canCheckout}
              onClick={() => void onCheckout()}
              className="rounded-xl bg-primary text-white px-4 py-3 text-sm font-bold disabled:opacity-60"
            >
              {loading
                ? t('cartPlacingOrders')
                : canCheckout
                  ? `${t('cartPlaceOrder')} (${readyItems.length} item${readyItems.length > 1 ? 's' : ''})`
                  : "Select stores to place order"}
            </button>
          </div>
        ) : (
          <button onClick={onGoLogin} className="mt-4 rounded-xl bg-primary text-white px-4 py-3 text-sm font-bold">
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
