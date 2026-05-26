"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2, Phone, Plus, RefreshCw, Check, X,
  Loader2, Package, Store, Video, LinkIcon,
  Save, Tag, Globe, Mail, Youtube,
  MapPin, Users, Sparkles, Pencil,
} from "lucide-react";
import {
  fetchAllCompanyPages, saveCompanyPage, assignCompanyOwner, removeCompanyOwner,
  fetchAllUsers, adminAutoSeedCompanyPage,
  fetchManufacturerProducts, fetchUserProfileByPhone, fetchManufacturerNetworkStores,
  type CompanyPageDoc, type RetailerNetworkStore,
} from "../../firebase";
import { MANUFACTURERS } from "../../constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 placeholder:text-on-surface-variant/50";
const labelCls = "flex flex-col gap-1.5 text-sm";
type Status = { type: "ok" | "err"; msg: string } | null;

function StatusBanner({ status, onDismiss }: { status: Status; onDismiss: () => void }) {
  if (!status) return null;
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm font-medium border ${status.type === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
      <span>{status.type === "ok" ? "✓ " : "✗ "}{status.msg}</span>
      <button type="button" onClick={onDismiss}><X className="w-4 h-4" /></button>
    </div>
  );
}

async function seedCompanyFromConstants(mfrId: string): Promise<void> {
  const mfr = MANUFACTURERS[mfrId];
  if (!mfr) return;
  await saveCompanyPage(mfrId, {
    id: mfrId, name: mfr.name, tagline: mfr.tagline, location: mfr.location,
    about: mfr.about, founded: mfr.founded, website: mfr.website ?? "",
    socialProof: mfr.socialProof, certifications: mfr.certifications,
    primaryColor: mfr.primaryColor, accentColor: mfr.accentColor,
    phone: mfr.phone ?? "", email: mfr.email ?? "",
    videos: (mfr as any).videos ?? [], ownerPhone: (mfr as any).ownerPhone ?? "",
  });
}

function extractYouTubeId(input: string): string | null {
  const t = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}


function BrandTab({ company, ownerPhone, onSaved }: {
  company: CompanyPageDoc; ownerPhone?: string; onSaved: (d: Partial<CompanyPageDoc>) => void;
}) {
  const [form, setForm] = useState({
    name: company.name ?? "", tagline: company.tagline ?? "", about: company.about ?? "",
    location: company.location ?? "", founded: company.founded ?? "", website: company.website ?? "",
    socialProof: company.socialProof ?? "", phone: company.phone ?? "", email: company.email ?? "",
    primaryColor: company.primaryColor ?? "#154212", accentColor: company.accentColor ?? "#f57c00",
    instagram: company.socialLinks?.instagram ?? "", facebook: company.socialLinks?.facebook ?? "",
    whatsapp: company.socialLinks?.whatsapp ?? "", youtube: company.socialLinks?.youtube ?? "",
    certInput: "",
  });
  const [certs, setCerts] = useState<string[]>(company.certifications ?? []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [ownerProfile, setOwnerProfile] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!ownerPhone) return;
    fetchUserProfileByPhone(ownerPhone).then(p => setOwnerProfile(p));
  }, [ownerPhone]);

  const profileData = ownerProfile ? {
    name: ownerProfile.businessName || ownerProfile.shopName || ownerProfile.name || "",
    phone: ownerProfile.phone || ownerPhone || "",
    email: ownerProfile.email || "",
    location: [ownerProfile.city, ownerProfile.state].filter(Boolean).join(", "),
    website: ownerProfile.website || "",
  } : null;

  const syncFields = profileData
    ? (Object.entries(profileData) as [keyof typeof form, string][])
        .filter(([k, v]) => v && form[k] !== v)
    : [];

  const handleSyncFromProfile = () => {
    if (!profileData) return;
    setForm(p => ({ ...p, ...Object.fromEntries(syncFields) }));
    setStatus({ type: "ok", msg: "Profile data applied — click Save to persist." });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try {
      const data: Partial<CompanyPageDoc> = {
        name: form.name.trim(), tagline: form.tagline.trim(), about: form.about.trim(),
        location: form.location.trim(), founded: form.founded.trim(), website: form.website.trim(),
        socialProof: form.socialProof.trim(), phone: form.phone.trim(), email: form.email.trim(),
        primaryColor: form.primaryColor, accentColor: form.accentColor, certifications: certs,
        socialLinks: {
          instagram: form.instagram.trim() || undefined,
          facebook: form.facebook.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          youtube: form.youtube.trim() || undefined,
        },
      };
      await saveCompanyPage(company.id, data);
      setStatus({ type: "ok", msg: "Brand info saved." });
      onSaved(data);
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* Sync from owner profile */}
      {syncFields.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-800">Profile data available</p>
            <p className="text-xs text-blue-600 mt-0.5">
              {syncFields.map(([k]) => k).join(", ")} differ from the owner&apos;s profile.
            </p>
          </div>
          <button type="button" onClick={handleSyncFromProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shrink-0">
            <Sparkles className="w-3 h-3" /> Sync from Profile
          </button>
        </div>
      )}

      {/* Basic Info */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Basic Information</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelCls}><span className="font-medium text-on-surface">Company Name *</span>
            <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Karan Arjun Power Plus™" /></label>
          <label className={labelCls}><span className="font-medium text-on-surface">Tagline</span>
            <input className={inputCls} value={form.tagline} onChange={set("tagline")} placeholder="Short brand tagline" maxLength={100} /></label>
          <label className={labelCls}><span className="font-medium text-on-surface">Location</span>
            <input className={inputCls} value={form.location} onChange={set("location")} placeholder="City, District, State PIN" /></label>
          <label className={labelCls}><span className="font-medium text-on-surface">Founded Year</span>
            <input className={inputCls} value={form.founded} onChange={set("founded")} placeholder="e.g. 2019" maxLength={4} /></label>
          <label className={labelCls}><span className="font-medium text-on-surface">Phone</span>
            <input type="tel" className={inputCls} value={form.phone} onChange={set("phone")} placeholder="9307199040" /></label>
          <label className={labelCls}><span className="font-medium text-on-surface">Email</span>
            <input type="email" className={inputCls} value={form.email} onChange={set("email")} placeholder="company@example.com" /></label>
          <label className={`${labelCls} md:col-span-2`}><span className="font-medium text-on-surface">Website</span>
            <input type="url" className={inputCls} value={form.website} onChange={set("website")} placeholder="https://yoursite.com" /></label>
          <label className={`${labelCls} md:col-span-2`}><span className="font-medium text-on-surface">Social Proof / Achievement</span>
            <input className={inputCls} value={form.socialProof} onChange={set("socialProof")} placeholder="e.g. 75,800+ farmers trust Power Plus" maxLength={120} /></label>
          <label className={`${labelCls} md:col-span-2`}><span className="font-medium text-on-surface">About</span>
            <textarea rows={4} className={`${inputCls} resize-none`} value={form.about} onChange={set("about")}
              placeholder="Tell farmers about your company, mission, and what makes your products special..." /></label>
        </div>
      </div>

      {/* Social Links */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Social Links</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {([
            { key: "instagram" as const, label: "Instagram", placeholder: "instagram.com/yourpage" },
            { key: "facebook" as const, label: "Facebook", placeholder: "facebook.com/yourpage" },
            { key: "whatsapp" as const, label: "WhatsApp", placeholder: "+919307199040" },
            { key: "youtube" as const, label: "YouTube", placeholder: "youtube.com/@channel" },
          ]).map(({ key, label, placeholder }) => (
            <label key={key} className={labelCls}><span className="font-medium text-on-surface">{label}</span>
              <input className={inputCls} value={form[key]} onChange={set(key)} placeholder={placeholder} /></label>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Certifications</h4>
        <div className="flex flex-wrap gap-2">
          {certs.map(c => (
            <span key={c} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
              <Tag className="w-2.5 h-2.5" /> {c}
              <button type="button" onClick={() => setCerts(p => p.filter(x => x !== c))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={form.certInput}
            onChange={e => setForm(p => ({ ...p, certInput: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = form.certInput.trim(); if (v && !certs.includes(v)) { setCerts(p => [...p, v]); setForm(p => ({ ...p, certInput: "" })); } } }}
            placeholder="e.g. ISO 9001 — press Enter to add" />
          <button type="button"
            onClick={() => { const v = form.certInput.trim(); if (v && !certs.includes(v)) { setCerts(p => [...p, v]); setForm(p => ({ ...p, certInput: "" })); } }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Brand Colors */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Brand Colors</h4>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="color" value={form.primaryColor} onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30" />
            <div><p className="text-sm font-medium text-on-surface">Primary</p><p className="text-xs text-on-surface-variant">{form.primaryColor}</p></div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="color" value={form.accentColor} onChange={e => setForm(p => ({ ...p, accentColor: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30" />
            <div><p className="text-sm font-medium text-on-surface">Accent</p><p className="text-xs text-on-surface-variant">{form.accentColor}</p></div>
          </label>
        </div>
      </div>

      <button type="button" onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Brand Info"}
      </button>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ ownerPhone }: { ownerPhone?: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!ownerPhone) { setProducts([]); return; }
    setLoading(true);
    fetchUserProfileByPhone(ownerPhone)
      .then(async (profile) => {
        const uid = profile?.uid;
        if (!uid) { setProducts([]); return; }
        const prods = await fetchManufacturerProducts(uid).catch(() => []);
        setProducts(prods);
      })
      .catch(() => setStatus({ type: "err", msg: "Could not load products." }))
      .finally(() => setLoading(false));
  }, [ownerPhone]);

  return (
    <div className="space-y-4">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <Package className="w-4 h-4 shrink-0 text-blue-600" />
        <span>Products are fetched live from the manufacturer&apos;s inventory. Always up to date.</span>
      </div>
      {!ownerPhone ? (
        <p className="text-sm text-center text-on-surface-variant py-8">Assign an owner to this company page to see their products.</p>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-2">
          <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No products found in inventory.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {products.map((p: any) => (
            <div key={p.id} className="flex items-center gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3.5">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-container shrink-0">
                {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-on-surface-variant/30" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{p.name}</p>
                <p className="text-xs text-on-surface-variant">{p.category} · ₹{p.price}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${(p.stock ?? "In Stock") === "In Stock" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{p.stock ?? "In Stock"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Stores Tab ───────────────────────────────────────────────────────────────

function StoresTab({ ownerPhone }: { ownerPhone?: string }) {
  const [stores, setStores] = useState<RetailerNetworkStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!ownerPhone) { setStores([]); return; }
    setLoading(true);
    fetchManufacturerNetworkStores(ownerPhone)
      .then(setStores)
      .catch(() => setStatus({ type: "err", msg: "Could not load retailer network." }))
      .finally(() => setLoading(false));
  }, [ownerPhone]);

  return (
    <div className="space-y-4">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <Store className="w-4 h-4 shrink-0 text-blue-600" />
        <span>Stores are fetched live from the manufacturer&apos;s retailer network. No duplication — always up to date.</span>
      </div>
      {!ownerPhone ? (
        <p className="text-sm text-center text-on-surface-variant py-8">Assign an owner to this company page to see their retailer network.</p>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-2">
          <Store className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No retailers found in network.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {stores.map(s => (
            <div key={s.id} className="flex items-center gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{s.name}</p>
                <p className="text-xs text-on-surface-variant flex items-center gap-1 truncate"><MapPin className="w-2.5 h-2.5 shrink-0" /> {s.address}</p>
              </div>
              {s.storePhone && <p className="text-xs text-on-surface-variant shrink-0">{s.storePhone}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Videos Tab ───────────────────────────────────────────────────────────────

function VideosTab({ companyId, initialVideos, onSaved }: {
  companyId: string; initialVideos: string[]; onSaved: (v: string[]) => void;
}) {
  const [videos, setVideos] = useState<string[]>(initialVideos);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const addVideo = () => {
    const id = extractYouTubeId(input);
    if (!id) { setError("Couldn't parse a YouTube ID. Paste the full URL or 11-character ID."); return; }
    if (videos.includes(id)) { setError("Already added."); return; }
    setVideos(p => [...p, id]); setInput(""); setError(null);
  };

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try { await saveCompanyPage(companyId, { videos }); setStatus({ type: "ok", msg: "Videos saved." }); onSaved(videos); }
    catch (err) { setStatus({ type: "err", msg: err instanceof Error ? err.message : "Save failed." }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Add YouTube Video</h4>
        <p className="text-xs text-on-surface-variant">Paste a YouTube URL or 11-character video ID. Videos show as vertical Shorts cards on the brand page.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input className={`${inputCls} pl-10`} value={input}
              onChange={e => { setInput(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
              placeholder="https://youtu.be/dmCafHKBuIY or dmCafHKBuIY" />
          </div>
          <button type="button" onClick={addVideo} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:opacity-90 shrink-0"><Plus className="w-4 h-4" /> Add</button>
        </div>
        {error && <p className="text-xs text-red-600">✗ {error}</p>}
      </div>
      {videos.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{videos.length} video{videos.length !== 1 ? "s" : ""}</p>
          <div className="flex flex-wrap gap-3">
            {videos.map(id => (
              <div key={id} className="relative rounded-2xl overflow-hidden bg-black shrink-0 border border-outline-variant/30" style={{ width: 110, aspectRatio: "9/16" }}>
                <img src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-70" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <Youtube className="w-7 h-7 text-white drop-shadow" />
                  <p className="text-[9px] text-white/80 font-mono text-center px-1">{id}</p>
                </div>
                <button type="button" onClick={() => setVideos(p => p.filter(v => v !== id))}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Videos"}
        </button>
      )}
    </div>
  );
}

// ─── Owner Tab ────────────────────────────────────────────────────────────────

function OwnerTab({ company, onRefresh }: { company: CompanyPageDoc; onRefresh: () => void }) {
  const [phoneInput, setPhoneInput] = useState(company.ownerPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [seeding, setSeeding] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    fetchAllUsers().then(u => setUsers(u.filter(x => x.role === "manufacturer" || x.role === "retailer"))).catch(() => {});
  }, []);

  const handleAssign = async () => {
    setSaving(true); setStatus(null);
    try {
      const phone = phoneInput.trim();
      if (!phone && company.ownerPhone) await removeCompanyOwner(company.id, company.ownerPhone);
      else if (phone) await assignCompanyOwner(company.id, phone);
      setStatus({ type: "ok", msg: phone ? `Assigned to ${phone}` : "Ownership removed." });
      onRefresh();
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Failed." });
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async (docId: string) => {
    setSeeding(true); setStatus(null);
    try { await adminAutoSeedCompanyPage(docId); setStatus({ type: "ok", msg: "Brand page seeded for this user." }); onRefresh(); }
    catch (err) { setStatus({ type: "err", msg: err instanceof Error ? err.message : "Seed failed." }); }
    finally { setSeeding(false); }
  };

  const filteredUsers = users.filter(u =>
    !userSearch || [u.name, u.email, u.phone, u.id].join(" ").toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Assign Owner by Phone</h4>
        <p className="text-xs text-on-surface-variant">Enter the mobile number matching their KrishiDukan account. This links the company page to their dashboard.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant" />
            <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
              placeholder="9307199040 or +919307199040"
              className={`${inputCls} pl-9`} />
          </div>
          <button type="button" onClick={handleAssign} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 shrink-0">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {phoneInput.trim() ? "Assign" : "Remove"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Seed Company Page from User</h4>
        <p className="text-xs text-on-surface-variant">Pick a manufacturer/retailer user and auto-create their company page with basic info from their profile.</p>
        <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)}
          placeholder="Search manufacturer/retailer…" className={inputCls} />
        <div className="max-h-48 overflow-y-auto rounded-xl border border-outline-variant/30 bg-white">
          {filteredUsers.slice(0, 15).map(u => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-outline-variant/10 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{u.name || "—"}</p>
                <p className="text-xs text-on-surface-variant truncate">{u.email || u.id}</p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0">{u.role}</span>
              <button type="button" onClick={() => handleSeed(u.id)} disabled={seeding}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 disabled:opacity-50 shrink-0">
                {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Seed
              </button>
            </div>
          ))}
          {filteredUsers.length === 0 && <p className="text-xs text-center text-on-surface-variant py-4">No users found.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Company Edit Drawer ──────────────────────────────────────────────────────

type DrawerTab = "brand" | "products" | "stores" | "videos" | "owner";

function CompanyEditDrawer({ company, onClose, onRefresh }: {
  company: CompanyPageDoc; onClose: () => void; onRefresh: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("brand");
  const [localCompany, setLocalCompany] = useState<CompanyPageDoc>(company);

  const tabs: { key: DrawerTab; label: string; icon: typeof Building2 }[] = [
    { key: "brand", label: "Brand", icon: Building2 },
    { key: "products", label: "Products", icon: Package },
    { key: "stores", label: "Stores", icon: Store },
    { key: "videos", label: "Videos", icon: Video },
    { key: "owner", label: "Owner", icon: Users },
  ];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0"
          style={{ background: localCompany.primaryColor || "#154212" }}>
          <div>
            <h2 className="text-base font-bold text-white">{localCompany.name}</h2>
            <p className="text-xs text-white/60 mt-0.5">{localCompany.location}</p>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-outline-variant/30 px-3 py-2 shrink-0 bg-surface-container-lowest overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${tab === key ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "brand" && (
            <BrandTab company={localCompany} ownerPhone={localCompany.ownerPhone}
              onSaved={d => setLocalCompany(p => ({ ...p, ...d }))} />
          )}
          {tab === "products" && <ProductsTab ownerPhone={localCompany.ownerPhone} />}
          {tab === "stores" && <StoresTab ownerPhone={localCompany.ownerPhone} />}
          {tab === "videos" && (
            <VideosTab companyId={localCompany.id} initialVideos={localCompany.videos ?? []}
              onSaved={videos => setLocalCompany(p => ({ ...p, videos }))} />
          )}
          {tab === "owner" && <OwnerTab company={localCompany} onRefresh={() => { onRefresh(); }} />}
        </div>
      </div>
    </>
  );
}

// ─── Company Row ──────────────────────────────────────────────────────────────

function CompanyRow({ company, onRefresh }: { company: CompanyPageDoc; onRefresh: () => void }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
            style={{ background: company.primaryColor || "#154212" }}>
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-on-surface text-sm">{company.name}</p>
            <p className="text-xs text-on-surface-variant truncate">{company.location || "—"}</p>
          </div>
          {company.ownerPhone ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-[11px] font-bold shrink-0">
              <Phone className="w-3 h-3" /> {company.ownerPhone}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-semibold shrink-0">No owner</span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <a href={`/?view=brand&manufacturer=${encodeURIComponent(company.id)}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-outline-variant/40 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors">
              <LinkIcon className="w-3 h-3" /> Preview
            </a>
            <button type="button" onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 transition-colors">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        </div>
        {/* Stats bar */}
        <div className="grid grid-cols-4 border-t border-outline-variant/10 divide-x divide-outline-variant/10">
          {[
            { label: "Products", value: (company as any).productIds?.length ?? "—" },
            { label: "Stores", value: (company as any).storeIds?.length ?? "—" },
            { label: "Videos", value: company.videos?.length ?? 0 },
            { label: "Certs", value: company.certifications?.length ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-2 text-center">
              <p className="text-sm font-bold text-on-surface">{value}</p>
              <p className="text-[10px] text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {editOpen && (
        <CompanyEditDrawer company={company} onClose={() => setEditOpen(false)} onRefresh={() => { setEditOpen(false); onRefresh(); }} />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyPageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [bulkSeeding, setBulkSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allConstantIds = Object.keys(MANUFACTURERS);
  const seededIds = new Set(companies.map(c => c.id));
  const unseededIds = allConstantIds.filter(id => !seededIds.has(id));

  const load = () => {
    setLoading(true); setError(null);
    fetchAllCompanyPages().then(setCompanies).catch(err => setError(err.message ?? "Failed to load.")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSeedAll = async () => {
    setSeeding(true); setSeedStatus(null);
    try { for (const id of unseededIds) await seedCompanyFromConstants(id); setSeedStatus(`✓ Seeded ${unseededIds.length} company page(s).`); load(); }
    catch (err) { setSeedStatus(`✗ ${err instanceof Error ? err.message : "Seed failed."}`); }
    finally { setSeeding(false); }
  };

  const handleBulkSeedFromUsers = async () => {
    setBulkSeeding(true); setSeedStatus(null);
    try {
      const users = await fetchAllUsers();
      const manufacturers = users.filter((u: any) => u.role === "manufacturer");
      let created = 0;
      for (const u of manufacturers) {
        const phone = u.phone || u.uid;
        if (phone && !seededIds.has(phone)) {
          await adminAutoSeedCompanyPage(phone);
          created++;
        }
      }
      setSeedStatus(`✓ Created ${created} company page(s) from manufacturer accounts.`);
      load();
    } catch (err) {
      setSeedStatus(`✗ ${err instanceof Error ? err.message : "Bulk seed failed."}`);
    } finally {
      setBulkSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl"
        style={{ background: "linear-gradient(135deg, #1a5c14 0%, #154212 40%, #0d2e08 100%)" }}
      >
        {/* Dot texture */}
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* Glow blobs */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #4ade80, transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-10 left-1/4 h-40 w-40 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #86efac, transparent 70%)" }} />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 shadow-inner"
            style={{ background: "rgba(255,255,255,0.12)" }}>
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-300/80 mb-0.5">Admin Panel</p>
            <h1 className="text-2xl font-black tracking-tight">Company Pages</h1>
            <p className="mt-0.5 text-sm text-white/60">Edit brand content, products, stores, videos, and owner assignment.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl border border-white/15 px-4 py-2.5 text-center min-w-[64px]"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              <p className="text-2xl font-black leading-none">{companies.length}</p>
              <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mt-1">Pages</p>
            </div>
            <div className="rounded-xl border border-white/15 px-4 py-2.5 text-center min-w-[64px]"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              <p className="text-2xl font-black leading-none">{unseededIds.length}</p>
              <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mt-1">Unseeded</p>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="relative mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/20 px-4 py-2 text-xs font-bold text-white/80 hover:bg-white/10 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={handleBulkSeedFromUsers} disabled={bulkSeeding || loading}
            className="flex items-center gap-1.5 rounded-xl border border-green-400/40 bg-green-500/20 px-4 py-2 text-xs font-bold text-green-200 hover:bg-green-500/30 transition-colors disabled:opacity-50">
            {bulkSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            {bulkSeeding ? "Creating…" : "Seed from Manufacturer Accounts"}
          </button>
          {unseededIds.length > 0 && (
            <button type="button" onClick={handleSeedAll} disabled={seeding}
              className="flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/30 transition-colors disabled:opacity-50">
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {seeding ? "Seeding…" : `Seed ${unseededIds.length} Constant Page${unseededIds.length > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>

      {seedStatus && (
        <p className={`text-xs font-medium rounded-xl px-4 py-2.5 border ${seedStatus.startsWith("✓") ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>{seedStatus}</p>
      )}

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading company pages…
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-16 text-center space-y-3">
          <Building2 className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No company pages in Firestore yet.</p>
          <p className="text-sm text-on-surface-variant">Click <strong>Seed from Manufacturer Accounts</strong> in the header to auto-create pages for all existing manufacturer users, or use <strong>Seed Constant Pages</strong> for the built-in brands.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map(c => <CompanyRow key={c.id} company={c} onRefresh={load} />)}
        </div>
      )}
    </div>
  );
}
