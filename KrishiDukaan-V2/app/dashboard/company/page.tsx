"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Loader2, Building2, Package, Store, Video,
  Plus, Save, X, Check,
  Phone, Youtube, MapPin,
  Tag, Info, Sparkles
} from "lucide-react";
import {
  auth, getUserProfile, db,
  fetchCompanyPageById, saveCompanyPage,
  fetchManufacturerProducts, fetchManufacturerNetworkStores,
  type CompanyPageDoc, type RetailerNetworkStore,
} from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 placeholder:text-on-surface-variant/50";

const labelCls = "flex flex-col gap-1.5 text-sm";

type Status = { type: "ok" | "err"; msg: string } | null;

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

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = "brand" | "products" | "stores" | "videos";

// ─── Brand Info Tab ───────────────────────────────────────────────────────────

function BrandTab({
  company, onSaved, userProfile,
}: {
  company: CompanyPageDoc;
  onSaved: (updated: Partial<CompanyPageDoc>) => void;
  userProfile: any;
}) {
  const [form, setForm] = useState({
    name: company.name ?? "",
    tagline: company.tagline ?? "",
    about: company.about ?? "",
    location: company.location ?? "",
    founded: company.founded ?? "",
    website: company.website ?? "",
    socialProof: company.socialProof ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    primaryColor: company.primaryColor ?? "#154212",
    accentColor: company.accentColor ?? "#f57c00",
    certInput: "",
  });
  const [certifications, setCertifications] = useState<string[]>(company.certifications ?? []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [syncDismissed, setSyncDismissed] = useState(false);

  // Build profile-sourced values
  const profileData = userProfile ? {
    name: userProfile.businessName || userProfile.shopName || userProfile.name || "",
    phone: userProfile.phone || userProfile.id || "",
    email: userProfile.email || "",
    location: [userProfile.city, userProfile.state].filter(Boolean).join(", "),
    website: userProfile.website || "",
  } : null;

  // Detect which fields differ between current form and profile
  const syncFields = profileData ? (Object.entries(profileData) as [keyof typeof profileData, string][]).filter(
    ([k, v]) => v && form[k as keyof typeof form] !== v
  ) : [];
  const showSyncBanner = !syncDismissed && syncFields.length > 0;

  const applySync = () => {
    if (!profileData) return;
    setForm(p => ({
      ...p,
      name: profileData.name || p.name,
      phone: profileData.phone || p.phone,
      email: profileData.email || p.email,
      location: profileData.location || p.location,
      website: profileData.website || p.website,
    }));
    setSyncDismissed(true);
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const addCert = () => {
    const v = form.certInput.trim();
    if (v && !certifications.includes(v)) {
      setCertifications((p) => [...p, v]);
      setForm((p) => ({ ...p, certInput: "" }));
    }
  };

  const removeCert = (c: string) => setCertifications((p) => p.filter((x) => x !== c));

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try {
      const data: Partial<CompanyPageDoc> = {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        about: form.about.trim(),
        location: form.location.trim(),
        founded: form.founded.trim(),
        website: form.website.trim(),
        socialProof: form.socialProof.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        certifications,
      };
      await saveCompanyPage(company.id, data);
      setStatus({ type: "ok", msg: "Brand info saved successfully." });
      onSaved(data);
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* Sync from profile banner */}
      {showSyncBanner && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-primary flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" /> Your profile has data not yet on this page
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Auto-fill: {syncFields.map(([k]) => k).join(", ")} — from your registered account details.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={applySync}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90">
              <Check className="w-3.5 h-3.5" /> Sync from Profile
            </button>
            <button type="button" onClick={() => setSyncDismissed(true)}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Basic Information</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Company Name <span className="text-red-500">*</span></span>
            <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Karan Arjun Power Plus™" />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Tagline</span>
            <input className={inputCls} value={form.tagline} onChange={set("tagline")} placeholder="Short brand tagline" maxLength={100} />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Location</span>
            <input className={inputCls} value={form.location} onChange={set("location")} placeholder="City, District, State PIN" />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Founded Year</span>
            <input className={inputCls} value={form.founded} onChange={set("founded")} placeholder="e.g. 2019" maxLength={4} />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Contact Phone</span>
            <input type="tel" className={inputCls} value={form.phone} onChange={set("phone")} placeholder="9307199040" />
          </label>
          <label className={labelCls}>
            <span className="font-medium text-on-surface">Contact Email</span>
            <input type="email" className={inputCls} value={form.email} onChange={set("email")} placeholder="company@example.com" />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">Website</span>
            <input type="url" className={inputCls} value={form.website} onChange={set("website")} placeholder="https://yoursite.com" />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">Social Proof / Achievement</span>
            <input className={inputCls} value={form.socialProof} onChange={set("socialProof")} placeholder="e.g. 75,800+ farmers trust Power Plus" maxLength={120} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span className="font-medium text-on-surface">About</span>
            <textarea
              rows={4}
              className={`${inputCls} resize-none`}
              value={form.about}
              onChange={set("about")}
              placeholder="Tell farmers about your company, mission, and what makes your products special..."
            />
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
              <button type="button" onClick={() => removeCert(c)} className="ml-0.5 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            value={form.certInput}
            onChange={(e) => setForm((p) => ({ ...p, certInput: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
            placeholder="e.g. ISO 9001:2015 — press Enter to add"
          />
          <button type="button" onClick={addCert}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors">
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

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Brand Info"}
      </button>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

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
        <p>Products are pulled live from your inventory. To manage products, go to <strong>Inventory</strong> in the main menu.</p>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-3">
          <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No products in your inventory yet.</p>
          <p className="text-sm text-on-surface-variant">Add products from the Inventory section — they will appear here automatically.</p>
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

// ─── Stores Tab ───────────────────────────────────────────────────────────────

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
        <p>Stores are pulled live from your retailer network. To manage your network, go to <strong>Retailer Network</strong> in the main menu.</p>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-3">
          <Store className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No retailers in your network yet.</p>
          <p className="text-sm text-on-surface-variant">Add retailers from the Retailer Network section — they will appear here automatically.</p>
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

// ─── Videos Tab ───────────────────────────────────────────────────────────────

function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  // Already an ID (11 chars, no special chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  // URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
}

function VideosTab({
  companyId,
  initialVideos,
  onSaved,
}: {
  companyId: string;
  initialVideos: string[];
  onSaved: (videos: string[]) => void;
}) {
  const [videos, setVideos] = useState<string[]>(initialVideos);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const addVideo = () => {
    const id = extractYouTubeId(input);
    if (!id) { setError("Couldn't parse a YouTube video ID. Paste the full URL or just the 11-character video ID."); return; }
    if (videos.includes(id)) { setError("This video is already added."); return; }
    setVideos((p) => [...p, id]);
    setInput("");
    setError(null);
  };

  const removeVideo = (id: string) => setVideos((p) => p.filter((v) => v !== id));

  const handleSave = async () => {
    setSaving(true); setStatus(null);
    try {
      await saveCompanyPage(companyId, { videos });
      setStatus({ type: "ok", msg: "Videos saved." });
      onSaved(videos);
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 space-y-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-1">Add YouTube Video</h3>
          <p className="text-xs text-on-surface-variant">
            Paste a full YouTube URL (video, Shorts, or embed) or just the 11-character video ID.
            Videos will appear as Shorts-style vertical cards on your brand page.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input
              className={`${inputCls} pl-10`}
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
              placeholder="https://youtu.be/dmCafHKBuIY or dmCafHKBuIY"
            />
          </div>
          <button type="button" onClick={addVideo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:opacity-90 shrink-0">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {error && <p className="text-xs text-red-600">✗ {error}</p>}
      </div>

      {/* Video list */}
      {videos.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{videos.length} video{videos.length !== 1 ? "s" : ""}</p>
          <div className="flex flex-wrap gap-4">
            {videos.map((id) => (
              <div key={id} className="relative rounded-2xl overflow-hidden bg-black shrink-0 border border-outline-variant/30"
                style={{ width: 120, aspectRatio: "9/16" }}>
                <img
                  src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
                  alt={`Video ${id}`}
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <Youtube className="w-8 h-8 text-white drop-shadow" />
                  <p className="text-[9px] text-white/80 font-mono">{id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeVideo(id)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-2">
          <Youtube className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No videos yet.</p>
          <p className="text-sm text-on-surface-variant">Add YouTube Shorts or long-form videos above.</p>
        </div>
      )}

      <button type="button" onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Videos"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyPageDoc | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("brand");
  const [error, setError] = useState<string | null>(null);
  const [uid, setUid] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
        setUid(user.uid);

        // Resolve phone: from uidIndex or profile
        const idxSnap = await getDoc(doc(db, 'uidIndex', user.uid)).catch(() => null);
        const phone: string = idxSnap?.exists() ? idxSnap.data().phone : ((profile as any)?.phone || user.uid);
        setUserPhone(phone);

        const companyId = (profile as any)?.ownerCompanyId;
        if (!companyId) {
          setError("No company page is assigned to your account. Ask an admin to assign your phone number.");
          setLoading(false);
          return;
        }
        const page = await fetchCompanyPageById(companyId);
        if (!page) {
          setError("Company page not found in Firestore. Ask an admin to seed it first.");
          setLoading(false);
          return;
        }
        setCompany(page);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load company page.");
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
    { id: "videos", label: "Videos", icon: Video },
  ];

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading company page…
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-8 space-y-4 max-w-lg">
        <div className="flex items-center gap-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <Info className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error ?? "Company not found."}</p>
        </div>
        <p className="text-xs text-on-surface-variant">
          If you are a company/brand owner, please contact the KrishiDukan admin and provide your registered phone number
          to get access to your company page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: company.primaryColor || "#154212" }}
        >
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-on-surface leading-tight">{company.name}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{company.tagline}</p>
          <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {company.location}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <Check className="w-3 h-3" /> Owner Access
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-1 w-fit flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === id
                ? "bg-white shadow-sm text-on-surface"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "brand" && (
          <BrandTab
            company={company}
            onSaved={(updated) => setCompany((p) => p ? { ...p, ...updated } : p)}
            userProfile={userProfile}
          />
        )}
        {activeTab === "products" && <ProductsTab uid={uid} />}
        {activeTab === "stores" && <StoresTab userPhone={userPhone} />}
        {activeTab === "videos" && (
          <VideosTab
            companyId={company.id}
            initialVideos={company.videos ?? []}
            onSaved={(videos) => setCompany((p) => p ? { ...p, videos } : p)}
          />
        )}
      </div>
    </div>
  );
}
