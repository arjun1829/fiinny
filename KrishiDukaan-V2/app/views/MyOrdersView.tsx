"use client";

import { useEffect, useState } from "react";
import { fetchOrdersForCustomer } from "../firebase";
import type { OrderDoc } from "../../types/order";
import { useI18n } from "../i18n/I18nContext";

type Translate = (key: string, params?: Record<string, string | number>) => string;

const STATUS_ORDER = ["placed", "accepted", "out_for_delivery", "delivered"] as const;

const TIMELINE_STEP_KEYS: { key: string; labelKey: string }[] = [
  { key: "placed",           labelKey: "orderStatusPlaced" },
  { key: "accepted",         labelKey: "orderStatusAccepted" },
  { key: "out_for_delivery", labelKey: "orderTimelineOutForDelivery" },
  { key: "delivered",        labelKey: "orderStatusDelivered" },
];

const STATUS_BADGE_KEY: Record<string, string> = {
  placed: "orderStatusPlaced",
  accepted: "orderStatusAccepted",
  out_for_delivery: "orderStatusOutForDelivery",
  delivered: "orderStatusDelivered",
  rejected: "orderStatusRejected",
};

function formatDate(createdAt: unknown): string {
  try {
    const date = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function OrderTimeline({ status, t }: { status: string; t: Translate }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-red-600">
        <span className="font-black text-base leading-none">✕</span>
        <span className="text-xs font-black uppercase tracking-widest">{t('orderRejected')}</span>
      </div>
    );
  }

  const currentIdx = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]);

  return (
    <div className="flex items-start gap-0">
      {TIMELINE_STEP_KEYS.map((step, idx) => {
        const isReached = currentIdx >= idx;
        const isLast = idx === TIMELINE_STEP_KEYS.length - 1;
        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-colors border-2 ${
                isReached
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-on-surface-variant/40 border-surface-container-highest"
              }`}>
                {isReached ? "✓" : idx + 1}
              </div>
              <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight whitespace-pre-line ${
                isReached ? "text-primary" : "text-on-surface-variant/40"
              }`}>
                {t(step.labelKey)}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-0.5 mb-4 mx-1 rounded-full transition-colors ${
                currentIdx > idx ? "bg-primary" : "bg-surface-container-highest"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MyOrdersView({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    fetchOrdersForCustomer(customerId)
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : t('ordersLoadFailed')))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low/40 px-6 py-12 text-center">
        <div className="text-4xl">📦</div>
        <p className="text-sm font-semibold text-on-surface">{t('ordersEmptyTitle')}</p>
        <p className="text-xs text-on-surface-variant">{t('ordersEmptyDesc')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <div key={order.id} className="rounded-2xl border border-outline-variant/30 bg-white p-5 shadow-ambient">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-0.5">{t('orderLabel')}</p>
              <p className="font-bold text-on-surface">#{order.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">{formatDate(order.createdAt)}</p>
              {order.sellerName && (
                <p className="text-xs text-on-surface-variant mt-0.5">{t('orderFrom', { name: order.sellerName })}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-black text-secondary text-base">₹{Number(order.subtotal || 0).toFixed(2)}</p>
              <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                order.status === "delivered"        ? "bg-green-100 text-green-700" :
                order.status === "rejected"         ? "bg-red-100 text-red-700" :
                order.status === "out_for_delivery" ? "bg-blue-100 text-blue-700" :
                order.status === "accepted"         ? "bg-primary/10 text-primary" :
                                                      "bg-surface-container text-on-surface-variant"
              }`}>
                {STATUS_BADGE_KEY[order.status] ? (t as Translate)(STATUS_BADGE_KEY[order.status]!) : order.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-surface-container pt-3 pb-4 space-y-1.5">
            {(order.items || []).map((item) => (
              <div key={`${order.id}-${item.productId}`} className="flex justify-between text-sm">
                <span className="text-on-surface">{item.name} × {item.qty}</span>
                <span className="font-semibold text-on-surface">₹{Number(item.lineTotal || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <OrderTimeline status={order.status} t={t} />
        </div>
      ))}
    </div>
  );
}
