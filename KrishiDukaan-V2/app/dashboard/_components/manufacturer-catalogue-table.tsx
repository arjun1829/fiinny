"use client";

import { useState } from "react";
import { Pencil, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import type { ManufacturerProductRow } from "../_types/inventory";
import { toggleProductActive } from "../_lib/manufacturer-products-firestore";
import { EditProductModal } from "./edit-product-modal";
import { cn } from "../_lib/cn";

type Props = {
  rows: ManufacturerProductRow[];
  onRefresh: () => void;
};

function sourceLabel(source: string): { label: string; cls: string } {
  if (source === "manufacturer_inventory")
    return { label: "Own Catalogue", cls: "bg-primary/10 text-primary" };
  return { label: source, cls: "bg-surface-container text-on-surface-variant" };
}

function ToggleBtn({ row, onDone }: { row: ManufacturerProductRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try { await toggleProductActive(row.productId, !row.isActive); onDone(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  };
  return (
    <button
      onClick={handle} disabled={busy} title={row.isActive ? "Deactivate" : "Activate"}
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-50",
        row.isActive
          ? "bg-primary/10 text-primary hover:bg-red-50 hover:text-red-600"
          : "bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary",
      )}
    >
      {busy
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : row.isActive
          ? <ToggleRight className="h-3.5 w-3.5" />
          : <ToggleLeft  className="h-3.5 w-3.5" />}
      {row.isActive ? "Active" : "Inactive"}
    </button>
  );
}

export function ManufacturerCatalogueTable({ rows, onRefresh }: Props) {
  const [editing, setEditing] = useState<ManufacturerProductRow | null>(null);

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 px-4 py-12 text-center text-sm text-on-surface-variant">
        No products in your catalogue yet. Add a product using the form below.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Product Name</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Category</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Unit</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Price (₹)</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Variants</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Stock</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Source</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Status</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Last Updated</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {rows.map((r) => {
                const { label, cls } = sourceLabel(r.source);
                const updatedLabel = r.updatedAt
                  ? r.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                  : "—";

                return (
                  <tr key={r.productId} className="hover:bg-surface-container/60 transition-colors">
                    {/* Name + image thumbnail */}
                    <td className="px-3 py-3 md:px-4">
                      <div className="flex items-center gap-2.5">
                        {r.image ? (
                          <img src={r.image} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border border-outline-variant/20"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-surface-container flex-shrink-0 flex items-center justify-center text-on-surface-variant/30 text-xs">
                            ?
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-on-surface leading-tight">{r.productName}</p>
                          {r.description && (
                            <p className="text-xs text-on-surface-variant mt-0.5 max-w-[180px] truncate">{r.description}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.category}</td>
                    <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.unit}</td>
                    <td className="px-3 py-3 tabular-nums text-on-surface md:px-4">₹{r.price.toFixed(2)}</td>

                    {/* Variants */}
                    <td className="px-3 py-3 md:px-4">
                      {r.variants.length > 1 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.variants.slice(0, 3).map((v, i) => (
                            <span key={i} className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                              {v.unit} · ₹{v.price}
                            </span>
                          ))}
                          {r.variants.length > 3 && (
                            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                              +{r.variants.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant text-xs">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 md:px-4 tabular-nums text-on-surface-variant">{r.stockQuantity > 0 ? r.stockQuantity : <span className="text-on-surface-variant/40">—</span>}</td>

                    <td className="px-3 py-3 md:px-4">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
                        {label}
                      </span>
                    </td>

                    {/* Status toggle */}
                    <td className="px-3 py-3 md:px-4">
                      <ToggleBtn row={r} onDone={onRefresh} />
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant md:px-4 text-xs">{updatedLabel}</td>

                    {/* Edit */}
                    <td className="px-3 py-3 md:px-4">
                      <button
                        onClick={() => setEditing(r)}
                        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditProductModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { onRefresh(); setEditing(null); }}
        />
      )}
    </>
  );
}
