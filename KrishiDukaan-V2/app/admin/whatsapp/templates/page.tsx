"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { auth, db, resolveWaUserByPhone } from "../../../firebase";
import { WaSubNav } from "../_components/wa-sub-nav";
import {
  AlertTriangle, CheckCircle, XCircle, Send, Search, Loader2,
  ChevronDown, Building2, Calendar, Clock, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { cn } from "../../../dashboard/_lib/cn";
import { PendingSignupPanel, type PendingPanelManufacturer } from "../../_components/pending-signup-panel";
import { getUsers, getSubscriptions } from "../../_lib/admin-data";
import { subscriptionPlanLabel } from "../../../lib/pricing";
import { collection, doc, getDocs, query, where, serverTimestamp, writeBatch } from "firebase/firestore";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function isValidIndianPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return /^(91\d{10}|\d{10})$/.test(digits);
}

function parsePhones(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Template config ──────────────────────────────────────────────────────────

type TemplateId =
  | "payment_failed_app_update"
  | "product_assignment_pending_signup"
  | "subscription_expiry"
  | "retailer_seat_promotion"
  | "new_product_reminder"
  | "kyc_pending"
  | "kyc_success"
  | "app_update"
  | "reel_promo_hindi";

/**
 * Cost of a single delivered WhatsApp Marketing message, in INR. Defined once
 * here so it can be updated in one place if Meta pricing changes.
 */
const MARKETING_MSG_COST_INR = 0.86;

/** Locale-aware integer / money formatters, shared across the Marketing flows. */
const fmtCount = (n: number) => n.toLocaleString("en-IN");
const fmtMoney = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  {
    id: "payment_failed_app_update",
    label: "Payment Failed — App Update",
    description: "Notify customers whose payment failed and ask them to update the app.",
  },
  {
    id: "product_assignment_pending_signup",
    label: "Product Assignment — Pending Signup",
    description: "Remind invited retailers who haven't completed signup yet.",
  },
  {
    id: "subscription_expiry",
    label: "Subscription Expiry",
    description: "Notify active subscribers whose subscription is approaching expiry.",
  },
  {
    id: "retailer_seat_promotion",
    label: "Retailer Seat Promotion",
    description: "Promote seat subscriptions to retailers/manufacturers not yet subscribed.",
  },
  {
    id: "new_product_reminder",
    label: "New Product Reminder (Marketing)",
    description: "Remind active-subscribed retailers who still have vacant product seats to add more products. Marketing template — billed per message.",
  },
  {
    id: "kyc_pending",
    label: "KYC Pending",
    description: "Remind subscribed retailers/manufacturers whose payout KYC is not yet verified.",
  },
  {
    id: "kyc_success",
    label: "KYC Success",
    description: "Congratulate retailers/manufacturers whose payout KYC is verified and point them to payouts.",
  },
  {
    id: "app_update",
    label: "App Update (Marketing)",
    description: "Ask retailers, manufacturers or customers to update the app. Marketing template — billed per message.",
  },
  {
    id: "reel_promo_hindi",
    label: "Reel Promotion Hindi (Marketing)",
    description: "Promote a farming reel to all users in Hindi. Image header, zero variables, static URL button. Marketing template — billed per message.",
  },
];

// ─── Payment Failed flow ──────────────────────────────────────────────────────

const PF_TEMPLATE = "payment_failed_app_update";
const PF_LANG = "mr";

interface ResolvedEntry {
  raw: string;
  normalized: string;
  valid: boolean;
  name: string;
  businessName: string;
  role: string;
  looking: boolean;
}

interface SendResult {
  phone: string;
  normalized: string;
  ok: boolean;
  metaMessageId?: string;
  error?: string;
}

type PfStep = "input" | "preview" | "sent";

function PaymentFailedFlow() {
  const [step, setStep] = useState<PfStep>("input");
  const [rawInput, setRawInput] = useState("");
  const [entries, setEntries] = useState<ResolvedEntry[]>([]);
  const [looking, setLooking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);

  async function handleLookup() {
    const raws = parsePhones(rawInput);
    if (raws.length === 0) return;

    const initial: ResolvedEntry[] = raws.map((raw) => ({
      raw,
      normalized: isValidIndianPhone(raw) ? toE164(raw) : raw,
      valid: isValidIndianPhone(raw),
      name: "",
      businessName: "",
      role: "",
      looking: isValidIndianPhone(raw),
    }));
    setEntries(initial);
    setLooking(true);
    setStep("preview");

    const resolved = await Promise.all(
      initial.map(async (entry) => {
        if (!entry.valid) return entry;
        try {
          const user = await resolveWaUserByPhone(entry.normalized);
          return {
            ...entry,
            name: user?.name ?? "",
            businessName: user?.businessName ?? "",
            role: user?.role ?? "unknown",
            looking: false,
          };
        } catch {
          return { ...entry, looking: false };
        }
      })
    );

    setEntries(resolved);
    setLooking(false);
  }

  async function handleSend() {
    const validPhones = entries.filter((e) => e.valid).map((e) => e.raw);
    if (validPhones.length === 0) return;

    setSending(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/wa/payment-failed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ phones: validPhones }),
      });

      const data = (await res.json()) as { results?: SendResult[]; error?: string };
      if (!res.ok) {
        setSendResults([{ phone: "", normalized: "", ok: false, error: data.error ?? `HTTP ${res.status}` }]);
      } else {
        setSendResults(data.results ?? []);
      }
      setStep("sent");
    } catch (err) {
      setSendResults([{ phone: "", normalized: "", ok: false, error: String(err) }]);
      setStep("sent");
    } finally {
      setSending(false);
    }
  }

  function handleReset() {
    setStep("input");
    setRawInput("");
    setEntries([]);
    setSendResults([]);
  }

  const validCount = entries.filter((e) => e.valid).length;
  const invalidCount = entries.filter((e) => !e.valid).length;

  return (
    <div className="space-y-6">
      {/* Step: input */}
      {step === "input" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Phone Numbers
            </label>
            <textarea
              className="w-full h-40 border border-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
              placeholder={`One number per line (or comma-separated):\n9876543210\n91 9876 543 210\n+91-9876543210`}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Accepts 10-digit, 91XXXXXXXXXX, or +91XXXXXXXXXX format. Maximum 100 numbers.
            </p>
          </div>
          <button
            onClick={handleLookup}
            disabled={!rawInput.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Search className="w-4 h-4" />
            Look Up Numbers
          </button>
        </div>
      )}

      {/* Step: preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{validCount}</p>
              <p className="text-xs text-green-600 font-medium">Valid</p>
            </div>
            {invalidCount > 0 && (
              <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{invalidCount}</p>
                <p className="text-xs text-amber-600 font-medium">Invalid (skipped)</p>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry, i) => (
                  <tr key={i} className={cn(!entry.valid && "bg-amber-50/50")}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">
                      {entry.valid ? entry.normalized : entry.raw}
                    </td>
                    <td className="px-3 py-2.5">
                      {entry.looking ? (
                        <span className="flex items-center gap-1.5 text-gray-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Looking up…
                        </span>
                      ) : entry.name || entry.businessName ? (
                        <span className="text-gray-800 text-xs">
                          {entry.name}
                          {entry.businessName && entry.name !== entry.businessName && (
                            <span className="text-gray-400 ml-1">({entry.businessName})</span>
                          )}
                        </span>
                      ) : entry.valid ? (
                        <span className="text-gray-400 text-xs italic">Not found</span>
                      ) : (
                        <span className="text-amber-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {entry.role && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {entry.role}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!entry.valid ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="w-3 h-3" />
                          Invalid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle className="w-3 h-3" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {entries.some((e) => e.valid && !e.name && !e.looking) && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Some numbers were not found in Firestore. The template will still be sent — verify these numbers before confirming.
              </p>
            </div>
          )}

          {validCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-sm text-blue-800 font-medium">
                Ready to send <strong>{PF_TEMPLATE}</strong> ({PF_LANG.toUpperCase()}) to{" "}
                <strong>{validCount}</strong> number{validCount !== 1 ? "s" : ""}.
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Template includes two buttons: ॲप अपडेट करा · पुन्हा पेमेंट करा
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSend}
              disabled={validCount === 0 || looking || sending}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Confirm & Send to {validCount} Number{validCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step: sent results */}
      {step === "sent" && (
        <div className="space-y-4">
          {(() => {
            const successCount = sendResults.filter((r) => r.ok).length;
            const failCount = sendResults.filter((r) => !r.ok).length;
            return (
              <div className="flex gap-3">
                {successCount > 0 && (
                  <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{successCount}</p>
                    <p className="text-xs text-green-600 font-medium">Sent</p>
                  </div>
                )}
                {failCount > 0 && (
                  <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{failCount}</p>
                    <p className="text-xs text-red-600 font-medium">Failed</p>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Meta Message ID / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sendResults.map((r, i) => (
                  <tr key={i} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">
                      {r.normalized || r.phone || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-gray-600 break-all">
                      {r.ok ? r.metaMessageId : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Send to More Numbers
            </button>
            <Link
              href="/admin/whatsapp"
              className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Back to WA Inbox
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Product Assignment — Pending Signup flow ─────────────────────────────────

type ManufacturerOption = PendingPanelManufacturer & { label: string };

function PendingSignupFlow() {
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [loadingMfrs, setLoadingMfrs] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState("");

  const loadManufacturers = useCallback(async () => {
    setLoadingMfrs(true);
    try {
      const users = await getUsers();
      const mfrs: ManufacturerOption[] = (users as any[])
        .filter((u) => u.role === "manufacturer")
        .map((u) => ({
          phone: String(u.id ?? u.phone ?? ""),
          uid: u.uid || undefined,
          businessName: u.businessName || u.shopName || u.name || undefined,
          ownerName: u.ownerName || u.name || undefined,
          label: u.businessName || u.shopName || u.name || u.id || "",
        }))
        .filter((m) => m.phone)
        .sort((a, b) => a.label.localeCompare(b.label));
      setManufacturers(mfrs);
    } finally {
      setLoadingMfrs(false);
    }
  }, []);

  useEffect(() => { void loadManufacturers(); }, [loadManufacturers]);

  const selectedMfr = manufacturers.find((m) => m.phone === selectedPhone) ?? null;

  return (
    <div className="space-y-6">
      {/* Manufacturer selector */}
      <div className="space-y-2 max-w-sm">
        <label className="block text-sm font-medium text-gray-700">
          Select Manufacturer / Company
        </label>
        <div className="relative">
          {loadingMfrs ? (
            <div className="flex items-center gap-2 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading manufacturers…
            </div>
          ) : (
            <>
              <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={selectedPhone}
                onChange={(e) => setSelectedPhone(e.target.value)}
                className="w-full appearance-none border border-gray-300 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">— Choose a manufacturer —</option>
                {manufacturers.map((m) => (
                  <option key={m.phone} value={m.phone}>
                    {m.label}{m.phone ? ` (${m.phone})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Only retailers in the &quot;invited&quot; status for this manufacturer will be shown.
        </p>
      </div>

      {/* Pending panel — reuses the exact same component as Company Edit → Pending tab */}
      {selectedMfr && (
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pending Retailers — {selectedMfr.businessName || selectedMfr.phone}
          </p>
          <PendingSignupPanel manufacturer={selectedMfr} />
        </div>
      )}

      {!selectedPhone && !loadingMfrs && (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          Select a manufacturer above to see their pending retailers.
        </div>
      )}
    </div>
  );
}

// ─── Subscription Expiry flow ─────────────────────────────────────────────────

const EXPIRY_WINDOWS = [
  { label: "Expiring in 7 days", days: 7 },
  { label: "Expiring in 15 days", days: 15 },
  { label: "Expiring in 30 days", days: 30 },
  { label: "Expiring in 60 days", days: 60 },
  { label: "All active", days: Infinity },
] as const;

type ExpiryRow = {
  subId: string;
  phone: string;
  ownerName: string;
  businessName: string;
  planName: string;
  seatsPurchased: number;
  expiryDate: Date;
  daysRemaining: number;
};

type SubSendResult = {
  subId: string;
  phone: string;
  ownerName: string;
  ok: boolean;
  error?: string;
};

function formatExpiryDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function SubscriptionExpiryFlow() {
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<SubSendResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, users] = await Promise.all([getSubscriptions(), getUsers()]);
      const now = Date.now();

      const built: ExpiryRow[] = [];
      for (const sub of subs) {
        if (sub.subscriptionStatus !== "active") continue;
        const expiry: Date | null = sub.expiryDate?.toDate
          ? sub.expiryDate.toDate()
          : sub.expiryDate
          ? new Date(sub.expiryDate)
          : null;
        if (!expiry) continue;
        const ms = expiry.getTime() - now;
        if (ms <= 0) continue; // already expired, skip

        const phone: string = sub.ownerPhone || sub.ownerId || "";
        if (!phone) continue;

        const user = users.find(
          (u: any) => u.id === phone || u.uid === phone || u.phone === phone,
        );
        const ownerName: string =
          user?.name || user?.ownerName || user?.businessName || user?.shopName || "";
        const businessName: string =
          user?.businessName || user?.shopName || user?.name || "";

        built.push({
          subId: sub.id,
          phone,
          ownerName,
          businessName,
          planName: subscriptionPlanLabel(sub),
          seatsPurchased: sub.seatsPurchased ?? 0,
          expiryDate: expiry,
          daysRemaining: Math.ceil(ms / 86400000),
        });
      }

      built.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
      setRows(built);
      // Pre-select all within the current window
      const cutoff = windowDays === Infinity ? Infinity : windowDays;
      setSelectedIds(new Set(built.filter((r) => r.daysRemaining <= cutoff).map((r) => r.subId)));
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadData(); }, [loadData]);

  // When the window filter changes, re-apply selection to the filtered set only
  useEffect(() => {
    if (rows.length === 0) return;
    const cutoff = windowDays === Infinity ? Infinity : windowDays;
    setSelectedIds(new Set(rows.filter((r) => r.daysRemaining <= cutoff).map((r) => r.subId)));
  }, [windowDays, rows]);

  const displayedRows = windowDays === Infinity
    ? rows
    : rows.filter((r) => r.daysRemaining <= windowDays);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = displayedRows.filter((r) => selectedIds.has(r.subId));

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const all = displayedRows.length > 0 && selectedIds.size >= displayedRows.length;
    const none = selectedIds.size === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, displayedRows]);

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: SubSendResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");

    // Firestore batch limit is 500 — chunk if needed
    const CHUNK = 400;
    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        const formattedDate = formatExpiryDate(row.expiryDate);
        batch.set(doc(waRef), {
          phone: row.phone,
          message: `तुमची Krishi Dukan सदस्यता ${formattedDate} रोजी संपणार आहे.`,
          template: "subscription_expiry",
          payload: {
            ownerName: row.ownerName,
            businessName: row.businessName,
            shopName: "",
            formattedExpiryDate: formattedDate,
          },
          source: {
            event: "admin_manual_expiry_reminder",
            entityType: "subscription",
            entityId: row.subId,
          },
          status: "pending",
          type: "subscription",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ subId: row.subId, phone: row.phone, ownerName: row.ownerName, ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ subId: row.subId, phone: row.phone, ownerName: row.ownerName, ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  const daysLabel = (n: number) =>
    n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`;

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.subId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.ownerName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">subscription_expiry</span></li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} subscriber{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            This queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. The Cloud Function delivers them via WhatsApp.
            No subscription records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.subId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.ownerName || r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    {formatExpiryDate(r.expiryDate)}{" "}
                    <span className={cn(
                      "font-semibold",
                      r.daysRemaining <= 7 ? "text-red-600" : r.daysRemaining <= 15 ? "text-amber-600" : "text-gray-500"
                    )}>
                      ({daysLabel(r.daysRemaining)})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Window filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="relative flex-1">
            <select
              value={windowDays === Infinity ? "Infinity" : String(windowDays)}
              onChange={(e) => {
                const v = e.target.value;
                setWindowDays(v === "Infinity" ? Infinity : Number(v));
              }}
              className="w-full appearance-none border border-gray-300 rounded-xl pl-3 pr-8 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {EXPIRY_WINDOWS.map((w) => (
                <option key={String(w.days)} value={String(w.days)}>
                  {w.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Refresh */}
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading subscriptions…
        </div>
      ) : displayedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No active subscriptions found for the selected window.
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">
            {displayedRows.length} subscriber{displayedRows.length !== 1 ? "s" : ""}
            {windowDays !== Infinity && ` expiring within ${windowDays} days`}
            {selectedIds.size > 0 && selectedIds.size < displayedRows.length && (
              <span className="ml-1.5 text-on-surface-variant font-normal">
                · {selectedIds.size} selected
              </span>
            )}
          </p>

          {/* Recipient table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked
                            ? new Set(displayedRows.map((r) => r.subId))
                            : new Set(),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name / Business</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Plan · Seats</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedRows.map((r) => {
                  const checked = selectedIds.has(r.subId);
                  const urgent = r.daysRemaining <= 7;
                  const warn = !urgent && r.daysRemaining <= 15;
                  return (
                    <tr
                      key={r.subId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.subId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.subId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {r.ownerName || r.businessName || "—"}
                        </p>
                        {r.businessName && r.businessName !== r.ownerName && (
                          <p className="text-[10px] text-gray-400 truncate max-w-xs">{r.businessName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 hidden sm:table-cell">
                        {r.planName}
                        {r.seatsPurchased > 0 && (
                          <span className="ml-1 text-gray-400">· {r.seatsPurchased} seat{r.seatsPurchased !== 1 ? "s" : ""}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock className={cn(
                            "w-3 h-3 shrink-0",
                            urgent ? "text-red-500" : warn ? "text-amber-500" : "text-gray-400",
                          )} />
                          <span className={cn(
                            "font-semibold",
                            urgent ? "text-red-600" : warn ? "text-amber-600" : "text-gray-700",
                          )}>
                            {daysLabel(r.daysRemaining)}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatExpiryDate(r.expiryDate)}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Send button */}
          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── Retailer Seat Promotion flow ────────────────────────────────────────────

type SeatPromoRow = {
  userId: string;
  phone: string;
  businessName: string;
  role: string;
  subscriptionLabel: string;
};

type SeatPromoResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

function RetailerSeatPromotionFlow() {
  const [rows, setRows] = useState<SeatPromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<SeatPromoResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const users = await getUsers();
      const built: SeatPromoRow[] = [];
      for (const u of users as any[]) {
        const role: string = u.role ?? "";
        if (role !== "retailer" && role !== "manufacturer") continue;
        if (u.isPaid === true) continue; // already subscribed

        const phone: string = u.id || u.phone || "";
        if (!phone) continue;

        const businessName: string =
          u.businessName || u.shopName || u.name || u.ownerName || "";

        const subStatus: string = u.subscriptionStatus ?? "";
        const subscriptionLabel =
          subStatus === "expired"
            ? "Expired"
            : subStatus === "active"
            ? "Active (isPaid false?)"
            : "Not subscribed";

        built.push({ userId: u.id, phone, businessName, role, subscriptionLabel });
      }
      built.sort((a, b) => (a.businessName || a.phone).localeCompare(b.businessName || b.phone));
      setRows(built);
      setSelectedIds(new Set(built.map((r) => r.userId)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const all = rows.length > 0 && selectedIds.size >= rows.length;
    const none = selectedIds.size === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, rows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: SeatPromoResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "retailer_seat_promotion",
          payload: { businessName: row.businessName },
          source: {
            event: "admin_manual_seat_promotion",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "marketing",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: row.businessName, ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: row.businessName, ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">retailer_seat_promotion</span></li>
            <li>Variable: <span className="font-mono text-xs">{"{{1}}"}</span> = Business Name only</li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} user{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{r.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {rows.length} eligible recipient{rows.length !== 1 ? "s" : ""}
              {selectedIds.size > 0 && selectedIds.size < rows.length && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {selectedIds.size} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No unsubscribed retailers or manufacturers found.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? new Set(rows.map((r) => r.userId)) : new Set(),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Role</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Subscription</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {r.businessName || <span className="italic text-gray-400">—</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full font-medium",
                          r.subscriptionLabel === "Expired"
                            ? "bg-red-50 text-red-600"
                            : "bg-gray-100 text-gray-500",
                        )}>
                          {r.subscriptionLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── New Product Reminder flow (Marketing) ───────────────────────────────────

type NewProdRow = {
  userId: string;
  phone: string;         // normalized E.164 (no '+')
  ownerName: string;     // {{1}} primary — owner/person name
  businessName: string;  // {{1}} fallback + display
  shopName: string;      // {{1}} secondary fallback
  vacantSeats: number;   // {{2}} — allocated seats − used product seats
  allocatedSeats: number; // Total Seats
  usedSeats: number;
  lastNotifiedAt: Date | null; // last successful new_product_reminder send
};

type NewProdResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

/** Millis of a Firestore Timestamp, JS Date or ISO string field — 0 if absent. */
function fieldToMs(v: unknown): number {
  if (!v) return 0;
  const anyV = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof anyV.toMillis === "function") return anyV.toMillis();
  if (typeof anyV.toDate === "function") return anyV.toDate().getTime();
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Human "Last Notification" label by calendar-day difference: Never / Today / N days ago. */
function formatLastNotification(d: Date | null): string {
  if (!d) return "Never";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return "Today";
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function NewProductReminderFlow() {
  const [rows, setRows] = useState<NewProdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<NewProdResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = Date.now();
      // Reuse the app's canonical seat model:
      //   allocated seats = Σ seatsPurchased over the retailer's ACTIVE subscriptions
      //   used seats      = the retailer's ACTIVE product seat listings (1 product = 1 seat)
      //   vacant seats    = allocated − used
      // Mirrors computeSeatStats() / isSubscriptionActive() / isListingActive() in
      // dashboard/_lib/subscriptions-firestore.ts — no new fields are introduced.
      // Prior new_product_reminder sends are read from the existing waNotifications
      // history (same source the KYC flows use) — no separate tracking is added.
      const [users, subs, seatSnap, notifSnap, uidIdxSnap] = await Promise.all([
        getUsers(),
        getSubscriptions(),
        getDocs(collection(db, "retailerSeatListings")),
        getDocs(query(collection(db, "waNotifications"), where("template", "==", "new_product_reminder"))),
        getDocs(collection(db, "uidIndex")),
      ]);

      // phone (normalized) → Auth UID. Self-serve seat listings are keyed by
      // ownerId = Auth UID with ownerPhone = null (see inventory-firestore
      // addProductToInventory), so without the UID a retailer's used seats
      // resolve to 0 and every retailer looks 100% vacant. The retailer's own
      // page avoids this via fetchSeatListingsForOwner's uidIndex lookup; we do
      // the same in bulk by inverting uidIndex once here.
      const phoneToUid = new Map<string, string>();
      uidIdxSnap.docs.forEach((d) => {
        const phone = (d.data() as { phone?: string }).phone;
        if (phone) phoneToUid.set(toE164(String(phone)), d.id);
      });

      // Active seat listings: status "active" AND not yet expired.
      const activeListings = seatSnap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .filter((l) => l.status === "active" && fieldToMs(l.expiresAt) > now);

      // Active subscriptions: status "active" AND not yet expired.
      const activeSubs = (subs as any[]).filter(
        (s) => s.subscriptionStatus === "active" && fieldToMs(s.expiryDate) > now,
      );

      // Map normalized phone → most recent SUCCESSFUL send time. A send counts as
      // successful once Meta accepted it (status sent/delivered/read or a
      // metaMessageId exists); pending/failed/cancelled docs are ignored.
      const SUCCESS_STATUSES = new Set(["sent", "delivered", "read"]);
      const lastSentByPhone = new Map<string, number>();
      notifSnap.docs.forEach((d) => {
        const data = d.data() as {
          phone?: string;
          status?: string;
          metaMessageId?: string | null;
          sentAt?: unknown;
        };
        if (!data.phone) return;
        const success = (data.status && SUCCESS_STATUSES.has(data.status)) || !!data.metaMessageId;
        if (!success) return;
        const ms = fieldToMs(data.sentAt);
        if (!ms) return;
        const norm = toE164(data.phone);
        const prev = lastSentByPhone.get(norm) ?? 0;
        if (ms > prev) lastSentByPhone.set(norm, ms);
      });

      const built: NewProdRow[] = [];
      for (const u of users as any[]) {
        if (u.role !== "retailer") continue;

        // Every identifier this retailer's subs/listings could be keyed by.
        const keys = new Set<string>();
        for (const k of [u.uid, u.phone, u.id]) if (k) keys.add(String(k));
        for (const k of [u.phone, u.id]) {
          if (k && isValidIndianPhone(String(k))) {
            const e164 = toE164(String(k));
            keys.add(e164);
            // Resolve the Auth UID from uidIndex so UID-keyed self-serve seat
            // listings match even when the user doc has no `uid` field.
            const uid = phoneToUid.get(e164);
            if (uid) keys.add(uid);
          }
        }
        if (keys.size === 0) continue;

        const rawPhone: string = u.id || u.phone || "";
        if (!rawPhone || !isValidIndianPhone(rawPhone)) continue;

        const matchesKeys = (a: unknown, b: unknown) =>
          (a && keys.has(String(a))) || (b && keys.has(String(b)));

        const allocatedSeats = activeSubs
          .filter((s) => matchesKeys(s.ownerId, s.ownerPhone))
          .reduce((sum, s) => sum + (Number(s.seatsPurchased) || 0), 0);
        if (allocatedSeats <= 0) continue;

        const usedSeats = activeListings.filter((l) =>
          matchesKeys(l.ownerId, l.ownerPhone),
        ).length;

        const vacantSeats = allocatedSeats - usedSeats;
        if (vacantSeats <= 0) continue;

        const normPhone = toE164(rawPhone);
        const lastMs = lastSentByPhone.get(normPhone) ?? 0;

        built.push({
          userId: u.id,
          phone: normPhone,
          ownerName: u.ownerName || u.name || "",
          businessName: u.businessName || "",
          shopName: u.shopName || "",
          vacantSeats,
          allocatedSeats,
          usedSeats,
          lastNotifiedAt: lastMs ? new Date(lastMs) : null,
        });
      }

      // Primary sort: highest vacant PERCENTAGE first (100% vacant → nearly full),
      // matching the page's "Vacant %" criterion. Ties break by absolute vacant
      // seats, then by name.
      const vacantPct = (r: NewProdRow) =>
        r.allocatedSeats > 0 ? r.vacantSeats / r.allocatedSeats : 0;
      built.sort(
        (a, b) =>
          vacantPct(b) - vacantPct(a) ||
          b.vacantSeats - a.vacantSeats ||
          (a.businessName || a.shopName || a.ownerName || a.phone).localeCompare(
            b.businessName || b.shopName || b.ownerName || b.phone,
          ),
      );
      setRows(built);
      // Default selection is none — clearing search never selects everyone.
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Search by business / shop / owner name — narrows visible rows only.
  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.businessName.toLowerCase().includes(q) ||
        r.shopName.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q),
    );
  })();

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const visibleIds = filteredRows.map((r) => r.userId);
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
    const all = visibleIds.length > 0 && selectedVisible >= visibleIds.length;
    const none = selectedVisible === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, filteredRows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));
  const estimatedCost = selectedIds.size * MARKETING_MSG_COST_INR;

  // {{1}} display — business/shop name, falling back to owner name.
  const displayName = (r: NewProdRow) => r.businessName || r.shopName || r.ownerName || "—";

  const displayPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: NewProdResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "new_product_reminder",
          // Resolver: {{1}} = ownerName → businessName → shopName; {{2}} = vacantSeats.
          payload: {
            ownerName: row.ownerName,
            businessName: row.businessName,
            shopName: row.shopName,
            vacantSeats: String(row.vacantSeats),
          },
          source: {
            event: "admin_manual_new_product_reminder",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "marketing",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{r.phone}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">⚠️ Confirm Marketing send</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">new_product_reminder</span> (Marketing · Marathi)</li>
            <li>
              Variables: <span className="font-mono text-xs">{"{{1}}"}</span> = Owner / Business name,{" "}
              <span className="font-mono text-xs">{"{{2}}"}</span> = Vacant seats
            </li>
            <li>Recipients: <span className="font-semibold">{fmtCount(selectedRows.length)} retailer{selectedRows.length !== 1 ? "s" : ""}</span></li>
            <li>
              Estimated cost:{" "}
              <span className="font-semibold">
                ₹{fmtCount(selectedRows.length)} × {MARKETING_MSG_COST_INR} = ₹{fmtMoney(estimatedCost)}
              </span>
            </li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {fmtCount(selectedRows.length)} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner / Business</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vacant Seats</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{displayName(r)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{r.vacantSeats}</span>
                    <span className="text-gray-400"> / {r.allocatedSeats}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {fmtCount(selectedRows.length)} · ₹{fmtMoney(estimatedCost)}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Marketing cost warning */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-1.5">
        <p className="text-sm font-bold text-amber-800">
          ⚠️ This is a Marketing WhatsApp message.
        </p>
        <p className="text-xs text-amber-700">
          Cost: ₹{MARKETING_MSG_COST_INR} per delivered message.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-amber-800">
          <span>Selected: <span className="font-bold">{fmtCount(selectedIds.size)}</span></span>
          <span>
            Estimated cost:{" "}
            <span className="font-bold">
              ₹{fmtCount(selectedIds.size)} × {MARKETING_MSG_COST_INR} = ₹{fmtMoney(estimatedCost)}
            </span>
          </span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {search.trim()
                ? `${fmtCount(filteredRows.length)} of ${fmtCount(rows.length)} retailer${rows.length !== 1 ? "s" : ""} with vacant seats`
                : `${fmtCount(rows.length)} retailer${rows.length !== 1 ? "s" : ""} with vacant seats`}
              {selectedIds.size > 0 && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {fmtCount(selectedIds.size)} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Search by business / shop / owner name */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business or owner name…"
          className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading retailers…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No active-subscribed retailers with vacant product seats found.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No retailers match &quot;{search.trim()}&quot;.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          // Select All applies to the currently filtered rows only.
                          if (e.target.checked) filteredRows.forEach((r) => next.add(r.userId));
                          else filteredRows.forEach((r) => next.delete(r.userId));
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Retailer / Business</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Seats</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Used Seats</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vacant Seats</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vacant %</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Last Notification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  const vacantPct = r.allocatedSeats > 0
                    ? Math.round((r.vacantSeats / r.allocatedSeats) * 100)
                    : 0;
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {displayName(r)}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono truncate max-w-xs">{displayPhone(r.phone)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700 tabular-nums">{r.allocatedSeats}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700 tabular-nums">{r.usedSeats}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700 tabular-nums">{r.vacantSeats}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={cn(
                            "inline-block text-xs px-2 py-0.5 rounded-full font-bold tabular-nums",
                            vacantPct === 100
                              ? "bg-emerald-100 text-emerald-700"
                              : vacantPct >= 50
                              ? "bg-primary/10 text-primary"
                              : vacantPct >= 20
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500",
                          )}
                        >
                          {vacantPct}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-gray-500">
                        {formatLastNotification(r.lastNotifiedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({fmtCount(selectedIds.size)} · ₹{fmtMoney(estimatedCost)})
          </button>
        </>
      )}
    </div>
  );
}

// ─── KYC Pending flow ─────────────────────────────────────────────────────────

type KycRow = {
  userId: string;
  phone: string;         // normalized E.164 (no '+')
  ownerName: string;     // {{1}} primary — owner/person name
  businessName: string;  // {{1}} fallback + display
  shopName: string;      // {{1}} secondary fallback
  role: string;
  kycStatus: "pending_verification" | "rejected" | "not_started";
};

type KycResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

const KYC_STATUS_LABEL: Record<KycRow["kycStatus"], string> = {
  pending_verification: "Pending verification",
  rejected: "Rejected",
  not_started: "Not started",
};

function KycPendingFlow() {
  const [rows, setRows] = useState<KycRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<KycResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // KYC status lives on payoutAccounts/{phone}.status — the exact field the
      // admin Payouts review page reads. No duplicate KYC field is introduced.
      const [users, payoutSnap] = await Promise.all([
        getUsers(),
        getDocs(collection(db, "payoutAccounts")),
      ]);

      // Map normalized phone → KYC status. Doc id is the seller phone.
      const kycByPhone = new Map<string, string>();
      payoutSnap.docs.forEach((d) => {
        const status = String((d.data() as { status?: string }).status ?? "pending_verification");
        kycByPhone.set(toE164(d.id), status);
      });

      const built: KycRow[] = [];
      for (const u of users as any[]) {
        const role: string = u.role ?? "";
        if (role !== "retailer" && role !== "manufacturer") continue;

        // Subscribed only — active plan or paid flag.
        const subscribed = u.subscriptionStatus === "active" || u.isPaid === true;
        if (!subscribed) continue;

        // Require a valid WhatsApp/phone number.
        const candidates = [u.phone, u.id].filter(Boolean).map(String);
        const phone = candidates.find(isValidIndianPhone) ?? "";
        if (!phone) continue;
        const normPhone = toE164(phone);

        // KYC status: exclude anyone already verified; keep pending / rejected /
        // not-started (no payoutAccounts doc = KYC never completed).
        const status = kycByPhone.get(normPhone);
        if (status === "verified") continue;
        const kycStatus: KycRow["kycStatus"] =
          status === "rejected"
            ? "rejected"
            : status === "pending_verification"
            ? "pending_verification"
            : "not_started";

        const ownerName: string = u.ownerName || u.name || "";
        const businessName: string = u.businessName || "";
        const shopName: string = u.shopName || "";

        built.push({
          userId: u.id,
          phone: normPhone,
          ownerName,
          businessName,
          shopName,
          role,
          kycStatus,
        });
      }

      built.sort((a, b) =>
        (a.ownerName || a.businessName || a.phone).localeCompare(
          b.ownerName || b.businessName || b.phone,
        ),
      );
      setRows(built);
      // Default selection is none — nothing is pre-selected on load.
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Search by business name or owner/person name.
  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.ownerName.toLowerCase().includes(q) ||
        r.businessName.toLowerCase().includes(q) ||
        r.shopName.toLowerCase().includes(q),
    );
  })();

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const visibleIds = filteredRows.map((r) => r.userId);
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
    const all = visibleIds.length > 0 && selectedVisible >= visibleIds.length;
    const none = selectedVisible === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, filteredRows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));

  // Display value for {{1}} — owner name, falling back to business/shop name.
  const displayName = (r: KycRow) => r.ownerName || r.businessName || r.shopName || "—";

  // Phone shown without the country-code prefix (stored as E.164, e.g. "919876543210").
  const displayPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: KycResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "kyc_pending",
          // Resolver picks businessName → shopName → ownerName for the single {{1}}.
          payload: {
            ownerName: row.ownerName,
            businessName: row.businessName,
            shopName: row.shopName,
          },
          source: {
            event: "admin_manual_kyc_pending_reminder",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "general",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">kyc_pending</span></li>
            <li>Variable: <span className="font-mono text-xs">{"{{1}}"}</span> = Business / Shop name (falls back to Owner name)</li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} seller{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">KYC Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{displayName(r)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{KYC_STATUS_LABEL[r.kycStatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {search.trim()
                ? `${filteredRows.length} of ${rows.length} seller${rows.length !== 1 ? "s" : ""}`
                : `${rows.length} eligible seller${rows.length !== 1 ? "s" : ""}`}
              {selectedIds.size > 0 && selectedIds.size < rows.length && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {selectedIds.size} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Search by business name or owner name */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business or owner name…"
          className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sellers…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No subscribed retailers or manufacturers with pending KYC found.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No sellers match &quot;{search.trim()}&quot;.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) filteredRows.forEach((r) => next.add(r.userId));
                          else filteredRows.forEach((r) => next.delete(r.userId));
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner / Business</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Role</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">KYC Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {displayName(r)}
                        </p>
                        {r.businessName && r.businessName !== r.ownerName && (
                          <p className="text-[10px] text-gray-400 truncate max-w-xs">{r.businessName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                          {r.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full font-medium",
                          r.kycStatus === "rejected"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700",
                        )}>
                          {KYC_STATUS_LABEL[r.kycStatus]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── KYC Success flow ─────────────────────────────────────────────────────────

type KycSuccessRow = {
  userId: string;
  phone: string;         // normalized E.164 (no '+')
  ownerName: string;
  businessName: string;  // {{1}} primary
  shopName: string;      // {{1}} secondary fallback
  alreadySent: boolean;  // kyc_success already queued/sent to this number
  sentAt: Date | null;   // when it was sent (for "Sent 3 days ago")
};

type KycSuccessResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

/** Short relative-time label, e.g. "3 days ago", "5 hours ago", "just now". */
function formatTimeAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function KycSuccessFlow() {
  const [rows, setRows] = useState<KycSuccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<KycSuccessResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // KYC status lives on payoutAccounts/{phone}.status — "verified" means the
      // seller's payout KYC succeeded (same field the admin Payouts review reads).
      // Existing kyc_success sends are read from waNotifications so we never send
      // the template to the same retailer twice.
      const [users, payoutSnap, sentSnap] = await Promise.all([
        getUsers(),
        getDocs(collection(db, "payoutAccounts")),
        getDocs(query(collection(db, "waNotifications"), where("template", "==", "kyc_success"))),
      ]);

      // Map normalized phone → KYC status. Doc id is the seller phone.
      const kycByPhone = new Map<string, string>();
      payoutSnap.docs.forEach((d) => {
        const status = String((d.data() as { status?: string }).status ?? "");
        kycByPhone.set(toE164(d.id), status);
      });

      // Map normalized phone → most recent kyc_success send time.
      const sentByPhone = new Map<string, Date>();
      sentSnap.docs.forEach((d) => {
        const data = d.data() as { phone?: string; sentAt?: any; createdAt?: any };
        if (!data.phone) return;
        const ts = data.sentAt ?? data.createdAt;
        const when: Date | null = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
        const norm = toE164(data.phone);
        const prev = sentByPhone.get(norm);
        if (when && (!prev || when.getTime() > prev.getTime())) sentByPhone.set(norm, when);
        else if (!when && !prev) sentByPhone.set(norm, new Date(0)); // sent, time unknown
      });

      const built: KycSuccessRow[] = [];
      for (const u of users as any[]) {
        // Retailers and manufacturers.
        if (u.role !== "retailer" && u.role !== "manufacturer") continue;

        // Only successfully-verified KYC.
        const candidates = [u.phone, u.id].filter(Boolean).map(String);
        const phone = candidates.find(isValidIndianPhone) ?? "";
        if (!phone) continue; // require a valid WhatsApp/phone number
        const normPhone = toE164(phone);

        if (kycByPhone.get(normPhone) !== "verified") continue;

        const sentAt = sentByPhone.get(normPhone) ?? null;

        built.push({
          userId: u.id,
          phone: normPhone,
          ownerName: u.ownerName || u.name || "",
          businessName: u.businessName || "",
          shopName: u.shopName || "",
          alreadySent: sentByPhone.has(normPhone),
          sentAt: sentAt && sentAt.getTime() > 0 ? sentAt : null,
        });
      }

      built.sort((a, b) =>
        (a.businessName || a.shopName || a.ownerName || a.phone).localeCompare(
          b.businessName || b.shopName || b.ownerName || b.phone,
        ),
      );
      setRows(built);
      // Default selection is none.
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Search by business, shop or owner name.
  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.businessName.toLowerCase().includes(q) ||
        r.shopName.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q),
    );
  })();

  // Only retailers who have NOT already received kyc_success are selectable.
  const selectableFiltered = filteredRows.filter((r) => !r.alreadySent);
  const eligibleCount = rows.filter((r) => !r.alreadySent).length;

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const visibleIds = selectableFiltered.map((r) => r.userId);
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
    const all = visibleIds.length > 0 && selectedVisible >= visibleIds.length;
    const none = selectedVisible === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, selectableFiltered]);

  const toggleRow = (row: KycSuccessRow) => {
    if (row.alreadySent) return; // excluded — cannot be selected
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.userId)) next.delete(row.userId); else next.add(row.userId);
      return next;
    });
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId) && !r.alreadySent);

  // {{1}} display — business/shop name, falling back to owner name.
  const displayName = (r: KycSuccessRow) => r.businessName || r.shopName || r.ownerName || "—";

  const displayPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: KycSuccessResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "kyc_success",
          // Resolver picks businessName → shopName → ownerName for the single {{1}}.
          payload: {
            ownerName: row.ownerName,
            businessName: row.businessName,
            shopName: row.shopName,
          },
          source: {
            event: "admin_manual_kyc_success",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "general",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">kyc_success</span></li>
            <li>Variable: <span className="font-mono text-xs">{"{{1}}"}</span> = Business / Shop name (falls back to Owner name)</li>
            <li>Recipients: <span className="font-semibold">{selectedRows.length} seller{selectedRows.length !== 1 ? "s" : ""}</span></li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {selectedRows.length} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{displayName(r)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {selectedRows.length} Notification{selectedRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {search.trim()
                ? `${filteredRows.length} of ${rows.length} seller${rows.length !== 1 ? "s" : ""}`
                : `${rows.length} verified seller${rows.length !== 1 ? "s" : ""}`}
              {eligibleCount !== rows.length && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {eligibleCount} not yet sent
                </span>
              )}
              {selectedIds.size > 0 && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {selectedIds.size} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Search by business, shop or owner name */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by business or owner name…"
          className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
        />
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sellers…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No retailers or manufacturers with verified KYC found.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No sellers match &quot;{search.trim()}&quot;.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          // Select All applies only to not-yet-sent retailers.
                          if (e.target.checked) selectableFiltered.forEach((r) => next.add(r.userId));
                          else selectableFiltered.forEach((r) => next.delete(r.userId));
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business / Owner</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "transition-colors",
                        r.alreadySent
                          ? "opacity-60 cursor-not-allowed"
                          : checked
                          ? "bg-primary/5 cursor-pointer"
                          : "hover:bg-gray-50 cursor-pointer",
                      )}
                      onClick={() => toggleRow(r)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={r.alreadySent}
                          onChange={() => toggleRow(r)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {displayName(r)}
                        </p>
                        {r.ownerName && r.ownerName !== displayName(r) && (
                          <p className="text-[10px] text-gray-400 truncate max-w-xs">{r.ownerName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                      <td className="px-3 py-2.5">
                        {r.alreadySent ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500" title="kyc_success already sent">
                            <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                            {r.sentAt ? `Sent ${formatTimeAgo(r.sentAt)}` : "Already sent"}
                          </span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                            KYC verified
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({selectedIds.size} selected)
          </button>
        </>
      )}
    </div>
  );
}

// ─── App Update (Marketing) flow ──────────────────────────────────────────────

type AppUpdateAudience = "manufacturer" | "retailer" | "customer";

type AppUpdateRow = {
  userId: string;
  phone: string;         // normalized E.164 (no '+')
  ownerName: string;
  businessName: string;  // {{1}} primary
  shopName: string;      // {{1}} secondary fallback
  audience: AppUpdateAudience;
};

type AppUpdateResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

const AUDIENCE_LABEL: Record<AppUpdateAudience, string> = {
  manufacturer: "Manufacturer",
  retailer: "Retailer",
  customer: "Customer",
};

/** Maps a raw user role to one of the three targetable audiences, or null for
 *  staff (admin / team) who should never receive a marketing blast. Mirrors the
 *  admin Users tab rule: a customer is role "customer"/"consumer" or no role. */
function classifyAudience(role: string): AppUpdateAudience | null {
  if (role === "manufacturer") return "manufacturer";
  if (role === "retailer") return "retailer";
  if (!role || role === "customer" || role === "consumer") return "customer";
  return null; // admin, team, …
}

function AppUpdateFlow() {
  const [rows, setRows] = useState<AppUpdateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [audienceFilters, setAudienceFilters] = useState<Record<AppUpdateAudience, boolean>>({
    manufacturer: true,
    retailer: true,
    customer: true,
  });
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<AppUpdateResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const users = await getUsers();

      const built: AppUpdateRow[] = [];
      for (const u of users as any[]) {
        const audience = classifyAudience(String(u.role ?? ""));
        if (!audience) continue; // exclude admins / team

        // Require a valid WhatsApp/phone number.
        const candidates = [u.phone, u.id].filter(Boolean).map(String);
        const phone = candidates.find(isValidIndianPhone) ?? "";
        if (!phone) continue;

        built.push({
          userId: u.id,
          phone: toE164(phone),
          ownerName: u.ownerName || u.name || "",
          businessName: u.businessName || "",
          shopName: u.shopName || "",
          audience,
        });
      }

      built.sort((a, b) =>
        (a.businessName || a.shopName || a.ownerName || a.phone).localeCompare(
          b.businessName || b.shopName || b.ownerName || b.phone,
        ),
      );
      setRows(built);
      // Default selection is none.
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Apply audience filters + search. Both narrow the visible rows only —
  // clearing either never changes the selection.
  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!audienceFilters[r.audience]) return false;
      if (!q) return true;
      return (
        r.businessName.toLowerCase().includes(q) ||
        r.shopName.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q)
      );
    });
  })();

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const visibleIds = filteredRows.map((r) => r.userId);
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
    const all = visibleIds.length > 0 && selectedVisible >= visibleIds.length;
    const none = selectedVisible === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, filteredRows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAudience = (a: AppUpdateAudience) =>
    setAudienceFilters((prev) => ({ ...prev, [a]: !prev[a] }));

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));
  const estimatedCost = selectedIds.size * MARKETING_MSG_COST_INR;

  // {{1}} display — business/shop name, falling back to owner name.
  const displayName = (r: AppUpdateRow) => r.businessName || r.shopName || r.ownerName || "—";

  const displayPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: AppUpdateResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "",
          template: "app_update",
          // Resolver picks businessName → shopName → ownerName for the single {{1}}.
          payload: {
            ownerName: row.ownerName,
            businessName: row.businessName,
            shopName: row.shopName,
          },
          source: {
            event: "admin_manual_app_update",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "marketing",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">⚠️ Confirm Marketing send</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">app_update</span> (Marketing · Marathi)</li>
            <li>Variable: <span className="font-mono text-xs">{"{{1}}"}</span> = Business / Shop name (falls back to Owner name)</li>
            <li>Recipients: <span className="font-semibold">{fmtCount(selectedRows.length)}</span></li>
            <li>
              Estimated cost:{" "}
              <span className="font-semibold">
                ₹{fmtCount(selectedRows.length)} × {MARKETING_MSG_COST_INR} = ₹{fmtMoney(estimatedCost)}
              </span>
            </li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {fmtCount(selectedRows.length)} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{displayName(r)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{AUDIENCE_LABEL[r.audience]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {fmtCount(selectedRows.length)} · ₹{fmtMoney(estimatedCost)}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Marketing cost warning */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-1.5">
        <p className="text-sm font-bold text-amber-800">
          ⚠️ This is a Marketing WhatsApp message.
        </p>
        <p className="text-xs text-amber-700">
          Estimated cost: ₹{MARKETING_MSG_COST_INR} per delivered message.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-amber-800">
          <span>Selected: <span className="font-bold">{fmtCount(selectedIds.size)}</span></span>
          <span>
            Estimated cost:{" "}
            <span className="font-bold">
              ₹{fmtCount(selectedIds.size)} × {MARKETING_MSG_COST_INR} = ₹{fmtMoney(estimatedCost)}
            </span>
          </span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {search.trim() || !(audienceFilters.manufacturer && audienceFilters.retailer && audienceFilters.customer)
                ? `${fmtCount(filteredRows.length)} of ${fmtCount(rows.length)} user${rows.length !== 1 ? "s" : ""}`
                : `${fmtCount(rows.length)} user${rows.length !== 1 ? "s" : ""}`}
              {selectedIds.size > 0 && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {fmtCount(selectedIds.size)} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Audience filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(Object.keys(AUDIENCE_LABEL) as AppUpdateAudience[]).map((a) => {
            const active = audienceFilters[a];
            return (
              <button
                key={a}
                onClick={() => toggleAudience(a)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50",
                )}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            );
          })}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business or owner name…"
            className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No users with a valid phone number found.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No users match the current filters.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          // Select All applies to the currently filtered rows only.
                          if (e.target.checked) filteredRows.forEach((r) => next.add(r.userId));
                          else filteredRows.forEach((r) => next.delete(r.userId));
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business / Owner</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {displayName(r)}
                        </p>
                        {r.ownerName && r.ownerName !== displayName(r) && (
                          <p className="text-[10px] text-gray-400 truncate max-w-xs">{r.ownerName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {AUDIENCE_LABEL[r.audience]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({fmtCount(selectedIds.size)} · ₹{fmtMoney(estimatedCost)})
          </button>
        </>
      )}
    </div>
  );
}

// ─── Reel Promotion Hindi (Marketing) flow ───────────────────────────────────

type ReelPromoAudience = "manufacturer" | "retailer" | "customer";
type DeliveryStatus = "read" | "delivered" | "sent" | "failed" | "retrying" | "pending" | "none";

type ReelPromoRow = {
  userId: string;
  phone: string;        // normalized E.164 (no '+')
  ownerName: string;
  businessName: string;
  shopName: string;
  audience: ReelPromoAudience;
  deliveryStatus: DeliveryStatus;
};

type ReelPromoResult = {
  userId: string;
  phone: string;
  businessName: string;
  ok: boolean;
  error?: string;
};

const REEL_PROMO_AUDIENCE_LABEL: Record<ReelPromoAudience, string> = {
  manufacturer: "Manufacturer",
  retailer: "Retailer",
  customer: "Customer",
};

const DELIVERY_STATUS_CONFIG: Record<DeliveryStatus, { label: string; cls: string }> = {
  read:      { label: "Read",      cls: "bg-blue-100 text-blue-700 border-blue-200" },
  delivered: { label: "Delivered", cls: "bg-green-100 text-green-700 border-green-200" },
  sent:      { label: "Sent",      cls: "bg-gray-100 text-gray-600 border-gray-200" },
  failed:    { label: "Failed",    cls: "bg-red-100 text-red-700 border-red-200" },
  retrying:  { label: "Retrying",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  pending:   { label: "Pending",   cls: "bg-gray-100 text-gray-500 border-gray-200" },
  none:      { label: "—",         cls: "text-gray-300" },
};

function classifyReelPromoAudience(role: string): ReelPromoAudience | null {
  if (role === "manufacturer") return "manufacturer";
  if (role === "retailer") return "retailer";
  if (!role || role === "customer" || role === "consumer") return "customer";
  return null;
}

function getReelNotifStatus(data: Record<string, unknown>): DeliveryStatus {
  if (data.readAt) return "read";
  if (data.deliveredAt) return "delivered";
  if (data.failedAt) return "failed";
  if (data.sentAt) return "sent";
  if (data.retryCount && Number(data.retryCount) > 0) return "retrying";
  return "pending";
}

function ReelPromoHindiFlow() {
  const [rows, setRows] = useState<ReelPromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [audienceFilters, setAudienceFilters] = useState<Record<ReelPromoAudience, boolean>>({
    manufacturer: true,
    retailer: true,
    customer: true,
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "delivered" | "not_delivered" | "failed" | "pending_retrying">("all");
  const [step, setStep] = useState<"list" | "confirm" | "sending" | "done">("list");
  const [sendResults, setSendResults] = useState<ReelPromoResult[]>([]);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [users, notifSnap] = await Promise.all([
        getUsers(),
        getDocs(query(collection(db, "waNotifications"), where("template", "==", "reel_promo_hindi"))),
      ]);

      // Build phone → most-recent notification status
      const latestByPhone = new Map<string, { createdMs: number; status: DeliveryStatus }>();
      notifSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        if (!data.phone) return;
        const norm = toE164(String(data.phone));
        const ms = fieldToMs(data.createdAt);
        const prev = latestByPhone.get(norm);
        if (!prev || ms > prev.createdMs) {
          latestByPhone.set(norm, { createdMs: ms, status: getReelNotifStatus(data) });
        }
      });

      const built: ReelPromoRow[] = [];
      for (const u of users as any[]) {
        const audience = classifyReelPromoAudience(String(u.role ?? ""));
        if (!audience) continue;

        const candidates = [u.phone, u.id].filter(Boolean).map(String);
        const phone = candidates.find(isValidIndianPhone) ?? "";
        if (!phone) continue;

        const norm = toE164(phone);
        const deliveryStatus: DeliveryStatus = latestByPhone.get(norm)?.status ?? "none";

        built.push({
          userId: u.id,
          phone: norm,
          ownerName: u.ownerName || u.name || "",
          businessName: u.businessName || "",
          shopName: u.shopName || "",
          audience,
          deliveryStatus,
        });
      }

      built.sort((a, b) =>
        (a.businessName || a.shopName || a.ownerName || a.phone).localeCompare(
          b.businessName || b.shopName || b.ownerName || b.phone,
        ),
      );
      setRows(built);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredRows = (() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!audienceFilters[r.audience]) return false;
      const isDelivered = r.deliveryStatus === "delivered" || r.deliveryStatus === "read";
      if (statusFilter === "delivered" && !isDelivered) return false;
      if (statusFilter === "not_delivered" && isDelivered) return false;
      if (statusFilter === "failed" && r.deliveryStatus !== "failed") return false;
      if (statusFilter === "pending_retrying" && r.deliveryStatus !== "pending" && r.deliveryStatus !== "retrying") return false;
      if (!q) return true;
      return (
        r.businessName.toLowerCase().includes(q) ||
        r.shopName.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q)
      );
    });
  })();

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const visibleIds = filteredRows.map((r) => r.userId);
    const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length;
    const all = visibleIds.length > 0 && selectedVisible >= visibleIds.length;
    const none = selectedVisible === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedIds, filteredRows]);

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAudience = (a: ReelPromoAudience) =>
    setAudienceFilters((prev) => ({ ...prev, [a]: !prev[a] }));

  const handleSelectUndelivered = () => {
    const undelivered = new Set(
      filteredRows
        .filter((r) => r.deliveryStatus !== "delivered" && r.deliveryStatus !== "read")
        .map((r) => r.userId),
    );
    setSelectedIds(undelivered);
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.userId));
  const estimatedCost = selectedIds.size * MARKETING_MSG_COST_INR;

  const displayName = (r: ReelPromoRow) => r.businessName || r.shopName || r.ownerName || "—";

  const displayPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const handleSend = async () => {
    if (sendingRef.current || selectedRows.length === 0) return;
    sendingRef.current = true;
    setStep("sending");

    const results: ReelPromoResult[] = [];
    const now = serverTimestamp();
    const waRef = collection(db, "waNotifications");
    const CHUNK = 400;

    for (let i = 0; i < selectedRows.length; i += CHUNK) {
      const chunk = selectedRows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const row of chunk) {
        batch.set(doc(waRef), {
          phone: row.phone,
          message: "रील प्रमोशन हिंदी",
          template: "reel_promo_hindi",
          // Zero body variables — payload intentionally empty to match the approved template.
          payload: {},
          source: {
            event: "admin_manual_reel_promo_hindi",
            entityType: "users",
            entityId: row.userId,
          },
          status: "pending",
          type: "marketing",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });
      }
      try {
        await batch.commit();
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Batch write failed";
        for (const row of chunk) {
          results.push({ userId: row.userId, phone: row.phone, businessName: displayName(row), ok: false, error: msg });
        }
      }
    }

    setSendResults(results);
    setStep("done");
    sendingRef.current = false;
  };

  const handleReset = () => {
    setStep("list");
    setSendResults([]);
    void loadData();
  };

  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Queuing {selectedRows.length} notification{selectedRows.length !== 1 ? "s" : ""}…</p>
      </div>
    );
  }

  if (step === "done") {
    const successCount = sendResults.filter((r) => r.ok).length;
    const failCount = sendResults.filter((r) => !r.ok).length;
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          {successCount > 0 && (
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successCount}</p>
              <p className="text-xs text-green-600 font-medium">Queued</p>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failCount}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sendResults.map((r) => (
                <tr key={r.userId} className={cn(r.ok ? "bg-green-50/30" : "bg-red-50/30")}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{r.businessName || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5">
                    {r.ok ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium" title={r.error}>
                        <XCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">⚠️ Confirm Marketing send</p>
          <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
            <li>Template: <span className="font-mono text-xs">reel_promo_hindi</span> (Marketing · Hindi)</li>
            <li>Variables: <span className="font-semibold">None</span> — fully static template</li>
            <li>Header: Image (media ID from <span className="font-mono text-xs">WA_REEL_PROMO_HEADER_ID</span>)</li>
            <li>Button: <span className="font-mono text-xs">वीडियो देखिए</span> — static URL</li>
            <li>Recipients: <span className="font-semibold">{fmtCount(selectedRows.length)}</span></li>
            <li>
              Estimated cost:{" "}
              <span className="font-semibold">
                ₹{fmtCount(selectedRows.length)} × {MARKETING_MSG_COST_INR} = ₹{fmtMoney(estimatedCost)}
              </span>
            </li>
          </ul>
          <p className="text-xs text-amber-600 mt-1">
            Queues {fmtCount(selectedRows.length)} doc{selectedRows.length !== 1 ? "s" : ""} to{" "}
            <code className="font-mono">waNotifications</code>. No user records will be modified.
          </p>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedRows.map((r) => (
                <tr key={r.userId}>
                  <td className="px-3 py-2.5 text-xs text-gray-800">{displayName(r)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">{REEL_PROMO_AUDIENCE_LABEL[r.audience]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("list")}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send {fmtCount(selectedRows.length)} · ₹{fmtMoney(estimatedCost)}
          </button>
        </div>
      </div>
    );
  }

  // ── "list" step ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Marketing cost warning */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-1.5">
        <p className="text-sm font-bold text-amber-800">
          ⚠️ This is a Marketing WhatsApp message.
        </p>
        <p className="text-xs text-amber-700">
          Template: <span className="font-mono">reel_promo_hindi</span> · Hindi · Image header · Static URL button · Zero variables.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm text-amber-800">
          <span>Selected: <span className="font-bold">{fmtCount(selectedIds.size)}</span></span>
          <span>
            Estimated cost:{" "}
            <span className="font-bold">
              ₹{fmtCount(selectedIds.size)} × {MARKETING_MSG_COST_INR} = ₹{fmtMoney(estimatedCost)}
            </span>
          </span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm font-medium text-gray-700">
          {loading ? "Loading…" : (
            <>
              {search.trim() || !(audienceFilters.manufacturer && audienceFilters.retailer && audienceFilters.customer) || statusFilter !== "all"
                ? `${fmtCount(filteredRows.length)} of ${fmtCount(rows.length)} user${rows.length !== 1 ? "s" : ""}`
                : `${fmtCount(rows.length)} user${rows.length !== 1 ? "s" : ""}`}
              {selectedIds.size > 0 && (
                <span className="ml-1.5 text-on-surface-variant font-normal">
                  · {fmtCount(selectedIds.size)} selected
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={handleSelectUndelivered}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
        >
          Select Undelivered
        </button>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Audience filters + status filter + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(Object.keys(REEL_PROMO_AUDIENCE_LABEL) as ReelPromoAudience[]).map((a) => {
            const active = audienceFilters[a];
            return (
              <button
                key={a}
                onClick={() => toggleAudience(a)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50",
                )}
              >
                {REEL_PROMO_AUDIENCE_LABEL[a]}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="appearance-none border border-gray-300 rounded-xl pl-3 pr-8 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="delivered">Delivered</option>
            <option value="not_delivered">Not Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending_retrying">Pending / Retrying</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business or owner name…"
            className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-gray-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No users with a valid phone number found.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
          No users match the current filters.
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-8 text-center">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) filteredRows.forEach((r) => next.add(r.userId));
                          else filteredRows.forEach((r) => next.delete(r.userId));
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Business / Owner</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Audience</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r) => {
                  const checked = selectedIds.has(r.userId);
                  const statusCfg = DELIVERY_STATUS_CONFIG[r.deliveryStatus];
                  return (
                    <tr
                      key={r.userId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-gray-50",
                      )}
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(r.userId)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-xs">
                          {displayName(r)}
                        </p>
                        {r.ownerName && r.ownerName !== displayName(r) && (
                          <p className="text-[10px] text-gray-400 truncate max-w-xs">{r.ownerName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{displayPhone(r.phone)}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {REEL_PROMO_AUDIENCE_LABEL[r.audience]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.deliveryStatus === "none" ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded-full border font-medium", statusCfg.cls)}>
                            {statusCfg.label}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setStep("confirm")}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Review &amp; Send ({fmtCount(selectedIds.size)} · ₹{fmtMoney(estimatedCost)})
          </button>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SendMessagesPage() {
  const [templateId, setTemplateId] = useState<TemplateId>("product_assignment_pending_signup");
  const selected = TEMPLATES.find((t) => t.id === templateId)!;

  return (
    <div className="flex flex-col gap-3">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
          <Send className="h-6 w-6 text-primary" />
          WhatsApp
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Customer conversations &amp; template messaging via WhatsApp Business
        </p>
      </div>
      <WaSubNav />

      <div className="w-full space-y-6 py-2">
        {/* Template selector — single dropdown */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[280px] max-w-sm flex-1">
            <label className="block text-sm font-semibold text-gray-700">
              Select Template
            </label>
            <div className="relative">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value as TemplateId)}
                className="w-full appearance-none border border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>
          <p className="text-xs text-gray-400 pb-2.5 max-w-xs">{selected.description}</p>
        </div>

        <hr className="border-gray-200" />

        {/* Active flow */}
        {templateId === "payment_failed_app_update" && <PaymentFailedFlow />}
        {templateId === "product_assignment_pending_signup" && <PendingSignupFlow />}
        {templateId === "subscription_expiry" && <SubscriptionExpiryFlow />}
        {templateId === "retailer_seat_promotion" && <RetailerSeatPromotionFlow />}
        {templateId === "new_product_reminder" && <NewProductReminderFlow />}
        {templateId === "kyc_pending" && <KycPendingFlow />}
        {templateId === "kyc_success" && <KycSuccessFlow />}
        {templateId === "app_update" && <AppUpdateFlow />}
        {templateId === "reel_promo_hindi" && <ReelPromoHindiFlow />}
      </div>
    </div>
  );
}
