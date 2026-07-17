"use client";

import { useEffect, useState } from "react";
import {
  Building2, Phone, RefreshCw, X,
  Loader2, Package, Store,
  LinkIcon, Save, Tag, Mail, Youtube,
  MapPin, Search, ExternalLink, Plus,
  Info,
} from "lucide-react";
import {
  fetchAllUsers,
  fetchManufacturerProducts,
  fetchManufacturerNetworkStores,
  type RetailerNetworkStore,
} from "../../firebase";
import {
  fetchBrandPageCustomization,
  saveBrandPageCustomization,
  fetchManufacturerProfile,
} from "../../dashboard/_lib/brand-page-firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

type ManufacturerEntry = {
  phone: string;
  businessName: string;
  ownerName: string;
  email: string;
  city: string;
  state: string;
  uid?: string;
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 placeholder:text-on-surface-variant/50";
const labelCls = "flex flex-col gap-1.5 text-sm";
type Status = { type: "ok" | "err"; msg: string } | null;

function StatusBanner({ status, onDismiss }: { status: Status; onDismiss: () => void }) {
  if (!status) return null;
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm font-medium border ${
        status.type === "ok"
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-700"
      }`}
    >
      <span>{status.type === "ok" ? "✓ " : "✗ "}{status.msg}</span>
      <button type="button" onClick={onDismiss}><X className="w-4 h-4" /></button>
    </div>
  );
}

function extractYouTubeId(input: string): string | null {
  const t = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

// ─── Brand Tab ────────────────────────────────────────────────────────────────
// Reads:  manufacturers/{phone}  (read-only profile info)
//         brandPages/{phone}     (editable brand customization)
// Writes: brandPages/{phone}     ONLY — no companyPages writes

function BrandTab({ manufacturer }: { manufacturer: ManufacturerEntry }) {
  const { phone } = manufacturer;
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    tagline: "", about: "", establishedYear: "", website: "",
    socialProof: "", primaryColor: "#154212", accentColor: "#f57c00",
    logo: "", banner: "",
    instagram: "", facebook: "", whatsapp: "", youtube: "",
    certInput: "",
  });
  const [certifications, setCertifications] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [videoInput, setVideoInput] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchManufacturerProfile(phone),
      fetchBrandPageCustomization(phone),
    ])
      .then(([mfrDoc, bp]) => {
        setProfile(mfrDoc);
        if (bp) {
          setForm(prev => ({
            ...prev,
            tagline: bp.tagline ?? "",
            about: bp.about ?? "",
            establishedYear: bp.establishedYear ?? "",
            website: bp.website ?? "",
            socialProof: bp.socialProof ?? "",
            primaryColor: bp.primaryColor ?? "#154212",
            accentColor: bp.accentColor ?? "#f57c00",
            logo: bp.logo ?? "",
            banner: bp.banner ?? "",
            instagram: bp.socialLinks?.instagram ?? "",
            facebook: bp.socialLinks?.facebook ?? "",
            whatsapp: bp.socialLinks?.whatsapp ?? "",
            youtube: bp.socialLinks?.youtube ?? "",
          }));
          if (bp.certifications) setCertifications(bp.certifications);
          if (bp.videos) setVideos(bp.videos);
        }
      })
      .finally(() => setLoading(false));
  }, [phone]);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  const addCert = () => {
    const v = form.certInput.trim();
    if (v && !certifications.includes(v)) {
      setCertifications(p => [...p, v]);
      setForm(p => ({ ...p, certInput: "" }));
    }
  };

  const addVideo = () => {
    const id = extractYouTubeId(videoInput);
    if (!id) { setVideoError("Couldn't parse a YouTube ID. Paste the full URL or 11-character ID."); return; }
    if (videos.includes(id)) { setVideoError("Already added."); return; }
    setVideos(p => [...p, id]);
    setVideoInput("");
    setVideoError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const socialLinksRaw = {
        instagram: form.instagram.trim(),
        facebook: form.facebook.trim(),
        whatsapp: form.whatsapp.trim(),
        youtube: form.youtube.trim(),
      };
      const socialLinks = Object.fromEntries(
        Object.entries(socialLinksRaw).filter(([, v]) => v),
      ) as typeof socialLinksRaw;
      await saveBrandPageCustomization(phone, {
        tagline: form.tagline.trim(),
        about: form.about.trim(),
        establishedYear: form.establishedYear.trim(),
        website: form.website.trim(),
        socialProof: form.socialProof.trim(),
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        logo: form.logo.trim(),
        banner: form.banner.trim(),
        certifications,
        videos,
        socialLinks,
      });
      setStatus({ type: "ok", msg: "Brand page saved." });
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading brand page…
      </div>
    );
  }

  const addr = profile?.address as Record<string, string> | undefined;
  const cityState = [addr?.city || manufacturer.city, addr?.state || manufacturer.state]
    .filter(Boolean).join(", ");
  const slug = profile?.slug ? String(profile.slug) : null;

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* Read-only profile summary */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">
          Profile Data — manufacturers/{phone}
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm text-on-surface-variant">
          <span className="flex items-center gap-1.5 truncate">
            <Building2 className="w-3.5 h-3.5 shrink-0" /> {manufacturer.businessName || "—"}
          </span>
          <span className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 shrink-0" /> {phone}
          </span>
          <span className="flex items-center gap-1.5 truncate">
            <Mail className="w-3.5 h-3.5 shrink-0" /> {manufacturer.email || profile?.email || "—"}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" /> {cityState || "—"}
          </span>
        </div>
        {slug && (
          <a
            href={`/brand/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> /brand/{slug}
          </a>
        )}
        <p className="text-[10px] text-on-surface-variant/60 mt-1">
          Business name, contact info, logo, and banner are set via the manufacturer&apos;s Profile settings. Brand story fields below are editable here.
        </p>
      </div>

      {/* Brand Story */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Brand Story</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">Tagline</span>
            <input className={inputCls} value={form.tagline} onChange={set("tagline")} maxLength={120} placeholder="Short brand tagline" />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">About</span>
            <textarea rows={4} className={`${inputCls} resize-none`} value={form.about} onChange={set("about")}
              placeholder="Tell farmers about this company, mission, and what makes their products special…" />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Founded Year</span>
            <input className={inputCls} value={form.establishedYear} onChange={set("establishedYear")} maxLength={4} placeholder="e.g. 2019" />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Website</span>
            <input type="url" className={inputCls} value={form.website} onChange={set("website")} placeholder="https://yoursite.com" />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">Social Proof</span>
            <input className={inputCls} value={form.socialProof} onChange={set("socialProof")} maxLength={120}
              placeholder="e.g. 75,800+ farmers trust this brand" />
          </label>
        </div>
      </div>

      {/* Brand Images */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Brand Images</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Logo URL</span>
            <input className={inputCls} value={form.logo} onChange={set("logo")} placeholder="https://…/logo.png" />
            {form.logo && (
              <img src={form.logo} alt="Logo preview" className="mt-1 h-12 w-auto object-contain rounded-lg border border-outline-variant/20" />
            )}
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Banner URL</span>
            <input className={inputCls} value={form.banner} onChange={set("banner")} placeholder="https://…/banner.jpg" />
            {form.banner && (
              <img src={form.banner} alt="Banner preview" className="mt-1 h-12 w-auto object-cover rounded-lg border border-outline-variant/20" />
            )}
          </label>
        </div>
      </div>

      {/* Social Links */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Social Links</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              { key: "instagram" as const, label: "Instagram", placeholder: "instagram.com/yourpage" },
              { key: "facebook" as const, label: "Facebook", placeholder: "facebook.com/yourpage" },
              { key: "whatsapp" as const, label: "WhatsApp", placeholder: "+919307199040" },
              { key: "youtube" as const, label: "YouTube Channel", placeholder: "youtube.com/@channel" },
            ] as const
          ).map(({ key, label, placeholder }) => (
            <label key={key} className={labelCls}>
              <span className="font-medium text-on-surface">{label}</span>
              <input className={inputCls} value={form[key]} onChange={set(key)} placeholder={placeholder} />
            </label>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Certifications</h4>
        <div className="flex flex-wrap gap-2">
          {certifications.map(c => (
            <span key={c} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
              <Tag className="w-2.5 h-2.5" /> {c}
              <button type="button" onClick={() => setCertifications(p => p.filter(x => x !== c))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            value={form.certInput}
            onChange={e => setForm(p => ({ ...p, certInput: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
            placeholder="e.g. ISO 9001 — press Enter to add"
          />
          <button type="button" onClick={addCert}
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
            <input type="color" value={form.primaryColor}
              onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30" />
            <div>
              <p className="text-sm font-medium text-on-surface">Primary</p>
              <p className="text-xs text-on-surface-variant">{form.primaryColor}</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="color" value={form.accentColor}
              onChange={e => setForm(p => ({ ...p, accentColor: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30" />
            <div>
              <p className="text-sm font-medium text-on-surface">Accent</p>
              <p className="text-xs text-on-surface-variant">{form.accentColor}</p>
            </div>
          </label>
        </div>
      </div>

      {/* YouTube Videos */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-primary mb-1">YouTube Videos</h4>
          <p className="text-xs text-on-surface-variant">Paste a YouTube URL or 11-character video ID. Shown as vertical Shorts cards on the brand page.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input
              className={`${inputCls} pl-10`}
              value={videoInput}
              onChange={e => { setVideoInput(e.target.value); setVideoError(null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
              placeholder="https://youtu.be/dmCafHKBuIY or dmCafHKBuIY"
            />
          </div>
          <button type="button" onClick={addVideo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:opacity-90 shrink-0">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {videoError && <p className="text-xs text-red-600">✗ {videoError}</p>}
        {videos.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {videos.map(id => (
              <div key={id} className="relative rounded-2xl overflow-hidden bg-black shrink-0 border border-outline-variant/30"
                style={{ width: 110, aspectRatio: "9/16" }}>
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
        )}
      </div>

      <button type="button" onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Brand Page"}
      </button>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────
// Live from the products collection — same data the manufacturer sees

function ProductsTab({ manufacturer }: { manufacturer: ManufacturerEntry }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!manufacturer.uid) { setProducts([]); return; }
    setLoading(true);
    fetchManufacturerProducts(manufacturer.uid)
      .then(setProducts)
      .catch(() => setStatus({ type: "err", msg: "Could not load products." }))
      .finally(() => setLoading(false));
  }, [manufacturer.uid]);

  return (
    <div className="space-y-4">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0 text-blue-600" />
        <span>Products are fetched live from the manufacturer&apos;s inventory. Always up to date.</span>
      </div>
      {!manufacturer.uid ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-10 text-center space-y-2">
          <Package className="w-8 h-8 text-on-surface-variant/30 mx-auto" />
          <p className="text-sm font-semibold text-on-surface-variant">No UID on file — manufacturer may not have signed in yet.</p>
        </div>
      ) : loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
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
                {p.image
                  ? <img src={p.image} alt={p.name} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-on-surface-variant/30" />
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{p.name}</p>
                <p className="text-xs text-on-surface-variant">{p.category} · ₹{p.price}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                (p.stock ?? "In Stock") === "In Stock" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
              }`}>
                {p.stock ?? "In Stock"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stores Tab ───────────────────────────────────────────────────────────────
// Live from manufacturers/{phone}/retailers subcollection

function StoresTab({ manufacturer }: { manufacturer: ManufacturerEntry }) {
  const [stores, setStores] = useState<RetailerNetworkStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    setLoading(true);
    fetchManufacturerNetworkStores(manufacturer.phone)
      .then(setStores)
      .catch(() => setStatus({ type: "err", msg: "Could not load retailer network." }))
      .finally(() => setLoading(false));
  }, [manufacturer.phone]);

  return (
    <div className="space-y-4">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0 text-blue-600" />
        <span>Stores are fetched live from the manufacturer&apos;s retailer network. No duplication — always up to date.</span>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
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
                <p className="text-xs text-on-surface-variant flex items-center gap-1 truncate">
                  <MapPin className="w-2.5 h-2.5 shrink-0" /> {s.address}
                </p>
              </div>
              {s.storePhone && <p className="text-xs text-on-surface-variant shrink-0">{s.storePhone}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Drawer ──────────────────────────────────────────────────────────────

type DrawerTab = "brand" | "products" | "stores";

function ManufacturerEditDrawer({
  manufacturer,
  onClose,
}: {
  manufacturer: ManufacturerEntry;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("brand");

  const tabs: { key: DrawerTab; label: string; icon: typeof Building2 }[] = [
    { key: "brand", label: "Brand", icon: Building2 },
    { key: "products", label: "Products", icon: Package },
    { key: "stores", label: "Stores", icon: Store },
  ];

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-16 z-50 flex h-[calc(100dvh-64px)] w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-w-2xl">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0"
          style={{ background: "#154212" }}
        >
          <div>
            <h2 className="text-base font-bold text-white">
              {manufacturer.businessName || manufacturer.phone}
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              {[manufacturer.city, manufacturer.state].filter(Boolean).join(", ") || manufacturer.phone}
            </p>
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                tab === key ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
          <a
            href={`/?view=brand&manufacturer=${encodeURIComponent(manufacturer.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 ml-auto px-3 py-1.5 rounded-xl border border-outline-variant/40 text-xs text-on-surface-variant hover:bg-surface-container transition-colors shrink-0"
          >
            <LinkIcon className="w-3 h-3" /> Preview
          </a>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {tab === "brand" && <BrandTab manufacturer={manufacturer} />}
          {tab === "products" && <ProductsTab manufacturer={manufacturer} />}
          {tab === "stores" && <StoresTab manufacturer={manufacturer} />}
        </div>
      </div>
    </>
  );
}

// ─── Manufacturer Row ─────────────────────────────────────────────────────────

function ManufacturerRow({ entry }: { entry: ManufacturerEntry }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shrink-0 flex items-center justify-center bg-primary">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-on-surface text-sm truncate">{entry.businessName || "—"}</p>
              <p className="text-[11px] sm:text-xs text-on-surface-variant truncate">
                {[entry.city, entry.state].filter(Boolean).join(", ") || entry.phone}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold">
              <Phone className="w-2.5 h-2.5" /> {entry.phone}
            </span>
            <a
              href={`/?view=brand&manufacturer=${encodeURIComponent(entry.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-xl border border-outline-variant/40 text-[11px] sm:text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              <LinkIcon className="w-3 h-3" /> <span className="hidden sm:inline">Preview</span>
            </a>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 sm:py-1.5 rounded-xl bg-primary text-white text-[11px] sm:text-xs font-bold hover:opacity-90 transition-colors"
            >
              <Building2 className="w-3 h-3" /> Edit Page
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="grid grid-cols-2 border-t border-outline-variant/10 divide-x divide-y divide-outline-variant/10 sm:grid-cols-4 sm:divide-y-0">
          {[
            { label: "Products", value: "live" },
            { label: "Stores", value: "live" },
            { label: "Email", value: entry.email || "—" },
            { label: "Owner", value: entry.ownerName || "—" },
          ].map(({ label, value }) => (
            <div key={label} className="px-2 sm:px-4 py-1.5 sm:py-2 text-center">
              <p className="text-xs sm:text-sm font-bold text-on-surface truncate">{value}</p>
              <p className="text-[9px] sm:text-[10px] text-on-surface-variant">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {editOpen && (
        <ManufacturerEditDrawer manufacturer={entry} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCompaniesPage() {
  const [manufacturers, setManufacturers] = useState<ManufacturerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "name" | "phone">("all");

  const filteredManufacturers = manufacturers.filter(m => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch =
      m.businessName?.toLowerCase().includes(q) || m.ownerName?.toLowerCase().includes(q);
    const phoneMatch = m.phone?.toLowerCase().includes(q);
    if (searchType === "name") return nameMatch;
    if (searchType === "phone") return phoneMatch;
    return nameMatch || phoneMatch;
  });

  const load = () => {
    setLoading(true);
    setError(null);
    fetchAllUsers()
      .then(users => {
        const mfrs: ManufacturerEntry[] = (users as any[])
          .filter(u => u.role === "manufacturer")
          .map(u => ({
            phone: u.id,
            businessName: u.businessName || u.shopName || u.name || "",
            ownerName: u.ownerName || u.name || "",
            email: u.email || "",
            city: u.city || (u.address as any)?.city || "",
            state: u.state || (u.address as any)?.state || "",
            uid: u.uid || undefined,
          }));
        setManufacturers(mfrs);
      })
      .catch(err => setError((err as Error).message ?? "Failed to load."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl"
        style={{ background: "linear-gradient(135deg, #1a5c14 0%, #154212 40%, #0d2e08 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #4ade80, transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-10 left-1/4 h-40 w-40 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #86efac, transparent 70%)" }} />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div
            className="flex h-10 w-10 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border border-white/20 shadow-inner"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            <Building2 className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-green-300/80 mb-0.5">
              Admin Panel
            </p>
            <h1 className="text-lg sm:text-2xl font-black tracking-tight">Company Pages</h1>
            <p className="mt-0.5 text-xs sm:text-sm text-white/60 hidden sm:block">
              View and edit manufacturer brand pages. All data sourced live — no duplicate collections.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0 items-start sm:items-center">
            <div
              className="rounded-xl border border-white/15 px-3 sm:px-4 py-2 sm:py-2.5 text-center min-w-[64px]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <p className="text-lg sm:text-2xl font-black leading-none">{manufacturers.length}</p>
              <p className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-widest mt-1">
                Manufacturers
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-white/20 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-white/80 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Data source legend */}
        <div
          className="relative mt-4 rounded-xl border border-white/15 px-4 py-2.5 text-xs text-white/70"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          Brand info → <code className="font-mono text-white/90">brandPages/&#123;phone&#125;</code> &nbsp;·&nbsp;
          Profile → <code className="font-mono text-white/90">manufacturers/&#123;phone&#125;</code> &nbsp;·&nbsp;
          Products &amp; stores always live from source collections.
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Search & Filter */}
      {manufacturers.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3 items-center bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
            <input
              type="text"
              placeholder={
                searchType === "name"
                  ? "Search by business name…"
                  : searchType === "phone"
                  ? "Search by phone…"
                  : "Search by name or phone…"
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/40 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <select
            value={searchType}
            onChange={e => setSearchType(e.target.value as "all" | "name" | "phone")}
            className="w-full md:w-48 shrink-0 px-4 py-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low text-sm font-semibold focus:border-primary focus:outline-none transition-all cursor-pointer"
          >
            <option value="all">All Fields</option>
            <option value="name">Business Name</option>
            <option value="phone">Phone Number</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading manufacturer accounts…
        </div>
      ) : manufacturers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-16 text-center space-y-3">
          <Building2 className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No manufacturer accounts found.</p>
          <p className="text-sm text-on-surface-variant">
            Manufacturers are users with <code className="font-mono text-xs">role=&quot;manufacturer&quot;</code> in the users collection.
          </p>
        </div>
      ) : filteredManufacturers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-12 text-center space-y-2">
          <Search className="w-8 h-8 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No results found</p>
          <p className="text-xs text-on-surface-variant/70">Try adjusting your keywords or search filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredManufacturers.map(m => (
            <ManufacturerRow key={m.phone} entry={m} />
          ))}
        </div>
      )}
    </div>
  );
}
