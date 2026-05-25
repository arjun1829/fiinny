"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Loader2, Building2, Package, Store, Video,
  Plus, Pencil, Trash2, Save, X, Check,
  Phone, Mail, Globe, Youtube, MapPin,
  ChevronDown, ChevronUp, Image as ImageIcon,
  Tag, Info, Sparkles
} from "lucide-react";
import {
  auth, getUserProfile, db,
  fetchCompanyPageById, saveCompanyPage,
  fetchCompanyProducts, saveCompanyProduct, deleteCompanyProduct,
  fetchCompanyStores, saveCompanyStore, deleteCompanyStore,
  fetchManufacturerProducts, fetchManufacturerNetworkStores,
  type CompanyPageDoc, type CompanyProduct, type CompanyStore, type RetailerNetworkStore,
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

// ─── Product Form (shared for add + edit) ─────────────────────────────────────

const CATEGORIES = ["fertilizers", "pesticides", "seeds", "tools", "general"];
const STOCK_OPTIONS = ["In Stock", "Fast Selling", "Trending", "Low Stock", "Out of Stock"];

function ProductForm({
  companyId,
  initial,
  onDone,
  onCancel,
}: {
  companyId: string;
  initial?: CompanyProduct;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    fullName: initial?.fullName ?? "",
    price: String(initial?.price ?? ""),
    oldPrice: String(initial?.oldPrice ?? ""),
    category: initial?.category ?? "fertilizers",
    description: initial?.description ?? "",
    image: initial?.image ?? "",
    stock: initial?.stock ?? "In Stock",
    application: initial?.application ?? "",
  });
  const [benefits, setBenefits] = useState<string[]>(initial?.benefits ?? []);
  const [benefitInput, setBenefitInput] = useState("");
  const [composition, setComposition] = useState<{ name: string; value: string; color: string }[]>(
    initial?.composition ?? []
  );
  const [compRow, setCompRow] = useState({ name: "", value: "", color: "#154212" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const addBenefit = () => {
    const v = benefitInput.trim();
    if (v) { setBenefits((p) => [...p, v]); setBenefitInput(""); }
  };

  const addCompRow = () => {
    if (compRow.name.trim() && compRow.value.trim()) {
      setComposition((p) => [...p, { ...compRow }]);
      setCompRow({ name: "", value: "", color: "#154212" });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Product name is required."); return; }
    if (!form.price || isNaN(Number(form.price))) { setError("Valid price required."); return; }
    setSaving(true); setError(null);
    try {
      await saveCompanyProduct(
        {
          companyId,
          name: form.name.trim(),
          fullName: form.fullName.trim() || form.name.trim(),
          price: Number(form.price),
          oldPrice: form.oldPrice ? Number(form.oldPrice) : undefined,
          category: form.category,
          description: form.description.trim(),
          image: form.image.trim(),
          stock: form.stock,
          application: form.application.trim() || undefined,
          benefits: benefits.length ? benefits : undefined,
          composition: composition.length ? composition : undefined,
        },
        initial?.id
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Product Name <span className="text-red-500">*</span></span>
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Power Plus 1L" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Full Name</span>
          <input className={inputCls} value={form.fullName} onChange={set("fullName")} placeholder="e.g. Power Plus™ – Growth Stimulator (1 Litre)" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Category</span>
          <select className={inputCls} value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Stock Status</span>
          <select className={inputCls} value={form.stock} onChange={set("stock")}>
            {STOCK_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Price (₹) <span className="text-red-500">*</span></span>
          <input type="number" className={inputCls} value={form.price} onChange={set("price")} placeholder="500" min={0} />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Original Price (₹) <span className="text-xs font-normal text-on-surface-variant">for strikethrough</span></span>
          <input type="number" className={inputCls} value={form.oldPrice} onChange={set("oldPrice")} placeholder="620" min={0} />
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          <span className="font-medium text-on-surface">Image URL</span>
          <input className={inputCls} value={form.image} onChange={set("image")} placeholder="/images/karan-arjun/bottle-1l.png or https://..." />
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          <span className="font-medium text-on-surface">Description</span>
          <textarea rows={3} className={`${inputCls} resize-none`} value={form.description} onChange={set("description")}
            placeholder="Describe what this product does, what crops it's for, key benefits..." />
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          <span className="font-medium text-on-surface">Application Instructions</span>
          <textarea rows={2} className={`${inputCls} resize-none`} value={form.application} onChange={set("application")}
            placeholder="e.g. Drip: 2–3 L/acre. Foliar: 3–5 ml/litre..." />
        </label>
      </div>

      {/* Benefits */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-on-surface">Benefits</p>
        <div className="flex flex-wrap gap-2">
          {benefits.map((b, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
              {b}
              <button type="button" onClick={() => setBenefits((p) => p.filter((_, j) => j !== i))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={benefitInput}
            onChange={(e) => setBenefitInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBenefit(); } }}
            placeholder="e.g. Drought Tolerance — press Enter" />
          <button type="button" onClick={addBenefit}
            className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Composition */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-on-surface">Composition <span className="font-normal text-on-surface-variant">(optional)</span></p>
        {composition.map((row, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: row.color }} />
            <span className="font-medium text-on-surface">{row.name}</span>
            <span className="text-on-surface-variant">—</span>
            <span className="font-bold text-primary">{row.value}</span>
            <button type="button" onClick={() => setComposition((p) => p.filter((_, j) => j !== i))}
              className="ml-auto text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} placeholder="Name (e.g. Humates)" value={compRow.name}
            onChange={(e) => setCompRow((p) => ({ ...p, name: e.target.value }))} />
          <input className={`${inputCls} w-24`} placeholder="Value (22%)" value={compRow.value}
            onChange={(e) => setCompRow((p) => ({ ...p, value: e.target.value }))} />
          <input type="color" value={compRow.color}
            onChange={(e) => setCompRow((p) => ({ ...p, color: e.target.value }))}
            className="w-10 h-10 rounded-lg border border-outline-variant/30 cursor-pointer" />
          <button type="button" onClick={addCompRow}
            className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : initial ? "Update Product" : "Add Product"}
        </button>
        <button type="button" onClick={onCancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface-variant text-sm font-semibold hover:bg-surface-container">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ companyId, uid }: { companyId: string; uid: string }) {
  const [products, setProducts] = useState<CompanyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CompanyProduct | null>(null);
  const [status, setStatus] = useState<Status>(null);

  // Import from inventory state
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [importPanel, setImportPanel] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchCompanyProducts(companyId)
      .then(setProducts)
      .catch((err) => setStatus({ type: "err", msg: err.message }))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const loadInventory = useCallback(async () => {
    if (inventoryProducts.length > 0) { setImportPanel(true); return; }
    setInventoryLoading(true);
    try {
      // Try both uid and phone (companyId) as ownerId
      const [byUid, byPhone] = await Promise.all([
        fetchManufacturerProducts(uid).catch(() => []),
        uid !== companyId ? fetchManufacturerProducts(companyId).catch(() => []) : Promise.resolve([]),
      ]);
      const seen = new Set<string>();
      const merged = [...byUid, ...byPhone].filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id); return true;
      });
      setInventoryProducts(merged);
      setImportPanel(true);
    } finally {
      setInventoryLoading(false);
    }
  }, [uid, companyId, inventoryProducts.length]);

  const alreadyImported = new Set(products.map(p => p.name?.toLowerCase().trim()));

  const handleImport = async () => {
    const toImport = inventoryProducts.filter(p => selected.has(p.id));
    if (!toImport.length) return;
    setImporting(true);
    try {
      for (const p of toImport) {
        await saveCompanyProduct({
          companyId,
          name: p.name || p.fullName || "",
          fullName: p.fullName || p.name || "",
          price: Number(p.price) || 0,
          oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
          category: p.category || "general",
          description: p.description || "",
          image: p.image || (p.images?.[0] ?? ""),
          stock: p.stock || "In Stock",
          application: p.application || undefined,
          benefits: p.benefits || undefined,
        });
      }
      setStatus({ type: "ok", msg: `✓ Imported ${toImport.length} product(s) from your inventory.` });
      setSelected(new Set());
      setImportPanel(false);
      load();
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (product: CompanyProduct) => {
    if (!product.id) return;
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await deleteCompanyProduct(product.id);
      setStatus({ type: "ok", msg: `"${product.name}" deleted.` });
      load();
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Delete failed." });
    }
  };

  if (adding || editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setAdding(false); setEditing(null); }}
            className="text-on-surface-variant hover:text-on-surface">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-bold text-on-surface">{editing ? "Edit Product" : "Add New Product"}</h3>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
          <ProductForm
            companyId={companyId}
            initial={editing ?? undefined}
            onDone={() => { setAdding(false); setEditing(null); setStatus({ type: "ok", msg: "Product saved." }); load(); }}
            onCancel={() => { setAdding(false); setEditing(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-on-surface-variant">{products.length} product{products.length !== 1 ? "s" : ""} on brand page</p>
        <div className="flex gap-2">
          <button type="button" onClick={loadInventory} disabled={inventoryLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold hover:bg-primary/10 disabled:opacity-60">
            {inventoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Import from Inventory
          </button>
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90">
            <Plus className="w-4 h-4" /> Add New
          </button>
        </div>
      </div>

      {/* Import from inventory panel */}
      {importPanel && (
        <div className="rounded-2xl border border-primary/20 bg-primary/3 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-on-surface text-sm">Your Inventory Products</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Select products to publish on your brand page. Already-added ones are marked.</p>
            </div>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button type="button" onClick={handleImport} disabled={importing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-60">
                  {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Import {selected.size}
                </button>
              )}
              <button type="button" onClick={() => setImportPanel(false)}
                className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {inventoryProducts.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">No products found in your inventory yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {inventoryProducts.map(p => {
                const imported = alreadyImported.has((p.name || p.fullName || "").toLowerCase().trim());
                const isSelected = selected.has(p.id);
                return (
                  <button key={p.id} type="button"
                    disabled={imported}
                    onClick={() => setSelected(prev => {
                      const next = new Set(prev);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      return next;
                    })}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      imported ? "opacity-50 cursor-not-allowed bg-surface-container border-outline-variant/20"
                        : isSelected ? "border-primary/50 bg-primary/8 shadow-sm"
                        : "border-outline-variant/30 bg-surface-container-lowest hover:border-primary/30"
                    }`}>
                    {(p.image || p.images?.[0]) ? (
                      <img src={p.image || p.images?.[0]} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-primary/40" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{p.name || p.fullName}</p>
                      <p className="text-xs text-on-surface-variant">₹{p.price} · {p.category}</p>
                    </div>
                    {imported ? (
                      <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">Added</span>
                    ) : isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-outline-variant/40 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-3">
          <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No products on brand page yet.</p>
          <p className="text-sm text-on-surface-variant">Click <strong>Import from Inventory</strong> to pull in products you&apos;ve already added, or <strong>Add New</strong> to create from scratch.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div key={product.id}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 hover:border-primary/30 transition-colors">
              {/* Image */}
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-container shrink-0 flex items-center justify-center">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-on-surface-variant/30" />
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{product.name}</p>
                <p className="text-xs text-on-surface-variant capitalize">{product.category}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold text-primary">₹{product.price}</span>
                  {product.oldPrice && (
                    <span className="text-xs line-through text-on-surface-variant">₹{product.oldPrice}</span>
                  )}
                  <span className="text-[10px] bg-green-50 text-green-700 border border-green-100 px-1.5 py-0.5 rounded-full font-semibold">
                    {product.stock ?? "In Stock"}
                  </span>
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setEditing(product)}
                  className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => handleDelete(product)}
                  className="p-2 rounded-xl hover:bg-red-50 text-on-surface-variant hover:text-red-600 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Store Form ───────────────────────────────────────────────────────────────

function StoreForm({
  companyId,
  initial,
  onDone,
  onCancel,
}: {
  companyId: string;
  initial?: CompanyStore;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    ownerName: initial?.ownerName ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    status: initial?.status ?? "Open until 7:00 PM",
    lat: String(initial?.lat ?? ""),
    lng: String(initial?.lng ?? ""),
    stockInput: "",
  });
  const [stock, setStock] = useState<string[]>(initial?.stock ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const addStock = () => {
    const v = form.stockInput.trim();
    if (v && !stock.includes(v)) { setStock((p) => [...p, v]); setForm((p) => ({ ...p, stockInput: "" })); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Store name is required."); return; }
    if (!form.address.trim()) { setError("Address is required."); return; }
    setSaving(true); setError(null);
    try {
      await saveCompanyStore(
        {
          companyId,
          name: form.name.trim(),
          ownerName: form.ownerName.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.address.trim(),
          status: form.status.trim() || undefined,
          lat: Number(form.lat) || 0,
          lng: Number(form.lng) || 0,
          stock: stock.length ? stock : undefined,
        },
        initial?.id
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Store Name <span className="text-red-500">*</span></span>
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="e.g. Karjat Krishi Seva Kendra" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Owner Name</span>
          <input className={inputCls} value={form.ownerName} onChange={set("ownerName")} placeholder="e.g. Ramesh Shinde" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Phone</span>
          <input type="tel" className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+919307199040" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Store Hours</span>
          <input className={inputCls} value={form.status} onChange={set("status")} placeholder="Open until 7:00 PM" />
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          <span className="font-medium text-on-surface">Address <span className="text-red-500">*</span></span>
          <input className={inputCls} value={form.address} onChange={set("address")} placeholder="Shop no, Street, Village/City, District, PIN" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Latitude</span>
          <input type="number" step="any" className={inputCls} value={form.lat} onChange={set("lat")} placeholder="e.g. 18.9602" />
        </label>
        <label className={labelCls}>
          <span className="font-medium text-on-surface">Longitude</span>
          <input type="number" step="any" className={inputCls} value={form.lng} onChange={set("lng")} placeholder="e.g. 75.1705" />
        </label>
      </div>
      <p className="text-xs text-on-surface-variant">
        💡 To get Lat/Lng: open Google Maps, right-click on the store location, copy the coordinates.
      </p>

      {/* Stock items */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-on-surface">Products in Stock</p>
        <div className="flex flex-wrap gap-2">
          {stock.map((s, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-surface-container text-on-surface border border-outline-variant/30 px-2.5 py-1 rounded-full">
              {s}
              <button type="button" onClick={() => setStock((p) => p.filter((_, j) => j !== i))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={form.stockInput}
            onChange={(e) => setForm((p) => ({ ...p, stockInput: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStock(); } }}
            placeholder="e.g. Power Plus 1L — press Enter" />
          <button type="button" onClick={addStock}
            className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : initial ? "Update Store" : "Add Store"}
        </button>
        <button type="button" onClick={onCancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface-variant text-sm font-semibold hover:bg-surface-container">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Stores Tab ───────────────────────────────────────────────────────────────

function StoresTab({ companyId, userPhone }: { companyId: string; userPhone: string }) {
  const [stores, setStores] = useState<CompanyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CompanyStore | null>(null);
  const [status, setStatus] = useState<Status>(null);

  // Import from network state
  const [networkStores, setNetworkStores] = useState<RetailerNetworkStore[]>([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkPanel, setNetworkPanel] = useState(false);
  const [importingStore, setImportingStore] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchCompanyStores(companyId)
      .then(setStores)
      .catch((err) => setStatus({ type: "err", msg: err.message }))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const loadNetwork = useCallback(async () => {
    if (networkStores.length > 0) { setNetworkPanel(true); return; }
    setNetworkLoading(true);
    try {
      const result = await fetchManufacturerNetworkStores(userPhone);
      setNetworkStores(result);
      setNetworkPanel(true);
    } catch {
      setStatus({ type: "err", msg: "Could not load retailer network." });
    } finally {
      setNetworkLoading(false);
    }
  }, [userPhone, networkStores.length]);

  const alreadyImported = new Set(stores.map(s => s.name?.toLowerCase().trim()));

  const handleImportStore = async (retailer: RetailerNetworkStore) => {
    setImportingStore(retailer.phone);
    try {
      await saveCompanyStore({
        companyId,
        name: retailer.name,
        ownerName: retailer.ownerName || undefined,
        phone: retailer.storePhone,
        address: retailer.address,
        lat: retailer.lat,
        lng: retailer.lng,
      });
      setStatus({ type: "ok", msg: `✓ "${retailer.name}" added to your brand page stores.` });
      load();
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setImportingStore(null);
    }
  };

  const handleDelete = async (store: CompanyStore) => {
    if (!store.id) return;
    if (!confirm(`Remove "${store.name}"?`)) return;
    try {
      await deleteCompanyStore(store.id);
      setStatus({ type: "ok", msg: `"${store.name}" removed.` });
      load();
    } catch (err) {
      setStatus({ type: "err", msg: err instanceof Error ? err.message : "Delete failed." });
    }
  };

  if (adding || editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setAdding(false); setEditing(null); }}
            className="text-on-surface-variant hover:text-on-surface">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-bold text-on-surface">{editing ? "Edit Store" : "Add New Store"}</h3>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
          <StoreForm
            companyId={companyId}
            initial={editing ?? undefined}
            onDone={() => { setAdding(false); setEditing(null); setStatus({ type: "ok", msg: "Store saved." }); load(); }}
            onCancel={() => { setAdding(false); setEditing(null); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-on-surface-variant">{stores.length} store{stores.length !== 1 ? "s" : ""} on brand page</p>
        <div className="flex gap-2">
          <button type="button" onClick={loadNetwork} disabled={networkLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold hover:bg-primary/10 disabled:opacity-60">
            {networkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Import from Network
          </button>
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90">
            <Plus className="w-4 h-4" /> Add New
          </button>
        </div>
      </div>

      {/* Import from retailer network panel */}
      {networkPanel && (
        <div className="rounded-2xl border border-primary/20 bg-primary/3 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-on-surface text-sm">Your Retailer Network</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Retailers selling your products — add them as "Where to Buy" stores on your brand page.</p>
            </div>
            <button type="button" onClick={() => setNetworkPanel(false)}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container">
              <X className="w-4 h-4" />
            </button>
          </div>
          {networkStores.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">No retailers found in your network yet.</p>
          ) : (
            <div className="space-y-2">
              {networkStores.map((retailer) => {
                const imported = alreadyImported.has(retailer.name?.toLowerCase().trim());
                return (
                  <div key={retailer.phone}
                    className="flex items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Store className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{retailer.name}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {retailer.address || retailer.storePhone}
                      </p>
                    </div>
                    {imported ? (
                      <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">Added</span>
                    ) : (
                      <button type="button" onClick={() => handleImportStore(retailer)}
                        disabled={importingStore === retailer.phone}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-60 shrink-0">
                        {importingStore === retailer.phone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 px-6 py-14 text-center space-y-3">
          <Store className="w-10 h-10 text-on-surface-variant/30 mx-auto" />
          <p className="font-semibold text-on-surface-variant">No stores on brand page yet.</p>
          <p className="text-sm text-on-surface-variant">Click <strong>Import from Network</strong> to add your retailers, or <strong>Add New</strong> to add manually.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <div key={store.id}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 hover:border-primary/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm truncate">{store.name}</p>
                <p className="text-xs text-on-surface-variant truncate">
                  <MapPin className="inline w-2.5 h-2.5 mr-0.5" />{store.address}
                </p>
                {store.phone && (
                  <p className="text-xs text-on-surface-variant">
                    <Phone className="inline w-2.5 h-2.5 mr-0.5" />{store.phone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setEditing(store)}
                  className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => handleDelete(store)}
                  className="p-2 rounded-xl hover:bg-red-50 text-on-surface-variant hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
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
        {activeTab === "products" && <ProductsTab companyId={company.id} uid={uid} />}
        {activeTab === "stores" && <StoresTab companyId={company.id} userPhone={userPhone} />}
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
