"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { createSellerOrdersPager } from "../../firebase";
import {
  computeSellerEarnings,
  summaryFromStats,
  type SellerEarningsSummary,
} from "../_lib/seller-earnings";
import { fetchSellerEarningsStats } from "../_lib/analytics-firestore";
import { PayoutHeadline, PayoutTimelineView } from "../../components/shared/payout-timeline-view";
import { useKycPending } from "../_lib/use-kyc-pending";

/**
 * "What am I owed?" for a seller.
 *
 * Derived from the seller's own order documents rather than a separate ledger,
 * so it can never disagree with the orders they already see in the dashboard.
 * Once Route transfers exist, an order carrying a transferId is reported as
 * paid out regardless of the derived rules (see payoutStateFor).
 */

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

/** When the money reached the bank: Razorpay's time, else when we saw it. */
function settledOn(p: { settlementAt?: number | null; settledAt?: unknown }): Date | null {
  if (p.settlementAt) return new Date(p.settlementAt);
  const t = p.settledAt as { toDate?: () => Date; seconds?: number } | undefined;
  if (t?.toDate) return t.toDate();
  return typeof t?.seconds === "number" ? new Date(t.seconds * 1000) : null;
}

export function SellerEarningsPanel({
  uid,
  profile,
}: {
  uid: string | null;
  profile?: unknown;
}) {
  const [summary, setSummary] = useState<(SellerEarningsSummary & { counted: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const kycPending = useKycPending();

  const load = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      // Totals from the seller's stats docs (kept by sellerStatsOnOrderWrite
      // with the same rules as computeSellerEarnings), the table from the
      // newest orders — instead of reading every order the seller ever had.
      const [{ stats, holds }, pager] = await Promise.all([
        fetchSellerEarningsStats(uid, profile),
        createSellerOrdersPager(uid, profile, { pageSize: 30 }),
      ]);
      const recent = await pager.next();
      const { rows } = computeSellerEarnings(recent.map((d) => ({ id: d.id, ...d.data() })) as never[]);
      setSummary({ ...summaryFromStats(stats, holds), rows });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your earnings…
        </div>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5">
        <p className="text-sm text-on-surface">Could not load your earnings.</p>
        <button
          onClick={() => void load()}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </section>
    );
  }

  const { due, onHold, awaitingDelivery, paidOut, settled, gatewayFees, nextReleaseOn, rows, counted } = summary;
  const onTheWay = Math.max(0, paidOut - settled);

  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-on-surface">Your earnings</h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Money is released after you mark an order delivered (the date shows
            against each order). Razorpay then settles it to your bank, usually
            by the next working day.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-container"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Ready to transfer" value={inr(due)} tone="good" />
        <Tile
          label="On hold"
          value={inr(onHold)}
          hint={nextReleaseOn ? `Next release ${fmtDate(nextReleaseOn)}` : undefined}
          tone="warn"
        />
        <Tile label="Awaiting delivery" value={inr(awaitingDelivery)} />
        <Tile
          label="Paid out"
          value={inr(paidOut)}
          hint={paidOut > 0 ? `${inr(settled)} in your bank · ${inr(onTheWay)} on the way` : undefined}
          tone="info"
        />
      </div>

      <p className="mt-3 text-xs text-on-surface-variant">
        Amounts shown are after the payment gateway&apos;s charge
        {gatewayFees > 0 ? ` (${inr(gatewayFees)} so far)` : ""} and any
        platform fee shown on the order.
      </p>

      {rows.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-outline-variant/40 text-left text-xs uppercase tracking-wide text-on-surface-variant">
                <th className="pb-2 pr-3 font-semibold">Order</th>
                <th className="pb-2 pr-3 font-semibold">Delivered</th>
                <th className="pb-2 pr-3 font-semibold">Where is the money</th>
                <th className="pb-2 pr-3 font-semibold">Settled · UTR</th>
                <th className="pb-2 pr-3 text-right font-semibold">Gateway fee</th>
                <th className="pb-2 text-right font-semibold">You receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/25">
              {rows.slice(0, 25).map((r) => {
                const open = openRow === r.orderId;
                return (
                  <Fragment key={r.orderId}>
                    <tr
                      className="cursor-pointer hover:bg-surface-container-low/50"
                      onClick={() => setOpenRow(open ? null : r.orderId)}
                      aria-expanded={open}
                    >
                      <td className="py-2 pr-3 font-mono text-xs text-on-surface-variant">
                        <ChevronRight className={`mr-1 inline h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
                        {r.orderId.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-3 text-on-surface-variant">{fmtDate(r.deliveredAt)}</td>
                      <td className="py-2 pr-3">
                        <PayoutHeadline order={r.order as never} kycPending={kycPending} />
                      </td>
                      <td className="py-2 pr-3 text-xs text-on-surface-variant">
                        {r.payout?.state === "settled" ? (
                          <>
                            {fmtDate(settledOn(r.payout))}
                            {r.payout.utr && <span className="block font-mono text-[10px]">{r.payout.utr}</span>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-on-surface-variant">
                        {r.gatewayFee > 0 ? `−${inr(r.gatewayFee)}` : "—"}
                      </td>
                      <td className="py-2 text-right font-semibold text-on-surface">
                        {inr(r.payout?.transferId && typeof r.payout.amount === "number" ? r.payout.amount : r.net)}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} className="bg-surface-container-low/40 px-4 py-4">
                          <PayoutTimelineView order={r.order as never} kycPending={kycPending} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-on-surface-variant">Tap an order to see each step: paid, held, delivered, released, in your bank.</p>
          {Math.max(rows.length, counted) > 25 && (
            <p className="mt-2 text-xs text-on-surface-variant">
              Showing the 25 most recent of {Math.max(rows.length, counted)} orders.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 && counted === 0 && (
        <p className="mt-4 text-sm text-on-surface-variant">
          No orders yet. Earnings appear here as soon as you receive one.
        </p>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "info";
}) {
  const toneCls =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "info"
          ? "text-blue-700"
          : "text-on-surface";
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/60 p-3">
      <p className={`text-xl font-bold ${toneCls}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-on-surface-variant">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-on-surface-variant/80">{hint}</p>}
    </div>
  );
}
