"use client";

import { useState } from "react";
import { Check, CheckSquare, Loader2, PackagePlus, Square, X } from "lucide-react";
import { assignProductToRetailer } from "../../_lib/product-assignment-firestore";
import { canAssignSeat, getAvailableSeats } from "../../_lib/subscriptions-firestore";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import type { RetailerSeatListing, Subscription } from "../../_types/subscriptions";
import type { MarketplaceProduct } from "../../../../types/product";

type AssignProductModalProps = {
  manufacturerId: string;
  retailer: ManufacturerRetailerRow;
  products: MarketplaceProduct[];
  subs: Subscription[];
  seatListings: RetailerSeatListing[];
  onAssigned: () => Promise<void>;
  onClose: () => void;
};

export function AssignProductModal({
  manufacturerId,
  retailer,
  products,
  subs,
  seatListings,
  onAssigned,
  onClose,
}: AssignProductModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting,  setSubmitting]  = useState(false);
  const [progress,    setProgress]    = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasSeats = canAssignSeat(subs, seatListings);
  const availableSeats = getAvailableSeats(subs, seatListings);

  // Products already actively assigned to this retailer (pre-signup safe: keyed by retailerDocId)
  const assignedProductIds = new Set(
    seatListings
      .filter((l) => l.retailerDocId === retailer.retailerDocId && l.status === "active")
      .map((l) => l.productId),
  );

  const manufacturerProducts = products.filter(
    (p) => p.ownerId === manufacturerId && p.ownerType === "manufacturer",
  );

  // Assignable = not yet assigned
  const assignable = manufacturerProducts.filter((p) => !assignedProductIds.has(p.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === assignable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assignable.map((p) => p.id)));
    }
  };

  const exceedsSeats = selectedIds.size > availableSeats;

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    if (exceedsSeats) {
      setError(`Only ${availableSeats} seat${availableSeats !== 1 ? "s" : ""} available. Deselect ${selectedIds.size - availableSeats} product${selectedIds.size - availableSeats !== 1 ? "s" : ""}.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    const ids = Array.from(selectedIds);
    setProgress({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i++) {
        await assignProductToRetailer({
          manufacturerId,
          retailerDocId: retailer.retailerDocId,
          retailerId: retailer.retailerId || undefined,
          productId: ids[i]!,
        });
        setProgress({ done: i + 1, total: ids.length });
      }
      await onAssigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign product.");
      setSubmitting(false);
      setProgress(null);
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !submitting) onClose();
  };

  const allSelected = assignable.length > 0 && selectedIds.size === assignable.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center p-0 sm:p-4"
      onClick={handleBackdrop}
    >
      <div className="flex w-full max-w-lg flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl max-h-[88dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Assign Products</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              To {retailer.shopName || retailer.ownerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {!hasSeats ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="rounded-full bg-harvest/10 p-3">
              <PackagePlus className="h-6 w-6 text-harvest" />
            </div>
            <div>
              <p className="font-semibold text-on-surface">No seats available</p>
              <p className="mt-1 text-sm text-on-surface-variant max-w-xs mx-auto">
                You have used all your seats. Purchase more to assign additional products.
              </p>
            </div>
            <a
              href="/dashboard/upgrade"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              Buy seats
            </a>
          </div>
        ) : manufacturerProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="font-semibold text-on-surface">No products yet</p>
            <p className="text-sm text-on-surface-variant">
              Add products to your catalogue before assigning them to retailers.
            </p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden">
            {error ? (
              <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {/* Info row + select-all */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-xs font-medium text-on-surface-variant">
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected · ${selectedIds.size} seat${selectedIds.size !== 1 ? "s" : ""} will be consumed`
                  : `Select products to assign · 1 seat per product · ${availableSeats} seat${availableSeats !== 1 ? "s" : ""} available`}
              </p>
              {assignable.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  {allSelected
                    ? <CheckSquare className="h-3.5 w-3.5" />
                    : someSelected
                      ? <CheckSquare className="h-3.5 w-3.5 opacity-50" />
                      : <Square className="h-3.5 w-3.5" />}
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {/* Seat warning */}
            {exceedsSeats && (
              <div className="mx-5 mb-2 rounded-xl border border-harvest/30 bg-harvest/10 px-3 py-2 text-xs font-medium text-harvest">
                Only {availableSeats} seat{availableSeats !== 1 ? "s" : ""} available — deselect {selectedIds.size - availableSeats} product{selectedIds.size - availableSeats !== 1 ? "s" : ""} to continue.
              </div>
            )}

            <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant/20 px-2 pb-2">
              {manufacturerProducts.map((product) => {
                const alreadyAssigned = assignedProductIds.has(product.id);
                const selected = selectedIds.has(product.id);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      disabled={alreadyAssigned || submitting}
                      onClick={() => !alreadyAssigned && toggle(product.id)}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                        alreadyAssigned
                          ? "opacity-40 cursor-not-allowed"
                          : selected
                            ? "bg-primary/10 ring-1 ring-primary/30"
                            : "hover:bg-surface-container",
                      ].join(" ")}
                    >
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-10 w-10 rounded-lg object-cover shrink-0 bg-surface-container-low"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-surface-container-low shrink-0 flex items-center justify-center text-on-surface-variant">
                          <PackagePlus className="h-5 w-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{product.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {product.category}
                          {product.price ? ` · ₹${product.price}` : ""}
                        </p>
                      </div>
                      {alreadyAssigned ? (
                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                          Assigned
                        </span>
                      ) : selected ? (
                        <span className="shrink-0 h-5 w-5 rounded-md bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      ) : (
                        <span className="shrink-0 h-5 w-5 rounded-md border-2 border-outline-variant/40" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={selectedIds.size === 0 || submitting || exceedsSeats}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {submitting && progress ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning {progress.done}/{progress.total}…
                  </>
                ) : (
                  <>
                    <PackagePlus className="h-4 w-4" />
                    {selectedIds.size > 0
                      ? `Assign ${selectedIds.size} Product${selectedIds.size !== 1 ? "s" : ""}`
                      : "Assign Products"}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
