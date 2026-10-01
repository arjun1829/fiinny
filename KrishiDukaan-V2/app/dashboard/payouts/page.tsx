"use client";

/**
 * Dashboard → Payouts. Where a seller registers the bank account their order
 * money is sent to.
 *
 * Storage: payoutAccounts/{phone} — a collection that is deliberately NOT
 * profiles/{phone} (public read) or users/{phone} (readable by every retailer
 * and manufacturer). Bank details in either of those would be visible
 * platform-wide. See the payoutAccounts block in firestore.rules.
 *
 * The account number is written once and never rendered back in full: after
 * saving, the UI shows ••••1234 and changing it requires typing the whole
 * number again. That way a shoulder-surfer or a shared screen never exposes
 * an account, and a mistyped digit can't hide behind a prefilled field.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  Landmark,
  Loader2,
  Save,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  Pencil,
} from "lucide-react";
import { db } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { KycDocuments } from "../_components/kyc-documents";
import { SellerEarningsPanel } from "../_components/seller-earnings-panel";
import { useEffectiveUser } from "../_context/effective-user-context";

// ─── validation ───────────────────────────────────────────────────────────────

/** RBI IFSC format: 4 letters, a literal 0, then 6 alphanumerics. */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian account numbers run 9–18 digits depending on the bank. */
const ACCOUNT_RE = /^\d{9,18}$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

type AccountType = "savings" | "current";

type PayoutAccount = {
  accountHolderName: string;
  accountNumber: string;
  accountLast4: string;
  ifsc: string;
  bankName?: string;
  accountType: AccountType;
  upiId?: string;
  pan?: string;
  status: "pending_verification" | "verified" | "rejected";
  updatedAt?: unknown;
};

type FormState = {
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  bankName: string;
  accountType: AccountType;
  upiId: string;
  pan: string;
};

const EMPTY_FORM: FormState = {
  accountHolderName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifsc: "",
  bankName: "",
  accountType: "savings",
  upiId: "",
  pan: "",
};

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const e: Partial<Record<keyof FormState, string>> = {};

  if (!f.accountHolderName.trim()) {
    e.accountHolderName = "Enter the name exactly as it appears on the bank account.";
  }
  if (!ACCOUNT_RE.test(f.accountNumber.trim())) {
    e.accountNumber = "Account number must be 9–18 digits, no spaces.";
  }
  if (f.confirmAccountNumber.trim() !== f.accountNumber.trim()) {
    e.confirmAccountNumber = "The two account numbers do not match.";
  }
  if (!IFSC_RE.test(f.ifsc.trim().toUpperCase())) {
    e.ifsc = "IFSC looks wrong — it should be like SBIN0001234.";
  }
  if (f.upiId.trim() && !UPI_RE.test(f.upiId.trim())) {
    e.upiId = "UPI ID should look like name@bank.";
  }
  if (f.pan.trim() && !PAN_RE.test(f.pan.trim().toUpperCase())) {
    e.pan = "PAN should look like ABCDE1234F.";
  }
  return e;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const { uid, profile, isAdminView } = useEffectiveUser();

  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PayoutAccount | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // users/{phone} is the canonical key, but getUserProfile() drops the doc ID —
  // so the phone may be absent from the profile object. uidIndex is the map.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid) return;
      let resolved = String(profile?.phone ?? "").trim();
      if (!resolved) {
        try {
          const idx = await getDoc(doc(db, "uidIndex", uid));
          if (idx.exists()) resolved = String(idx.data()?.phone ?? "").trim();
        } catch {
          /* fall through — handled by the empty-phone guard below */
        }
      }
      if (!cancelled) setPhone(resolved);
    })();
    return () => { cancelled = true; };
  }, [uid, profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!phone) { if (uid) setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "payoutAccounts", phone));
        if (cancelled) return;
        if (snap.exists()) {
          setSaved(snap.data() as PayoutAccount);
          setEditing(false);
        } else {
          setEditing(true);
        }
      } catch {
        if (!cancelled) {
          setStatus({ type: "error", message: "Could not load your payout account." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phone, uid]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setStatus(null);
  }, []);

  const handleSave = async () => {
    if (!phone) {
      setStatus({ type: "error", message: "No phone number on your account — complete your profile first." });
      return;
    }
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setStatus(null);
    try {
      const accountNumber = form.accountNumber.trim();
      const record: PayoutAccount = {
        accountHolderName: form.accountHolderName.trim(),
        accountNumber,
        accountLast4: accountNumber.slice(-4),
        ifsc: form.ifsc.trim().toUpperCase(),
        accountType: form.accountType,
        // A re-submitted account has to be re-checked before money moves.
        status: "pending_verification",
      };
      if (form.bankName.trim()) record.bankName = form.bankName.trim();
      if (form.upiId.trim()) record.upiId = form.upiId.trim();
      if (form.pan.trim()) record.pan = form.pan.trim().toUpperCase();

      await setDoc(
        doc(db, "payoutAccounts", phone),
        { ...record, phone, updatedAt: serverTimestamp() },
        { merge: true },
      );

      setSaved(record);
      setEditing(false);
      setForm(EMPTY_FORM);
      setStatus({ type: "success", message: "Bank account saved. Payouts will be sent here." });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Could not save your bank account.",
      });
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (!saved) return null;
    const map = {
      verified: { label: "Verified", cls: "bg-green-100 text-green-700", Icon: ShieldCheck },
      pending_verification: { label: "Pending verification", cls: "bg-amber-100 text-amber-700", Icon: Info },
      rejected: { label: "Rejected", cls: "bg-red-100 text-red-700", Icon: AlertTriangle },
    } as const;
    return map[saved.status] ?? map.pending_verification;
  }, [saved]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Payouts"
        description="The bank account your order money is sent to. You receive the order amount less the KrishiDukan platform fee, the payment gateway's own charges and applicable taxes."
      />

      {/* What they're owed, before the mechanics of where it's sent. */}
      <div className="mb-6">
        <SellerEarningsPanel uid={uid} profile={profile} />
      </div>

      {/* How payouts work — set expectations before they type anything. */}
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold">How you get paid</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-blue-800">
              <li>Money is transferred once you mark the order <strong>Delivered</strong>.</li>
              <li>
                The <strong>KrishiDukan platform fee</strong> and the{" "}
                <strong>payment gateway&apos;s charges</strong> are deducted — the exact
                amounts are shown on each order.
              </li>
              <li>
                GST and other applicable taxes are charged at the rates prescribed under
                applicable law.
              </li>
              <li>
                Settlement timing depends on the payment service provider and your
                account setup. Full terms:{" "}
                <a
                  href="/seller-terms"
                  className="font-semibold underline hover:text-blue-950"
                >
                  Seller &amp; Manufacturer Subscription Terms
                </a>
                .
              </li>
            </ul>
          </div>
        </div>
      </div>

      {isAdminView ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            You are viewing another seller&apos;s dashboard. Bank details can only be entered by the
            account holder — this page is read-only here.
          </p>
        </div>
      ) : null}

      {status ? (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <p>{status.message}</p>
        </div>
      ) : null}

      {/* ── Saved account (masked) ── */}
      {saved && !editing ? (
        <div className="rounded-2xl border border-outline-variant bg-surface p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="rounded-xl bg-primary-container p-2.5">
                <Landmark className="h-5 w-5 text-on-primary-container" />
              </div>
              <div>
                <p className="font-semibold text-on-surface">{saved.accountHolderName}</p>
                <p className="mt-0.5 font-mono text-sm text-on-surface-variant">
                  ••••&nbsp;••••&nbsp;{saved.accountLast4}
                </p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {saved.bankName ? `${saved.bankName} · ` : ""}
                  <span className="font-mono">{saved.ifsc}</span>
                  {" · "}
                  {saved.accountType === "current" ? "Current" : "Savings"}
                </p>
                {saved.upiId ? (
                  <p className="mt-1 text-sm text-on-surface-variant">
                    UPI <span className="font-mono">{saved.upiId}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              {statusBadge ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge.cls}`}
                >
                  <statusBadge.Icon className="h-3.5 w-3.5" />
                  {statusBadge.label}
                </span>
              ) : null}
              {!isAdminView ? (
                <button
                  type="button"
                  onClick={() => { setForm(EMPTY_FORM); setEditing(true); setStatus(null); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-variant"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Change
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Entry form ── */}
      {editing && !isAdminView ? (
        <div className="rounded-2xl border border-outline-variant bg-surface p-5 md:p-6">
          <h2 className="mb-1 text-lg font-semibold text-on-surface">
            {saved ? "Change bank account" : "Add your bank account"}
          </h2>
          <p className="mb-5 text-sm text-on-surface-variant">
            Enter the details exactly as they appear in your passbook. A wrong digit means the
            money goes nowhere — or to someone else.
          </p>

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="Account holder name"
              value={form.accountHolderName}
              onChange={(v) => set("accountHolderName", v)}
              error={errors.accountHolderName}
              placeholder="As printed on your passbook"
              className="md:col-span-2"
            />

            <Field
              label="Account number"
              value={form.accountNumber}
              onChange={(v) => set("accountNumber", v.replace(/\D/g, ""))}
              error={errors.accountNumber}
              placeholder="9–18 digits"
              inputMode="numeric"
              mono
            />

            <Field
              label="Re-enter account number"
              value={form.confirmAccountNumber}
              onChange={(v) => set("confirmAccountNumber", v.replace(/\D/g, ""))}
              error={errors.confirmAccountNumber}
              placeholder="Type it again"
              inputMode="numeric"
              mono
              // Pasting defeats the point of a confirmation field.
              onPaste={(e) => e.preventDefault()}
            />

            <Field
              label="IFSC code"
              value={form.ifsc}
              onChange={(v) => set("ifsc", v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              error={errors.ifsc}
              placeholder="SBIN0001234"
              mono
            />

            <Field
              label="Bank name"
              value={form.bankName}
              onChange={(v) => set("bankName", v)}
              placeholder="Optional"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface">
                Account type
              </label>
              <select
                value={form.accountType}
                onChange={(e) => set("accountType", e.target.value as AccountType)}
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="savings">Savings</option>
                <option value="current">Current</option>
              </select>
            </div>

            <Field
              label="UPI ID"
              value={form.upiId}
              onChange={(v) => set("upiId", v)}
              error={errors.upiId}
              placeholder="Optional — name@bank"
              mono
            />

            <Field
              label="PAN"
              value={form.pan}
              onChange={(v) => set("pan", v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              error={errors.pan}
              placeholder="Optional — ABCDE1234F"
              mono
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save bank account"}
            </button>
            {saved ? (
              <button
                type="button"
                onClick={() => { setEditing(false); setErrors({}); setStatus(null); }}
                disabled={saving}
                className="rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-variant disabled:opacity-60"
              >
                Cancel
              </button>
            ) : null}
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs text-on-surface-variant">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            These details are visible only to you and are used solely to send your order payouts.
          </p>
        </div>
      ) : null}

      {/* Supporting evidence for the bank details above. Kept outside the
          edit/view toggle so a seller can add a missing document without
          re-opening and re-submitting the whole bank form. */}
      {phone ? (
        <div className="mt-6">
          <KycDocuments
            phone={phone}
            // Once verified, the documents are the basis of that decision —
            // changing them silently would leave the approval unbacked.
            readOnly={saved?.status === "verified"}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── field ────────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  className = "",
  inputMode,
  mono = false,
  onPaste,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
  inputMode?: "numeric" | "text";
  mono?: boolean;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-on-surface">{label}</label>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        autoComplete="off"
        className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none ${
          mono ? "font-mono tracking-wide" : ""
        } ${
          error
            ? "border-red-400 focus:border-red-500"
            : "border-outline-variant focus:border-primary"
        }`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
