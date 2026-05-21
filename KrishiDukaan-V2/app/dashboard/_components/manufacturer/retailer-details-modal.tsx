"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Package, PackagePlus, ToggleLeft, ToggleRight, MapPin } from "lucide-react";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import {
  fetchRetailerAssignedProducts,
  type AssignedProductRow,
} from "../../_lib/manufacturer-retailers-firestore";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../../firebase";

function StatusBadge({ status }: { status: AssignedProductRow["status"] }) {
  if (status === "active")
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Active</span>;
  if (status === "released")
    return <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">Released</span>;
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">Expired</span>;
}

export function RetailerDetailsModal({ row, manufacturerId, onClose, onAssignProduct }: {
  row: ManufacturerRetailerRow;
  manufacturerId: string;
  onClose: () => void;
  onAssignProduct: () => void;
}) {
  const [products, setProducts]   = useState<AssignedProductRow[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState<string | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRetailerAssignedProducts(manufacturerId, row.retailerDocId);
      setProducts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProducts(); }, []);

  const handleToggleProduct = async (p: AssignedProductRow) => {
    setToggling(p.listingId);
    try {
      const newStatus = p.status === "active" ? "released" : "active";
      await updateDoc(doc(db, "retailerSeatListings", p.listingId), { status: newStatus });
      await updateDoc(doc(db, "products", p.productId), { isActive: newStatus === "active" });
      await loadProducts();
    } catch { /* ignore */ }
    finally { setToggling(null); }
  };

  const activeCount   = products.filter((p) => p.status === "active").length;
  const releasedCount = products.filter((p) => p.status !== "active").length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-on-surface">{row.shopName || "Retailer"}</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {row.ownerName} · {row.retailerPhone}
              {row.retailerEmail ? ` · ${row.retailerEmail}` : ""}
            </p>
            {(row.address?.city || row.address?.line1) && (
              <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {[row.address.line1, row.address.city, row.address.state, row.address.pincode]
                  .filter(Boolean).join(", ")}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {activeCount} active product{activeCount !== 1 ? "s" : ""}
              </span>
              {releasedCount > 0 && (
                <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
                  {releasedCount} inactive
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Assign product button */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Assigned products
            </h3>
            <button type="button" onClick={onAssignProduct}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-95 transition-all">
              <PackagePlus className="h-3.5 w-3.5" /> Assign product
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/40 py-14 text-center">
              <Package className="h-10 w-10 text-on-surface-variant/30 mb-3" />
              <p className="text-sm font-semibold text-on-surface">No products assigned yet</p>
              <p className="text-xs text-on-surface-variant mt-1">
                Click &quot;Assign product&quot; to add products to this retailer&apos;s store.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Product</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Category</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Unit · Price</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Assigned</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Expires</th>
                      <th className="whitespace-nowrap px-4 py-3 font-medium">Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {products.map((p) => (
                      <tr key={p.listingId}
                        className={`transition-colors hover:bg-surface-container/50 ${p.status !== "active" ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.image ? (
                              <img src={p.image} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="h-9 w-9 rounded-lg bg-surface-container flex-shrink-0" />
                            )}
                            <span className="font-semibold text-on-surface max-w-[160px] truncate">{p.productName}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">{p.category}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                          {p.unit} · ₹{p.price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-on-surface-variant">
                          {p.assignedAt ? p.assignedAt.toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-on-surface-variant">
                          {p.expiresAt ? p.expiresAt.toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" disabled={toggling === p.listingId || p.status === "expired"}
                            onClick={() => handleToggleProduct(p)}
                            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-40 ${
                              p.status === "active"
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                            }`}
                          >
                            {toggling === p.listingId
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : p.status === "active"
                                ? <ToggleRight className="h-3.5 w-3.5" />
                                : <ToggleLeft className="h-3.5 w-3.5" />}
                            {p.status === "active" ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/30 px-5 py-4 flex justify-end">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-outline-variant/40 px-5 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
