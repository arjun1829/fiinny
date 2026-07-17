"use client";

import { useEffect, useState } from "react";
import { useEffectiveUser } from "../_context/effective-user-context";
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  BadgeCheck,
  AlertCircle,
  ShoppingBag,
  IndianRupee,
  Download,
  RefreshCw,
} from "lucide-react";
import { fetchOrdersForCustomer } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import type { OrderDoc, OrderStatus } from "../../../types/order";
import { openInvoice } from "../../utils/invoice-generator";

// Visible progress steps (same as customer view)
const STATUS_FLOW = ["placed", "out_for_delivery", "delivered"] as const;

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; icon: typeof Clock }
> = {
  placed:           { label: "Order Placed",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",   icon: Clock },
  accepted:         { label: "Processing",       color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",     icon: CheckCircle2 },
  out_for_delivery: { label: "Out for Delivery", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Truck },
  delivered:        { label: "Delivered",        color: "text-green-700",  bg: "bg-green-50 border-green-200",   icon: Package },
  rejected:         { label: "Rejected",         color: "text-red-700",   bg: "bg-red-50 border-red-200",       icon: XCircle },
};

function formatDate(createdAt: unknown): string {
  try {
    const date = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function OrderProgressBar({ status }: { status: OrderStatus }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-red-600">
        <XCircle className="w-4 h-4" />
        <span className="text-xs font-black uppercase tracking-widest">Order Rejected</span>
      </div>
    );
  }

  const resolved = status === "accepted" ? "out_for_delivery" : status;
  const currentIdx = STATUS_FLOW.indexOf(resolved as (typeof STATUS_FLOW)[number]);

  return (
    <div className="flex items-center gap-0 w-full">
      {STATUS_FLOW.map((step, idx) => {
        const isReached = currentIdx >= idx;
        const isCurrent = (status === "accepted" ? "out_for_delivery" : status) === step;
        const config = STATUS_CONFIG[step as OrderStatus];
        const isLast = idx === STATUS_FLOW.length - 1;
        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2 ${
                  isCurrent
                    ? `${config.bg} ${config.color} border-current`
                    : isReached
                    ? "bg-green-500 text-white border-green-500"
                    : "bg-white text-on-surface-variant/30 border-surface-container-highest"
                }`}
              >
                {isReached && !isCurrent ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <config.icon className="w-4 h-4" />
                )}
              </div>
              <span
                className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap ${
                  isReached ? config.color : "text-on-surface-variant/30"
                }`}
              >
                {config.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`flex-1 h-0.5 mb-4 mx-1 rounded-full transition-colors ${
                  currentIdx > idx ? "bg-green-400" : "bg-surface-container-highest"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PaymentBadge({ payment }: { payment: OrderDoc["payment"] }) {
  if (!payment) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
        <AlertCircle className="w-3 h-3" /> COD
      </span>
    );
  }
  if (payment.status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold uppercase tracking-wider">
        <BadgeCheck className="w-3 h-3" /> Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold uppercase tracking-wider">
      <XCircle className="w-3 h-3" /> {payment.status}
    </span>
  );
}

type FilterTab = "all" | OrderStatus;

const FILTER_LABELS: { key: FilterTab; label: string; color: string }[] = [
  { key: "all",              label: "All",           color: "bg-surface-container text-on-surface" },
  { key: "placed",           label: "Placed",        color: "bg-amber-100 text-amber-800" },
  { key: "out_for_delivery", label: "Dispatched",    color: "bg-purple-100 text-purple-800" },
  { key: "delivered",        label: "Delivered",     color: "bg-green-100 text-green-800" },
  { key: "rejected",         label: "Rejected",      color: "bg-red-100 text-red-800" },
];

export default function MyOrdersPage() {
  const { uid: effectiveUid } = useEffectiveUser();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const loadOrders = async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchOrdersForCustomer(userId);
      setOrders(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!effectiveUid) { setLoading(false); return; }
    setUid(effectiveUid);
    loadOrders(effectiveUid);
  }, [effectiveUid]);

  const filteredOrders =
    activeFilter === "all"
      ? orders
      : orders.filter((o) => o.status === activeFilter);

  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const paidTotal = orders
    .filter((o) => o.payment?.status === "paid")
    .reduce((s, o) => s + (o.payment?.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="My Placed Orders"
        description="Orders you've placed as a buyer — track delivery status and download invoices."
        helperKey="dashMyOrders"
      />

      {!uid ? (
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          Please sign in to view your orders.
        </p>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => uid && loadOrders(uid)}
            className="ml-3 inline-flex items-center gap-1 font-bold underline underline-offset-2"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low/40 px-6 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 text-primary/60" />
          </div>
          <div>
            <p className="font-semibold text-on-surface text-base">No orders placed yet</p>
            <p className="text-sm text-on-surface-variant mt-1 max-w-sm">
              When you purchase products from the marketplace, your orders will appear here for tracking.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Total Orders</p>
              <p className="text-2xl font-black text-primary mt-1">{orders.length}</p>
            </div>
            <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Amount Spent</p>
              <p className="text-2xl font-black text-green-700 mt-1 flex items-center gap-0.5">
                <IndianRupee className="w-4 h-4" />{paidTotal.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">In Transit</p>
              <p className="text-2xl font-black text-amber-700 mt-1">
                {(statusCounts["placed"] ?? 0) + (statusCounts["out_for_delivery"] ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Delivered</p>
              <p className="text-2xl font-black text-on-surface mt-1">{statusCounts["delivered"] ?? 0}</p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTER_LABELS.filter(
              (f) => f.key === "all" || (statusCounts[f.key] ?? 0) > 0
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeFilter === tab.key
                    ? `${tab.color} ring-2 ring-offset-1 ring-primary/30 shadow-sm`
                    : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                {tab.label}
                {tab.key !== "all" && statusCounts[tab.key]
                  ? ` (${statusCounts[tab.key]})`
                  : tab.key === "all"
                  ? ` (${orders.length})`
                  : ""}
              </button>
            ))}
          </div>

          {/* Orders list */}
          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant text-sm">
              No orders in this category.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const config = STATUS_CONFIG[order.status];
                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-outline-variant/20 bg-white shadow-sm overflow-hidden"
                  >
                    {/* Status banner */}
                    <div className={`px-5 py-2.5 border-b ${config.bg} flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <config.icon className={`w-4 h-4 ${config.color}`} />
                        <span className={`text-xs font-black uppercase tracking-widest ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <PaymentBadge payment={order.payment} />
                        <span className="text-[10px] font-semibold text-on-surface-variant">
                          {formatDate(order.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Order header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-on-surface text-base">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          {order.sellerName && (
                            <p className="text-xs text-on-surface-variant mt-0.5">
                              From: <span className="font-semibold">{order.sellerName}</span>
                            </p>
                          )}
                          {order.invoiceNumber && (
                            <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
                              {order.invoiceNumber}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-secondary text-xl">
                            ₹{Number(order.grandTotal ?? order.subtotal ?? 0).toFixed(0)}
                          </p>
                          {(order.deliveryCharge ?? 0) > 0 && (
                            <p className="text-[10px] text-on-surface-variant">
                              incl. ₹{order.deliveryCharge} delivery
                            </p>
                          )}
                          <p className="text-[10px] text-on-surface-variant">
                            {(order.items || []).length} item
                            {(order.items || []).length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="border rounded-xl border-surface-container overflow-hidden">
                        {(order.items || []).map((item, idx) => (
                          <div
                            key={`${order.id}-${item.productId}-${idx}`}
                            className={`flex justify-between px-4 py-2.5 text-sm ${
                              idx > 0 ? "border-t border-surface-container" : ""
                            }`}
                          >
                            <span className="text-on-surface">
                              {item.name}
                              {item.variantUnit && (
                                <span className="ml-1.5 text-[10px] font-semibold text-primary bg-primary/8 px-1.5 py-0.5 rounded-full">
                                  {item.variantUnit}
                                </span>
                              )}
                              {" "}
                              <span className="text-on-surface-variant">× {item.qty}</span>
                            </span>
                            <span className="font-bold text-on-surface">
                              ₹{Number(item.lineTotal || 0).toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Payment details (if paid) */}
                      {order.payment?.status === "paid" && (
                        <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-green-600" />
                            <span className="text-xs font-semibold text-green-700">
                              Paid via Razorpay
                            </span>
                          </div>
                          <span className="text-xs font-mono text-green-600 bg-white px-2 py-0.5 rounded-lg border border-green-100">
                            {order.payment.razorpayPaymentId?.slice(-8) ?? "—"}
                          </span>
                        </div>
                      )}

                      {/* Progress bar */}
                      <OrderProgressBar status={order.status} />

                      {/* Download invoice */}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => openInvoice(order)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-outline-variant/50 bg-white text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" /> Download Invoice
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
