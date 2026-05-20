import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckSquare, Loader2, PackagePlus, Search, Square, Trash2, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import {
  bulkAssignProductsToRetailer,
  removeProductAssignment,
} from "../../_lib/product-assignment-firestore";
import { canAssignSeat, getAvailableSeats } from "../../_lib/subscriptions-firestore";
import { db, fetchAllMarketplaceProducts } from "../../../firebase";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import type { RetailerSeatListing, Subscription } from "../../_types/subscriptions";
import type { MarketplaceProduct } from "../../../../types/product";

type AssignProductModalProps = {
  manufacturerId: string;
  manufacturerName: string;
  retailer: ManufacturerRetailerRow;
  products: MarketplaceProduct[]; // This is still used for "Your Products"
  subs: Subscription[];
  seatListings: RetailerSeatListing[];
  onAssigned: () => Promise<void>;
  onClose: () => void;
};

export function AssignProductModal({
  manufacturerId,
  manufacturerName,
  retailer,
  products,
  subs,
  seatListings,
  onAssigned,
  onClose,
}: AssignProductModalProps) {
  // Active listings for this retailer keyed by manufacturerProductId
  const activeListingsForRetailer = seatListings.filter(
    (l) => l.retailerDocId === retailer.retailerDocId && l.status === "active",
  );
  const listingIdByMfrProductId = new Map(
    activeListingsForRetailer
      .filter((l): l is typeof l & { manufacturerProductId: string } => !!l.manufacturerProductId)
      .map((l) => [l.manufacturerProductId, l.id]),
  );
  const assignedMfrProductIds = new Set(listingIdByMfrProductId.keys());

  // Multi-select: set of newly-selected product IDs (excludes already-assigned)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [marketplaceProducts, setMarketplaceProducts] = useState<MarketplaceProduct[]>([]);
  const [loadingMarketplace, setLoadingMarketplace] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"own" | "marketplace">("own");

  useEffect(() => {
    if (activeTab === "marketplace" && marketplaceProducts.length === 0) {
      setLoadingMarketplace(true);
      fetchAllMarketplaceProducts()
        .then(setMarketplaceProducts)
        .catch(() => {})
        .finally(() => setLoadingMarketplace(false));
    }
  }, [activeTab, marketplaceProducts.length]);

  const hasSeats = canAssignSeat(subs, seatListings);
  const availableSeats = getAvailableSeats(subs, seatListings);

  const manufacturerProducts = products.filter(
    (p) => p.ownerId === manufacturerId && p.ownerType === "manufacturer",
  );

  const filteredMarketplace = marketplaceProducts.filter(p => 
    p.ownerId !== manufacturerId && 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayProducts = activeTab === "own" 
    ? manufacturerProducts.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredMarketplace;

  const toggleSelect = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      console.log("Starting bulk assignment...", {
        manufacturerId,
        retailerDocId: retailer.retailerDocId,
        retailerId: retailer.retailerId,
        productIds: Array.from(selected),
      });
      await bulkAssignProductsToRetailer({
        manufacturerId,
        retailerDocId: retailer.retailerDocId,
        retailerId: retailer.retailerId || undefined,
        productIds: Array.from(selected),
      });

      // Fire-and-forget: notify retailer by email about the new product assignment
      // retailerEmail in the stored doc may be empty or a placeholder — fetch fresh from users doc
      const firstSelectedId = Array.from(selected)[0];
      const allAvailable = [...manufacturerProducts, ...marketplaceProducts];
      const assignedProduct = allAvailable.find((p) => p.id === firstSelectedId);
      const productLabel = selected.size > 1
        ? `${assignedProduct?.name ?? "a product"} and ${selected.size - 1} more`
        : (assignedProduct?.name ?? "a new product");
      (async () => {
        let emailToUse = (retailer.retailerEmail ?? "").trim().toLowerCase();
        if (!emailToUse || emailToUse.includes("@krishidukan.local")) {
          const uid = retailer.retailerId;
          if (uid) {
            try {
              const snap = await getDoc(doc(db, "users", uid));
              if (snap.exists()) {
                const fresh = (snap.data()?.email ?? "").trim().toLowerCase();
                if (fresh && !fresh.includes("@krishidukan.local")) emailToUse = fresh;
              }
            } catch { /* ignore */ }
          }
        }
        if (!emailToUse) return;
        fetch("/api/email/product-assigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            retailerEmail: emailToUse,
            shopName: retailer.shopName || retailer.ownerName,
            productName: productLabel,
            manufacturerName,
            signupLink: process.env.NEXT_PUBLIC_BASE_URL ?? "/",
          }),
        }).catch(() => {});
      })();

      await onAssigned();
    } catch (e) {
      console.error("Assignment error details:", e);
      setError(e instanceof Error ? e.message : "Failed to assign products.");
      setSubmitting(false);
    }
  };

  const handleRemove = async (productId: string) => {
    const listingId = listingIdByMfrProductId.get(productId);
    if (!listingId) return;
    setRemoving(true);
    setError(null);
    try {
      await removeProductAssignment(listingId);
      await onAssigned();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove listing.");
      setRemoving(false);
      setConfirmRemoveId(null);
    }
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const newAssignCount = selected.size;

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
            className="rounded-xl p-1.5 text-on-surface-variant hover:bg-surface-container"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/20 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("own")}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === "own" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant"}`}
          >
            Your Products
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("marketplace")}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === "marketplace" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant"}`}
          >
            Marketplace
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-5 pt-4 shrink-0">
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2">
            <Search className="h-4 w-4 text-outline shrink-0" />
            <input
              type="text"
              placeholder={`Search ${activeTab === "own" ? "your" : "marketplace"} products…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
            />
          </div>
        </div>

        {/* Body */}
        {!hasSeats && assignedMfrProductIds.size === 0 ? (
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
        ) : loadingMarketplace ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="font-semibold text-on-surface">No products found</p>
            <p className="text-sm text-on-surface-variant">
              {activeTab === "own" 
                ? "Add products to your catalogue before assigning them."
                : "No products match your search in the marketplace."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden">
            {error ? (
              <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <p className="px-5 pt-4 pb-2 text-xs font-medium text-on-surface-variant">
              Select products to assign · 1 seat per product per month
              {newAssignCount > 0 ? (
                <span className="ml-1 font-semibold text-primary">
                  ({newAssignCount} selected)
                </span>
              ) : null}
            </p>

            <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant/20 px-2 pb-2">
              {displayProducts.map((product) => {
                const isAssigned = assignedMfrProductIds.has(product.id);
                const isSelected = selected.has(product.id);
                const isConfirmingRemove = confirmRemoveId === product.id;

                const thumb = product.image ? (
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
                );

                // Already-assigned row: shows remove action
                if (isAssigned) {
                  return (
                    <li key={product.id} className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {thumb}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-on-surface-variant">
                            {product.category}
                            {product.price ? ` · ₹${product.price}` : ""}
                          </p>
                        </div>

                        {isConfirmingRemove ? (
                          <div className="flex items-center gap-1 shrink-0 rounded-xl border border-red-200 bg-red-50 px-2 py-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                            <span className="text-xs font-medium text-red-700">Free seat?</span>
                            <button
                              type="button"
                              disabled={removing}
                              onClick={() => handleRemove(product.id)}
                              className="rounded-lg bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-1"
                            >
                              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              {removing ? "Removing…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={removing}
                              onClick={() => setConfirmRemoveId(null)}
                              className="rounded-lg px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                              Assigned
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(product.id)}
                              disabled={submitting || removing}
                              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-xs font-medium text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                }

                // Unassigned row: multi-select checkbox
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      disabled={submitting || (!hasSeats && !isSelected)}
                      onClick={() => toggleSelect(product.id)}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary/30"
                          : !hasSeats
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-surface-container",
                      ].join(" ")}
                    >
                      {thumb}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {product.category}
                          {product.price ? ` · ₹${product.price}` : ""}
                          {activeTab === "marketplace" && product.store && ` · from ${product.store}`}
                        </p>
                      </div>
                      <span
                        className={[
                          "shrink-0 h-4 w-4 rounded flex items-center justify-center border-2 transition-colors",
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-outline-variant/40",
                        ].join(" ")}
                      >
                        {isSelected ? <Check className="h-3 w-3 text-white" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/20 px-5 py-4 shrink-0">
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
                disabled={newAssignCount === 0 || submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning…
                  </>
                ) : (
                  <>
                    <PackagePlus className="h-4 w-4" />
                    Assign {newAssignCount > 0 ? `${newAssignCount} product${newAssignCount > 1 ? "s" : ""}` : "Products"}
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
