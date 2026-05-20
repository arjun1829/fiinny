"use client";

import { useEffect, useState } from "react";
import { Pencil, Search, ShieldCheck, Users, AlertTriangle, X, Check } from "lucide-react";
import { fetchAllUsers, promoteToAdmin, adminUpdateUser } from "../../firebase";

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border border-red-200",
  manufacturer: "bg-blue-100 text-blue-700 border border-blue-200",
  retailer: "bg-green-100 text-green-700 border border-green-200",
  customer: "bg-gray-100 text-gray-600 border border-gray-200",
};

const ALL_ROLES = ["customer", "retailer", "manufacturer", "admin"] as const;

type EditState = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  // Edit modal state
  const [editTarget, setEditTarget] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Promotion state
  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<any | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteSearch, setPromoteSearch] = useState("");

  const load = () => {
    setLoading(true);
    fetchAllUsers().then(setUsers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || [u.name, u.email, u.role, u.id, u.phone].join(" ").toLowerCase().includes(q);
    const matchRole = filterRole === "all" || (filterRole === "customer" ? (!u.role || u.role === "customer") : u.role === filterRole);
    return matchSearch && matchRole;
  });

  const promoteCandidates = users.filter(u =>
    u.role !== "admin" &&
    (!promoteSearch || [u.name, u.email].join(" ").toLowerCase().includes(promoteSearch.toLowerCase()))
  );

  const counts = {
    all: users.length,
    retailer: users.filter(u => u.role === "retailer").length,
    manufacturer: users.filter(u => u.role === "manufacturer").length,
    admin: users.filter(u => u.role === "admin").length,
    customer: users.filter(u => !u.role || u.role === "customer").length,
  };

  const openEdit = (u: any) => {
    setEditTarget({
      uid: u.id,
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "customer",
    });
    setSaveError(null);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    setSaveError(null);
    try {
      await adminUpdateUser(editTarget.uid, {
        name: editTarget.name,
        email: editTarget.email,
        phone: editTarget.phone,
        role: editTarget.role,
      });
      setUsers(prev => prev.map(u => u.id === editTarget.uid
        ? { ...u, name: editTarget.name, email: editTarget.email, phone: editTarget.phone, role: editTarget.role }
        : u
      ));
      setEditTarget(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteConfirm = async () => {
    if (!promoteTarget) return;
    if (confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()) {
      alert("Email does not match. Promotion cancelled.");
      return;
    }
    setPromoting(true);
    try {
      await promoteToAdmin(promoteTarget.id);
      setUsers(prev => prev.map(u => u.id === promoteTarget.id ? { ...u, role: "admin", isPaid: true } : u));
      setPromoteTarget(null);
      setConfirmEmail("");
      setShowPromotePanel(false);
    } catch (e) {
      alert("Failed to promote. Check console.");
      console.error(e);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black text-on-surface">Users & Roles</h1>
        </div>
        <p className="text-sm text-on-surface-variant ml-9">View and edit all platform users, their roles and subscription status.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", "retailer", "manufacturer", "customer", "admin"] as const).map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filterRole === role ? "bg-primary text-white shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {role === "all" ? "All" : role.charAt(0).toUpperCase() + role.slice(1)} ({counts[role as keyof typeof counts]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input type="text" placeholder="Search by name, email, phone or role…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant" />
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">User</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Role</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Subscription</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Products</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Seats</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-on-surface">{u.name || "—"}</p>
                      <p className="text-xs text-on-surface-variant truncate max-w-[200px]">{u.email || "—"}</p>
                      {u.phone && <p className="text-xs text-on-surface-variant">{u.phone}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                        {u.role || "customer"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1 text-xs font-bold ${u.isPaid ? "text-green-600" : "text-on-surface-variant"}`}>
                        <span className={`w-2 h-2 rounded-full ${u.isPaid ? "bg-green-500" : "bg-gray-300"}`} />
                        {u.isPaid ? "Active" : "Free"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-on-surface">{u.productCount ?? "—"}</td>
                    <td className="px-5 py-3 text-sm text-on-surface">{u.totalSeats ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-on-surface-variant">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Edit User Modal ─────────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-on-surface">Edit User</h2>
                <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{editTarget.uid.slice(0, 16)}…</p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)}
                className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {saveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
              )}
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">Name</span>
                <input
                  value={editTarget.name}
                  onChange={e => setEditTarget(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                  placeholder="Full name"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">Email</span>
                <input
                  type="email"
                  value={editTarget.email}
                  onChange={e => setEditTarget(prev => prev ? { ...prev, email: e.target.value } : prev)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                  placeholder="user@example.com"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">Phone</span>
                <input
                  type="tel"
                  value={editTarget.phone}
                  onChange={e => setEditTarget(prev => prev ? { ...prev, phone: e.target.value } : prev)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                  placeholder="+91…"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-on-surface">Role</span>
                <select
                  value={editTarget.role}
                  onChange={e => setEditTarget(prev => prev ? { ...prev, role: e.target.value } : prev)}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
                >
                  {ALL_ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/20 px-5 py-4">
              <button type="button" onClick={() => setEditTarget(null)} disabled={saving}
                className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60">
                Cancel
              </button>
              <button type="button" onClick={handleSaveEdit} disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60">
                {saving ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
                ) : (
                  <><Check className="h-4 w-4" /> Save changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Guarded Admin Promotion Section ─────────────────────────────── */}
      <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPromotePanel(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-red-50 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Admin Promotion Zone</p>
            <p className="text-xs text-red-500">Danger area — use only when intentionally granting admin access to a user.</p>
          </div>
          <span className="text-xs font-bold text-red-500 shrink-0">{showPromotePanel ? "Close ↑" : "Open ↓"}</span>
        </button>

        {showPromotePanel && (
          <div className="border-t border-red-200 p-5 space-y-4">
            <p className="text-xs text-red-600 font-semibold">
              Admin access grants full platform control — products, hubs, all users.
              Select a user below, then type their exact email to confirm.
            </p>

            <div className="flex items-center gap-3 bg-white border border-red-200 rounded-xl px-3 py-2">
              <Search className="h-4 w-4 text-red-300 shrink-0" />
              <input type="text" placeholder="Search user to promote…" value={promoteSearch}
                onChange={e => setPromoteSearch(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-red-300" />
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-white">
              {promoteCandidates.length === 0 && (
                <p className="text-xs text-on-surface-variant text-center py-4">No matching non-admin users.</p>
              )}
              {promoteCandidates.map(u => (
                <button key={u.id} type="button"
                  onClick={() => { setPromoteTarget(u); setConfirmEmail(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-red-50 last:border-0
                    ${promoteTarget?.id === u.id ? "bg-red-50" : "hover:bg-red-50/50"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${ROLE_BADGE[u.role] || ROLE_BADGE.customer}`}>
                    {u.role || "customer"}
                  </span>
                  {promoteTarget?.id === u.id && <span className="text-xs text-red-600 font-bold shrink-0">Selected</span>}
                </button>
              ))}
            </div>

            {promoteTarget && (
              <div className="rounded-xl border border-red-300 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-red-700">
                    Promoting: <span className="text-on-surface">{promoteTarget.name || promoteTarget.email}</span>
                  </p>
                  <button type="button" onClick={() => { setPromoteTarget(null); setConfirmEmail(""); }}
                    className="p-1 rounded-lg hover:bg-red-50 text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-red-600">
                  Type <strong>{promoteTarget.email}</strong> exactly to confirm:
                </p>
                <input type="text" value={confirmEmail}
                  onChange={e => setConfirmEmail(e.target.value)}
                  placeholder="Type the user's email to confirm…"
                  className="w-full rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200" />
                <button type="button"
                  onClick={handlePromoteConfirm}
                  disabled={promoting || confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()}
                  className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  {promoting ? "Promoting…" : "Confirm Promote to Admin"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
