"use client";

import { useState, useMemo } from "react";
import {
  CheckSquare, Loader2, PackagePlus, Search, Square, Store, X, AlertTriangle,
} from "lucide-react";
import { bulkAssignProductsToRetailer } from "../../_lib/product-assignment-firestore";
import { getAvailableSeats } from "../../_lib/subscriptions-firestore";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import type { RetailerSeatListing, Subscription } from "../../_types/subscriptions";
import type { MarketplaceProduct } from "../../../../types/product";

type Props = {
  manufacturerId: string;
  selectedRetailers: ManufacturerRetailerRow[];
  products: MarketplaceProduct[];
  subs: Subscription[];
  seatListings: RetailerSeatListing[];
  onAssigned: () => Promise<void>;
  onClose: () => void;
};

type AssignStatus = "idle" | "running" | "done";
type PerRetailerResult = {
  retailer: ManufacturerRetailerRow;
  assigned: string[];
  skipped: string[];
  error: string | null;
};

export function BulkAssignRetailersModal({
  manufacturerId,
  selectedRetailers,
  products,
  subs,
  seatListings,
  onAssigned,
  onClose,
}: Props) {
  const ownProducts = useMemo(
    () => products.filter((p) => p.ownerId === manufacturerId && p.ownerType === "manufacturer"),
    [products, manufacturerId],
  );

  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [search, setSearch]                         = useState("");
  const [status, setStatus]                         = useState<AssignStatus>("idle");
  const [results, setResults]                       = useState<PerRetailerResult[]>([]);
  const [globalError, setGlobalError]               = useState<string | null>(null);

  const filtered = useMemo(
    () => ownProducts.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [ownProducts, search],
  );

  const availableSeats = getAvailableSeats(subs, seatListings);
  const neededSeats    = selectedProductIds.size * selectedRetailers.length;
  const tooFewSeats    = neededSeats > availableSeats;

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedProductIds.size === filtered.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleAssign = async () => {
    if (selectedProductIds.size === 0 || selectedRetailers.length === 0) return;
    setStatus("running");
    setGlobalError(null);
    const productIds = Array.from(selectedProductIds);
    const perResult: PerRetailerResult[] = [];

    for (const retailer of selectedRetailers) {
      try {
        const result = await bulkAssignProductsToRetailer({
          manufacturerId,
          retailerDocId: retailer.retailerDocId,
          retailerId: retailer.retailerId || undefined,
          productIds,
        });
        perResult.push({ retailer, ...result, error: null });
      } catch (err) {
        perResult.push({
          retailer,
          assigned: [],
          skipped: [],
          error: err instanceof Error ? err.message : "Assignment failed.",
        });
      }
    }

    setResults(perResult);
    setStatus("done");
    await onAssigned();
  };

  const totalAssigned = results.reduce((s, r) => s + r.assigned.length, 0);
  const totalSkipped  = results.reduce((s, r) => s + r.skipped.length, 0);
  const totalErrors   = results.filter((r) => r.error).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-4 border-b border-outline-variant/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <PackagePlus className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-on-surface">Assign Products</h2>
              <p className="text-xs text-on-surface-variant">
                to {selectedRetailers.length} retailer{selectedRetailers.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-surface-container">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selected retailers summary */}
        <div className="px-5 py-3 bg-primary/5 border-b border-primary/10 shrink-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">Assigning to</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedRetailers.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-white border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-on-surface">
                <Store className="h-3 w-3 text-primary" /> {r.shopName || r.ownerName || "—"}
              </span>
            ))}
          </div>
        </div>

        {status === "done" ? (
          /* Results screen */
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="text-green-700 font-semibold">✓ {totalAssigned} assigned</span>
              {totalSkipped > 0 && <span className="text-amber-700 font-semibold">↷ {totalSkipped} skipped</span>}
              {totalErrors  > 0 && <span className="text-red-700   font-semibold">✗ {totalErrors} failed</span>}
            </div>
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.retailer.id}
                  className={`rounded-xl border px-3 py-2 text-xs ${r.error ? "border-red-200 bg-red-50" : "border-outline-variant/30 bg-surface-container-lowest"}`}>
                  <p className="font-semibold text-on-surface mb-0.5">{r.retailer.shopName || r.retailer.ownerName}</p>
                  {r.error
                    ? <p className="text-red-600">{r.error}</p>
                    : <p className="text-on-surface-variant">{r.assigned.length} assigned · {r.skipped.length} already had</p>
                  }
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Product selection screen */
          <>
            {/* Seat info + search */}
            <div className="px-5 pt-4 pb-2 shrink-0 space-y-3">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>{availableSeats} seat{availableSeats !== 1 ? "s" : ""} available</span>
                {selectedProductIds.size > 0 && (
                  <span className={`font-semibold ${tooFewSeats ? "text-red-600" : "text-primary"}`}>
                    {neededSeats} needed for this selection
                    {tooFewSeats && " — not enough seats"}
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low pl-8 pr-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2"
                />
              </div>
              {filtered.length > 0 && (
                <button type="button" onClick={toggleAll}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  {selectedProductIds.size === filtered.length
                    ? <CheckSquare className="h-3.5 w-3.5" />
                    : <Square className="h-3.5 w-3.5" />
                  }
                  {selectedProductIds.size === filtered.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-1.5">
              {filtered.length === 0 && (
                <p className="text-sm text-on-surface-variant text-center py-8">No products found.</p>
              )}
              {filtered.map((p) => {
                const checked = selectedProductIds.has(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-outline-variant/30 bg-surface-container-lowest hover:border-primary/20 hover:bg-surface-container-low"
                    }`}>
                    {checked
                      ? <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                      : <Square     className="h-4 w-4 text-on-surface-variant shrink-0" />
                    }
                    {p.image && (
                      <img src={p.image} alt={p.name} className="h-8 w-8 rounded-lg object-cover shrink-0 border border-outline-variant/20" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-on-surface truncate">{p.name}</p>
                      <p className="text-[10px] text-on-surface-variant">{p.category} · ₹{p.price}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Error */}
            {globalError && (
              <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {globalError}
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-4 border-t border-outline-variant/20 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-on-surface-variant">
                {selectedProductIds.size} product{selectedProductIds.size !== 1 ? "s" : ""} selected
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-outline-variant/40 px-4 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container">
                  Cancel
                </button>
                <button type="button" onClick={handleAssign}
                  disabled={selectedProductIds.size === 0 || status === "running" || tooFewSeats}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50">
                  {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {status === "running" ? "Assigning…" : "Assign to All"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Done footer */}
        {status === "done" && (
          <div className="px-5 py-4 border-t border-outline-variant/20 shrink-0">
            <button type="button" onClick={onClose}
              className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-white hover:opacity-95">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
