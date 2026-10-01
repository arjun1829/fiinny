"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useEffectiveUser } from "../_context/effective-user-context";
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
  Lock,
  RefreshCw,
} from "lucide-react";
import { auth, fetchIncomingOrdersForSeller, updateOrderStatus } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { formatCustomerAddress, normalizeOrderItems, orderGrandTotal } from "../../../types/order";
import { ORDER_STATUS_FLOW, type OrderDoc, type OrderStatus } from "../../../types/order";
import { useI18n } from "../../i18n/I18nContext";
import { openInvoice } from "../../utils/invoice-generator";
import { OrderRequestsPanel } from "../_components/order-requests-panel";
import { fetchOpenOffers } from "../_lib/order-offers";

// Progression shown to the seller. Imported rather than redeclared so the
// seller view, the customer view and the "can advance to" checks cannot drift.
const STATUS_FLOW: OrderStatus[] = ORDER_STATUS_FLOW;

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  placed:           { label: "Order Placed",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",   icon: Clock },
  accepted:         { label: "Accepted",         color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",     icon: CheckCircle2 },
  dispatched:       { label: "Dispatched",       color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", icon: Package },
  out_for_delivery: { label: "Out for Delivery", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: Truck },
  delivered:        { label: "Delivered",         color: "text-green-700",  bg: "bg-green-50 border-green-200",   icon: Package },
  rejected:         { label: "Rejected",         color: "text-red-700",    bg: "bg-red-50 border-red-200",       icon: XCircle },
  cancelled:        { label: "Cancelled",        color: "text-red-700",    bg: "bg-red-50 border-red-200",       icon: XCircle },
  reassigning:      { label: "Offered to other sellers", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: RefreshCw },
};

// One step forward at a time, so the customer's tracking timeline reflects what
// actually happened rather than jumping stages. Reject stays available until the
// goods have left the seller: once dispatched, a cancellation is a refund, not a
// status flip, and is handled through the refund flow instead.
const NEXT_ACTIONS: Record<OrderStatus, { next: OrderStatus; label: string; color: string }[]> = {
  placed: [
    { next: "accepted", label: "Accept Order", color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { next: "rejected", label: "Reject",       color: "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200" },
  ],
  accepted: [
    { next: "dispatched", label: "Mark Dispatched", color: "bg-indigo-600 hover:bg-indigo-700 text-white" },
    { next: "rejected",   label: "Reject",          color: "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200" },
  ],
  dispatched: [
    { next: "out_for_delivery", label: "Out for Delivery", color: "bg-purple-600 hover:bg-purple-700 text-white" },
  ],
  out_for_delivery: [
    { next: "delivered", label: "Mark Delivered", color: "bg-green-600 hover:bg-green-700 text-white" },
  ],
  delivered: [],
  rejected:  [],
  cancelled: [],
  // Out of this seller's hands: it's being offered to others for 24h, and
  // firestore.rules refuses any seller write to it until someone accepts.
  reassigning: [],
};

type FilterTab = "all" | "placed" | "accepted" | "dispatched" | "out_for_delivery" | "delivered" | "rejected" | "cancelled";
type ViewTab = "orders" | "payments" | "requests";

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

/**
 * Payout breakdown for one order.
 *
 * Two deductions sit between the order total and the seller's money: the
 * KrishiDukan platform fee, and the payment gateway's own fee. Both come from
 * /api/payment/fee — the platform fee derived there from settings/route (the
 * document the payment split itself uses), the gateway fee read off Razorpay's
 * payment entity after capture and cached onto the order doc, because it is not
 * in the client-side payment payload.
 *
 * This panel used to hardcode a "KrishiDukan charge ₹0.00" row. Orders that
 * predate the fee capture, or whose payment never captured, render an honest
 * "—" rather than a guessed number — the same rule now applies to both rows.
 */
function PayoutBreakdown({ order }: { order: OrderDoc }) {
  // undefined = still resolving, null = genuinely unavailable
  const [gatewayFee, setGatewayFee] = useState<number | null | undefined>(undefined);
  const [platformFee, setPlatformFee] = useState<number | null | undefined>(undefined);
  const payment = (order as any).payment as
    | { razorpayPaymentId?: string; gatewayFee?: number }
    | undefined;
  const gross = orderGrandTotal(order);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // No early return on a cached or missing gateway fee any more: the
      // platform fee is derived server-side from settings/route and has to be
      // fetched regardless, including for an order whose payment never
      // captured. The route answers both cases without hitting Razorpay.
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) { setGatewayFee(null); setPlatformFee(null); }
          return;
        }
        const res = await fetch("/api/payment/fee", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId: order.id }),
        });
        const json = await res.json();
        if (cancelled) return;
        setGatewayFee(typeof json.gatewayFee === "number" ? json.gatewayFee : null);
        setPlatformFee(typeof json.platformFee === "number" ? json.platformFee : null);
      } catch {
        if (!cancelled) {
          setGatewayFee(null);
          setPlatformFee(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, payment?.gatewayFee, payment?.razorpayPaymentId]);

  // Net is shown only when BOTH deductions are known. Subtracting one of two
  // known charges and calling the result "you receive" overstates the payout.
  const net =
    typeof gatewayFee === "number" && typeof platformFee === "number"
      ? gross - gatewayFee - platformFee
      : null;

  const money = (v: number | null | undefined) =>
    v === undefined ? "…" : v === null ? "—" : `− ₹${v.toFixed(2)}`;

  return (
    <div className="rounded-xl border border-surface-container bg-surface-container-lowest p-4">
      <p className="mb-2.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        Your payout
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Order amount</span>
          <span className="font-semibold text-on-surface">₹{gross.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-variant">KrishiDukan platform fee</span>
          <span className="font-semibold text-on-surface">{money(platformFee)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Payment gateway charge</span>
          <span className="font-semibold text-on-surface">{money(gatewayFee)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-surface-container pt-2">
          <span className="font-bold text-on-surface">You receive</span>
          <span className="text-base font-black text-secondary">
            {net === null ? "—" : `₹${net.toFixed(2)}`}
          </span>
        </div>
      </div>
      <p className="mt-2.5 text-[10px] text-on-surface-variant">
        {order.status === "delivered"
          ? "Transferred to your registered bank account."
          : "Transferred to your bank account once you mark this order delivered."}{" "}
        Figures are before GST and other applicable taxes. See the{" "}
        <a href="/seller-terms" className="font-semibold text-primary hover:underline">
          Seller &amp; Manufacturer Subscription Terms
        </a>
        .
      </p>
    </div>
  );
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
            <p className="text-[10px] text-on-surface-variant">{normalizeOrderItems(order.items as any).length} item(s)</p>
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
  const { uid: effectiveUid, profile: effectiveProfile } = useEffectiveUser();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [sellerType, setSellerType] = useState<"retailer" | "manufacturer" | null>(null);
  const [onlineDelivery, setOnlineDelivery] = useState<boolean | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("orders");
  const [sellerInfo, setSellerInfo] = useState<{ name: string; phone: string; gstin: string } | null>(null);
  const [sellerProfile, setSellerProfile] = useState<any>(null);

  const load = async (
    nextUid: string,
    nextSellerType: "retailer" | "manufacturer",
    nextProfile?: any,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchIncomingOrdersForSeller(nextUid, nextSellerType, nextProfile);
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
    if (new URLSearchParams(window.location.search).get("tab") === "requests") {
      setActiveViewTab("requests");
    }
  }, []);

  // Badge count before the tab is opened.
  useEffect(() => {
    if (!sellerInfo?.phone) return;
    fetchOpenOffers(sellerInfo.phone)
      .then((rows) => setRequestCount(rows.length))
      .catch(() => undefined);
  }, [sellerInfo?.phone]);

  useEffect(() => {
    if (!effectiveUid || !effectiveProfile) return;
    const profile = effectiveProfile;
    const role = profile?.role;
    const hasOnlineDelivery = !!(profile as any)?.onlineDelivery;
    setOnlineDelivery(hasOnlineDelivery);
    if (role === "retailer" || role === "manufacturer") {
      const phone = String((profile as any)?.phone ?? "");
      setUid(effectiveUid);
      setSellerType(role);
      setSellerProfile(profile);
      setSellerInfo({
        name:  String((profile as any)?.businessName ?? (profile as any)?.shopName ?? (profile as any)?.name ?? ""),
        phone,
        gstin: String((profile as any)?.gstin ?? ""),
      });
      if (hasOnlineDelivery) {
        load(effectiveUid, role, profile);
      } else {
        setLoading(false);
      }
    } else {
      setUid(null);
      setSellerType(null);
      setOrders([]);
      setLoading(false);
    }
  }, [effectiveUid, effectiveProfile]);

  const onAdvance = async (orderId: string, status: OrderStatus) => {
    // Reject goes through a server route, not a bare status write: a paid
    // order needs its Razorpay refund issued (and the seller's Route
    // transfer reversed, if one already went out) as part of the SAME
    // action, so there's no way to reject a paid order and forget the
    // refund. See app/api/orders/reject and app/lib/order-refund.ts.
    if (status === "rejected") {
      const reason = window.prompt("Why are you rejecting this order? (shown to the customer)");
      if (reason === null) return; // cancelled the prompt
      if (!reason.trim()) {
        setActionError("A reason is required to reject an order.");
        return;
      }
      setUpdatingId(orderId);
      setActionError(null);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/orders/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({ orderId, reason }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not reject the order.");
        setActionInfo(
          json.reassigning
            ? `Order offered to ${json.candidates} other seller${json.candidates === 1 ? "" : "s"} who sell this online. If none accepts within 24 hours, the customer is refunded automatically.`
            : json.refunded
              ? "Order rejected and the customer refunded."
              : "Order rejected.",
        );
        if (uid && sellerType) await load(uid, sellerType, sellerProfile);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Could not reject the order.");
      } finally {
        setUpdatingId(null);
      }
      return;
    }

    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, status);
      if (uid && sellerType) await load(uid, sellerType, sellerProfile);
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
    { key: "placed",           label: `New (${statusCounts["placed"] || 0})`,                              color: "bg-amber-100 text-amber-800" },
    { key: "accepted",         label: `Accepted (${statusCounts["accepted"] || 0})`,                        color: "bg-blue-100 text-blue-800" },
    { key: "dispatched",       label: `Dispatched (${statusCounts["dispatched"] || 0})`,                    color: "bg-indigo-100 text-indigo-800" },
    { key: "out_for_delivery", label: `Out for Delivery (${statusCounts["out_for_delivery"] || 0})`,        color: "bg-purple-100 text-purple-800" },
    { key: "delivered",        label: `Delivered (${statusCounts["delivered"] || 0})`,                      color: "bg-green-100 text-green-800" },
    { key: "rejected",         label: `Rejected (${statusCounts["rejected"] || 0})`,                        color: "bg-red-100 text-red-800" },
    { key: "cancelled",        label: `Cancelled (${statusCounts["cancelled"] || 0})`,                      color: "bg-red-100 text-red-800" },
  ];

  return (
    <>
      <PageHeader
        title={t('incomingOrdersTitle')}
        description={t('ordersDesc')}
        helperKey="dashOrders"
      />

      {actionError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {actionInfo && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {actionInfo}
        </div>
      )}

      {!uid || !sellerType ? (
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          {t('signInForOrders')}
        </p>
      ) : onlineDelivery === false ? (
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 px-6 py-16 text-center">
          <div className="rounded-full bg-surface-container p-5">
            <Lock className="h-9 w-9 text-on-surface-variant/40" />
          </div>
          <div>
            <p className="text-base font-bold text-on-surface">Online Delivery is currently disabled.</p>
            <p className="mt-1.5 text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              Enable Online Delivery from your Profile to view and manage orders.
            </p>
          </div>
          <Link
            href="/dashboard/profile"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-all"
          >
            Go to Profile
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
            <button
              onClick={() => setActiveViewTab("requests")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeViewTab === "requests"
                  ? "bg-white text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              Requests
              {requestCount > 0 && (
                <span className="ml-1 bg-orange-100 text-orange-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {requestCount}
                </span>
              )}
            </button>
          </div>

          {activeViewTab === "requests" ? (
            <OrderRequestsPanel
              sellerPhone={sellerInfo?.phone ?? ""}
              onCountChange={setRequestCount}
              onAccepted={() => {
                if (uid && sellerType) void load(uid, sellerType, sellerProfile);
              }}
            />
          ) : activeViewTab === "payments" ? (
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
                            {formatCustomerAddress(order.customerAddress) && (
                              <p className="flex items-start gap-1 mt-1 text-xs text-on-surface-variant">
                                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                                {formatCustomerAddress(order.customerAddress)}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-secondary text-xl">₹{orderGrandTotal(order).toFixed(0)}</p>
                            {(order.deliveryCharge ?? 0) > 0 && (
                              <p className="text-[10px] text-on-surface-variant">incl. ₹{order.deliveryCharge} delivery</p>
                            )}
                            <p className="text-[10px] text-on-surface-variant">
                              {normalizeOrderItems(order.items as any).length} item{normalizeOrderItems(order.items as any).length !== 1 ? "s" : ""}
                              {order.invoiceNumber ? ` · ${order.invoiceNumber}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="border rounded-xl border-surface-container overflow-hidden">
                          {normalizeOrderItems(order.items as any).map((item, idx) => (
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

                        {/* What the seller actually receives */}
                        <PayoutBreakdown order={order} />

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
                            onClick={() => openInvoice(order, sellerInfo ? {
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
