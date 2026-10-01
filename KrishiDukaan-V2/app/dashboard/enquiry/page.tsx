"use client";

/**
 * Dashboard → Enquiries. Lost sales the seller can still win back.
 *
 * When a buyer opens checkout for a product and never pays, admin already saw
 * it under Payments. This is the same event handed to the people who can
 * actually do something about it: every seller offering that product for
 * online delivery gets the buyer's name and number so they can call and ask
 * what went wrong.
 *
 * The route is deliberately /dashboard/enquiry — the WhatsApp alert for this
 * event links straight here (see the enquiry_notification template in
 * functions/src/wa/templateResolver.ts), so the path is part of that contract
 * and must not move without updating the template.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Phone,
  RefreshCw,
  ShoppingCart,
  MessageCircle,
} from "lucide-react";
import { PageHeader } from "../_components/page-header";
import { useEffectiveUser } from "../_context/effective-user-context";
import {
  fetchSellerEnquiries,
  setEnquiryStatus,
  type EnquiryDoc,
  type EnquiryStatus,
} from "../_lib/enquiries-firestore";

type Tab = "open" | "contacted" | "closed" | "all";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "2 hours ago" reads better than a timestamp for something you're meant to
 *  act on quickly — how fresh the lead is IS the useful information. */
function ago(d: Date | null): string {
  if (!d) return "—";
  const mins = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Digits only, +91-prefixed — what tel: and wa.me both want. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

const STATUS_BADGE: Record<EnquiryStatus, { label: string; cls: string }> = {
  open: { label: "New", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  contacted: { label: "Contacted", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  closed: { label: "Closed", cls: "bg-surface-container text-on-surface-variant border-outline-variant/40" },
};

function EnquiryCard({
  enquiry,
  onStatus,
  busy,
}: {
  enquiry: EnquiryDoc;
  onStatus: (id: string, status: EnquiryStatus) => void;
  busy: boolean;
}) {
  const badge = STATUS_BADGE[enquiry.status];
  const who = enquiry.buyerName || "Customer";
  const tel = dialable(enquiry.buyerPhone);
  const waText = encodeURIComponent(
    `Namaste ${who}, you were ordering ${enquiry.itemSummary} from us but the payment didn't go through. Can I help you complete it?`,
  );

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-on-surface">{who}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${badge.cls}`}>
              {badge.label}
            </span>
            {enquiry.reason === "failed" && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-red-700">
                Payment failed
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-on-surface-variant">{enquiry.buyerPhone}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-on-surface">{inr(enquiry.value)}</p>
          <p className="text-[11px] text-on-surface-variant">{ago(enquiry.createdAt)}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
        {enquiry.items.map((item) => (
          <div key={`${item.productId}-${item.name}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-on-surface">
              {item.name}
              <span className="ml-1.5 font-normal text-on-surface-variant">× {item.qty}</span>
            </span>
            <span className="shrink-0 text-on-surface-variant">{inr(item.lineTotal || item.unitPrice * item.qty)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`tel:+${tel}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white transition-colors hover:opacity-90"
        >
          <Phone className="h-3.5 w-3.5" /> Call {who.split(" ")[0]}
        </a>
        <a
          href={`https://wa.me/${tel}?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3.5 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container"
        >
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        {enquiry.status !== "contacted" && enquiry.status !== "closed" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(enquiry.id, "contacted")}
            className="rounded-xl border border-outline-variant/40 px-3.5 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            Mark contacted
          </button>
        )}
        {enquiry.status !== "closed" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(enquiry.id, "closed")}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

export default function EnquiryPage() {
  const { uid: effectiveUid, profile } = useEffectiveUser();
  const [enquiries, setEnquiries] = useState<EnquiryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!effectiveUid && !profile?.phone) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEnquiries(await fetchSellerEnquiries(effectiveUid ?? "", profile?.phone));
    } catch (e) {
      console.error("[enquiry] load failed:", e);
      setError("Could not load enquiries. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [effectiveUid, profile?.phone]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatus = async (id: string, status: EnquiryStatus) => {
    setBusyId(id);
    // Optimistic: the row moves to its new tab immediately, and is put back
    // if the write is rejected.
    const previous = enquiries;
    setEnquiries((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await setEnquiryStatus(id, status);
    } catch (e) {
      console.error("[enquiry] status update failed:", e);
      setEnquiries(previous);
      setError("Could not update that enquiry. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const counts = {
    open: enquiries.filter((e) => e.status === "open").length,
    contacted: enquiries.filter((e) => e.status === "contacted").length,
    closed: enquiries.filter((e) => e.status === "closed").length,
    all: enquiries.length,
  };
  const visible = tab === "all" ? enquiries : enquiries.filter((e) => e.status === tab);

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Customers who started an order for your products but didn't complete payment. Call them to find out what went wrong — the sale may still be there."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["open", "contacted", "closed", "all"] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition-colors ${
                tab === key
                  ? "bg-primary text-white"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {key === "open" ? "New" : key} ({counts[key]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : enquiries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-14 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-on-surface-variant/40" />
          <p className="mt-3 text-base font-bold text-on-surface">No enquiries yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">
            When a customer starts ordering one of your products online and doesn&apos;t finish
            paying, they&apos;ll show up here with their number so you can follow up.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-on-surface-variant/40" />
          <p className="mt-2 text-sm font-semibold text-on-surface">
            Nothing in {tab === "open" ? "new" : tab}.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((enquiry) => (
            <EnquiryCard
              key={enquiry.id}
              enquiry={enquiry}
              busy={busyId === enquiry.id}
              onStatus={(id, status) => void handleStatus(id, status)}
            />
          ))}
        </div>
      )}
    </>
  );
}
