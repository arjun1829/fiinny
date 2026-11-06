"use client";

import { useEffect, useState } from "react";
import { auth, fetchOrdersForCustomer } from "../firebase";
import { COMPANY } from "../lib/legal-constants";
import { refundMayChange, refundStageFor, type RefundStage } from "../lib/refund-view";
import { ORDER_STATUS_FLOW, isInvoiceReady, normalizeOrderItems, orderGrandTotal, type OrderDoc, type OrderStatus } from "../../types/order";
import { useI18n } from "../i18n/I18nContext";
import { openInvoice } from "../utils/invoice-generator";

type Translate = (key: string, params?: Record<string, string | number>) => string;

// Timeline the customer sees. Mirrors ORDER_STATUS_FLOW exactly so the tracking
// steps match what the seller is actually clicking through.
const STATUS_ORDER = ORDER_STATUS_FLOW;

const TIMELINE_STEP_KEYS: { key: string; labelKey: string }[] = [
  { key: "placed",           labelKey: "orderStatusPlaced" },
  { key: "accepted",         labelKey: "orderTimelineAccepted" },
  { key: "dispatched",       labelKey: "orderTimelineDispatched" },
  { key: "out_for_delivery", labelKey: "orderTimelineOutForDelivery" },
  { key: "delivered",        labelKey: "orderStatusDelivered" },
];

const STATUS_BADGE_KEY: Record<string, string> = {
  placed:           "orderStatusPlaced",
  accepted:         "orderStatusAccepted",
  dispatched:       "orderStatusDispatched",
  out_for_delivery: "orderStatusOutForDelivery",
  delivered:        "orderStatusDelivered",
  rejected:         "orderStatusRejected",
  cancelled:        "orderStatusCancelled",
  reassigning:      "orderStatusReassigning",
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
  if (status === "rejected" || status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-red-600">
        <span className="font-black text-base leading-none">✕</span>
        <span className="text-xs font-black uppercase tracking-widest">{t(status === "cancelled" ? 'orderCancelled' : 'orderRejected')}</span>
      </div>
    );
  }

  // "accepted" is its own step now, so it is no longer folded into
  // out_for_delivery — that would have shown the parcel as already on its way.
  // A reassigning order is still "placed" for delivery progress.
  const currentIdx = STATUS_ORDER.indexOf((status === "reassigning" ? "placed" : status) as OrderStatus);

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

const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (d: Date) =>
  d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const rupees = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Where the customer's money is, for a rejected / cancelled / refunded order. */
function RefundCard({ order, stage, t }: { order: OrderDoc; stage: RefundStage; t: Translate }) {
  const amount = rupees(stage.amount);
  const orderNo = order.id.slice(0, 8).toUpperCase();
  const reason = order.rejectionReason || order.cancellationReason;

  if (stage.kind === "finding_seller") {
    return (
      <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
        {t('refundFindingSeller', {
          amount,
          until: stage.until ? t('refundFindingSellerUntil', { time: fmtTime(stage.until) }) : "",
        })}
      </div>
    );
  }

  if (stage.kind === "failed") {
    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-2">
        <p className="font-black text-xs uppercase tracking-widest">{t('refundTitle')}</p>
        <p>{t('refundFailed', { amount, order: orderNo })}</p>
        <a href={`mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent(`Refund for order #${orderNo}`)}`}
          className="inline-block rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold hover:bg-red-100">
          {t('refundContactSupport')}
        </a>
      </div>
    );
  }

  // arranging / initiated / processed: a three-step progress.
  const step = stage.kind === "arranging" ? 0 : stage.kind === "initiated" ? 1 : 2;
  const expectedBy = stage.kind === "arranging" ? null : stage.expectedBy;
  const overdue = stage.kind === "processed" && expectedBy !== null && expectedBy.getTime() < Date.now();
  const steps = [t('refundStepStarted'), t('refundStepSent'), t('refundStepCredited')];

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-on-surface space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-black text-xs uppercase tracking-widest text-emerald-800">{t('refundTitle')}</p>
        <p className="font-black text-emerald-800">₹{amount}</p>
      </div>
      <ol className="grid grid-cols-3 gap-1" aria-label={t('refundTitle')}>
        {steps.map((label, i) => {
          // Steps before the current one are done. "In your account" is the
          // bank's step, so it is never marked done — at most current.
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} className="flex flex-col gap-1">
              <span className={`h-1.5 rounded-full ${done ? "bg-emerald-600" : current ? "bg-emerald-300" : "bg-emerald-100"}`} />
              <span className={`text-[10px] font-bold ${done || current ? "text-emerald-800" : "text-on-surface-variant"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
      <p>
        {stage.kind === "arranging"
          ? t('refundArranging', { amount })
          : stage.kind === "initiated"
            ? t('refundInitiated', { amount, date: stage.refundedAt ? fmtDay(stage.refundedAt) : "—" })
            : t('refundProcessed', {
                amount,
                date: fmtDay(stage.processedAt ?? stage.refundedAt ?? new Date()),
              })}
      </p>
      {expectedBy && (
        <p className="text-xs text-on-surface-variant">
          {overdue ? t('refundOverdue') : t('refundExpected', { date: fmtDay(expectedBy) })}
        </p>
      )}
      {stage.kind === "processed" && stage.reference && (
        <p className="text-xs">
          <span className="font-bold">{t('refundReference', { ref: stage.reference })}</span>
          <span className="block text-on-surface-variant">{t('refundReferenceHint')}</span>
        </p>
      )}
      {stage.kind !== "arranging" && (
        <p className="text-[10px] text-on-surface-variant">{t('refundIdLabel', { id: stage.refundId })}</p>
      )}
      {reason && <p className="text-[11px] text-on-surface-variant">{t('refundReasonLabel', { reason })}</p>}
    </div>
  );
}

/**
 * Refunds still on their way: ask the server to re-read them from Razorpay
 * (it rate-limits per order) and merge what comes back. Fire-and-forget.
 */
async function refreshPendingRefunds(
  orders: OrderDoc[],
  onUpdate: (orderId: string, payment: Record<string, unknown>) => void,
) {
  const pending = orders.filter((o) => refundMayChange(refundStageFor(o))).slice(0, 5);
  if (pending.length === 0) return;
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return;
  await Promise.all(
    pending.map(async (o) => {
      try {
        const res = await fetch("/api/orders/refund-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId: o.id }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as Record<string, unknown>;
        const fields = Object.fromEntries(
          Object.entries(body).filter(([k, v]) => k.startsWith("refund") && v !== null),
        );
        if (Object.keys(fields).length) onUpdate(o.id, fields);
      } catch {
        /* status refresh is best-effort */
      }
    }),
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
      .then((list) => {
        setOrders(list);
        void refreshPendingRefunds(list, (orderId, fields) =>
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId && o.payment ? { ...o, payment: { ...o.payment, ...fields } } : o,
            ),
          ),
        );
      })
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
            <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
              <p className="font-black text-secondary text-base">
                ₹{orderGrandTotal(order).toFixed(2)}
              </p>
              {(order.deliveryCharge ?? 0) > 0 && (
                <p className="text-[10px] text-on-surface-variant">incl. ₹{order.deliveryCharge} delivery</p>
              )}
              <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                order.status === "delivered"        ? "bg-green-100 text-green-700" :
                order.status === "rejected"         ? "bg-red-100 text-red-700" :
                order.status === "cancelled"        ? "bg-red-100 text-red-700" :
                order.status === "out_for_delivery" ? "bg-blue-100 text-blue-700" :
                order.status === "accepted"         ? "bg-blue-100 text-blue-700" :
                order.status === "dispatched"       ? "bg-indigo-100 text-indigo-700" :
                order.status === "reassigning"      ? "bg-orange-100 text-orange-700" :
                                                      "bg-surface-container text-on-surface-variant"
              }`}>
                {STATUS_BADGE_KEY[order.status] ? (t as Translate)(STATUS_BADGE_KEY[order.status]!) : order.status.replace(/_/g, " ")}
              </span>
              {/* Invoice — created once the seller accepts the order. */}
              {isInvoiceReady(order.status) ? (
              <button
                type="button"
                onClick={() => openInvoice(order)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-primary border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Invoice
              </button>
              ) : (order.status === "placed" || order.status === "reassigning") ? (
                <span className="text-[10px] text-on-surface-variant">Invoice after the seller accepts</span>
              ) : null}
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-surface-container pt-3 pb-4 space-y-1.5">
            {normalizeOrderItems(order.items).map((item) => (
              <div key={`${order.id}-${item.productId}`} className="flex justify-between text-sm">
                <span className="text-on-surface">
                  {item.name}
                  {item.variantUnit && (
                    <span className="ml-1 text-[10px] font-semibold text-primary bg-primary/8 px-1.5 py-0.5 rounded-full">
                      {item.variantUnit}
                    </span>
                  )}
                  {" "}× {item.qty}
                </span>
                <span className="font-semibold text-on-surface">₹{Number(item.lineTotal || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <OrderTimeline status={order.status} t={t} />

          {/* Refund — where the customer's money is */}
          {(() => {
            const stage = refundStageFor(order);
            return stage ? <RefundCard order={order} stage={stage} t={t} /> : null;
          })()}
        </div>
      ))}
    </div>
  );
}
