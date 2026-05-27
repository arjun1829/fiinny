"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Loader2, Building2, Package, Store,
  Plus, Save, X, Check,
  Phone, Mail, Youtube, MapPin,
  Image as ImageIcon, ExternalLink,
  Tag, Info,
} from "lucide-react";
import {
  auth, getUserProfile,
  fetchManufacturerProducts, fetchManufacturerNetworkStores,
  type RetailerNetworkStore,
} from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  fetchBrandPageCustomization,
  saveBrandPageCustomization,
  fetchManufacturerProfile,
} from "../_lib/brand-page-firestore";
import type { BrandPageCustomization } from "../_lib/brand-page-types";
import { resolveManufacturerDocId } from "../_lib/profile-persistence";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 placeholder:text-on-surface-variant/50";

const labelCls = "flex flex-col gap-1.5 text-sm";

type Status = { type: "ok" | "err"; msg: string } | null;
type Tab = "brand" | "products" | "stores";

function StatusBanner({ status, onDismiss }: { status: Status; onDismiss: () => void }) {
  if (!status) return null;
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm font-medium border ${
      status.type === "ok"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-red-50 border-red-200 text-red-700"
    }`}>
      <span>{status.type === "ok" ? "✓ " : "✗ "}{status.msg}</span>
      <button type="button" onClick={onDismiss}><X className="w-4 h-4" /></button>
    </div>
  );
}

// ─── YouTube helpers ──────────────────────────────────────────────────────────

function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ─── Brand Customization Form ─────────────────────────────────────────────────

function CustomizationForm({
  manufacturerPhone,
  profileData,
  slug,
  initial,
  onSaved,
}: {
  manufacturerPhone: string;
  profileData: { businessName: string; phone: string; email: string; city: string; state: string };
  slug: string;
  initial: Partial<BrandPageCustomization>;
  onSaved: (updated: Partial<BrandPageCustomization>) => void;
}) {
  const [form, setForm] = useState({
    tagline: initial.tagline ?? "",
    about: initial.about ?? "",
    establishedYear: initial.establishedYear ?? "",
    website: initial.website ?? "",
    socialProof: initial.socialProof ?? "",
    primaryColor: initial.primaryColor ?? "#154212",
    accentColor: initial.accentColor ?? "#f57c00",
    logo: initial.logo ?? "",
    banner: initial.banner ?? "",
    certInput: "",
    videoInput: "",
  });
  const [certifications, setCertifications] = useState<string[]>(initial.certifications ?? []);
  const [videos, setVideos] = useState<string[]>(initial.videos ?? []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const addCert = () => {
    const v = form.certInput.trim();
    if (v && !certifications.includes(v)) {
      setCertifications((p) => [...p, v]);
      setForm((p) => ({ ...p, certInput: "" }));
    }
  };

  const addVideo = () => {
    const id = extractYouTubeId(form.videoInput);
    if (!id) { setVideoError("Couldn't parse YouTube video ID. Paste a full URL or the 11-character ID."); return; }
    if (videos.includes(id)) { setVideoError("Video already added."); return; }
    setVideos((p) => [...p, id]);
    setForm((p) => ({ ...p, videoInput: "" }));
    setVideoError(null);
  };

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try {
      const data: Partial<Omit<BrandPageCustomization, "createdAt" | "updatedAt">> = {
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
      };
      await saveBrandPageCustomization(manufacturerPhone, data);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      onSaved(data);
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <StatusBanner status={status?.type === "err" ? status : null} onDismiss={() => setStatus(null)} />

      {/* Read-only profile summary */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Profile Data (edit in Profile page)</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-on-surface-variant">
          <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {profileData.businessName || "—"}</span>
          <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {profileData.phone || "—"}</span>
          <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {profileData.email || "—"}</span>
          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {[profileData.city, profileData.state].filter(Boolean).join(", ") || "—"}</span>
        </div>
        {slug && (
          <a href={`/brand/${slug}`} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> /brand/{slug}
          </a>
        )}
      </div>

      {/* Brand Story */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Brand Story</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">Tagline</span>
            <input className={inputCls} value={form.tagline} onChange={set("tagline")} maxLength={120}
              placeholder="Short brand tagline farmers will remember" />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">About</span>
            <textarea rows={4} className={`${inputCls} resize-none`} value={form.about} onChange={set("about")}
              placeholder="Tell farmers about your company, mission, and what makes your products special..." />
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
            <span className="font-medium text-on-surface">Social Proof / Achievement</span>
            <input className={inputCls} value={form.socialProof} onChange={set("socialProof")} maxLength={120}
              placeholder="e.g. 75,800+ farmers trust Power Plus" />
          </label>
        </div>
      </div>

      {/* Images */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Brand Images</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className="font-medium text-on-surface flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Logo URL</span>
            <input className={inputCls} value={form.logo} onChange={set("logo")} placeholder="https://... or /images/logo.png" />
            {form.logo && (
              <img src={form.logo} alt="Logo preview" className="mt-1 h-12 w-auto object-contain rounded-lg border border-outline-variant/20" />
            )}
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Banner URL</span>
            <input className={inputCls} value={form.banner} onChange={set("banner")} placeholder="https://... or /images/banner.jpg" />
            {form.banner && (
              <img src={form.banner} alt="Banner preview" className="mt-1 h-12 w-auto object-cover rounded-lg border border-outline-variant/20" />
            )}
          </label>
        </div>
      </div>

      {/* Certifications */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Certifications & Badges</h3>
        <div className="flex flex-wrap gap-2">
          {certifications.map((c) => (
            <span key={c} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
              <Tag className="w-2.5 h-2.5" /> {c}
              <button type="button" onClick={() => setCertifications((p) => p.filter((x) => x !== c))} className="ml-0.5 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={form.certInput}
            onChange={(e) => setForm((p) => ({ ...p, certInput: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
            placeholder="e.g. ISO 9001:2015 — press Enter to add" />
          <button type="button" onClick={addCert}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Brand Colors */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Brand Colors</h3>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="color" value={form.primaryColor}
              onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30" />
            <div>
              <p className="text-sm font-medium text-on-surface">Primary Color</p>
              <p className="text-xs text-on-surface-variant">{form.primaryColor}</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="color" value={form.accentColor}
              onChange={(e) => setForm((p) => ({ ...p, accentColor: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border border-outline-variant/30" />
            <div>
              <p className="text-sm font-medium text-on-surface">Accent Color</p>
              <p className="text-xs text-on-surface-variant">{form.accentColor}</p>
            </div>
          </label>
        </div>
      </div>

      {/* Videos */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-1">YouTube Videos</h3>
          <p className="text-xs text-on-surface-variant">Paste a full YouTube URL or just the 11-character video ID.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input className={`${inputCls} pl-10`} value={form.videoInput}
              onChange={(e) => { setForm((p) => ({ ...p, videoInput: e.target.value })); setVideoError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
              placeholder="https://youtu.be/... or video ID" />
          </div>
          <button type="button" onClick={addVideo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:opacity-90 shrink-0">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {videoError && <p className="text-xs text-red-600">✗ {videoError}</p>}
        {videos.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {videos.map((id) => (
              <div key={id} className="relative rounded-2xl overflow-hidden bg-black shrink-0 border border-outline-variant/30"
                style={{ width: 100, aspectRatio: "9/16" }}>
                <img src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-70" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Youtube className="w-7 h-7 text-white drop-shadow" />
                </div>
                <button type="button" onClick={() => setVideos((p) => p.filter((v) => v !== id))}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-red-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Brand Page"}
        </button>
        {savedOk && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
            <Check className="w-4 h-4" /> Saved successfully
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Products Tab (read-only, live from inventory) ────────────────────────────

function ProductsTab({ uid }: { uid: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!uid) { setProducts([]); return; }
    setLoading(true);
    fetchManufacturerProducts(uid)
      .then(setProducts)
      .catch(() => setStatus({ type: "err", msg: "Could not load products." }))
      .finally(() => setLoading(false));
  }, [uid]);

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Products are pulled live from your inventory and shown on your brand page automatically.</p>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-3">
          <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No products in your inventory yet.</p>
          <p className="text-sm text-on-surface-variant">Add products from the Inventory section — they will appear on your brand page automatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div key={product.id}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">
                {(product.image || product.images?.[0]) ? (
                  <img src={product.image || product.images?.[0]} alt={product.name} className="w-full h-full object-contain" />
                ) : (
                  <Package className="w-6 h-6 text-on-surface-variant/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{product.name || product.fullName}</p>
                <p className="text-xs text-on-surface-variant capitalize">{product.category}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold text-primary">₹{product.price}</span>
                  {product.oldPrice && (
                    <span className="text-xs line-through text-on-surface-variant">₹{product.oldPrice}</span>
                  )}
                  {product.stock && (
                    <span className="text-[10px] bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full font-semibold">
                      {product.stock}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stores Tab (read-only, live from retailer network) ───────────────────────

function StoresTab({ userPhone }: { userPhone: string }) {
  const [stores, setStores] = useState<RetailerNetworkStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!userPhone) { setStores([]); return; }
    setLoading(true);
    fetchManufacturerNetworkStores(userPhone)
      .then(setStores)
      .catch(() => setStatus({ type: "err", msg: "Could not load retailer network." }))
      .finally(() => setLoading(false));
  }, [userPhone]);

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Stores are pulled live from your retailer network and shown as &quot;Where to Buy&quot; on your brand page.</p>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-3">
          <Store className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No retailers in your network yet.</p>
          <p className="text-sm text-on-surface-variant">Add retailers from the Retailer Network section — they will appear on your brand page automatically.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <div key={store.id}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
              <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{store.name}</p>
                <p className="text-xs text-on-surface-variant truncate">
                  <MapPin className="inline w-2.5 h-2.5 mr-0.5" />{store.address}
                </p>
                {store.storePhone && (
                  <p className="text-xs text-on-surface-variant">
                    <Phone className="inline w-2.5 h-2.5 mr-0.5" />{store.storePhone}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("brand");
  const [manufacturerPhone, setManufacturerPhone] = useState<string | null>(null);
  const [uid, setUid] = useState("");
  const [profileData, setProfileData] = useState<{
    businessName: string; phone: string; email: string; city: string; state: string;
  } | null>(null);
  const [slug, setSlug] = useState("");
  const [customization, setCustomization] = useState<Partial<BrandPageCustomization>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const profile = await getUserProfile(user.uid);
        if ((profile as any)?.role !== "manufacturer") {
          setError("Brand pages are only available for manufacturer accounts.");
          setLoading(false);
          return;
        }
        setUid(user.uid);

        // Resolve phone-based doc ID
        const phone = await resolveManufacturerDocId(user.uid);
        setManufacturerPhone(phone);

        // Parallel fetch: manufacturer profile + brand customization
        const [mfrDoc, custom] = await Promise.all([
          fetchManufacturerProfile(phone),
          fetchBrandPageCustomization(phone),
        ]);

        if (!mfrDoc) {
          setError("Manufacturer profile not found. Please complete your profile first.");
          setLoading(false);
          return;
        }

        const addr = (mfrDoc.address ?? {}) as Record<string, unknown>;
        setProfileData({
          businessName: String(mfrDoc.businessName ?? mfrDoc.ownerName ?? ""),
          phone: String(mfrDoc.phone ?? ""),
          email: String(mfrDoc.email ?? ""),
          city: String(addr.city ?? ""),
          state: String(addr.state ?? ""),
        });
        setSlug(String(mfrDoc.slug ?? ""));
        setCustomization(custom ?? {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load brand page data.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "brand", label: "Brand Info", icon: Building2 },
    { id: "products", label: "Products", icon: Package },
    { id: "stores", label: "Stores", icon: Store },
  ];

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading brand page…
      </div>
    );
  }

  if (error || !manufacturerPhone || !profileData) {
    return (
      <div className="p-8 space-y-4 max-w-lg">
        <div className="flex items-center gap-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <Info className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error ?? "Profile not found."}</p>
        </div>
        <p className="text-xs text-on-surface-variant">
          Complete your manufacturer profile first, then come back to customize your brand page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-primary">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-on-surface leading-tight">{profileData.businessName || "Your Brand Page"}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Customize what farmers see on your public brand page</p>
          {slug && (
            <a href={`/brand/${slug}`} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <ExternalLink className="w-3 h-3" /> View Brand Page
            </a>
          )}
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full shrink-0">
          <Check className="w-3 h-3" /> Manufacturer
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-1 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === id
                ? "bg-white shadow-sm text-on-surface"
                : "text-on-surface-variant hover:text-on-surface"
            }`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "brand" && (
          <CustomizationForm
            manufacturerPhone={manufacturerPhone}
            profileData={profileData}
            slug={slug}
            initial={customization}
            onSaved={(updated) => setCustomization((p) => ({ ...p, ...updated }))}
          />
        )}
        {activeTab === "products" && <ProductsTab uid={uid} />}
        {activeTab === "stores" && <StoresTab userPhone={manufacturerPhone} />}
      </div>
    </div>
  );
}
