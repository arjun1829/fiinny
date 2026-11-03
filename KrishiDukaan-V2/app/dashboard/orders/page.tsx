"use client";

import { PayoutTimelineView } from "../../components/shared/payout-timeline-view";
import { useKycPending } from "../_lib/use-kyc-pending";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  BadgeCheck,
  AlertCircle,
  IndianRupee,
  Download,
  Lock,
  RefreshCw,
  Search,
  X,
  FileText,
  Eye,
  ArrowUp,
  ArrowDown,
  Link2,
  Undo2,
  Shuffle,
  TrendingDown,
} from "lucide-react";
import { auth, fetchIncomingOrdersForSeller, fetchReroutedAwayOrdersForSeller, updateOrderStatus } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { formatCustomerAddress, normalizeOrderItems, orderGrandTotal } from "../../../types/order";
import { ORDER_STATUS_FLOW, REVERTABLE_STATUSES, isInvoiceReady, validRevertTargets, type OrderDoc, type OrderStatus } from "../../../types/order";
import { useI18n } from "../../i18n/I18nContext";
import { openInvoice } from "../../utils/invoice-generator";
import { OrderRequestsPanel } from "../_components/order-requests-panel";
import { fetchOpenOffers } from "../_lib/order-offers";
import { DispatchDialog, TrackingDialog } from "./_tracking-dialogs";
import { trackingSendsRemaining, MAX_TRACKING_SENDS } from "./_tracking";

// Progression shown to the seller. Imported rather than redeclared so the
// seller view, the customer view and the "can advance to" checks cannot drift.
const STATUS_FLOW: OrderStatus[] = ORDER_STATUS_FLOW;

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; badge: string; icon: typeof Clock }> = {
  placed:           { label: "Order Placed",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",   badge: "bg-amber-100 text-amber-800",   icon: Clock },
  accepted:         { label: "Accepted",         color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",     badge: "bg-blue-100 text-blue-800",     icon: CheckCircle2 },
  dispatched:       { label: "Dispatched",       color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", badge: "bg-indigo-100 text-indigo-800", icon: Package },
  out_for_delivery: { label: "Out for Delivery", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", badge: "bg-purple-100 text-purple-800", icon: Truck },
  delivered:        { label: "Delivered",        color: "text-green-700",  bg: "bg-green-50 border-green-200",   badge: "bg-green-100 text-green-800",   icon: Package },
  rejected:         { label: "Rejected",         color: "text-red-700",    bg: "bg-red-50 border-red-200",       badge: "bg-red-100 text-red-800",       icon: XCircle },
  cancelled:        { label: "Cancelled",        color: "text-red-700",    bg: "bg-red-50 border-red-200",       badge: "bg-red-100 text-red-800",       icon: XCircle },
  reassigning:      { label: "Offered to other sellers", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", badge: "bg-orange-100 text-orange-800", icon: RefreshCw },
};

/** A status read off a doc may be unexpected (legacy / mobile). Never index
 *  STATUS_CONFIG blindly — an undefined config crashes the whole row. */
const UNKNOWN_STATUS = { label: "Unknown", color: "text-on-surface-variant", bg: "bg-surface-container border-outline-variant/30", badge: "bg-surface-container text-on-surface-variant", icon: AlertCircle } as const;
function statusConfig(status: OrderStatus) {
  return STATUS_CONFIG[status] ?? { ...UNKNOWN_STATUS, label: String(status || "Unknown") };
}

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

type FilterTab = "all" | "rerouted" | OrderStatus;
type ViewTab = "orders" | "payments" | "requests";

function formatDate(createdAt: unknown): string {
  try {
    const date = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function orderMillis(createdAt: unknown): number {
  return (createdAt as any)?.toMillis?.() ?? (createdAt ? new Date(createdAt as string).getTime() || 0 : 0);
}

/** Date and time split onto separate lines, so the "Order Placed" column
 *  doesn't eat horizontal space on one long line. */
function formatDateParts(createdAt: unknown): { date: string; time: string } {
  try {
    const d = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return {
      date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: "—", time: "" };
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
  const kycPending = useKycPending();
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
      <div className="mt-4 border-t border-surface-container pt-3">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Where is my money?
        </p>
        <PayoutTimelineView order={order as never} kycPending={kycPending} />
      </div>
      <p className="mt-2.5 text-[10px] text-on-surface-variant">
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
  if (status === "rejected" || status === "cancelled") {
    const label = status === "cancelled" ? "Order Cancelled" : "Order Rejected";
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-2 text-red-600">
        <XCircle className="w-4 h-4" />
        <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(status === "reassigning" ? "placed" : status);

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

/**
 * The order's "Paid at" time. `payment.paidAt` is authoritative when present,
 * but the mobile checkout writes paid orders without it — so when it is absent
 * (and the order is paid) the authoritative capture time is fetched from the
 * server (paymentAttempts / Razorpay) via /api/payment/fee. The order's CREATE
 * time is never used as a stand-in. "…" while resolving, "—" when genuinely
 * unavailable.
 */
function PaidAtValue({ order }: { order: OrderDoc }) {
  const direct = order.payment?.paidAt;
  const isPaid = order.payment?.status === "paid";
  const [resolved, setResolved] = useState<string | null | undefined>(direct ?? undefined);

  useEffect(() => {
    if (direct) { setResolved(direct); return; }
    if (!isPaid) { setResolved(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) { if (!cancelled) setResolved(null); return; }
        const res = await fetch("/api/payment/fee", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId: order.id }),
        });
        const json = await res.json();
        if (!cancelled) setResolved(typeof json.paidAt === "string" ? json.paidAt : null);
      } catch {
        if (!cancelled) setResolved(null);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, direct, isPaid]);

  return <span className="font-semibold text-on-surface">{resolved === undefined ? "…" : formatDateStr(resolved ?? undefined)}</span>;
}

/** A sortable column header: clicking toggles the sort, and the active column
 *  shows the current direction. */
function SortableTh({ label, align = "left", active, dir, onClick }: {
  label: string; align?: "left" | "right"; active: boolean; dir: "asc" | "desc"; onClick: () => void;
}) {
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} text-[10px] font-black uppercase tracking-widest text-on-surface-variant`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} hover:text-on-surface transition-colors ${active ? "text-on-surface" : ""}`}
      >
        {label}
        {active
          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
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

/**
 * Full detail for one order, shown when its table row is clicked: customer and
 * address, every line item with quantities, the bill breakdown (delivery and
 * GST), payment information, the invoice, the status timeline and the payout.
 */
function OrderDetailModal({
  order,
  seller,
  actions,
  updating,
  onAdvance,
  onOpenTracking,
  onOpenRevert,
  onClose,
}: {
  order: OrderDoc;
  seller: { name: string; phone: string; gstin: string } | null;
  actions: { next: OrderStatus; label: string; color: string }[];
  updating: boolean;
  onAdvance: (orderId: string, status: OrderStatus) => void;
  onOpenTracking: (orderId: string) => void;
  onOpenRevert: (orderId: string) => void;
  onClose: () => void;
}) {
  const config = statusConfig(order.status);
  const items = normalizeOrderItems(order.items as any);
  const payment = order.payment;
  const grand = orderGrandTotal(order);
  const timeline = Array.isArray(order.statusHistory) ? order.statusHistory : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b px-5 py-3.5 ${config.bg}`}>
          <div className="flex items-center gap-2 min-w-0">
            <config.icon className={`w-4 h-4 shrink-0 ${config.color}`} />
            <div className="min-w-0">
              <p className="font-black text-on-surface truncate">#{order.id.slice(0, 8).toUpperCase()}</p>
              <p className={`text-[10px] font-black uppercase tracking-widest ${config.color}`}>{config.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PaymentBadge payment={payment} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-white/60 hover:text-on-surface"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <OrderProgressBar status={order.status} />

          {/* Customer + address */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-surface-container p-4 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Customer</p>
              <p className="text-sm font-bold text-on-surface">{order.customerName || "—"}</p>
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-bold">
                  <Phone className="w-3 h-3" /> {order.customerPhone}
                </a>
              )}
              {formatCustomerAddress(order.customerAddress) && (
                <p className="flex items-start gap-1 text-xs text-on-surface-variant pt-1">
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                  {formatCustomerAddress(order.customerAddress)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-surface-container p-4 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Order</p>
              <p className="text-xs text-on-surface-variant">Placed <span className="font-semibold text-on-surface">{formatDate(order.createdAt)}</span></p>
              {order.invoiceNumber && isInvoiceReady(order.status) && (
                <p className="text-xs text-on-surface-variant">Invoice <span className="font-mono font-semibold text-on-surface">{order.invoiceNumber}</span></p>
              )}
              <p className="text-xs text-on-surface-variant">Items <span className="font-semibold text-on-surface">{items.length}</span></p>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Products ordered</p>
            <div className="overflow-x-auto rounded-xl border border-surface-container">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="border-b border-surface-container bg-surface-container-lowest">
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Product</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Pack</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Price</th>
                    <th className="px-3 py-2 text-center font-black uppercase tracking-wider text-on-surface-variant">Qty</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={`${item.productId}-${item.variantUnit ?? ""}-${idx}`} className="border-b border-surface-container last:border-0">
                      <td className="px-3 py-2 font-semibold text-on-surface">{item.name}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{item.variantUnit || "—"}</td>
                      <td className="px-3 py-2 text-right text-on-surface-variant">₹{Number(item.price || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center font-bold text-on-surface">{item.qty}</td>
                      <td className="px-3 py-2 text-right font-bold text-on-surface">₹{Number(item.lineTotal || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-on-surface-variant">No line items recorded on this order.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bill breakdown */}
          <div className="rounded-xl border border-surface-container p-4 space-y-1.5 text-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Bill breakdown</p>
            <div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span className="font-semibold text-on-surface">₹{Number(order.subtotal || 0).toFixed(2)}</span></div>
            {!!order.totalGst && (
              <div className="flex justify-between"><span className="text-on-surface-variant">GST</span><span className="font-semibold text-on-surface">₹{Number(order.totalGst).toFixed(2)}</span></div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Delivery</span>
              <span className="font-semibold text-on-surface">
                {order.deliveryBreakdown?.free
                  ? <span className="text-green-700">FREE{order.deliveryBreakdown.waived ? <span className="ml-1 text-on-surface-variant line-through">₹{order.deliveryBreakdown.waived.toFixed(2)}</span> : null}</span>
                  : `₹${Number(order.deliveryCharge || 0).toFixed(2)}`}
              </span>
            </div>
            <div className="flex justify-between border-t border-surface-container pt-2 mt-1">
              <span className="font-bold text-on-surface">Grand total</span>
              <span className="font-black text-secondary">₹{grand.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="rounded-xl border border-surface-container p-4 space-y-2 text-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Payment</p>
            {payment ? (
              <>
                <div className="flex justify-between"><span className="text-on-surface-variant">Status</span><PaymentBadge payment={payment} /></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Amount</span><span className="font-semibold text-on-surface">₹{Number(payment.amount || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Payment ID</span><span className="font-mono text-xs text-on-surface break-all">{payment.razorpayPaymentId || "—"}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Razorpay order</span><span className="font-mono text-xs text-on-surface break-all">{payment.razorpayOrderId || "—"}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Paid at</span><PaidAtValue order={order} /></div>
                {!!payment.refundedAmount && <div className="flex justify-between"><span className="text-on-surface-variant">Refunded</span><span className="font-semibold text-on-surface">₹{Number(payment.refundedAmount).toFixed(2)}</span></div>}
              </>
            ) : (
              <p className="text-xs text-on-surface-variant">No online payment on this order (cash on delivery or payment pending).</p>
            )}
          </div>

          {/* Payout */}
          <PayoutBreakdown order={order} />

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="rounded-xl border border-surface-container p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">Order timeline</p>
              <ol className="space-y-2.5">
                {[...timeline]
                  .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                  .map((entry, idx) => {
                    const c = statusConfig(entry.status);
                    return (
                      <li key={`${entry.status}-${entry.at}-${idx}`} className="flex items-start gap-3 text-sm">
                        <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${entry.revert ? "bg-amber-100 text-amber-700" : c.badge}`}>
                          {entry.revert ? <Undo2 className="h-3 w-3" /> : <c.icon className="h-3 w-3" />}
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-on-surface">
                            {entry.revert && entry.from
                              ? `Reverted ${statusConfig(entry.from).label} → ${c.label}`
                              : c.label}
                          </span>
                          {entry.revert && entry.reason && (
                            <p className="text-xs text-on-surface-variant">
                              {entry.reason}{entry.byRole ? ` · by ${entry.byRole}` : ""}
                            </p>
                          )}
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-on-surface-variant">{formatDateStr(entry.at)}</span>
                      </li>
                    );
                  })}
              </ol>
            </div>
          )}

          {/* Shipment tracking — only once the parcel has left the seller */}
          {["dispatched", "out_for_delivery", "delivered"].includes(order.status) && (() => {
            const remaining = trackingSendsRemaining(order);
            const used = MAX_TRACKING_SENDS - remaining;
            const link = order.tracking?.url;
            return (
              <div className="rounded-xl border border-surface-container p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Shipment tracking</p>
                  <span className="text-[10px] font-bold text-on-surface-variant">{used}/{MAX_TRACKING_SENDS} sent · {remaining} left</span>
                </div>
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 break-all text-xs font-semibold text-primary hover:underline">
                    <Link2 className="mt-0.5 h-3 w-3 shrink-0" /> {link}
                  </a>
                ) : (
                  <p className="text-xs text-on-surface-variant">No tracking link added yet.</p>
                )}
                <button
                  type="button"
                  onClick={() => onOpenTracking(order.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary transition-all hover:bg-primary/10"
                >
                  <Link2 className="h-3 w-3" />
                  {link ? (used > 0 ? "Resend / Update Link" : "Send Tracking Link") : "Add Tracking Link"}
                </button>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-surface-container pt-4">
            {actions.map((action) => (
              <button
                key={action.next}
                disabled={updating}
                onClick={() => onAdvance(order.id, action.next)}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${action.color}`}
              >
                {updating ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Updating…
                  </span>
                ) : (
                  action.label
                )}
              </button>
            ))}
            {/* The invoice exists once the order is accepted — not while it can still be rejected. */}
            {isInvoiceReady(order.status) && (
              <button
                type="button"
                onClick={() => openInvoice(order, seller ? { name: seller.name, phone: seller.phone, gstin: seller.gstin || undefined } : undefined)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-outline-variant/50 bg-white text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Download Invoice
              </button>
            )}
            {REVERTABLE_STATUSES.includes(order.status) && order.status !== "delivered" && (
              <button
                type="button"
                disabled={updating}
                onClick={() => onOpenRevert(order.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" /> Revert Status
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirm-and-revert dialog for an order that was advanced too far. Lets the
 * seller/admin pick an EARLIER valid status, supply a mandatory reason, and
 * confirm. The actual write (with its payout-safety and audit handling) happens
 * server-side in /api/orders/revert-status — this only collects the inputs.
 */
function RevertStatusDialog({
  order,
  onCancel,
  onDone,
}: {
  order: OrderDoc;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const targets = validRevertTargets(order.status);
  const [toStatus, setToStatus] = useState<OrderStatus | "">(targets[targets.length - 1] ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = async () => {
    if (!toStatus) { setError("Choose a status to revert to."); return; }
    if (!reason.trim()) { setError("A reason is required."); return; }
    setBusy(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/orders/revert-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ orderId: order.id, toStatus, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not revert the order status.");
      onDone(`Order reverted to ${statusConfig(toStatus as OrderStatus).label}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revert the order status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-surface-container px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-on-surface-variant" />
            <p className="font-black text-on-surface">Revert order status</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-on-surface-variant">
            This order is currently <span className="font-bold text-on-surface">{statusConfig(order.status).label}</span>.
            Choose the status to move it back to. The customer is <span className="font-semibold">not</span> re-notified, and no
            payout or refund is changed.
          </p>

          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Revert to</p>
            <div className="flex flex-col gap-1.5">
              {targets.map((s) => {
                const c = statusConfig(s);
                return (
                  <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${toStatus === s ? "border-primary bg-primary/5" : "border-surface-container hover:bg-surface-container-low"}`}>
                    <input type="radio" name="revert-target" value={s} checked={toStatus === s} onChange={() => setToStatus(s)} className="accent-primary" />
                    <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                    <span className="font-semibold text-on-surface">{c.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Reason <span className="text-red-600">*</span></p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this status being reverted? (recorded in the order history)"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-outline-variant/50 bg-white px-4 py-2 text-xs font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <><div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Reverting…</> : <><Undo2 className="h-3.5 w-3.5" /> Revert Status</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { t } = useI18n();
  const { uid: effectiveUid, profile: effectiveProfile } = useEffectiveUser();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [reroutedOrders, setReroutedOrders] = useState<OrderDoc[]>([]);
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
  const [search, setSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentSort, setPaymentSort] = useState<{ key: "date" | "amount"; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>("orders");
  const [sellerInfo, setSellerInfo] = useState<{ name: string; phone: string; gstin: string } | null>(null);
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dispatchForId, setDispatchForId] = useState<string | null>(null);
  const [trackingForId, setTrackingForId] = useState<string | null>(null);
  const [revertForId, setRevertForId] = useState<string | null>(null);

  // One identity-expanded read of every order filed under any of this seller's
  // keys (sellerId/sellerPhone, across uid/phone forms and uidIndex). The SAME
  // array drives the table, the filter tabs and every count — so the numbers
  // can never disagree with the rows, which is what the old stats-vs-pager
  // split caused.
  const loadGen = useRef(0);

  const load = async (nextUid: string, _nextSellerType: "retailer" | "manufacturer", nextProfile?: any) => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    try {
      const docs = await fetchIncomingOrdersForSeller(nextUid, _nextSellerType, nextProfile);
      if (gen !== loadGen.current) return;
      setOrders(docs);
      // Also fetch orders that were rerouted away from this seller (adminReassignment.fromSellerPhone).
      // Build the same phone candidate set the main query uses.
      const phones = new Set<string>();
      if (nextProfile?.phone) {
        const p = String(nextProfile.phone).replace(/\D/g, "");
        if (p.length === 10) { phones.add(p); phones.add(`+91${p}`); }
        else if (p.length === 12 && p.startsWith("91")) { phones.add(`+${p}`); phones.add(p.slice(2)); }
        phones.add(String(nextProfile.phone));
      }
      if (nextUid) phones.add(nextUid);
      fetchReroutedAwayOrdersForSeller(Array.from(phones).filter(Boolean))
        .then((rerouted) => { if (gen === loadGen.current) setReroutedOrders(rerouted); })
        .catch(() => {});
    } catch (e) {
      if (gen !== loadGen.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load orders.";
      setError(msg);
      setOrders([]);
    } finally {
      if (gen === loadGen.current) setLoading(false);
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
    // Dispatch opens a dialog (optional tracking link + WhatsApp send) rather
    // than writing the status directly — the dialog performs the status change
    // itself and then saves/sends the link through /api/orders/tracking.
    if (status === "dispatched") {
      setDispatchForId(orderId);
      return;
    }

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
        setSelectedId(null);
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

  // ── Counts, derived from the single loaded dataset so they always match ──
  const statusCounts = useMemo(
    () => orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {}),
    [orders],
  );
  const totalCount = orders.length + reroutedOrders.length;
  const paidOrders = useMemo(() => orders.filter((o) => o.payment?.status === "paid"), [orders]);
  const paidOrdersCount = paidOrders.length;
  const totalRevenue = useMemo(() => paidOrders.reduce((sum, o) => sum + (o.payment?.amount || 0), 0), [paidOrders]);

  // Lost value: rejected orders + rerouted-away orders (no double-counting: they are disjoint sets).
  const lostValue = useMemo(() => {
    const rejectedLost = orders
      .filter((o) => o.status === "rejected")
      .reduce((s, o) => s + orderGrandTotal(o), 0);
    const reroutedLost = reroutedOrders.reduce((s, o) => s + orderGrandTotal(o), 0);
    return rejectedLost + reroutedLost;
  }, [orders, reroutedOrders]);

  // Filter + search run over the combined order list (regular + rerouted-away).
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Rerouted-away orders are shown only in the "All" and "Rerouted" tabs.
    const combined = [
      ...orders,
      // Tag rerouted orders with a virtual status for filtering. We use a marker
      // property rather than mutating the doc — callers check isRerouted(o).
      ...reroutedOrders.map((o) => ({ ...o, _reroutedAway: true as const })),
    ];
    return combined.filter((o) => {
      const isRerouted = (o as any)._reroutedAway === true;
      if (activeFilter === "rerouted") return isRerouted;
      if (activeFilter !== "all" && o.status !== activeFilter) return false;
      if (!q) return true;
      const haystack = [o.id, o.invoiceNumber, o.customerName, o.customerPhone]
        .filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, reroutedOrders, activeFilter, search]);

  // Payments tab: regular + rerouted-away orders combined, searched and sorted.
  const paymentRows = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    const all = [
      ...orders,
      ...reroutedOrders.map((o) => ({ ...o, _reroutedAway: true as const })),
    ];
    const rows = all.filter((o) => {
      if (!q) return true;
      const haystack = [o.id, o.invoiceNumber, o.customerName, o.customerPhone]
        .filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const dir = paymentSort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const va = paymentSort.key === "amount" ? (a.payment?.amount ?? 0) : orderMillis(a.createdAt);
      const vb = paymentSort.key === "amount" ? (b.payment?.amount ?? 0) : orderMillis(b.createdAt);
      return (va - vb) * dir;
    });
  }, [orders, reroutedOrders, paymentSearch, paymentSort]);

  const togglePaymentSort = (key: "date" | "amount") =>
    setPaymentSort((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "desc" });

  const selectedOrder = selectedId
    ? (orders.find((o) => o.id === selectedId) ?? reroutedOrders.find((o) => o.id === selectedId) ?? null)
    : null;
  const isSelectedRerouted = selectedId
    ? (reroutedOrders.some((o) => o.id === selectedId))
    : false;

  const FILTER_TABS: { key: FilterTab; label: string; color: string }[] = [
    { key: "all",              label: `All (${totalCount})`,                                                 color: "bg-surface-container text-on-surface" },
    { key: "placed",           label: `New (${statusCounts["placed"] || 0})`,                                color: "bg-amber-100 text-amber-800" },
    { key: "accepted",         label: `Accepted (${statusCounts["accepted"] || 0})`,                         color: "bg-blue-100 text-blue-800" },
    { key: "dispatched",       label: `Dispatched (${statusCounts["dispatched"] || 0})`,                     color: "bg-indigo-100 text-indigo-800" },
    { key: "out_for_delivery", label: `Out for Delivery (${statusCounts["out_for_delivery"] || 0})`,         color: "bg-purple-100 text-purple-800" },
    { key: "delivered",        label: `Delivered (${statusCounts["delivered"] || 0})`,                       color: "bg-green-100 text-green-800" },
    { key: "rejected",         label: `Rejected (${statusCounts["rejected"] || 0})`,                         color: "bg-red-100 text-red-800" },
    { key: "cancelled",        label: `Cancelled (${statusCounts["cancelled"] || 0})`,                       color: "bg-red-100 text-red-800" },
    ...(statusCounts["reassigning"] ? [{ key: "reassigning" as FilterTab, label: `Reassigning (${statusCounts["reassigning"]})`, color: "bg-orange-100 text-orange-800" }] : []),
    ...(reroutedOrders.length > 0 ? [{ key: "rerouted" as FilterTab, label: `Rerouted (${reroutedOrders.length})`, color: "bg-orange-100 text-orange-800" }] : []),
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
          {/* View tabs: Orders | Payments | Requests */}
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
              Orders ({totalCount})
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                {lostValue > 0 && (
                  <div className="rounded-2xl bg-red-50 border border-red-100 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Lost Value</p>
                      <p className="text-xl font-black text-red-700">₹{lostValue.toLocaleString("en-IN")}</p>
                      <p className="text-[10px] text-red-500">Rejected + rerouted</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                <input
                  type="text"
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  placeholder="Search by order ID, customer name or phone number…"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low py-2.5 pl-9 pr-9 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none"
                />
                {paymentSearch && (
                  <button
                    type="button"
                    onClick={() => setPaymentSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <p className="text-xs text-on-surface-variant">
                Showing <span className="font-bold text-on-surface">{paymentRows.length}</span> of {totalCount} orders
              </p>

              {/* Payment table */}
              {paymentRows.length === 0 ? (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
                  No payment records match this search.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-white shadow-sm">
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Order ID</th>
                        <SortableTh label="Order Placed" active={paymentSort.key === "date"} dir={paymentSort.dir} onClick={() => togglePaymentSort("date")} />
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Customer Name</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Phone Number</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Items</th>
                        <SortableTh label="Amount Paid" align="right" active={paymentSort.key === "amount"} dir={paymentSort.dir} onClick={() => togglePaymentSort("amount")} />
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Payment Method</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Razorpay Payment ID</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Payment Status</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((order) => {
                        const isReroutedAway = (order as any)._reroutedAway === true;
                        const items = normalizeOrderItems(order.items as any);
                        const isPaid = order.payment?.status === "paid";
                        const method = isReroutedAway ? "Rerouted" : (order.payment ? "Razorpay (online)" : "COD / Unpaid");
                        return (
                          <tr
                            key={`${order.id}${isReroutedAway ? "-rerouted" : ""}`}
                            onClick={() => setSelectedId(order.id)}
                            className={`cursor-pointer border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/60 transition-colors ${isReroutedAway ? "bg-orange-50/30" : ""}`}
                          >
                            <td className="px-4 py-3 align-top">
                              <span className="font-mono font-bold text-primary">{order.id.slice(0, 8).toUpperCase()}</span>
                              {!isReroutedAway && order.invoiceNumber && isInvoiceReady(order.status) && <p className="text-[10px] text-on-surface-variant">{order.invoiceNumber}</p>}
                              {isReroutedAway && <p className="text-[10px] text-orange-600 font-semibold">Routed to a different store</p>}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-on-surface-variant">
                              {(() => {
                                const { date, time } = formatDateParts(order.createdAt);
                                return (
                                  <>
                                    <span className="block whitespace-nowrap font-medium text-on-surface">{date}</span>
                                    {time && <span className="block whitespace-nowrap">{time}</span>}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 align-top font-semibold text-on-surface">{order.customerName || "—"}</td>
                            <td className="px-4 py-3 align-top text-xs text-on-surface-variant whitespace-nowrap">{order.customerPhone || "—"}</td>
                            <td className="px-4 py-3 align-top text-xs text-on-surface-variant max-w-[200px]">
                              <span className="line-clamp-2">
                                {items.map((i) => `${i.name}${i.variantUnit ? ` (${i.variantUnit})` : ""} ×${i.qty}`).join(", ") || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-right font-black text-on-surface">
                              {isReroutedAway ? `₹${orderGrandTotal(order).toFixed(2)}` : (isPaid ? `₹${Number(order.payment?.amount || 0).toFixed(2)}` : "—")}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-on-surface-variant whitespace-nowrap">{method}</td>
                            <td className="px-4 py-3 align-top">
                              <span className="font-mono text-xs text-on-surface break-all">{order.payment?.razorpayPaymentId || "—"}</span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {isReroutedAway ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold uppercase tracking-wider">
                                  <Shuffle className="w-3 h-3" /> Rerouted
                                </span>
                              ) : (
                                <PaymentBadge payment={order.payment} />
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(order.id)}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-outline-variant/50 bg-white px-2.5 py-1.5 text-[10px] font-bold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                              >
                                <Eye className="w-3 h-3" /> View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* ── ORDERS TAB (Excel-style table) ── */
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by order ID or customer name…"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low py-2.5 pl-9 pr-9 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Order-status filter tabs */}
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

              <p className="text-xs text-on-surface-variant">
                Showing <span className="font-bold text-on-surface">{filteredOrders.length}</span> of {totalCount} orders
              </p>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
                  No orders match these filters.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-outline-variant/20 bg-white shadow-sm">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant/20 bg-surface-container-lowest">
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Order ID</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Order Placed</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Customer</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Items</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Order Amount</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Payment Status</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Order Status</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => {
                        const isReroutedAway = (order as any)._reroutedAway === true;
                        const config = isReroutedAway
                          ? { badge: "bg-orange-100 text-orange-800", label: "Rerouted", icon: Shuffle }
                          : statusConfig(order.status);
                        const actions = isReroutedAway ? [] : (NEXT_ACTIONS[order.status] || []);
                        const items = normalizeOrderItems(order.items as any);
                        const isUpdating = updatingId === order.id;
                        return (
                          <tr
                            key={`${order.id}${isReroutedAway ? "-rerouted" : ""}`}
                            onClick={() => setSelectedId(order.id)}
                            className={`cursor-pointer border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/60 transition-colors ${isReroutedAway ? "bg-orange-50/30" : ""}`}
                          >
                            <td className="px-4 py-3 align-top">
                              <span className="font-mono font-bold text-primary">{order.id.slice(0, 8).toUpperCase()}</span>
                              {isReroutedAway && (
                                <p className="text-[10px] text-orange-600 font-semibold">Routed to a different store</p>
                              )}
                              {!isReroutedAway && order.invoiceNumber && isInvoiceReady(order.status) && (
                                <p className="text-[10px] text-on-surface-variant">{order.invoiceNumber}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-on-surface-variant">
                              {(() => {
                                const { date, time } = formatDateParts(order.createdAt);
                                return (
                                  <>
                                    <span className="block whitespace-nowrap font-medium text-on-surface">{date}</span>
                                    {time && <span className="block whitespace-nowrap">{time}</span>}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="font-semibold text-on-surface">{order.customerName || "—"}</p>
                              {order.customerPhone && <p className="text-xs text-on-surface-variant">{order.customerPhone}</p>}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-on-surface-variant max-w-[220px]">
                              <span className="line-clamp-2">
                                {items.map((i) => `${i.name}${i.variantUnit ? ` (${i.variantUnit})` : ""} ×${i.qty}`).join(", ") || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-right">
                              <p className="font-black text-on-surface">₹{orderGrandTotal(order).toFixed(0)}</p>
                              {(order.deliveryCharge ?? 0) > 0 && (
                                <p className="text-[10px] text-on-surface-variant">incl. ₹{order.deliveryCharge} delivery</p>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {isReroutedAway ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold uppercase tracking-wider">
                                  <Shuffle className="w-3 h-3" /> Rerouted
                                </span>
                              ) : (
                                <PaymentBadge payment={order.payment} />
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${config.badge}`}>
                                <config.icon className="h-3 w-3" /> {config.label}
                              </span>
                              {isReroutedAway && order.adminReassignment?.reason && (
                                <p className="mt-0.5 text-[10px] text-on-surface-variant truncate max-w-[180px]" title={order.adminReassignment.reason}>
                                  {order.adminReassignment.reason}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {!isReroutedAway && actions.length > 0 && (
                                  <div className="flex flex-nowrap items-center gap-1.5">
                                    {actions.map((action) => (
                                      <button
                                        key={action.next}
                                        disabled={isUpdating}
                                        onClick={() => void onAdvance(order.id, action.next)}
                                        className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${action.color}`}
                                      >
                                        {isUpdating ? "…" : action.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {!isReroutedAway && REVERTABLE_STATUSES.includes(order.status) && order.status !== "delivered" && (
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => setRevertForId(order.id)}
                                    title="Revert Status"
                                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-50"
                                  >
                                    <Undo2 className="w-3 h-3" /> Revert
                                  </button>
                                )}
                                {!isReroutedAway && isInvoiceReady(order.status) && (
                                  <button
                                    type="button"
                                    onClick={() => openInvoice(order, sellerInfo ? { name: sellerInfo.name, phone: sellerInfo.phone, gstin: sellerInfo.gstin || undefined } : undefined)}
                                    title="Download Invoice"
                                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-outline-variant/50 bg-white px-2.5 py-1.5 text-[10px] font-bold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                                  >
                                    <FileText className="w-3 h-3" /> Invoice
                                  </button>
                                )}
                                {isReroutedAway && (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[10px] font-bold text-orange-600">
                                    <Shuffle className="w-3 h-3" /> View only
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          seller={sellerInfo}
          actions={isSelectedRerouted ? [] : (NEXT_ACTIONS[selectedOrder.status] || [])}
          updating={updatingId === selectedOrder.id}
          onAdvance={onAdvance}
          onOpenTracking={(id) => setTrackingForId(id)}
          onOpenRevert={(id) => setRevertForId(id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {dispatchForId && (() => {
        const o = orders.find((x) => x.id === dispatchForId);
        if (!o) return null;
        return (
          <DispatchDialog
            order={o}
            onCancel={() => setDispatchForId(null)}
            onDone={async (message) => {
              setDispatchForId(null);
              setActionInfo(message);
              if (uid && sellerType) await load(uid, sellerType, sellerProfile);
            }}
          />
        );
      })()}

      {trackingForId && (() => {
        const o = orders.find((x) => x.id === trackingForId);
        if (!o) return null;
        return (
          <TrackingDialog
            order={o}
            onCancel={() => setTrackingForId(null)}
            onDone={async (message) => {
              setTrackingForId(null);
              setActionInfo(message);
              if (uid && sellerType) await load(uid, sellerType, sellerProfile);
            }}
          />
        );
      })()}

      {revertForId && (() => {
        const o = orders.find((x) => x.id === revertForId);
        if (!o || !REVERTABLE_STATUSES.includes(o.status)) return null;
        return (
          <RevertStatusDialog
            order={o}
            onCancel={() => setRevertForId(null)}
            onDone={async (message) => {
              setRevertForId(null);
              setActionError(null);
              setActionInfo(message);
              if (uid && sellerType) await load(uid, sellerType, sellerProfile);
            }}
          />
        );
      })()}
    </>
  );
}
