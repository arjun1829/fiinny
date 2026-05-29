"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckSquare, ChevronLeft, ChevronRight, CreditCard, Filter, Loader2, RefreshCw, Search, Square, Trash2, X } from "lucide-react";
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db, getUserProfile } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import {
  computeSeatStats,
  fetchSeatListingsForOwner,
  fetchSeatListingsForRetailer,
  fetchSubscriptions,
  formatSubscriptionDate,
  isExpiringSoon,
  isListingActive,
  isSubscriptionActive,
} from "../_lib/subscriptions-firestore";
import { fetchAssignmentsForRetailer, removeProductAssignment } from "../_lib/product-assignment-firestore";
import { fetchManufacturerRetailers } from "../_lib/manufacturer-retailers-firestore";
import type { RetailerSeatListing, SeatStats, Subscription } from "../_types/subscriptions";
import { HelperIcon, HelperTooltip } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";
import { useI18n } from "../../i18n/I18nContext";

type Role = "manufacturer" | "retailer";
type AccessState = "checking" | "ready" | "denied";

function SeatStatTile({
  label,
  value,
  sub,
  highlight,
  helperKey,
}: {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: "primary" | "harvest";
  helperKey?: HelperTextKey;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-on-surface-variant">{label}</p>
        {helperKey ? (
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey={helperKey}
            ariaLabel={`${label} help`}
          />
        ) : null}
      </div>
      <p
        className={[
          "mt-2 text-3xl font-bold tabular-nums",
          highlight === "primary"
            ? "text-primary"
            : highlight === "harvest"
              ? "text-harvest"
              : "text-on-surface",
        ].join(" ")}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-on-surface-variant">{sub}</p> : null}
    </div>
  );
}

function SubStatusBadge({ sub }: { sub: Subscription }) {
  const { t } = useI18n();
  if (!isSubscriptionActive(sub)) {
    return (
      <span className="inline-flex items-center rounded-full bg-on-surface/10 px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
        {t('expiredBadge')}
      </span>
    );
  }
  if (isExpiringSoon(sub, 30)) {
    return (
      <span className="inline-flex items-center rounded-full bg-harvest/15 px-2.5 py-0.5 text-xs font-semibold text-harvest">
        {t('expiringSoonBadge')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
      {t('activeBadge')}
    </span>
  );
}

function ListingBadge({ listing }: { listing: RetailerSeatListing }) {
  const { t } = useI18n();
  const active = isListingActive(listing);
  if (active) {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
        {t('activeBadge')}
      </span>
    );
  }
  if (listing.status === "released") {
    return (
      <span className="inline-flex items-center rounded-full bg-on-surface/10 px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">
        {t('releasedBadge')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-harvest/15 px-2.5 py-0.5 text-xs font-semibold text-harvest">
      {t('expiredBadge')}
    </span>
  );
}

function ListingTypeBadge({ type }: { type: RetailerSeatListing["listingType"] }) {
  const { t } = useI18n();
  return type === "assigned" ? (
    <span className="inline-flex items-center rounded-full bg-on-surface/8 px-2 py-0.5 text-xs font-medium text-on-surface-variant">
      {t('assignedToRetailer')}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-on-surface/8 px-2 py-0.5 text-xs font-medium text-on-surface-variant">
      {t('ownProductListing')}
    </span>
  );
}

// ─── Advanced listings section ────────────────────────────────────────────────

function ReleaseAction({
  listing,
  onReleased,
}: {
  listing: RetailerSeatListing;
  onReleased: (id: string) => void;
}) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [releasing,  setReleasing]  = useState(false);

  if (!isListingActive(listing)) return null;

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
        <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />
        <span className="text-xs font-medium text-red-700">{t('releaseQ')}</span>
        <button type="button" disabled={releasing}
          onClick={async () => {
            setReleasing(true);
            try { await removeProductAssignment(listing.id); onReleased(listing.id); }
            catch { /* swallow — parent will refresh */ }
            finally { setReleasing(false); setConfirming(false); }
          }}
          className="rounded px-1.5 py-0.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60">
          {releasing ? <Loader2 className="h-3 w-3 animate-spin" /> : t('yesLabel')}
        </button>
        <button type="button" disabled={releasing} onClick={() => setConfirming(false)}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60">{t('noLabel')}</button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs font-medium text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-600">
      <Trash2 className="h-3 w-3" /> {t('releaseBtn')}
    </button>
  );
}

const PAGE_SIZE = 20;

function ActiveListingsSection({
  listings,
  isManufacturer,
  retailerMap,
  productMap,
  onRefresh,
}: {
  listings: RetailerSeatListing[];
  isManufacturer: boolean;
  retailerMap: Map<string, string>;
  productMap: Map<string, { name: string; image: string }>;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [search,       setSearch]       = useState("");
  const [typeFilter,   setTypeFilter]   = useState<"all" | "own" | "assigned">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "released" | "expired">("all");
  const [shopFilter,   setShopFilter]   = useState("all");
  const [assignedFrom, setAssignedFrom] = useState("");
  const [assignedTo,   setAssignedTo]   = useState("");
  const [expiresFrom,  setExpiresFrom]  = useState("");
  const [expiresTo,    setExpiresTo]    = useState("");
  const [showFilters,  setShowFilters]  = useState(false);

  // Multi-select
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [bulkReleasing, setBulkReleasing] = useState(false);
  const [bulkError,    setBulkError]    = useState<string | null>(null);

  // Unique shop names for filter dropdown
  const shopNames = useMemo(() => {
    const names = new Set<string>();
    for (const l of listings) {
      if (l.listingType === "assigned" && l.retailerDocId) {
        const name = retailerMap.get(l.retailerDocId);
        if (name) names.add(name);
      }
    }
    return Array.from(names).sort();
  }, [listings, retailerMap]);

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (typeFilter !== "all" && l.listingType !== typeFilter) return false;
      if (statusFilter === "active"   && !isListingActive(l))    return false;
      if (statusFilter === "released" && l.status !== "released") return false;
      if (statusFilter === "expired"  && l.status !== "expired")  return false;
      if (shopFilter !== "all") {
        const name = l.retailerDocId ? retailerMap.get(l.retailerDocId) : undefined;
        if (name !== shopFilter) return false;
      }
      if (assignedFrom && l.assignedAt) {
        if (l.assignedAt.toDate() < new Date(assignedFrom)) return false;
      }
      if (assignedTo && l.assignedAt) {
        if (l.assignedAt.toDate() > new Date(assignedTo + "T23:59:59")) return false;
      }
      if (expiresFrom && l.expiresAt) {
        if (l.expiresAt.toDate() < new Date(expiresFrom)) return false;
      }
      if (expiresTo && l.expiresAt) {
        if (l.expiresAt.toDate() > new Date(expiresTo + "T23:59:59")) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const shopName = l.retailerDocId ? (retailerMap.get(l.retailerDocId) ?? "") : "";
        const hit = l.productId?.toLowerCase().includes(q)
          || l.listingType.toLowerCase().includes(q)
          || l.status.toLowerCase().includes(q)
          || (l.retailerId ?? "").toLowerCase().includes(q)
          || shopName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [listings, typeFilter, statusFilter, shopFilter, assignedFrom, assignedTo, expiresFrom, expiresTo, search, retailerMap]);

  const hasActiveFilters = typeFilter !== "all" || statusFilter !== "all" || shopFilter !== "all"
    || assignedFrom || assignedTo || expiresFrom || expiresTo || search.trim();

  const clearAll = () => {
    setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setShopFilter("all");
    setAssignedFrom(""); setAssignedTo(""); setExpiresFrom(""); setExpiresTo("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Multi-select helpers
  const activeFiltered = filtered.filter((l) => isListingActive(l));
  const allSelected  = activeFiltered.length > 0 && activeFiltered.every((l) => selected.has(l.id));
  const someSelected = !allSelected && activeFiltered.some((l) => selected.has(l.id));

  const toggleRow = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(activeFiltered.map((l) => l.id)));
  };

  const handleBulkRelease = async () => {
    setBulkReleasing(true);
    setBulkError(null);
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map((id) => removeProductAssignment(id)));
      setSelected(new Set());
      onRefresh();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Some releases failed.");
    } finally {
      setBulkReleasing(false);
    }
  };

  const handleRowReleased = () => {
    onRefresh();
  };

  const selectedCount = Array.from(selected).filter((id) => listings.some((l) => l.id === id)).length;

  return (
    <section aria-label="Your seat listings" className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-on-surface inline-flex items-center gap-1.5">
            Active listings
            <HelperIcon size="xs" variant="ghost" side="right" textKey="dashActiveListings" ariaLabel="Active listings help" />
          </h2>
          <p className="text-sm text-on-surface-variant">
            {isManufacturer
              ? t('activeListingsDescMfg')
              : t('activeListingsDescRetailer')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant">{filtered.length} of {listings.length} listings</span>
          {totalPages > 1 && (
            <span className="text-xs text-on-surface-variant">· Page {page}/{totalPages}</span>
          )}
          <button type="button" onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              showFilters || hasActiveFilters
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/30 hover:text-primary"
            }`}>
            <Filter className="h-3.5 w-3.5" />
            {t('filtersLabel')} {hasActiveFilters ? "•" : ""}
          </button>
          {hasActiveFilters && (
            <button type="button" onClick={clearAll}
              className="flex items-center gap-1 rounded-xl border border-outline-variant/30 px-2.5 py-1.5 text-xs text-on-surface-variant hover:text-red-500 transition-colors">
              <X className="h-3.5 w-3.5" /> {t('clearLabel')}
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low/60 p-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-medium text-on-surface-variant">{t('searchLabel')}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant/50" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/40 bg-white pl-8 pr-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder={t('listingSearchPlaceholder')} />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">{t('typeLabel')}</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}
              className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none">
              <option value="all">{t('allTypes')}</option>
              <option value="own">{t('ownProductType')}</option>
              <option value="assigned">{t('assignedToRetailerType')}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">{t('statusLabel')}</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none">
              <option value="all">{t('allStatuses')}</option>
              <option value="active">{t('activeFilter')}</option>
              <option value="released">{t('releasedFilter')}</option>
              <option value="expired">{t('expiredFilter')}</option>
            </select>
          </label>

          {isManufacturer && shopNames.length > 0 && (
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="font-medium text-on-surface-variant">{t('shopRetailerLabel')}</span>
              <select value={shopFilter} onChange={(e) => setShopFilter(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none">
                <option value="all">{t('allRetailers')}</option>
                {shopNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">{t('assignedFromLabel')}</span>
            <input type="date" value={assignedFrom} onChange={(e) => setAssignedFrom(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">{t('assignedToDateLabel')}</span>
            <input type="date" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">{t('expiresFromLabel')}</span>
            <input type="date" value={expiresFrom} onChange={(e) => setExpiresFrom(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-on-surface-variant">{t('expiresToLabel')}</span>
            <input type="date" value={expiresTo} onChange={(e) => setExpiresTo(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-white px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-sm font-semibold text-primary">
            {selectedCount} listing{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <button type="button" onClick={handleBulkRelease} disabled={bulkReleasing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {bulkReleasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {bulkReleasing ? t('releasingText') : t('releaseSelectedBtn')}
          </button>
          <button type="button" onClick={() => setSelected(new Set())}
            className="rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container">
            {t('deselectAllBtn')}
          </button>
          {bulkError && <span className="text-xs text-red-600">{bulkError}</span>}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-10 text-center">
          <p className="text-base font-semibold text-on-surface">{t('noListingsYet')}</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {isManufacturer
              ? t('noListingsDescMfg')
              : t('noListingsDescRetailer')}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-on-surface">{t('noListingsMatch')}</p>
          <button type="button" onClick={clearAll}
            className="mt-2 text-xs text-primary underline hover:no-underline">{t('clearAllFilters')}</button>
        </div>
      ) : (
        <>
        <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                <tr>
                  {/* Select-all checkbox */}
                  <th className="w-10 px-3 py-3">
                    <button type="button" onClick={toggleAll}
                      className="text-on-surface-variant hover:text-primary">
                      {allSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : someSelected
                          ? <CheckSquare className="h-4 w-4 text-primary/50" />
                          : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colType')}</th>
                  {isManufacturer && <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colShopRetailer')}</th>}
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colProduct')}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colStatus')}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colAssigned')}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colExpires')}</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {paginated.map((listing) => {
                  const active    = isListingActive(listing);
                  const isChecked = selected.has(listing.id);
                  const shopName  = listing.retailerDocId ? (retailerMap.get(listing.retailerDocId) ?? "—") : "—";
                  const product   = productMap.get(listing.productId ?? "");
                  return (
                    <tr key={listing.id}
                      className={[
                        "transition-colors",
                        !active ? "opacity-50" : "",
                        isChecked ? "bg-primary/5" : "hover:bg-surface-container/50",
                      ].join(" ")}>
                      <td className="w-10 px-3 py-3">
                        {active ? (
                          <button type="button" onClick={() => toggleRow(listing.id)}
                            className="text-on-surface-variant hover:text-primary">
                            {isChecked
                              ? <CheckSquare className="h-4 w-4 text-primary" />
                              : <Square className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="inline-block h-4 w-4" />
                        )}
                      </td>
                      <td className="px-4 py-3"><ListingTypeBadge type={listing.listingType} /></td>
                      {isManufacturer && (
                        <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[140px] truncate">
                          {listing.listingType === "assigned" ? shopName : <span className="italic">—</span>}
                        </td>
                      )}
                      {/* Product name + image */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[140px] max-w-[200px]">
                          {product?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0 border border-outline-variant/20" />
                          ) : (
                            <span className="h-8 w-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-on-surface-variant/30 text-xs">🌿</span>
                          )}
                          <span className="text-xs font-medium text-on-surface truncate">
                            {product?.name || <span className="font-mono text-on-surface-variant">{listing.productId?.slice(0, 8) ?? "—"}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><ListingBadge listing={listing} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant text-xs">
                        {listing.assignedAt ? listing.assignedAt.toDate().toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant text-xs">
                        {listing.expiresAt ? listing.expiresAt.toDate().toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ReleaseAction listing={listing} onReleased={handleRowReleased} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-on-surface-variant">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" /> {t('prevBtn')}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    p === page
                      ? "border-primary bg-primary text-white"
                      : "border-outline-variant/40 text-on-surface-variant hover:bg-surface-container"
                  }`}>
                  {p}
                </button>
              ))}
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
                {t('nextBtn')} <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </section>
  );
}

export default function SubscriptionPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("checking");
  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("retailer");

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [ownListings, setOwnListings] = useState<RetailerSeatListing[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<RetailerSeatListing[]>([]);
  const [stats, setStats] = useState<SeatStats | null>(null);
  const [retailerMap, setRetailerMap] = useState<Map<string, string>>(new Map());
  const [productMap, setProductMap] = useState<Map<string, { name: string; image: string }>>(new Map());
  const [manufacturerNameMap, setManufacturerNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (userId: string, userRole: Role) => {
    setLoading(true);
    setError(null);
    try {
      const [subsData, ownData] = await Promise.all([
        fetchSubscriptions(userId),
        fetchSeatListingsForOwner(userId),
      ]);
      setSubs(subsData);
      setOwnListings(ownData);
      setStats(computeSeatStats(subsData, ownData));

      let assigned: RetailerSeatListing[] = [];
      if (userRole === "retailer") {
        assigned = await fetchAssignmentsForRetailer(userId);
        setAssignedToMe(assigned);
      } else {
        setAssignedToMe([]);
        // Build retailerDocId → shopName map for the listings table
        try {
          const retailers = await fetchManufacturerRetailers(userId);
          setRetailerMap(new Map(retailers.map((r) => [r.retailerDocId, r.shopName || r.ownerName])));
        } catch { /* non-critical, table degrades gracefully */ }
      }

      // Fetch product name + image for all unique productIds in listings
      try {
        const allListings = [...ownData, ...(userRole === "retailer" ? assigned : [])];
        const productIds = Array.from(new Set(allListings.map((l) => l.productId).filter(Boolean))) as string[];
        if (productIds.length > 0) {
          const CHUNK = 30; // Firestore `in` limit
          const pMap = new Map<string, { name: string; image: string }>();
          for (let i = 0; i < productIds.length; i += CHUNK) {
            const chunk = productIds.slice(i, i + CHUNK);
            const snap = await getDocs(query(collection(db, "products"), where(documentId(), "in", chunk)));
            snap.docs.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              pMap.set(d.id, {
                name:  String(data.name  ?? ""),
                image: String(data.image ?? ""),
              });
            });
          }
          setProductMap(pMap);
        }
      } catch { /* non-critical */ }

      // Fetch manufacturer business names for assigned-to-me listings.
      // Use manufacturerId when set; fall back to ownerId (always the manufacturer's UID
      // for assigned listings created by the assignment flow).
      if (userRole === "retailer" && assigned.length > 0) {
        try {
          const uniqueMfrIds = Array.from(
            new Set(assigned.map((l) => l.manufacturerId || l.ownerId).filter(Boolean))
          ) as string[];
          const mfrNameMap = new Map<string, string>();
          await Promise.all(uniqueMfrIds.map(async (mfrId) => {
            try {
              const idxSnap = await getDoc(doc(db, "uidIndex", mfrId));
              const phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;
              const mfrSnap = await getDoc(doc(db, "manufacturers", phone || mfrId));
              if (mfrSnap.exists()) {
                const d = mfrSnap.data() as Record<string, unknown>;
                mfrNameMap.set(mfrId, String(d.businessName ?? d.ownerName ?? ""));
              }
            } catch { /* skip */ }
          }));
          setManufacturerNameMap(mfrNameMap);
        } catch { /* non-critical */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscription data.");
    } finally {
      setLoading(false);
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
        const userRole: Role =
          profile?.role === "manufacturer" ? "manufacturer" : "retailer";
        setUid(user.uid);
        setRole(userRole);
        setAccess("ready");
        await loadAll(user.uid, userRole);
      } catch {
        setAccess("denied");
        router.replace("/dashboard");
      }
    });
    return () => unsub();
  }, [router, loadAll]);

  if (access === "checking") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-on-surface-variant">{t('loadingText')}</p>
      </div>
    );
  }

  if (access === "denied" || !uid) return null;

  const isManufacturer = role === "manufacturer";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t('subscriptionTitle')}
          description={t('subscriptionDesc')}
          helperKey="dashSubscription"
        />
        <HelperTooltip side="bottom" textKey="dashBuySeats">
          <a
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 transition-all shrink-0"
          >
            <CreditCard className="h-4 w-4" />
            {t('buySeatsBtn')}
          </a>
        </HelperTooltip>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Seat stats (seats = own listings only — their subscription pays) ── */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SeatStatTile
              label={t('seatsPurchasedLabel')}
              value={stats?.totalPurchased ?? 0}
              sub={t('fromActiveSubs')}
              helperKey="dashSeatsPurchased"
            />
            <SeatStatTile
              label={t('seatsUsedLabel')}
              value={stats?.activeUsed ?? 0}
              highlight="primary"
              sub={t('activeProductListings')}
              helperKey="dashSeatsUsed"
            />
            <SeatStatTile
              label={t('availableLabel')}
              value={stats?.available ?? 0}
              highlight={
                (stats?.available ?? 0) === 0 && (stats?.totalPurchased ?? 0) > 0
                  ? "harvest"
                  : undefined
              }
              sub={t('readyToUse')}
              helperKey="dashSeatsAvailable"
            />
            <SeatStatTile
              label={t('expiringSoonLabel')}
              value={stats?.expiringSoon ?? 0}
              highlight={(stats?.expiringSoon ?? 0) > 0 ? "harvest" : undefined}
              sub={t('subsIn30Days')}
              helperKey="dashSeatsExpiring"
            />
          </div>

          {/* ── Subscription history ── */}
          <section aria-label="Subscription history" className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface inline-flex items-center gap-1.5">
                {t('subHistory')}
                <HelperIcon
                  size="xs"
                  variant="ghost"
                  side="right"
                  textKey="dashSubHistory"
                  ariaLabel="Subscription history help"
                />
              </h2>
              <button
                type="button"
                onClick={() => uid && loadAll(uid, role)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('refreshBtn')}
              </button>
            </div>

            {subs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-10 text-center">
                <p className="text-base font-semibold text-on-surface">{t('noSubsYet')}</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t('purchaseSeatsStart')}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('planCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('seatsCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('statusCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('startCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('expiresCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('paymentIdCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {subs.map((sub) => (
                        <tr key={sub.id} className="hover:bg-surface-container/50">
                          <td className="px-4 py-3 font-medium text-on-surface">{sub.planName}</td>
                          <td className="px-4 py-3 tabular-nums font-semibold text-on-surface">
                            {sub.seatsPurchased}
                          </td>
                          <td className="px-4 py-3">
                            <SubStatusBadge sub={sub} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {sub.startDate ? formatSubscriptionDate(sub.startDate) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {sub.expiryDate ? formatSubscriptionDate(sub.expiryDate) : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                            {sub.razorpayPaymentId ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── Active seat listings (own) with advanced search ── */}
          <ActiveListingsSection
            listings={ownListings}
            isManufacturer={isManufacturer}
            retailerMap={retailerMap}
            productMap={productMap}
            onRefresh={() => uid && loadAll(uid, role)}
          />

          {/* ── Products assigned to this retailer by manufacturers ── */}
          {!isManufacturer && assignedToMe.length > 0 ? (
            <section aria-label="Products assigned by manufacturers">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-on-surface">
                  {t('assignedByMfgTitle')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t('assignedByMfgDesc')}
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('statusCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Product</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">Manufacturer</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('assignedCol')}</th>
                        <th className="whitespace-nowrap px-4 py-3 font-medium">{t('expiresCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {assignedToMe.map((listing) => (
                        <tr
                          key={listing.id}
                          className={
                            !isListingActive(listing)
                              ? "opacity-50 hover:bg-surface-container/50"
                              : "hover:bg-surface-container/50"
                          }
                        >
                          <td className="px-4 py-3">
                            <ListingBadge listing={listing} />
                          </td>
                          <td className="px-4 py-3 text-on-surface font-medium">
                            {productMap.get(listing.productId)?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-on-surface-variant">
                            {manufacturerNameMap.get(listing.manufacturerId ?? listing.ownerId) ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {listing.assignedAt
                              ? listing.assignedAt
                                  .toDate()
                                  .toLocaleDateString(undefined, { dateStyle: "medium" })
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                            {listing.expiresAt
                              ? listing.expiresAt
                                  .toDate()
                                  .toLocaleDateString(undefined, { dateStyle: "medium" })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
