"use client";

/**
 * Admin Sales Team → View Activity → Dealers Added → Dealer Details
 * (read-only, admin-only).
 *
 * Reuses the EXISTING dealer data (fetchDealerById, dealers-service.ts) and
 * notes data (fetchNotesForDealer, dealer-note-service.ts) — nothing new is
 * tracked or stored. No create/edit/delete/upload affordance anywhere on this
 * page, same constraint already applied to AdminDealerCard.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Phone, MapPin, Store, StickyNote } from "lucide-react";
import { fetchDealerById, type Dealer } from "../../../../../sales/dealers/dealers-service";
import { fetchNotesForDealer, type DealerNote } from "../../../../../sales/dealers/dealer-note-service";
import DealerImagePreviewModal from "../../../../../../components/sales/DealerImagePreviewModal";

const TYPE_LABEL: Record<string, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  manufacturer: "Manufacturer",
};

const INTEREST_LABEL: Record<string, string> = {
  low: "Low Interest",
  considering: "Considering",
  veryInterested: "Very Interested",
};

type PageState = "loading" | "ready" | "not-found" | "error";
type NotesState = "loading" | "ready" | "error";

function fmtNoteTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== "function") return "";
  const d = (ts as any).toDate();
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString(
    "en-IN",
    { hour: "2-digit", minute: "2-digit", hour12: true },
  )}`;
}

export default function AdminDealerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const execId = String(params.execId ?? "");
  const dealerId = String(params.dealerId ?? "");

  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadError, setLoadError] = useState("");

  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [notesState, setNotesState] = useState<NotesState>("loading");

  const [imgFailed, setImgFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPageState("loading");
      setLoadError("");
      try {
        const d = await fetchDealerById(dealerId);
        if (cancelled) return;
        if (!d) {
          setPageState("not-found");
          return;
        }
        setDealer(d);
        setPageState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load dealer.");
        setPageState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNotesState("loading");
      try {
        const n = await fetchNotesForDealer(dealerId);
        if (cancelled) return;
        setNotes(n);
        setNotesState("ready");
      } catch {
        if (cancelled) return;
        setNotesState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealerId]);

  const hasImage = Boolean(dealer?.imageUrl) && !imgFailed;
  const hasGeo = Boolean(dealer?.geo);

  const handleMaps = () => {
    if (!dealer?.geo) return;
    const { latitude, longitude } = dealer.geo;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank",
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href={`/admin/sales-team/${execId}`}
          aria-label="Back to View Activity"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Store className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface truncate">
              {pageState === "ready" && dealer ? dealer.shopName : "Dealer Details"}
            </h1>
          </div>
        </div>
      </div>

      {/* Read-only notice — same copy/style as the exec activity page */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          <span className="font-bold">Read-only view.</span> You are viewing this dealer&apos;s
          details as an admin. No changes are made to this record here.
        </p>
      </div>

      {pageState === "loading" && (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {pageState === "not-found" && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
          <Store className="mx-auto mb-2 h-6 w-6 text-outline" />
          <p className="text-sm font-semibold text-on-surface">Dealer not found</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            This dealer may have been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/admin/sales-team/${execId}`)}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition active:scale-95"
          >
            Back to View Activity
          </button>
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
        </div>
      )}

      {pageState === "ready" && dealer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Image */}
            {hasImage && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="block w-full overflow-hidden rounded-2xl ring-1 ring-outline/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dealer.imageUrl}
                  alt={`${dealer.shopName} shop photo`}
                  onError={() => setImgFailed(true)}
                  className="w-full max-h-96 object-contain bg-surface-container"
                />
              </button>
            )}

            {/* Contact */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Contact
              </p>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest divide-y divide-outline-variant/20">
                <InfoRow icon={<Phone className="h-4 w-4 text-outline" />} label="Phone" value={dealer.phone || "—"} />
                <InfoRow icon={<MapPin className="h-4 w-4 text-outline" />} label="Address" value={dealer.address || "—"} />
                <InfoRow icon={<Store className="h-4 w-4 text-outline" />} label="Owner" value={dealer.ownerName || "—"} />
              </div>
            </section>

            {/* Notes */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Notes {notes.length > 0 && `(${notes.length})`}
              </p>
              {notesState === "loading" && (
                <div className="flex h-24 items-center justify-center">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {notesState === "error" && (
                <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-red-600">Could not load notes.</p>
                </div>
              )}
              {notesState === "ready" && notes.length === 0 && (
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-8 text-center">
                  <StickyNote className="mx-auto mb-2 h-5 w-5 text-outline" />
                  <p className="text-sm font-semibold text-on-surface">No notes yet</p>
                </div>
              )}
              {notesState === "ready" && notes.length > 0 && (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-2xl border border-outline-variant/30 bg-white px-4 py-3"
                    >
                      <p className="text-sm text-on-surface whitespace-pre-wrap">{n.note}</p>
                      <p className="mt-2 text-[11px] text-outline">{fmtNoteTime(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            {/* Type + Interest */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Dealer Type
              </p>
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                {TYPE_LABEL[dealer.type] ?? dealer.type}
              </span>
            </section>

            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Dealer Interest
              </p>
              {dealer.interest ? (
                <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {INTEREST_LABEL[dealer.interest] ?? dealer.interest}
                </span>
              ) : (
                <span className="inline-block rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-outline">
                  Not set
                </span>
              )}
            </section>

            {/* Location */}
            <section>
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                Location
              </p>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                {hasGeo ? (
                  <>
                    <p className="text-xs text-on-surface-variant mb-3">
                      {dealer.geo!.latitude.toFixed(5)}, {dealer.geo!.longitude.toFixed(5)}
                    </p>
                    <button
                      type="button"
                      onClick={handleMaps}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 py-2 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      View on Maps
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-outline">No location saved</p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {previewOpen && dealer?.imageUrl && (
        <DealerImagePreviewModal
          imageUrl={dealer.imageUrl}
          dealerName={dealer.shopName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-on-surface break-words">{value}</p>
      </div>
    </div>
  );
}
