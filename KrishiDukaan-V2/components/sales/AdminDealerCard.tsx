"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, MapPin, Store } from "lucide-react";
import type { Dealer } from "../../app/sales/dealers/dealers-service";
import DealerImagePreviewModal from "./DealerImagePreviewModal";

const TYPE_LABEL: Record<string, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  manufacturer: "Manufacturer",
};

/**
 * Read-only dealer card for the admin Sales Team → executive activity page.
 * Deliberately NOT the sales rep's DealerCard (components/sales/DealerCard.tsx)
 * — that one carries Call/Edit/Deactivate/Mark-as-Visited actions meant for the
 * rep who owns the record. This view is inspection-only: no action here writes
 * to Firestore or Storage.
 */
export default function AdminDealerCard({
  dealer,
  execId,
}: {
  dealer: Dealer;
  execId: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const hasImage = Boolean(dealer.imageUrl) && !imgFailed;
  const hasGeo = Boolean(dealer.geo);

  const handleMaps = () => {
    if (!dealer.geo) return;
    const { latitude, longitude } = dealer.geo;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank",
    );
  };

  return (
    <>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-outline/10 shadow-sm">
        <div className="flex items-start gap-3">
          {hasImage ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              aria-label={`View ${dealer.shopName} photo`}
              className="h-11 w-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-outline/10 transition hover:ring-primary/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dealer.imageUrl}
                alt={`${dealer.shopName} shop photo`}
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Store className="h-5 w-5 text-primary" />
            </div>
          )}

          <Link
            href={`/admin/sales-team/${execId}/dealers/${dealer.id}`}
            className="min-w-0 flex-1"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-bold text-on-surface hover:underline">
                {dealer.shopName}
              </p>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {TYPE_LABEL[dealer.type] ?? dealer.type}
              </span>
            </div>
            <p className="truncate text-xs text-on-surface-variant">{dealer.ownerName}</p>
          </Link>
        </div>

        <div className="mt-3 space-y-1.5">
          {dealer.phone ? (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Phone className="h-3.5 w-3.5 shrink-0 text-outline" />
              <span>{dealer.phone}</span>
            </div>
          ) : null}
          {dealer.address ? (
            <div className="flex items-start gap-2 text-xs text-on-surface-variant">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-outline" />
              <span className="line-clamp-2">{dealer.address}</span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleMaps}
          disabled={!hasGeo}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 py-2 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MapPin className="h-3.5 w-3.5" />
          {hasGeo ? "View on Maps" : "No location saved"}
        </button>
      </div>

      {previewOpen && dealer.imageUrl && (
        <DealerImagePreviewModal
          imageUrl={dealer.imageUrl}
          dealerName={dealer.shopName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
