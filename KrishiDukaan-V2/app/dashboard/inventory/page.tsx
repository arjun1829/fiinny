"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, getUserProfile } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { InventoryHealthCards } from "../_components/inventory-health-cards";
import { InventoryManagementTable } from "../_components/inventory-management-table";
import { ManufacturerCatalogueTable } from "../_components/manufacturer-catalogue-table";
import { AddProductInventoryForm } from "../_components/add-product-inventory-form";
import {
  fetchRetailerInventoryRows,
  fetchManufacturerCatalogueRows,
} from "../_lib/inventory-firestore";
import {
  fetchSubscriptions,
  fetchSeatListingsForOwner,
  computeSeatStats,
} from "../_lib/subscriptions-firestore";
import { acceptManufacturerInvite } from "../../lib/invite/invite-acceptance-service";
import type { InventoryRow, ManufacturerProductRow } from "../_types/inventory";
import type { SeatStats } from "../_types/subscriptions";
import { deriveStockStatus } from "../_types/inventory";
import { CheckCircle2, KeyRound, Loader2, PlusCircle, Zap } from "lucide-react";
import Link from "next/link";
import { HelperIcon, HelperTooltip } from "../../../components/helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeHealth(rows: InventoryRow[]) {
  if (!rows.length) {
    return { inStock: 0, lowStock: 0, outOfStock: 0, score: 100, label: "No items yet" };
  }
  let inStock = 0, lowStock = 0, outOfStock = 0;
  rows.forEach((r) => {
    const s = deriveStockStatus(r.stockQuantity, r.reorderThreshold);
    if (s === "in_stock") inStock++;
    else if (s === "low_stock") lowStock++;
    else outOfStock++;
  });
  const score = Math.round((inStock / rows.length) * 100);
  const label =
    outOfStock === 0 && lowStock === 0 ? "Healthy" : score >= 70 ? "Good" : "Needs attention";
  return { inStock, lowStock, outOfStock, score, label };
}

// ─── Seat info card ───────────────────────────────────────────────────────────

function SeatInfoCard({ stats }: { stats: SeatStats }) {
  const pct = stats.totalPurchased > 0
    ? Math.min(100, (stats.activeUsed / stats.totalPurchased) * 100)
    : 0;
  const isExhausted = stats.available === 0;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 min-w-[180px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1">
          Listing Seats
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey="dashSeatInfo"
            ariaLabel="Listing seats help"
          />
        </span>
        <span
          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
            isExhausted ? "bg-red-500 text-white" : "bg-primary text-white"
          }`}
        >
          {stats.available} Left
        </span>
      </div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-black text-on-surface">{stats.activeUsed}</span>
        <span className="text-sm font-bold text-on-surface-variant">
          / {stats.totalPurchased} Used
        </span>
      </div>
      <div className="mt-2 w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${isExhausted ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {stats.expiringSoon > 0 && (
        <p className="mt-2 text-[10px] text-amber-600 font-semibold flex items-center gap-1">
          <Zap className="w-3 h-3" /> {stats.expiringSoon} sub expiring soon
        </p>
      )}
      <HelperTooltip side="top" textKey="dashSeatBuyMore">
        <Link
          href="/dashboard/upgrade"
          className="mt-3 flex items-center justify-center gap-1.5 w-full py-1.5 bg-white border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/5 transition-colors"
        >
          <PlusCircle className="w-3 h-3" />
          Buy More Seats
        </Link>
      </HelperTooltip>
    </div>
  );
}

// ─── Invite code sync card (retailer only) ────────────────────────────────────

function InviteCodeSync({ uid, onSynced }: { uid: string; onSynced: () => void }) {
  const [code, setCode] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSync = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { inputRef.current?.focus(); return; }
    setSyncing(true);
    setStatus(null);
    try {
      const result = await acceptManufacturerInvite({ uid, inviteCode: trimmed });
      if (result.ok) {
        if (result.backfillError) {
          // Invite linked but product sync had an issue — show the exact reason
          setStatus({ type: "error", message: `Linked, but sync failed: ${result.backfillError}` });
        } else {
          setStatus({ type: "success", message: result.alreadyActive ? "Already linked — products refreshed!" : "Invite accepted! Products synced." });
          setCode("");
        }
        // Refresh inventory regardless — products may already be correct
        onSynced();
      } else {
        setStatus({ type: "error", message: (result as { ok: false; message: string }).message });
      }
    } catch (e) {
      setStatus({ type: "error", message: e instanceof Error ? e.message : "Failed to sync. Try again." });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-4 w-4 text-primary shrink-0" />
        <h2 className="text-sm font-bold text-on-surface">Have an invite code?</h2>
      </div>
      <p className="text-xs text-on-surface-variant mb-4">
        Enter the code your manufacturer gave you to instantly link your account and pull all assigned products.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleSync()}
          placeholder="e.g. KD-ABCD1234"
          maxLength={20}
          className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm font-mono font-bold tracking-widest text-on-surface outline-none ring-primary/30 focus:ring-2 w-48 uppercase"
          disabled={syncing}
        />
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || !code.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {syncing ? "Syncing…" : "Sync products"}
        </button>
      </div>
      {status && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
          status.type === "success" ? "bg-primary/10 text-primary border border-primary/20" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {status.type === "success" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
          {status.message}
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type UserRole = "manufacturer" | "retailer";

const DEFAULT_STATS: SeatStats = { totalPurchased: 0, activeUsed: 0, available: 0, expiringSoon: 0 };

export default function InventoryPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<UserRole>("retailer");
  const [seatStats, setSeatStats] = useState<SeatStats>(DEFAULT_STATS);

  // Inventory state
  const [retailerRows, setRetailerRows] = useState<InventoryRow[]>([]);
  const [catalogueRows, setCatalogueRows] = useState<ManufacturerProductRow[]>([]);

  const load = useCallback(async (uid: string, resolvedRole: UserRole) => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch real seat stats from subscriptions + listings
      const [subs, listings] = await Promise.all([
        fetchSubscriptions(uid),
        fetchSeatListingsForOwner(uid),
      ]);
      setSeatStats(computeSeatStats(subs, listings));

      // Fetch inventory based on role
      if (resolvedRole === "manufacturer") {
        const rows = await fetchManufacturerCatalogueRows(uid);
        setCatalogueRows(rows);
        setRetailerRows([]);
      } else {
        const rows = await fetchRetailerInventoryRows(uid);
        setRetailerRows(rows);
        setCatalogueRows([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory.");
      setRetailerRows([]);
      setCatalogueRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) {
        setUserId(null);
        setProfile(null);
        setSeatStats(DEFAULT_STATS);
        setRetailerRows([]);
        setCatalogueRows([]);
        setLoading(false);
        return;
      }
      setUserId(user.uid);
      try {
        const profileData = await getUserProfile(user.uid);
        setProfile(profileData);
        const resolvedRole: UserRole =
          profileData?.role === "manufacturer" ? "manufacturer" : "retailer";
        setRole(resolvedRole);
        await load(user.uid, resolvedRole);
      } catch {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [load]);

  const health = useMemo(() => computeHealth(retailerRows), [retailerRows]);

  const refresh = useCallback(async () => {
    if (userId) await load(userId, role);
  }, [userId, role, load]);

  // ─── Auth states ──────────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-on-surface-variant">
        Checking session…
      </div>
    );
  }

  if (!userId) {
    return (
      <>
        <PageHeader title="Inventory" description="Sign in to manage your inventory." helperKey="dashInventory" />
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          You are not signed in.
        </p>
      </>
    );
  }

  const isManufacturer = role === "manufacturer";

  return (
    <>
      {/* Page header + seat card side-by-side */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <PageHeader
          title="Inventory"
          description={
            isManufacturer
              ? "Manage your product catalogue. Products are visible to retailers you assign them to."
              : "Your store's stock — own products and manufacturer-assigned items."
          }
          helperKey="dashInventory"
        />
        <SeatInfoCard stats={seatStats} />
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Retailer-only: invite code sync + health cards */}
      {!isManufacturer && userId && (
        <>
          <InviteCodeSync uid={userId} onSynced={refresh} />
          <InventoryHealthCards
            inStock={health.inStock}
            lowStock={health.lowStock}
            outOfStock={health.outOfStock}
            score={health.score}
            label={health.label}
          />
        </>
      )}

      {/* Product table */}
      <section className="mt-8" aria-label="Inventory list">
        <h2 className="text-lg font-semibold text-on-surface">
          {isManufacturer ? "Your catalogue" : "Your inventory"}
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {isManufacturer
            ? "Products you own (ownerId = your UID, ownerType = manufacturer)."
            : "Products from your store — own and manufacturer-assigned (ownerId = your UID, ownerType = retailer)."}
        </p>
        <div className="mt-4">
          {loading ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : isManufacturer ? (
            <ManufacturerCatalogueTable rows={catalogueRows} onRefresh={refresh} />
          ) : (
            <InventoryManagementTable rows={retailerRows} onUpdated={refresh} />
          )}
        </div>
      </section>

      {/* Add product form — manufacturers only (retailers no longer have create permission) */}
      {isManufacturer && (
        <section className="mt-8" aria-label="Add product">
          <AddProductInventoryForm
            userId={userId}
            role="manufacturer"
            disabled={loading}
            onCreated={refresh}
            seatStats={seatStats}
          />
        </section>
      )}

    </>
  );
}
