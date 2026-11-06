"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, RefreshCw, Search, Send, X } from "lucide-react";
import { PayoutTimelineView } from "../../../components/shared/payout-timeline-view";
import {
  cap,
  checkWithRazorpay,
  day,
  downloadCsv,
  fetchPayouts,
  fmt,
  inr,
  needsAction,
  releaseOrder,
  STATE_META,
  type Summary,
  type TransferRow,
} from "./api";

/**
 * Seller payments → Transfers: every seller transfer, with Razorpay's
 * columns (transfer id, recipient, amount, transfer and settlement status),
 * filters, search, and a side panel per order with its full timeline.
 */

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "on_hold", label: "On hold" },
  { key: "scheduled", label: "Release scheduled" },
  { key: "processing", label: "On the way" },
  { key: "settled", label: "Settled" },
  { key: "failed", label: "Failed" },
  { key: "reversed", label: "Reversed" },
  { key: "not_routed", label: "Not on Route" },
];

export function TransfersTab({ initialFilter = "all" }: { initialFilter?: string }) {
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<TransferRow | null>(null);

  useEffect(() => setFilter(initialFilter), [initialFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchPayouts({ state: filter, q: search || undefined });
      setSummary(json.summary);
      setRows(json.transfers);
      setCursor(json.nextCursor);
      setCanEdit(json.canEdit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load transfers.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const json = await fetchPayouts({ state: filter, cursor });
      setRows((prev) => [...prev, ...json.transfers]);
      setCursor(json.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const r = await checkWithRazorpay();
      setNotice(`Checked ${r.checked} order${r.checked === 1 ? "" : "s"} with Razorpay: ${r.changed} updated${r.errors ? `, ${r.errors} will be retried` : ""}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Razorpay.");
    } finally {
      setSyncing(false);
    }
  };

  const onChanged = async (message: string) => {
    setNotice(message);
    setOpen(null);
    await load();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-outline-variant/50 bg-white px-3 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
          }}
        >
          <Search className="h-4 w-4 text-on-surface-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order id, trf_…, pay_…, order_… or seller phone"
            className="w-full bg-transparent text-sm outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSearch("");
              }}
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-on-surface-variant" />
            </button>
          )}
        </form>
        <button
          onClick={async () => {
            setDownloading(true);
            setError(null);
            try {
              await downloadCsv({ state: filter, q: search || undefined });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not download.");
            } finally {
              setDownloading(false);
            }
          }}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download CSV
        </button>
        {canEdit && (
          <button
            onClick={() => void syncAll()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check with Razorpay now
          </button>
        )}
      </div>

      {!search && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filter === f.key ? "border-primary bg-primary text-white" : "border-outline-variant/50 text-on-surface-variant hover:border-primary"
              }`}
            >
              {f.label}
              {summary?.[f.key] ? ` (${summary[f.key].count})` : ""}
            </button>
          ))}
        </div>
      )}
      {search && <p className="mb-3 text-sm text-on-surface-variant">Results for “{search}”</p>}

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {notice && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-white">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-outline-variant/20 text-left text-xs text-on-surface-variant">
              <th className="px-3 py-2 font-semibold">Order / Seller</th>
              <th className="px-3 py-2 font-semibold">Order Date</th>
              <th className="px-3 py-2 font-semibold">Delivery Date</th>
              <th className="px-3 py-2 font-semibold">Transfer Id</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 font-semibold">Transfer Status / Processed</th>
              <th className="px-3 py-2 font-semibold">Settlement Status / Settled</th>
              <th className="px-3 py-2 font-semibold">UTR</th>
              <th className="px-3 py-2 font-semibold">Where is the money</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-on-surface-variant">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-on-surface-variant">
                  {search ? "No order matches." : "Nothing here. Orders paid online appear a few minutes after payment."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const meta = needsAction(r) ? STATE_META.needs_action : (STATE_META[r.state] ?? STATE_META.checking);
                return (
                  <tr
                    key={r.orderId}
                    onClick={() => setOpen(r)}
                    className="cursor-pointer border-b border-outline-variant/10 align-top last:border-0 hover:bg-surface-container-low/50"
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-xs text-on-surface-variant">#{r.orderId.slice(0, 10)}</p>
                      <p className="text-xs font-semibold text-on-surface">{r.sellerName || r.sellerPhone || "—"}</p>
                      <p className="text-[11px] capitalize text-on-surface-variant">{r.orderStatus.replace(/_/g, " ")}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-on-surface-variant">{day(r.createdAt)}</td>
                    <td className="px-3 py-2.5 text-xs text-on-surface-variant">{day(r.deliveredAt)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.transferId ?? "—"}
                      {r.via === "balance" && <span className="ml-1 rounded bg-surface-container px-1 text-[10px]">payout run</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.transferId ? inr(r.amount) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {cap(r.transferStatus)}
                      {r.processedAt && <p className="text-[11px] text-on-surface-variant">{day(r.processedAt)}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {cap(r.settlementStatus)}
                      {r.state === "settled" && r.settlementAt && <p className="text-[11px] text-on-surface-variant">{day(r.settlementAt)}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.utr ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                      {r.state === "scheduled" && <p className="mt-0.5 text-[11px] text-on-surface-variant">Releases {fmt(r.onHoldUntil)}</p>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {cursor && !loading && !search && (
        <div className="mt-3 text-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-lg border border-outline-variant/50 px-4 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-on-surface-variant">Click an order to see its full payment story and actions.</p>

      {open && <OrderPaymentPanel row={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}

/** Side panel: one order's payment story, every id, and what admin can do. */
function OrderPaymentPanel({
  row,
  canEdit,
  onClose,
  onChanged,
}: {
  row: TransferRow;
  canEdit: boolean;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"release" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pay = (row.timeline.payment ?? {}) as Record<string, unknown>;

  const release = async () => {
    if (!window.confirm(`Release ${inr(row.amount)} to ${row.sellerName || row.sellerPhone} now?\n\nRazorpay settles it to the seller's bank by the next working day.`)) return;
    setBusy("release");
    setError(null);
    try {
      const r = await releaseOrder(row.orderId);
      await onChanged(r.alreadyReleased ? `Transfer ${r.transferId} was already released.` : `Released ${r.transferId}. Its status updates within 15 minutes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed.");
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    setError(null);
    try {
      const r = await checkWithRazorpay([row.orderId]);
      await onChanged(r.changed ? "Updated from Razorpay." : "Checked with Razorpay: no change.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Razorpay.");
    } finally {
      setBusy(null);
    }
  };

  const ids: [string, unknown][] = [
    ["Order", row.orderId],
    ["Order date", fmt(row.createdAt)],
    ["Delivery date", row.deliveredAt ? fmt(row.deliveredAt) : null],
    ["Payment processed date", row.processedAt ? fmt(row.processedAt) : null],
    ["Settled date", row.state === "settled" && row.settlementAt ? fmt(row.settlementAt) : null],
    ["UTR (bank reference)", row.utr],
    ["Seller", `${row.sellerName || "—"} · ${row.sellerPhone || "—"}`],
    ["Razorpay payment", pay.razorpayPaymentId],
    ["Razorpay order", pay.razorpayOrderId],
    ["Transfer", row.transferId],
    ["Paid via", row.via === "balance" ? "Payout run (bank transfer)" : row.transferId ? "Route transfer" : "—"],
    ["Seller's Razorpay account", row.account],
    ["Transfer status", cap(row.transferStatus)],
    ["Settlement status", cap(row.settlementStatus)],
    ["Settlement", row.settlementId],
    ["Last checked with Razorpay", fmt(row.checkedAt)],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label="Order payment details">
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Order #{row.orderId.slice(0, 10)}</h2>
            <p className="text-sm text-on-surface-variant">
              {row.sellerName || row.sellerPhone} · {row.transferId ? inr(row.amount) : "no transfer"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-surface-container">
            <X className="h-5 w-5" />
          </button>
        </div>

        <PayoutTimelineView order={row.timeline as never} audience="admin" />

        {row.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Razorpay: {row.error}</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            {needsAction(row) && (
              <button
                onClick={() => void release()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Release to seller
              </button>
            )}
            <button
              onClick={() => void check()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-50"
            >
              {busy === "check" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Check this order with Razorpay
            </button>
          </div>
        )}

        <dl className="mt-5 divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30 text-sm">
          {ids.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-on-surface-variant">{k}</dt>
              <dd className="break-all text-right font-mono text-xs text-on-surface">{v ? String(v) : "—"}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
