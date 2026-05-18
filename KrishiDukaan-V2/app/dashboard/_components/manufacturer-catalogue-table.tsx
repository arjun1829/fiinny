"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Power, PowerOff, Trash2 } from "lucide-react";
import type { ManufacturerProductRow } from "../_types/inventory";
import { cn } from "../_lib/cn";

type ManufacturerCatalogueTableProps = {
  rows: ManufacturerProductRow[];
  onToggleActive?: (productId: string, isActive: boolean) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
};

function RowActions({
  row,
  onToggleActive,
  onDelete,
}: {
  row: ManufacturerProductRow;
  onToggleActive?: (productId: string, isActive: boolean) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
}) {
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (!onToggleActive) return;
    setToggling(true);
    setError(null);
    try {
      await onToggleActive(row.productId, row.isActive);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(row.productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {error ? (
        <p className="text-[10px] text-red-600">{error}</p>
      ) : null}
      <div className="flex items-center gap-1.5 flex-wrap">
        {onToggleActive ? (
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling || deleting}
            title={row.isActive ? "Deactivate (frees seat)" : "Activate (consumes seat)"}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              row.isActive
                ? "border-harvest/40 text-harvest hover:bg-harvest/10"
                : "border-primary/40 text-primary hover:bg-primary/10",
            )}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : row.isActive ? (
              <PowerOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            {row.isActive ? "Deactivate" : "Activate"}
          </button>
        ) : null}

        {onDelete ? (
          confirmDelete ? (
            <div className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
              <span className="text-xs font-medium text-red-700">Delete?</span>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-1"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="text-xs font-medium text-red-600 px-1 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={toggling || deleting}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2 py-1 text-xs font-medium text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

export function ManufacturerCatalogueTable({
  rows,
  onToggleActive,
  onDelete,
}: ManufacturerCatalogueTableProps) {
  const hasActions = !!(onToggleActive || onDelete);

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/50 px-4 py-12 text-center text-sm text-on-surface-variant">
        No products in your catalogue yet. Add a product using the form below.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Product Name</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Category</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Unit</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Price (₹)</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Listing</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Last Updated</th>
              {hasActions ? (
                <th className="whitespace-nowrap px-3 py-3 font-medium md:px-4">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {rows.map((r) => {
              const updatedLabel = r.updatedAt
                ? r.updatedAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—";

              return (
                <tr
                  key={r.productId}
                  className={cn(
                    "hover:bg-surface-container/60",
                    !r.isActive && "opacity-60",
                  )}
                >
                  <td className="px-3 py-3 font-medium text-on-surface md:px-4">
                    {r.productName}
                  </td>
                  <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.category}</td>
                  <td className="px-3 py-3 text-on-surface-variant md:px-4">{r.unit}</td>
                  <td className="px-3 py-3 tabular-nums text-on-surface md:px-4">
                    ₹{r.price.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 md:px-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        r.isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container text-on-surface-variant",
                      )}
                    >
                      {r.isActive ? "Active · 1 seat" : "Inactive · 0 seats"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-on-surface-variant md:px-4">
                    {updatedLabel}
                  </td>
                  {hasActions ? (
                    <td className="px-3 py-3 md:px-4">
                      <RowActions
                        row={r}
                        onToggleActive={onToggleActive}
                        onDelete={onDelete}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
