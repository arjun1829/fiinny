"use client";

import type { CartItem } from "../../types/order";
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
  onCheckout: () => Promise<void>;
  onGoLogin: () => void;
  loading: boolean;
  message: string | null;
};

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
  onCheckout,
  onGoLogin,
  loading,
  message,
}: CartViewProps) {
  const { t } = useI18n();
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div className="px-4 md:px-10 max-w-5xl mx-auto w-full py-8">
      <h1 className="text-3xl font-bold text-on-surface mb-2">{t('cartTitle')}</h1>
      <p className="text-sm text-on-surface-variant mb-6 inline-flex items-center gap-1.5">
        {t('cartSubtitle')}
        <HelperIcon
          size="xs"
          variant="ghost"
          side="right"
          textKey="cartSellerGrouping"
          ariaLabel={`${t('cartTitle')} help`}
        />
      </p>

      {!items.length ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
          {t('cartEmpty')}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.productId} className="rounded-2xl border border-outline-variant/30 bg-white p-4 flex gap-4">
              <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover border border-surface-container" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface truncate">{item.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {item.sellerType} · ₹{item.price.toFixed(2)}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => onQtyChange(item.productId, Math.max(1, item.qty - 1))}
                    className="w-8 h-8 rounded-lg border border-outline-variant/40"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-bold text-sm">{item.qty}</span>
                  <button
                    onClick={() => onQtyChange(item.productId, item.qty + 1)}
                    className="w-8 h-8 rounded-lg border border-outline-variant/40"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onRemove(item.productId)}
                    className="ml-3 text-xs font-bold text-primary"
                  >
                    {t('removeBtn')}
                  </button>
                </div>
              </div>
              <div className="font-black text-on-surface">₹{(item.price * item.qty).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
        <div className="flex items-center justify-between text-lg font-bold">
          <span className="inline-flex items-center gap-1.5">
            {t('cartSubtotal')}
            <HelperIcon
              size="xs"
              variant="ghost"
              side="right"
              textKey="cartSubtotal"
              ariaLabel={`${t('cartSubtotal')} help`}
            />
          </span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>

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
              disabled={loading || !items.length}
              onClick={() => void onCheckout()}
              className="rounded-xl bg-primary text-white px-4 py-3 text-sm font-bold disabled:opacity-60"
            >
              {loading ? t('cartPlacingOrders') : t('cartPlaceOrder')}
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

