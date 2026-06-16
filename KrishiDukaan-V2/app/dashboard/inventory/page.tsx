"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getUserProfile } from "../../firebase";
import { useEffectiveUser } from "../_context/effective-user-context";
import { PageHeader } from "../_components/page-header";
import { InventoryHealthCards } from "../_components/inventory-health-cards";
import { InventoryTable } from "../_components/inventory-table";
import { AddProductInventoryForm } from "../_components/add-product-inventory-form";
import { BulkProductUpload } from "../_components/bulk-product-upload";
import {
  fetchRetailerInventoryRows,
  fetchManufacturerCatalogueRows,
  activateProduct,
  deactivateProduct,
  deleteProduct,
  toggleAssignedProductActive,
} from "../_lib/inventory-firestore";
import {
  fetchSubscriptions,
  fetchSeatListingsForOwner,
  computeSeatStats,
} from "../_lib/subscriptions-firestore";
import {
  acceptManufacturerInvite,
  autoAcceptPendingInvitesForPhone,
  fetchLinkedRetailerDocIds,
} from "../../lib/invite/invite-acceptance-service";
import type { InventoryRow } from "../_types/inventory";
import type { SeatStats } from "../_types/subscriptions";
import { deriveStockStatus } from "../_types/inventory";
import { CheckCircle2, KeyRound, Loader2, Plus, PlusCircle, Search, X, Zap } from "lucide-react";
import Link from "next/link";
import { HelperIcon, HelperTooltip } from "../../../components/helpers";
import { useI18n } from "../../i18n/I18nContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeHealth(rows: InventoryRow[]) {
  if (!rows.length) {
    return { inStock: 0, lowStock: 0, outOfStock: 0, score: 100, label: "noItemsYet" };
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
    outOfStock === 0 && lowStock === 0 ? "healthyLabel" : score >= 70 ? "goodLabel" : "attentionNeeded";
  return { inStock, lowStock, outOfStock, score, label };
}

// ─── Seat info card ───────────────────────────────────────────────────────────

function SeatInfoCard({ stats }: { stats: SeatStats }) {
  const { t } = useI18n();
  const pct = stats.totalPurchased > 0
    ? Math.min(100, (stats.activeUsed / stats.totalPurchased) * 100)
    : 0;
  const isExhausted = stats.available === 0;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 min-w-[180px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-primary inline-flex items-center gap-1">
          {t('listingSeats')}
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
          {stats.available} {t('seatsLeft')}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-black text-on-surface">{stats.activeUsed}</span>
        <span className="text-sm font-bold text-on-surface-variant">
          / {stats.totalPurchased} {t('seatsUsedOf')}
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
          <Zap className="w-3 h-3" /> {stats.expiringSoon} {t('subExpiringSoon')}
        </p>
      )}
      <HelperTooltip side="top" textKey="dashSeatBuyMore">
        <Link
          href="/dashboard/upgrade"
          className="mt-3 flex items-center justify-center gap-1.5 w-full py-1.5 bg-white border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/5 transition-colors"
        >
          <PlusCircle className="w-3 h-3" />
          {t('buyMoreSeats')}
        </Link>
      </HelperTooltip>
    </div>
  );
}

// ─── Invite code sync card (retailer only) ────────────────────────────────────

function InviteCodeSync({ uid, onSynced }: { uid: string; onSynced: () => void }) {
  const { t } = useI18n();
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
        <h2 className="text-sm font-bold text-on-surface">{t('haveInviteCode')}</h2>
      </div>
      <p className="text-xs text-on-surface-variant mb-4">
        {t('retailerProductInfo')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleSync()}
          placeholder={t('inviteCodePlaceholder')}
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
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const urlInviteCode = searchParams.get("inviteCode") ?? "";
  const { uid: effectiveUid, profile: effectiveProfile } = useEffectiveUser();

  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<UserRole>("retailer");
  const [accountDeliveryEnabled, setAccountDeliveryEnabled] = useState<boolean | undefined>(undefined);
  const [seatStats, setSeatStats] = useState<SeatStats>(DEFAULT_STATS);

  const [addModalOpen, setAddModalOpen] = useState(false);

  // Inventory state — single unified row list for both roles
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState("");

  const [magicStatus, setMagicStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async (uid: string, resolvedRole: UserRole, rDocId?: string, rPhone?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch real seat stats from subscriptions + listings
      const [subs, listings] = await Promise.all([
        fetchSubscriptions(uid),
        fetchSeatListingsForOwner(uid),
      ]);
      setSeatStats(computeSeatStats(subs, listings));

      // Fetch inventory based on role — both produce the unified InventoryRow[]
      if (resolvedRole === "manufacturer") {
        setRows(await fetchManufacturerCatalogueRows(uid, rPhone));
      } else {
        // Find ALL linked retailerDocIds to be safe (if backfill failed but invite is active)
        const linkedIds = await fetchLinkedRetailerDocIds(uid);
        if (rDocId && !linkedIds.includes(rDocId)) linkedIds.push(rDocId);

        // Fetch products for all linked IDs
        const rawRows: InventoryRow[] = [];
        if (linkedIds.length > 0) {
          const results = await Promise.all(linkedIds.map(id => fetchRetailerInventoryRows(uid, id, rPhone)));
          const seen = new Set<string>();
          results.flat().forEach(row => {
            if (!seen.has(row.inventoryId)) {
              seen.add(row.inventoryId);
              rawRows.push(row);
            }
          });
        } else {
          rawRows.push(...await fetchRetailerInventoryRows(uid, undefined, rPhone));
        }

        // Dedup assigned products by name — when the same manufacturer product
        // was removed and re-assigned, two copies (one inactive, one active) can
        // share the same name. Keep the active copy; on equal activity keep the
        // most recently updated one.
        const nameKey = (r: InventoryRow) =>
          r.source === "manufacturer_assigned" ? `assigned:${r.productName.trim().toLowerCase()}` : `own:${r.inventoryId}`;
        const deduped = new Map<string, InventoryRow>();
        rawRows.forEach(row => {
          const key = nameKey(row);
          const existing = deduped.get(key);
          if (!existing) { deduped.set(key, row); return; }
          const rowBetter =
            (row.isActive && !existing.isActive) ||
            (row.isActive === existing.isActive && (row.updatedAt?.getTime() ?? 0) > (existing.updatedAt?.getTime() ?? 0));
          if (rowBetter) deduped.set(key, row);
        });
        const allRetailerRows = Array.from(deduped.values());
        allRetailerRows.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
        setRows(allRetailerRows);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!effectiveUid || !effectiveProfile) return;
    setAuthReady(true);
    setUserId(effectiveUid);
    const profileData = effectiveProfile;
    setProfile(profileData);
    const resolvedRole: UserRole =
      profileData?.role === "manufacturer" ? "manufacturer" : "retailer";
    setRole(resolvedRole);
    setAccountDeliveryEnabled(!!(profileData as any)?.onlineDelivery);
    let rDocId = profileData?.retailerDocId;

    (async () => {
      try {
        if (resolvedRole === "retailer") {
          await autoAcceptPendingInvitesForPhone(effectiveUid).catch((e) => {
            console.warn("[autoAccept] Silent failure:", e);
          });

          if (urlInviteCode) {
            setMagicStatus(null);
            try {
              const result = await acceptManufacturerInvite({ uid: effectiveUid, inviteCode: urlInviteCode });
              if (result.ok === true) {
                if (result.backfillError) {
                  setMagicStatus({ type: "error", message: `Linked, but product sync failed: ${result.backfillError}` });
                } else {
                  setMagicStatus({ type: "success", message: "Magic link accepted! Products synced." });
                }
              } else {
                setMagicStatus({ type: "error", message: result.message });
              }
            } catch {
              setMagicStatus({ type: "error", message: "Magic link failed to process." });
            }
            const url = new URL(window.location.href);
            url.searchParams.delete("inviteCode");
            window.history.replaceState({}, "", url.toString());

            const freshProfile = await getUserProfile(effectiveUid);
            if (freshProfile) {
              setProfile(freshProfile);
              rDocId = freshProfile.retailerDocId;
            }
          }
        }

        await load(effectiveUid, resolvedRole, rDocId, profileData?.phone);
      } catch {
        setLoading(false);
      }
    })();
  }, [effectiveUid, effectiveProfile, load, urlInviteCode]);

  const health = useMemo(() => computeHealth(rows), [rows]);

  const refresh = useCallback(async () => {
    if (userId) {
      const p = await getUserProfile(userId);
      await load(userId, role, p?.retailerDocId, p?.phone);
    }
  }, [userId, role, load]);

  // ─── Toggle active (seat-aware, role-aware) ──────────────────────────────────
  const handleToggleActive = useCallback(async (
    productId: string,
    inventoryId: string | undefined,
    isActive: boolean,
    isAssigned?: boolean,
  ) => {
    if (!userId) return;
    if (isAssigned) {
      // Assigned products bypass subscription seat management — retailer doesn't
      // own a seat for these; just flip isActive/isAvailable directly.
      await toggleAssignedProductActive(productId, inventoryId, !isActive);
    } else if (isActive) {
      await deactivateProduct(productId, userId, inventoryId);
    } else {
      await activateProduct(productId, userId, role, inventoryId);
    }
    await refresh();
  }, [userId, role, refresh]);

  // ─── Delete (own products, both roles) ───────────────────────────────────────
  const handleDelete = useCallback(async (
    productId: string,
    inventoryId: string,
  ) => {
    if (!userId) return;
    await deleteProduct(productId, userId, inventoryId);
    await refresh();
  }, [userId, refresh]);

  // ─── Auth states ──────────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-on-surface-variant">
        {t('checkingSession')}
      </div>
    );
  }

  if (!userId) {
    return (
      <>
        <PageHeader title={t('inventoryTitle')} description={t('signInToManage')} helperKey="dashInventory" />
        <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          {t('notSignedIn')}
        </p>
      </>
    );
  }

  const isManufacturer = role === "manufacturer";

  return (
    <>
      {/* ── Header row: title (left) + seat card (right) ────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <PageHeader
            title={t('inventoryTitle')}
            description={
              isManufacturer ? t('inventoryDescMfg') : t('inventoryDescRetailer')
            }
            helperKey="dashInventory"
          />
        </div>

        {/* Desktop: seat card in top-right */}
        <div className="hidden sm:flex items-start shrink-0">
          <SeatInfoCard stats={seatStats} />
        </div>

        {/* Mobile: compact add button inline with header */}
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="sm:hidden inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 self-start mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add Product
        </button>
      </div>

      {/* ── Desktop: Add Product button — prominent, below heading ───────────── */}
      <div className="hidden sm:flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Status messages */}
      {magicStatus && (
        <div className={`mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${
          magicStatus.type === "success" ? "bg-primary/10 text-primary border border-primary/20" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {magicStatus.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {magicStatus.message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Product list ────────────────────────────────────────────────────── */}
      <section aria-label="Inventory list">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-on-surface">
            {isManufacturer ? t('yourCatalogue') : t('yourInventory')}
          </h2>
          {/* Search */}
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 w-full sm:w-64">
            <Search className="h-4 w-4 text-outline shrink-0" />
            <input
              type="text"
              placeholder="Search by product name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-outline hover:text-on-surface">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <InventoryTable
            role={role}
            userId={userId}
            accountDeliveryEnabled={accountDeliveryEnabled}
            rows={rows.filter(r =>
              !search || r.productName.toLowerCase().includes(search.toLowerCase())
            )}
            onUpdated={refresh}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        )}
      </section>

      {/* ── Secondary widgets (below the fold) ──────────────────────────────── */}

      {/* Retailer invite code — moved below product list */}
      {!isManufacturer && userId && (
        <section className="mt-8">
          <InviteCodeSync uid={userId} onSynced={refresh} />
        </section>
      )}

      {/* Health cards — desktop only (hidden on mobile per UX decision) */}
      {!isManufacturer && (
        <section className="mt-6 hidden sm:block">
          <InventoryHealthCards
            inStock={health.inStock}
            lowStock={health.lowStock}
            outOfStock={health.outOfStock}
            score={health.score}
            label={health.label}
          />
        </section>
      )}

      {/* Retailer upgrade CTA — desktop only */}
      {!isManufacturer && seatStats.available === 0 && seatStats.totalPurchased === 0 && (
        <section className="mt-6 hidden sm:block">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-6 text-center">
            <p className="text-sm font-semibold text-on-surface mb-1">{t('noActiveSubMsg')}</p>
            <p className="text-xs text-on-surface-variant mb-4">{t('purchaseSeatsStart')}</p>
            <Link href="/dashboard/upgrade" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95">
              {t('buySeatsBtn')}
            </Link>
          </div>
        </section>
      )}

      {/* FAB — mobile only, opens add-product modal */}
      <button
        type="button"
        onClick={() => setAddModalOpen(true)}
        aria-label="Add product"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl hover:opacity-95 active:scale-95 transition-all sm:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ── Add Product Modal ────────────────────────────────────────────────── */}
      {addModalOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={() => setAddModalOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-xl flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-base font-bold text-on-surface">Add Product</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {isManufacturer ? "Add to your catalogue" : "Add to your inventory"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              <AddProductInventoryForm
                userId={userId}
                role={role}
                disabled={false}
                onCreated={async () => { setAddModalOpen(false); await refresh(); }}
                seatStats={seatStats}
                storeName={profile?.shopName}
              />
              <BulkProductUpload
                userId={userId}
                role={role}
                seatStats={seatStats}
                onDone={async () => { setAddModalOpen(false); await refresh(); }}
                storeName={profile?.shopName}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
