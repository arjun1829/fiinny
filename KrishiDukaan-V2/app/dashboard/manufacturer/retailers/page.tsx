"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { auth, getUserProfile, fetchManufacturerProducts } from "../../../firebase";
import { PageHeader } from "../../_components/page-header";
import { HelperIcon, HelperTooltip } from "../../../../components/helpers";
import { RetailerTable } from "../../_components/manufacturer/retailer-table";
import { AddRetailerModal } from "../../_components/manufacturer/add-retailer-form";
import { AssignProductModal } from "../../_components/manufacturer/assign-product-modal";
import { InviteCard } from "../../_components/manufacturer/invite-card";
import {
  fetchManufacturerRetailers,
  removeNetworkRetailer,
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

type AccessState = "checking" | "allowed" | "denied";

type ToastPayload = {
  inviteCode: string;
  shopName: string;
  retailerEmail: string;
  retailerPhone: string;
};

export default function ManufacturerRetailersPage() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("checking");
  const [manufacturerId, setManufacturerId] = useState<string | null>(null);

  const [rows, setRows] = useState<ManufacturerRetailerRow[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [seatListings, setSeatListings] = useState<RetailerSeatListing[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);

  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ManufacturerRetailerRow | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);

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
  };

  const handleRemove = async (row: ManufacturerRetailerRow) => {
    await removeNetworkRetailer(row.id, row.retailerDocId);
    if (manufacturerId) await loadAll(manufacturerId);
  };

  const handleAssigned = async () => {
    if (manufacturerId) await loadAll(manufacturerId);
    setAssignTarget(null);
  };

  if (access === "checking") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-on-surface-variant">Checking access…</p>
      </div>
    );
  }

  if (access === "denied" || !manufacturerId) return null;

  return (
    <>
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Retailer Network"
          description="Add retailers to your network, then assign your products to them. Each product assignment consumes one seat (1 month validity)."
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
              Add Retailer
            </button>
          </HelperTooltip>
          {totalPurchased > 0 ? (
            <p className="text-xs text-on-surface-variant inline-flex items-center gap-1">
              {Math.max(0, seatsRemaining)} of {totalPurchased} seat
              {totalPurchased !== 1 ? "s" : ""} remaining
              <HelperIcon
                size="xs"
                variant="ghost"
                side="bottom"
                textKey="dashRetailerSeats"
                ariaLabel="Seats remaining help"
              />
            </p>
          ) : (
            <p className="text-xs text-harvest">No active subscription</p>
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

      <section aria-label="Retailer list">
        <RetailerTable
          rows={rows}
          loading={listLoading}
          onRemove={handleRemove}
          onAssignProduct={(row) => setAssignTarget(row)}
        />
      </section>

      {addModalOpen && manufacturerId ? (
        <AddRetailerModal
          manufacturerId={manufacturerId}
          seatsRemaining={seatsRemaining}
          onRetailerAdded={handleRetailerAdded}
          onClose={() => setAddModalOpen(false)}
        />
      ) : null}

      {assignTarget && manufacturerId ? (
        <AssignProductModal
          manufacturerId={manufacturerId}
          retailer={assignTarget}
          products={products}
          subs={subs}
          seatListings={seatListings}
          onAssigned={handleAssigned}
          onClose={() => setAssignTarget(null)}
        />
      ) : null}
    </>
  );
}
