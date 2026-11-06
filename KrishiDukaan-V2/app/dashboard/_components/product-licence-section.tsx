"use client";

import { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, ShieldCheck, Upload } from "lucide-react";

import { storage } from "../../firebase";
import { INDIAN_STATES } from "../_types/delivery-settings";
import { resolveRetailerPhone } from "../_lib/retailer-brand-firestore";
import {
  licenceComplete,
  licenceExpired,
  type ProductLicence,
} from "../../lib/product-licence";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * "Selling licence" block on a manufacturer's product: which states the
 * product may be delivered to (checkout enforces it — lib/sell-area.ts), the
 * licence document and its number / validity. Retailers in the manufacturer's
 * network selling this product follow the same states.
 *
 * The document is uploaded straight to the manufacturer's private Storage
 * folder (kyc/{phone}/, owner-only, like KYC); only its metadata is kept on
 * the product.
 */
export function ProductLicenceSection({
  value,
  onChange,
  ownerUid,
  profilePhone,
  disabled,
  wantsOnline,
}: {
  value: ProductLicence | null;
  onChange: (next: ProductLicence | null) => void;
  /** The manufacturer's uid (resolves their phone for the upload folder). */
  ownerUid: string | null;
  profilePhone?: unknown;
  disabled?: boolean;
  /** Online delivery is switched on — the licence is needed then. */
  wantsOnline: boolean;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!ownerUid) return;
    resolveRetailerPhone(ownerUid, profilePhone).then((p) => { if (!cancelled) setPhone(p); });
    return () => { cancelled = true; };
  }, [ownerUid, profilePhone]);

  const lic: ProductLicence = value ?? { states: [] };
  const set = (patch: Partial<ProductLicence>) => onChange({ ...lic, ...patch });
  const selected = useMemo(() => new Set(lic.states), [lic.states]);
  const complete = licenceComplete(value);
  const expired = licenceExpired(value);
  const shown = INDIAN_STATES.filter((s) => s.toLowerCase().includes(filter.trim().toLowerCase()));

  const toggleState = (s: string) => {
    const next = new Set(selected);
    if (next.has(s)) next.delete(s); else next.add(s);
    set({ states: INDIAN_STATES.filter((x) => next.has(x)) });
  };

  const upload = async (file: File) => {
    setError(null);
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      setError("Upload the licence as a PDF or a photo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The file is larger than 10 MB.");
      return;
    }
    if (!phone) {
      setError("Couldn't find your phone number to store the licence. Refresh and try again.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "application/pdf" ? "pdf" : "jpg";
      const path = `kyc/${phone}/licence_${Date.now()}.${ext}`;
      await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      set({ file: { storagePath: path, fileName: file.name, contentType: file.type, size: file.size } });
    } catch (e) {
      console.error("[licence] upload failed", e);
      setError("Upload failed. Only the manufacturer's own login can upload its licence — please sign in as the manufacturer and try again.");
    } finally {
      setUploading(false);
    }
  };

  const view = async () => {
    if (!lic.file) return;
    try {
      window.open(await getDownloadURL(storageRef(storage, lic.file.storagePath)), "_blank", "noopener");
    } catch {
      setError("Couldn't open the licence file.");
    }
  };

  const status = !value || (lic.states.length === 0 && !lic.file)
    ? { tone: "amber", text: "Licence missing" }
    : !complete
      ? { tone: "amber", text: lic.file ? "Choose the licensed states" : "Upload the licence document" }
      : expired
        ? { tone: "red", text: "Licence expired" }
        : { tone: "green", text: `Licensed for ${lic.states.length === INDIAN_STATES.length ? "all of India" : `${lic.states.length} state${lic.states.length === 1 ? "" : "s"}`}` };

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <ShieldCheck className="h-4 w-4 text-primary" /> Selling licence
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
          status.tone === "green" ? "bg-emerald-100 text-emerald-800"
            : status.tone === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
        }`}>
          {status.tone === "green" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {status.text}
        </span>
      </div>
      <p className="text-xs text-on-surface-variant">
        Customers can order this product online only for delivery addresses in the states your licence covers.
        Retailers in your network selling it follow the same states. In-store sales are not affected.
      </p>
      {wantsOnline && !complete && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          To sell this product online, upload its licence and choose the states it covers.
        </p>
      )}

      {/* States */}
      <div className="rounded-xl border border-outline-variant/25 bg-white p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-on-surface">Licensed states *</span>
          <span className="text-xs text-on-surface-variant">{lic.states.length} selected</span>
          <div className="ml-auto flex gap-2">
            <button type="button" disabled={disabled}
              onClick={() => set({ states: [...INDIAN_STATES] })}
              className="rounded-lg border border-outline-variant/40 px-2 py-1 text-[11px] font-semibold hover:bg-surface-container disabled:opacity-50">
              All India
            </button>
            <button type="button" disabled={disabled || lic.states.length === 0}
              onClick={() => set({ states: [] })}
              className="rounded-lg border border-outline-variant/40 px-2 py-1 text-[11px] font-semibold hover:bg-surface-container disabled:opacity-50">
              Clear
            </button>
          </div>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search states…"
          className="rounded-lg border border-outline-variant/40 px-3 py-1.5 text-sm"
        />
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {shown.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => toggleState(s)}
              aria-pressed={selected.has(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                selected.has(s)
                  ? "border-primary bg-primary text-white"
                  : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Number + validity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface">
          Licence number
          <input
            value={lic.number ?? ""}
            onChange={(e) => set({ number: e.target.value })}
            disabled={disabled}
            maxLength={60}
            placeholder="e.g. MH/FERT/2026/1234"
            className="rounded-lg border border-outline-variant/40 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface">
          Valid until
          <input
            type="date"
            value={lic.validUntil ?? ""}
            onChange={(e) => set({ validUntil: e.target.value || undefined })}
            disabled={disabled}
            className="rounded-lg border border-outline-variant/40 px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>

      {/* Document */}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-primary/40 bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 ${
          disabled || uploading ? "pointer-events-none opacity-60" : ""
        }`}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {lic.file ? "Replace licence document" : "Upload licence document *"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            disabled={disabled || uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
        {lic.file && (
          <button type="button" onClick={() => void view()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container">
            <FileText className="h-4 w-4" />
            <span className="max-w-[12rem] truncate">{lic.file.fileName}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-[11px] text-on-surface-variant">PDF or photo, up to 10 MB. Kept private — only you and KrishiDukan admins can see it.</span>
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
