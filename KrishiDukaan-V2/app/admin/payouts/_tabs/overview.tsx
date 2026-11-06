"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { fetchPayouts, fmt, inr, setReleaseEnabled, STATE_META, type PayoutsResponse } from "./api";

/**
 * Seller payments → Overview: how a seller's money moves, where it all is
 * right now, what needs an admin, and the automatic-release switch.
 */

const FLOW = [
  { title: "Customer pays", body: "Online, through Razorpay. KrishiDukan receives the money." },
  { title: "Held for the seller", body: "Razorpay Route reserves the seller's share (a transfer on hold) until delivery." },
  { title: "Seller marks delivered", body: "From the app, website, admin or WhatsApp." },
  { title: "Released after 24 h", body: "Automatic while the switch below is on. Otherwise release it here." },
  { title: "In the seller's bank", body: "Razorpay settles it, usually by the next working day." },
];

export function OverviewTab({ onOpenTransfers }: { onOpenTransfers: (filter: string) => void }) {
  const [data, setData] = useState<PayoutsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSellers, setShowSellers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPayouts({ state: "needs_action" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load seller payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRelease = async () => {
    if (!data) return;
    const next = !data.settings.releaseEnabled;
    const ok = window.confirm(
      next
        ? "Turn ON automatic release?\n\nFrom now on, each seller's money is released 24 hours after they mark the order delivered. Orders delivered before now are not released automatically: release them from Needs action."
        : "Turn OFF automatic release?\n\nDelivered orders will stay on hold until an admin releases them from Needs action.",
    );
    if (!ok) return;
    setSaving(true);
    try {
      await setReleaseEnabled(next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the setting.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
      </div>
    );
  }
  if (!data) return null;

  const tile = (key: string) => data.summary[key] ?? { count: 0, amount: 0 };
  const needs = tile("needs_action");

  return (
    <div className="space-y-5">
      {/* How the money moves */}
      <section className="rounded-2xl border border-outline-variant/30 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-on-surface">How a seller gets paid</h2>
        <ol className="grid gap-3 sm:grid-cols-5">
          {FLOW.map((s, i) => (
            <li key={s.title} className="relative rounded-xl bg-surface-container-low/60 p-3">
              <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
              <p className="text-sm font-semibold text-on-surface">{s.title}</p>
              <p className="mt-0.5 text-xs text-on-surface-variant">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-on-surface-variant">
          Sellers without a Razorpay Route account are paid by the <strong>Payout run</strong> instead (7 days after
          delivery, to the bank account approved in <strong>Bank &amp; KYC</strong>).
        </p>
      </section>

      {/* Automatic release switch */}
      <section
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
          data.settings.releaseEnabled ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"
        }`}
      >
        <div>
          <p className="text-sm font-bold text-on-surface">
            Automatic release after delivery: {data.settings.releaseEnabled ? "ON" : "OFF"}
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {data.settings.releaseEnabled
              ? "Each seller's money is released 24 hours after they mark the order delivered."
              : "Delivered orders stay on hold until an admin releases them. Sellers see “Waiting for release”."}
          </p>
        </div>
        {data.canEdit ? (
          <button
            onClick={() => void toggleRelease()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : data.settings.releaseEnabled ? (
              <ToggleRight className="h-4 w-4 text-green-700" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
            Turn {data.settings.releaseEnabled ? "off" : "on"}
          </button>
        ) : (
          <p className="text-xs text-on-surface-variant">Only an admin can change this.</p>
        )}
      </section>

      {/* Needs action */}
      {needs.count > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-red-800">
              {needs.count} delivered order{needs.count === 1 ? "" : "s"} still on hold ({inr(needs.amount)})
            </p>
            <button onClick={() => onOpenTransfers("needs_action")} className="inline-flex items-center gap-1 text-sm font-semibold text-red-800 hover:underline">
              Review and release <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-red-900">
            {data.transfers.slice(0, 5).map((r) => (
              <li key={r.orderId}>
                #{r.orderId.slice(0, 10)} · {r.sellerName || r.sellerPhone} · {inr(r.amount)} · placed {fmt(r.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Where the money is */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-on-surface">Where all seller money is now</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(["on_hold", "scheduled", "processing", "settled", "failed", "not_routed"] as const).map((k) => (
            <button
              key={k}
              onClick={() => onOpenTransfers(k)}
              className="rounded-2xl border border-outline-variant/30 bg-white p-4 text-left hover:border-primary"
            >
              <p className="text-xl font-black tabular-nums text-on-surface">{inr(tile(k).amount)}</p>
              <p className="mt-0.5 text-xs font-semibold text-on-surface">
                {tile(k).count} order{tile(k).count === 1 ? "" : "s"}
              </p>
              <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATE_META[k].cls}`}>{STATE_META[k].label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          Statuses are checked with Razorpay automatically (every 15 minutes for orders that are due). Click a tile to see the orders.
        </p>
      </section>

      {/* Sellers on Route */}
      <section className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-white">
        <button
          onClick={() => setShowSellers((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-on-surface hover:bg-surface-container-low/40"
        >
          Sellers with a Razorpay Route account ({data.sellers.length})
          <ChevronDown className={`h-4 w-4 transition-transform ${showSellers ? "rotate-180" : ""}`} />
        </button>
        {showSellers && (
          <div className="divide-y divide-outline-variant/15 border-t border-outline-variant/15">
            {data.sellers.length === 0 ? (
              <p className="px-4 py-4 text-sm text-on-surface-variant">No seller has a Route account yet.</p>
            ) : (
              data.sellers.map((s) => (
                <div key={`${s.collection}/${s.phone}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-on-surface">{s.businessName}</span>
                  <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">{s.routeStatus}</span>
                  <span className="text-xs text-on-surface-variant">
                    {s.phone} · <span className="font-mono">{s.razorpayAccountId}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
