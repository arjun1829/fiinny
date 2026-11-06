"use client";

import { useEffect, useRef, useState } from "react";
import {
  Info, Plus, Trash2, ArrowUp, ArrowDown, Upload, Loader2, Save, RefreshCw, Image as ImageIcon,
} from "lucide-react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, fetchAboutContent, saveAboutContent, EMPTY_ABOUT_CONTENT } from "../../firebase";
import type { AboutPageContent, AboutPartner } from "../../firebase";
import { compressImage, imageUploadMetadata } from "../../utils/compressImage";
import { AboutPartnersSection, AboutPresenceSection } from "../../components/AboutNetworkSections";

const DEFAULT_PARTNERS_TITLE = "Brands & Companies Connected with Us";
const DEFAULT_PRESENCE_TITLE = "Trusted by farmers and agri businesses across India.";

const inputCls =
  "w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelCls = "block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1";

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Uploads under banner-images/ (same Storage path the Banners module already
 * writes to). Each upload gets a unique path, so the bytes behind a URL never
 * change and browsers may cache them for a year.
 */
async function uploadImage(file: File, onProgress: (p: number) => void): Promise<string> {
  const toUpload = await compressImage(file);
  const storageRef = ref(storage, `banner-images/about-${Date.now()}-${toUpload.name}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, toUpload, imageUploadMetadata(toUpload));
    task.on("state_changed",
      snap => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}

function UploadButton({ onUploaded, label = "Upload" }: { onUploaded: (url: string) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProgress(0);
    try {
      onUploaded(await uploadImage(file, setProgress));
    } catch (err) {
      console.error(err);
      alert("Image upload failed. Check console.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="shrink-0 flex items-center gap-1.5 border border-outline-variant bg-surface-container-low text-on-surface-variant text-xs font-bold px-3 py-3 rounded-2xl hover:bg-surface-container transition-colors disabled:opacity-50"
      >
        {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {progress !== null ? `${progress}%` : label}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={handle} className="hidden" />
    </>
  );
}

function ImageField({ label, value, onChange, hint }: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2 items-center">
        <input type="text" value={value} placeholder="https://... or upload"
          onChange={e => onChange(e.target.value)} className={`${inputCls} flex-1 min-w-0`} />
        <UploadButton onUploaded={onChange} />
      </div>
      {hint && <p className="text-[10px] text-on-surface-variant mt-1">{hint}</p>}
      {value && (
        <div className="mt-2 rounded-xl overflow-hidden h-40 bg-surface-container flex items-center justify-center">
          <img src={value} alt="preview" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold text-on-surface cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-outline-variant" />
      {label}
    </label>
  );
}

export default function AdminAboutPage() {
  const [content, setContent] = useState<AboutPageContent>(EMPTY_ABOUT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    setLoading(true);
    setMessage(null);
    fetchAboutContent({ fresh: true })
      .then(c => { setContent(c); setDirty(false); })
      .catch(err => {
        console.error(err);
        setMessage({ ok: false, text: "Could not load About page content. Check you are signed in as an admin." });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const update = (patch: Partial<AboutPageContent>) => {
    setContent(prev => ({ ...prev, ...patch }));
    setDirty(true);
    setMessage(null);
  };

  const updatePartner = (id: string, patch: Partial<AboutPartner>) =>
    update({ partners: content.partners.map(p => (p.id === id ? { ...p, ...patch } : p)) });

  const movePartner = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= content.partners.length) return;
    const next = [...content.partners];
    [next[index], next[target]] = [next[target], next[index]];
    update({ partners: next });
  };

  const removePartner = (p: AboutPartner) => {
    if (!confirm(`Remove "${p.name || "this brand"}" from the About page?`)) return;
    update({ partners: content.partners.filter(x => x.id !== p.id) });
  };

  const addPartner = (logoUrl: string) => {
    update({ partners: [...content.partners, { id: newId(), name: "", logoUrl }] });
  };

  const handleSave = async () => {
    const partners = content.partners
      .map(p => ({ ...p, name: p.name.trim(), logoUrl: p.logoUrl.trim(), website: p.website?.trim() || undefined }))
      .filter(p => p.logoUrl);
    if (partners.some(p => !p.name)) {
      alert("Every brand needs a name (used as the logo's alt text).");
      return;
    }
    if (partners.some(p => p.website && !/^https?:\/\//i.test(p.website))) {
      alert("Website links must start with http:// or https://");
      return;
    }
    setSaving(true);
    try {
      const clean: AboutPageContent = {
        ...content,
        partners,
        partnersTitle: content.partnersTitle?.trim() || undefined,
        partnersSubtitle: content.partnersSubtitle?.trim() || undefined,
        centerLogoUrl: content.centerLogoUrl?.trim() || undefined,
        presenceTitle: content.presenceTitle?.trim() || undefined,
        presenceSubtitle: content.presenceSubtitle?.trim() || undefined,
      };
      await saveAboutContent(clean);
      setContent(clean);
      setDirty(false);
      setMessage({ ok: true, text: "Saved. The About page on the website and app now shows these changes." });
    } catch (err) {
      console.error(err);
      setMessage({ ok: false, text: "Save failed. Check console." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const c = content;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Info className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">About page</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9">
            Brands connected with KrishiDukan and our presence across India. Changes appear on the website and in the app after you save — no release needed.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} disabled={saving}
            className="flex items-center gap-2 border border-outline-variant text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-surface-container transition-colors disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
          <button onClick={handleSave} disabled={saving || !dirty}
            className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary-container transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-sm font-semibold border ${message.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {message.text}
        </div>
      )}

      {/* ── Brands ─────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-primary">Brands &amp; companies (animated orbit)</h2>
          <Toggle checked={c.partnersEnabled} onChange={v => update({ partnersEnabled: v })} label="Show on About page" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Heading (optional)</label>
            <input value={c.partnersTitle ?? ""} placeholder={DEFAULT_PARTNERS_TITLE}
              onChange={e => update({ partnersTitle: e.target.value })} className={inputCls} />
            <p className="text-[10px] text-on-surface-variant mt-1">Leave blank to use the translated default.</p>
          </div>
          <div>
            <label className={labelCls}>Sub-heading (optional)</label>
            <input value={c.partnersSubtitle ?? ""} placeholder="e.g. Seed, fertiliser and crop-care brands we work with"
              onChange={e => update({ partnersSubtitle: e.target.value })} className={inputCls} />
          </div>
        </div>

        <ImageField
          label="Centre logo (optional)"
          value={c.centerLogoUrl ?? ""}
          onChange={url => update({ centerLogoUrl: url })}
          hint="Shown in the middle of the orbit. Leave blank to use the KrishiDukan app icon."
        />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls}>Brand logos ({c.partners.length})</label>
            <UploadButton onUploaded={addPartner} label="Add brand logo" />
          </div>
          <p className="text-[10px] text-on-surface-variant mb-3">
            The first 8 orbit the centre logo; any more scroll in a strip below it. Square logos on a white or transparent background look best.
          </p>
          {c.partners.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-outline-variant p-10 text-center text-sm text-on-surface-variant">
              <ImageIcon className="h-8 w-8 text-outline mx-auto mb-2" />
              No brands yet — use “Add brand logo” to upload the first one.
            </div>
          ) : (
            <div className="space-y-2">
              {c.partners.map((p, i) => (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-outline-variant/30 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => movePartner(i, -1)} disabled={i === 0}
                        className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant disabled:opacity-30" aria-label="Move up">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => movePartner(i, 1)} disabled={i === c.partners.length - 1}
                        className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant disabled:opacity-30" aria-label="Move down">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="w-16 h-16 rounded-full border border-emerald-100 bg-white p-2 shrink-0">
                      <img src={p.logoUrl} alt={p.name} className="w-full h-full object-contain" />
                    </div>
                    {i >= 8 && (
                      <span className="text-[10px] font-black uppercase tracking-widest bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full">Strip</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-w-0">
                    <input value={p.name} placeholder="Brand name *"
                      onChange={e => updatePartner(p.id, { name: e.target.value })} className={inputCls} />
                    <input value={p.website ?? ""} placeholder="Website (optional) https://…"
                      onChange={e => updatePartner(p.id, { website: e.target.value })} className={inputCls} />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <UploadButton onUploaded={url => updatePartner(p.id, { logoUrl: url })} label="Replace" />
                    <button type="button" onClick={() => removePartner(p)}
                      className="p-3 rounded-2xl hover:bg-red-50 text-on-surface-variant hover:text-red-600 transition-colors" title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Presence ───────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-primary">Presence across India (animated map)</h2>
          <Toggle checked={c.presenceEnabled} onChange={v => update({ presenceEnabled: v })} label="Show on About page" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Heading (optional)</label>
            <input value={c.presenceTitle ?? ""} placeholder={DEFAULT_PRESENCE_TITLE}
              onChange={e => update({ presenceTitle: e.target.value })} className={inputCls} />
            <p className="text-[10px] text-on-surface-variant mt-1">Leave blank to use the translated default.</p>
          </div>
          <div>
            <label className={labelCls}>Sub-heading (optional)</label>
            <input value={c.presenceSubtitle ?? ""} placeholder="e.g. 275+ agri stores and 35+ manufacturers on KrishiDukan"
              onChange={e => update({ presenceSubtitle: e.target.value })} className={inputCls} />
          </div>
        </div>
        <p className="text-[10px] text-on-surface-variant">
          The map is built in: dots pop up across India with a smooth animation. It uses no store data, so it adds no reads.
        </p>
      </section>

      {/* ── Preview ────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <h2 className="text-xs font-black uppercase tracking-widest text-primary p-6 pb-0">Live preview</h2>
        <p className="text-xs text-on-surface-variant px-6 pt-1">Rendered by the same components as the public About page. Hidden sections are shown here too.</p>
        <div>
          {c.partners.length > 0 ? (
            <AboutPartnersSection
              label="Our Network"
              title={c.partnersTitle?.trim() || DEFAULT_PARTNERS_TITLE}
              subtitle={c.partnersSubtitle?.trim() || undefined}
              partners={c.partners.filter(p => p.logoUrl.trim())}
              centerLogoUrl={c.centerLogoUrl?.trim() || undefined}
            />
          ) : (
            <p className="p-6 text-sm text-on-surface-variant italic">Add a brand logo to preview the orbit.</p>
          )}
          <AboutPresenceSection
            label="Our Presence"
            title={c.presenceTitle?.trim() || DEFAULT_PRESENCE_TITLE}
            subtitle={c.presenceSubtitle?.trim() || undefined}
            mapLabel="Presence across India"
          />
        </div>
      </section>
    </div>
  );
}
