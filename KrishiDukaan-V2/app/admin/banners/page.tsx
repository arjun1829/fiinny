"use client";

import { useEffect, useRef, useState } from "react";
import {
  GalleryHorizontal, Plus, Pencil, Trash2, X, Image as ImageIcon,
  ArrowUp, ArrowDown, Copy, Upload, Loader2, Monitor, Smartphone, Ban,
} from "lucide-react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { compressImage } from "../../utils/compressImage";
import {
  fetchBanners, saveBanner, updateBanner, deleteBanner, duplicateBanner,
} from "../../firebase";
import type { Banner, BannerCtaLink } from "../../firebase";
import { BannerSlideVisual } from "../../components/BannerSlide";

type BannerForm = {
  title: string;
  subtitle: string;
  bgImg: string;
  bgImgMobile: string;
  imgUrl: string;
  bgClass: string;
  ctaLabel: string;
  ctaEnabled: boolean;
  ctaType: BannerCtaLink["type"];
  ctaValue: string;
  enabled: boolean;
  status: Banner["status"];
};

const EMPTY_FORM: BannerForm = {
  title: "",
  subtitle: "",
  bgImg: "",
  bgImgMobile: "",
  imgUrl: "",
  bgClass: "from-emerald-950 via-emerald-900/85 to-emerald-700/10",
  ctaLabel: "Explore Products",
  ctaEnabled: true,
  ctaType: "internal",
  ctaValue: "/market",
  enabled: true,
  status: "draft",
};

// value: "" is the sentinel for "No Overlay" — Banner.bgClass stores it as
// literally an empty string, and BannerSlideVisual skips rendering the
// gradient div entirely when bgClass is falsy. Every other preset is a real
// Tailwind gradient class string applied as `bg-gradient-to-r ${bgClass}`.
const GRADIENT_PRESETS = [
  { label: "Emerald", value: "from-emerald-950 via-emerald-900/85 to-emerald-700/10" },
  { label: "Amber", value: "from-amber-950 via-orange-900/90 to-amber-800/10" },
  { label: "Slate", value: "from-slate-950 via-slate-900/85 to-slate-700/10" },
  { label: "Rose", value: "from-rose-950 via-rose-900/85 to-rose-700/10" },
  { label: "No Overlay", value: "" },
];

function formToBanner(f: BannerForm, order: number): Omit<Banner, "id"> {
  return {
    title: f.title.trim(),
    subtitle: f.subtitle.trim(),
    bgImg: f.bgImg.trim(),
    bgImgMobile: f.bgImgMobile.trim() || undefined,
    imgUrl: f.imgUrl.trim() || undefined,
    // No fallback here: "" is a deliberate, valid choice (No Overlay), not a
    // missing value — the form always starts from EMPTY_FORM.bgClass and
    // only changes via an explicit preset click, so it's never "unset".
    bgClass: f.bgClass,
    ctaLabel: f.ctaLabel.trim(),
    ctaEnabled: f.ctaEnabled,
    ctaLink: { type: f.ctaType, value: f.ctaValue.trim() },
    enabled: f.enabled,
    status: f.status,
    order,
  };
}

function bannerToForm(b: Banner): BannerForm {
  return {
    title: b.title,
    subtitle: b.subtitle,
    bgImg: b.bgImg,
    bgImgMobile: b.bgImgMobile || "",
    imgUrl: b.imgUrl || "",
    bgClass: b.bgClass ?? EMPTY_FORM.bgClass,
    ctaLabel: b.ctaLabel,
    ctaEnabled: b.ctaEnabled,
    ctaType: b.ctaLink?.type || "internal",
    ctaValue: b.ctaLink?.value || "",
    enabled: b.enabled,
    status: b.status,
  };
}

function uploadToStorage(file: File, path: string, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    // Each upload lands at a unique path (`banner-images/${Date.now()}-...`) and
    // gets a fresh download token, so an image's URL only ever changes when an
    // admin actually replaces it. That makes the bytes at any given URL truly
    // immutable, so we let the browser cache them for a year without
    // revalidating. Result: repeat homepage visits reuse the cached banner
    // instantly (no per-load 304 round-trip), while replacing a banner in Admin
    // produces a new URL that browsers fetch automatically — no stale images.
    const task = uploadBytesResumable(storageRef, file, {
      cacheControl: "public, max-age=31536000, immutable",
    });
    task.on("state_changed",
      snap => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

function ImageField({
  label, value, onChange, aspect = "h-28",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  aspect?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const toUpload = await compressImage(file);
      const path = `banner-images/${Date.now()}-${file.name}`;
      const url = await uploadToStorage(toUpload, path, setProgress);
      onChange(url);
    } catch (err) {
      console.error(err);
      alert("Image upload failed. Check console.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="text" value={value} placeholder="https://... or upload below"
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-w-0 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 flex items-center gap-1.5 border border-outline-variant bg-surface-container-low text-on-surface-variant text-xs font-bold px-3 py-3 rounded-2xl hover:bg-surface-container transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? `${progress}%` : "Upload"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </div>
      {value && (
        <div className={`mt-2 rounded-xl overflow-hidden ${aspect} bg-surface-container`}>
          <img src={value} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
    </div>
  );
}

/** Builds the same title React node bannerToSlide() derives in HomeView.tsx (line breaks on \n, empty -> no title). */
function formTitleToNode(title: string): React.ReactNode {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return trimmed.split('\n').map((line, i, arr) => (
    <span key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </span>
  ));
}

/**
 * Real-time preview of the banner being edited, reusing BannerSlideVisual —
 * the exact same component the live homepage carousel renders — so what the
 * admin sees here is exactly what appears on the site (minus the carousel's
 * autoplay/dots/arrows chrome, which isn't relevant while editing one slide).
 */
function BannerPreviewPanel({ form }: { form: BannerForm }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const slide = {
    title: formTitleToNode(form.title),
    subtitle: form.subtitle,
    ctaLabel: form.ctaLabel,
    ctaEnabled: form.ctaEnabled,
    bgClass: form.bgClass,
    bgImg: form.bgImg,
    bgImgMobile: form.bgImgMobile,
    imgUrl: form.imgUrl,
  };

  return (
    <div className="w-full lg:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-surface-container bg-surface-container-lowest p-6 lg:sticky lg:top-[89px] lg:self-start">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Live Preview</h3>
        <div className="flex gap-1 bg-surface-container rounded-xl p-1">
          <button type="button" onClick={() => setDevice("desktop")}
            className={`p-1.5 rounded-lg transition-colors ${device === "desktop" ? "bg-white shadow-sm text-primary" : "text-on-surface-variant"}`}
            title="Desktop preview" aria-label="Desktop preview">
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setDevice("mobile")}
            className={`p-1.5 rounded-lg transition-colors ${device === "mobile" ? "bg-white shadow-sm text-primary" : "text-on-surface-variant"}`}
            title="Mobile preview" aria-label="Mobile preview">
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/*
        This wrapper reuses the SAME markup as the hero section in
        HomeView.tsx (data-tour="hero" block): a
        `relative rounded-3xl overflow-hidden shadow-ambient min-h-[...]` box
        containing a `flex items-center overflow-hidden` content layer.
        Reusing that box — not an invented aspect-ratio — is what keeps every
        size-dependent style inside BannerSlideVisual (text size, padding,
        CTA position, foreground image width) proportioned exactly like
        production. min-h is forced per device (340px mobile / 400px desktop,
        the homepage's own min-h-[340px] md:min-h-[400px] pair) rather than
        left as literal `md:` classes, because md: is a real viewport media
        query that can't be faked by a narrower wrapper div — on a wide admin
        browser both toggle states would otherwise resolve to the desktop
        height. The `device` toggle otherwise only changes the CONTAINER
        WIDTH (full-width vs. a phone-width column), exactly like resizing a
        real browser window across the md: breakpoint.
      */}
      <div className={device === "mobile" ? "w-[220px] mx-auto" : "w-full"}>
        <div className={`relative rounded-3xl overflow-hidden shadow-ambient ${device === "mobile" ? "min-h-[340px]" : "min-h-[400px]"}`}>
          {form.bgImg || form.bgImgMobile ? (
            <div className="absolute inset-0 flex items-center overflow-hidden">
              <BannerSlideVisual slide={slide} variant={device} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant text-xs bg-surface-container">
              Add a background image to preview
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-on-surface-variant mt-3 text-center">
        This mirrors exactly how the banner renders on the homepage.
      </p>
    </div>
  );
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchBanners()
      .then(setBanners)
      .catch(err => {
        console.error("Failed to fetch banners:", err);
        setError("Failed to load banners from Firebase. Please make sure you are logged in and have admin permissions.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setShowForm(true);
  };
  const openEdit = (b: Banner) => { setForm(bannerToForm(b)); setEditId(b.id); setShowForm(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bgImg.trim()) {
      alert("Background image is required.");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const existing = banners.find(b => b.id === editId);
        await updateBanner(editId, formToBanner(form, existing?.order ?? banners.length));
      } else {
        const nextOrder = banners.length ? Math.max(...banners.map(b => b.order)) + 1 : 0;
        await saveBanner(formToBanner(form, nextOrder));
      }
      await load();
      setShowForm(false);
    } catch (err) {
      console.error(err);
      alert("Save failed. Check console.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: Banner) => {
    if (!confirm(`Delete banner "${b.title || "Untitled"}"? This removes it from the homepage.`)) return;
    setDeleting(b.id);
    try {
      await deleteBanner(b.id);
      setBanners(prev => prev.filter(x => x.id !== b.id));
    } catch {
      alert("Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const handleDuplicate = async (b: Banner) => {
    setSaving(true);
    try {
      await duplicateBanner(b);
      await load();
    } catch (err) {
      console.error(err);
      alert("Duplicate failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (b: Banner, field: "enabled" | "status") => {
    try {
      if (field === "enabled") {
        await updateBanner(b.id, { enabled: !b.enabled });
        setBanners(prev => prev.map(x => x.id === b.id ? { ...x, enabled: !x.enabled } : x));
      } else {
        const next = b.status === "published" ? "draft" : "published";
        await updateBanner(b.id, { status: next });
        setBanners(prev => prev.map(x => x.id === b.id ? { ...x, status: next } : x));
      }
    } catch {
      alert("Update failed.");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= banners.length) return;
    setReordering(true);
    try {
      const a = banners[index];
      const b = banners[target];
      await Promise.all([
        updateBanner(a.id, { order: b.order }),
        updateBanner(b.id, { order: a.order }),
      ]);
      const next = [...banners];
      next[index] = { ...b, order: a.order };
      next[target] = { ...a, order: b.order };
      setBanners(next);
    } catch (err) {
      console.error(err);
      alert("Reorder failed.");
      load();
    } finally {
      setReordering(false);
    }
  };

  const f = form;
  const setF = setForm;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <GalleryHorizontal className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">Banners</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9">
            Manage the homepage hero carousel. Only <span className="font-bold">Published</span> and <span className="font-bold">Enabled</span> banners appear on the site, in the order below.
            {banners.length === 0 && !loading && " No banners yet — the homepage is currently showing its built-in default slides."}
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center justify-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary-container transition-colors shrink-0">
          <Plus className="h-4 w-4" /> New Banner
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between gap-4">
          <p className="font-semibold">{error}</p>
          <button onClick={load} className="shrink-0 bg-red-100 hover:bg-red-200 text-red-900 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : banners.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-outline-variant p-16 text-center">
          <GalleryHorizontal className="h-10 w-10 text-outline mx-auto mb-4" />
          <h3 className="text-lg font-bold text-on-surface mb-1">No banners yet</h3>
          <p className="text-sm text-on-surface-variant mb-6 max-w-md mx-auto">
            The homepage is currently showing its built-in default slides. Create a banner here to start managing the carousel dynamically.
          </p>
          <button onClick={openAdd} className="bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-primary-container transition-colors">
            Create First Banner
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((b, i) => (
            <div key={b.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5">
                <div className="flex items-center gap-4 w-full sm:w-auto overflow-hidden">
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => move(i, -1)} disabled={i === 0 || reordering}
                      className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant disabled:opacity-30 transition-colors">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === banners.length - 1 || reordering}
                      className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant disabled:opacity-30 transition-colors">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="w-24 h-16 rounded-2xl overflow-hidden bg-surface-container shrink-0">
                    {b.bgImg ? (
                      <img src={b.bgImg} alt={b.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-5 w-5 text-outline" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-bold text-on-surface text-base truncate">
                        {b.title || <span className="italic text-on-surface-variant">Untitled (image-only) banner</span>}
                      </h3>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${b.status === "published" ? "bg-primary/10 text-primary" : "bg-outline-variant/20 text-on-surface-variant"}`}>
                        {b.status}
                      </span>
                      {!b.enabled && (
                        <span className="text-[10px] font-black uppercase tracking-widest bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Disabled</span>
                      )}
                    </div>
                    <p className="text-sm text-on-surface-variant truncate">{b.subtitle}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      CTA: {b.ctaEnabled ? `"${b.ctaLabel}" → ${b.ctaLink?.value}` : <span className="italic">disabled</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto border-t sm:border-t-0 border-outline-variant/10 pt-3 sm:pt-0 flex-wrap">
                  <button onClick={() => handleToggle(b, "status")}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-outline-variant hover:bg-surface-container transition-colors">
                    {b.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button onClick={() => handleToggle(b, "enabled")}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-outline-variant hover:bg-surface-container transition-colors">
                    {b.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => handleDuplicate(b)} disabled={saving}
                    className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50" title="Duplicate">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(b)} className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(b)} disabled={deleting === b.id}
                    className="p-2 rounded-xl hover:bg-red-50 text-on-surface-variant hover:text-red-600 transition-colors disabled:opacity-50" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-start justify-center bg-on-surface/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-surface-container sticky top-0 bg-white rounded-t-3xl z-10">
              <h2 className="text-lg font-bold text-on-surface">{editId ? "Edit Banner" : "New Banner"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-surface-container transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-start">
            <form onSubmit={handleSave} className="p-6 space-y-6 flex-1 min-w-0 lg:max-w-2xl">
              {/* Content */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Content</h3>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Banner Title (optional)</label>
                  <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Modern Produce, Rooted Locally."
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <p className="text-[10px] text-on-surface-variant mt-1">Use a line break where you want the title to wrap. Leave blank for an image-only banner.</p>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Banner Description (optional)</label>
                  <textarea value={f.subtitle} onChange={e => setF(p => ({ ...p, subtitle: e.target.value }))}
                    rows={3} placeholder="Short supporting line shown under the title…"
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none" />
                </div>
              </div>

              {/* Images */}
              <div className="border-t border-surface-container pt-5 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Images</h3>
                <ImageField label="Background Image *" value={f.bgImg} onChange={url => setF(p => ({ ...p, bgImg: url }))} />
                <ImageField label="Mobile Background Image (optional — falls back to Background Image)" value={f.bgImgMobile} onChange={url => setF(p => ({ ...p, bgImgMobile: url }))} />
                <ImageField label="Product / Foreground Image (optional)" value={f.imgUrl} onChange={url => setF(p => ({ ...p, imgUrl: url }))} aspect="h-32" />
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Overlay Gradient</label>
                  <div className="flex flex-wrap gap-2">
                    {GRADIENT_PRESETS.map(g => (
                      <button key={g.label} type="button" onClick={() => setF(p => ({ ...p, bgClass: g.value }))}
                        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors inline-flex items-center gap-1.5 ${
                          g.value
                            ? `bg-gradient-to-r ${g.value} text-white`
                            : "bg-[repeating-conic-gradient(#e5e7eb_0%_25%,white_0%_50%)] bg-[length:10px_10px] text-on-surface"
                        } ${f.bgClass === g.value ? "ring-2 ring-primary ring-offset-2" : "border-outline-variant"}`}>
                        {!g.value && <Ban className="h-3 w-3" />}
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="border-t border-surface-container pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">CTA Button</h3>
                  <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant cursor-pointer">
                    <input type="checkbox" checked={f.ctaEnabled}
                      onChange={e => setF(p => ({ ...p, ctaEnabled: e.target.checked }))}
                      className="rounded border-outline-variant" />
                    Show CTA button
                  </label>
                </div>
                {f.ctaEnabled && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Button Text</label>
                      <input value={f.ctaLabel} onChange={e => setF(p => ({ ...p, ctaLabel: e.target.value }))}
                        placeholder="e.g. Explore Products"
                        className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                    </div>
                    <div className="flex gap-3">
                      <div className="w-36 shrink-0">
                        <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Link Type</label>
                        <select value={f.ctaType} onChange={e => setF(p => ({ ...p, ctaType: e.target.value as BannerCtaLink["type"] }))}
                          className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-3 py-3 text-sm focus:border-primary focus:outline-none">
                          <option value="internal">Internal Route</option>
                          <option value="external">External URL</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">
                          {f.ctaType === "internal" ? "Route (e.g. /market)" : "URL (e.g. https://...)"}
                        </label>
                        <input value={f.ctaValue} onChange={e => setF(p => ({ ...p, ctaValue: e.target.value }))}
                          placeholder={f.ctaType === "internal" ? "/market" : "https://example.com"}
                          className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Visibility */}
              <div className="border-t border-surface-container pt-5 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Visibility</h3>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-on-surface cursor-pointer">
                    <input type="checkbox" checked={f.enabled}
                      onChange={e => setF(p => ({ ...p, enabled: e.target.checked }))}
                      className="rounded border-outline-variant" />
                    Enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-on-surface cursor-pointer">
                    <input type="checkbox" checked={f.status === "published"}
                      onChange={e => setF(p => ({ ...p, status: e.target.checked ? "published" : "draft" }))}
                      className="rounded border-outline-variant" />
                    Published
                  </label>
                </div>
                <p className="text-xs text-on-surface-variant">A banner only appears on the homepage when both Enabled and Published are checked.</p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 border-t border-surface-container pt-5">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                  {saving ? "Saving…" : editId ? "Save Banner" : "Create Banner"}
                </button>
              </div>
            </form>
            <BannerPreviewPanel form={f} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
