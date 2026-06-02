"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Truck,
  Phone,
  MapPin,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  ShieldCheck,
  BadgeCheck,
  AlertCircle,
  IndianRupee,
  Download,
} from "lucide-react";
import { auth, fetchIncomingOrdersForSeller, getUserProfile, updateOrderStatus } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import type { OrderDoc, OrderStatus } from "../../../types/order";
import { useI18n } from "../../i18n/I18nContext";
import { generateInvoicePDF } from "../../utils/invoice-generator";

// Visible progress flow — "accepted" is kept in the type for backward compat but removed from the UI
const STATUS_FLOW: OrderStatus[] = ["placed", "out_for_delivery", "delivered"];

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  placed:           { label: "Order Placed",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",   icon: Clock },
  accepted:         { label: "Processing",       color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",     icon: CheckCircle2 },
  out_for_delivery: { label: "Out for Delivery", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Truck },
  delivered:        { label: "Delivered",         color: "text-green-700",  bg: "bg-green-50 border-green-200",   icon: Package },
  rejected:         { label: "Rejected",         color: "text-red-700",    bg: "bg-red-50 border-red-200",       icon: XCircle },
};

const NEXT_ACTIONS: Record<OrderStatus, { next: OrderStatus; label: string; color: string }[]> = {
  // Placed → dispatch directly (no manual accept step for prepaid orders)
  placed: [
    { next: "out_for_delivery", label: "Mark Ready & Dispatch", color: "bg-purple-600 hover:bg-purple-700 text-white" },
    { next: "rejected",         label: "Reject",               color: "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200" },
  ],
  // Legacy "accepted" orders: still allow advancing to dispatch
  accepted: [
    { next: "out_for_delivery", label: "Mark Dispatched", color: "bg-purple-600 hover:bg-purple-700 text-white" },
  ],
  out_for_delivery: [
    { next: "delivered", label: "Mark Delivered", color: "bg-green-600 hover:bg-green-700 text-white" },
  ],
  delivered: [],
  rejected:  [],
};

type FilterTab = "all" | "placed" | "accepted" | "out_for_delivery" | "delivered" | "rejected";
type ViewTab = "orders" | "payments";

function formatDate(createdAt: unknown): string {
  try {
    const date = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function formatDateStr(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function OrderProgressBar({ status }: { status: OrderStatus }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-2 text-red-600">
        <XCircle className="w-4 h-4" />
        <span className="text-xs font-black uppercase tracking-widest">Order Rejected</span>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(status);

  return (
    <div className="flex items-center gap-0 w-full">
      {STATUS_FLOW.map((step, idx) => {
        const isReached = currentIdx >= idx;
        const isCurrent = currentIdx === idx;
        const config = STATUS_CONFIG[step];
        const isLast = idx === STATUS_FLOW.length - 1;
        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2 ${
                isCurrent
                  ? `${config.bg} ${config.color} border-current`
                  : isReached
                    ? "bg-green-500 text-white border-green-500"
                    : "bg-white text-on-surface-variant/30 border-surface-container-highest"
              }`}>
                {isReached && !isCurrent ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <config.icon className="w-4 h-4" />
                )}
              </div>
              <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap ${
                isReached ? config.color : "text-on-surface-variant/30"
              }`}>
                {config.label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-0.5 mb-4 mx-1 rounded-full transition-colors ${
                currentIdx > idx ? "bg-green-400" : "bg-surface-container-highest"
              }`} />
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
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
        <AlertCircle className="w-3 h-3" /> COD / Unpaid
      </span>
    );
  }
  if (payment.status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold uppercase tracking-wider">
        <BadgeCheck className="w-3 h-3" /> Paid via Razorpay
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold uppercase tracking-wider">
      <XCircle className="w-3 h-3" /> {payment.status}
    </span>
  );
}

// Payment detail card for the Payments tab
function PaymentCard({ order }: { order: OrderDoc }) {
  const payment = order.payment;
  const isPaid = payment?.status === "paid";

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-3 border-b flex items-center justify-between ${isPaid ? "bg-green-50 border-green-100" : "bg-surface-container-lowest border-outline-variant/20"}`}>
        <div className="flex items-center gap-2">
          <CreditCard className={`w-4 h-4 ${isPaid ? "text-green-600" : "text-on-surface-variant/40"}`} />
          <span className={`text-xs font-black uppercase tracking-widest ${isPaid ? "text-green-700" : "text-on-surface-variant"}`}>
            {isPaid ? "Payment Received" : "No Online Payment"}
          </span>
        </div>
        <PaymentBadge payment={payment} />
      </div>

      <div className="p-5 space-y-4">
        {/* Order reference */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-on-surface text-lg">#{order.id.slice(0, 8).toUpperCase()}</p>
            <div className="flex items-center gap-3 mt-1 text-sm text-on-surface-variant">
              <span className="font-semibold">{order.customerName}</span>
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-bold">
                  <Phone className="w-3 h-3" /> {order.customerPhone}
                </a>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-secondary text-xl">₹{Number(order.subtotal || 0).toFixed(0)}</p>
            <p className="text-[10px] text-on-surface-variant">{(order.items || []).length} item(s)</p>
          </div>
        </div>

        {/* Payment details */}
        {isPaid && payment ? (
          <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-2.5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-green-600" />
              <span className="text-xs font-black text-green-700 uppercase tracking-widest">Razorpay Payment Details</span>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b border-green-100">
                <span className="text-on-surface-variant font-medium">Payment ID</span>
                <span className="font-mono font-bold text-on-surface text-xs bg-white px-2 py-0.5 rounded-lg border border-green-100">
                  {payment.razorpayPaymentId || "—"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-green-100">
                <span className="text-on-surface-variant font-medium">Order ID</span>
                <span className="font-mono text-xs text-on-surface-variant">{payment.razorpayOrderId || "—"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-green-100">
                <span className="text-on-surface-variant font-medium">Amount Paid</span>
                <span className="font-black text-green-700 flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5" />{Number(payment.amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-on-surface-variant font-medium">Paid At</span>
                <span className="font-semibold text-on-surface text-xs">{formatDateStr(payment.paidAt)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-surface-container-lowest border border-dashed border-outline-variant/40 p-4 text-center">
            <AlertCircle className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
            <p className="text-sm font-semibold text-on-surface-variant">No online payment for this order</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">This order was placed without Razorpay payment or payment is pending.</p>
          </div>
        )}

        {/* Order date */}
        <div className="flex items-center justify-between text-xs text-on-surface-variant border-t border-surface-container pt-3">
          <span>Order placed</span>
          <span className="font-semibold">{formatDate(order.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [sellerType, setSellerType] = useState<"retailer" | "manufacturer" | null>(null);
  const [onlineDelivery, setOnlineDelivery] = useState<boolean | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("orders");
  const [sellerInfo, setSellerInfo] = useState<{ name: string; phone: string; gstin: string } | null>(null);

  const load = async (nextUid: string, nextSellerType: "retailer" | "manufacturer") => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchIncomingOrdersForSeller(nextUid, nextSellerType);
      setOrders(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load orders.";
      setError(msg);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid(null);
        setSellerType(null);
        setOrders([]);
        setLoading(false);
        return;
      }
      const profile = await getUserProfile(user.uid);
      const role = profile?.role;
      const hasOnlineDelivery = !!(profile as any)?.onlineDelivery;
      setOnlineDelivery(hasOnlineDelivery);
      if (role === "retailer" || role === "manufacturer") {
        setUid(user.uid);
        setSellerType(role);
        setSellerInfo({
          name:  String((profile as any)?.businessName ?? (profile as any)?.shopName ?? (profile as any)?.name ?? ""),
          phone: String((profile as any)?.phone ?? ""),
          gstin: String((profile as any)?.gstin ?? ""),
        });
        if (hasOnlineDelivery) {
          await load(user.uid, role);
        } else {
          setLoading(false);
        }
      } else {
        setUid(null);
        setSellerType(null);
        setOrders([]);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const onAdvance = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, status);
      if (uid && sellerType) await load(uid, sellerType);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = activeFilter === "all"
    ? orders
    : orders.filter((o) => o.status === activeFilter);

  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const paidOrdersCount = orders.filter((o) => o.payment?.status === "paid").length;
  const totalRevenue = orders
    .filter((o) => o.payment?.status === "paid")
    .reduce((sum, o) => sum + (o.payment?.amount || 0), 0);

  const FILTER_TABS: { key: FilterTab; label: string; color: string }[] = [
    { key: "all",              label: `All (${orders.length})`,                                        color: "bg-surface-container text-on-surface" },
    { key: "placed",           label: `New (${statusCounts["placed"] || 0})`,                          color: "bg-amber-100 text-amber-800" },
    { key: "out_for_delivery", label: `Dispatched (${statusCounts["out_for_delivery"] || 0})`,         color: "bg-purple-100 text-purple-800" },
    { key: "delivered",        label: `Delivered (${statusCounts["delivered"] || 0})`,                 color: "bg-green-100 text-green-800" },
    { key: "rejected",         label: `Rejected (${statusCounts["rejected"] || 0})`,                   color: "bg-red-100 text-red-800" },
    // Legacy tab — only show if there are orders with accepted status
    ...(statusCounts["accepted"] ? [{ key: "accepted" as FilterTab, label: `Processing (${statusCounts["accepted"]})`, color: "bg-blue-100 text-blue-800" }] : []),
  ];

  return (
    <>
      <PageHeader
        title={t('incomingOrdersTitle')}
        description={t('ordersDesc')}
        helperKey="dashOrders"
      />

      {!uid || !sellerType ? (
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          {t('signInForOrders')}
        </p>
      ) : onlineDelivery === false ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-16 text-center">
          <div className="rounded-full bg-surface-container p-5">
            <Truck className="h-9 w-9 text-on-surface-variant/40" />
          </div>
          <div>
            <p className="text-base font-semibold text-on-surface">{t('onlineDeliveryNotEnabled')}</p>
            <p className="mt-1 text-sm text-on-surface-variant max-w-sm mx-auto">
              {t('enableOnlineDeliveryHint')}
            </p>
          </div>
          <Link href="/dashboard/profile?tab=settings"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            {t('goToSettingsBtn')}
          </Link>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : !orders.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low/40 px-6 py-16 text-center">
          <Package className="h-12 w-12 text-on-surface-variant/30" />
          <p className="font-semibold text-on-surface">No orders yet</p>
          <p className="text-sm text-on-surface-variant">When customers order from your store, orders will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* View tabs: Orders | Payments */}
          <div className="flex gap-1 p-1 bg-surface-container-low rounded-2xl w-fit">
            <button
              onClick={() => setActiveViewTab("orders")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeViewTab === "orders"
                  ? "bg-white text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Package className="w-4 h-4" />
              Orders ({orders.length})
            </button>
            <button
              onClick={() => setActiveViewTab("payments")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeViewTab === "payments"
                  ? "bg-white text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Payments
              {paidOrdersCount > 0 && (
                <span className="ml-1 bg-green-100 text-green-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {paidOrdersCount}
                </span>
              )}
            </button>
          </div>

          {activeViewTab === "payments" ? (
            /* ── PAYMENTS TAB ── */
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-green-50 border border-green-100 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <IndianRupee className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Total Collected</p>
                    <p className="text-xl font-black text-green-700">₹{totalRevenue.toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BadgeCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Paid Orders</p>
                    <p className="text-xl font-black text-primary">{paidOrdersCount} / {orders.length}</p>
                  </div>
                </div>
              </div>

              {/* Payment cards */}
              <div className="space-y-3">
                {orders.map((order) => (
                  <PaymentCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          ) : (
            /* ── ORDERS TAB ── */
            <>
              {/* Filter tabs */}
              <div className="flex flex-wrap gap-2">
                {FILTER_TABS.map((tab) => (
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
                  </button>
                ))}
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
                  No orders in this category.
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const config = STATUS_CONFIG[order.status];
                  const actions = NEXT_ACTIONS[order.status] || [];
                  const isUpdating = updatingId === order.id;
                  return (
                    <div key={order.id} className="rounded-2xl border border-outline-variant/20 bg-white shadow-sm overflow-hidden">
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
                            <p className="font-black text-on-surface text-lg">#{order.id.slice(0, 8).toUpperCase()}</p>
                            <div className="flex items-center gap-3 mt-1 text-sm text-on-surface-variant">
                              <span className="font-semibold">{order.customerName}</span>
                              {order.customerPhone && (
                                <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-bold">
                                  <Phone className="w-3 h-3" /> {order.customerPhone}
                                </a>
                              )}
                            </div>
                            {order.customerAddress && (
                              <p className="flex items-start gap-1 mt-1 text-xs text-on-surface-variant">
                                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                                {order.customerAddress}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-secondary text-xl">₹{Number(order.grandTotal ?? order.subtotal ?? 0).toFixed(0)}</p>
                            {(order.deliveryCharge ?? 0) > 0 && (
                              <p className="text-[10px] text-on-surface-variant">incl. ₹{order.deliveryCharge} delivery</p>
                            )}
                            <p className="text-[10px] text-on-surface-variant">
                              {(order.items || []).length} item{(order.items || []).length !== 1 ? "s" : ""}
                              {order.invoiceNumber ? ` · ${order.invoiceNumber}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="border rounded-xl border-surface-container overflow-hidden">
                          {(order.items || []).map((item, idx) => (
                            <div
                              key={`${order.id}-${item.productId}`}
                              className={`flex justify-between px-4 py-2.5 text-sm ${idx > 0 ? "border-t border-surface-container" : ""}`}
                            >
                              <span className="text-on-surface">
                                {item.name}
                                {item.variantUnit && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-primary bg-primary/8 px-1.5 py-0.5 rounded-full">
                                    {item.variantUnit}
                                  </span>
                                )}
                                {" "}<span className="text-on-surface-variant">× {item.qty}</span>
                              </span>
                              <span className="font-bold text-on-surface">₹{Number(item.lineTotal || 0).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Progress bar */}
                        <OrderProgressBar status={order.status} />

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {actions.map((action) => (
                            <button
                              key={action.next}
                              disabled={isUpdating}
                              onClick={() => void onAdvance(order.id, action.next)}
                              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${action.color}`}
                            >
                              {isUpdating ? (
                                <span className="flex items-center gap-2">
                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  Updating…
                                </span>
                              ) : (
                                action.label
                              )}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => generateInvoicePDF(order, sellerInfo ? {
                              name: sellerInfo.name,
                              phone: sellerInfo.phone,
                              gstin: sellerInfo.gstin || undefined,
                            } : undefined)}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-outline-variant/50 bg-white text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Invoice
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
