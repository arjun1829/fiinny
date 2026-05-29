"use client";

import { useEffect, useState } from "react";
import {
  CreditCard, Search, RefreshCw, ShieldOff, Plus, X, Check,
  ChevronDown, CalendarPlus, AlertTriangle, Pencil,
} from "lucide-react";
import {
  fetchAllSubscriptions, fetchAllUsers,
  adminRevokeSubscription, adminExtendSubscription, adminManualActivate,
  adminUpdateSubscriptionSeats, fetchFailedPayments
} from "../../firebase";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700 border border-green-200",
  unpaid: "bg-gray-100 text-gray-500 border border-gray-200",
  revoked: "bg-red-100 text-red-600 border border-red-200",
  manual_admin: "bg-purple-100 text-purple-700 border border-purple-200",
};

const DURATION_OPTIONS = [1, 3, 6, 12];

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

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'failedPayments'>('subscriptions');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Actions state
  const [revoking, setRevoking] = useState<string | null>(null);
  const [extending, setExtending] = useState<string | null>(null);
  const [extendMonths, setExtendMonths] = useState(1);
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

  const load = async () => {
    setLoading(true);
    try {
      const [subsData, usersData, failedData] = await Promise.all([fetchAllSubscriptions(), fetchAllUsers(), fetchFailedPayments()]);
      setSubs(subsData);
      setUsers(usersData);
      setFailedPayments(failedData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const getUserName = (sub: any) => {
    const phone = sub.ownerPhone || sub.ownerId;
    const user = users.find(u => u.id === phone || u.uid === phone);
    return user?.name || user?.email || phone || "—";
  };

  const filtered = subs.filter(s => {
    const q = search.toLowerCase();
    const phone = s.ownerPhone || s.ownerId || "";
    const user = users.find(u => u.id === phone || u.uid === phone);
    const nameStr = `${user?.name || ""} ${user?.email || ""} ${phone}`.toLowerCase();
    const matchSearch = !q || nameStr.includes(q) || (s.razorpayPaymentId || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || s.subscriptionStatus === statusFilter;
    return matchSearch && matchStatus;
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
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Revoke failed.");
    } finally {
      setRevoking(null);
    }
  };

  const handleExtend = async (sub: any) => {
    setExtending(sub.id);
    setActionError(null);
    try {
      const userDocId = sub.ownerPhone || sub.ownerId;
      await adminExtendSubscription(sub.id, userDocId, extendMonths);
      await load();
      setExtending(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Extend failed.");
      setExtending(null);
    }
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
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update seats.");
    } finally {
      setSavingSeats(false);
    }
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
      await load();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Activation failed.");
    } finally {
      setManualSaving(false);
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
          onClick={() => setActiveTab('failedPayments')}
          className={`pb-2 px-1 font-semibold text-sm ${activeTab === 'failedPayments' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Failed Payments
        </button>
      </div>

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
        <div className="grid grid-cols-2 gap-2 shrink-0 sm:flex">
          <button onClick={() => load()} className="flex items-center justify-center gap-1.5 border border-outline-variant/40 text-xs sm:text-sm font-medium px-2.5 sm:px-3 py-2 rounded-xl hover:bg-surface-container transition-colors">
            <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Refresh
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
                      onClick={() => setExtending(isExpanded ? null : sub.id)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-[11px] sm:text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Extend
                      <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
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
                  <div className="border-t border-outline-variant/20 bg-surface-container-low px-5 py-4">
                    <p className="text-xs font-semibold text-on-surface-variant mb-3">Extend subscription by:</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {DURATION_OPTIONS.map(m => (
                        <button key={m} type="button" onClick={() => setExtendMonths(m)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${extendMonths === m ? "bg-primary text-white border-primary" : "border-outline-variant/40 text-on-surface hover:bg-surface-container"}`}>
                          {m} mo
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleExtend(sub)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors">
                        <Check className="h-4 w-4" />
                        Confirm +{extendMonths} month{extendMonths > 1 ? "s" : ""}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Activation Modal */}
      {showManual && (
        <div className="fixed inset-x-0 bottom-0 top-0 sm:top-16 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4">
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
      </>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
          {failedPayments.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-sm">
              No failed payments found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface-container-low border-b border-outline-variant/40 text-on-surface-variant text-xs uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Payment ID</th>
                    <th className="px-4 py-3">Error Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {failedPayments.map((fp) => (
                    <tr key={fp.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-4 py-3 text-on-surface-variant">{fmt(fp.timestamp)}</td>
                      <td className="px-4 py-3 font-medium text-on-surface">{fp.userPhone || fp.userId}</td>
                      <td className="px-4 py-3 text-on-surface-variant font-mono">{fp.error?.metadata?.payment_id || 'N/A'}</td>
                      <td className="px-4 py-3 text-red-600 font-medium whitespace-normal max-w-xs">
                        {fp.error?.reason || fp.error?.description || 'Unknown error'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
