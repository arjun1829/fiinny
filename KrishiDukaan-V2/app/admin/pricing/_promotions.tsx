"use client";

/**
 * Promotions tab for /admin/pricing — manually grant promotional subscription
 * seats to selected retailers/manufacturers WITHOUT checkout (unlike promo
 * codes). All reads/writes go through /api/admin/promotions/* (requireAdmin,
 * Admin SDK). Each grant becomes a promotional `subscriptions` doc so it reuses
 * the existing access/seat/expiry machinery; see app/lib/promotions.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../firebase";
import {
  ELIGIBILITY_OPTIONS,
  MARKETING_TEMPLATES,
  ROLE_OPTIONS,
  STATUS_LABEL,
  type CandidateRecipient,
  type EligibilityFilter,
  type MarketingTemplateId,
  type PromotionRecipientRecord,
  type PromotionSummary,
  type PromotionTargetRole,
  type RecipientStatus,
} from "../../lib/promotions";

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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Human-readable summary of a promotion's stored eligibility filter list. */
function eligibilityLabels(values: EligibilityFilter[]): string {
  if (!values.length || values.includes("all")) return "All";
  return ELIGIBILITY_OPTIONS.filter((o) => values.includes(o.value))
    .map((o) => o.label)
    .join(", ");
}

/** Today as yyyy-mm-dd for the date input default. */
function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_BADGE: Record<RecipientStatus, string> = {
  paid: "bg-green-100 text-green-700",
  promotional: "bg-purple-100 text-purple-700",
  manufacturer: "bg-blue-100 text-blue-700",
  expired: "bg-gray-100 text-gray-500",
  none: "bg-amber-100 text-amber-700",
};

const PROMO_STATUS_BADGE: Record<PromotionSummary["status"], string> = {
  scheduled: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  ended: "bg-gray-100 text-gray-500",
};

const ASSIGN_STATUS_BADGE: Record<PromotionRecipientRecord["status"], string> = {
  active: "bg-green-100 text-green-700",
  scheduled: "bg-amber-100 text-amber-700",
  expired: "bg-gray-100 text-gray-500",
  revoked: "bg-red-100 text-red-700",
};

const PAGE_SIZE = 10;

export default function PromotionsTab() {
  const [promotions, setPromotions] = useState<PromotionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await authedFetch("/api/admin/promotions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load promotions.");
      setPromotions(data.promotions ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load promotions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  return (
    <section className="pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-on-surface">Promotions</h1>
          <p className="mt-1.5 text-sm text-on-surface-variant">
            Grant promotional subscription seats directly to selected retailers and
            manufacturers — no checkout. Promotional seats unlock access for their
            validity window and expire automatically, without touching paid or
            manufacturer-assigned entitlements.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
        >
          + New Promotion
        </button>
      </div>

      {/* ── History list ── */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-surface-container">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : listError ? (
          <div className="p-6 text-sm text-red-600">{listError}</div>
        ) : promotions.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">
            No promotions yet. Click <strong>New Promotion</strong> to grant promotional seats.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-container bg-surface-container-low text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                <th className="px-4 py-3">Promotion</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Seats / recipient</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr key={p.id} className="border-b border-surface-container last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-bold text-on-surface">{p.name}</div>
                    <div className="text-xs text-on-surface-variant">
                      {ROLE_OPTIONS.find((r) => r.value === p.targetRole)?.label} ·{" "}
                      {eligibilityLabels(p.eligibility)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-on-surface">{p.recipientCount}</td>
                  <td className="px-4 py-3 text-on-surface">{p.seatsPerRecipient}</td>
                  <td className="px-4 py-3 text-on-surface">{p.durationMonths} mo</td>
                  <td className="px-4 py-3 text-on-surface-variant">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${PROMO_STATUS_BADGE[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDetailId(p.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-primary hover:bg-surface-container-low"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <CreatePromotionModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            loadPromotions();
          }}
        />
      )}
      {detailId && <PromotionDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </section>
  );
}

// ─── Create promotion modal (config + recipient selection) ───────────────────

function CreatePromotionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  // Role is chosen via two checkboxes; both on = "all". `targetRole` (the value
  // the candidates API + POST expect) is derived from them.
  const [roleSel, setRoleSel] = useState<{ retailer: boolean; manufacturer: boolean }>({
    retailer: true,
    manufacturer: true,
  });
  const noRoleSelected = !roleSel.retailer && !roleSel.manufacturer;
  const targetRole: PromotionTargetRole =
    roleSel.retailer && roleSel.manufacturer
      ? "all"
      : roleSel.retailer
      ? "retailer"
      : "manufacturer";
  const toggleRole = (role: "retailer" | "manufacturer") =>
    setRoleSel((prev) => ({ ...prev, [role]: !prev[role] }));
  const [eligibility, setEligibility] = useState<EligibilityFilter[]>(["all"]);
  const [seats, setSeats] = useState("1");
  const [durationMonths, setDurationMonths] = useState("1");
  const [startDate, setStartDate] = useState(todayInput());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  // Optional WhatsApp marketing message ("" = none → confirmation-only, default).
  const [marketingTemplate, setMarketingTemplate] = useState<MarketingTemplateId | "">("");

  // Recipient table
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [candidates, setCandidates] = useState<CandidateRecipient[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Stable idempotency key for this modal instance — a retry sends the same key.
  const [requestId] = useState(() =>
    (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Comma-separated key — stable dependency for the fetch effect.
  const eligibilityKey = eligibility.join(",");

  // Load candidates whenever role/eligibility/search change.
  useEffect(() => {
    let cancelled = false;
    // No role selected → nothing to show (and the API has no empty-role option).
    if (noRoleSelected) {
      setCandidates([]);
      setCandLoading(false);
      setCandError(null);
      return;
    }
    setCandLoading(true);
    setCandError(null);
    const params = new URLSearchParams({ role: targetRole, eligibility: eligibilityKey, search: debounced });
    authedFetch(`/api/admin/promotions/candidates?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load recipients.");
        if (!cancelled) {
          setCandidates(data.recipients ?? []);
          setPage(0);
        }
      })
      .catch((e) => {
        if (!cancelled) setCandError(e instanceof Error ? e.message : "Failed to load recipients.");
      })
      .finally(() => {
        if (!cancelled) setCandLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetRole, noRoleSelected, eligibilityKey, debounced]);

  const toggleEligibility = (value: EligibilityFilter) => {
    setEligibility((prev) => {
      if (value === "all") return ["all"];
      const next = prev.filter((v) => v !== "all" && v !== value);
      if (!prev.includes(value)) next.push(value);
      return next.length ? next : ["all"];
    });
  };

  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => candidates.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [candidates, page],
  );

  const allVisibleSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.phone));

  const toggleOne = (phone: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      if (candidates.length > 0 && candidates.every((c) => prev.has(c.phone))) {
        // Deselect the currently-filtered set.
        const next = new Set(prev);
        candidates.forEach((c) => next.delete(c.phone));
        return next;
      }
      const next = new Set(prev);
      candidates.forEach((c) => next.add(c.phone));
      return next;
    });
  };

  // Keep only phones still present in the loaded candidate set for the count
  // (a selected recipient filtered out stays selected, which is intended).
  const selectedCount = selected.size;

  const submit = async () => {
    setSubmitError(null);
    if (noRoleSelected) {
      setSubmitError("Select at least one role (Retailer / Manufacturer).");
      return;
    }
    if (!name.trim()) {
      setSubmitError("Promotion name is required.");
      return;
    }
    if (selectedCount === 0) {
      setSubmitError("Select at least one recipient.");
      return;
    }
    setSubmitting(true);
    try {
      // Build recipient role map from the candidate set.
      const byPhone = new Map(candidates.map((c) => [c.phone, c.role]));
      const recipients = Array.from(selected).map((phone) => ({
        phone,
        role: byPhone.get(phone),
      }));
      const res = await authedFetch("/api/admin/promotions", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          targetRole,
          eligibility,
          seatsPerRecipient: Number(seats),
          durationMonths: Number(durationMonths),
          startDate,
          endDate: endDate || null,
          notes: notes.trim() || null,
          marketingTemplate: marketingTemplate || null,
          recipients,
          clientRequestId: requestId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create promotion.");
      onCreated();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create promotion.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-4xl rounded-2xl bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-on-surface">New Promotion</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-on-surface-variant hover:bg-surface-container-low">
            ✕
          </button>
        </div>

        {/* ── Promotion config ── */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-xs font-bold text-on-surface-variant">Promotion name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali Free Month"
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            />
          </label>
          <label>
            <span className="text-xs font-bold text-on-surface-variant">Seats per recipient</span>
            <input
              type="number"
              min="1"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            />
          </label>
          <label>
            <span className="text-xs font-bold text-on-surface-variant">Duration (months)</span>
            <input
              type="number"
              min="1"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            />
          </label>
          <label>
            <span className="text-xs font-bold text-on-surface-variant">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            />
          </label>
          <label>
            <span className="text-xs font-bold text-on-surface-variant">Promotion end date (optional)</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs font-bold text-on-surface-variant">Internal notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            />
          </label>

          {/* Optional WhatsApp marketing message — sent to each recipient BEFORE
              the free_seats_assigned confirmation. Leaving it as "None" keeps the
              current behaviour (confirmation only). */}
          <label className="sm:col-span-2">
            <span className="text-xs font-bold text-on-surface-variant">WhatsApp Marketing Message (optional)</span>
            <select
              value={marketingTemplate}
              onChange={(e) => setMarketingTemplate(e.target.value as MarketingTemplateId | "")}
              className="mt-1 w-full rounded-xl border border-surface-container bg-surface-container-low px-3 py-2 text-sm text-on-surface"
            >
              <option value="">None — send confirmation only</option>
              {MARKETING_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {marketingTemplate && (() => {
            const tpl = MARKETING_TEMPLATES.find((t) => t.id === marketingTemplate)!;
            return (
              <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-1.5">
                <p className="text-xs font-bold text-amber-800">
                  Message preview · <span className="font-mono">{tpl.id}</span> ({tpl.language.toUpperCase()})
                </p>
                {tpl.hasImageHeader && (
                  <p className="text-xs text-amber-700">🖼️ Header: static campaign image (resolved server-side from its media ID).</p>
                )}
                <p className="whitespace-pre-line rounded-lg bg-white/70 px-3 py-2 text-sm text-on-surface">
                  {tpl.previewBody("[Business name]")}
                </p>
                <p className="text-[11px] text-amber-700">
                  Only the business name ({"{{1}}"}) is dynamic per recipient. The {tpl.offerQuantity}-product
                  offer is fixed in the approved template copy. Sent after seats are assigned, before the
                  confirmation message.
                </p>
              </div>
            );
          })()}
        </div>

        {/* ── Targeting + recipient table ── */}
        <div className="mt-6 border-t border-surface-container pt-5">
          <h3 className="text-sm font-black text-on-surface">Select recipients</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">Role</span>
              <RoleMultiSelect selected={roleSel} onToggle={toggleRole} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">Subscription</span>
              <EligibilityMultiSelect selected={eligibility} onToggle={toggleEligibility} />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search business name or phone"
              className="flex-1 min-w-[180px] rounded-lg border border-surface-container bg-surface-container-low px-3 py-1.5 text-sm text-on-surface"
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-surface-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-container bg-surface-container-low text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2.5">Business</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Subscription</th>
                </tr>
              </thead>
              <tbody>
                {candLoading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center">
                      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </td>
                  </tr>
                ) : candError ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-red-600">
                      {candError}
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-on-surface-variant">
                      No matching recipients.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((c) => (
                    <tr key={c.phone} className="border-b border-surface-container last:border-0">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(c.phone)}
                          onChange={() => toggleOne(c.phone)}
                          aria-label={`Select ${c.businessName}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-on-surface">{c.businessName}</td>
                      <td className="px-3 py-2.5 text-on-surface-variant">{c.phone}</td>
                      <td className="px-3 py-2.5 capitalize text-on-surface">{c.role}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {candidates.length > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">
                {candidates.length} match{candidates.length === 1 ? "" : "es"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg px-3 py-1 font-bold text-on-surface disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-on-surface-variant">
                  {page + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="rounded-lg px-3 py-1 font-bold text-on-surface disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer / review ── */}
        {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}
        <div className="mt-6 flex items-center justify-between border-t border-surface-container pt-4">
          <p className="text-sm text-on-surface-variant">
            <strong className="text-on-surface">{selectedCount}</strong> recipient
            {selectedCount === 1 ? "" : "s"} selected ·{" "}
            <strong className="text-on-surface">{(Number(seats) || 0) * selectedCount}</strong> total seats
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || selectedCount === 0}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Granting…" : `Grant to ${selectedCount} recipient${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Promotion detail modal (recipients + assignment status) ─────────────────

function PromotionDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [promotion, setPromotion] = useState<PromotionSummary | null>(null);
  const [recipients, setRecipients] = useState<PromotionRecipientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authedFetch(`/api/admin/promotions/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load promotion.");
        if (!cancelled) {
          setPromotion(data.promotion);
          setRecipients(data.recipients ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load promotion.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-on-surface">{promotion?.name ?? "Promotion"}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-on-surface-variant hover:bg-surface-container-low">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : promotion ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Meta label="Seats / recipient" value={String(promotion.seatsPerRecipient)} />
              <Meta label="Duration" value={`${promotion.durationMonths} mo`} />
              <Meta label="Start" value={fmtDate(promotion.startDate)} />
              <Meta label="End" value={fmtDate(promotion.endDate)} />
              <Meta label="Recipients" value={String(promotion.recipientCount)} />
              <Meta label="Created" value={fmtDate(promotion.createdAt)} />
              <Meta
                label="Target"
                value={ROLE_OPTIONS.find((r) => r.value === promotion.targetRole)?.label ?? promotion.targetRole}
              />
              <Meta label="Status" value={promotion.status} />
            </div>
            {promotion.notes && (
              <p className="mt-3 rounded-xl bg-surface-container-low p-3 text-sm text-on-surface-variant">
                {promotion.notes}
              </p>
            )}

            <div className="mt-5 overflow-hidden rounded-xl border border-surface-container">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-container bg-surface-container-low text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    <th className="px-3 py-2.5">Recipient</th>
                    <th className="px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Seats</th>
                    <th className="px-3 py-2.5">Expires</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.userPhone} className="border-b border-surface-container last:border-0">
                      <td className="px-3 py-2.5 font-semibold text-on-surface">{r.userPhone}</td>
                      <td className="px-3 py-2.5 capitalize text-on-surface">{r.role}</td>
                      <td className="px-3 py-2.5 text-on-surface">{r.seatsGranted}</td>
                      <td className="px-3 py-2.5 text-on-surface-variant">{fmtDate(r.expiryDate)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ASSIGN_STATUS_BADGE[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">{label}</div>
      <div className="mt-0.5 font-bold capitalize text-on-surface">{value}</div>
    </div>
  );
}

// ─── Checkbox multi-select for the target role (mirrors EligibilityMultiSelect) ─

function RoleMultiSelect({
  selected,
  onToggle,
}: {
  selected: { retailer: boolean; manufacturer: boolean };
  onToggle: (role: "retailer" | "manufacturer") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const summary =
    selected.retailer && selected.manufacturer
      ? "All"
      : selected.retailer
      ? "Retailer"
      : selected.manufacturer
      ? "Manufacturer"
      : "None";

  const OPTIONS: { value: "retailer" | "manufacturer"; label: string }[] = [
    { value: "retailer", label: "Retailer" },
    { value: "manufacturer", label: "Manufacturer" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[130px] items-center justify-between gap-2 rounded-lg border border-surface-container bg-surface-container-low px-2.5 py-1.5 text-sm text-on-surface"
      >
        <span className="truncate">{summary}</span>
        <span className="text-on-surface-variant">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-48 rounded-xl border border-surface-container bg-surface p-1.5 shadow-lg">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-on-surface hover:bg-surface-container-low"
            >
              <input type="checkbox" checked={selected[o.value]} onChange={() => onToggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Checkbox multi-select for the subscription eligibility filter ────────────

function EligibilityMultiSelect({
  selected,
  onToggle,
}: {
  selected: EligibilityFilter[];
  onToggle: (v: EligibilityFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const summary =
    selected.includes("all") || selected.length === 0
      ? "All"
      : ELIGIBILITY_OPTIONS.filter((o) => selected.includes(o.value))
          .map((o) => o.label)
          .join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[130px] items-center justify-between gap-2 rounded-lg border border-surface-container bg-surface-container-low px-2.5 py-1.5 text-sm text-on-surface"
      >
        <span className="truncate">{summary}</span>
        <span className="text-on-surface-variant">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-48 rounded-xl border border-surface-container bg-surface p-1.5 shadow-lg">
          {ELIGIBILITY_OPTIONS.map((o) => {
            const checked = o.value === "all" ? selected.includes("all") || selected.length === 0 : selected.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-on-surface hover:bg-surface-container-low"
              >
                <input type="checkbox" checked={checked} onChange={() => onToggle(o.value)} />
                {o.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
