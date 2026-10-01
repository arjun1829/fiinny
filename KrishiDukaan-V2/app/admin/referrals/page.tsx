"use client";

/**
 * Admin → Referrals. Codes for sales / marketing people, and how each one is
 * converting: link opens → reached checkout → started payment → paid, plus
 * who applied a code but did not pay (with phone, for follow-up).
 *
 * All data goes through /api/admin/referral-codes (requireAdmin + adminLogs).
 * Started / paid / failed come from server-written paymentAttempts, so the
 * numbers cannot be inflated from a buyer's device. See app/lib/referrals.ts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Pause, Play, Plus, Trash2, X, ChevronRight, Share2 } from "lucide-react";
import { auth } from "../../firebase";
import { Panel, StatCard, TimeSeriesLineChart, ChartLegend, inr, type ChartSeries } from "../_components/analytics/ui";
import type { ReferralStats, ReferralOwnerType } from "../../lib/referrals";

type Owner = { uid: string; name: string; email: string; phone: string };
type CodeRow = {
  code: string;
  active: boolean;
  ownerName: string;
  ownerType: ReferralOwnerType;
  ownerUid: string | null;
  note: string;
  createdAt: string | null;
  stats: ReferralStats;
};

type Form = {
  code: string;
  ownerName: string;
  ownerType: ReferralOwnerType;
  ownerUid: string;
  note: string;
  active: boolean;
};

const EMPTY_FORM: Form = { code: "", ownerName: "", ownerType: "sales", ownerUid: "", note: "", active: true };

const TYPE_LABEL: Record<ReferralOwnerType, string> = {
  sales: "Sales",
  marketing: "Marketing",
  partner: "Partner",
  other: "Other",
};

const LEAD_LABEL: Record<string, { label: string; cls: string }> = {
  viewed: { label: "Saw checkout, didn't start", cls: "bg-surface-container text-on-surface-variant" },
  pending: { label: "Paying now", cls: "bg-blue-50 text-blue-700" },
  abandoned: { label: "Started, didn't pay", cls: "bg-amber-50 text-amber-800" },
  failed: { label: "Payment failed", cls: "bg-red-50 text-red-700" },
};

const SERIES: ChartSeries[] = [
  { key: "opens", label: "Link opens", color: "#94a3b8" },
  { key: "started", label: "Started payment", color: "#f59e0b" },
  { key: "paid", label: "Paid", color: "#15803d" },
];

async function authedFetch(url: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function shareLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://krishidukan.com";
  return `${origin}/subscribe?ref=${encodeURIComponent(code)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function suggestCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  return base.length >= 3 ? base : "";
}

export default function AdminReferralsPage() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<CodeRow | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/admin/referral-codes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCodes(data.codes ?? []);
      setOwners(data.owners ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load referral codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => { if (u) void load(); });
    return unsub;
  }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const totals = useMemo(() => {
    const t = { opens: 0, reached: 0, started: 0, paid: 0, lost: 0, revenue: 0 };
    for (const c of codes) {
      t.opens += c.stats.opens;
      t.reached += c.stats.reachedCheckout;
      t.started += c.stats.startedBuyers;
      t.paid += c.stats.paidBuyers;
      t.lost += c.stats.failedOrders + c.stats.abandonedOrders;
      t.revenue += c.stats.revenue;
    }
    return t;
  }, [codes]);

  const daily = useMemo(() => {
    const byDate = new Map<string, { date: string; opens: number; started: number; paid: number }>();
    for (const c of codes) {
      for (const d of c.stats.daily) {
        const row = byDate.get(d.date) ?? { date: d.date, opens: 0, started: 0, paid: 0 };
        row.opens += d.opens;
        row.started += d.started;
        row.paid += d.paid;
        byDate.set(d.date, row);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [codes]);

  const filtered = codes.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.code.toLowerCase().includes(q) || c.ownerName.toLowerCase().includes(q);
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr(null);
    setModalOpen(true);
  };

  const openEdit = (c: CodeRow) => {
    setEditing(c.code);
    setForm({
      code: c.code,
      ownerName: c.ownerName,
      ownerType: c.ownerType,
      ownerUid: c.ownerUid ?? "",
      note: c.note,
      active: c.active,
    });
    setFormErr(null);
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormErr(null);
    try {
      const payload = {
        ownerName: form.ownerName,
        ownerType: form.ownerType,
        ownerUid: form.ownerUid || null,
        note: form.note,
        active: form.active,
      };
      const res = editing
        ? await authedFetch(`/api/admin/referral-codes/${encodeURIComponent(editing)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await authedFetch("/api/admin/referral-codes", {
            method: "POST",
            body: JSON.stringify({ ...payload, code: form.code }),
          });
      const data = await res.json();
      if (!res.ok) {
        setFormErr(data.error ?? "Could not save.");
        return;
      }
      setModalOpen(false);
      flash(editing ? `Updated ${editing}` : `Created ${data.code}`);
      void load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CodeRow) => {
    const res = await authedFetch(`/api/admin/referral-codes/${encodeURIComponent(c.code)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !c.active }),
    });
    if (res.ok) {
      flash(c.active ? `${c.code} paused — its link no longer credits anyone` : `${c.code} is active again`);
      void load();
    } else {
      flash((await res.json()).error ?? "Could not update.");
    }
  };

  const remove = async (c: CodeRow) => {
    if (!window.confirm(`Delete ${c.code}? Links already shared will stop crediting anyone.`)) return;
    const res = await authedFetch(`/api/admin/referral-codes/${encodeURIComponent(c.code)}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      flash(`Deleted ${c.code}`);
      setDetail(null);
      void load();
    } else {
      flash(data.error ?? "Could not delete.");
    }
  };

  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shareLink(code));
      flash("Link copied");
    } catch {
      window.prompt("Copy this link:", shareLink(code));
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-on-surface">Referrals</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Codes for your sales and marketing people. Their link opens the subscription page (web
            or app) with the code applied; a purchase is credited to the code used at that checkout.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" /> New code
        </button>
      </div>

      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-on-surface px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Link opens" value={totals.opens.toLocaleString("en-IN")} />
        <StatCard label="Reached checkout" value={totals.reached.toLocaleString("en-IN")} />
        <StatCard label="Started payment" value={totals.started.toLocaleString("en-IN")} />
        <StatCard label="Paid customers" value={totals.paid.toLocaleString("en-IN")} color="bg-green-50 text-green-700" />
        <StatCard label="Failed / not paid" value={totals.lost.toLocaleString("en-IN")} color="bg-amber-50 text-amber-800" />
        <StatCard label="Revenue" value={inr(totals.revenue)} />
      </div>

      <Panel title="Last 30 days — all codes" right={<ChartLegend series={SERIES} />}>
        <TimeSeriesLineChart data={daily} series={SERIES} height={220} />
      </Panel>

      <Panel
        title={`Codes (${codes.length})`}
        right={
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or name"
            className="w-48 rounded-lg border border-surface-container px-3 py-1.5 text-sm"
          />
        }
      >
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">
            {codes.length === 0 ? "No referral codes yet — create one for each sales or marketing person." : "No codes match."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-surface-container text-left text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3 text-right">Opens</th>
                  <th className="py-2 pr-3 text-right">Checkout</th>
                  <th className="py-2 pr-3 text-right">Started</th>
                  <th className="py-2 pr-3 text-right">Paid</th>
                  <th className="py-2 pr-3 text-right">Not paid</th>
                  <th className="py-2 pr-3 text-right">Revenue</th>
                  <th className="py-2 pr-3 text-right">Conv.</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.code} className="border-b border-surface-container/60 last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="font-mono font-bold text-on-surface">{c.code}</span>
                      {!c.active && (
                        <span className="ml-2 rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-on-surface">{c.ownerName}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        {TYPE_LABEL[c.ownerType]}
                        {c.ownerUid ? " · sales app" : ""}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-right">{c.stats.opens}</td>
                    <td className="py-2.5 pr-3 text-right">{c.stats.reachedCheckout}</td>
                    <td className="py-2.5 pr-3 text-right">{c.stats.startedBuyers}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-green-700">{c.stats.paidBuyers}</td>
                    <td className="py-2.5 pr-3 text-right text-amber-800">
                      {c.stats.failedOrders + c.stats.abandonedOrders}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold">{inr(c.stats.revenue)}</td>
                    <td className="py-2.5 pr-3 text-right">{c.stats.conversionPct}%</td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Copy share link" onClick={() => copyLink(c.code)} className="rounded-lg p-1.5 hover:bg-surface-container">
                          <Copy className="h-4 w-4" />
                        </button>
                        <button title="Edit" onClick={() => openEdit(c)} className="rounded-lg p-1.5 hover:bg-surface-container">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          title={c.active ? "Pause" : "Resume"}
                          onClick={() => toggleActive(c)}
                          className="rounded-lg p-1.5 hover:bg-surface-container"
                        >
                          {c.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button title="Details" onClick={() => setDetail(c)} className="rounded-lg p-1.5 hover:bg-surface-container">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Create / edit ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black">{editing ? `Edit ${editing}` : "New referral code"}</h2>
              <button onClick={() => setModalOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">
                  Sales app account (optional)
                </span>
                <select
                  value={form.ownerUid}
                  onChange={(e) => {
                    const o = owners.find((x) => x.uid === e.target.value);
                    setForm((f) => ({
                      ...f,
                      ownerUid: e.target.value,
                      ownerType: o ? "sales" : f.ownerType,
                      ownerName: o && !f.ownerName ? o.name : f.ownerName,
                      code: o && !editing && !f.code ? suggestCode(o.name) : f.code,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                >
                  <option value="">Not linked — no sales app login</option>
                  {owners.map((o) => (
                    <option key={o.uid} value={o.uid}>
                      {o.name || o.email || o.phone} {o.email ? `(${o.email})` : ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-on-surface-variant">
                  Linked people see this code, its link and its results in the sales app.
                </span>
              </label>
              <label className="block text-sm">
                <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">Code</span>
                <input
                  value={form.code}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) }))}
                  placeholder="RAHUL"
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2 font-mono uppercase disabled:bg-surface-container/40"
                />
                <span className="mt-1 block text-xs text-on-surface-variant">
                  {editing
                    ? "Codes can't be renamed — links already shared would stop working. Create a new code instead."
                    : "3–20 letters or numbers. This is what people type and what appears in the link."}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">Person&apos;s name</span>
                  <input
                    value={form.ownerName}
                    onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                    placeholder="Rahul Patil"
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">Team</span>
                  <select
                    value={form.ownerType}
                    onChange={(e) => setForm((f) => ({ ...f, ownerType: e.target.value as ReferralOwnerType }))}
                    className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                  >
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-[10px] font-black uppercase tracking-wide text-on-surface-variant">Note (admin only)</span>
                <input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Nashik district drive"
                  className="mt-1 w-full rounded-lg border border-surface-container px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                Active — the link and code credit this person
              </label>
              {formErr ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formErr}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setModalOpen(false)} className="rounded-xl px-4 py-2 text-sm font-bold">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : editing ? "Save changes" : "Create code"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail drawer ── */}
      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-mono text-2xl font-black">{detail.code}</h2>
                <p className="text-sm text-on-surface-variant">
                  {detail.ownerName} · {TYPE_LABEL[detail.ownerType]}
                  {detail.ownerUid ? " · sales app" : ""}
                  {!detail.active ? " · Paused" : ""}
                </p>
                {detail.note ? <p className="mt-1 text-xs text-on-surface-variant">{detail.note}</p> : null}
              </div>
              <button onClick={() => setDetail(null)}><X className="h-5 w-5" /></button>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              <button onClick={() => copyLink(detail.code)} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-container px-3 py-1.5 text-sm font-bold">
                <Copy className="h-4 w-4" /> Copy link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Start selling on KrishiDukan: ${shareLink(detail.code)}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-container px-3 py-1.5 text-sm font-bold"
              >
                <Share2 className="h-4 w-4" /> WhatsApp
              </a>
              <button onClick={() => openEdit(detail)} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-container px-3 py-1.5 text-sm font-bold">
                <Pencil className="h-4 w-4" /> Edit
              </button>
              {detail.stats.startedBuyers === 0 ? (
                <button onClick={() => remove(detail)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-red-600">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              ) : null}
            </div>

            <Funnel stats={detail.stats} />

            <div className="mt-5">
              <Panel title="Last 30 days" right={<ChartLegend series={SERIES} />}>
                <TimeSeriesLineChart data={detail.stats.daily} series={SERIES} height={180} />
              </Panel>
            </div>

            <h3 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-on-surface-variant">
              Didn&apos;t finish ({detail.stats.leads.length})
            </h3>
            {detail.stats.leads.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Nobody is stuck — everyone who started has paid.</p>
            ) : (
              <div className="divide-y divide-surface-container rounded-xl border border-surface-container">
                {detail.stats.leads.map((l) => (
                  <div key={l.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">{l.name || "Unknown"}</p>
                      <p className="text-xs text-on-surface-variant">
                        {l.phone ? <a href={`tel:${l.phone}`} className="font-mono hover:text-primary">{l.phone}</a> : "No phone"}
                        {" · "}{fmtDate(l.lastAt)}
                        {l.amount ? ` · ${inr(l.amount)}` : ""}
                        {l.seatCount ? ` · ${l.seatCount} products` : ""}
                        {l.durationMonths ? ` · ${l.durationMonths} mo` : ""}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${LEAD_LABEL[l.status]?.cls ?? ""}`}>
                      {LEAD_LABEL[l.status]?.label ?? l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal funnel bars, each step as a share of link opens (or the top step). */
function Funnel({ stats }: { stats: ReferralStats }) {
  const steps = [
    { label: "Link opens", value: stats.opens, cls: "bg-slate-400" },
    { label: "Reached checkout", value: stats.reachedCheckout, cls: "bg-sky-500" },
    { label: "Started payment", value: stats.startedBuyers, cls: "bg-amber-500" },
    { label: "Paid", value: stats.paidBuyers, cls: "bg-green-600" },
  ];
  const top = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label}>
          <div className="mb-0.5 flex justify-between text-xs font-semibold">
            <span>{s.label}</span>
            <span>{s.value}</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-container">
            <div className={`h-2.5 rounded-full ${s.cls}`} style={{ width: `${(s.value / top) * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
        <div className="rounded-lg bg-red-50 p-2"><p className="text-lg font-black text-red-700">{stats.failedOrders}</p>Payment failed</div>
        <div className="rounded-lg bg-amber-50 p-2"><p className="text-lg font-black text-amber-800">{stats.abandonedOrders}</p>Started, didn&apos;t pay</div>
        <div className="rounded-lg bg-green-50 p-2"><p className="text-lg font-black text-green-700">{inr(stats.revenue)}</p>{stats.paidOrders} paid order{stats.paidOrders === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}
