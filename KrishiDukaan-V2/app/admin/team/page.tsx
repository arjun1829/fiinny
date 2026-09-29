"use client";

/**
 * Team management — admin-only. Lets an admin create limited-access staff
 * accounts ("team") who log in at the same /admin-login with email+password
 * but only see the admin-portal tabs the admin explicitly granted (e.g.
 * monitor users, send WhatsApp notifications, help sellers list products —
 * without full admin control like role changes or account deletion).
 */

import { useEffect, useState } from "react";
import {
  Users, UserPlus, Loader2, Trash2, Pencil, X, Check, ShieldAlert,
} from "lucide-react";
import { auth, adminUpdateTeamSections } from "../../firebase";
import { getUsers, invalidateUsers } from "../_lib/admin-data";
import { ADMIN_SECTIONS, type AdminSection } from "../_context/admin-auth-context";

type TeamMember = {
  uid: string;
  name: string;
  email: string;
  adminSections: AdminSection[];
  createdAt?: unknown;
};

const SECTION_LABELS: Record<AdminSection, string> = {
  overview: "Overview",
  analytics: "Analytics",
  orders: "Orders",
  payments: "Payments",
  users: "Users & Roles",
  subscriptions: "Subscriptions",
  payouts: "Seller Payouts",
  routePayouts: "Route Payouts",
  moderation: "Moderation",
  pricing: "Pricing & Promos",
  products: "Products",
  reels: "Reels",
  discounts: "Discounts",
  inventory: "Inventory",
  companies: "Company Pages",
  hubs: "Hubs",
  banners: "Banners",
  reports: "Reports",
  messages: "Messages",
  whatsapp: "WhatsApp",
  blog: "Blog",
  team: "Team",
  salesTeam: "Sales Team",
  referrals: "Referrals",
};

const inputCls =
  "w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 placeholder:text-on-surface-variant/50";

function SectionCheckboxGrid({
  selected,
  onToggle,
}: {
  selected: Set<AdminSection>;
  onToggle: (s: AdminSection) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {ADMIN_SECTIONS.filter((s) => s !== "team").map((s) => (
        <label
          key={s}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${
            selected.has(s)
              ? "border-primary bg-primary/5 text-on-surface font-semibold"
              : "border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(s)}
            onChange={() => onToggle(s)}
            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
          />
          {SECTION_LABELS[s]}
        </label>
      ))}
    </div>
  );
}

function CreateTeamMemberForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sections, setSections] = useState<Set<AdminSection>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (s: AdminSection) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError("Name, email, and a password of at least 6 characters are required.");
      return;
    }
    if (sections.size === 0) {
      setError("Grant at least one section.");
      return;
    }
    setSaving(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role: "team",
          adminSections: Array.from(sections),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create team member.");
      setName(""); setEmail(""); setPassword(""); setSections(new Set());
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create team member.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" />
        <p className="font-bold text-on-surface text-sm">Create Team Member</p>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <input className={inputCls} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} placeholder="Password (min 6 chars)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-on-surface">Grant access to</p>
        <SectionCheckboxGrid selected={sections} onToggle={toggle} />
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Create Team Member
      </button>
    </div>
  );
}

function EditSectionsRow({
  member,
  onSaved,
  onDelete,
  deleting,
}: {
  member: TeamMember;
  onSaved: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [sections, setSections] = useState<Set<AdminSection>>(new Set(member.adminSections));
  const [saving, setSaving] = useState(false);

  const toggle = (s: AdminSection) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminUpdateTeamSections(member.uid, Array.from(sections));
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-on-surface text-sm truncate">{member.name || member.email}</p>
          <p className="text-xs text-on-surface-variant truncate">{member.email}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || sections.size === 0}
                className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setSections(new Set(member.adminSections)); }}
                className="rounded-lg border border-outline-variant/40 p-1.5 text-on-surface-variant hover:bg-surface-container"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1.5 text-xs font-medium hover:bg-surface-container"
              >
                <Pencil className="h-3 w-3" /> Edit Access
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                title="Remove team member"
                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <SectionCheckboxGrid selected={sections} onToggle={toggle} />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {member.adminSections.length === 0 ? (
            <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> No sections granted — this account cannot access anything
            </span>
          ) : (
            member.adminSections.map((s) => (
              <span key={s} className="rounded-full bg-primary/10 text-primary text-[11px] font-semibold px-2.5 py-1">
                {SECTION_LABELS[s] ?? s}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async (force = false) => {
    if (force) invalidateUsers();
    setLoading(true);
    try {
      const all = await getUsers({ force });
      const team = all
        .filter((u) => u.role === "team")
        .map((u) => ({
          uid: u.uid || u.id,
          name: String(u.name ?? ""),
          email: String(u.email ?? ""),
          adminSections: (Array.isArray(u.adminSections) ? u.adminSections : []) as AdminSection[],
          createdAt: u.createdAt,
        }));
      team.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(team);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const remove = async (uid: string) => {
    if (!confirm("Remove this team member? They will no longer be able to log in.")) return;
    setDeleting(uid);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ targetUid: uid }),
      });
      await load(true);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 sm:gap-3 mb-1">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <h1 className="text-lg sm:text-2xl font-black text-on-surface">Team</h1>
        </div>
        <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">
          Create limited-access staff accounts — operations/support team members who log in like an
          admin but only see the tabs you grant them (e.g. monitor users, send WhatsApp notifications,
          help sellers list products) without full admin control.
        </p>
      </div>

      <CreateTeamMemberForm onCreated={() => void load(true)} />

      <div className="space-y-2">
        <p className="text-sm font-bold text-on-surface">Team Members ({members.length})</p>
        {loading ? (
          <div className="flex h-24 items-center justify-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/40 px-6 py-10 text-center">
            <p className="text-sm text-on-surface-variant">No team members yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <EditSectionsRow
                key={m.uid}
                member={m}
                onSaved={() => void load(true)}
                onDelete={() => void remove(m.uid)}
                deleting={deleting === m.uid}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
