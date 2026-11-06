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
  Circle,
} from "lucide-react";
import { db } from "../../firebase";
import {
  ACCOUNT_RE,
  IFSC_RE,
  KYC_ITEM_LABEL,
  isValidGstin,
  isValidHolderName,
  isValidPan,
  kycMissing,
  panFromGstin,
  type IfscInfo,
  type KycAccount,
} from "../../lib/kyc";
import { PageHeader } from "../_components/page-header";
import { KycDocuments } from "../_components/kyc-documents";
import { SellerEarningsPanel } from "../_components/seller-earnings-panel";
import { useEffectiveUser } from "../_context/effective-user-context";

// ─── validation ───────────────────────────────────────────────────────────────

type PayoutAccount = KycAccount & {
  accountHolderName: string;
  accountNumber: string;
  accountLast4: string;
  ifsc: string;
  bankName?: string;
  branchName?: string;
  accountType?: AccountType;
  upiId?: string;
  pan?: string;
  gstin?: string;
  status: "pending_verification" | "verified" | "rejected";
  rejectionReason?: string;
  updatedAt?: unknown;
};

type AccountType = "savings" | "current";

type FormState = {
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  bankName: string;
  branchName: string;
  gstin: string;
  pan: string;
};

const EMPTY_FORM: FormState = {
  accountHolderName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifsc: "",
  bankName: "",
  branchName: "",
  gstin: "",
  pan: "",
};

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const e: Partial<Record<keyof FormState, string>> = {};

  if (!isValidHolderName(f.accountHolderName)) {
    e.accountHolderName = "Enter the name exactly as it appears on the bank account (letters only).";
  }
  if (f.bankName.trim().length < 2) {
    e.bankName = "Enter your bank name (filled in from the IFSC).";
  }
  if (!IFSC_RE.test(f.ifsc.trim().toUpperCase())) {
    e.ifsc = "IFSC should look like SBIN0001234. It is printed on your cheque book and passbook.";
  }
  if (!ACCOUNT_RE.test(f.accountNumber.trim())) {
    e.accountNumber = "Account number must be 9–18 digits, no spaces.";
  }
  if (!f.confirmAccountNumber.trim()) {
    e.confirmAccountNumber = "Enter the account number again.";
  } else if (f.confirmAccountNumber.trim() !== f.accountNumber.trim()) {
    e.confirmAccountNumber = "The two account numbers do not match.";
  }
  const gstin = f.gstin.trim().toUpperCase();
  if (gstin && !isValidGstin(gstin)) {
    e.gstin = "This GST number doesn't look right. Please check each character.";
  }
  const pan = panFromGstin(gstin) ?? f.pan.trim().toUpperCase();
  if (!isValidPan(pan)) {
    e.pan = "Enter your PAN, like ABCPK1234L. Or enter your GST number above.";
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
          setForm({ ...EMPTY_FORM, gstin: String(profile?.gstin ?? "") });
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

  const [ifscInfo, setIfscInfo] = useState<{ code: string; info?: IfscInfo; error?: string } | null>(null);

  // Bank and branch come from the IFSC, so the seller types one code instead
  // of two names. A failed lookup just leaves the fields for them to fill.
  useEffect(() => {
    const code = form.ifsc.trim().toUpperCase();
    if (!IFSC_RE.test(code) || ifscInfo?.code === code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ifsc?code=${code}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const info = json as IfscInfo;
          setIfscInfo({ code, info });
          setForm((f) => ({ ...f, bankName: info.bank || f.bankName, branchName: info.branch || f.branchName }));
        } else {
          setIfscInfo({ code, error: res.status === 404 ? json.error : undefined });
        }
      } catch {
        if (!cancelled) setIfscInfo({ code });
      }
    })();
    return () => { cancelled = true; };
  }, [form.ifsc, ifscInfo?.code]);

  const startEditing = () => {
    // Everything but the account number comes back prefilled; the number is
    // always typed fresh (twice), so a wrong digit can't hide in a prefill.
    setForm({
      ...EMPTY_FORM,
      accountHolderName: saved?.accountHolderName ?? "",
      ifsc: saved?.ifsc ?? "",
      bankName: saved?.bankName ?? "",
      branchName: saved?.branchName ?? "",
      gstin: saved?.gstin ?? String(profile?.gstin ?? ""),
      pan: saved?.pan ?? "",
    });
    setErrors({});
    setEditing(true);
    setStatus(null);
  };

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setStatus(null);
  }, []);

  const ifscError =
    ifscInfo?.code === form.ifsc.trim().toUpperCase() ? ifscInfo.error : undefined;
  const formComplete = Object.keys(validate(form)).length === 0 && !ifscError;

  const handleSave = async () => {
    if (!phone) {
      setStatus({ type: "error", message: "No phone number on your account — complete your profile first." });
      return;
    }
    const e = validate(form);
    // An IFSC the bank lookup doesn't know can't receive payouts.
    if (!e.ifsc && ifscError) e.ifsc = ifscError;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setStatus(null);
    try {
      const accountNumber = form.accountNumber.trim();
      const gstin = form.gstin.trim().toUpperCase();
      const fromGst = panFromGstin(gstin);
      const record: Omit<PayoutAccount, "documents"> = {
        accountHolderName: form.accountHolderName.trim(),
        accountNumber,
        accountLast4: accountNumber.slice(-4),
        ifsc: form.ifsc.trim().toUpperCase(),
        bankName: form.bankName.trim(),
        branchName: form.branchName.trim(),
        gstin,
        pan: fromGst ?? form.pan.trim().toUpperCase(),
        // A re-submitted account has to be re-checked before money moves.
        status: "pending_verification",
      };

      await setDoc(
        doc(db, "payoutAccounts", phone),
        { ...record, panSource: fromGst ? "gstin" : "typed", phone, updatedAt: serverTimestamp() },
        { merge: true },
      );

      setSaved((prev) => ({ ...prev, ...record }));
      setEditing(false);
      setForm(EMPTY_FORM);
      setStatus({
        type: "success",
        message: "Saved. We'll verify your details, usually within 1 working day.",
      });
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

      {/* Selling never waits for this; only the transfer to the bank does. */}
      {saved?.status !== "verified" ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
          <div>
            <p className="font-semibold">You can keep selling while you do this.</p>
            <p className="mt-0.5 text-green-800">
              Money from your online orders is kept safe by KrishiDukan. Once your details are
              verified, it is sent to your bank automatically, after the fees shown on each order.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Checklist: three things, ticked as they're done ── */}
      <KycChecklist account={saved} />

      {/* ── Saved account (masked) ── */}
      {saved && !editing && saved.accountNumber ? (
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
                  {[saved.bankName, saved.branchName].filter(Boolean).join(", ")}
                  {saved.bankName || saved.branchName ? " · " : ""}
                  <span className="font-mono">{saved.ifsc}</span>
                </p>
                {saved.gstin || saved.pan ? (
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {saved.gstin ? <>GST <span className="font-mono">{saved.gstin}</span> · </> : null}
                    {saved.pan ? <>PAN <span className="font-mono">••••••{saved.pan.slice(-4)}</span></> : null}
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
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-variant"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Change
                </button>
              ) : null}
            </div>
          </div>
          {saved.status === "rejected" && saved.rejectionReason ? (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <strong>Please fix:</strong> {saved.rejectionReason}
            </p>
          ) : null}
        </div>
      ) : null}

      {saved && !editing && !saved.accountNumber && !isAdminView ? (
        <button
          type="button"
          onClick={startEditing}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary"
        >
          <Landmark className="h-4 w-4" /> Add your bank details
        </button>
      ) : null}

      {/* ── Entry form ── */}
      {editing && !isAdminView ? (
        <div className="rounded-2xl border border-outline-variant bg-surface p-5 md:p-6">
          <h2 className="text-lg font-semibold text-on-surface">
            {saved?.accountNumber ? "Change your details" : "Your bank details"}
          </h2>
          <p className="mb-5 mt-1 text-sm text-on-surface-variant">
            Takes about 2 minutes. Keep your passbook or a cheque handy.
          </p>

          <SectionTitle n={1} title="Bank account" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Account holder name *"
              value={form.accountHolderName}
              onChange={(v) => set("accountHolderName", v)}
              error={errors.accountHolderName}
              placeholder="As printed on your passbook"
              className="md:col-span-2"
            />

            <div className="md:col-span-2">
              <Field
                label="IFSC code *"
                value={form.ifsc}
                onChange={(v) => set("ifsc", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                error={errors.ifsc ?? (ifscInfo?.code === form.ifsc ? ifscInfo.error : undefined)}
                placeholder="SBIN0001234"
                mono
              />
              {ifscInfo?.info && ifscInfo.code === form.ifsc ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {ifscInfo.info.bank}, {ifscInfo.info.branch}
                  {ifscInfo.info.city ? ` (${ifscInfo.info.city})` : ""}
                </p>
              ) : null}
            </div>

            <Field
              label="Bank name *"
              value={form.bankName}
              onChange={(v) => set("bankName", v)}
              error={errors.bankName}
              placeholder="Filled in from the IFSC"
            />
            <Field
              label="Branch name (optional)"
              value={form.branchName}
              onChange={(v) => set("branchName", v)}
              placeholder="Filled in from the IFSC"
            />

            <Field
              label="Account number *"
              value={form.accountNumber}
              onChange={(v) => set("accountNumber", v.replace(/\D/g, ""))}
              error={errors.accountNumber}
              placeholder="9–18 digits"
              inputMode="numeric"
              mono
            />

            <Field
              label="Re-enter account number *"
              value={form.confirmAccountNumber}
              onChange={(v) => set("confirmAccountNumber", v.replace(/\D/g, ""))}
              error={errors.confirmAccountNumber}
              placeholder="Type it again"
              inputMode="numeric"
              mono
              // Pasting defeats the point of a confirmation field.
              onPaste={(e) => e.preventDefault()}
            />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Please fill carefully and check each digit with your passbook. Your money is sent to
            this account.
          </p>

          <SectionTitle n={2} title="GST number or PAN" className="mt-6" />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Field
                label="GST number (if you have one)"
                value={form.gstin}
                onChange={(v) => set("gstin", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15))}
                error={errors.gstin}
                placeholder="27ABCPK1234L1Z5"
                mono
              />
              <p className="mt-1 text-xs text-on-surface-variant">
                Your PAN is part of your GST number, so we fill it in for you.
              </p>
            </div>
            <div>
              {panFromGstin(form.gstin) ? (
                <>
                  <Field label="PAN" value={panFromGstin(form.gstin)!} onChange={() => {}} mono readOnly />
                  <p className="mt-1 flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Taken from your GST number
                  </p>
                </>
              ) : (
                <Field
                  label="PAN *"
                  value={form.pan}
                  onChange={(v) => set("pan", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                  error={errors.pan}
                  placeholder="ABCPK1234L"
                  mono
                />
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              // Enabled only once everything payouts need is filled in properly.
              disabled={saving || !formComplete}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save details"}
            </button>
            {saved?.accountNumber ? (
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
            Only you and our verification team can see these details. They are used only to send
            your order money through Razorpay, an RBI-regulated payment company.
          </p>
        </div>
      ) : null}

      {/* Step 3. Kept outside the edit/view toggle so a seller can add the
          licence without re-opening and re-submitting the bank form. */}
      {phone ? (
        <div className="mt-6">
          <KycDocuments
            phone={phone}
            // Once verified, the documents are the basis of that decision —
            // changing them silently would leave the approval unbacked.
            readOnly={saved?.status === "verified"}
            onChange={(documents) => setSaved((prev) => (prev ? { ...prev, documents } : prev))}
          />
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ n, title, className = "" }: { n: number; title: string; className?: string }) {
  return (
    <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface ${className}`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
        {n}
      </span>
      {title}
    </h3>
  );
}

/** Bank, PAN, licence: ticked as each is done, with where the account stands. */
function KycChecklist({ account }: { account: PayoutAccount | null }) {
  const missing = kycMissing(account);
  const items = (Object.keys(KYC_ITEM_LABEL) as (keyof typeof KYC_ITEM_LABEL)[]).map((k) => ({
    k,
    done: !missing.includes(k),
  }));
  const status = account?.status;
  const line =
    status === "verified"
      ? "Verified. Your money goes to your bank automatically."
      : status === "rejected"
        ? "Something needs fixing. See below."
        : missing.length === 0
          ? "All done. We're verifying your details, usually within 1 working day."
          : `${missing.length} of 3 left`;
  return (
    <div className="mb-6 rounded-2xl border border-outline-variant bg-surface p-4">
      <p className="text-sm font-semibold text-on-surface">Get paid to your bank: 3 quick steps</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {items.map(({ k, done }) => (
          <span key={k} className={`inline-flex items-center gap-1.5 text-sm ${done ? "text-green-700" : "text-on-surface-variant"}`}>
            {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            {KYC_ITEM_LABEL[k]}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">{line}</p>
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
  readOnly = false,
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
  readOnly?: boolean;
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
        readOnly={readOnly}
        autoComplete="off"
        className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none ${
          mono ? "font-mono tracking-wide" : ""
        } ${readOnly ? "bg-surface-container text-on-surface-variant" : ""} ${
          error
            ? "border-red-400 focus:border-red-500"
            : "border-outline-variant focus:border-primary"
        }`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
