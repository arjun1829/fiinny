"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, MapPin, Package, RefreshCw } from "lucide-react";
import { fetchOpenOffers, respondToOffer, type OrderOffer } from "../_lib/order-offers";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function timeLeft(d: Date | null): string {
  if (!d) return "";
  const mins = Math.max(0, Math.round((d.getTime() - Date.now()) / 60000));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m left`;
}

/**
 * Orders another seller rejected, offered to this seller. Accepting takes the
 * order over — the customer's full delivery details then appear on it like
 * any other order. Before accepting, only city/pincode is shown.
 */
export function OrderRequestsPanel({
  sellerPhone,
  onCountChange,
  onAccepted,
}: {
  sellerPhone: string;
  onCountChange?: (n: number) => void;
  onAccepted?: () => void;
}) {
  const [offers, setOffers] = useState<OrderOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOpenOffers(sellerPhone);
      setOffers(rows);
      onCountChange?.(rows.length);
    } catch (e) {
      console.error("[order-requests] load failed", e);
      setMessage({ kind: "err", text: "Could not load order requests." });
    } finally {
      setLoading(false);
    }
  }, [sellerPhone, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (offer: OrderOffer, action: "accept" | "decline") => {
    if (action === "accept" &&
      !window.confirm(`Take this order and deliver ${offer.itemSummary}? The customer is expecting delivery from you once you accept.`)) {
      return;
    }
    setBusyId(offer.orderId);
    setMessage(null);
    const res = await respondToOffer(offer.orderId, action);
    setBusyId(null);
    if (res.ok === false) {
      setMessage({ kind: "err", text: res.error });
    } else {
      setMessage({
        kind: "ok",
        text: action === "accept"
          ? "Order accepted — it's now in your Orders list with the customer's delivery details."
          : "Request declined.",
      });
      if (action === "accept") onAccepted?.();
    }
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-on-surface-variant max-w-2xl">
          Another seller couldn&apos;t fulfil these orders. The customer has already paid — accept one
          to deliver it and earn from it. The first seller to accept gets the order; if nobody does
          within 24 hours, the customer is refunded.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "ok"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-12 text-center">
          <Package className="mx-auto h-9 w-9 text-on-surface-variant/40" />
          <p className="mt-3 text-sm font-bold text-on-surface">No order requests right now</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            When another seller can&apos;t fulfil an order for a product you sell online, it appears here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {offers.map((o) => (
            <div key={o.orderId} className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-bold text-primary">{o.orderId.slice(0, 8).toUpperCase()}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {[o.deliveryCity, o.deliveryPincode].filter(Boolean).join(" · ") || "Delivery area not given"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {o.sellerEarning !== null && (
                    <p className="text-sm font-black text-green-700">You earn {inr(o.sellerEarning)}</p>
                  )}
                  <p className="text-[11px] text-on-surface-variant">Order value {inr(o.orderValue)}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700">
                    <Clock className="h-3 w-3" /> {timeLeft(o.expiresAt)}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1 rounded-xl border border-outline-variant/20 bg-white px-3 py-2">
                {o.items.map((it, i) => (
                  <div key={`${it.name}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-semibold text-on-surface">
                      {it.name}
                      {it.variantLabel && <span className="ml-1 font-normal text-on-surface-variant">({it.variantLabel})</span>}
                    </span>
                    <span className="shrink-0 text-on-surface-variant">× {it.qty}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === o.orderId}
                  onClick={() => void respond(o, "accept")}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === o.orderId ? "Working…" : "Accept & deliver"}
                </button>
                <button
                  type="button"
                  disabled={busyId === o.orderId}
                  onClick={() => void respond(o, "decline")}
                  className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
