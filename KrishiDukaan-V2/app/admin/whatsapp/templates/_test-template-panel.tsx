"use client";

import { useMemo, useState } from "react";
import { auth } from "../../../firebase";
import { FlaskConical, CheckCircle, XCircle, AlertTriangle, Loader2, ChevronDown } from "lucide-react";
import { isWaTestingEnabled, environmentLabel } from "../../../lib/wa/test-mode";

/**
 * Development / UAT-only "Test WhatsApp Template" panel. Hidden entirely on the
 * production deployment (isWaTestingEnabled), and the backend enforces the same
 * gate — this is only the UI. It resolves + validates a template through the
 * real services and either simulates (mock) or sends via the dedicated WA test
 * number. It triggers NO business actions (no seats / orders / subscriptions).
 */

// Known templates + a representative sample payload each, so the tester starts
// from a valid example and can then break it to see validation react.
const SAMPLES: { template: string; label: string; sample: Record<string, string> }[] = [
  { template: "order_confirmation_customer", label: "Order confirmation (customer)", sample: { customerName: "Ramesh Patil", orderId: "ORD12345" } },
  { template: "order_notification", label: "Order notification (retailer/mfr)", sample: { shopName: "Krishi Kendra" } },
  { template: "order_tracking_link", label: "Shipment tracking link", sample: { customerName: "Ramesh Patil", trackingUrl: "https://shiprocket.co/tracking/ABC123", trackingIdTypeLabel: "Article Number", trackingId: "28277102755121" } },
  { template: "subscription_welcome", label: "Subscription welcome", sample: { ownerName: "Ramesh Patil", businessName: "Krishi Kendra" } },
  { template: "subscription_expiry", label: "Subscription expiry", sample: { ownerName: "Ramesh Patil", formattedExpiryDate: "15 July 2026" } },
  { template: "retailer_onboarding", label: "Retailer onboarding", sample: { retailerName: "R", manufacturerName: "M", inviteCode: "INV9" } },
  { template: "product_assignment_pending_signup", label: "Product assignment (pending signup)", sample: { retailerName: "R", manufacturerName: "M", productName: "P", inviteCode: "INV9", productId: "PID9" } },
  { template: "manufacturer_network_summary", label: "Manufacturer network summary", sample: { ownerName: "M", retailerCount: "12" } },
  { template: "free_seats_assigned", label: "Free seats assigned (promo)", sample: { businessName: "Krishi Kendra", seats: "10" } },
  { template: "navratri_offer_free", label: "Navratri promo (free) — image header", sample: { businessName: "Krishi Kendra" } },
];

type Result = {
  ok?: boolean;
  simulated?: boolean;
  delivered?: boolean;
  mode?: string;
  environment?: string;
  resultLabel?: string;
  error?: string;
  detail?: string;
  template?: string;
  language?: string;
  parameters?: { component: string; position: number; type: string; value: string }[];
  payload?: unknown;
  metaMessageId?: string;
  validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    checks: { label: string; ok: boolean; detail?: string }[];
  };
};

export function WaTestTemplatePanel() {
  // Client-side gate — the panel simply does not exist in production builds.
  if (!isWaTestingEnabled()) return null;
  return <PanelInner />;
}

function PanelInner() {
  const [open, setOpen] = useState(false);
  const [templateIdx, setTemplateIdx] = useState(0);
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(SAMPLES[0].sample, null, 2));
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<null | "mock" | "live">(null);
  const [result, setResult] = useState<Result | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const env = useMemo(() => environmentLabel(), []);
  const current = SAMPLES[templateIdx];

  const onPickTemplate = (idx: number) => {
    setTemplateIdx(idx);
    setPayloadText(JSON.stringify(SAMPLES[idx].sample, null, 2));
    setResult(null);
    setJsonError(null);
  };

  const run = async (mode: "mock" | "live") => {
    setJsonError(null);
    let payload: Record<string, unknown>;
    try {
      payload = payloadText.trim() ? JSON.parse(payloadText) : {};
    } catch {
      setJsonError("Sample data is not valid JSON.");
      return;
    }
    if (mode === "live" && !window.confirm(`Send a REAL test message via the WA test number to ${phone || "(no phone)"}? This uses test credentials only — never production.`)) return;
    setBusy(mode);
    setResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/wa/test-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ template: current.template, payload, phone, mode }),
      });
      setResult((await res.json()) as Result);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <FlaskConical className="h-4 w-4" /> Test WhatsApp Template
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">{env}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-amber-700 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-amber-200 px-4 py-4">
          <p className="text-xs text-amber-800">
            Dev/UAT only. Resolves &amp; validates through the real template resolver, then either
            simulates (mock) or sends via the dedicated WA test number. No seats, orders, or
            subscriptions are ever created.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">Template</span>
              <select
                value={templateIdx}
                onChange={(e) => onPickTemplate(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {SAMPLES.map((s, i) => <option key={s.template} value={i}>{s.label}</option>)}
              </select>
              <span className="mt-1 block font-mono text-[10px] text-gray-400">{current.template}</span>
            </label>
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">Recipient phone (for live send)</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">Sample data (JSON)</span>
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs"
            />
            {jsonError && <span className="mt-1 block text-xs text-red-600">{jsonError}</span>}
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("mock")}
              disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {busy === "mock" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
              Preview &amp; Validate (Mock)
            </button>
            <button
              type="button"
              onClick={() => run("live")}
              disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-900 hover:bg-amber-200 disabled:opacity-50"
            >
              {busy === "live" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Send Live Test (WA test number)
            </button>
          </div>

          {result && <ResultView result={result} />}
        </div>
      )}
    </div>
  );
}

function ResultView({ result }: { result: Result }) {
  const v = result.validation;
  const labelColor = result.delivered ? "bg-green-100 text-green-800" : result.simulated ? "bg-gray-200 text-gray-800" : "bg-red-100 text-red-800";
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${labelColor}`}>
          {result.resultLabel ?? (result.error ? "ERROR" : "RESULT")}
        </span>
        {result.environment && <span className="text-[11px] text-gray-500">env: {result.environment}</span>}
        {result.metaMessageId && <span className="font-mono text-[11px] text-gray-500">metaId: {result.metaMessageId}</span>}
      </div>

      {result.error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          {result.error}{result.detail ? ` — ${result.detail}` : ""}
        </p>
      )}

      {v && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Validation {v.valid ? "✓ passed" : "✗ failed"}</p>
          <ul className="space-y-1">
            {v.checks.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                {c.ok ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                <span className={c.ok ? "text-gray-700" : "text-red-700"}>{c.label}{c.detail ? <span className="text-gray-400"> — {c.detail}</span> : null}</span>
              </li>
            ))}
          </ul>
          {v.errors.map((e, i) => <p key={`e${i}`} className="flex items-start gap-1.5 text-xs text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}</p>)}
          {v.warnings.map((w, i) => <p key={`w${i}`} className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>)}
        </div>
      )}

      {result.parameters && result.parameters.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">Resolved parameters</p>
          <div className="mt-1 overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 text-left text-gray-500"><th className="px-2 py-1">Component</th><th className="px-2 py-1">#</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">Value</th></tr></thead>
              <tbody>
                {result.parameters.map((p, i) => (
                  <tr key={i} className="border-t border-gray-100"><td className="px-2 py-1 font-mono">{p.component}</td><td className="px-2 py-1">{p.position}</td><td className="px-2 py-1">{p.type}</td><td className="px-2 py-1 font-mono text-gray-700 break-all">{p.value || <span className="text-red-500">(empty)</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.payload != null && (
        <details>
          <summary className="cursor-pointer text-[11px] font-black uppercase tracking-widest text-gray-500">Generated Cloud API payload</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-[11px] text-gray-100">{JSON.stringify(result.payload, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
