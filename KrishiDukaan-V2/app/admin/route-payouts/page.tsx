"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  Zap,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  CircleSlash,
  ChevronDown,
} from "lucide-react";

/**
 * Admin → Route Payouts.
 *
 * Visibility into the AUTOMATIC payout system — a Route transfer created at
 * checkout, held, and released 24h after delivery by a Cloud Function
 * (functions/src/route-release.ts). Deliberately a SEPARATE page from
 * /admin/payouts: that page shows the older payoutAccounts/{phone} KYC-review
 * flow, a different collection with a different shape and different actions.
 * Sellers here are onboarded lazily (see api/route/onboard-seller) and never
 * have their bank details stored in Firestore — this page only ever shows
 * status, never account numbers.
 */

type TransferState = "held" | "scheduled" | "released" | "not_routed" | "no_payment";

type OrderRow = {
  orderId: string;
  status: string;
  createdAt: string | null;
  customerName: string;
  total: number;
  transfer: {
    id: string;
    amountPaise: number;
    state: TransferState;
    releaseAt: string | null;
  };
};

type SellerRow = {
  phone: string;
  collection: "retailers" | "manufacturers";
  businessName: string;
  razorpayAccountId: string;
  routeStatus: string;
  orders: OrderRow[];
};

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATE_META: Record<TransferState, { label: string; cls: string; Icon: typeof Clock }> = {
  held: { label: "Held — awaiting delivery", cls: "bg-amber-50 text-amber-800", Icon: Clock },
  scheduled: { label: "Scheduled", cls: "bg-blue-50 text-blue-700", Icon: Clock },
  released: { label: "Released", cls: "bg-green-50 text-green-700", Icon: CheckCircle2 },
  not_routed: { label: "Not routed", cls: "bg-surface-container text-on-surface-variant", Icon: CircleSlash },
  no_payment: { label: "No online payment", cls: "bg-surface-container text-on-surface-variant", Icon: CircleSlash },
};

const ROUTE_STATUS_CLS: Record<string, string> = {
  activated: "bg-green-50 text-green-700",
  needs_clarification: "bg-amber-50 text-amber-800",
  under_review: "bg-blue-50 text-blue-700",
  requested: "bg-surface-container text-on-surface-variant",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminRoutePayoutsPage() {
  const [sellers, setSellers] = useState<SellerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/route-payouts", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load Route payout data.");
      setSellers(json.sellers as SellerRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Route payout data.");
      setSellers(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const acc = { held: 0, scheduled: 0, released: 0, sellers: sellers?.length ?? 0 };
    for (const s of sellers ?? []) {
      for (const o of s.orders) {
        if (o.transfer.state === "held") acc.held += o.transfer.amountPaise;
        if (o.transfer.state === "scheduled") acc.scheduled += o.transfer.amountPaise;
        if (o.transfer.state === "released") acc.released += o.transfer.amountPaise;
      }
    }
    return acc;
  }, [sellers]);

  const toggle = (phone: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });

  return (
    <div className="pb-16">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <Zap className="h-5 w-5 text-primary" />
            Route Payouts
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Automatic seller payouts — a transfer is created at checkout, held, and
            released 24 hours after the order is marked delivered. No admin action
            required once a seller is onboarded.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!error && sellers && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Onboarded sellers" value={String(totals.sellers)} />
          <StatCard label="Held" value={money(totals.held)} tone="amber" />
          <StatCard label="Scheduled" value={money(totals.scheduled)} tone="blue" />
          <StatCard label="Released" value={money(totals.released)} tone="green" />
        </div>
      )}

      {loading && !sellers ? (
        <div className="flex items-center gap-2 p-8 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : sellers && sellers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 p-10 text-center text-sm text-on-surface-variant">
          No seller has a Route account yet. Onboarding happens automatically the
          first time a seller gets an order (see /api/route/onboard-seller).
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sellers?.map((seller) => (
            <SellerCard
              key={seller.phone}
              seller={seller}
              expanded={open.has(seller.phone)}
              onToggle={() => toggle(seller.phone)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "blue" | "green";
}) {
  const cls =
    tone === "amber"
      ? "text-amber-700"
      : tone === "blue"
        ? "text-blue-700"
        : tone === "green"
          ? "text-green-700"
          : "text-on-surface";
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white p-4">
      <p className={`text-2xl font-black tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-on-surface-variant">{label}</p>
    </div>
  );
}

function SellerCard({
  seller,
  expanded,
  onToggle,
}: {
  seller: SellerRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pending = seller.orders.filter(
    (o) => o.transfer.state === "held" || o.transfer.state === "scheduled",
  ).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-container-low/40"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-on-surface">{seller.businessName}</p>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ROUTE_STATUS_CLS[seller.routeStatus] ?? "bg-surface-container text-on-surface-variant"}`}
            >
              {seller.routeStatus}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {seller.phone} · {seller.collection} · {seller.razorpayAccountId}
            {pending > 0 && (
              <span className="ml-2 font-semibold text-amber-700">
                {pending} order{pending === 1 ? "" : "s"} pending release
              </span>
            )}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-outline-variant/15">
          {seller.orders.length === 0 ? (
            <p className="px-4 py-4 text-sm text-on-surface-variant">
              No orders found for this seller yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-outline-variant/15 text-left text-xs text-on-surface-variant">
                    <th className="px-4 py-2 font-semibold">Order</th>
                    <th className="px-4 py-2 font-semibold">Placed</th>
                    <th className="px-4 py-2 font-semibold">Customer</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Payout</th>
                    <th className="px-4 py-2 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {seller.orders.map((o) => {
                    const meta = STATE_META[o.transfer.state];
                    return (
                      <tr key={o.orderId} className="border-b border-outline-variant/10 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-on-surface-variant">
                          #{o.orderId.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-2.5 text-on-surface-variant">{fmtDate(o.createdAt)}</td>
                        <td className="px-4 py-2.5 text-on-surface-variant">{o.customerName || "—"}</td>
                        <td className="px-4 py-2.5 capitalize text-on-surface-variant">
                          {o.status.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
                            <meta.Icon className="h-3 w-3" />
                            {meta.label}
                            {o.transfer.state === "scheduled" && o.transfer.releaseAt && (
                              <span className="font-normal">— {fmtDate(o.transfer.releaseAt)}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold tabular-nums text-on-surface">
                          {o.transfer.amountPaise > 0 ? money(o.transfer.amountPaise) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
