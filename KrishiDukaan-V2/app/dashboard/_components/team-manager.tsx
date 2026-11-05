"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, Pause, Pencil, Play, Plus, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { auth } from "../../firebase";
import {
  STAFF_PERMISSIONS,
  STAFF_PERMISSION_INFO,
  STAFF_PRESETS,
  type StaffPermission,
  type TeamMember,
} from "../../lib/shop-team";

/**
 * The shop's helpers (app/lib/shop-team.ts). Used by the owner's
 * Dashboard → Team page and by admins in Users & Roles, who pass [ownerPhone]
 * to manage that shop on the owner's behalf. Everything goes through
 * /api/team; the list loads once when this mounts.
 */

type TeamData = { owner: { phone: string; name: string; role: string }; members: TeamMember[] };

async function teamApi(method: "GET" | "POST", ownerPhone: string | undefined, body?: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in again.");
  const url = method === "GET" && ownerPhone ? `/api/team?owner=${encodeURIComponent(ownerPhone)}` : "/api/team";
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify({ ...body, ...(ownerPhone ? { owner: ownerPhone } : {}) }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
  return json;
}

function whatsappInvite(member: { name: string; phone: string }, shopName: string): string {
  const digits = member.phone.replace(/\D/g, "").slice(-10);
  const text =
    `Hi ${member.name}, you've been added as a helper for ${shopName} on KrishiDukan. ` +
    `Log in with your number ${member.phone} (OTP) on the KrishiDukan app or at https://krishidukan.com and open Dashboard to manage the shop.`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "Not logged in yet";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return "Active recently";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return `Active ${Math.floor(hours / 24)}d ago`;
}

function PermissionPicker({ value, onChange }: { value: StaffPermission[]; onChange: (v: StaffPermission[]) => void }) {
  const toggle = (p: StaffPermission) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STAFF_PRESETS.map((preset) => {
          const on = preset.permissions.length === value.length && preset.permissions.every((p) => value.includes(p));
          return (
            <button key={preset.key} type="button" onClick={() => onChange([...preset.permissions])}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${on ? "border-primary bg-primary text-white" : "border-outline-variant text-on-surface hover:bg-surface-container"}`}>
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {STAFF_PERMISSIONS.map((p) => (
          <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${value.includes(p) ? "border-primary/40 bg-primary/5" : "border-outline-variant/40 hover:bg-surface-container-low"}`}>
            <input type="checkbox" checked={value.includes(p)} onChange={() => toggle(p)} className="mt-0.5 rounded border-outline-variant" />
            <span>
              <span className="block text-sm font-bold text-on-surface">{STAFF_PERMISSION_INFO[p].label}</span>
              <span className="block text-xs text-on-surface-variant">{STAFF_PERMISSION_INFO[p].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function TeamManager({ ownerPhone }: { ownerPhone?: string }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; invite?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [perms, setPerms] = useState<StaffPermission[]>([...STAFF_PRESETS[0].permissions]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<StaffPermission[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = (await teamApi("GET", ownerPhone)) as TeamData;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ownerPhone]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, body: Record<string, unknown>, success: string, invite?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await teamApi("POST", ownerPhone, body);
      setNotice({ text: success, invite });
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (!name.trim()) return setError("Enter the helper's name.");
    if (!/^[6-9]\d{9}$/.test(digits)) return setError("Enter a valid 10-digit mobile number.");
    if (perms.length === 0) return setError("Choose at least one thing the helper can do.");
    const shopName = data?.owner.name ?? "the shop";
    const ok = await run("add", { action: "add", name: name.trim(), phone: digits, permissions: perms },
      `${name.trim()} can now log in with ${digits} and manage ${shopName}.`,
      whatsappInvite({ name: name.trim(), phone: `+91${digits}` }, shopName));
    if (ok) {
      setAdding(false);
      setName("");
      setPhone("");
      setPerms([...STAFF_PRESETS[0].permissions]);
    }
  };

  if (loading && !data) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const members = data?.members ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
        <p className="font-bold mb-1">How helpers work</p>
        <p className="text-xs leading-relaxed text-emerald-900/80">
          Add someone who helps run the shop. They log in on the KrishiDukan app or website with <b>their own number</b> and OTP,
          and manage only what you tick. They never see payments, subscription, bank details, or this team list, and you can pause or remove them anytime.
        </p>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {notice && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800">
          <span>{notice.text}</span>
          {notice.invite && (
            <a href={notice.invite} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">
              <MessageCircle className="h-3.5 w-3.5" /> Send login steps on WhatsApp
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-on-surface">
          <UsersRound className="mr-1.5 inline h-4 w-4 text-primary" />
          {members.length} helper{members.length === 1 ? "" : "s"}
        </p>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setNotice(null); }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            <UserPlus className="h-4 w-4" /> Add helper
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submitAdd} className="space-y-4 rounded-2xl border border-outline-variant/40 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-on-surface">New helper</h3>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg p-1.5 hover:bg-surface-container" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Ramesh"
                className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">Mobile number</span>
              <div className="flex items-center rounded-xl border border-outline-variant/50 bg-surface-container-low focus-within:border-primary">
                <span className="pl-3 text-sm text-on-surface-variant">+91</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                  inputMode="numeric" placeholder="10-digit number"
                  className="w-full bg-transparent px-2 py-2.5 text-sm focus:outline-none" />
              </div>
            </label>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">What can they do?</p>
            <PermissionPicker value={perms} onChange={setPerms} />
          </div>
          <button type="submit" disabled={busy === "add"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add helper
          </button>
        </form>
      )}

      {members.length === 0 && !adding ? (
        <div className="rounded-2xl border-2 border-dashed border-outline-variant/50 p-8 text-center text-sm text-on-surface-variant">
          No helpers yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <li key={m.phone} className="rounded-2xl border border-outline-variant/30 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-on-surface">
                    {m.name}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${m.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {m.status === "active" ? "Active" : "Paused"}
                    </span>
                    {m.addedBy === "admin" && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">Added by KrishiDukan</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant">{m.phone} · {timeAgo(m.lastActiveAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={whatsappInvite(m, data?.owner.name ?? "the shop")} target="_blank" rel="noopener noreferrer" title="Send login steps on WhatsApp"
                    className="rounded-lg p-2 text-green-700 hover:bg-green-50"><MessageCircle className="h-4 w-4" /></a>
                  <button type="button" title="Change access" onClick={() => { setEditing(editing === m.phone ? null : m.phone); setEditPerms(m.permissions); }}
                    className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"><Pencil className="h-4 w-4" /></button>
                  <button type="button" disabled={!!busy} title={m.status === "active" ? "Pause access" : "Resume access"}
                    onClick={() => run(`status-${m.phone}`, { action: "update", phone: m.phone, status: m.status === "active" ? "paused" : "active" },
                      m.status === "active" ? `${m.name}'s access is paused.` : `${m.name}'s access is back on.`)}
                    className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
                    {busy === `status-${m.phone}` ? <Loader2 className="h-4 w-4 animate-spin" /> : m.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button type="button" disabled={!!busy} title="Remove helper"
                    onClick={() => {
                      if (confirm(`Remove ${m.name} (${m.phone}) from the team? They lose access immediately.`)) {
                        void run(`remove-${m.phone}`, { action: "remove", phone: m.phone }, `${m.name} was removed.`);
                      }
                    }}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {busy === `remove-${m.phone}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.permissions.map((p) => (
                  <span key={p} className="rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface">{STAFF_PERMISSION_INFO[p].label}</span>
                ))}
              </div>
              {editing === m.phone && (
                <div className="mt-4 space-y-3 border-t border-outline-variant/30 pt-4">
                  <PermissionPicker value={editPerms} onChange={setEditPerms} />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === `edit-${m.phone}` || editPerms.length === 0}
                      onClick={async () => {
                        if (await run(`edit-${m.phone}`, { action: "update", phone: m.phone, permissions: editPerms }, `${m.name}'s access was updated.`)) setEditing(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
                      {busy === `edit-${m.phone}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save access
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-outline-variant px-4 py-2 text-xs font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
