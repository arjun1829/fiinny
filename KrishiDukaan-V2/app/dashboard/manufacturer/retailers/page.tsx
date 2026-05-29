"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PackagePlus, PowerOff, Trash2, UserPlus, X } from "lucide-react";
import { auth, getUserProfile, fetchManufacturerProducts } from "../../../firebase";
import { PageHeader } from "../../_components/page-header";
import { HelperIcon, HelperTooltip } from "../../../../components/helpers";
import { RetailerTable } from "../../_components/manufacturer/retailer-table";
import { AddRetailerModal } from "../../_components/manufacturer/add-retailer-form";
import { AssignProductModal } from "../../_components/manufacturer/assign-product-modal";
import { BulkAssignRetailersModal } from "../../_components/manufacturer/bulk-assign-retailers-modal";
import { EditRetailerModal } from "../../_components/manufacturer/edit-retailer-modal";
import { RetailerDetailsModal } from "../../_components/manufacturer/retailer-details-modal";
import { InviteCard } from "../../_components/manufacturer/invite-card";
import { BulkRetailerUpload } from "../../_components/manufacturer/bulk-retailer-upload";
import {
  fetchManufacturerRetailers,
  removeNetworkRetailer,
  deactivateNetworkRetailer,
  reactivateNetworkRetailer,
  bulkDeactivateNetworkRetailers,
  bulkRemoveNetworkRetailers,
} from "../../_lib/manufacturer-retailers-firestore";
import {
  fetchSubscriptions,
  fetchSeatListingsForOwner,
  getAvailableSeats,
  getTotalPurchasedSeats,
} from "../../_lib/subscriptions-firestore";
import type { ManufacturerRetailerRow } from "../../_types/manufacturer-retailers";
import type { RetailerSeatListing, Subscription } from "../../_types/subscriptions";
import type { MarketplaceProduct } from "../../../../types/product";
import { useI18n } from "../../../i18n/I18nContext";

type BulkConfirmAction = "deactivate" | "remove" | null;

type AccessState = "checking" | "allowed" | "denied";

type ToastPayload = {
  inviteCode: string;
  shopName: string;
  retailerEmail: string;
  retailerPhone: string;
  retailerDocId: string;
};

export default function ManufacturerRetailersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("checking");
  const [manufacturerId, setManufacturerId] = useState<string | null>(null);
  const [manufacturerName, setManufacturerName] = useState<string>("");

  const [rows, setRows] = useState<ManufacturerRetailerRow[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [seatListings, setSeatListings] = useState<RetailerSeatListing[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);

  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [addModalOpen,   setAddModalOpen]   = useState(false);
  const [assignTarget,   setAssignTarget]   = useState<ManufacturerRetailerRow | null>(null);
  const [editTarget,     setEditTarget]     = useState<ManufacturerRetailerRow | null>(null);
  const [detailsTarget,  setDetailsTarget]  = useState<ManufacturerRetailerRow | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  // Bulk selection
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());
  const [bulkConfirm,       setBulkConfirm]       = useState<BulkConfirmAction>(null);
  const [bulkActioning,     setBulkActioning]     = useState(false);
  const [bulkAssignOpen,    setBulkAssignOpen]    = useState(false);

  const loadAll = useCallback(async (uid: string) => {
    setListLoading(true);
    setListError(null);
    try {
      const [data, subsData, listingsData, productsData] = await Promise.all([
        fetchManufacturerRetailers(uid),
        fetchSubscriptions(uid),
        fetchSeatListingsForOwner(uid),
        fetchManufacturerProducts(uid),
      ]);
      setRows(data);
      setSubs(subsData);
      setSeatListings(listingsData);
      setProducts(productsData);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load retailers.");
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAccess("denied");
        router.replace("/");
        return;
      }
      try {
        const profile = await getUserProfile(user.uid);
        if (profile?.role === "manufacturer") {
          setManufacturerId(user.uid);
          setManufacturerName((profile as any).name || (profile as any).shopName || "");
          setAccess("allowed");
          await loadAll(user.uid);
        } else {
          setAccess("denied");
          router.replace("/dashboard");
        }
      } catch {
        setAccess("denied");
        router.replace("/dashboard");
      }
    });
    return () => unsub();
  }, [router, loadAll]);

  const totalPurchased = getTotalPurchasedSeats(subs);
  const seatsRemaining =
    totalPurchased > 0 ? getAvailableSeats(subs, seatListings) : -1;

  const handleRetailerAdded = async (payload: ToastPayload) => {
    if (manufacturerId) await loadAll(manufacturerId);
    setAddModalOpen(false);
    setToast(payload);
    // Auto-open product assignment for the new retailer so the manufacturer
    // can assign their first product immediately (retailer stays "pending" until then).
    setRows((current) => {
      const newRow = current.find((r) => r.retailerDocId === payload.retailerDocId);
      if (newRow) setAssignTarget(newRow);
      return current;
    });
  };

  const handleRemove = async (row: ManufacturerRetailerRow) => {
    if (!manufacturerId) return;
    await removeNetworkRetailer(row.id, row.retailerDocId, manufacturerId);
    await loadAll(manufacturerId);
  };

  const handleDeactivate = async (row: ManufacturerRetailerRow) => {
    if (!manufacturerId) return;
    await deactivateNetworkRetailer(row.id, row.retailerDocId, manufacturerId);
    await loadAll(manufacturerId);
  };

  /**
   * Opens the assign-product modal for a deactivated retailer so the
   * manufacturer can assign at least one product to re-activate them.
   */
  const handleActivate = (row: ManufacturerRetailerRow) => {
    setAssignTarget(row);
  };

  const handleAssigned = async () => {
    if (!manufacturerId) return;
    // If the assign target was manually deactivated, reset it back to active
    // so the row reflects the new seat listing immediately.
    if (assignTarget?.onboardingStatus === "inactive") {
      await reactivateNetworkRetailer(assignTarget.id);
    }
    await loadAll(manufacturerId);
    setAssignTarget(null);
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));

  const handleBulkDeactivate = async () => {
    if (!manufacturerId || selectedRows.length === 0) return;
    setBulkActioning(true);
    try {
      await bulkDeactivateNetworkRetailers(
        selectedRows.map((r) => ({ inviteDocId: r.id, retailerDocId: r.retailerDocId })),
        manufacturerId,
      );
      setSelectedIds(new Set());
      await loadAll(manufacturerId);
    } finally {
      setBulkActioning(false);
      setBulkConfirm(null);
    }
  };

  const handleBulkRemove = async () => {
    if (selectedRows.length === 0 || !manufacturerId) return;
    setBulkActioning(true);
    try {
      await bulkRemoveNetworkRetailers(
        selectedRows.map((r) => ({ inviteDocId: r.id, retailerDocId: r.retailerDocId })),
        manufacturerId,
      );
      setSelectedIds(new Set());
      if (manufacturerId) await loadAll(manufacturerId);
    } finally {
      setBulkActioning(false);
      setBulkConfirm(null);
    }
  };

  if (access === "checking") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-on-surface-variant">{t('checkingAccessText')}</p>
      </div>
    );
  }

  if (access === "denied" || !manufacturerId) return null;

  return (
    <>
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t('retailerNetworkTitle')}
          description={t('retailerNetworkDesc')}
          helperKey="dashRetailerNetwork"
        />
        <div className="flex flex-col items-end gap-1 shrink-0">
          <HelperTooltip side="bottom" textKey="dashAddRetailer">
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 transition-all"
            >
              <UserPlus className="h-4 w-4" />
              {t('addRetailerBtn')}
            </button>
          </HelperTooltip>
          {totalPurchased > 0 ? (
            <p className="text-xs text-on-surface-variant inline-flex items-center gap-1">
              {Math.max(0, seatsRemaining)} {t('rnOfSeats')} {totalPurchased} {totalPurchased !== 1 ? t('rnSeatsWord') : t('rnSeatWord')} {t('rnSeatsRemaining')}
              <HelperIcon
                size="xs"
                variant="ghost"
                side="bottom"
                textKey="dashRetailerSeats"
                ariaLabel="Seats remaining help"
              />
            </p>
          ) : (
            <p className="text-xs text-harvest">{t('rnNoActiveSub')}</p>
          )}
        </div>
      </div>

      {listError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listError}
        </div>
      ) : null}

      {toast ? (
        <div className="mb-6">
          <InviteCard
            inviteCode={toast.inviteCode}
            shopName={toast.shopName}
            retailerEmail={toast.retailerEmail}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}

      {/* Bulk retailer upload */}
      <section className="mb-6" aria-label="Bulk add retailers">
        <BulkRetailerUpload
          manufacturerId={manufacturerId}
          manufacturerName={manufacturerName}
          seatsRemaining={seatsRemaining}
          existingPhones={
            new Set(
              rows
                .map((r) => r.retailerPhone)
                .filter((p): p is string => !!p),
            )
          }
          onDone={async () => { if (manufacturerId) await loadAll(manufacturerId); }}
        />
      </section>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-sm font-bold text-primary">
            {selectedIds.size} retailer{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            <button
              type="button"
              onClick={() => setBulkAssignOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
            >
              <PackagePlus className="h-3.5 w-3.5" /> Assign Products
            </button>
            <button
              type="button"
              onClick={() => setBulkConfirm("deactivate")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <PowerOff className="h-3.5 w-3.5" /> Deactivate
            </button>
            <button
              type="button"
              onClick={() => setBulkConfirm("remove")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto rounded-lg p-1 text-on-surface-variant hover:bg-primary/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section aria-label="Retailer list">
        <RetailerTable
          rows={rows}
          loading={listLoading}
          onRemove={handleRemove}
          onAssignProduct={(row) => setAssignTarget(row)}
          onEdit={(row) => setEditTarget(row)}
          onDetails={(row) => setDetailsTarget(row)}
          onDeactivate={handleDeactivate}
          onActivate={handleActivate}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      </section>

      {addModalOpen && manufacturerId ? (
        <AddRetailerModal
          manufacturerId={manufacturerId}
          manufacturerName={manufacturerName}
          seatsRemaining={seatsRemaining}
          onRetailerAdded={handleRetailerAdded}
          onClose={() => setAddModalOpen(false)}
        />
      ) : null}

      {assignTarget && manufacturerId ? (
        <AssignProductModal
          manufacturerId={manufacturerId}
          manufacturerName={manufacturerName}
          retailer={assignTarget}
          products={products}
          subs={subs}
          seatListings={seatListings}
          onAssigned={handleAssigned}
          onClose={() => setAssignTarget(null)}
        />
      ) : null}

      {editTarget && (
        <EditRetailerModal
          row={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { if (manufacturerId) await loadAll(manufacturerId); }}
        />
      )}

      {detailsTarget && manufacturerId && (
        <RetailerDetailsModal
          row={detailsTarget}
          manufacturerId={manufacturerId}
          onClose={() => setDetailsTarget(null)}
          onAssignProduct={() => { setAssignTarget(detailsTarget); setDetailsTarget(null); }}
        />
      )}

      {/* Bulk confirm modal */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !bulkActioning && setBulkConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className={`flex items-start gap-3 mb-4 ${bulkConfirm === "remove" ? "text-red-600" : "text-amber-600"}`}>
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-on-surface">
                  {bulkConfirm === "remove" ? "Remove" : "Deactivate"} {selectedIds.size} Retailer{selectedIds.size !== 1 ? "s" : ""}?
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  {bulkConfirm === "remove"
                    ? "This will permanently remove selected retailers from your network. They won't appear in your retailer list anymore."
                    : "This will deactivate selected retailers and release all their assigned product seats."}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={bulkActioning} onClick={() => setBulkConfirm(null)}
                className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-60">
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActioning}
                onClick={bulkConfirm === "remove" ? handleBulkRemove : handleBulkDeactivate}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  bulkConfirm === "remove" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {bulkActioning && <Loader2 className="h-4 w-4 animate-spin" />}
                {bulkActioning
                  ? (bulkConfirm === "remove" ? "Removing…" : "Deactivating…")
                  : (bulkConfirm === "remove" ? "Remove All" : "Deactivate All")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk assign products modal */}
      {bulkAssignOpen && manufacturerId && selectedRows.length > 0 && (
        <BulkAssignRetailersModal
          manufacturerId={manufacturerId}
          selectedRetailers={selectedRows}
          products={products}
          subs={subs}
          seatListings={seatListings}
          onAssigned={async () => {
            setSelectedIds(new Set());
            if (manufacturerId) await loadAll(manufacturerId);
          }}
          onClose={() => setBulkAssignOpen(false)}
        />
      )}
    </>
  );
}
