"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Banknote, CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldAlert, Upload, Zap } from "lucide-react";
import { db } from "../../firebase";

/**
 * Seller payout verification.
 *
 * A seller submits bank details plus KYC documents on their own Payouts page;
 * an admin checks the documents against the details here, then records the
 * Razorpay linked-account id that money will actually be transferred to.
 *
 * Documents are NOT read directly from Storage: storage.rules gives a seller
 * access to their own kyc/ folder and nobody else (Storage rules can't read
 * Firestore to check an admin role). They come from /api/admin/payout-kyc as
 * URLs that expire in minutes, so a copied link isn't a lasting leak.
 *
 * The linked account itself may be created either way:
 *   - In the Razorpay Dashboard (Route → Linked Accounts), pasting the
 *     resulting id here, OR
 *   - Via the Accounts API (POST /v2/accounts, then a product-configuration
 *     PATCH with the settlement bank details) — verified working against this
 *     live account with the plain merchant key/secret on 2026-09-04, no
 *     Partner-API access needed. An earlier version of this comment claimed
 *     the opposite; that was wrong.
 * Either way, this page only ever RECORDS the resulting id — it never creates
 * an account itself, so a bad id can't silently start routing money.
 */

type PayoutStatus = "pending_verification" | "verified" | "rejected";

type PayoutRow = {
  phone: string;
  accountHolderName?: string;
  accountLast4?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  accountType?: string;
  upiId?: string;
  pan?: string;
  status?: PayoutStatus;
  razorpayLinkedAccountId?: string;
  rejectionReason?: string;
  documents?: Record<string, { fileName?: string }>;
};

type SignedDoc = {
  type: string;
  url: string | null;
  fileName?: string;
  contentType?: string;
};

const DOC_LABELS: Record<string, string> = {
  pan_card: "PAN card",
  cancelled_cheque: "Cancelled cheque",
  address_proof: "Address proof",
  gst_certificate: "GST certificate",
  owner_photo: "Owner photo",
  trade_license: "Trade / product license",
};

const REQUIRED_DOCS = ["pan_card", "cancelled_cheque", "address_proof", "owner_photo", "trade_license"];

/** All doc types the upload-on-behalf-of-seller control can submit — the
 *  required set plus the optional GST certificate, same list kyc-documents.tsx
 *  offers the seller directly. */
const ALL_DOC_TYPES = [...REQUIRED_DOCS, "gst_certificate"];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<data>" — strip the prefix.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PayoutStatus | "all">("pending_verification");
  const [open, setOpen] = useState<PayoutRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "payoutAccounts"));
      setRows(snap.docs.map((d) => ({ phone: d.id, ...(d.data() as Omit<PayoutRow, "phone">) })));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { pending_verification: 0, verified: 0, rejected: 0 };
    for (const r of rows) {
      const s = (r.status ?? "pending_verification") as PayoutStatus;
      if (s in c) c[s] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? rows
        : rows.filter((r) => (r.status ?? "pending_verification") === filter),
    [rows, filter],
  );

  return (
    <div className="pb-16">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-on-surface">Seller Payouts</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Verify a seller&apos;s bank details against their documents, then record
          the Razorpay linked account their money is transferred to.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["pending_verification", `Pending (${counts.pending_verification})`],
            ["verified", `Verified (${counts.verified})`],
            ["rejected", `Rejected (${counts.rejected})`],
            ["all", `All (${rows.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value as PayoutStatus | "all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              filter === value
                ? "bg-primary text-white"
                : "border border-outline-variant/50 text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold hover:bg-surface-container"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <PayoutRunPanel />

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 p-10 text-center text-sm text-on-surface-variant">
          Nothing here.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <PayoutCard key={r.phone} row={r} onOpen={() => setOpen(r)} />
          ))}
        </div>
      )}

      {open && (
        <ReviewModal
          row={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: PayoutStatus }) {
  const s = status ?? "pending_verification";
  const cls =
    s === "verified"
      ? "bg-green-50 text-green-700"
      : s === "rejected"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-800";
  const label =
    s === "verified" ? "Verified" : s === "rejected" ? "Rejected" : "Pending";
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
  );
}

function PayoutCard({ row, onOpen }: { row: PayoutRow; onOpen: () => void }) {
  const submitted = Object.keys(row.documents ?? {});
  const missing = REQUIRED_DOCS.filter((d) => !submitted.includes(d));

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 text-left transition-colors hover:bg-surface-container-low"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-on-surface">
          {row.accountHolderName || row.phone}
        </span>
        <StatusBadge status={row.status} />
        {missing.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
            <ShieldAlert className="h-3 w-3" /> {missing.length} doc
            {missing.length === 1 ? "" : "s"} missing
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-xs text-on-surface-variant">{row.phone}</p>
      <p className="mt-1 text-sm text-on-surface-variant">
        {row.bankName ? `${row.bankName} · ` : ""}
        {row.accountLast4 ? `••••${row.accountLast4}` : "No account"}
        {row.ifsc ? ` · ${row.ifsc}` : ""}
      </p>
      {row.razorpayLinkedAccountId && (
        <p className="mt-1 font-mono text-xs text-green-700">
          {row.razorpayLinkedAccountId}
        </p>
      )}
    </button>
  );
}

function ReviewModal({
  row,
  onClose,
  onDone,
}: {
  row: PayoutRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [docs, setDocs] = useState<SignedDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [linkedId, setLinkedId] = useState(row.razorpayLinkedAccountId ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loginLink, setLoginLink] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{ accountId: string; activationStatus: string; warning?: string } | null>(null);

  const authedFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      const token = await getAuth().currentUser?.getIdToken();
      return fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
      });
    },
    [],
  );

  const loadDocs = useCallback(async () => {
    try {
      const res = await authedFetch(
        `/api/admin/payout-kyc?phone=${encodeURIComponent(row.phone)}`,
      );
      const json = await res.json();
      setDocs(res.ok ? (json.documents ?? []) : []);
    } catch {
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [row.phone, authedFetch]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // Uploads a document Storage would otherwise reject: storage.rules only
  // grants write access to the seller's own signed-in phone number (see
  // app/dashboard/_components/kyc-documents.tsx), so when the owner hands the
  // admin a scan directly — no login of their own set up yet — this goes
  // through the Admin SDK instead, same as viewing the documents already does.
  const uploadOnBehalf = async (docType: string, file: File) => {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`${DOC_LABELS[docType] ?? docType} must be under 5 MB.`);
      return;
    }
    const okType = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) {
      setUploadError(`${DOC_LABELS[docType] ?? docType} must be an image or a PDF.`);
      return;
    }

    setUploadingType(docType);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await authedFetch("/api/admin/payout-kyc", {
        method: "POST",
        body: JSON.stringify({
          phone: row.phone,
          action: "upload",
          docType,
          fileName: file.name,
          contentType: file.type,
          fileBase64,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Upload failed.");
        return;
      }
      await loadDocs();
    } catch {
      setUploadError("Could not reach the server.");
    } finally {
      setUploadingType(null);
    }
  };

  // Mints a one-hour custom-token login link for this seller's account, for
  // when nobody has access to the phone the account is registered to (so a
  // real OTP can't be received). See /api/admin/impersonate-seller — every
  // call is written to adminImpersonationLog.
  const generateLoginLink = async () => {
    setLoginBusy(true);
    setLoginError(null);
    setLoginLink(null);
    setCopied(false);
    try {
      const res = await authedFetch("/api/admin/impersonate-seller", {
        method: "POST",
        body: JSON.stringify({ phone: row.phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLoginError(json.error ?? "Could not create a login link.");
        return;
      }
      const url = `${window.location.origin}/login/impersonate#token=${encodeURIComponent(json.token)}`;
      setLoginLink(url);
    } catch {
      setLoginError("Could not reach the server.");
    } finally {
      setLoginBusy(false);
    }
  };

  // Creates the real Razorpay Route linked account (or, if it already exists,
  // resubmits the bank details) — see /api/admin/route-onboard-seller. On
  // success the id is dropped straight into the "Razorpay linked account id"
  // field below so admin can immediately hit Verify with a real id, instead
  // of round-tripping through the Razorpay Dashboard by hand.
  const createRouteAccount = async () => {
    setRouteBusy(true);
    setRouteError(null);
    setRouteResult(null);
    try {
      const res = await authedFetch("/api/admin/route-onboard-seller", {
        method: "POST",
        body: JSON.stringify({ phone: row.phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRouteError(json.error ?? "Could not create the Route account.");
        return;
      }
      setRouteResult({
        accountId: json.accountId,
        activationStatus: json.activationStatus,
        warning: json.warning,
      });
      if (json.accountId) setLinkedId(json.accountId);
    } catch {
      setRouteError("Could not reach the server.");
    } finally {
      setRouteBusy(false);
    }
  };

  const act = async (action: "verify" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/payout-kyc", {
        method: "POST",
        body: JSON.stringify({
          phone: row.phone,
          action,
          razorpayLinkedAccountId: linkedId,
          rejectionReason: reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not update.");
        return;
      }
      onDone();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  // Sourced from the live `docs` fetch (refreshed after every admin upload),
  // not the `row` prop — that only updates once the parent list reloads.
  const submitted = docs.filter((d) => d.url).map((d) => d.type);
  const missing = REQUIRED_DOCS.filter((d) => !submitted.includes(d));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 md:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-on-surface">
              {row.accountHolderName || row.phone}
            </h2>
            <p className="font-mono text-xs text-on-surface-variant">{row.phone}</p>
          </div>
          <StatusBadge status={row.status} />
        </div>

        {/* Bank details — what the documents must corroborate. */}
        <div className="mb-4 grid gap-2 rounded-xl border border-outline-variant/40 p-3 text-sm sm:grid-cols-2">
          <Field label="Account holder" value={row.accountHolderName} />
          <Field label="Account number" value={row.accountNumber} mono />
          <Field label="IFSC" value={row.ifsc} mono />
          <Field label="Bank" value={row.bankName} />
          <Field label="Type" value={row.accountType} />
          <Field label="PAN" value={row.pan} mono />
          {row.upiId && <Field label="UPI" value={row.upiId} mono />}
        </div>

        {/* Documents */}
        <h3 className="mb-2 text-sm font-bold text-on-surface">Documents</h3>
        {loadingDocs ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Generating secure links…
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No documents submitted.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li
                key={d.type}
                className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/30 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">
                    {DOC_LABELS[d.type] ?? d.type}
                  </p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {d.fileName ?? "—"}
                  </p>
                </div>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-container"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View
                  </a>
                ) : (
                  <span className="text-xs text-red-600">File missing</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {missing.length > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Still missing: {missing.map((m) => DOC_LABELS[m] ?? m).join(", ")}
          </p>
        )}

        {/* Upload on the seller's behalf — for the case where the owner has
            handed over a physical/scanned document but has no login of their
            own yet to upload it themselves. */}
        <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-3">
          <p className="text-xs font-semibold text-on-surface">
            Upload on the seller&apos;s behalf
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Use only when the owner has handed you the document directly and
            has not signed in to upload it themselves.
          </p>
          {uploadError && (
            <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
              {uploadError}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_DOC_TYPES.map((docType) => (
              <UploadChip
                key={docType}
                label={DOC_LABELS[docType] ?? docType}
                hasFile={submitted.includes(docType)}
                busy={uploadingType === docType}
                disabled={uploadingType !== null}
                onPick={(file) => void uploadOnBehalf(docType, file)}
              />
            ))}
          </div>
        </div>

        {/* Log in as this seller — for accounts with no reachable phone to
            receive a real OTP. */}
        <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
            <KeyRound className="h-3.5 w-3.5" /> Log in as this seller
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Use only when nobody can receive an OTP on {row.phone} — this
            generates a one-hour login link and is recorded in the admin log.
          </p>
          {loginError && (
            <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
              {loginError}
            </p>
          )}
          {!loginLink ? (
            <button
              type="button"
              disabled={loginBusy}
              onClick={() => void generateLoginLink()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-container disabled:opacity-50"
            >
              {loginBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              Generate login link
            </button>
          ) : (
            <div className="mt-2">
              <div className="flex items-center gap-2 rounded-lg border border-outline-variant/40 bg-white px-2.5 py-1.5">
                <code className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                  {loginLink}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(loginLink);
                    setCopied(true);
                  }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-outline-variant/50 px-2 py-1 text-xs font-semibold hover:bg-surface-container"
                >
                  <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                Open this in an <strong>Incognito / private window</strong>,
                not your current tab — it signs the browser in as this
                seller and will replace any admin session already open
                there. Valid for 1 hour.
              </p>
            </div>
          )}
        </div>

        {/* Automatic account creation — the real alternative to the manual
            Dashboard step below, using the bank details and profile already
            on file. */}
        <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
            <Zap className="h-3.5 w-3.5" /> Create the Razorpay account automatically
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Uses the bank details above and the seller&apos;s profile to create
            a real Route linked account via the API — no Razorpay Dashboard
            step, no id to find and paste by hand.
          </p>
          {routeError && (
            <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
              {routeError}
            </p>
          )}
          {routeResult && (
            <div className="mt-2 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs text-green-800">
              <p className="font-mono font-semibold">{routeResult.accountId}</p>
              <p className="mt-0.5">Status: {routeResult.activationStatus}</p>
              {routeResult.warning && (
                <p className="mt-0.5 text-amber-800">{routeResult.warning}</p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={routeBusy}
            onClick={() => void createRouteAccount()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-container disabled:opacity-50"
          >
            {routeBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {row.razorpayLinkedAccountId ? "Resubmit bank details" : "Create Route account"}
          </button>
        </div>

        {/* Linked account */}
        <div className="mt-5">
          <label className="text-sm font-bold text-on-surface">
            Razorpay linked account id
          </label>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Filled in automatically above, or create the linked account in the
            Razorpay Dashboard (Route → Linked Accounts) and paste its id here
            yourself. Money is transferred to this account — an id belonging
            to the wrong seller pays the wrong person.
          </p>
          <input
            value={linkedId}
            onChange={(e) => setLinkedId(e.target.value.trim())}
            placeholder="acc_XXXXXXXXXXXXXX"
            className="mt-2 w-full rounded-xl border border-outline-variant/40 px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          />
        </div>

        {/* Rejection reason */}
        <div className="mt-4">
          <label className="text-sm font-bold text-on-surface">
            Rejection reason
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Shown to the seller so they know what to fix"
            className="mt-2 w-full rounded-xl border border-outline-variant/40 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => void act("verify")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" /> Verify &amp; enable payouts
          </button>
          <button
            disabled={busy}
            onClick={() => void act("reject")}
            className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-60"
          >
            Reject
          </button>
          <button
            onClick={onClose}
            className="ml-auto rounded-xl border border-outline-variant/50 px-4 py-2.5 text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadChip({
  label,
  hasFile,
  busy,
  disabled,
  onPick,
}: {
  label: string;
  hasFile: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${
          hasFile
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-outline-variant/50 text-on-surface hover:bg-surface-container"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : hasFile ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className={`text-sm text-on-surface ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}


type RunResult = {
  seller: string;
  orders: string[];
  amount: number;
  status: "transferred" | "skipped" | "failed" | "preview";
  reason?: string;
  transferId?: string;
};

type RunResponse = {
  dryRun: boolean;
  holdDays: number;
  totals: {
    transferred: number;
    transferredCount: number;
    payable: number;
    payableCount: number;
    failedCount: number;
    skippedCount: number;
  };
  results: RunResult[];
  error?: string;
};

/**
 * Runs a payout batch.
 *
 * Preview is always available; the live run is deliberately behind a typed
 * confirmation, because it moves real money to real bank accounts and cannot
 * be undone from this screen — reversing a Route transfer is a separate
 * operation on Razorpay's side.
 */
function PayoutRunPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  // The kill-switch lives in settings/payouts, which clients cannot write
  // (firestore.rules: settings is write:false), so it is read and set through
  // the same admin route.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [togglingFlag, setTogglingFlag] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAuth().currentUser?.getIdToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/payout-transfer", {
          headers: await authHeaders(),
        });
        const json = await res.json();
        if (!cancelled && res.ok) setEnabled(json.transfersEnabled === true);
      } catch {
        /* leave unknown; the toggle shows a neutral state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const toggleFlag = async (next: boolean) => {
    setTogglingFlag(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payout-transfer", {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ transfersEnabled: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not update the setting.");
        return;
      }
      setEnabled(next);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setTogglingFlag(false);
    }
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/payout-transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ dryRun }),
      });
      const json = (await res.json()) as RunResponse;
      if (!res.ok) {
        setError(json.error ?? "Payout run failed.");
        setResult(null);
        return;
      }
      setResult(json);
      if (!dryRun) setConfirm("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <section className="mb-5 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4">
      {/* Kill-switch. Off means a live run is refused server-side, so this is
          the real gate, not just a UI affordance. */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2">
        <span className="text-sm font-semibold text-on-surface">Live transfers</span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-bold ${
            enabled === null
              ? "bg-surface-container text-on-surface-variant"
              : enabled
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-800"
          }`}
        >
          {enabled === null ? "Checking…" : enabled ? "Enabled" : "Disabled"}
        </span>
        <span className="text-xs text-on-surface-variant">
          {enabled
            ? "Payout runs can move real money."
            : "Preview works; a live run will be refused."}
        </span>
        <button
          disabled={togglingFlag || enabled === null}
          onClick={() => void toggleFlag(!enabled)}
          className="ml-auto rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold hover:bg-surface-container disabled:opacity-60"
        >
          {togglingFlag ? "Saving…" : enabled ? "Disable" : "Enable"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Banknote className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-on-surface">Release due payouts</h2>
          <p className="text-xs text-on-surface-variant">
            Pays verified sellers for orders delivered more than{" "}
            {result?.holdDays ?? 7} days ago. Preview first — a live run cannot
            be undone here.
          </p>
        </div>
        <button
          onClick={() => void run(true)}
          disabled={busy}
          className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold hover:bg-surface-container disabled:opacity-60"
        >
          {busy ? "Working…" : "Preview"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {result.dryRun ? (
              <span className="font-semibold text-on-surface">
                {result.totals.payableCount} seller
                {result.totals.payableCount === 1 ? "" : "s"} payable ·{" "}
                {inr(result.totals.payable)}
              </span>
            ) : (
              <span className="font-semibold text-green-700">
                Paid {result.totals.transferredCount} seller
                {result.totals.transferredCount === 1 ? "" : "s"} ·{" "}
                {inr(result.totals.transferred)}
              </span>
            )}
            {result.totals.skippedCount > 0 && (
              <span className="text-on-surface-variant">
                {result.totals.skippedCount} skipped
              </span>
            )}
            {result.totals.failedCount > 0 && (
              <span className="font-semibold text-red-700">
                {result.totals.failedCount} failed
              </span>
            )}
          </div>

          {result.results.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {result.results.map((r) => (
                <li
                  key={r.seller}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant/30 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-on-surface-variant">{r.seller}</span>
                  <span className="font-semibold text-on-surface">{inr(r.amount)}</span>
                  <span className="text-on-surface-variant">
                    {r.orders.length} order{r.orders.length === 1 ? "" : "s"}
                  </span>
                  <span
                    className={
                      r.status === "failed"
                        ? "font-semibold text-red-700"
                        : r.status === "transferred"
                          ? "font-semibold text-green-700"
                          : "text-on-surface-variant"
                    }
                  >
                    {r.status}
                    {r.reason ? ` · ${r.reason}` : ""}
                    {r.transferId ? ` · ${r.transferId}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result.dryRun && result.totals.payableCount > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">
                Transfer {inr(result.totals.payable)} to{" "}
                {result.totals.payableCount} seller
                {result.totals.payableCount === 1 ? "" : "s"}?
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                This moves real money and cannot be undone from this screen.
                Type <strong>TRANSFER</strong> to confirm.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                  placeholder="TRANSFER"
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm outline-none"
                />
                <button
                  disabled={busy || confirm !== "TRANSFER"}
                  onClick={() => void run(false)}
                  className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  Release payouts
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
