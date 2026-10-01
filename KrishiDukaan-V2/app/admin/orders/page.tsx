"use client";

/**
 * Admin → Orders. Platform-wide order ledger.
 *
 * Exists to answer the question a Razorpay payout alone can't: a payment
 * landed — WHICH products, from WHICH store, for WHICH customer? So the
 * Razorpay payment/order IDs are first-class here (rendered on the row and
 * matched by the search box), and every row expands to its line items.
 */

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  ShoppingCart,
  Search,
  AlertTriangle,
  IndianRupee,
  Store,
  Factory,
  ChevronDown,
  Package,
  CreditCard,
  Download,
  RefreshCw,
  Phone,
  MapPin,
  FileText,
  X,
  Undo2,
  Loader2,
} from "lucide-react";
import { getOrders, invalidateCache, CACHE_KEYS } from "../_lib/admin-data";
import { formatCustomerAddress, normalizeOrderItems, orderGrandTotal } from "../../../types/order";
import type { OrderDoc, OrderStatus, PaymentStatus } from "../../../types/order";
import { openInvoice } from "../../utils/invoice-generator";

const STATUS_META: Record<OrderStatus, { label: string; badge: string }> = {
  placed:           { label: "Placed",           badge: "bg-amber-100 text-amber-700" },
  accepted:         { label: "Accepted",         badge: "bg-blue-100 text-blue-700" },
  dispatched:       { label: "Dispatched",       badge: "bg-indigo-100 text-indigo-700" },
  out_for_delivery: { label: "Out for Delivery", badge: "bg-purple-100 text-purple-700" },
  delivered:        { label: "Delivered",        badge: "bg-green-100 text-green-700" },
  rejected:         { label: "Rejected",         badge: "bg-red-100 text-red-700" },
  cancelled:        { label: "Cancelled",        badge: "bg-red-100 text-red-700" },
  reassigning:      { label: "Reassigning",      badge: "bg-orange-100 text-orange-700" },
};

const PAYMENT_META: Record<PaymentStatus, { label: string; badge: string }> = {
  paid:     { label: "Paid",     badge: "bg-green-100 text-green-700" },
  pending:  { label: "Pending",  badge: "bg-amber-100 text-amber-700" },
  failed:   { label: "Failed",   badge: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", badge: "bg-gray-200 text-gray-700" },
};

/** Orders written before Razorpay was wired up carry no `payment` field at all. */
const NO_PAYMENT_BADGE = "bg-gray-100 text-gray-500";

type StatusFilter = "all" | OrderStatus;
type PaymentFilter = "all" | PaymentStatus | "none";
type SellerFilter = "all" | "retailer" | "manufacturer";
type DateFilter = "all" | "today" | "7d" | "30d" | "custom";

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toMillis(createdAt: unknown): number {
  return (createdAt as any)?.toMillis?.() ?? 0;
}

function formatDate(createdAt: unknown): string {
  const ms = toMillis(createdAt);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function inr(n: number | undefined): string {
  return `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Both totals and item field names differ web-vs-mobile — see types/order.ts. */
const orderTotal = orderGrandTotal;
const itemsOf = (o: OrderDoc) => normalizeOrderItems(o.items as any);

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
      <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-lg sm:text-2xl font-black text-on-surface truncate">{value}</p>
        <p className="text-[10px] sm:text-xs font-semibold text-on-surface-variant">{label}</p>
        {sub && <p className="text-[10px] text-on-surface-variant/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function FilterPills<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { key: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
            value === opt.key
              ? "bg-primary text-white shadow-sm"
              : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className={value === opt.key ? "opacity-80" : "opacity-60"}> ({opt.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Admin's general-purpose refund tool — issue a full or partial refund on any
 * order, any status, via /api/admin/order-refund (which reverses the
 * seller's Route transfer first when one already went out, then refunds the
 * customer through Razorpay). Distinct from the seller/customer flows that
 * refund automatically as part of rejecting or cancelling — this is for the
 * cases neither of those cover: a damaged item after delivery, a partial
 * refund, or admin acting because the customer called support instead of
 * using their own Cancel Order button.
 */
function RefundPanel({ order, onRefunded }: { order: OrderDoc; onRefunded: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ refundId: string; refundAmount: number; full: boolean } | null>(null);

  const payment = order.payment;
  const alreadyRefunded = Boolean((payment as any)?.refundId);

  if (!payment?.razorpayPaymentId) {
    return (
      <p className="text-xs text-on-surface-variant">No online payment on this order to refund.</p>
    );
  }
  if (alreadyRefunded) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <Undo2 className="h-3.5 w-3.5" /> Refunded — {(payment as any).refundId}
        {(payment as any).refundedAmount ? ` (${inr((payment as any).refundedAmount)})` : ""}
      </p>
    );
  }

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("A refund reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/order-refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          orderId: order.id,
          reason: trimmedReason,
          ...(amount.trim() ? { amount: Number(amount) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Refund failed.");
      setResult({ refundId: json.refundId, refundAmount: json.refundAmount, full: json.full });
      onRefunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-green-700">
        <Undo2 className="h-3.5 w-3.5" /> Refunded {inr(result.refundAmount)} — {result.refundId}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
      >
        <Undo2 className="h-3.5 w-3.5" /> Refund
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Full (${inr(orderTotal(order))})`}
          className="w-36 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (shown on the refund record)"
          className="min-w-[220px] flex-1 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          {busy ? "Refunding…" : "Confirm refund"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Line items + payment/delivery detail — the "what and where" of the order. */
function OrderDetail({ order, onRefunded }: { order: OrderDoc; onRefunded: () => void }) {
  return (
    <div className="bg-surface-container-low/60 px-4 sm:px-5 py-4 space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          Products ordered
        </p>
        <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container-lowest">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Product</th>
                <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Pack</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Price</th>
                <th className="px-3 py-2 text-center font-black uppercase tracking-wider text-on-surface-variant">Qty</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Line total</th>
              </tr>
            </thead>
            <tbody>
              {itemsOf(order).map((item, idx) => (
                <tr key={`${item.productId}-${item.variantUnit ?? ""}-${idx}`} className="border-b border-outline-variant/10 last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-semibold text-on-surface">{item.name}</p>
                    <p className="text-[10px] text-on-surface-variant font-mono">{item.productId}</p>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{item.variantUnit || "—"}</td>
                  <td className="px-3 py-2 text-right text-on-surface-variant">{inr(item.price)}</td>
                  <td className="px-3 py-2 text-center font-bold text-on-surface">{item.qty}</td>
                  <td className="px-3 py-2 text-right font-bold text-on-surface">{inr(item.lineTotal)}</td>
                </tr>
              ))}
              {itemsOf(order).length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-on-surface-variant">No line items recorded on this order.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Deliver to</p>
          <p className="text-xs font-semibold text-on-surface">{order.customerName || "—"}</p>
          <p className="text-xs text-on-surface-variant flex items-center gap-1">
            <Phone className="h-3 w-3 shrink-0" />{order.customerPhone || "—"}
          </p>
          <p className="text-xs text-on-surface-variant flex items-start gap-1">
            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
            <span>{formatCustomerAddress(order.customerAddress) || "—"}</span>
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Seller keying</p>
          <p className="text-[11px] text-on-surface-variant break-all">
            sellerId <span className="font-mono text-on-surface">{order.sellerId || "—"}</span>
          </p>
          <p className="text-[11px] text-on-surface-variant break-all">
            sellerPhone <span className="font-mono text-on-surface">{order.sellerPhone || "—"}</span>
          </p>
          <p className="text-[11px] text-on-surface-variant">
            sellerType <span className="font-mono text-on-surface">{order.sellerType || "—"}</span>
          </p>
          <p className="text-[10px] text-on-surface-variant/70 mt-1">
            Web orders key sellerId to a UID, mobile to a phone.
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Payment</p>
          {order.payment ? (
            <>
              <p className="text-xs text-on-surface-variant">
                Amount <span className="font-bold text-on-surface">{inr(order.payment.amount)}</span>
              </p>
              <p className="text-[11px] text-on-surface-variant break-all">
                Payment ID <span className="font-mono text-on-surface">{order.payment.razorpayPaymentId || "—"}</span>
              </p>
              <p className="text-[11px] text-on-surface-variant break-all">
                RZP order <span className="font-mono text-on-surface">{order.payment.razorpayOrderId || "—"}</span>
              </p>
              {order.payment.paidAt && (
                <p className="text-[11px] text-on-surface-variant">
                  Paid {new Date(order.payment.paidAt).toLocaleString("en-IN")}
                </p>
              )}
              <div className="pt-1">
                <RefundPanel order={order} onRefunded={onRefunded} />
              </div>
            </>
          ) : (
            <p className="text-xs text-on-surface-variant">No payment record on this order (cash / pre-Razorpay).</p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Bill breakdown</p>
          <p className="text-xs text-on-surface-variant">Subtotal <span className="font-semibold text-on-surface">{inr(order.subtotal)}</span></p>
          {!!order.totalGst && <p className="text-xs text-on-surface-variant">GST <span className="font-semibold text-on-surface">{inr(order.totalGst)}</span></p>}
          <p className="text-xs text-on-surface-variant">Delivery <span className="font-semibold text-on-surface">{inr(order.deliveryCharge)}</span></p>
          <p className="text-xs text-on-surface-variant">Grand total <span className="font-black text-on-surface">{inr(orderTotal(order))}</span></p>
          <button
            type="button"
            onClick={() => openInvoice(order)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" /> Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [sellerFilter, setSellerFilter] = useState<SellerFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadOrders = (force = false) => {
    if (force) invalidateCache(CACHE_KEYS.orders);
    setLoading(true);
    setError(null);
    getOrders({ force })
      .then(setOrders)
      .catch((err) => {
        console.error("Failed to load orders:", err);
        setError(
          err?.code === "permission-denied"
            ? "Firestore denied read access to /orders. Deploy the updated firestore.rules (the admin/team read clause) and retry."
            : "Failed to load orders from Firestore. Check your connection and retry."
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadOrders, []);

  const counts = useMemo(() => {
    const paidOrders = orders.filter((o) => o.payment?.status === "paid");
    return {
      total: orders.length,
      paid: paidOrders.length,
      revenue: paidOrders.reduce((sum, o) => sum + (o.payment?.amount ?? orderTotal(o)), 0),
      gross: orders.reduce((sum, o) => sum + orderTotal(o), 0),
      unpaid: orders.filter((o) => !o.payment || o.payment.status !== "paid").length,
      byStatus: orders.reduce<Record<string, number>>((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }, [orders]);

  // Bounds derived once per render of the filter, not per order — a fresh
  // `new Date()` per row would just be wasted work in a filter this size.
  const dateBounds = useMemo((): { from: number | null; to: number | null } => {
    const now = Date.now();
    switch (dateFilter) {
      case "today": {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return { from: start.getTime(), to: null };
      }
      case "7d":
        return { from: now - 7 * 24 * 60 * 60 * 1000, to: null };
      case "30d":
        return { from: now - 30 * 24 * 60 * 60 * 1000, to: null };
      case "custom":
        return {
          from: customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null,
          to: customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : null,
        };
      default:
        return { from: null, to: null };
    }
  }, [dateFilter, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (sellerFilter !== "all" && o.sellerType !== sellerFilter) return false;
      if (paymentFilter === "none" && o.payment) return false;
      if (paymentFilter !== "all" && paymentFilter !== "none" && o.payment?.status !== paymentFilter) return false;
      if (dateBounds.from !== null || dateBounds.to !== null) {
        const ms = toMillis(o.createdAt);
        if (dateBounds.from !== null && ms < dateBounds.from) return false;
        if (dateBounds.to !== null && ms > dateBounds.to) return false;
      }
      if (!q) return true;
      // Searched haystack deliberately includes Razorpay IDs and product names —
      // the two things an admin has in hand when reconciling a payout.
      const haystack = [
        o.id,
        o.invoiceNumber,
        o.customerName,
        o.customerPhone,
        formatCustomerAddress(o.customerAddress),
        o.sellerName,
        o.sellerId,
        o.sellerPhone,
        o.payment?.razorpayPaymentId,
        o.payment?.razorpayOrderId,
        ...itemsOf(o).map((i) => i.name),
        ...itemsOf(o).map((i) => i.productId),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search, statusFilter, paymentFilter, sellerFilter, dateBounds]);

  const exportCsv = () => {
    const header = [
      "Order ID", "Invoice", "Date", "Customer", "Customer Phone", "Store / Seller",
      "Seller Type", "Products", "Qty", "Subtotal", "GST", "Delivery", "Grand Total",
      "Order Status", "Payment Status", "Razorpay Payment ID", "Razorpay Order ID",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((o) => [
      o.id,
      o.invoiceNumber ?? "",
      formatDate(o.createdAt),
      o.customerName,
      o.customerPhone,
      o.sellerName ?? o.sellerId,
      o.sellerType,
      itemsOf(o).map((i) => `${i.name}${i.variantUnit ? ` (${i.variantUnit})` : ""} x${i.qty}`).join("; "),
      itemsOf(o).reduce((s, i) => s + i.qty, 0),
      o.subtotal ?? 0,
      o.totalGst ?? 0,
      o.deliveryCharge ?? 0,
      orderTotal(o),
      o.status,
      o.payment?.status ?? "none",
      o.payment?.razorpayPaymentId ?? "",
      o.payment?.razorpayOrderId ?? "",
    ].map(esc).join(","));

    const blob = new Blob([[header.map(esc).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `krishidukan-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Orders</h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">
            Every order placed to date — products, store and Razorpay payment reference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadOrders(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl text-sm flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Could not load orders</p>
            <p className="text-xs text-red-700/90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Orders" value={counts.total} icon={ShoppingCart} color="bg-primary/10 text-primary" />
        <StatCard label="Paid Orders" value={counts.paid} icon={CreditCard} color="bg-green-100 text-green-700" />
        <StatCard
          label="Collected via Razorpay"
          value={inr(counts.revenue)}
          sub={`${inr(counts.gross)} ordered gross`}
          icon={IndianRupee}
          color="bg-harvest/10 text-harvest"
        />
        <StatCard label="Not Paid Online" value={counts.unpaid} icon={AlertTriangle} color="bg-amber-100 text-amber-700" />
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 sm:p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, store, customer, invoice or Razorpay payment ID…"
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

        <div className="flex flex-col gap-2">
          <FilterPills<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { key: "all", label: "All statuses", count: counts.total },
              ...(Object.keys(STATUS_META) as OrderStatus[]).map((s) => ({
                key: s as StatusFilter, label: STATUS_META[s].label, count: counts.byStatus[s] ?? 0,
              })),
            ]}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <FilterPills<PaymentFilter>
              value={paymentFilter}
              onChange={setPaymentFilter}
              options={[
                { key: "all", label: "Any payment" },
                { key: "paid", label: "Paid" },
                { key: "pending", label: "Pending" },
                { key: "failed", label: "Failed" },
                { key: "none", label: "No record" },
              ]}
            />
            <FilterPills<SellerFilter>
              value={sellerFilter}
              onChange={setSellerFilter}
              options={[
                { key: "all", label: "All sellers" },
                { key: "retailer", label: "Retailers" },
                { key: "manufacturer", label: "Manufacturers" },
              ]}
            />
            <FilterPills<DateFilter>
              value={dateFilter}
              onChange={setDateFilter}
              options={[
                { key: "all", label: "Any date" },
                { key: "today", label: "Today" },
                { key: "7d", label: "Last 7 days" },
                { key: "30d", label: "Last 30 days" },
                { key: "custom", label: "Custom range" },
              ]}
            />
          </div>

          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low/60 p-3">
              <label className="flex flex-col text-xs font-semibold text-on-surface-variant">
                From
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 text-sm text-on-surface"
                />
              </label>
              <label className="flex flex-col text-xs font-semibold text-on-surface-variant">
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  max={toDateInputValue(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 text-sm text-on-surface"
                />
              </label>
              {(customFrom || customTo) && (
                <button
                  type="button"
                  onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                >
                  Clear dates
                </button>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-on-surface-variant">
          Showing <span className="font-bold text-on-surface">{filtered.length}</span> of {counts.total} orders
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-on-surface-variant/40" />
            <p className="mt-3 text-sm font-bold text-on-surface">No orders match these filters</p>
            <p className="text-xs text-on-surface-variant mt-1">
              {counts.total === 0 ? "No orders have been placed yet." : "Try clearing the search or filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/15">
            {filtered.map((o) => {
              const isOpen = expanded === o.id;
              const status = STATUS_META[o.status] ?? { label: o.status, badge: "bg-gray-100 text-gray-600" };
              const pay = o.payment ? PAYMENT_META[o.payment.status] : null;
              const itemCount = itemsOf(o).reduce((s, i) => s + i.qty, 0);
              const productSummary = itemsOf(o).map((i) => i.name).join(", ");

              return (
                <div key={o.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : o.id)}
                    className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-surface-container-low transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-primary">
                            {o.invoiceNumber || o.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${status.badge}`}>
                            {status.label}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${pay ? pay.badge : NO_PAYMENT_BADGE}`}>
                            {pay ? pay.label : "No payment record"}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">{formatDate(o.createdAt)}</span>
                        </div>

                        <p className="text-sm font-semibold text-on-surface truncate">
                          {productSummary || "No line items"}
                          <span className="ml-1.5 text-xs font-normal text-on-surface-variant">
                            ({itemCount} {itemCount === 1 ? "unit" : "units"})
                          </span>
                        </p>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-on-surface-variant">
                          <span className="inline-flex items-center gap-1 font-semibold text-on-surface">
                            {o.sellerType === "manufacturer"
                              ? <Factory className="h-3 w-3 text-blue-600" />
                              : <Store className="h-3 w-3 text-green-600" />}
                            {o.sellerName || o.sellerId}
                          </span>
                          <span>{o.customerName} · {o.customerPhone}</span>
                          {o.payment?.razorpayPaymentId && (
                            <span className="font-mono">{o.payment.razorpayPaymentId}</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-on-surface">{inr(orderTotal(o))}</p>
                        <ChevronDown
                          className={`ml-auto mt-1 h-4 w-4 text-on-surface-variant transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                  </button>

                  {isOpen && <OrderDetail order={o} onRefunded={() => loadOrders(true)} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
