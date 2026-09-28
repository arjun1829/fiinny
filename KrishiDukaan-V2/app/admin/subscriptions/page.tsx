"use client";

import { useEffect, useState } from "react";
import {
  CreditCard, Search, RefreshCw, ShieldOff, Plus, X, Check,
  ChevronDown, CalendarPlus, AlertTriangle, Pencil, Package, Archive,
  UserPlus, Trash2, Ban,
} from "lucide-react";
import {
  auth,
  adminRevokeSubscription, adminExtendSubscription, adminSetSubscriptionExpiry, adminManualActivate,
  adminUpdateSubscriptionSeats, fetchFailedPayments
} from "../../firebase";
import { SearchableDropdown } from "../_components/searchable-dropdown";
import { getSubscriptions, getUsers, getPlans, invalidateUsers, invalidateSubscriptions } from "../_lib/admin-data";
import { PLAN_FEATURE_CATALOG, featureLabel } from "../_lib/plan-features";
import { FinanceOverview } from "../_components/analytics/finance-overview";
import { subscriptionPlanLabel } from "../../lib/pricing";

// Thin wrapper around the new server-validated admin routes (plan CRUD,
// subscription assign/edit/cancel) — these mutate pricing/entitlements
// directly, so unlike the rest of this page's actions (which write Firestore
// straight from the client, gated only by firestore.rules) they go through
// Next.js API routes with a verified ID token + server-side admin check.
async function callAdminApi(path: string, method: string, body?: unknown) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Not authenticated.");
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700 border border-green-200",
  unpaid: "bg-gray-100 text-gray-500 border border-gray-200",
  revoked: "bg-red-100 text-red-600 border border-red-200",
  manual_admin: "bg-purple-100 text-purple-700 border border-purple-200",
  scheduled: "bg-blue-100 text-blue-700 border border-blue-200",
  cancelled: "bg-orange-100 text-orange-700 border border-orange-200",
  expired: "bg-gray-100 text-gray-500 border border-gray-200",
};

const PLAN_STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700 border border-green-200",
  inactive: "bg-gray-100 text-gray-500 border border-gray-200",
  archived: "bg-red-100 text-red-600 border border-red-200",
};

const DURATION_OPTIONS = [1, 3, 6, 12];

type PlanForm = {
  name: string; description: string; price: string; durationMonths: string;
  seats: string; features: string[]; displayOrder: string; trialDays: string;
};
const EMPTY_PLAN_FORM: PlanForm = {
  name: "", description: "", price: "", durationMonths: "1",
  seats: "1", features: [], displayOrder: "0", trialDays: "0",
};

type AssignForm = {
  targetPhone: string; planId: string; seats: string; price: string;
  durationMonths: string; startDate: string; features: string[]; notes: string;
};
const EMPTY_ASSIGN_FORM: AssignForm = {
  targetPhone: "", planId: "", seats: "1", price: "0",
  durationMonths: "1", startDate: "", features: [], notes: "",
};

type ManualForm = {
  userDocId: string;
  paymentId: string;
  orderId: string;
  seats: string;
  durationMonths: string;
};

const EMPTY_MANUAL: ManualForm = {
  userDocId: "", paymentId: "", orderId: "", seats: "1", durationMonths: "1",
};

// ─── Date filter — shared by Active Subscriptions (startDate) and Failed
// Payments (timestamp), mirroring the Custom Date Range pattern already on
// Analytics (app/dashboard/analytics/page.tsx). ──────────────────────────
type DateFilterKey = "all" | "today" | "7d" | "30d" | "custom";
type DateRange = { from: number | null; to: number | null };

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateRangeFor(key: DateFilterKey, customFrom: string, customTo: string): DateRange {
  const now = Date.now();
  switch (key) {
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
}

/** A Firestore Timestamp, millis, or Date — whatever the doc happens to carry. */
function toMillisLoose(v: any): number {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return 0;
}

function DateFilterControl({ value, onChange, customFrom, customTo, onCustomFromChange, onCustomToChange }: {
  value: DateFilterKey;
  onChange: (v: DateFilterKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {([
          { key: "all", label: "Any date" },
          { key: "today", label: "Today" },
          { key: "7d", label: "Last 7 days" },
          { key: "30d", label: "Last 30 days" },
          { key: "custom", label: "Custom range" },
        ] as { key: DateFilterKey; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
              value === opt.key ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low/60 p-3">
          <label className="flex flex-col text-xs font-semibold text-on-surface-variant">
            From
            <input type="date" value={customFrom} max={customTo || undefined}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="mt-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 text-sm text-on-surface" />
          </label>
          <label className="flex flex-col text-xs font-semibold text-on-surface-variant">
            To
            <input type="date" value={customTo} min={customFrom || undefined} max={toDateInputValue(new Date())}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="mt-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 text-sm text-on-surface" />
          </label>
          {(customFrom || customTo) && (
            <button type="button" onClick={() => { onCustomFromChange(""); onCustomToChange(""); }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface">
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'plans' | 'failedPayments' | 'finance'>('subscriptions');
  const [loading, setLoading] = useState(true);
  const [failedPaymentsError, setFailedPaymentsError] = useState<string | null>(null);
  const [failedPaymentsSearch, setFailedPaymentsSearch] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subDateFilter, setSubDateFilter] = useState<DateFilterKey>("all");
  const [subCustomFrom, setSubCustomFrom] = useState("");
  const [subCustomTo, setSubCustomTo] = useState("");
  const [fpDateFilter, setFpDateFilter] = useState<DateFilterKey>("all");
  const [fpCustomFrom, setFpCustomFrom] = useState("");
  const [fpCustomTo, setFpCustomTo] = useState("");

  // Actions state
  const [revoking, setRevoking] = useState<string | null>(null);
  // `extending` = which panel is open (controls panel visibility only)
  const [extending, setExtending] = useState<string | null>(null);
  // `confirming` = which Confirm button is in-flight (controls button disabled/spinner only)
  const [confirming, setConfirming] = useState<string | null>(null);
  const [extendMonths, setExtendMonths] = useState(1);
  const [extendMode, setExtendMode] = useState<"preset" | "custom">("preset");
  const [customExpiry, setCustomExpiry] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "expiry">("recent");
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit seats
  const [editingSeats, setEditingSeats] = useState<string | null>(null);
  const [editSeatsValue, setEditSeatsValue] = useState("");
  const [savingSeats, setSavingSeats] = useState(false);

  // Manual activate
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);

  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Plans tab
  const [planStatusFilter, setPlanStatusFilter] = useState<"active" | "inactive" | "archived" | "all">("active");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planActionError, setPlanActionError] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // Assign Subscription wizard
  const [showAssign, setShowAssign] = useState(false);
  const [assignStep, setAssignStep] = useState<"target" | "configure" | "review">("target");
  const [assignForm, setAssignForm] = useState<AssignForm>(EMPTY_ASSIGN_FORM);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Edit / cancel an existing subscription
  const [editingSub, setEditingSub] = useState<any | null>(null);
  const [editSubForm, setEditSubForm] = useState({ seats: "", price: "", durationMonths: "", features: [] as string[], notes: "" });
  const [editSubSaving, setEditSubSaving] = useState(false);
  const [editSubError, setEditSubError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const anyModalOpen = showManual || showPlanModal || showAssign || !!editingSub;
  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [anyModalOpen]);

  /**
   * `force` bypasses the shared admin cache — used by the Refresh buttons and after
   * every write on this tab. A plain mount reuses the cached users/subscriptions
   * snapshot the other admin tabs may already have paid for.
   */
  const load = async (force = false) => {
    if (force) { invalidateUsers(); invalidateSubscriptions(); }
    setLoading(true);
    setFailedPaymentsError(null);
    try {
      const [subsData, usersData, plansData] = await Promise.all([
        getSubscriptions({ force }), getUsers({ force }), getPlans({ force }),
      ]);
      setSubs(subsData);
      setUsers(usersData);
      setPlans(plansData);
    } finally {
      setLoading(false);
    }
    // Load failed payments separately so a rules error doesn't block the whole page
    fetchFailedPayments()
      .then(setFailedPayments)
      .catch(err => setFailedPaymentsError(err?.message || 'Could not load failed payments. Check Firestore rules for the failedPayments collection.'));
  };

  useEffect(() => { load(); }, []);

  const getUserName = (sub: any) => {
    const phone = sub.ownerPhone || sub.ownerId;
    const user = users.find(u => u.id === phone || u.uid === phone);
    return user?.name || user?.email || phone || "—";
  };

  const resolveFailedPaymentUserName = (fp: any): string | null => {
    const phone = fp.userPhone;
    // fp.userUid was added later; fp.userId may be UID or phone depending on when it was written
    const u = users.find(u =>
      (phone && (u.id === phone || u.phone === phone)) ||
      u.uid === fp.userUid ||
      u.uid === fp.userId ||
      u.id === fp.userId
    );
    return u?.name || u?.email || null;
  };

  const fpDateRange = dateRangeFor(fpDateFilter, fpCustomFrom, fpCustomTo);
  const filteredFailedPayments = failedPayments.filter((fp) => {
    if (fpDateRange.from !== null || fpDateRange.to !== null) {
      const ms = toMillisLoose(fp.timestamp);
      if (fpDateRange.from !== null && ms < fpDateRange.from) return false;
      if (fpDateRange.to !== null && ms > fpDateRange.to) return false;
    }
    const q = failedPaymentsSearch.trim().toLowerCase();
    if (!q) return true;
    const userName = resolveFailedPaymentUserName(fp);
    const paymentId = fp.error?.metadata?.payment_id || fp.error?.metadata?.paymentId;
    const orderId = fp.orderId || fp.error?.metadata?.order_id;
    return [userName, fp.userPhone, fp.userId, fp.userUid, paymentId, orderId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const subDateRange = dateRangeFor(subDateFilter, subCustomFrom, subCustomTo);
  const filtered = subs
    .filter(s => {
      const q = search.toLowerCase();
      const phone = s.ownerPhone || s.ownerId || "";
      const user = users.find(u => u.id === phone || u.uid === phone);
      const nameStr = `${user?.name || ""} ${user?.email || ""} ${phone}`.toLowerCase();
      const matchSearch = !q || nameStr.includes(q) || (s.razorpayPaymentId || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.subscriptionStatus === statusFilter;
      if (subDateRange.from !== null || subDateRange.to !== null) {
        const ms = toMillisLoose(s.startDate);
        if (subDateRange.from !== null && ms < subDateRange.from) return false;
        if (subDateRange.to !== null && ms > subDateRange.to) return false;
      }
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortMode === "expiry") {
        const aMs = a.expiryDate?.toDate ? a.expiryDate.toDate().getTime() : Infinity;
        const bMs = b.expiryDate?.toDate ? b.expiryDate.toDate().getTime() : Infinity;
        return aMs - bMs;
      }
      // "recent": latest startDate first; missing startDate goes last
      const aMs = a.startDate?.toDate ? a.startDate.toDate().getTime() : -Infinity;
      const bMs = b.startDate?.toDate ? b.startDate.toDate().getTime() : -Infinity;
      return bMs - aMs;
    });

  const counts = {
    all: subs.length,
    active: subs.filter(s => s.subscriptionStatus === "active").length,
    unpaid: subs.filter(s => s.subscriptionStatus === "unpaid").length,
    revoked: subs.filter(s => s.subscriptionStatus === "revoked").length,
  };

  const fmt = (ts: any): string => {
    if (!ts) return "—";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  };

  const handleRevoke = async (sub: any) => {
    if (!confirm(`Revoke subscription for ${getUserName(sub)}? Their isPaid will be set to false.`)) return;
    setRevoking(sub.id);
    setActionError(null);
    try {
      const userDocId = sub.ownerPhone || sub.ownerId;
      await adminRevokeSubscription(userDocId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Revoke failed.");
    } finally {
      setRevoking(null);
    }
    // Refresh after the loading state is cleared so setLoading(true) inside load()
    // doesn't remount the list while revoking is still set, causing a stuck spinner.
    void load(true);
  };

  const handleExtend = async (sub: any) => {
    setConfirming(sub.id);   // disable + spinner on the Confirm button
    setExtending(null);      // close the panel immediately (decoupled from write)
    setActionError(null);
    try {
      const userDocId = sub.ownerPhone || sub.ownerId;
      await adminExtendSubscription(sub.id, userDocId, extendMonths);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Extend failed.");
    } finally {
      setConfirming(null);   // always clears the button state
    }
    void load(true);
  };

  const handleSetExpiry = async (sub: any) => {
    if (!customExpiry) return;
    const [y, m, d] = customExpiry.split("-").map(Number);
    const date = new Date(y, m - 1, d, 23, 59, 59);
    setConfirming(sub.id);
    setExtending(null);
    setActionError(null);
    try {
      const userDocId = sub.ownerPhone || sub.ownerId;
      await adminSetSubscriptionExpiry(sub.id, userDocId, date);
      setCustomExpiry("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Set expiry failed.");
    } finally {
      setConfirming(null);
    }
    void load(true);
  };

  const filteredUsers = users.filter(u =>
    u.role !== "admin" &&
    (!userSearch || [u.name, u.email, u.phone, u.id].join(" ").toLowerCase().includes(userSearch.toLowerCase()))
  );

  const handleSaveSeats = async (sub: any) => {
    const newSeats = Number(editSeatsValue);
    if (isNaN(newSeats) || newSeats < 0) { setActionError("Invalid seat count."); return; }
    setSavingSeats(true);
    setActionError(null);
    try {
      const userDocId = sub.ownerPhone || sub.ownerId;
      await adminUpdateSubscriptionSeats(sub.id, userDocId, newSeats);
      setEditingSeats(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update seats.");
    } finally {
      setSavingSeats(false);
    }
    void load(true);
  };

  const handleManualActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.userDocId || !manualForm.paymentId) {
      setManualError("Select a user and enter a payment ID."); return;
    }
    setManualSaving(true);
    setManualError(null);
    setManualSuccess(false);
    try {
      await adminManualActivate(
        manualForm.userDocId,
        manualForm.paymentId,
        manualForm.orderId,
        Number(manualForm.seats) || 1,
        Number(manualForm.durationMonths) || 1,
      );
      setManualSuccess(true);
      setManualForm(EMPTY_MANUAL);
      setUserSearch("");
      await load(true);
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Activation failed.");
    } finally {
      setManualSaving(false);
    }
  };

  // ─── Plans ────────────────────────────────────────────────────────────────

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm(EMPTY_PLAN_FORM);
    setPlanError(null);
    setShowPlanModal(true);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name ?? "",
      description: plan.description ?? "",
      price: String(plan.price ?? ""),
      durationMonths: String(plan.durationMonths ?? "1"),
      seats: String(plan.seats ?? "1"),
      features: Array.isArray(plan.features) ? plan.features : [],
      displayOrder: String(plan.displayOrder ?? "0"),
      trialDays: String(plan.trialDays ?? "0"),
    });
    setPlanError(null);
    setShowPlanModal(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanSaving(true);
    setPlanError(null);
    try {
      const body = {
        name: planForm.name.trim(),
        description: planForm.description.trim(),
        price: Number(planForm.price),
        durationMonths: Number(planForm.durationMonths),
        seats: Number(planForm.seats),
        features: planForm.features,
        displayOrder: Number(planForm.displayOrder) || 0,
        trialDays: Number(planForm.trialDays) || 0,
      };
      if (editingPlan) {
        await callAdminApi(`/api/admin/plans/${editingPlan.id}`, "PATCH", body);
      } else {
        await callAdminApi("/api/admin/plans", "POST", body);
      }
      setShowPlanModal(false);
      await load(true);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Failed to save plan.");
    } finally {
      setPlanSaving(false);
    }
  };

  const handleSetPlanStatus = async (plan: any, status: "active" | "inactive" | "archived") => {
    setPlanActionError(null);
    try {
      await callAdminApi(`/api/admin/plans/${plan.id}`, "PATCH", { status });
      await load(true);
    } catch (e) {
      setPlanActionError(e instanceof Error ? e.message : "Failed to update plan status.");
    }
  };

  const handleDeletePlan = async (plan: any) => {
    if (!confirm(`Delete plan "${plan.name}"? This only succeeds if no subscriptions reference it.`)) return;
    setDeletingPlanId(plan.id);
    setPlanActionError(null);
    try {
      await callAdminApi(`/api/admin/plans/${plan.id}`, "DELETE");
      await load(true);
    } catch (e) {
      setPlanActionError(e instanceof Error ? e.message : "Failed to delete plan.");
    } finally {
      setDeletingPlanId(null);
    }
  };

  // ─── Assign Subscription ────────────────────────────────────────────────

  const openAssign = (plan?: any) => {
    setAssignStep("target");
    setAssignSuccess(false);
    setAssignError(null);
    setAssignForm({
      ...EMPTY_ASSIGN_FORM,
      planId: plan?.id ?? "",
      seats: plan ? String(plan.seats ?? "1") : "1",
      price: plan ? String(plan.price ?? "0") : "0",
      durationMonths: plan ? String(plan.durationMonths ?? "1") : "1",
      features: plan?.features ?? [],
    });
    setShowAssign(true);
  };

  const applyPlanToAssignForm = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    setAssignForm(f => ({
      ...f,
      planId,
      seats: plan ? String(plan.seats ?? "1") : f.seats,
      price: plan ? String(plan.price ?? "0") : f.price,
      durationMonths: plan ? String(plan.durationMonths ?? "1") : f.durationMonths,
      features: plan ? (plan.features ?? []) : f.features,
    }));
  };

  const handleAssignSubmit = async () => {
    setAssignSaving(true);
    setAssignError(null);
    try {
      await callAdminApi("/api/admin/subscriptions/assign", "POST", {
        targetPhone: assignForm.targetPhone,
        planId: assignForm.planId || null,
        seats: Number(assignForm.seats),
        price: Number(assignForm.price),
        durationMonths: Number(assignForm.durationMonths),
        startDate: assignForm.startDate || undefined,
        features: assignForm.features,
        notes: assignForm.notes.trim() || undefined,
      });
      setAssignSuccess(true);
      await load(true);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Failed to assign subscription.");
    } finally {
      setAssignSaving(false);
    }
  };

  // ─── Edit / cancel a subscription ───────────────────────────────────────

  const openEditSub = (sub: any) => {
    setEditingSub(sub);
    setEditSubForm({
      seats: String(sub.seatsPurchased ?? ""),
      price: String(sub.amountPaid ?? ""),
      durationMonths: String(sub.durationMonths ?? ""),
      features: Array.isArray(sub.features) ? sub.features : [],
      notes: sub.notes ?? "",
    });
    setEditSubError(null);
  };

  const handleSaveEditSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setEditSubSaving(true);
    setEditSubError(null);
    try {
      await callAdminApi(`/api/admin/subscriptions/${editingSub.id}`, "PATCH", {
        seats: Number(editSubForm.seats),
        price: Number(editSubForm.price),
        durationMonths: Number(editSubForm.durationMonths),
        features: editSubForm.features,
        notes: editSubForm.notes.trim() || null,
      });
      setEditingSub(null);
      await load(true);
    } catch (e) {
      setEditSubError(e instanceof Error ? e.message : "Failed to update subscription.");
    } finally {
      setEditSubSaving(false);
    }
  };

  const handleCancelSub = async (sub: any) => {
    if (!confirm(`Cancel subscription for ${getUserName(sub)}? Their dashboard access will be revoked immediately.`)) return;
    setCancelling(sub.id);
    setActionError(null);
    try {
      await callAdminApi(`/api/admin/subscriptions/${sub.id}`, "PATCH", { action: "cancel" });
      await load(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to cancel subscription.");
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex space-x-2 border-b border-outline-variant/20 mb-4">
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`pb-2 px-1 font-semibold text-sm ${activeTab === 'subscriptions' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Active Subscriptions
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-2 px-1 font-semibold text-sm ${activeTab === 'plans' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Plans
        </button>
        <button
          onClick={() => setActiveTab('failedPayments')}
          className={`pb-2 px-1 font-semibold text-sm flex items-center gap-1.5 ${activeTab === 'failedPayments' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Failed Payments
          {failedPayments.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-600 text-[10px] font-black px-1.5 py-0.5 min-w-[1.25rem]">
              {failedPayments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={`pb-2 px-1 font-semibold text-sm ${activeTab === 'finance' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Finance
        </button>
      </div>

      {activeTab === 'finance' && <FinanceOverview />}

      {activeTab === 'plans' && (
        <PlansTab
          plans={plans}
          planStatusFilter={planStatusFilter}
          setPlanStatusFilter={setPlanStatusFilter}
          planActionError={planActionError}
          deletingPlanId={deletingPlanId}
          onCreate={openCreatePlan}
          onEdit={openEditPlan}
          onSetStatus={handleSetPlanStatus}
          onDelete={handleDeletePlan}
          onAssign={openAssign}
        />
      )}

      {showPlanModal && (
        <PlanModal
          editingPlan={editingPlan}
          form={planForm}
          setForm={setPlanForm}
          saving={planSaving}
          error={planError}
          onClose={() => setShowPlanModal(false)}
          onSubmit={handleSavePlan}
        />
      )}

      {showAssign && (
        <AssignSubscriptionModal
          users={users}
          plans={plans}
          step={assignStep}
          setStep={setAssignStep}
          form={assignForm}
          setForm={setAssignForm}
          onApplyPlan={applyPlanToAssignForm}
          saving={assignSaving}
          error={assignError}
          success={assignSuccess}
          onClose={() => setShowAssign(false)}
          onSubmit={handleAssignSubmit}
        />
      )}

      {activeTab === 'subscriptions' ? (
      <>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Subscriptions</h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">Manage subscriptions — extend, revoke, or activate.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 shrink-0 sm:flex">
          <button onClick={() => load(true)} className="flex items-center justify-center gap-1.5 border border-outline-variant/40 text-xs sm:text-sm font-medium px-2.5 sm:px-3 py-2 rounded-xl hover:bg-surface-container transition-colors">
            <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Refresh
          </button>
          <button onClick={() => openAssign()}
            className="flex items-center justify-center gap-1.5 border border-primary/40 text-primary text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl hover:bg-primary/5 transition-colors">
            <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Assign
          </button>
          <button onClick={() => { setShowManual(true); setManualSuccess(false); setManualError(null); }}
            className="flex items-center justify-center gap-1.5 bg-primary text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl hover:opacity-90 transition-colors">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Activate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: counts.all, color: "text-on-surface" },
          { label: "Active", count: counts.active, color: "text-green-600" },
          { label: "Unpaid", count: counts.unpaid, color: "text-gray-500" },
          { label: "Revoked", count: counts.revoked, color: "text-red-500" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3">
            <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(["all", "active", "unpaid", "revoked"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${statusFilter === s ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s as keyof typeof counts] ?? subs.length})
          </button>
        ))}
      </div>

      {/* Date filter */}
      <DateFilterControl
        value={subDateFilter}
        onChange={setSubDateFilter}
        customFrom={subCustomFrom}
        customTo={subCustomTo}
        onCustomFromChange={setSubCustomFrom}
        onCustomToChange={setSubCustomTo}
      />

      {/* Sort toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-on-surface-variant font-medium shrink-0">Sort:</span>
        <div className="flex rounded-xl border border-outline-variant/30 overflow-hidden text-[11px] font-semibold">
          <button type="button" onClick={() => setSortMode("recent")}
            className={`px-3 py-1.5 transition-colors ${sortMode === "recent" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
            Recent
          </button>
          <button type="button" onClick={() => setSortMode("expiry")}
            className={`px-3 py-1.5 transition-colors ${sortMode === "expiry" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
            Closest Expiry
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input type="text" placeholder="Search by user name, phone, or payment ID…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant" />
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center text-sm text-on-surface-variant">
              No subscriptions found.
            </div>
          )}
          {filtered.map(sub => {
            const userName = getUserName(sub);
            const isExpanded = extending === sub.id;
            return (
              <div key={sub.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4">
                  {/* User */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-on-surface truncate">{userName}</p>
                    <p className="text-[11px] sm:text-xs text-on-surface-variant font-mono truncate">{sub.ownerPhone || sub.ownerId || "—"}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sub.isCustom ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-surface-container text-on-surface-variant"}`}>
                        <Package className="h-2.5 w-2.5" /> {subscriptionPlanLabel(sub)}
                      </span>
                      {sub.basePlanPrice != null && Number(sub.basePlanPrice) !== Number(sub.amountPaid) && (
                        <span className="text-[10px] text-on-surface-variant">
                          base ₹{sub.basePlanPrice} → <span className="font-bold text-on-surface">₹{sub.amountPaid}</span>
                        </span>
                      )}
                      {Array.isArray(sub.features) && sub.features.length > 0 && (
                        <span className="text-[10px] text-on-surface-variant truncate max-w-[220px]" title={sub.features.map(featureLabel).join(", ")}>
                          {sub.features.map(featureLabel).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Plan info */}
                  <div className="flex flex-wrap gap-2 sm:gap-3 text-[11px] sm:text-xs text-on-surface-variant shrink-0 items-center">
                    {editingSeats === sub.id ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={editSeatsValue}
                          onChange={e => setEditSeatsValue(e.target.value)}
                          className="w-16 rounded-lg border border-primary/40 bg-white px-2 py-1 text-sm font-bold text-on-surface outline-none ring-primary/30 focus:ring-2"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleSaveSeats(sub); if (e.key === "Escape") setEditingSeats(null); }}
                        />
                        <span className="font-medium">seats</span>
                        <button type="button" onClick={() => handleSaveSeats(sub)} disabled={savingSeats}
                          className="p-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setEditingSeats(null)}
                          className="p-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button type="button"
                        onClick={() => { setEditingSeats(sub.id); setEditSeatsValue(String(sub.seatsPurchased ?? 0)); }}
                        className="font-medium inline-flex items-center gap-1 hover:text-primary transition-colors"
                        title="Click to edit seats">
                        <span className="text-on-surface font-bold">{sub.seatsPurchased ?? "?"}</span> seats
                        <Pencil className="h-3 w-3 opacity-40" />
                      </button>
                    )}
                    <span className="font-medium">
                      <span className="text-on-surface font-bold">{sub.durationMonths ?? "?"}</span> mo
                    </span>
                    <span className="font-medium">
                      ₹<span className="text-on-surface font-bold">{sub.amountPaid ?? "?"}</span>
                    </span>
                  </div>

                  {/* Dates */}
                  <div className="text-[11px] sm:text-xs text-on-surface-variant shrink-0">
                    <p>{fmt(sub.startDate)} → {fmt(sub.expiryDate)}</p>
                    {sub.activatedByAdmin && <p className="text-purple-600 font-semibold">Manual activation</p>}
                  </div>

                  {/* Payment ID — hidden on mobile to save space */}
                  {sub.razorpayPaymentId && (
                    <span className="hidden sm:inline font-mono text-[10px] bg-surface-container px-2 py-0.5 rounded-lg text-on-surface-variant shrink-0 max-w-[140px] truncate">
                      {sub.razorpayPaymentId}
                    </span>
                  )}

                  {/* Status badge */}
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${STATUS_BADGE[sub.subscriptionStatus] || STATUS_BADGE.unpaid}`}>
                    {sub.subscriptionStatus || "unknown"}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) {
                          setExtending(null);
                        } else {
                          setExtending(sub.id);
                          setExtendMode("preset");
                          setCustomExpiry("");
                        }
                      }}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Extend
                      <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditSub(sub)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    {sub.subscriptionStatus !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => handleCancelSub(sub)}
                        disabled={cancelling === sub.id}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-orange-200 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-50">
                        {cancelling === sub.id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRevoke(sub)}
                      disabled={revoking === sub.id}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                      {revoking === sub.id ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5" />
                      )}
                      Revoke
                    </button>
                  </div>
                </div>

                {/* Extend panel */}
                {isExpanded && (
                  <div className="border-t border-outline-variant/20 bg-surface-container-low px-5 py-4 space-y-3">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold text-on-surface-variant">Extend by:</p>
                      <div className="flex rounded-lg border border-outline-variant/30 overflow-hidden text-[11px] font-semibold">
                        <button type="button" onClick={() => setExtendMode("preset")}
                          className={`px-3 py-1 transition-colors ${extendMode === "preset" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
                          Preset
                        </button>
                        <button type="button" onClick={() => setExtendMode("custom")}
                          className={`px-3 py-1 transition-colors ${extendMode === "custom" ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
                          Custom Date
                        </button>
                      </div>
                    </div>

                    {extendMode === "preset" ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {DURATION_OPTIONS.map(m => (
                          <button key={m} type="button" onClick={() => setExtendMonths(m)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${extendMonths === m ? "bg-primary text-white border-primary" : "border-outline-variant/40 text-on-surface hover:bg-surface-container"}`}>
                            {m} mo
                          </button>
                        ))}
                        <button type="button" onClick={() => handleExtend(sub)} disabled={confirming === sub.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60 transition-colors">
                          {confirming === sub.id
                            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            : <Check className="h-4 w-4" />}
                          Confirm +{extendMonths} month{extendMonths > 1 ? "s" : ""}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">New Expiry Date</label>
                          <input
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={customExpiry}
                            onChange={e => setCustomExpiry(e.target.value)}
                            className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <button type="button" onClick={() => handleSetExpiry(sub)}
                          disabled={!customExpiry || confirming === sub.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors self-end">
                          {confirming === sub.id
                            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            : <Check className="h-4 w-4" />}
                          {customExpiry
                            ? `Set to ${new Date(customExpiry + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                            : "Set Expiry"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Activation Modal */}
      {showManual && (
        <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-on-surface">Manual Activation</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Activate a subscription by entering payment details manually.</p>
              </div>
              <button type="button" onClick={() => setShowManual(false)}
                className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleManualActivate} className="overflow-y-auto p-5 space-y-4">
              {manualError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manualError}</div>
              )}
              {manualSuccess && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 font-semibold flex items-center gap-2">
                  <Check className="h-4 w-4" /> Subscription activated successfully!
                </div>
              )}

              {/* User picker */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">Select User *</label>
                {manualForm.userDocId ? (
                  <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">
                        {users.find(u => u.id === manualForm.userDocId)?.name || manualForm.userDocId}
                      </p>
                      <p className="text-xs text-on-surface-variant">{manualForm.userDocId}</p>
                    </div>
                    <button type="button" onClick={() => setManualForm(f => ({ ...f, userDocId: "" }))}
                      className="rounded-lg p-1 hover:bg-surface-container text-on-surface-variant">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search user by name, email or phone…"
                      className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mb-2" />
                <div className="max-h-40 overflow-y-auto rounded-xl border border-outline-variant/30 bg-white">
                      {filteredUsers.slice(0, 20).map(u => (
                        <button key={u.id} type="button"
                          onClick={() => { setManualForm(f => ({ ...f, userDocId: u.id })); setUserSearch(""); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors border-b border-outline-variant/10 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                            <p className="text-xs text-on-surface-variant truncate">{u.email || u.id}</p>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600`}>
                            {u.role || "customer"}
                          </span>
                        </button>
                      ))}
                      {filteredUsers.length === 0 && (
                        <p className="text-xs text-center text-on-surface-variant py-4">No users found.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Payment ID *</label>
                <input type="text" value={manualForm.paymentId}
                  onChange={e => setManualForm(f => ({ ...f, paymentId: e.target.value }))}
                  placeholder="pay_XXXXXXXXXXXXXXXXXX"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Order ID (optional)</label>
                <input type="text" value={manualForm.orderId}
                  onChange={e => setManualForm(f => ({ ...f, orderId: e.target.value }))}
                  placeholder="order_XXXXXXXXXXXXXXXXXX"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Seats</label>
                  <input type="number" min="1" value={manualForm.seats}
                    onChange={e => setManualForm(f => ({ ...f, seats: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Duration</label>
                  <select value={manualForm.durationMonths}
                    onChange={e => setManualForm(f => ({ ...f, durationMonths: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none appearance-none">
                    {DURATION_OPTIONS.map(m => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <button type="button" onClick={() => setShowManual(false)}
                  className="flex-1 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container">
                  Cancel
                </button>
                <button type="submit" disabled={manualSaving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {manualSaving ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Activating…</>
                  ) : (
                    <><Check className="h-4 w-4" /> Activate Subscription</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingSub && (
        <EditSubscriptionModal
          sub={editingSub}
          form={editSubForm}
          setForm={setEditSubForm}
          saving={editSubSaving}
          error={editSubError}
          onClose={() => setEditingSub(null)}
          onSubmit={handleSaveEditSub}
        />
      )}
      </>
      ) : activeTab === 'plans' ? null : (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-on-surface flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" /> Failed Payments
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">All payment attempts that were declined or cancelled.</p>
            </div>
            <button onClick={() => load(true)} className="flex items-center gap-1.5 border border-outline-variant/40 text-xs font-medium px-3 py-2 rounded-xl hover:bg-surface-container transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>

          {failedPaymentsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {failedPaymentsError}
            </div>
          )}

          {!failedPaymentsError && failedPayments.length > 0 && (
            <>
              <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
                <Search className="h-4 w-4 text-outline shrink-0" />
                <input
                  type="text"
                  placeholder="Search by user name, phone, or payment/order ID…"
                  value={failedPaymentsSearch}
                  onChange={e => setFailedPaymentsSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
                />
                {failedPaymentsSearch && (
                  <button type="button" onClick={() => setFailedPaymentsSearch("")} className="text-outline hover:text-on-surface">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <DateFilterControl
                value={fpDateFilter}
                onChange={setFpDateFilter}
                customFrom={fpCustomFrom}
                customTo={fpCustomTo}
                onCustomFromChange={setFpCustomFrom}
                onCustomToChange={setFpCustomTo}
              />
            </>
          )}

          {!failedPaymentsError && failedPayments.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-10 text-center text-sm text-on-surface-variant">
              No failed payments recorded yet.
            </div>
          ) : filteredFailedPayments.length === 0 ? (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-10 text-center text-sm text-on-surface-variant">
              No failed payments match &ldquo;{failedPaymentsSearch}&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFailedPayments.map((fp) => {
                const userName = resolveFailedPaymentUserName(fp);
                const paymentId = fp.error?.metadata?.payment_id || fp.error?.metadata?.paymentId;
                const orderId = fp.orderId || fp.error?.metadata?.order_id;
                const errorReason = fp.error?.reason || fp.error?.description || fp.error?.code || 'Unknown error';
                const amountRupees = fp.amount ? (fp.amount / 100) : null;

                return (
                  <div key={fp.id} className="rounded-2xl border border-red-100 bg-white overflow-hidden">
                    <div className="px-4 py-3 space-y-3">

                      {/* Row 1 — user + date */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-on-surface truncate">{userName || fp.userPhone || fp.userId}</p>
                          {userName && <p className="text-xs text-on-surface-variant font-mono truncate">{fp.userPhone || fp.userId}</p>}
                        </div>
                        <span className="text-[11px] text-on-surface-variant shrink-0 mt-0.5">{fmt(fp.timestamp)}</span>
                      </div>

                      {/* Row 2 — error reason */}
                      <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-xl px-2.5 py-1">
                        <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        <span className="text-xs text-red-600 font-semibold">{errorReason}</span>
                      </div>

                      {/* Row 3 — purchase intent chips */}
                      {(amountRupees !== null || fp.seatCount != null || fp.durationMonths != null) && (
                        <div className="flex flex-wrap gap-2">
                          {amountRupees !== null && (
                            <span className="bg-surface-container rounded-lg px-2.5 py-1 text-xs font-bold text-on-surface">₹{amountRupees}</span>
                          )}
                          {fp.seatCount != null && (
                            <span className="bg-surface-container rounded-lg px-2.5 py-1 text-xs font-bold text-on-surface">{fp.seatCount} seat{fp.seatCount !== 1 ? 's' : ''}</span>
                          )}
                          {fp.durationMonths != null && (
                            <span className="bg-surface-container rounded-lg px-2.5 py-1 text-xs font-bold text-on-surface">{fp.durationMonths} mo</span>
                          )}
                        </div>
                      )}

                      {/* Row 4 — IDs (truncated) */}
                      {(paymentId || orderId) && (
                        <div className="space-y-0.5">
                          {paymentId && (
                            <p className="text-[10px] font-mono text-on-surface-variant truncate" title={paymentId}>
                              <span className="font-black uppercase text-[9px] tracking-widest mr-1 text-outline">pay</span>{paymentId}
                            </p>
                          )}
                          {orderId && (
                            <p className="text-[10px] font-mono text-on-surface-variant/60 truncate" title={orderId}>
                              <span className="font-black uppercase text-[9px] tracking-widest mr-1 text-outline">ord</span>{orderId}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Row 5 — Activate button */}
                      <button
                        type="button"
                        onClick={() => {
                          // Prefer phone (the Firestore doc key) for userDocId so
                          // adminManualActivate writes users/{phone}. Fall back to userId
                          // which may be the UID for older failed-payment records.
                          const resolvedDocId = fp.userPhone || fp.userId || '';
                          setManualForm(f => ({
                            ...f,
                            userDocId: resolvedDocId,
                            orderId: orderId || '',
                            seats: fp.seatCount ? String(fp.seatCount) : '1',
                            durationMonths: fp.durationMonths ? String(fp.durationMonths) : '1',
                          }));
                          setShowManual(true);
                          setManualSuccess(false);
                          setManualError(null);
                          setActiveTab('subscriptions');
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 text-primary px-3 py-2 text-xs font-bold hover:bg-primary/20 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" /> Activate Subscription
                      </button>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Plans tab ────────────────────────────────────────────────────────────

function PlansTab({
  plans, planStatusFilter, setPlanStatusFilter, planActionError, deletingPlanId,
  onCreate, onEdit, onSetStatus, onDelete, onAssign,
}: {
  plans: any[];
  planStatusFilter: "active" | "inactive" | "archived" | "all";
  setPlanStatusFilter: (s: "active" | "inactive" | "archived" | "all") => void;
  planActionError: string | null;
  deletingPlanId: string | null;
  onCreate: () => void;
  onEdit: (plan: any) => void;
  onSetStatus: (plan: any, status: "active" | "inactive" | "archived") => void;
  onDelete: (plan: any) => void;
  onAssign: (plan: any) => void;
}) {
  const filtered = planStatusFilter === "all" ? plans : plans.filter(p => (p.status ?? "active") === planStatusFilter);
  const sorted = [...filtered].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-on-surface">Subscription Plans</h2>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Reusable templates — editing a plan never changes subscriptions already assigned from it.
          </p>
        </div>
        <button onClick={onCreate}
          className="flex items-center justify-center gap-1.5 bg-primary text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl hover:opacity-90 transition-colors shrink-0">
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Create Plan
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {(["active", "inactive", "archived", "all"] as const).map(s => (
          <button key={s} onClick={() => setPlanStatusFilter(s)}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${planStatusFilter === s ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {planActionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {planActionError}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center text-sm text-on-surface-variant">
          No plans found.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(plan => (
            <div key={plan.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">{plan.name}</p>
                  {plan.description && <p className="text-xs text-on-surface-variant line-clamp-2 mt-0.5">{plan.description}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${PLAN_STATUS_BADGE[plan.status] || PLAN_STATUS_BADGE.active}`}>
                  {plan.status ?? "active"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                <span className="font-black text-lg text-on-surface">₹{plan.price}</span>
                <span>{plan.durationMonths} mo</span>
                <span>{plan.seats} seats</span>
                {plan.trialDays > 0 && <span>{plan.trialDays}d trial</span>}
              </div>

              {Array.isArray(plan.features) && plan.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {plan.features.map((f: string) => (
                    <span key={f} className="px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-[10px] font-semibold">
                      {featureLabel(f)}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => onEdit(plan)}
                  className="flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1.5 text-[11px] font-medium text-on-surface hover:bg-surface-container">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button onClick={() => onAssign(plan)}
                  className="flex items-center gap-1 rounded-lg border border-primary/30 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/5">
                  <UserPlus className="h-3 w-3" /> Assign
                </button>
                {plan.status !== "active" && (
                  <button onClick={() => onSetStatus(plan, "active")}
                    className="flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1.5 text-[11px] font-medium text-green-700 hover:bg-green-50">
                    <Check className="h-3 w-3" /> Activate
                  </button>
                )}
                {plan.status === "active" && (
                  <button onClick={() => onSetStatus(plan, "inactive")}
                    className="flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1.5 text-[11px] font-medium text-on-surface hover:bg-surface-container">
                    Deactivate
                  </button>
                )}
                {plan.status !== "archived" && (
                  <button onClick={() => onSetStatus(plan, "archived")}
                    className="flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1.5 text-[11px] font-medium text-on-surface hover:bg-surface-container">
                    <Archive className="h-3 w-3" /> Archive
                  </button>
                )}
                <button onClick={() => onDelete(plan)} disabled={deletingPlanId === plan.id}
                  className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Plan create/edit modal ─────────────────────────────────────────────────

function PlanModal({
  editingPlan, form, setForm, saving, error, onClose, onSubmit,
}: {
  editingPlan: any | null;
  form: PlanForm;
  setForm: React.Dispatch<React.SetStateAction<PlanForm>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const toggleFeature = (key: string) => {
    setForm(f => ({
      ...f,
      features: f.features.includes(key) ? f.features.filter(k => k !== key) : [...f.features, key],
    }));
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-on-surface">{editingPlan ? "Edit Plan" : "Create Plan"}</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {editingPlan ? "Existing subscriptions assigned from this plan keep their own values." : "A reusable template admins can assign to customers."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Plan Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Business Pro" required
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Price (₹) *</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                required
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Duration (months) *</label>
              <select value={form.durationMonths} onChange={e => setForm(f => ({ ...f, durationMonths: e.target.value }))}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none appearance-none">
                {DURATION_OPTIONS.map(m => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Seats *</label>
              <input type="number" min="1" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}
                required
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Trial Days</label>
              <input type="number" min="0" value={form.trialDays} onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">Features Included</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLAN_FEATURE_CATALOG.map(f => (
                <label key={f.key} className="flex items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm cursor-pointer hover:bg-surface-container-low">
                  <input type="checkbox" checked={form.features.includes(f.key)} onChange={() => toggleFeature(f.key)}
                    className="rounded border-outline-variant/40 text-primary focus:ring-primary/30" />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Display Order</label>
            <input type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: e.target.value }))}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <p className="text-[11px] text-on-surface-variant mt-1">Lower numbers show first.</p>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
              ) : (
                <><Check className="h-4 w-4" /> {editingPlan ? "Save Changes" : "Create Plan"}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Assign Subscription wizard ─────────────────────────────────────────────

function AssignSubscriptionModal({
  users, plans, step, setStep, form, setForm, onApplyPlan, saving, error, success, onClose, onSubmit,
}: {
  users: any[];
  plans: any[];
  step: "target" | "configure" | "review";
  setStep: (s: "target" | "configure" | "review") => void;
  form: AssignForm;
  setForm: React.Dispatch<React.SetStateAction<AssignForm>>;
  onApplyPlan: (planId: string) => void;
  saving: boolean;
  error: string | null;
  success: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const eligibleUsers = users.filter(u => u.role === "retailer" || u.role === "manufacturer");
  const targetUser = eligibleUsers.find(u => (u.phone || u.id) === form.targetPhone);
  const activePlans = plans.filter(p => (p.status ?? "active") === "active");
  const selectedPlan = plans.find(p => p.id === form.planId);
  const finalPrice = Number(form.price) || 0;
  const basePrice = selectedPlan ? Number(selectedPlan.price) : null;
  const toggleFeature = (key: string) => {
    setForm(f => ({ ...f, features: f.features.includes(key) ? f.features.filter(k => k !== key) : [...f.features, key] }));
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Assign Subscription</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Step {step === "target" ? "1" : step === "configure" ? "2" : "3"} of 3 — {
                step === "target" ? "Select customer" : step === "configure" ? "Configure" : "Review & assign"
              }
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 font-semibold flex items-center gap-2">
              <Check className="h-4 w-4" /> Subscription assigned successfully!
            </div>
          )}

          {step === "target" && !success && (
            <SearchableDropdown
              label="Customer (retailer or manufacturer)"
              placeholder="Search by name, email or phone…"
              items={eligibleUsers.map(u => ({ ...u, id: u.phone || u.id }))}
              selectedId={form.targetPhone}
              onSelect={(id) => setForm(f => ({ ...f, targetPhone: id }))}
              filterFn={(u, q) => [u.name, u.email, u.phone, u.id].join(" ").toLowerCase().includes(q.toLowerCase())}
              renderOption={(u) => (
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant truncate">{u.email || u.id}</p>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">{u.role}</span>
                </div>
              )}
              renderSelected={(u) => (
                <div>
                  <p className="text-sm font-semibold text-on-surface">{u.name || "—"}</p>
                  <p className="text-xs text-on-surface-variant">{u.email || u.id}</p>
                </div>
              )}
            />
          )}

          {step === "configure" && !success && (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                <p className="text-xs text-on-surface-variant">Assigning to</p>
                <p className="text-sm font-semibold text-on-surface">{targetUser?.name || form.targetPhone}</p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Base on Plan (optional)</label>
                <select value={form.planId} onChange={e => onApplyPlan(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none appearance-none">
                  <option value="">— Fully custom, no plan —</option>
                  {activePlans.map(p => <option key={p.id} value={p.id}>{p.name} (₹{p.price}, {p.seats} seats, {p.durationMonths}mo)</option>)}
                </select>
                <p className="text-[11px] text-on-surface-variant mt-1">Prefills the fields below — every value stays editable.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Seats</label>
                  <input type="number" min="1" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Duration (mo)</label>
                  <input type="number" min="1" value={form.durationMonths} onChange={e => setForm(f => ({ ...f, durationMonths: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Start Date</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <p className="text-[11px] text-on-surface-variant mt-1">Leave blank to start immediately. A future date creates a "scheduled" subscription that activates automatically on that day.</p>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">Features</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PLAN_FEATURE_CATALOG.map(f => (
                    <label key={f.key} className="flex items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm cursor-pointer hover:bg-surface-container-low">
                      <input type="checkbox" checked={form.features.includes(f.key)} onChange={() => toggleFeature(f.key)}
                        className="rounded border-outline-variant/40 text-primary focus:ring-primary/30" />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Internal Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          )}

          {step === "review" && !success && (
            <div className="space-y-3">
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-on-surface-variant">Customer</span><span className="font-semibold text-on-surface">{targetUser?.name || form.targetPhone}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Plan</span><span className="font-semibold text-on-surface">{selectedPlan?.name || "Custom"}</span></div>
                {basePrice != null && basePrice !== finalPrice && (
                  <div className="flex justify-between"><span className="text-on-surface-variant">Base Plan Price</span><span className="text-on-surface">₹{basePrice}</span></div>
                )}
                <div className="flex justify-between"><span className="text-on-surface-variant">Final Price</span><span className="font-black text-on-surface">₹{finalPrice}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Seats</span><span className="text-on-surface">{form.seats}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Duration</span><span className="text-on-surface">{form.durationMonths} month(s)</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Start</span><span className="text-on-surface">{form.startDate || "Immediately"}</span></div>
                {form.features.length > 0 && (
                  <div className="flex justify-between"><span className="text-on-surface-variant">Features</span><span className="text-on-surface text-right">{form.features.map(featureLabel).join(", ")}</span></div>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant">This is a direct grant — no payment is collected. The customer's dashboard access unlocks {form.startDate ? "on the start date above" : "immediately"}.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/20 p-5 sm:flex-row shrink-0">
          {success ? (
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90">
              Done
            </button>
          ) : (
            <>
              <button type="button"
                onClick={() => step === "target" ? onClose() : setStep(step === "review" ? "configure" : "target")}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container">
                {step === "target" ? "Cancel" : "Back"}
              </button>
              <button type="button"
                disabled={(step === "target" && !form.targetPhone) || saving}
                onClick={() => step === "review" ? onSubmit() : setStep(step === "target" ? "configure" : "review")}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Assigning…</>
                ) : step === "review" ? (
                  <><Check className="h-4 w-4" /> Assign Subscription</>
                ) : (
                  "Next"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit subscription modal ────────────────────────────────────────────────

function EditSubscriptionModal({
  sub, form, setForm, saving, error, onClose, onSubmit,
}: {
  sub: any;
  form: { seats: string; price: string; durationMonths: string; features: string[]; notes: string };
  setForm: React.Dispatch<React.SetStateAction<{ seats: string; price: string; durationMonths: string; features: string[]; notes: string }>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const toggleFeature = (key: string) => {
    setForm(f => ({ ...f, features: f.features.includes(key) ? f.features.filter(k => k !== key) : [...f.features, key] }));
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Edit Subscription</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">{sub.ownerPhone || sub.ownerId}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Seats</label>
              <input type="number" min="1" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Price (₹)</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Duration (mo)</label>
              <input type="number" min="1" value={form.durationMonths} onChange={e => setForm(f => ({ ...f, durationMonths: e.target.value }))}
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">Features</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLAN_FEATURE_CATALOG.map(f => (
                <label key={f.key} className="flex items-center gap-2 rounded-xl border border-outline-variant/30 px-3 py-2 text-sm cursor-pointer hover:bg-surface-container-low">
                  <input type="checkbox" checked={form.features.includes(f.key)} onChange={() => toggleFeature(f.key)}
                    className="rounded border-outline-variant/40 text-primary focus:ring-primary/30" />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Internal Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
              ) : (
                <><Check className="h-4 w-4" /> Save Changes</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
