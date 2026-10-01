"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { CheckCircle2, ChevronDown, FileText, Loader2, Upload, X } from "lucide-react";
import { db, storage } from "../../firebase";

/**
 * Seller KYC document collection.
 *
 * Razorpay Route linked accounts require identity and bank proof before a
 * seller can be paid, and the platform needs those on file regardless of when
 * Route goes live. Bank NUMBERS are collected by the payouts form; this is the
 * supporting evidence for them.
 *
 * Files go to Storage under `kyc/{phone}/` — a deliberately PRIVATE prefix.
 * Every other prefix in storage.rules is `read: if true` because those assets
 * are meant to be public (product photos, shared invoices); a PAN card is not.
 * Only the owning seller can read or write their own folder; admin review goes
 * through a server route using the Admin SDK, because Storage rules cannot
 * read Firestore to check a role.
 *
 * Metadata (not the file) is mirrored onto `payoutAccounts/{phone}.documents`
 * so the admin list can show what has been submitted without touching Storage.
 */

export type KycDocType =
  | "pan_card"
  | "cancelled_cheque"
  | "gst_certificate"
  | "address_proof"
  | "owner_photo"
  | "trade_license";

type DocSpec = {
  type: KycDocType;
  label: string;
  hint: string;
  required: boolean;
  /** Shown immediately vs. tucked behind "More documents". A seller who
   *  sees all six upload rows at once tends to stall out — leading with the
   *  two that establish who they are keeps the first screen short; the rest
   *  are still required, just not part of the opening ask. */
  front: boolean;
};

/** Required set matches what Razorpay asks for on an individual/proprietor
 *  linked account; GST is optional because a small seller may not be
 *  registered, and the profile already stores a `gstin` string separately. */
const DOC_SPECS: DocSpec[] = [
  {
    type: "pan_card",
    label: "PAN card",
    hint: "Photo or PDF of the PAN card matching the account holder name",
    required: true,
    front: true,
  },
  {
    type: "trade_license",
    label: "Trade / product license",
    hint: "Shop establishment, FSSAI, mandi, or other license permitting you to sell agri produce or inputs",
    required: true,
    front: true,
  },
  {
    type: "cancelled_cheque",
    label: "Cancelled cheque or passbook",
    hint: "Must clearly show account number, IFSC and holder name",
    required: true,
    front: false,
  },
  {
    type: "address_proof",
    label: "Address proof",
    hint: "Aadhaar, electricity bill or shop licence",
    required: true,
    front: false,
  },
  {
    type: "owner_photo",
    label: "Owner photo",
    hint: "A clear photo of the account holder's face, for identity verification",
    required: true,
    front: false,
  },
  {
    type: "gst_certificate",
    label: "GST certificate",
    hint: "Only if your business is GST registered",
    required: false,
    front: false,
  },
];

export type KycDocumentMeta = {
  type: KycDocType;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
  uploadedAt?: unknown;
};

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf";

export function KycDocuments({
  phone,
  /** Locks the whole section once an admin has verified the account. */
  readOnly = false,
}: {
  phone: string;
  readOnly?: boolean;
}) {
  const [docs, setDocs] = useState<Record<string, KycDocumentMeta>>({});
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<KycDocType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!phone) {
      setLoading(false);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "payoutAccounts", phone));
      const raw = snap.exists() ? (snap.data().documents ?? {}) : {};
      setDocs(typeof raw === "object" && raw !== null ? raw : {});
    } catch {
      // A missing doc is the normal first-run case, not an error worth showing.
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (spec: DocSpec, file: File) => {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError(`${spec.label} must be under 5 MB.`);
      return;
    }
    const okType =
      file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) {
      setError(`${spec.label} must be an image or a PDF.`);
      return;
    }

    setBusyType(spec.type);
    try {
      // Fixed filename per type: re-uploading REPLACES rather than piling up
      // copies, and storage.rules allows no delete so stale files would
      // otherwise be unremovable.
      const ext = file.type === "application/pdf" ? "pdf" : "jpg";
      const storagePath = `kyc/${phone}/${spec.type}.${ext}`;
      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type,
      });

      const meta: KycDocumentMeta = {
        type: spec.type,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        storagePath,
        uploadedAt: serverTimestamp(),
      };

      // Only metadata is mirrored to Firestore — never a download URL, which
      // would be a long-lived link to a private document.
      await setDoc(
        doc(db, "payoutAccounts", phone),
        {
          phone,
          documents: { [spec.type]: meta },
          // Any new evidence puts the account back in the review queue.
          status: "pending_verification",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setDocs((prev) => ({ ...prev, [spec.type]: meta }));
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not upload ${spec.label}: ${e.message}`
          : `Could not upload ${spec.label}.`,
      );
    } finally {
      setBusyType(null);
    }
  };

  const missingRequired = DOC_SPECS.filter(
    (s) => s.required && !docs[s.type],
  ).length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 md:p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-on-surface">Verification documents</h2>
        {missingRequired === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> All submitted
          </span>
        ) : (
          <span className="text-xs font-semibold text-on-surface-variant">
            {missingRequired} still needed
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-on-surface-variant">
        Required before payouts can be released to your bank account. Only you
        and our verification team can see these files.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {DOC_SPECS.filter((s) => s.front).map((spec) => (
          <DocRow
            key={spec.type}
            spec={spec}
            existing={docs[spec.type]}
            busy={busyType === spec.type}
            disabled={readOnly || busyType !== null}
            readOnly={readOnly}
            onPick={(file) => void upload(spec, file)}
          />
        ))}

        <MoreDocuments defaultOpen={readOnly}>
          {DOC_SPECS.filter((s) => !s.front).map((spec) => (
            <DocRow
              key={spec.type}
              spec={spec}
              existing={docs[spec.type]}
              busy={busyType === spec.type}
              disabled={readOnly || busyType !== null}
              readOnly={readOnly}
              onPick={(file) => void upload(spec, file)}
            />
          ))}
        </MoreDocuments>
      </div>
    </section>
  );
}

/** Collapsed by default so the opening ask is two uploads, not six — expanded
 *  automatically in the read-only (verified) view, where there's nothing left
 *  to fill in and a seller checking their own file wants to see all of it. */
function MoreDocuments({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-on-surface"
      >
        More documents
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-outline-variant/20 p-3 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

function DocRow({
  spec,
  existing,
  busy,
  disabled,
  readOnly,
  onPick,
}: {
  spec: DocSpec;
  existing?: KycDocumentMeta;
  busy: boolean;
  disabled: boolean;
  readOnly: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);

  const openOwnCopy = async () => {
    if (!existing) return;
    setPreviewing(true);
    try {
      // The seller can read their own folder directly (storage.rules), so no
      // server round-trip is needed for their own preview.
      const url = await getDownloadURL(ref(storage, existing.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* preview is a convenience; failing it must not break the page */
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low/60 p-3">
      <div className={`mt-0.5 shrink-0 ${existing ? "text-green-600" : "text-on-surface-variant/50"}`}>
        {existing ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-on-surface">
          {spec.label}
          {!spec.required && (
            <span className="ml-1.5 text-xs font-normal text-on-surface-variant">
              (optional)
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-on-surface-variant">{spec.hint}</p>

        {existing && (
          <button
            type="button"
            onClick={() => void openOwnCopy()}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {previewing ? "Opening…" : existing.fileName}
          </button>
        )}
      </div>

      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so re-picking the SAME file still fires onChange.
              e.target.value = "";
              if (file) onPick(file);
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" /> {existing ? "Replace" : "Upload"}
              </>
            )}
          </button>
        </>
      )}

      {readOnly && !existing && (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant/40" />
      )}
    </div>
  );
}
