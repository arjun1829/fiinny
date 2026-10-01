"use client";

/**
 * Shared "pending retailers → send signup reminder" panel.
 *
 * Two modes:
 *  - Single-manufacturer (Company Pages drawer): pass `manufacturer` — behaves
 *    exactly like the old PendingRetailersTab there.
 *  - Cross-manufacturer (Users & Roles): omit `manufacturer` — lists EVERY
 *    pending invite across all manufacturers, grouped per manufacturer, each
 *    group with its own send button.
 *
 * The reminder write path (waNotifications queue doc + audit stamps on the
 * invite doc) lives only here now, so the queue schema can't drift between
 * screens. Delivery is handled by the sendWaNotification Cloud Function.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, Bell, CheckCircle2, Loader2, RefreshCw, Send, Store, X,
} from "lucide-react";
import {
  collection, doc, getDocs, increment, query,
  serverTimestamp, where, writeBatch,
} from "firebase/firestore";
import { auth, db, fetchManufacturerProducts } from "../../firebase";
import type { MarketplaceProduct } from "../../../types/product";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingPanelManufacturer = {
  phone: string;
  uid?: string;
  businessName?: string;
  ownerName?: string;
};

type PendingRetailer = {
  docId: string;
  shopName: string;
  ownerName: string;
  retailerPhone: string;
  inviteCode: string;
  manufacturerKey: string;
  manufacturerName: string;
  manufacturerUid?: string;
  manufacturerPhone?: string;
  lastReminderSentAt?: { toDate: () => Date } | null;
  reminderCount?: number;
};

type Product = { id: string; name: string; image?: string; category?: string };

type Status = { type: "ok" | "err"; msg: string } | null;

const inputCls =
  "w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary/30 focus:ring-2 placeholder:text-on-surface-variant/50";

function StatusBanner({ status, onDismiss }: { status: Status; onDismiss: () => void }) {
  if (!status) return null;
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm font-medium border ${
        status.type === "ok"
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-700"
      }`}
    >
      <span>{status.type === "ok" ? "✓ " : "✗ "}{status.msg}</span>
      <button type="button" onClick={onDismiss}><X className="w-4 h-4" /></button>
    </div>
  );
}

function rowFromDoc(d: { id: string; data: () => Record<string, unknown> }): PendingRetailer | null {
  const data = d.data();
  if (data.onboardingStatus === "removed" || data.status === "revoked") return null;
  const manufacturerPhone = String(data.manufacturerPhone ?? "");
  const manufacturerUid = String(data.manufacturerId ?? "");
  return {
    docId: d.id,
    shopName: String(data.shopName ?? ""),
    ownerName: String(data.ownerName ?? ""),
    retailerPhone: String(data.retailerPhone ?? ""),
    inviteCode: String(data.inviteCode ?? ""),
    manufacturerKey: manufacturerPhone || manufacturerUid || "unknown",
    manufacturerName: String(data.manufacturerName ?? "") || manufacturerPhone || "Unknown manufacturer",
    manufacturerUid: manufacturerUid || undefined,
    manufacturerPhone: manufacturerPhone || undefined,
    lastReminderSentAt: (data.lastReminderSentAt as PendingRetailer["lastReminderSentAt"]) ?? null,
    reminderCount: typeof data.reminderCount === "number" ? data.reminderCount : 0,
  };
}

// ─── Send modal ───────────────────────────────────────────────────────────────

function SendReminderModal({
  manufacturerName,
  retailers,
  products,
  onClose,
  onSent,
}: {
  manufacturerName: string;
  retailers: PendingRetailer[];
  products: Product[];
  onClose: () => void;
  onSent: (count: number) => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(
    new Set(retailers.map((r) => r.docId)),
  );
  const [step, setStep] = useState<"configure" | "confirm" | "sending" | "done">("configure");
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    const all = retailers.length > 0 && selectedDocIds.size >= retailers.length;
    const none = selectedDocIds.size === 0;
    el.checked = all;
    el.indeterminate = !all && !none;
  }, [selectedDocIds, retailers]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedRetailers = retailers.filter((r) => selectedDocIds.has(r.docId));

  const toggleRetailer = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleSend = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setStep("sending");
    setError(null);

    const senderUid = auth.currentUser?.uid ?? "admin";
    const product = selectedProduct!;
    const now = serverTimestamp();
    let count = 0;

    try {
      const batch = writeBatch(db);
      const waRef = collection(db, "waNotifications");

      for (const retailer of selectedRetailers) {
        // Queue the WhatsApp notification doc (schema matches
        // app/lib/wa-notify.ts's queueWaNotification — that helper is
        // admin-SDK/server-only, so the client writes the same shape here).
        const notifDoc = doc(waRef);
        batch.set(notifDoc, {
          phone: retailer.retailerPhone,
          message: `📦 नवीन प्रॉडक्ट असाइन करण्यात आला आहे.\n\nप्रॉडक्ट: ${product.name}\nकंपनी: ${manufacturerName}`,
          template: "product_assignment_pending_signup",
          payload: {
            retailerName: retailer.shopName || retailer.ownerName || retailer.retailerPhone,
            manufacturerName,
            productName: product.name,
            inviteCode: retailer.inviteCode,
            productId: product.id,
          },
          source: {
            event: "admin_reminder",
            entityType: "manufacturerRetailers",
            entityId: retailer.docId,
          },
          status: "pending",
          type: "onboarding",
          metaMessageId: null,
          createdAt: now,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
        });

        batch.update(doc(db, "manufacturerRetailers", retailer.docId), {
          lastReminderSentAt: now,
          lastReminderSentBy: senderUid,
          reminderCount: increment(1),
        });

        count++;
      }

      await batch.commit();
      setSentCount(count);
      setStep("done");
      onSent(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed. Please try again.");
      setStep("confirm");
    } finally {
      sendingRef.current = false;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={step === "sending" ? undefined : onClose} />
      <div className="fixed inset-x-4 top-1/2 z-[70] -translate-y-1/2 max-w-lg mx-auto rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <Bell className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface">Send Pending Signup Notifications</p>
              <p className="text-xs text-on-surface-variant">{manufacturerName}</p>
            </div>
          </div>
          {step !== "sending" && (
            <button onClick={onClose} className="rounded-xl p-1.5 hover:bg-amber-100 text-on-surface-variant">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto max-h-[70vh] p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "done" ? (
            <div className="py-6 text-center space-y-3">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <p className="font-bold text-on-surface">
                {sentCount} notification{sentCount !== 1 ? "s" : ""} queued!
              </p>
              <p className="text-sm text-on-surface-variant">
                WhatsApp messages will be delivered shortly via the WA queue.
              </p>
              <button
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : step === "sending" ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium text-on-surface-variant">
                Queuing {selectedRetailers.length} notification{selectedRetailers.length !== 1 ? "s" : ""}…
              </p>
            </div>
          ) : step === "confirm" ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                <p className="text-sm font-bold text-amber-800">Confirm before sending</p>
                <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                  <li>Template: <span className="font-mono text-xs">product_assignment_pending_signup</span></li>
                  <li>Product: <span className="font-semibold">{selectedProduct?.name}</span></li>
                  <li>Recipients: <span className="font-semibold">{selectedRetailers.length} retailer{selectedRetailers.length !== 1 ? "s" : ""}</span></li>
                  <li>Manufacturer: <span className="font-semibold">{manufacturerName}</span></li>
                </ul>
                <p className="text-xs text-amber-600 mt-2">
                  This will write {selectedRetailers.length} doc{selectedRetailers.length !== 1 ? "s" : ""} to <code className="font-mono">waNotifications</code> and update audit fields on each invite doc.
                  No invite codes, products, or onboarding records will be created or modified.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("configure")}
                  className="flex-1 rounded-xl border border-outline-variant/40 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container"
                >
                  Back
                </button>
                <button
                  onClick={handleSend}
                  disabled={selectedRetailers.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Send {selectedRetailers.length} Notification{selectedRetailers.length !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-on-surface">
                  Select Product <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Choose a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.category ? ` (${p.category})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-on-surface-variant">
                  Product name appears as <span className="font-mono">{"{{3}}"}</span> in the WhatsApp message.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    onChange={(e) =>
                      setSelectedDocIds(
                        e.target.checked
                          ? new Set(retailers.map((r) => r.docId))
                          : new Set(),
                      )
                    }
                    className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30 cursor-pointer shrink-0"
                  />
                  <label className="text-sm font-medium text-on-surface">
                    Select Recipients ({selectedDocIds.size}/{retailers.length})
                  </label>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/10">
                  {retailers.map((r) => {
                    const checked = selectedDocIds.has(r.docId);
                    const reminderAge = r.lastReminderSentAt
                      ? Math.floor((Date.now() - r.lastReminderSentAt.toDate().getTime()) / 3600000)
                      : null;
                    const recentlySent = reminderAge !== null && reminderAge < 24;
                    return (
                      <label
                        key={r.docId}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          checked ? "bg-primary/5" : "hover:bg-surface-container-low"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRetailer(r.docId)}
                          className="mt-0.5 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">
                            {r.shopName || r.ownerName || r.retailerPhone}
                          </p>
                          <p className="text-xs text-on-surface-variant">{r.retailerPhone}</p>
                          {recentlySent && (
                            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                              ⚠ Sent {reminderAge}h ago (reminder #{r.reminderCount})
                            </p>
                          )}
                          {!recentlySent && r.reminderCount && r.reminderCount > 0 ? (
                            <p className="text-[10px] text-on-surface-variant mt-0.5">
                              Reminder #{r.reminderCount} sent {reminderAge}h ago
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setStep("confirm")}
                disabled={!selectedProductId || selectedDocIds.size === 0}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Review &amp; Confirm →
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Retailer row ─────────────────────────────────────────────────────────────

function RetailerRow({ r }: { r: PendingRetailer }) {
  const reminderAge = r.lastReminderSentAt
    ? Math.floor((Date.now() - r.lastReminderSentAt.toDate().getTime()) / 3600000)
    : null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3.5">
      <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <Store className="w-4 h-4 text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-surface text-sm truncate">
          {r.shopName || r.ownerName || "—"}
        </p>
        <p className="text-xs text-on-surface-variant">{r.retailerPhone}</p>
        {r.inviteCode && (
          <p className="text-[10px] text-on-surface-variant/60 font-mono mt-0.5">
            Code: {r.inviteCode}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        {r.reminderCount && r.reminderCount > 0 ? (
          <>
            <p className="text-[10px] font-bold text-on-surface-variant">
              {r.reminderCount} reminder{r.reminderCount !== 1 ? "s" : ""}
            </p>
            {reminderAge !== null && (
              <p className={`text-[10px] ${reminderAge < 24 ? "text-amber-600 font-semibold" : "text-on-surface-variant"}`}>
                {reminderAge < 1 ? "< 1h ago" : `${reminderAge}h ago`}
              </p>
            )}
          </>
        ) : (
          <p className="text-[10px] text-on-surface-variant">No reminders yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function PendingSignupPanel({ manufacturer }: { manufacturer?: PendingPanelManufacturer }) {
  const [retailers, setRetailers] = useState<PendingRetailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>(null);

  // Modal state — which manufacturer group is being sent to, with its products
  const [modalGroup, setModalGroup] = useState<{
    name: string;
    retailers: PendingRetailer[];
    products: Product[];
  } | null>(null);
  const [loadingProductsFor, setLoadingProductsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const retailerQueries: Promise<import("firebase/firestore").QuerySnapshot>[] = [];
      if (manufacturer) {
        if (manufacturer.uid) {
          retailerQueries.push(getDocs(query(
            collection(db, "manufacturerRetailers"),
            where("manufacturerId", "==", manufacturer.uid),
            where("status", "==", "invited"),
          )));
        }
        if (manufacturer.phone) {
          retailerQueries.push(getDocs(query(
            collection(db, "manufacturerRetailers"),
            where("manufacturerPhone", "==", manufacturer.phone),
            where("status", "==", "invited"),
          )));
        }
      } else {
        // Cross-manufacturer: every pending invite in the system.
        retailerQueries.push(getDocs(query(
          collection(db, "manufacturerRetailers"),
          where("status", "==", "invited"),
        )));
      }

      const snaps = await Promise.all(retailerQueries);
      const seen = new Set<string>();
      const rows: PendingRetailer[] = [];
      for (const snap of snaps) {
        for (const d of snap.docs) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          const row = rowFromDoc(d);
          if (row) rows.push(row);
        }
      }
      rows.sort((a, b) => (a.shopName || a.retailerPhone).localeCompare(b.shopName || b.retailerPhone));
      setRetailers(rows);
    } catch (e) {
      setStatus({ type: "err", msg: e instanceof Error ? e.message : "Could not load pending retailers." });
    } finally {
      setLoading(false);
    }
  }, [manufacturer]);

  useEffect(() => { void load(); }, [load]);

  const openSendModal = async (groupKey: string, groupName: string, groupRetailers: PendingRetailer[]) => {
    setLoadingProductsFor(groupKey);
    try {
      const sample = groupRetailers[0];
      const uid = manufacturer?.uid ?? sample?.manufacturerUid;
      const phone = manufacturer?.phone ?? sample?.manufacturerPhone;
      const productQueries: Promise<MarketplaceProduct[]>[] = [];
      if (uid) productQueries.push(fetchManufacturerProducts(uid));
      if (phone) productQueries.push(fetchManufacturerProducts(phone));
      const sets = await Promise.all(productQueries);
      const seenP = new Set<string>();
      const prods: Product[] = [];
      for (const list of sets) {
        for (const p of list) {
          if (seenP.has(p.id)) continue;
          seenP.add(p.id);
          const raw = p as Record<string, unknown>;
          prods.push({
            id: p.id,
            name: String(raw.name ?? p.id),
            image: String(raw.image ?? ""),
            category: String(raw.category ?? ""),
          });
        }
      }
      prods.sort((a, b) => a.name.localeCompare(b.name));
      setModalGroup({ name: groupName, retailers: groupRetailers, products: prods });
    } catch (e) {
      setStatus({ type: "err", msg: e instanceof Error ? e.message : "Could not load products." });
    } finally {
      setLoadingProductsFor(null);
    }
  };

  // Group cross-manufacturer rows; single-manufacturer mode is one group.
  const groups: { key: string; name: string; rows: PendingRetailer[] }[] = [];
  if (manufacturer) {
    if (retailers.length > 0) {
      groups.push({
        key: manufacturer.phone || manufacturer.uid || "self",
        name: manufacturer.businessName || manufacturer.ownerName || manufacturer.phone,
        rows: retailers,
      });
    }
  } else {
    const byKey = new Map<string, { name: string; rows: PendingRetailer[] }>();
    for (const r of retailers) {
      const g = byKey.get(r.manufacturerKey) ?? { name: r.manufacturerName, rows: [] };
      g.rows.push(r);
      byKey.set(r.manufacturerKey, g);
    }
    byKey.forEach((g, key) => groups.push({ key, name: g.name, rows: g.rows }));
    groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="space-y-4">
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Bell className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-semibold text-on-surface">
            {loading ? "Loading…" : `${retailers.length} pending retailer${retailers.length !== 1 ? "s" : ""}`}
          </span>
          <span className="text-on-surface-variant">(invite sent, signup incomplete)</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 rounded-xl border border-outline-variant/40 px-2.5 py-1.5 text-xs font-medium hover:bg-surface-container disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : retailers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/40 px-6 py-12 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-green-500/50 mx-auto" />
          <p className="font-semibold text-on-surface-variant text-sm">All retailers have completed signup.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              {!manufacturer && (
                <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                  {g.name} · {g.rows.length} pending
                </p>
              )}
              <button
                type="button"
                onClick={() => void openSendModal(g.key, g.name, g.rows)}
                disabled={loadingProductsFor !== null}
                className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 shadow-sm disabled:opacity-60"
              >
                {loadingProductsFor === g.key
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Bell className="w-4 h-4" />}
                Send Pending Signup Notifications
              </button>
              <div className="space-y-2">
                {g.rows.map((r) => <RetailerRow key={r.docId} r={r} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalGroup && (
        <SendReminderModal
          manufacturerName={modalGroup.name}
          retailers={modalGroup.retailers}
          products={modalGroup.products}
          onClose={() => setModalGroup(null)}
          onSent={(count) => {
            setStatus({ type: "ok", msg: `${count} WhatsApp notification${count !== 1 ? "s" : ""} queued successfully.` });
            setModalGroup(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
