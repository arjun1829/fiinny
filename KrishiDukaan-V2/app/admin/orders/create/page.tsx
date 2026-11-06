"use client";

/**
 * Admin → Orders → Create order manually.
 *
 * Reconstructs an order for a customer whose Razorpay payment SUCCEEDED but whose
 * order was never written by the normal checkout. Step-by-step:
 *   Customer → Retailer → Products → Review → Payment → Create.
 *
 * Nothing authoritative lives here — every price and every check comes back from
 * the server (/api/admin/manual-order/*). The UI only collects the selections and
 * surfaces the server's blockers. The order is created ONLY against a verified,
 * captured payment whose amount equals the computed total; a mismatch is shown and
 * blocks creation. Re-submitting a created order returns the same order (the
 * server keys it deterministically), so retries never double-create or double-notify.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Search, User, Store, Package, Trash2,
  CreditCard, FileText, AlertTriangle, CheckCircle2, RefreshCw, IndianRupee, X,
} from "lucide-react";
import { authedJsonHeaders } from "../../../lib/authed-fetch";

const inr = (n: number | undefined | null) =>
  `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Server payload types ──────────────────────────────────────────────────────
type Customer = { id: string; name: string; phone: string; email: string | null; city: string | null; state: string | null; address: string | null };
type Retailer = { id: string; phone: string; shopName: string; city: string | null; state: string | null; gstin: string | null };
type ProductRow = { copyId: string; productId: string; name: string; price: number; image: string | null; variants: { unit: string; price: number }[]; gstApplicable: boolean; gstRate: number };
type CartLine = { productId: string; copyId: string; name: string; qty: number; variantUnit: string; variants: { unit: string; price: number }[]; price: number };

type Pricing = {
  lines: { productId: string; name: string; unitPrice: number; qty: number; lineTotal: number; variantUnit?: string; gstApplicable: boolean; gstRate: number; priceSource: string }[];
  subtotal: number; totalGst: number; totalGstAdded: number; deliveryCharge: number;
  deliveryCalculated: number; deliveryOverridden: boolean;
  deliveryBreakdown: { slab: number; extra: number; free: boolean; waived: number }; deliveryType: string; grandTotal: number;
};
type Verification = {
  ok: boolean; blocking: string[]; warnings: string[]; razorpayPaymentId: string; razorpayOrderId: string | null;
  status: string | null; amountPaise: number | null; amountRupees: number | null; method: string | null;
  contact: string | null; email: string | null; createdAt: number | null; notesUserId: string | null;
  existingOrderIds: string[]; isOwnManualOrder: boolean; verifiedVia: "razorpay" | "internal_record";
};
type PaymentRow = {
  id: string; razorpayOrderId: string | null; amount: number; amountPaise: number; status: string;
  method: string | null; contact: string | null; email: string | null; createdAt: number | null;
  buyerUserId: string | null; isSubscription: boolean; alreadyLinked: boolean; linkedOrderIds: string[]; note: string | null;
  fromInternal?: boolean;
};
type CreateResult = { ok: true; orderId: string; alreadyExisted: boolean; status: string; grandTotal: number; invoice: { ok: boolean; generated?: boolean; pending?: boolean; invoiceNumber?: string; error?: string } };

const STEPS = ["Customer", "Retailer", "Products", "Review", "Payment", "Create"] as const;

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authedJsonHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed.");
  return json as T;
}
async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: await authedJsonHeaders(), body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed.");
  return json as T;
}

// ── Generic server-backed autocomplete ────────────────────────────────────────
function AsyncSearch<T extends { id?: string; copyId?: string }>({
  placeholder, fetcher, renderOption, onPick, icon: Icon, minChars = 2,
}: {
  placeholder: string;
  fetcher: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  icon: React.ElementType;
  /** 0 = browse mode: load the full list immediately and filter as you type. */
  minChars?: number;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (q.trim().length < minChars) { if (minChars > 0) setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetcher(q.trim())
        .then((r) => { if (!cancelled) { setResults(r); setOpen(true); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, fetcher, minChars]);

  // Browse mode: load the full list once on mount so the dropdown is populated
  // before the user types anything.
  useEffect(() => {
    if (minChars > 0) return;
    let cancelled = false;
    setLoading(true);
    fetcher("")
      .then((r) => { if (!cancelled) setResults(r); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetcher, minChars]);

  return (
    <div ref={wrapRef} className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-9 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
      {open && (results.length > 0 || (!loading && q.trim().length >= minChars)) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-outline-variant/40 bg-white shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-4 text-sm text-on-surface-variant text-center">
              {loading ? "Loading…" : q.trim() ? `No results for “${q.trim()}”.` : "No products found for this retailer."}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-outline-variant/10">
              {results.map((item, i) => (
                <li key={(item.id ?? item.copyId ?? String(i))}>
                  <button
                    type="button"
                    onMouseDown={() => { onPick(item); setOpen(false); if (minChars > 0) { setQ(""); setResults([]); } }}
                    className="w-full px-3 py-2.5 text-left hover:bg-surface-container-low transition-colors"
                  >
                    {renderOption(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            i === step ? "bg-primary text-white" : i < step ? "bg-green-100 text-green-700" : "bg-surface-container text-on-surface-variant"
          }`}>
            {i < step ? <Check className="h-3 w-3" /> : <span className="font-black">{i + 1}</span>}
            {label}
          </span>
          {i < STEPS.length - 1 && <span className="text-on-surface-variant/40">›</span>}
        </div>
      ))}
    </div>
  );
}

function Banner({ tone, children }: { tone: "error" | "warn" | "ok" | "info"; children: React.ReactNode }) {
  const map = {
    error: "bg-red-50 border-red-200 text-red-800",
    warn: "bg-amber-50 border-amber-200 text-amber-800",
    ok: "bg-green-50 border-green-200 text-green-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  } as const;
  const Icon = tone === "ok" ? CheckCircle2 : tone === "error" || tone === "warn" ? AlertTriangle : FileText;
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${map[tone]}`}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function CreateManualOrderPage() {
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [pricingBusy, setPricingBusy] = useState(false);
  // null = use the calculated delivery; a number = admin override (₹), incl. 0.
  const [deliveryOverride, setDeliveryOverride] = useState<number | null>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsBusy, setPaymentsBusy] = useState(false);
  const [paymentIdInput, setPaymentIdInput] = useState("");
  // Date window for the captured-payment list. Defaults to yesterday → today so a
  // payment received yesterday is in range out of the box.
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [payFrom, setPayFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); });
  const [payTo, setPayTo] = useState(() => ymd(new Date()));
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  // Pasting a payment ID is the primary path; the date-filtered list is optional.
  const [showBrowse, setShowBrowse] = useState(false);

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    const r = await apiGet<{ results: Customer[] }>(`/api/admin/manual-order/search?type=customer&q=${encodeURIComponent(q)}`);
    return r.results;
  }, []);
  const searchRetailers = useCallback(async (q: string) => {
    const r = await apiGet<{ results: Retailer[] }>(`/api/admin/manual-order/search?type=retailer&q=${encodeURIComponent(q)}`);
    return r.results;
  }, []);
  const searchProducts = useCallback(async (q: string) => {
    if (!retailer) return [];
    const r = await apiGet<{ results: ProductRow[] }>(`/api/admin/manual-order/search?type=product&retailerPhone=${encodeURIComponent(retailer.phone)}&q=${encodeURIComponent(q)}`);
    return r.results;
  }, [retailer]);

  const itemsPayload = () => cart.map((l) => ({ productId: l.productId, copyId: l.copyId, qty: l.qty, variantUnit: l.variantUnit || undefined }));

  // Re-price whenever the Review or Payment step is active and the cart changes.
  const review = useCallback(async (razorpayPaymentId?: string) => {
    if (!retailer || cart.length === 0) return;
    setPricingBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ pricing: Pricing; verification: Verification | null }>("/api/admin/manual-order/review", {
        sellerPhone: retailer.phone,
        items: itemsPayload(),
        customerId: customer?.id,
        customerDeliveryState: customer?.state ?? undefined,
        deliveryCharge: deliveryOverride,
        razorpayPaymentId,
      });
      setPricing(r.pricing);
      if (razorpayPaymentId) setVerification(r.verification);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not price the order.");
    } finally {
      setPricingBusy(false);
    }
  }, [retailer, cart, customer, deliveryOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const goReview = async () => { await review(); setStep(3); };

  const loadPayments = async () => {
    setPaymentsBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (payFrom) params.set("from", String(Math.floor(new Date(`${payFrom}T00:00:00`).getTime() / 1000)));
      if (payTo) params.set("to", String(Math.floor(new Date(`${payTo}T23:59:59`).getTime() / 1000)));
      const r = await apiGet<{ payments: PaymentRow[] }>(`/api/admin/manual-order/payments?${params.toString()}`);
      setPayments(r.payments.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.");
    } finally {
      setPaymentsBusy(false);
    }
  };

  const lookupPaymentId = async () => {
    const id = paymentIdInput.trim();
    if (!id) return;
    setPaymentsBusy(true);
    setError(null);
    try {
      const r = await apiGet<{ payment: PaymentRow }>(`/api/admin/manual-order/payments?paymentId=${encodeURIComponent(id)}`);
      setPayments((prev) => [r.payment, ...prev.filter((p) => p.id !== r.payment.id)]);
      await selectPayment(r.payment.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment not found.");
    } finally {
      setPaymentsBusy(false);
    }
  };

  const selectPayment = async (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setVerifyBusy(true);
    setVerification(null);
    try {
      await review(paymentId);
    } finally {
      setVerifyBusy(false);
    }
  };

  const create = async () => {
    if (!customer || !retailer || !selectedPaymentId) return;
    setCreating(true);
    setError(null);
    try {
      const r = await apiPost<CreateResult>("/api/admin/manual-order", {
        sellerPhone: retailer.phone,
        razorpayPaymentId: selectedPaymentId,
        customer: {
          id: customer.id, name: customer.name, phone: customer.phone,
          email: customer.email, address: customer.address, deliveryState: customer.state,
        },
        items: itemsPayload(),
        deliveryCharge: deliveryOverride,
      });
      setResult(r);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order creation failed.");
    } finally {
      setCreating(false);
    }
  };

  const addProduct = (p: ProductRow) => {
    setCart((prev) => {
      if (prev.some((l) => l.copyId === p.copyId)) return prev;
      const defaultVariant = p.variants[0]?.unit ?? "";
      return [...prev, { productId: p.productId, copyId: p.copyId, name: p.name, qty: 1, variantUnit: defaultVariant, variants: p.variants, price: p.price }];
    });
    setPricing(null);
    setVerification(null);
  };
  const updateLine = (copyId: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => (l.copyId === copyId ? { ...l, ...patch } : l)));
    setPricing(null);
    setVerification(null);
  };
  const removeLine = (copyId: string) => {
    setCart((prev) => prev.filter((l) => l.copyId !== copyId));
    setPricing(null);
    setVerification(null);
  };

  // Delivery can be overridden by the admin. Subtotal and GST don't depend on it,
  // so the effective total is recomputed on the client the instant it changes; the
  // server re-prices authoritatively at payment-verify and at create.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const effectiveDelivery = pricing ? (deliveryOverride !== null ? deliveryOverride : pricing.deliveryCalculated) : 0;
  const effectiveTotal = pricing ? round2(pricing.subtotal + pricing.totalGstAdded + effectiveDelivery) : 0;

  // Changing delivery changes the payable total, so any payment picked against the
  // old total must be re-verified — drop the selection when the override changes.
  useEffect(() => {
    setSelectedPaymentId(null);
    setVerification(null);
  }, [deliveryOverride]);

  const setDelivery = (raw: string) => {
    const t = raw.trim();
    if (t === "") { setDeliveryOverride(pricing ? round2(pricing.deliveryCalculated) : 0); return; }
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) setDeliveryOverride(round2(n));
  };

  const canCreate = Boolean(customer && retailer && cart.length > 0 && selectedPaymentId && verification?.ok && !creating);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/admin/orders" className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 text-xs font-bold text-on-surface-variant hover:bg-surface-container">
          <ArrowLeft className="h-3.5 w-3.5" /> Orders
        </Link>
        <h1 className="text-lg sm:text-2xl font-black text-on-surface">Create order manually</h1>
      </div>
      <p className="text-xs sm:text-sm text-on-surface-variant -mt-2">
        For a customer whose payment succeeded but whose order was never created. The order is placed only against a verified captured payment.
      </p>

      <StepHeader step={step} />

      {error && <Banner tone="error"><p className="whitespace-pre-wrap">{error}</p></Banner>}

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:p-5 space-y-4">
        {/* STEP 0 — Customer */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Select customer</p>
            {customer ? (
              <SelectedCard onClear={() => { setCustomer(null); }} icon={User}>
                <p className="font-bold text-on-surface">{customer.name}</p>
                <p className="text-xs text-on-surface-variant">{customer.phone}{customer.city ? ` · ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""}</p>
                <p className="text-[11px] text-on-surface-variant font-mono break-all">{customer.id}</p>
              </SelectedCard>
            ) : (
              <AsyncSearch<Customer>
                placeholder="Search customer by phone, name or email…"
                icon={Search}
                fetcher={searchCustomers}
                onPick={setCustomer}
                renderOption={(c) => (
                  <div><p className="font-semibold text-on-surface text-sm">{c.name}</p>
                    <p className="text-xs text-on-surface-variant">{c.phone}{c.city ? ` · ${c.city}` : ""}</p></div>
                )}
              />
            )}
          </div>
        )}

        {/* STEP 1 — Retailer */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Select retailer (fulfils the order)</p>
            {retailer ? (
              <SelectedCard onClear={() => { setRetailer(null); setCart([]); setPricing(null); setDeliveryOverride(null); }} icon={Store}>
                <p className="font-bold text-on-surface">{retailer.shopName}</p>
                <p className="text-xs text-on-surface-variant">{retailer.phone}{retailer.city ? ` · ${retailer.city}` : ""}</p>
              </SelectedCard>
            ) : (
              <AsyncSearch<Retailer>
                placeholder="Search retailer by shop name, phone or city…"
                icon={Search}
                fetcher={searchRetailers}
                onPick={(r) => { setRetailer(r); setCart([]); setDeliveryOverride(null); }}
                renderOption={(r) => (
                  <div><p className="font-semibold text-on-surface text-sm">{r.shopName}</p>
                    <p className="text-xs text-on-surface-variant">{r.phone}{r.city ? ` · ${r.city}` : ""}</p></div>
                )}
              />
            )}
          </div>
        )}

        {/* STEP 2 — Products */}
        {step === 2 && retailer && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Add {retailer.shopName}&apos;s products</p>
            <AsyncSearch<ProductRow>
              placeholder="Search or browse this retailer's products…"
              icon={Package}
              minChars={0}
              fetcher={searchProducts}
              onPick={addProduct}
              renderOption={(p) => (
                <div className="flex items-center justify-between gap-2">
                  <div><p className="font-semibold text-on-surface text-sm">{p.name}</p>
                    <p className="text-[11px] text-on-surface-variant font-mono">{p.productId}</p></div>
                  <span className="text-xs font-bold text-on-surface">{inr(p.price)}</span>
                </div>
              )}
            />
            {cart.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No products added yet.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((l) => (
                  <div key={l.copyId} className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/30 bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-on-surface truncate">{l.name}</p>
                      <p className="text-[11px] text-on-surface-variant font-mono">{l.productId}</p>
                    </div>
                    {l.variants.length > 0 && (
                      <select
                        value={l.variantUnit}
                        onChange={(e) => updateLine(l.copyId, { variantUnit: e.target.value })}
                        className="rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs"
                      >
                        {l.variants.map((v) => <option key={v.unit} value={v.unit}>{v.unit} ({inr(v.price)})</option>)}
                      </select>
                    )}
                    <input
                      type="number" min={1} value={l.qty}
                      onChange={(e) => updateLine(l.copyId, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      className="w-16 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-xs text-center"
                    />
                    <button type="button" onClick={() => removeLine(l.copyId)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Review order</p>
            {pricingBusy ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Pricing…</div>
            ) : pricing ? (
              <PricingTable
                pricing={pricing}
                effectiveDelivery={effectiveDelivery}
                effectiveTotal={effectiveTotal}
                overridden={deliveryOverride !== null && round2(deliveryOverride) !== round2(pricing.deliveryCalculated)}
                onDeliveryChange={setDelivery}
                onResetDelivery={() => setDeliveryOverride(null)}
              />
            ) : (
              <button type="button" onClick={() => void review()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">
                <RefreshCw className="h-3.5 w-3.5" /> Price order
              </button>
            )}
          </div>
        )}

        {/* STEP 4 — Payment */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Link a successful payment</p>
            {pricing && (
              <Banner tone="info">
                Order total to match: <span className="font-black">{inr(effectiveTotal)}</span>
                {" "}(subtotal {inr(pricing.subtotal)}{pricing.totalGstAdded > 0 ? ` + GST ${inr(pricing.totalGstAdded)}` : ""} + delivery {inr(effectiveDelivery)})
              </Banner>
            )}

            {/* Primary: paste the Razorpay payment ID. */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Razorpay payment ID</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
                  <input
                    value={paymentIdInput}
                    onChange={(e) => setPaymentIdInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void lookupPaymentId(); }}
                    placeholder="pay_XXXXXXXXXXXXXX"
                    autoFocus
                    className="w-full rounded-lg border border-outline-variant/40 bg-white pl-9 pr-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button type="button" onClick={() => void lookupPaymentId()} disabled={paymentsBusy || !paymentIdInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-40">
                  {paymentsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Find payment
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Paste the payment ID from Razorpay or Admin → Payments. It&apos;s found regardless of date; a payment already backing an order can&apos;t be reused.
              </p>
            </div>

            {/* Optional: browse recent captured payments by date. */}
            <button type="button" onClick={() => setShowBrowse((v) => !v)}
              className="text-xs font-bold text-primary hover:underline">
              {showBrowse ? "Hide" : "Or browse recent captured payments"}
            </button>
            {showBrowse && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  From
                  <input type="date" value={payFrom} max={payTo || undefined} onChange={(e) => setPayFrom(e.target.value)}
                    className="mt-1 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-sm font-semibold text-on-surface" />
                </label>
                <label className="flex flex-col text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  To
                  <input type="date" value={payTo} min={payFrom || undefined} onChange={(e) => setPayTo(e.target.value)}
                    className="mt-1 rounded-lg border border-outline-variant/40 bg-white px-2 py-1.5 text-sm font-semibold text-on-surface" />
                </label>
                <button type="button" onClick={() => void loadPayments()} disabled={paymentsBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-white px-3 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
                  {paymentsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Load captured payments
                </button>
              </div>
            )}

            {payments.length > 0 && (
              <div className="divide-y divide-outline-variant/15 rounded-xl border border-outline-variant/30 bg-white max-h-80 overflow-y-auto">
                {payments.map((p) => {
                  const blocked = p.alreadyLinked || p.isSubscription;
                  const sel = selectedPaymentId === p.id;
                  return (
                    <button key={p.id} type="button" disabled={blocked}
                      onClick={() => void selectPayment(p.id)}
                      className={`w-full px-3 py-2.5 text-left transition-colors ${sel ? "bg-primary/5" : "hover:bg-surface-container-low"} ${blocked ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-on-surface">{p.id}</p>
                          <p className="text-[11px] text-on-surface-variant">
                            {p.contact ?? "—"} · {p.method ?? "—"} · {p.createdAt ? new Date(p.createdAt * 1000).toLocaleDateString("en-IN") : "—"}
                            {p.fromInternal ? " · via internal ledger" : ""}
                          </p>
                          {p.note && <p className="text-[11px] text-on-surface-variant/80">{p.note}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-sm text-on-surface">{inr(p.amount)}</p>
                          {p.isSubscription && <p className="text-[10px] font-bold text-amber-700">subscription</p>}
                          {p.alreadyLinked && <p className="text-[10px] font-bold text-red-700">linked → {p.linkedOrderIds.join(", ") || "order"}</p>}
                          {sel && !blocked && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {verifyBusy && <div className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Verifying against Razorpay…</div>}
            {verification && !verifyBusy && (
              <div className="space-y-2">
                {verification.ok
                  ? <Banner tone="ok">Payment verified{verification.verifiedVia === "internal_record" ? " via internal ledger" : ""}: {verification.amountRupees != null ? `${inr(verification.amountRupees)} ` : ""}{verification.verifiedVia === "internal_record" ? "recorded paid" : "captured"}, consistent with the order total and the selected customer.</Banner>
                  : <Banner tone="error"><p className="font-bold mb-1">Cannot use this payment:</p><ul className="list-disc pl-4 space-y-0.5">{verification.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul></Banner>}
                {verification.warnings.length > 0 && (
                  <Banner tone="warn"><ul className="list-disc pl-4 space-y-0.5">{verification.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Banner>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 5 — Result */}
        {step === 5 && result && (
          <div className="space-y-3">
            <Banner tone="ok">
              <p className="font-bold">{result.alreadyExisted ? "Order already existed (not re-created)." : "Order created."}</p>
              <p className="mt-1">Order ID <span className="font-mono font-bold">{result.orderId}</span> · status <span className="font-bold">{result.status}</span> · {inr(result.grandTotal)}</p>
            </Banner>
            {result.invoice.ok && result.invoice.pending
              ? <Banner tone="info">The invoice will be created when the seller accepts the order.</Banner>
              : result.invoice.ok
              ? <Banner tone="info">Invoice {result.invoice.generated ? "generated" : "already present"}{result.invoice.invoiceNumber ? `: ${result.invoice.invoiceNumber}` : ""}.</Banner>
              : <Banner tone="warn">Invoice not generated: {result.invoice.error ?? "unknown error"}. You can safely re-run Create to retry — it will not duplicate the order or notifications.</Banner>}
            <Banner tone="info">Customer and seller WhatsApp notifications and inventory are handled automatically by the existing order triggers — exactly once.</Banner>
            <div className="flex gap-2">
              <Link href="/admin/orders" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Go to Orders</Link>
            </div>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      {step < 5 && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-bold text-on-surface-variant disabled:opacity-40">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          {step === 0 && <NextBtn disabled={!customer} onClick={() => setStep(1)} />}
          {step === 1 && <NextBtn disabled={!retailer} onClick={() => setStep(2)} />}
          {step === 2 && <NextBtn disabled={cart.length === 0} onClick={() => void goReview()} label="Review" />}
          {step === 3 && <NextBtn disabled={!pricing || pricingBusy} onClick={() => setStep(4)} label="Choose payment" icon={CreditCard} />}
          {step === 4 && (
            <button type="button" disabled={!canCreate} onClick={() => void create()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="h-3.5 w-3.5" />} Create order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NextBtn({ disabled, onClick, label = "Next", icon: Icon = ArrowRight }: { disabled: boolean; onClick: () => void; label?: string; icon?: React.ElementType }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
      {label} <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function SelectedCard({ children, icon: Icon, onClear }: { children: React.ReactNode; icon: React.ElementType; onClear: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" onClick={onClear} className="rounded-lg p-1 text-on-surface-variant hover:text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
    </div>
  );
}

function PricingTable({
  pricing, effectiveDelivery, effectiveTotal, overridden, onDeliveryChange, onResetDelivery,
}: {
  pricing: Pricing;
  effectiveDelivery: number;
  effectiveTotal: number;
  overridden: boolean;
  onDeliveryChange: (raw: string) => void;
  onResetDelivery: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-white">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container-low">
              <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Product</th>
              <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-on-surface-variant">Pack</th>
              <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Price</th>
              <th className="px-3 py-2 text-center font-black uppercase tracking-wider text-on-surface-variant">Qty</th>
              <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-on-surface-variant">Line</th>
            </tr>
          </thead>
          <tbody>
            {pricing.lines.map((l, i) => (
              <tr key={i} className="border-b border-outline-variant/10 last:border-0">
                <td className="px-3 py-2">
                  <p className="font-semibold text-on-surface">{l.name}</p>
                  {l.priceSource !== "seller-copy" && l.priceSource !== "inventory" && (
                    <p className="text-[10px] text-amber-700">price source: {l.priceSource}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-on-surface-variant">{l.variantUnit || "—"}</td>
                <td className="px-3 py-2 text-right text-on-surface-variant">{inr(l.unitPrice)}{l.gstApplicable ? ` (GST ${l.gstRate}%)` : ""}</td>
                <td className="px-3 py-2 text-center font-bold">{l.qty}</td>
                <td className="px-3 py-2 text-right font-bold">{inr(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto max-w-sm space-y-1.5 text-sm">
        <Row label="Subtotal" value={inr(pricing.subtotal)} />
        {pricing.totalGstAdded > 0 && <Row label="GST (added)" value={inr(pricing.totalGstAdded)} />}
        <div className="flex items-center justify-between gap-2">
          <span className="text-on-surface-variant">Delivery charge</span>
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-variant">₹</span>
            <input
              type="number" min={0} step="0.01"
              value={effectiveDelivery}
              onChange={(e) => onDeliveryChange(e.target.value)}
              className="w-24 rounded-lg border border-outline-variant/40 bg-white px-2 py-1 text-sm text-right font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 text-[11px] text-on-surface-variant">
          <span>Calculated: {inr(pricing.deliveryCalculated)}{pricing.deliveryBreakdown.free ? " (free)" : ""}</span>
          {overridden && (
            <button type="button" onClick={onResetDelivery} className="font-bold text-primary hover:underline">reset</button>
          )}
        </div>
        <div className="border-t border-outline-variant/30 pt-1.5"><Row label="Payable total" value={inr(effectiveTotal)} bold /></div>
        {overridden && <p className="text-right text-[11px] font-bold text-amber-700">Delivery manually set — the order & invoice will use ₹{effectiveDelivery.toFixed(2)}.</p>}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant">{label}</span>
      <span className={bold ? "font-black text-on-surface" : "font-semibold text-on-surface"}>{value}</span>
    </div>
  );
}
