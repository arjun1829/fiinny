"use client";

/**
 * Admin control for the self-serve subscription price and promo codes.
 *
 * Before this page existed, the per-listing price was hardcoded in three code
 * files and promo codes had to be typed into the Firestore console by hand —
 * and the admin Plans tab (which DOES have a price field) only affected
 * admin-assigned subscriptions, never what a self-serve seller was charged.
 *
 * Everything here writes through /api/admin/* with requireAdmin + adminLogs.
 * Saving the ladder changes what sellers are billed on their next checkout.
 *
 * Layout: two tabs — "Subscription Pricing" (default) and "Promo Codes". The
 * promo create/edit form lives in a modal that opens ONLY on Add/Edit; it never
 * auto-opens. Edit also surfaces a read-only change history sourced from the
 * adminLogs audit trail the promo routes already write.
 */

import { useCallback, useEffect, useState } from "react";
import { auth } from "../../firebase";
import { DEFAULT_DURATIONS, tierOf, type DurationPrice } from "../../lib/pricing";

/** A ladder-unique id for a newly added Standard row (standard-2, -3, …). */
function newStandardId(rows: DurationPrice[]): string {
  const taken = new Set(rows.map((r) => r.id).filter(Boolean));
  for (let n = rows.length + 1; ; n++) {
    const id = `standard-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Standard billing periods offered by the subscription ladder. */
const PLAN_OPTIONS: { months: number; label: string }[] = [
  { months: 1,  label: "Monthly (1 mo)" },
  { months: 3,  label: "3 Months" },
  { months: 6,  label: "6 Months" },
  { months: 12, label: "Yearly (12 mo)" },
];

interface PromoRow {
  id: string;
  code: string;
  discountPercent: number;
  active: boolean;
  note: string;
  applicablePlans?: number[];
  minSeats?: number;
  maxSeats?: number;
  startDate?: string;
  endDate?: string;
}

interface PromoForm {
  code: string;
  discountPercent: string;
  note: string;
  applicablePlans: number[];
  minSeats: string;
  maxSeats: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

const EMPTY_FORM: PromoForm = {
  code: "",
  discountPercent: "",
  note: "",
  applicablePlans: [],
  minSeats: "",
  maxSeats: "",
  startDate: "",
  endDate: "",
  active: true,
};

type TabKey = "pricing" | "promos";

// ─── Usage / history shapes (read-only, from the new additive endpoints) ──────

interface PromoUse {
  id: string;
  name: string | null;
  ownerPhone: string | null;
  ownerType: string | null;
  planName: string | null;
  durationMonths: number | null;
  seatsPurchased: number | null;
  amountPaid: number | null;
  currency: string;
  subscriptionStatus: string | null;
  razorpayOrderId: string | null;
  purchasedAt: string | null;
}
interface PromoUsage {
  discountPercent: number | null;
  counts: { total: number };
  uses: PromoUse[];
}

interface HistoryEntry {
  id: string;
  action: string;
  performedBy: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string | null;
}
interface PromoHistory {
  meta: {
    createdBy: string | null;
    createdAt: string | null;
    updatedBy: string | null;
    updatedAt: string | null;
  };
  entries: HistoryEntry[];
}

async function authedFetch(url: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminPricingPage() {
  const [tab, setTab] = useState<TabKey>("pricing");

  const [rows, setRows] = useState<DurationPrice[]>(DEFAULT_DURATIONS);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [promoForm, setPromoForm] = useState<PromoForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Change-history panel inside the edit modal.
  const [history, setHistory] = useState<PromoHistory | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);

  // Usage modal (per row).
  const [usageFor, setUsageFor] = useState<string | null>(null);
  const [usage, setUsage] = useState<PromoUsage | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);

  // Successful-use count per code, shown in the list.
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        authedFetch("/api/admin/pricing"),
        authedFetch("/api/admin/promo-codes"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setRows(d.durations ?? DEFAULT_DURATIONS);
        setUsingDefaults(Boolean(d.usingDefaults));
      }
      if (cRes.ok) {
        setPromos((await cRes.json()).codes ?? []);
        // Successful-use counts are a separate, best-effort read — a failure
        // here must not blank the promo list.
        authedFetch("/api/admin/promo-codes/usage-counts")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.counts) setUsageCounts(d.counts); })
          .catch(() => {});
      } else {
        const err = await cRes.json().catch(() => ({}));
        setPromoMsg({
          kind: "err",
          text: err.error ?? `Could not load promo codes (HTTP ${cRes.status}). Check that you are signed in as an admin.`,
        });
      }
    } catch {
      setMsg({ kind: "err", text: "Could not load pricing. Check your connection." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => { if (u) void load(); });
    return () => unsub();
  }, [load]);

  const setRow = (i: number, patch: Partial<DurationPrice>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const savePricing = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await authedFetch("/api/admin/pricing", {
        method: "PUT",
        // A Standard row's per-listing figure is derived, not typed: it only
        // keeps the row a valid ladder entry and feeds per-month labels.
        body: JSON.stringify({
          durations: rows.map((r) =>
            tierOf(r) === "standard" && r.flatPrice && r.includedListings
              ? { ...r, pricePerSeat: Math.max(1, Math.round(r.flatPrice / r.includedListings)) }
              : r,
          ),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "Save failed." });
      } else {
        setRows(data.durations);
        setUsingDefaults(false);
        setMsg({ kind: "ok", text: "Saved. New checkouts will use these prices." });
      }
    } catch {
      setMsg({ kind: "err", text: "Save failed. Check your connection." });
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = (months: number) => {
    setPromoForm((f) => ({
      ...f,
      applicablePlans: f.applicablePlans.includes(months)
        ? f.applicablePlans.filter((m) => m !== months)
        : [...f.applicablePlans, months],
    }));
  };

  const openAdd = () => {
    setEditingId(null);
    setPromoForm(EMPTY_FORM);
    setPromoMsg(null);
    setHistory(null);
    setHistoryOpen(false);
    setModalOpen(true);
  };

  const openEdit = (p: PromoRow) => {
    setEditingId(p.id);
    setPromoForm({
      code: p.code,
      discountPercent: String(p.discountPercent),
      note: p.note,
      applicablePlans: p.applicablePlans ?? [],
      minSeats: p.minSeats != null ? String(p.minSeats) : "",
      maxSeats: p.maxSeats != null ? String(p.maxSeats) : "",
      startDate: p.startDate ?? "",
      endDate: p.endDate ?? "",
      active: p.active,
    });
    setPromoMsg(null);
    setHistory(null);
    setHistoryOpen(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setPromoForm(EMPTY_FORM);
    setPromoMsg(null);
    setHistory(null);
    setHistoryOpen(false);
  };

  const loadHistory = async (id: string) => {
    setHistoryOpen((o) => !o);
    if (history || historyBusy) return; // already loaded / loading
    setHistoryBusy(true);
    try {
      const res = await authedFetch(`/api/admin/promo-codes/${encodeURIComponent(id)}/history`);
      if (res.ok) setHistory(await res.json());
    } finally {
      setHistoryBusy(false);
    }
  };

  const openUsage = async (id: string) => {
    setUsageFor(id);
    setUsage(null);
    setUsageBusy(true);
    try {
      const res = await authedFetch(`/api/admin/promo-codes/${encodeURIComponent(id)}/usage`);
      if (res.ok) setUsage(await res.json());
    } finally {
      setUsageBusy(false);
    }
  };

  const submitPromo = async () => {
    setPromoBusy(true);
    setPromoMsg(null);
    try {
      const payload = {
        code: promoForm.code,
        discountPercent: Number(promoForm.discountPercent),
        note: promoForm.note,
        active: promoForm.active,
        ...(promoForm.applicablePlans.length > 0
          ? { applicablePlans: promoForm.applicablePlans }
          : { applicablePlans: [] }),
        ...(promoForm.minSeats ? { minSeats: Number(promoForm.minSeats) } : { minSeats: null }),
        ...(promoForm.maxSeats ? { maxSeats: Number(promoForm.maxSeats) } : { maxSeats: null }),
        ...(promoForm.startDate ? { startDate: promoForm.startDate } : { startDate: null }),
        ...(promoForm.endDate ? { endDate: promoForm.endDate } : { endDate: null }),
      };

      let res: Response;
      if (editingId) {
        const { code: _code, ...patchPayload } = payload;
        res = await authedFetch(
          `/api/admin/promo-codes/${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(patchPayload) },
        );
      } else {
        res = await authedFetch("/api/admin/promo-codes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setPromoMsg({ kind: "err", text: data.error ?? "Could not save promo code." });
      } else {
        const label = editingId ? `Updated ${editingId}.` : `Created ${data.id}.`;
        closeModal();
        setPromoMsg({ kind: "ok", text: label });
        void load();
      }
    } finally {
      setPromoBusy(false);
    }
  };

  const patchPromo = async (id: string, patch: Record<string, unknown>) => {
    await authedFetch(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    void load();
  };

  const deletePromo = async (id: string) => {
    await authedFetch(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    void load();
  };

  const banner = (m: { kind: "ok" | "err"; text: string }) => (
    <div
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
        m.kind === "ok"
          ? "bg-primary/10 text-primary"
          : "bg-red-50 text-red-700"
      }`}
    >
      {m.text}
    </div>
  );

  const planLabel = (months: number) =>
    months === 12 ? "Yearly" : months === 1 ? "Monthly" : `${months} Mo`;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="py-8">
      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 border-b border-surface-container">
        {([
          { key: "pricing", label: "Subscription Pricing" },
          { key: "promos", label: "Promo Codes" },
        ] as { key: TabKey; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px rounded-t-lg px-4 py-2.5 text-sm font-bold transition ${
              tab === t.key
                ? "border-b-2 border-primary text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
            {t.key === "promos" ? (
              <span className="ml-2 rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] font-black text-on-surface-variant">
                {promos.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Subscription Pricing tab ── */}
      {tab === "pricing" && (
        <section className="pt-8">
          <h1 className="text-xl font-black text-on-surface">Subscription pricing</h1>
          <p className="mt-1.5 text-sm text-on-surface-variant">
            What sellers pay at checkout, on web and in the app. Saving updates the
            website checkout, the mobile app, the seller dashboard and the public{" "}
            <code>/sell</code> page — all of them read this one setting. Past
            subscriptions keep the plan and price they were bought at.
          </p>

          {usingDefaults ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
              No saved pricing yet — showing the built-in defaults. Save to make them
              editable.
            </div>
          ) : null}

          {(["standard", "custom"] as const).map((tk) => {
            const tierRows = rows
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => tierOf(r) === tk);
            const isStd = tk === "standard";
            return (
              <div key={tk} className="mt-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">
                  {isStd ? "Standard plans" : "Custom plans"}
                  <span className="ml-2 rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] text-on-surface-variant">
                    {tierRows.length}
                  </span>
                </h2>
                <p className="mb-3 mt-1 text-xs text-on-surface-variant">
                  {isStd ? (
                    <>
                      The default tab at checkout. A fixed price for a fixed number of products —
                      the seller only picks the period. <strong>Was ₹</strong> is shown struck
                      through next to the price (display only, never charged). Remove every
                      Standard plan to hide the Standard tab.
                    </>
                  ) : (
                    <>
                      The seller picks how many products (in blocks of 10) and pays per product.
                      Leave <strong>₹ flat</strong> empty for a normal per-product price, or fill it
                      in to sell a bundle of up to <strong>Listings incl.</strong> products.
                    </>
                  )}{" "}
                  Use <strong>Who can buy</strong> to keep a plan off the wrong account type.
                </p>
                {tierRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-surface-container px-4 py-5 text-center text-sm text-on-surface-variant">
                    No {isStd ? "Standard" : "Custom"} plans — this tab is hidden at checkout.
                  </div>
                ) : null}
                <div className="space-y-3">
                  {tierRows.map(({ r, i }) => (
                    <div
                      key={i}
                      className={`grid grid-cols-1 gap-3 rounded-2xl border border-surface-container bg-white p-4 ${
                        isStd
                          ? "sm:grid-cols-[100px_130px_120px_120px_minmax(120px,200px)_150px_auto]"
                          : "sm:grid-cols-[100px_120px_130px_120px_minmax(120px,220px)_150px_auto]"
                      }`}
                    >
                      <label className="text-sm">
                        <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                          Months
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={r.months}
                          onChange={(e) => setRow(i, { months: Number(e.target.value) })}
                          className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                        />
                      </label>
                      {isStd ? (
                        <>
                          <label className="text-sm">
                            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                              ₹ price
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={r.flatPrice ?? ""}
                              onChange={(e) => setRow(i, { flatPrice: Number(e.target.value) })}
                              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                              Products
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={r.includedListings ?? ""}
                              onChange={(e) => setRow(i, { includedListings: Number(e.target.value) })}
                              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                              Was ₹ (optional)
                            </span>
                            <input
                              type="number"
                              min={0}
                              placeholder="—"
                              value={r.compareAtPrice ?? ""}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setRow(i, { compareAtPrice: v === "" ? undefined : Number(v) });
                              }}
                              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="text-sm">
                            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                              ₹ per listing
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={r.pricePerSeat}
                              onChange={(e) => setRow(i, { pricePerSeat: Number(e.target.value) })}
                              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                              ₹ flat (bundle)
                            </span>
                            <input
                              type="number"
                              min={0}
                              placeholder="—"
                              value={r.flatPrice ?? ""}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setRow(i, v === ""
                                  ? { flatPrice: undefined, includedListings: undefined }
                                  : { flatPrice: Number(v), includedListings: r.includedListings ?? 50 });
                              }}
                              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                            />
                          </label>
                          <label className="text-sm">
                            <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                              Listings incl.
                            </span>
                            <input
                              type="number"
                              min={1}
                              placeholder="—"
                              disabled={r.flatPrice === undefined}
                              value={r.includedListings ?? ""}
                              onChange={(e) => setRow(i, { includedListings: Number(e.target.value) })}
                              className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2 disabled:bg-surface-container/40"
                            />
                          </label>
                        </>
                      )}
                      <label className="text-sm">
                        <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                          Badge (optional)
                        </span>
                        <input
                          value={r.badge ?? ""}
                          placeholder={isStd ? "Save 24%" : "Save 14%"}
                          onChange={(e) => setRow(i, { badge: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                          Who can buy
                        </span>
                        <select
                          value={r.roles?.length ? r.roles[0] : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRow(i, { roles: v ? [v] : undefined });
                          }}
                          className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                        >
                          <option value="">Everyone</option>
                          <option value="retailer">Retailers only</option>
                          <option value="manufacturer">Manufacturers only</option>
                        </select>
                      </label>
                      <button
                        onClick={() => {
                          if (!window.confirm(
                            "Remove this plan? Sellers stop seeing it after you save. Subscriptions already bought on it are not affected.",
                          )) return;
                          setRows((x) => x.filter((_, j) => j !== i));
                        }}
                        disabled={rows.length <= 1}
                        className="self-end rounded-lg px-3 py-2 text-sm font-bold text-red-600 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setRows((r) => [
                      ...r,
                      isStd
                        ? {
                            id: newStandardId(r),
                            tier: "standard" as const,
                            months: 1,
                            pricePerSeat: 0,
                            flatPrice: 0,
                            includedListings: 100,
                          }
                        : { months: 1, pricePerSeat: 0 },
                    ])
                  }
                  className="mt-3 rounded-xl border border-surface-container px-4 py-2 text-sm font-bold text-on-surface"
                >
                  {isStd ? "Add Standard plan" : "Add Custom duration"}
                </button>
              </div>
            );
          })}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={savePricing}
              disabled={saving}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save pricing"}
            </button>
            {msg ? banner(msg) : null}
          </div>
        </section>
      )}

      {/* ── Promo Codes tab ── */}
      {tab === "promos" && (
        <section className="pt-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-on-surface">
                Promo codes{" "}
                <span className="text-on-surface-variant">({promos.length})</span>
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant">
                Percentage discounts sellers can apply at checkout. The discount is
                re-checked on the server when the payment is created — conditions like
                plan restrictions, seat limits and expiry are enforced server-side.
              </p>
            </div>
            <button
              onClick={openAdd}
              className="shrink-0 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
            >
              + Add Promo Code
            </button>
          </div>

          {promoMsg ? <div className="mt-4">{banner(promoMsg)}</div> : null}

          {/* ── Promo code list ── */}
          <div className="mt-5 space-y-2">
            {promos.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No promo codes yet. Click <strong>Add Promo Code</strong> to create one.
              </p>
            ) : (
              promos.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-surface-container bg-white px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-black text-on-surface">
                      {p.code}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                      {p.discountPercent}% off
                    </span>

                    {p.applicablePlans?.length ? (
                      <span className="flex flex-wrap gap-1">
                        {p.applicablePlans.map((m) => (
                          <span
                            key={m}
                            className="rounded-full bg-surface-container-low px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant"
                          >
                            {planLabel(m)}
                          </span>
                        ))}
                      </span>
                    ) : null}

                    {(p.minSeats != null || p.maxSeats != null) && (
                      <span className="text-xs text-on-surface-variant">
                        {p.minSeats != null && p.maxSeats != null
                          ? `${p.minSeats}–${p.maxSeats} seats`
                          : p.minSeats != null
                          ? `≥${p.minSeats} seats`
                          : `≤${p.maxSeats} seats`}
                      </span>
                    )}

                    {(p.startDate || p.endDate) && (
                      <span className="text-xs text-on-surface-variant">
                        {p.startDate && p.endDate
                          ? `${p.startDate} → ${p.endDate}`
                          : p.startDate
                          ? `from ${p.startDate}`
                          : `until ${p.endDate}`}
                      </span>
                    )}

                    {p.note ? (
                      <span className="text-xs text-on-surface-variant">{p.note}</span>
                    ) : null}

                    <span className="ml-auto flex items-center gap-2">
                      <span
                        className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-[11px] font-bold text-on-surface-variant"
                        title="Successful subscriptions purchased with this code"
                      >
                        {usageCounts[p.code] ?? 0} used
                      </span>
                      <button
                        onClick={() => patchPromo(p.id, { active: !p.active })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                          p.active
                            ? "bg-primary/10 text-primary"
                            : "bg-surface-container-low text-on-surface-variant"
                        }`}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </button>
                      <button
                        onClick={() => openUsage(p.id)}
                        className="rounded-lg bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface"
                      >
                        View Usage
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded-lg bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePromo(p.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600"
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── Add / Edit modal ── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-8">
            <div
              id="promo-form"
              className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-surface-container bg-white p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-black text-on-surface">
                  {editingId ? `Edit promo code — ${editingId}` : "Add promo code"}
                </h3>
                <button
                  onClick={closeModal}
                  className="rounded-lg px-2 py-1 text-sm font-bold text-on-surface-variant hover:bg-surface-container"
                >
                  ✕
                </button>
              </div>

              {/* Row 1: Code, Discount %, Active */}
              <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                <label className="text-sm">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                    Code *
                  </span>
                  <input
                    value={promoForm.code}
                    placeholder="LAUNCH20"
                    disabled={!!editingId}
                    onChange={(e) =>
                      setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                    }
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2 disabled:bg-surface-container/30 disabled:cursor-not-allowed"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                    Discount % *
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step="any"
                    value={promoForm.discountPercent}
                    onChange={(e) =>
                      setPromoForm((f) => ({ ...f, discountPercent: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  />
                </label>
                <label className="flex items-end gap-2 pb-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={promoForm.active}
                    onChange={(e) => setPromoForm((f) => ({ ...f, active: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-semibold text-on-surface">Active</span>
                </label>
              </div>

              {/* Row 2: Note */}
              <label className="block text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  Internal note
                </span>
                <input
                  value={promoForm.note}
                  placeholder="e.g. Yearly discount for launch campaign"
                  onChange={(e) => setPromoForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
              </label>

              {/* Row 3: Applicable plans */}
              <div className="text-sm">
                <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant mb-2">
                  Applicable plans
                  <span className="ml-1 font-normal normal-case text-on-surface-variant/70">
                    (leave all unchecked = valid for every plan)
                  </span>
                </span>
                <p className="mb-2 text-xs text-on-surface-variant">
                  By billing period — a code valid for Yearly works on both Standard Yearly and
                  Custom 1-year. Seat limits are checked against the products the plan grants
                  (100 for Standard).
                </p>
                <div className="flex flex-wrap gap-3">
                  {PLAN_OPTIONS.map((opt) => (
                    <label key={opt.months} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={promoForm.applicablePlans.includes(opt.months)}
                        onChange={() => togglePlan(opt.months)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm font-medium text-on-surface">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Row 4: Seat conditions */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                    Minimum seats
                    <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional)</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    placeholder="—"
                    value={promoForm.minSeats}
                    onChange={(e) => setPromoForm((f) => ({ ...f, minSeats: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                    Maximum seats
                    <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional)</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    placeholder="—"
                    value={promoForm.maxSeats}
                    onChange={(e) => setPromoForm((f) => ({ ...f, maxSeats: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  />
                </label>
              </div>

              {/* Row 5: Dates */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                    Start date
                    <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional, defaults to now)</span>
                  </span>
                  <input
                    type="date"
                    value={promoForm.startDate}
                    onChange={(e) => setPromoForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                    End date
                    <span className="ml-1 font-normal normal-case text-on-surface-variant/70">(optional, leave blank = no expiry)</span>
                  </span>
                  <input
                    type="date"
                    value={promoForm.endDate}
                    onChange={(e) => setPromoForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  />
                </label>
              </div>

              {/* Change history — edit mode only, sourced from the adminLogs trail. */}
              {editingId && (
                <div className="rounded-xl border border-surface-container bg-surface-container-low/40">
                  <button
                    onClick={() => loadHistory(editingId)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-bold text-on-surface"
                  >
                    <span>Change details</span>
                    <span className="text-on-surface-variant">{historyOpen ? "▲" : "▼"}</span>
                  </button>
                  {historyOpen && (
                    <div className="border-t border-surface-container px-4 py-3 text-sm">
                      {historyBusy ? (
                        <p className="text-on-surface-variant">Loading…</p>
                      ) : history ? (
                        <>
                          <div className="mb-3 grid gap-1 text-xs text-on-surface-variant sm:grid-cols-2">
                            <span>Created: {fmtDateTime(history.meta.createdAt)}{history.meta.createdBy ? ` · by ${history.meta.createdBy}` : ""}</span>
                            <span>Last updated: {fmtDateTime(history.meta.updatedAt)}{history.meta.updatedBy ? ` · by ${history.meta.updatedBy}` : ""}</span>
                          </div>
                          {history.entries.length === 0 ? (
                            <p className="text-xs text-on-surface-variant">
                              No recorded changes for this code. (Codes added directly in
                              Firestore before the admin UI have no audit trail — only edits
                              made here are tracked.)
                            </p>
                          ) : (
                            <ol className="space-y-2">
                              {history.entries.map((e) => (
                                <li key={e.id} className="rounded-lg bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-on-surface">
                                      {e.action === "admin_promo_create"
                                        ? "Created"
                                        : e.action === "admin_promo_update"
                                        ? "Updated"
                                        : "Deleted"}
                                    </span>
                                    <span className="text-[11px] text-on-surface-variant">
                                      {fmtDateTime(e.createdAt)}
                                    </span>
                                  </div>
                                  {e.performedBy ? (
                                    <div className="text-[11px] text-on-surface-variant">by {e.performedBy}</div>
                                  ) : null}
                                  {e.action === "admin_promo_update" && e.after ? (
                                    <ul className="mt-1 space-y-0.5">
                                      {Object.entries(e.after)
                                        .filter(([k]) => !["updatedAt", "updatedBy"].includes(k))
                                        .map(([k, v]) => (
                                          <li key={k} className="text-[11px] text-on-surface-variant">
                                            <span className="font-semibold text-on-surface">{k}</span>
                                            {e.before && k in e.before
                                              ? `: ${JSON.stringify((e.before as Record<string, unknown>)[k])} → ${JSON.stringify(v)}`
                                              : `: ${JSON.stringify(v)}`}
                                          </li>
                                        ))}
                                    </ul>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          )}
                        </>
                      ) : (
                        <p className="text-on-surface-variant">Could not load change history.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={submitPromo}
                  disabled={promoBusy || !promoForm.code || !promoForm.discountPercent}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {promoBusy ? "Saving…" : editingId ? "Save changes" : "Add"}
                </button>
                <button
                  onClick={closeModal}
                  className="rounded-xl border border-surface-container px-4 py-2.5 text-sm font-bold text-on-surface"
                >
                  Cancel
                </button>
                {promoMsg ? banner(promoMsg) : null}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Usage modal ── */}
      {usageFor && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setUsageFor(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-8">
            <div className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-surface-container bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-black text-on-surface">
                  Usage — <span className="font-mono">{usageFor}</span>
                </h3>
                <button
                  onClick={() => setUsageFor(null)}
                  className="rounded-lg px-2 py-1 text-sm font-bold text-on-surface-variant hover:bg-surface-container"
                >
                  ✕
                </button>
              </div>

              {usageBusy ? (
                <p className="mt-4 text-sm text-on-surface-variant">Loading…</p>
              ) : usage ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                      {usage.counts.total} successful {usage.counts.total === 1 ? "use" : "uses"}
                    </span>
                    {usage.discountPercent != null ? (
                      <span className="rounded-xl bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface-variant">
                        {usage.discountPercent}% off
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-on-surface-variant">
                    Only completed subscription purchases are shown — attempted, failed or
                    cancelled payments are excluded, and duplicate callbacks are counted once.
                  </p>

                  {usage.uses.length === 0 ? (
                    <p className="mt-4 text-sm text-on-surface-variant">
                      No subscription has been purchased with this code yet.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-surface-container text-[10px] uppercase tracking-wide text-on-surface-variant">
                            <th className="py-2 pr-3 font-black">Business / User</th>
                            <th className="py-2 pr-3 font-black">Phone</th>
                            <th className="py-2 pr-3 font-black">Plan</th>
                            <th className="py-2 pr-3 font-black">Cycle</th>
                            <th className="py-2 pr-3 font-black">Seats</th>
                            <th className="py-2 pr-3 font-black">Amount</th>
                            <th className="py-2 pr-3 font-black">Purchased</th>
                            <th className="py-2 pr-3 font-black">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usage.uses.map((u) => (
                            <tr key={u.id} className="border-b border-surface-container/60">
                              <td className="py-2 pr-3 text-on-surface">
                                {u.name ?? u.ownerPhone ?? "—"}
                                {u.ownerType ? (
                                  <span className="ml-1 text-[11px] text-on-surface-variant capitalize">
                                    ({u.ownerType})
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant">{u.ownerPhone ?? "—"}</td>
                              <td className="py-2 pr-3 text-on-surface-variant">{u.planName ?? "—"}</td>
                              <td className="py-2 pr-3 text-on-surface-variant">
                                {u.durationMonths != null ? `${u.durationMonths} mo` : "—"}
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant">
                                {u.seatsPurchased ?? "—"}
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant">
                                {u.amountPaid != null ? `₹${u.amountPaid}` : "—"}
                              </td>
                              <td className="py-2 pr-3 text-on-surface-variant">{fmtDateTime(u.purchasedAt)}</td>
                              <td className="py-2 pr-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                    u.subscriptionStatus === "active" || u.subscriptionStatus === "paid"
                                      ? "bg-primary/10 text-primary"
                                      : u.subscriptionStatus === "revoked"
                                      ? "bg-red-50 text-red-700"
                                      : "bg-surface-container-low text-on-surface-variant"
                                  }`}
                                >
                                  {u.subscriptionStatus ?? "—"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-on-surface-variant">Could not load usage.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
