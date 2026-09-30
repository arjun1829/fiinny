"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit as fsLimit,
} from "firebase/firestore";
import {
  AlertTriangle,
  ChevronDown,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShoppingCart,
  CreditCard,
  Download,
  X,
} from "lucide-react";
import { auth, db } from "../../firebase";

/**
 * Admin → Payments.
 *
 * Shows every payment ATTEMPT, not just the ones that succeeded, so a lost sale
 * is visible with the detail needed to act on it: who the buyer was, how to
 * reach them, exactly which products and at what price, and what Razorpay said
 * went wrong.
 *
 * Rows come from `paymentAttempts`, written server-side when the Razorpay order
 * is created (app/lib/payment-attempts.ts). That timing is what makes the page
 * useful — an attempt is recorded before the customer reaches the checkout
 * sheet, so failures the client never reported (killed app, closed tab, dead
 * network) still appear here.
 */

type AttemptItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  sellerPhone: string | null;
  priceSource: string;
};

type Attempt = {
  id: string;
  razorpayOrderId: string;
  kind: "cart" | "subscription";
  status: "created" | "paid" | "failed";
  userId: string;
  userPhone: string | null;
  userName: string | null;
  /** Razorpay's own contact/email on the payment — present on
   *  webhook/backfill rows, which may have no matching user doc at all. */
  razorpayContact: string | null;
  razorpayEmail: string | null;
  amount: number;
  subtotal: number | null;
  deliveryCharge: number | null;
  items: AttemptItem[];
  seatCount: number | null;
  durationMonths: number | null;
  note: string | null;
  source: string;
  error: {
    code?: string | null;
    description?: string | null;
    reason?: string | null;
    step?: string | null;
  } | null;
  createdAt: Date | null;
  paidAt: Date | null;
};

/**
 * An attempt still sitting at 'created' this long after the order was made is
 * treated as abandoned. Razorpay's own checkout session is far shorter than
 * this, so anything older has certainly not completed — the window is generous
 * on purpose, to avoid flagging a customer who is still mid-UPI as a lost sale.
 */
const ABANDON_AFTER_MS = 30 * 60 * 1000;

const SOURCE_LABEL: Record<string, string> = {
  web: "web",
  mobile: "app",
  razorpay_webhook: "Razorpay (live)",
  razorpay_backfill: "Razorpay (synced)",
};

type Bucket = "failed" | "abandoned" | "pending" | "paid";

/**
 * Which queue an attempt belongs in. "paid" means Razorpay confirmed the money
 * (status set by /api/payment/verify, order-status reconciliation, or the
 * payment.captured webhook) — NOTHING else may land there.
 *
 * An attempt still at 'created' inside the abandon window is "pending": the
 * checkout was opened and has not resolved yet. This used to fall through to
 * "paid", so any checkout opened in the last 30 minutes — including one the
 * customer closed without paying — showed a green "Paid" badge and counted as
 * Successful, then silently flipped to Abandoned half an hour later. Reported
 * 28 Sep 2026 after three unpaid seat-purchase test checkouts all read "Paid";
 * Razorpay had zero payments against any of them.
 */
function bucketOf(a: Attempt): Bucket {
  if (a.status === "paid") return "paid";
  if (a.status === "failed") return "failed";
  return Date.now() - (a.createdAt?.getTime() ?? 0) > ABANDON_AFTER_MS
    ? "abandoned"
    : "pending";
}

const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null;
  if (t?.toDate) return t.toDate();
  if (v instanceof Date) return v;
  return null;
}

export default function AdminPaymentsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Bucket>("failed");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Newest first, capped — this page is for acting on recent problems, not
      // for auditing all history, and an uncapped read grows without bound.
      const snap = await getDocs(
        query(
          collection(db, "paymentAttempts"),
          orderBy("createdAt", "desc"),
          fsLimit(500),
        ),
      );
      setAttempts(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            razorpayOrderId: String(x.razorpayOrderId ?? d.id),
            kind: x.kind === "subscription" ? "subscription" : "cart",
            status: x.status ?? "created",
            userId: String(x.userId ?? ""),
            userPhone: x.userPhone ?? null,
            razorpayContact: x.razorpayContact ?? null,
            razorpayEmail: x.razorpayEmail ?? null,
            userName: x.userName ?? null,
            amount: Number(x.amount ?? 0),
            subtotal: x.subtotal ?? null,
            deliveryCharge: x.deliveryCharge ?? null,
            items: Array.isArray(x.items) ? x.items : [],
            seatCount: x.seatCount ?? null,
            durationMonths: x.durationMonths ?? null,
            note: x.note ?? null,
            source: String(x.source ?? "unknown"),
            error: x.error ?? null,
            createdAt: toDate(x.createdAt),
            paidAt: toDate(x.paidAt),
          } as Attempt;
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load payment attempts. Check the Firestore rules for paymentAttempts.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Pulls failed payments straight from Razorpay's own records — the
  // retroactive fix for exactly what prompted this: Razorpay's own dashboard
  // showing failures this page never learned about, because until now the
  // only way a failure got here was the customer's OWN app successfully
  // reporting it. Keeps calling the sync route forward (via nextSkip) until
  // it reports no more pages, then reloads the list.
  const syncFromRazorpay = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in.");

      let skip = 0;
      let totalScanned = 0;
      let totalWritten = 0;
      let hasMore = true;
      let guard = 0; // hard stop so a server bug can't spin this forever

      while (hasMore && guard < 50) {
        guard++;
        const res = await fetch("/api/admin/sync-razorpay-failures", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ skip }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Sync failed");

        totalScanned += data.scanned ?? 0;
        totalWritten += data.written ?? 0;
        skip = data.nextSkip ?? skip;
        hasMore = Boolean(data.hasMore);
      }

      setSyncResult(
        `Scanned ${totalScanned} Razorpay payment${totalScanned === 1 ? "" : "s"}, added/updated ${totalWritten} failed record${totalWritten === 1 ? "" : "s"}.`,
      );
      await load();
    } catch (e) {
      setSyncResult(e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const counts = useMemo(() => {
    const c = { failed: 0, abandoned: 0, pending: 0, paid: 0 };
    for (const a of attempts) c[bucketOf(a)] += 1;
    return c;
  }, [attempts]);

  // Only genuinely failed payments — a Razorpay error the customer hit and
  // couldn't get past. Deliberately excludes "abandoned": that bucket is
  // someone who simply closed the checkout sheet, which is not money the
  // gateway ever refused, so counting it here overstates real losses.
  const lostValue = useMemo(
    () =>
      attempts
        .filter((a) => bucketOf(a) === "failed")
        .reduce((sum, a) => sum + a.amount, 0),
    [attempts],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts
      .filter((a) => bucketOf(a) === tab)
      .filter((a) => {
        if (!q) return true;
        return (
          (a.userPhone ?? "").toLowerCase().includes(q) ||
          (a.userName ?? "").toLowerCase().includes(q) ||
          a.razorpayOrderId.toLowerCase().includes(q) ||
          a.items.some((i) => i.name.toLowerCase().includes(q))
        );
      });
  }, [attempts, tab, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Payments</h1>
          <p className="text-sm text-on-surface-variant">
            Failed and abandoned checkouts, with what the customer was trying to buy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncFromRazorpay}
            disabled={syncing}
            title="Pull failed payments directly from Razorpay — catches failures the app itself never got to report (killed app, dropped connection, old app version)."
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Download className={`h-4 w-4 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "Syncing…" : "Sync from Razorpay"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-outline/30 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-4 py-3 text-sm text-on-surface">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{syncResult}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Failed" value={String(counts.failed)} tone="error" />
        <SummaryCard label="Abandoned" value={String(counts.abandoned)} tone="warn" />
        <SummaryCard label="In progress" value={String(counts.pending)} tone="warn" />
        <SummaryCard label="Successful" value={String(counts.paid)} tone="ok" />
        <SummaryCard label="Value not collected" value={money(lostValue)} tone="error" />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-outline/20">
        {(["failed", "abandoned", "pending", "paid"] as Bucket[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-1 pb-2 text-sm font-semibold capitalize ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t === "paid" ? "Successful" : t === "pending" ? "In progress" : t}
            <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[11px] font-bold">
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search buyer, phone, product or order id"
          className="w-full rounded-lg border border-outline/30 py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Rows */}
      {loading ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-on-surface-variant">
          {search
            ? `No ${tab} payments match “${search}”.`
            : tab === "failed"
              ? "No failed payments. "
              : tab === "abandoned"
                ? "No abandoned checkouts."
                : tab === "pending"
                  ? "No checkouts in progress."
                  : "No successful payments recorded yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <AttemptRow
              key={a.id}
              attempt={a}
              open={expanded === a.id}
              onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "error" | "warn" | "ok";
}) {
  const toneClass =
    tone === "error"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-green-700";
  return (
    <div className="rounded-xl border border-outline/15 bg-white p-4">
      <p className={`text-2xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-on-surface-variant">{label}</p>
    </div>
  );
}

function AttemptRow({
  attempt: a,
  open,
  onToggle,
}: {
  attempt: Attempt;
  open: boolean;
  onToggle: () => void;
}) {
  const bucket = bucketOf(a);
  const badge =
    bucket === "failed"
      ? { text: "Failed", cls: "bg-red-50 text-red-700" }
      : bucket === "abandoned"
        ? { text: "Abandoned", cls: "bg-amber-50 text-amber-700" }
        : bucket === "pending"
          ? { text: "In progress", cls: "bg-slate-100 text-slate-600" }
          : { text: "Paid", cls: "bg-green-50 text-green-700" };

  // The single most useful line for a support call: why it did not go through.
  const reason =
    a.error?.description ||
    a.error?.reason ||
    (bucket === "abandoned"
      ? "Customer closed the payment screen without completing it."
      : bucket === "pending"
        ? "Checkout opened — not paid yet. Moves to Abandoned if unpaid after 30 minutes."
        : null);

  return (
    <div className="overflow-hidden rounded-xl border border-outline/15 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-surface-container/40"
      >
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            a.kind === "subscription" ? "bg-purple-50" : "bg-primary/10"
          }`}
        >
          {a.kind === "subscription" ? (
            <CreditCard className="h-4 w-4 text-purple-600" />
          ) : (
            <ShoppingCart className="h-4 w-4 text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-on-surface">
              {a.userName || a.userPhone || a.razorpayContact || "Unknown buyer"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
              {badge.text}
            </span>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
              {SOURCE_LABEL[a.source] ?? a.source}
            </span>
          </div>
          {!a.userPhone && (a.razorpayContact || a.razorpayEmail) && (
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {[a.razorpayContact, a.razorpayEmail].filter(Boolean).join(" · ")}
            </p>
          )}

          <p className="mt-1 truncate text-sm text-on-surface-variant">
            {a.kind === "subscription"
              ? `Subscription — ${a.seatCount ?? "?"} seat(s), ${a.durationMonths ?? "?"} month(s)`
              : a.items.length > 0
                ? a.items.map((i) => `${i.name} ×${i.qty}`).join(", ")
                : a.note || "Cart order"}
          </p>

          {reason && (
            <p className="mt-1 text-xs text-red-600">{reason}</p>
          )}

          <p className="mt-1 text-xs text-outline">
            {a.createdAt ? a.createdAt.toLocaleString("en-IN") : "—"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-right">
          <div>
            <p className="font-bold text-on-surface">{money(a.amount)}</p>
            {a.userPhone && (
              <p className="text-xs text-on-surface-variant">{a.userPhone}</p>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-outline transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-outline/10 bg-surface-container/30 p-4">
          {/* Buyer */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Field label="Buyer">{a.userName || "—"}</Field>
            <Field label="Phone">
              {a.userPhone ? (
                <a href={`tel:${a.userPhone}`} className="flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" />
                  {a.userPhone}
                </a>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Razorpay order">
              <code className="text-xs">{a.razorpayOrderId}</code>
            </Field>
          </div>

          {/* Items */}
          {a.items.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-outline">
                <Package className="h-3.5 w-3.5" />
                Items
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-on-surface-variant">
                      <th className="pb-1 pr-3 font-semibold">Product</th>
                      <th className="pb-1 pr-3 font-semibold">Qty</th>
                      <th className="pb-1 pr-3 font-semibold">Unit</th>
                      <th className="pb-1 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.items.map((i, idx) => (
                      <tr key={idx} className="border-t border-outline/10">
                        <td className="py-1.5 pr-3">
                          {i.name}
                          {/* A non-inventory source means the primary price
                              lookup missed — worth seeing when a charge looks off. */}
                          {i.priceSource && i.priceSource !== "inventory" && (
                            <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
                              {i.priceSource}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{i.qty}</td>
                        <td className="py-1.5 pr-3">{money(i.unitPrice)}</td>
                        <td className="py-1.5">{money(i.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {a.subtotal != null && <Field label="Subtotal">{money(a.subtotal)}</Field>}
            {a.deliveryCharge != null && (
              <Field label="Delivery">{money(a.deliveryCharge)}</Field>
            )}
            <Field label="Total">
              <span className="font-bold">{money(a.amount)}</span>
            </Field>
          </div>

          {/* Failure detail */}
          {a.error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-700">
                Razorpay error
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-red-700">
                {a.error.description && <span>{a.error.description}</span>}
                {a.error.reason && <span className="text-xs">reason: {a.error.reason}</span>}
                {a.error.code && <span className="text-xs">code: {a.error.code}</span>}
                {a.error.step && <span className="text-xs">step: {a.error.step}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-outline">{label}</p>
      <div className="mt-0.5 text-on-surface">{children}</div>
    </div>
  );
}
