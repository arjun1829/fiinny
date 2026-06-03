"use client";

import { useEffect, useState } from "react";
import {
  Package, Search, RefreshCw, Loader2, Check, X, AlertCircle,
  ChevronDown, ChevronUp, History, Save, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  collection, getDocs, query, where, orderBy, limit,
  doc, updateDoc, serverTimestamp, getDoc, Timestamp,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { cn } from "../../dashboard/_lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type InventoryItem = {
  inventoryId: string;
  productId: string;
  productName: string;
  category: string;
  ownerPhone: string;
  ownerType: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
  isAvailable: boolean;
  updatedAt: Date | null;
};

type AuditLog = {
  id: string;
  inventoryId: string;
  productName: string;
  ownerPhone: string;
  prevStock: number;
  newStock: number;
  prevPrice: number;
  newPrice: number;
  modifiedBy: string;
  note: string;
  createdAt: Date | null;
};

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function fetchAllInventory(): Promise<InventoryItem[]> {
  const invSnap = await getDocs(
    query(collection(db, "inventory"), orderBy("updatedAt", "desc"), limit(300))
  );
  if (invSnap.empty) return [];

  const productIds = Array.from(
    new Set(invSnap.docs.map(d => String(d.data().productId ?? "")).filter(Boolean))
  );
  const productNameMap = new Map<string, { name: string; category: string }>();

  const chunkSize = 10;
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize);
    const pSnap = await getDocs(
      query(collection(db, "products"), where("__name__", "in", chunk))
    );
    pSnap.docs.forEach(d => {
      const r = d.data() as Record<string, unknown>;
      productNameMap.set(d.id, {
        name: String(r.name ?? ""),
        category: String(r.category ?? ""),
      });
    });
  }

  return invSnap.docs.map(d => {
    const r = d.data() as Record<string, unknown>;
    const ts = r.updatedAt as Timestamp | null;
    const pInfo = productNameMap.get(String(r.productId ?? "")) ?? { name: "—", category: "—" };
    return {
      inventoryId: d.id,
      productId: String(r.productId ?? ""),
      productName: pInfo.name,
      category: pInfo.category,
      ownerPhone: String(r.ownerPhone ?? r.retailerPhone ?? r.manufacturerPhone ?? "—"),
      ownerType: String(r.ownerType ?? "retailer"),
      stockQuantity: Number(r.stockQuantity ?? 0),
      sellingPrice: Number(r.sellingPrice ?? r.price ?? 0),
      reorderThreshold: Number(r.reorderThreshold ?? 0),
      isAvailable: r.isAvailable !== false,
      updatedAt: ts?.toDate?.() ?? null,
    };
  });
}

async function fetchAuditLogs(): Promise<AuditLog[]> {
  const snap = await getDocs(
    query(collection(db, "adminLogs"), where("action", "==", "admin_inventory_update"),
      orderBy("createdAt", "desc"), limit(100))
  );
  return snap.docs.map(d => {
    const r = d.data() as Record<string, unknown>;
    const ts = r.createdAt as Timestamp | null;
    return {
      id: d.id,
      inventoryId: String(r.inventoryId ?? ""),
      productName: String(r.productName ?? ""),
      ownerPhone: String(r.ownerPhone ?? ""),
      prevStock: Number(r.prevStock ?? 0),
      newStock: Number(r.newStock ?? 0),
      prevPrice: Number(r.prevPrice ?? 0),
      newPrice: Number(r.newPrice ?? 0),
      modifiedBy: String(r.performedBy ?? ""),
      note: String(r.note ?? ""),
      createdAt: ts?.toDate?.() ?? null,
    };
  });
}

async function adminUpdateInventory(
  inventoryId: string,
  productName: string,
  ownerPhone: string,
  prev: { stock: number; price: number; threshold: number },
  next: { stock: number; price: number; threshold: number },
  note: string,
  adminUid: string,
): Promise<void> {
  const now = serverTimestamp();
  const invRef = doc(db, "inventory", inventoryId);
  const logRef = doc(collection(db, "adminLogs"));

  await Promise.all([
    updateDoc(invRef, {
      stockQuantity: next.stock,
      sellingPrice: next.price,
      reorderThreshold: next.threshold,
      isAvailable: next.stock > 0,
      updatedAt: now,
    }),
    import("firebase/firestore").then(({ setDoc }) =>
      setDoc(logRef, {
        action: "admin_inventory_update",
        inventoryId,
        productName,
        ownerPhone,
        prevStock: prev.stock,
        newStock: next.stock,
        prevPrice: prev.price,
        newPrice: next.price,
        prevThreshold: prev.threshold,
        newThreshold: next.threshold,
        note: note.trim(),
        performedBy: adminUid,
        createdAt: now,
      })
    ),
  ]);

  // Mirror update to subcollections (fire-and-forget)
  try {
    const invSnap = await getDoc(invRef);
    if (invSnap.exists()) {
      const d = invSnap.data() as Record<string, unknown>;
      const ownerType = String(d.ownerType ?? "retailer");
      const col = ownerType === "manufacturer" ? "manufacturers" : "retailers";
      if (ownerPhone && ownerPhone !== "—") {
        import("firebase/firestore").then(({ setDoc: sSet, doc: sDoc }) => {
          sSet(
            sDoc(db, `${col}/${ownerPhone}/inventory/${inventoryId}`),
            { stockQuantity: next.stock, sellingPrice: next.price, isAvailable: next.stock > 0, updatedAt: now },
            { merge: true }
          ).catch(() => {});
        });
      }
    }
  } catch { /* non-critical */ }
}

// ─── Row editor ───────────────────────────────────────────────────────────────

function InventoryRow({
  item,
  onSaved,
}: {
  item: InventoryItem;
  onSaved: () => void;
}) {
  const [editing,   setEditing]   = useState(false);
  const [stock,     setStock]     = useState(String(item.stockQuantity));
  const [price,     setPrice]     = useState(String(item.sellingPrice));
  const [threshold, setThreshold] = useState(String(item.reorderThreshold));
  const [note,      setNote]      = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  const reset = () => {
    setStock(String(item.stockQuantity));
    setPrice(String(item.sellingPrice));
    setThreshold(String(item.reorderThreshold));
    setNote("");
    setErr(null);
    setEditing(false);
  };

  const handleSave = async () => {
    const newStock = Number(stock);
    const newPrice = Number(price);
    const newThreshold = Number(threshold);
    if (newStock < 0)    { setErr("Stock cannot be negative."); return; }
    if (newPrice <= 0)   { setErr("Price must be greater than 0."); return; }
    if (newThreshold < 0){ setErr("Reorder threshold cannot be negative."); return; }

    setSaving(true); setErr(null);
    try {
      const adminUid = auth.currentUser?.uid ?? "admin";
      await adminUpdateInventory(
        item.inventoryId, item.productName, item.ownerPhone,
        { stock: item.stockQuantity, price: item.sellingPrice, threshold: item.reorderThreshold },
        { stock: newStock, price: newPrice, threshold: newThreshold },
        note, adminUid,
      );
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed.");
    } finally { setSaving(false); }
  };

  const stockDelta = Number(stock) - item.stockQuantity;

  return (
    <div className="border-b border-outline-variant/10 last:border-0">
      <div
        className={cn(
          "flex items-center gap-3 px-5 py-3 hover:bg-surface-container-low/40 transition-colors cursor-pointer",
          editing && "bg-primary/5",
        )}
        onClick={() => { if (!editing) setEditing(true); }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface truncate">{item.productName}</p>
          <p className="text-xs text-on-surface-variant capitalize">{item.ownerType} · {item.ownerPhone}</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-sm shrink-0">
          <span className={cn(
            "font-bold tabular-nums",
            item.stockQuantity === 0 ? "text-red-600" :
            item.stockQuantity <= item.reorderThreshold ? "text-amber-600" : "text-green-700"
          )}>
            {item.stockQuantity} units
          </span>
          <span className="text-on-surface-variant">₹{item.sellingPrice}</span>
        </div>
        {!editing && (
          <span className="shrink-0 text-xs font-semibold text-primary hover:underline">Edit</span>
        )}
      </div>

      {editing && (
        <div className="px-5 py-4 bg-surface-container-low/30 space-y-3 border-t border-outline-variant/10">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-on-surface-variant uppercase tracking-widest">
                Stock Qty
                {stockDelta !== 0 && (
                  <span className={cn(
                    "ml-1.5 font-black",
                    stockDelta > 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {stockDelta > 0 ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />}
                    {Math.abs(stockDelta)}
                  </span>
                )}
              </span>
              <input type="number" min={0} value={stock}
                onChange={e => setStock(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-on-surface-variant uppercase tracking-widest">Price (₹)</span>
              <input type="number" min={0.01} step={0.01} value={price}
                onChange={e => setPrice(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-on-surface-variant uppercase tracking-widest">Reorder At</span>
              <input type="number" min={0} value={threshold}
                onChange={e => setThreshold(e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-bold text-on-surface-variant uppercase tracking-widest">Note (optional)</span>
            <input type="text" value={note} placeholder="Reason for update, e.g. stock correction"
              onChange={e => setNote(e.target.value)}
              className="rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {err && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
              <p className="text-xs text-red-700">{err}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-xs font-bold text-on-surface hover:bg-surface-container disabled:opacity-50">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const [items,   setItems]   = useState<InventoryItem[]>([]);
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "retailer" | "manufacturer">("all");

  const load = async () => {
    setLoading(true);
    try {
      const [inv, audit] = await Promise.all([fetchAllInventory(), fetchAuditLogs()]);
      setItems(inv);
      setLogs(audit);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(item => {
    const q = search.toLowerCase();
    const matchSearch = !q || item.productName.toLowerCase().includes(q) || item.ownerPhone.includes(q);
    const matchType = typeFilter === "all" || item.ownerType === typeFilter;
    return matchSearch && matchType;
  });

  const counts = {
    all: items.length,
    retailer: items.filter(i => i.ownerType === "retailer").length,
    manufacturer: items.filter(i => i.ownerType === "manufacturer").length,
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-black text-on-surface">Inventory Management</h1>
          </div>
          <p className="text-xs text-on-surface-variant ml-7">
            View and edit stock, price, and reorder threshold for any seller's inventory. All changes are audit-logged.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-container disabled:opacity-50 shrink-0">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: "all", label: "Total", count: counts.all, color: "text-on-surface" },
          { key: "retailer", label: "Retailers", count: counts.retailer, color: "text-green-700" },
          { key: "manufacturer", label: "Manufacturers", count: counts.manufacturer, color: "text-blue-700" },
        ].map(({ key, label, count, color }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key as typeof typeFilter)}
            className={cn(
              "rounded-2xl border p-4 text-left transition-all",
              typeFilter === key
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-outline-variant/30 bg-white hover:border-outline-variant",
            )}
          >
            <p className={cn("text-3xl font-black tabular-nums", color)}>{count}</p>
            <p className="text-xs font-semibold text-on-surface-variant mt-1">{label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-white px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input type="text" placeholder="Search by product name or phone…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant outline-none" />
        {search && <button onClick={() => setSearch("")}><X className="h-3.5 w-3.5 text-on-surface-variant" /></button>}
      </div>

      {/* Inventory table */}
      <div className="rounded-2xl border border-outline-variant/30 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
          <span className="text-xs font-bold text-on-surface-variant">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-on-surface-variant">Click any row to edit</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-on-surface-variant">No inventory records found.</div>
        ) : (
          <div>
            {filtered.map(item => (
              <InventoryRow key={item.inventoryId} item={item} onSaved={load} />
            ))}
          </div>
        )}
      </div>

      {/* Audit log */}
      <div className="rounded-2xl border border-outline-variant/30 bg-white overflow-hidden">
        <button type="button" onClick={() => setShowLogs(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-container-low transition-colors">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold text-on-surface">Audit Log</p>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-black text-on-surface-variant">
              {logs.length}
            </span>
          </div>
          {showLogs ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}
        </button>

        {showLogs && (
          <div className="border-t border-outline-variant/20 max-h-[400px] overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-sm text-center text-on-surface-variant py-10">No inventory changes logged yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-container-low border-b border-outline-variant/20">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-on-surface-variant">Product</th>
                    <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-on-surface-variant">Stock</th>
                    <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-on-surface-variant">Price</th>
                    <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-on-surface-variant">Note</th>
                    <th className="px-4 py-2.5 text-left font-black uppercase tracking-widest text-on-surface-variant">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-surface-container-low/40">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-on-surface truncate max-w-[140px]">{log.productName}</p>
                        <p className="text-[10px] text-on-surface-variant">{log.ownerPhone}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-on-surface-variant">{log.prevStock}</span>
                        <span className="mx-1 text-outline-variant">→</span>
                        <span className={cn(
                          "font-bold",
                          log.newStock > log.prevStock ? "text-green-700" : log.newStock < log.prevStock ? "text-red-600" : "text-on-surface",
                        )}>{log.newStock}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {log.prevPrice !== log.newPrice ? (
                          <>
                            <span className="text-on-surface-variant line-through">₹{log.prevPrice}</span>
                            <span className="mx-1 text-outline-variant">→</span>
                            <span className="font-bold text-on-surface">₹{log.newPrice}</span>
                          </>
                        ) : (
                          <span className="text-on-surface-variant">₹{log.newPrice}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 max-w-[120px]">
                        <p className="truncate text-on-surface-variant">{log.note || "—"}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-on-surface-variant">
                        {log.createdAt?.toLocaleDateString("en-IN") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
