"use client";

import { useEffect, useRef, useState } from "react";
import {
  Pencil, Search, ShieldCheck, Users, AlertTriangle, X, Check,
  Instagram, Facebook, MessageCircle, Youtube, MapPin,
} from "lucide-react";
import { fetchAllUsers, promoteToAdmin, adminUpdateUser, fetchBusinessProfile } from "../../firebase";

declare global {
  interface Window { google?: any }
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border border-red-200",
  manufacturer: "bg-blue-100 text-blue-700 border border-blue-200",
  retailer: "bg-green-100 text-green-700 border border-green-200",
  customer: "bg-gray-100 text-gray-600 border border-gray-200",
};

const EDITABLE_ROLES = ["customer", "retailer", "manufacturer"] as const;
const SUB_STATUSES = ["", "paid", "unpaid", "revoked"];

type SocialLinks = { instagram: string; facebook: string; whatsapp: string; youtube: string };

type EditState = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPaid: boolean;
  totalSeats: string;
  subscriptionStatus: string;
  // business
  shopName: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  // social
  social: SocialLinks;
};

function extractAddressFields(place: any): Partial<Pick<EditState, "city" | "state" | "pincode" | "address" | "latitude" | "longitude">> {
  const out: ReturnType<typeof extractAddressFields> = {};
  const parts: { long_name: string; types: string[] }[] = place?.address_components || [];
  const cityPriority = ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_2", "neighborhood"];
  for (const want of cityPriority) {
    const match = parts.find(p => p.types.includes(want));
    if (match) { out.city = match.long_name; break; }
  }
  const stateComp = parts.find(p => p.types.includes("administrative_area_level_1"));
  if (stateComp) out.state = stateComp.long_name;
  const pinComp = parts.find(p => p.types.includes("postal_code"));
  if (pinComp) out.pincode = pinComp.long_name;
  if (place?.formatted_address) out.address = place.formatted_address;
  if (place?.geometry?.location) {
    out.latitude = typeof place.geometry.location.lat === "function" ? place.geometry.location.lat() : place.geometry.location.lat;
    out.longitude = typeof place.geometry.location.lng === "function" ? place.geometry.location.lng() : place.geometry.location.lng;
  }
  return out;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  const [editTarget, setEditTarget] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showPromotePanel, setShowPromotePanel] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<any | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [promoteSearch, setPromoteSearch] = useState("");

  // Google Maps autocomplete refs
  const addressInputRef = useRef<HTMLInputElement>(null);
  const acListenerRef = useRef<any>(null);

  const load = () => {
    setLoading(true);
    fetchAllUsers().then(setUsers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Set up Google Places autocomplete whenever edit modal opens
  useEffect(() => {
    if (!editTarget) return;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const setup = () => {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      if (acListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(acListenerRef.current);
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["name", "formatted_address", "geometry", "address_components"],
        types: ["establishment", "geocode"],
      });
      acListenerRef.current = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        const fields = extractAddressFields(place);
        if (addressInputRef.current && fields.address)
          addressInputRef.current.value = fields.address;
        setEditTarget(prev => prev ? {
          ...prev,
          ...(place.name && (prev.role === "retailer" ? { shopName: place.name } : prev.role === "manufacturer" ? { businessName: place.name } : {})),
          address: fields.address ?? prev.address,
          city: fields.city ?? prev.city,
          state: fields.state ?? prev.state,
          pincode: fields.pincode ?? prev.pincode,
          latitude: fields.latitude ?? prev.latitude,
          longitude: fields.longitude ?? prev.longitude,
        } : prev);
      });
    };

    const scriptId = "google-maps-places-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const run = () => requestAnimationFrame(() => setup());

    if (window.google?.maps?.places) { run(); }
    else if (existing) {
      if (existing.dataset.loaded === "true") run();
      else existing.addEventListener("load", run, { once: true });
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true; script.defer = true;
      script.onload = () => { script.dataset.loaded = "true"; run(); };
      document.head.appendChild(script);
    }

    return () => {
      if (acListenerRef.current && window.google?.maps?.event)
        window.google.maps.event.removeListener(acListenerRef.current);
      acListenerRef.current = null;
    };
  }, [editTarget?.uid]); // re-run when a different user is opened

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
      isPaid: !!u.isPaid,
      totalSeats: String(u.totalSeats ?? "0"),
      subscriptionStatus: u.subscriptionStatus || "",
      shopName: u.shopName || "",
      businessName: u.businessName || "",
      address: u.address || "",
      city: u.city || "",
      state: u.state || "",
      pincode: u.pincode || "",
      latitude: u.latitude ?? null,
      longitude: u.longitude ?? null,
      social: {
        instagram: u.socialLinks?.instagram || "",
        facebook: u.socialLinks?.facebook || "",
        whatsapp: u.socialLinks?.whatsapp || "",
        youtube: u.socialLinks?.youtube || "",
      },
    });
    setSaveError(null);
    // prime the uncontrolled address input when it mounts
    requestAnimationFrame(() => {
      if (addressInputRef.current) addressInputRef.current.value = u.address || "";
    });

    if (u.role === "retailer" || u.role === "manufacturer") {
      fetchBusinessProfile(u.id, u.role, u.phone || u.id)
        .then((profile) => {
          if (!profile) return;
          setEditTarget((prev) => {
            if (!prev || prev.uid !== u.id) return prev;
            const newAddress = profile.address?.line1 || prev.address || "";
            if (addressInputRef.current) {
              addressInputRef.current.value = newAddress;
            }
            return {
              ...prev,
              shopName: profile.shopName || prev.shopName,
              businessName: profile.businessName || prev.businessName,
              address: newAddress,
              city: profile.address?.city || prev.city,
              state: profile.address?.state || prev.state,
              pincode: profile.address?.pincode || prev.pincode,
              latitude: profile.latitude !== undefined ? profile.latitude : prev.latitude,
              longitude: profile.longitude !== undefined ? profile.longitude : prev.longitude,
              social: {
                instagram: profile.socialLinks?.instagram || prev.social.instagram,
                facebook: profile.socialLinks?.facebook || prev.social.facebook,
                whatsapp: profile.socialLinks?.whatsapp || prev.social.whatsapp,
                youtube: profile.socialLinks?.youtube || prev.social.youtube,
              },
            };
          });
        })
        .catch((err) => {
          console.error("Error loading business profile in openEdit:", err);
        });
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    setSaveError(null);
    const currentAddress = addressInputRef.current?.value?.trim() || editTarget.address;
    try {
      await adminUpdateUser(editTarget.uid, {
        name: editTarget.name,
        email: editTarget.email,
        phone: editTarget.phone,
        role: editTarget.role,
        isPaid: editTarget.isPaid,
        totalSeats: Number(editTarget.totalSeats) || 0,
        subscriptionStatus: editTarget.subscriptionStatus || undefined,
        shopName: editTarget.role === "retailer" ? editTarget.shopName : undefined,
        businessName: editTarget.role === "manufacturer" ? editTarget.businessName : undefined,
        address: currentAddress || undefined,
        city: editTarget.city || undefined,
        state: editTarget.state || undefined,
        pincode: editTarget.pincode || undefined,
        latitude: editTarget.latitude,
        longitude: editTarget.longitude,
        socialLinks: editTarget.social,
      });
      setUsers(prev => prev.map(u => u.id === editTarget.uid ? {
        ...u,
        name: editTarget.name, email: editTarget.email, phone: editTarget.phone,
        role: editTarget.role, isPaid: editTarget.isPaid,
        totalSeats: Number(editTarget.totalSeats),
        subscriptionStatus: editTarget.subscriptionStatus,
        shopName: editTarget.shopName, businessName: editTarget.businessName,
        address: currentAddress, city: editTarget.city,
        state: editTarget.state, pincode: editTarget.pincode,
        latitude: editTarget.latitude, longitude: editTarget.longitude,
        socialLinks: editTarget.social,
      } : u));
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

  const set = (key: keyof EditState, value: any) =>
    setEditTarget(prev => prev ? { ...prev, [key]: value } : prev);
  const setSocial = (key: keyof SocialLinks, value: string) =>
    setEditTarget(prev => prev ? { ...prev, social: { ...prev.social, [key]: value } } : prev);

  const mapUrl = editTarget?.latitude && editTarget?.longitude
    ? `https://maps.google.com/maps?q=${editTarget.latitude},${editTarget.longitude}&z=15&output=embed`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black text-on-surface">Users & Roles</h1>
        </div>
        <p className="text-sm text-on-surface-variant ml-9">View and edit all platform users, their roles and subscription status.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "retailer", "manufacturer", "customer", "admin"] as const).map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filterRole === role ? "bg-primary text-white shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {role === "all" ? "All" : role.charAt(0).toUpperCase() + role.slice(1)} ({counts[role as keyof typeof counts]})
          </button>
        ))}
      </div>

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
                      <button type="button" onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
                        <Pencil className="h-3.5 w-3.5" /> Edit
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
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-on-surface">Edit User</h2>
                <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{editTarget.uid.slice(0, 22)}…</p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)}
                className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-6 flex-1">
              {saveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
              )}

              {/* ── Basic Info ── */}
              <div>
                <SectionLabel>Basic Info</SectionLabel>
                <div className="space-y-3">
                  <Field label="Name" value={editTarget.name} onChange={v => set("name", v)} placeholder="Full name" />
                  <Field label="Email" value={editTarget.email} onChange={v => set("email", v)} placeholder="user@example.com" type="email" />
                  <Field label="Phone" value={editTarget.phone} onChange={v => set("phone", v)} placeholder="+91…" type="tel" />
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Role</span>
                    <select value={editTarget.role} onChange={e => set("role", e.target.value)}
                      className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                      {EDITABLE_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Subscription ── */}
              <div>
                <SectionLabel>Subscription & Seats</SectionLabel>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5">
                    <span className="text-sm font-medium text-on-surface">Paid / Active</span>
                    <button type="button" onClick={() => set("isPaid", !editTarget.isPaid)}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center ${editTarget.isPaid ? "bg-green-500 justify-end" : "bg-gray-300 justify-start"}`}>
                      <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-on-surface">Subscription Status</span>
                    <select value={editTarget.subscriptionStatus} onChange={e => set("subscriptionStatus", e.target.value)}
                      className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none">
                      {SUB_STATUSES.map(s => <option key={s} value={s}>{s || "— not set —"}</option>)}
                    </select>
                  </div>
                  <Field label="Total Seats" value={editTarget.totalSeats} onChange={v => set("totalSeats", v)} placeholder="0" type="number" />
                </div>
              </div>

              {/* ── Business Details (role-specific) ── */}
              {(editTarget.role === "retailer" || editTarget.role === "manufacturer") && (
                <div>
                  <SectionLabel>Business Details</SectionLabel>
                  <div className="space-y-3">
                    {editTarget.role === "retailer" && (
                      <Field label="Shop Name" value={editTarget.shopName} onChange={v => set("shopName", v)} placeholder="Shop name" />
                    )}
                    {editTarget.role === "manufacturer" && (
                      <Field label="Business Name" value={editTarget.businessName} onChange={v => set("businessName", v)} placeholder="Business name" />
                    )}

                    {/* Google Maps Address */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        Search location on Google Maps
                        <span className="text-xs font-normal text-on-surface-variant">(auto-fills address)</span>
                      </span>
                      {/* Uncontrolled input — Google Autocomplete sets value via DOM directly */}
                      <input
                        ref={addressInputRef}
                        autoComplete="off"
                        defaultValue={editTarget.address}
                        placeholder="Type address, shop or landmark…"
                        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Field label="City" value={editTarget.city} onChange={v => set("city", v)} placeholder="City" />
                      <Field label="State" value={editTarget.state} onChange={v => set("state", v)} placeholder="State" />
                      <Field label="Pincode" value={editTarget.pincode} onChange={v => set("pincode", v)} placeholder="000000" />
                    </div>

                    {/* Map preview */}
                    {mapUrl && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          <MapPin className="h-3.5 w-3.5" /> Location pinned
                        </div>
                        <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                          <iframe title="Location preview" src={mapUrl} className="h-40 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Social Links ── */}
              <div>
                <SectionLabel>Social Links</SectionLabel>
                <div className="space-y-3">
                  {([
                    { key: "instagram" as const, icon: Instagram, label: "Instagram", placeholder: "instagram.com/yourpage" },
                    { key: "facebook"  as const, icon: Facebook,  label: "Facebook",  placeholder: "facebook.com/yourpage" },
                    { key: "whatsapp"  as const, icon: MessageCircle, label: "WhatsApp", placeholder: "+91 98765 43210" },
                    { key: "youtube"   as const, icon: Youtube,   label: "YouTube",   placeholder: "youtube.com/@channel" },
                  ]).map(({ key, icon: Icon, label, placeholder }) => (
                    <label key={key} className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-on-surface flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </span>
                      <input type="text" value={editTarget.social[key]}
                        onChange={e => setSocial(key, e.target.value)}
                        placeholder={placeholder}
                        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0">
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
        <button type="button" onClick={() => setShowPromotePanel(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-red-50 transition-colors">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Admin Promotion Zone</p>
            <p className="text-xs text-red-500">Danger area — use only when intentionally granting admin access.</p>
          </div>
          <span className="text-xs font-bold text-red-500 shrink-0">{showPromotePanel ? "Close ↑" : "Open ↓"}</span>
        </button>

        {showPromotePanel && (
          <div className="border-t border-red-200 p-5 space-y-4">
            <p className="text-xs text-red-600 font-semibold">
              Admin access grants full platform control. Select a user, then type their exact email to confirm.
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
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-red-50 last:border-0 ${promoteTarget?.id === u.id ? "bg-red-50" : "hover:bg-red-50/50"}`}>
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
                    className="p-1 rounded-lg hover:bg-red-50 text-red-400"><X className="h-4 w-4" /></button>
                </div>
                <p className="text-xs text-red-600">Type <strong>{promoteTarget.email}</strong> exactly to confirm:</p>
                <input type="text" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)}
                  placeholder="Type the user's email to confirm…"
                  className="w-full rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200" />
                <button type="button" onClick={handlePromoteConfirm}
                  disabled={promoting || confirmEmail.trim().toLowerCase() !== (promoteTarget.email || "").toLowerCase()}
                  className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">{children}</p>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-on-surface">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2" />
    </label>
  );
}
