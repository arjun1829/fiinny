"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, PackagePlus, PowerOff, RefreshCw, Search, SlidersHorizontal, Store, Trash2, Truck, UserPlus, X } from "lucide-react";
import { authedJsonHeaders } from "../../../lib/authed-fetch";
import { fetchManufacturerProducts } from "../../../firebase";
import { useEffectiveUser } from "../../_context/effective-user-context";
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
  bulkReactivateNetworkRetailers,
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

type OnboardingFilter = "all" | "active" | "pending";
type ActionFilter = "all" | "active" | "deactivated";
type AssignmentFilter = "all" | "assigned" | "unassigned";

const PAGE_SIZE = 20;

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
  const { uid: effectiveUid, profile: effectiveProfile } = useEffectiveUser();
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
  // When true, the bulk assign modal was opened from the Reactivate flow.
  // onAssigned will call bulkReactivateNetworkRetailers after products are assigned.
  const [bulkReactivateMode, setBulkReactivateMode] = useState(false);

  // Search & filters
  const [search, setSearch] = useState("");
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [page, setPage] = useState(1);

  const hasActiveFilters =
    search.trim() !== "" ||
    onboardingFilter !== "all" ||
    actionFilter !== "all" ||
    assignmentFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setOnboardingFilter("all");
    setActionFilter("all");
    setAssignmentFilter("all");
  };

  // Rows that match the current search + filters. Search and filters combine (AND).
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const haystack = `${r.shopName} ${r.ownerName} ${r.retailerPhone}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (onboardingFilter === "active" && r.onboardingStatus !== "active") return false;
      if (onboardingFilter === "pending" && r.onboardingStatus === "active") return false;
      if (actionFilter === "deactivated" && r.manuallyDeactivated !== true) return false;
      if (actionFilter === "active" && r.manuallyDeactivated === true) return false;
      if (assignmentFilter === "assigned" && r.assignedSeat !== true) return false;
      if (assignmentFilter === "unassigned" && r.assignedSeat === true) return false;
      return true;
    });
  }, [rows, search, onboardingFilter, actionFilter, assignmentFilter]);

  // Reset to the first page whenever the filtered result set changes, and drop any
  // selection that is no longer visible so bulk actions can't touch hidden retailers.
  useEffect(() => {
    setPage(1);
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredRows.map((r) => r.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filteredRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filteredRows.length);

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
    if (!effectiveUid || !effectiveProfile) return;
    if (effectiveProfile.role === "manufacturer") {
      setManufacturerId(effectiveUid);
      setManufacturerName((effectiveProfile as any).name || (effectiveProfile as any).shopName || "");
      setAccess("allowed");
      loadAll(effectiveUid);
    } else {
      setAccess("denied");
      router.replace("/dashboard");
    }
  }, [effectiveUid, effectiveProfile, router, loadAll]);

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

  // Opens the product assignment modal. If the retailer is deactivated,
  // handleAssigned will call reactivateNetworkRetailer after products are assigned.
  const handleActivate = (row: ManufacturerRetailerRow) => {
    setAssignTarget(row);
  };

  const handleAssigned = async () => {
    if (!manufacturerId) return;
    // If this assignment was triggered from a reactivate flow, clear manuallyDeactivated
    // now that at least one product has been assigned and a seat is consumed.
    if (assignTarget?.manuallyDeactivated === true) {
      await reactivateNetworkRetailer(assignTarget.id);
    }
    await loadAll(manufacturerId);
    setAssignTarget(null);
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));

  // Online vs in-store-only selling of this manufacturer's products, per
  // retailer (POST /api/manufacturer/network-online; checkout enforces it).
  const [onlineMsg, setOnlineMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setNetworkOnline = async (targets: ManufacturerRetailerRow[], allowed: boolean) => {
    if (targets.length === 0) return;
    setOnlineMsg(null);
    try {
      const res = await fetch("/api/manufacturer/network-online", {
        method: "POST",
        headers: await authedJsonHeaders(),
        body: JSON.stringify({ linkIds: targets.map((r) => r.id), allowed }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not update online selling.");
      const ids = new Set(targets.map((r) => r.id));
      setRows((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, onlineSalesBlocked: !allowed } : r)));
      const who = targets.length === 1 ? (targets[0].shopName || "This retailer") : `${targets.length} retailers`;
      setOnlineMsg({
        ok: true,
        text: allowed
          ? `${who} can now sell your products online too (they switch online delivery on per product).`
          : `${who} now sell${targets.length === 1 ? "s" : ""} your products in-store only. Their online listings of your products were switched off.`,
      });
    } catch (e) {
      setOnlineMsg({ ok: false, text: e instanceof Error ? e.message : "Could not update online selling." });
    }
  };

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

  // Opens the bulk assign modal in reactivate mode — no confirm dialog needed.
  const handleBulkReactivateClick = () => {
    setBulkReactivateMode(true);
    setBulkAssignOpen(true);
  };

  // Called by BulkAssignRetailersModal after products are assigned.
  // In reactivate mode, also clears manuallyDeactivated on all deactivated retailers.
  const handleBulkAssigned = async () => {
    if (bulkReactivateMode) {
      const deactivatedItems = selectedRows
        .filter((r) => r.manuallyDeactivated === true)
        .map((r) => ({ inviteDocId: r.id, retailerDocId: r.retailerDocId }));
      if (deactivatedItems.length > 0) {
        await bulkReactivateNetworkRetailers(deactivatedItems);
      }
      setBulkReactivateMode(false);
    }
    setSelectedIds(new Set());
    if (manufacturerId) await loadAll(manufacturerId);
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

      {onlineMsg && (
        <div className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
          onlineMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <span>{onlineMsg.text}</span>
          <button type="button" onClick={() => setOnlineMsg(null)} aria-label="Dismiss" className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-sm font-bold text-primary">
            {selectedIds.size} retailer{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            <button
              type="button"
              onClick={() => { setBulkReactivateMode(false); setBulkAssignOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
            >
              <PackagePlus className="h-3.5 w-3.5" /> Assign Products
            </button>
            <button
              type="button"
              onClick={() => void setNetworkOnline(selectedRows, true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <Truck className="h-3.5 w-3.5" /> Allow online selling
            </button>
            <button
              type="button"
              onClick={() => void setNetworkOnline(selectedRows, false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/50 bg-white px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container"
            >
              <Store className="h-3.5 w-3.5" /> In-store only
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
              onClick={handleBulkReactivateClick}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reactivate
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

      {/* Search & filters — only once at least one retailer exists */}
      {!listLoading && rows.length > 0 && (
        <section className="mb-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4" aria-label="Search and filter retailers">
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="flex flex-col gap-1.5 w-full sm:w-72">
              <label className="text-xs font-semibold text-on-surface-variant">Search</label>
              <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2">
                <Search className="h-4 w-4 text-outline shrink-0" />
                <input
                  type="text"
                  placeholder="Shop, owner, or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent border-none p-0 focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="text-outline hover:text-on-surface" aria-label="Clear search">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Onboarding status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Onboarding</label>
              <select
                value={onboardingFilter}
                onChange={(e) => setOnboardingFilter(e.target.value as OnboardingFilter)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
              >
                <option value="all">All</option>
                <option value="active">Signed up</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {/* Invite / action status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Status</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </div>

            {/* Assignment */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Products</label>
              <select
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value as AssignmentFilter)}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 appearance-none"
              >
                <option value="all">All</option>
                <option value="assigned">With assignments</option>
                <option value="unassigned">Without assignments</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Showing {firstShown}–{lastShown} of {filteredRows.length}
              {filteredRows.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
            </span>
          </div>
        </section>
      )}

      <section aria-label="Retailer list">
        {!listLoading && rows.length > 0 && filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-14 text-center">
            <p className="text-base font-semibold text-on-surface">No retailers match your filters</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
              Try adjusting your search or filters to find what you&apos;re looking for.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          </div>
        ) : (
          <RetailerTable
            rows={listLoading ? [] : pagedRows}
            loading={listLoading}
            onRemove={handleRemove}
            onAssignProduct={(row) => setAssignTarget(row)}
            onEdit={(row) => setEditTarget(row)}
            onDetails={(row) => setDetailsTarget(row)}
            onDeactivate={handleDeactivate}
            onActivate={handleActivate}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onSetOnline={(row, allowed) => setNetworkOnline([row], allowed)}
          />
        )}

        {/* Pagination */}
        {!listLoading && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-on-surface-variant">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
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

      {/* Bulk confirm modal — deactivate and remove only */}
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

      {/* Bulk assign products modal — also used for the bulk reactivate flow */}
      {bulkAssignOpen && manufacturerId && selectedRows.length > 0 && (
        <BulkAssignRetailersModal
          manufacturerId={manufacturerId}
          selectedRetailers={
            bulkReactivateMode
              ? selectedRows.filter((r) => r.manuallyDeactivated === true)
              : selectedRows
          }
          products={products}
          subs={subs}
          seatListings={seatListings}
          onAssigned={handleBulkAssigned}
          onClose={() => { setBulkAssignOpen(false); setBulkReactivateMode(false); }}
        />
      )}
    </>
  );
}
