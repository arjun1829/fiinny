"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Plus, Pencil, Trash2, Search, X, ImageIcon, Upload, Link2, Loader2, Check, Store, Users } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, auth, fetchAllProductsForAdmin, fetchAllSellerProducts, fetchInventoryForProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct, adminAssignProductToSeller, adminRemoveAssignment, adminUpdateAssignmentPricing, fetchAllUsers } from "../../firebase";
import type { MarketplaceProduct } from "../../../types/product";
import { cn } from "../../dashboard/_lib/cn";
import { PackSizesEditor, variantsToRows, parseVariantsForSave, emptyVariant, type Variant } from "../_components/pack-sizes-editor";

const CATEGORIES = ["seeds", "fertilizers", "pesticides", "irrigation", "tools", "general"];
const MAX_IMAGES = 5;

type ImageSlot = { mode: "url" | "upload"; url: string; uploading: boolean; error: string };

const newSlot = (): ImageSlot => ({ mode: "url", url: "", uploading: false, error: "" });

const EMPTY_FORM = {
  name: "", fullName: "", category: "seeds",
  description: "", stock: "In Stock", store: "", distance: "Nearby",
};

function ImageCard({ slot, index, onChange, onClear }: {
  slot: ImageSlot; index: number;
  onChange: (p: Partial<ImageSlot>) => void; onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { onChange({ error: "Select an image file." }); return; }
    onChange({ uploading: true, error: "" });
    try {
      const path = `product-images/admin-${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const snap = await uploadBytes(storageRef(storage, path), file);
      onChange({ url: await getDownloadURL(snap.ref), uploading: false });
    } catch {
      onChange({ uploading: false, error: "Upload failed. Paste URL instead." });
    }
  };

  return (
    <div className={`flex flex-col rounded-2xl border-2 overflow-hidden transition-colors ${
      slot.url ? "border-primary/20 bg-surface-container-low" : "border-dashed border-outline-variant/40 bg-surface-container-low/50 hover:border-primary/40"
    }`}>
      {slot.url ? (
        <div className="relative">
          <img src={slot.url} alt="" className="h-28 w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <button type="button" onClick={onClear}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-500 transition-colors">
            <X className="h-3 w-3" />
          </button>
          {index === 0 && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-white">Main</span>
          )}
        </div>
      ) : (
        <div className="flex h-28 flex-col items-center justify-center gap-1 text-on-surface-variant/50">
          <ImageIcon className="h-7 w-7" />
          <span className="text-[10px]">{index === 0 ? "Main image" : `Image ${index + 1}`}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex rounded-lg border border-outline-variant/30 text-[11px] overflow-hidden">
          {(["url", "upload"] as const).map((m) => (
            <button key={m} type="button"
              onClick={() => onChange({ mode: m, error: "" })}
              className={`flex-1 py-1 font-semibold transition-colors ${slot.mode === m ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
              {m === "url" ? "URL" : "Upload"}
            </button>
          ))}
        </div>

        {slot.mode === "url" ? (
          <input
            type="url"
            value={slot.url}
            onChange={e => onChange({ url: e.target.value, error: "" })}
            placeholder="https://…"
            className="w-full rounded-lg border border-outline-variant/30 bg-white px-2 py-1 text-[11px] focus:border-primary focus:outline-none"
          />
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={slot.uploading}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant/30 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50 transition-colors">
              {slot.uploading ? (
                <><div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Uploading…</>
              ) : (
                <><Upload className="h-3 w-3" /> Choose file</>
              )}
            </button>
          </>
        )}

        {slot.error && <p className="text-[10px] text-red-500">{slot.error}</p>}
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [variants, setVariants] = useState<Variant[]>([emptyVariant()]);
  const [images, setImages] = useState<ImageSlot[]>([newSlot()]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MarketplaceProduct | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Assign to seller
  const [assignTarget, setAssignTarget] = useState<MarketplaceProduct | null>(null);
  const [sellers, setSellers] = useState<{ id: string; name: string; phone: string; role: string; city: string; isPreCreated: boolean }[]>([]);
  const [sellersLoaded, setSellersLoaded] = useState(false);
  const [sellerSearch, setSellerSearch] = useState("");
  const [assigningSeller, setAssigningSeller] = useState<string | null>(null);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [assignOk, setAssignOk] = useState<string | null>(null);

  const loadSellers = async () => {
    if (sellersLoaded) return;
    const users = await fetchAllUsers();
    setSellers(
      users
        .filter(u => u.role === "retailer" || u.role === "manufacturer")
        .map(u => ({
          id: u.id,
          name: u.shopName || u.businessName || u.name || u.phone || u.id,
          phone: u.phone || u.id,
          role: u.role,
          city: u.city || "",
          isPreCreated: !!u.preCreatedByAdmin && !u.uid,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
    );
    setSellersLoaded(true);
  };

  const handleAssignToSeller = async (seller: { id: string; name: string; phone: string; role: string }) => {
    if (!assignTarget) return;
    setAssigningSeller(seller.id);
    setAssignErr(null);
    setAssignOk(null);
    try {
      const adminUid = auth.currentUser?.uid ?? "admin";
      const role = seller.role === "manufacturer" ? "manufacturer" : "retailer";
      const res = await adminAssignProductToSeller(
        assignTarget.id, assignTarget.name, seller.phone, seller.name, role, adminUid,
      );
      if (res.alreadyAssigned) setAssignErr(`"${assignTarget.name}" is already assigned to ${seller.name}.`);
      else setAssignOk(`Assigned to ${seller.name}`);
    } catch (e) {
      setAssignErr(e instanceof Error ? e.message : "Assignment failed.");
    } finally { setAssigningSeller(null); }
  };

  const load = () => {
    setLoading(true);
    Promise.all([fetchAllProductsForAdmin(), fetchAllSellerProducts().catch(() => [])])
      .then(([prods, raw]) => { setProducts(prods); setRawProducts(raw); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Map of base product id → active admin-assigned seller copies.
  const assignmentsByOriginal = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const d of rawProducts) {
      if (d.source !== "admin_assigned" || d.isActive === false) continue;
      const key = String(d.originalProductId || "");
      if (!key) continue;
      const arr = m.get(key) ?? [];
      arr.push(d);
      m.set(key, arr);
    }
    return m;
  }, [rawProducts]);

  // ── Assignments viewer (which sellers carry a product) ──
  const [viewAssignmentsFor, setViewAssignmentsFor] = useState<MarketplaceProduct | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<{ copyId: string; store: string; phone: string; role: string; active: boolean; price: string; stock: string }[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [removingRow, setRemovingRow] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<string | null>(null);

  const openAssignments = async (p: MarketplaceProduct) => {
    setViewAssignmentsFor(p);
    setAssignmentRows([]);
    setRowMsg(null);
    setAssignmentsLoading(true);
    try {
      const docIds = (p as any).allDocIds || [p.id];
      const copies: any[] = [];
      for (const docId of docIds) {
        copies.push(...(assignmentsByOriginal.get(docId) ?? []));
      }
      const inv = await fetchInventoryForProducts(copies.map(c => c.id)).catch(() => ({}));
      setAssignmentRows(copies.map(c => {
        const iv = (inv as any)[c.id];
        return {
          copyId: c.id,
          store: c.store || c.ownerId || "—",
          phone: c.ownerId || c.ownerPhone || c.retailerPhone || "",
          role: c.ownerType || "retailer",
          active: c.isActive !== false,
          price: String(iv?.sellingPrice ?? c.price ?? ""),
          stock: String(iv?.stockQuantity ?? ""),
          variants: c.variants || [],
        };
      }));
    } finally { setAssignmentsLoading(false); }
  };

  const setRowField = (copyId: string, field: "price" | "stock", val: string) =>
    setAssignmentRows(prev => prev.map(r => r.copyId === copyId ? { ...r, [field]: val } : r));

  const setRowVariantField = (copyId: string, variantIndex: number, field: "price" | "stock", val: string) => {
    setAssignmentRows(prev => prev.map(r => {
      if (r.copyId !== copyId) return r;
      const nextVariants = [...(r.variants || [])];
      if (nextVariants[variantIndex]) {
        nextVariants[variantIndex] = {
          ...nextVariants[variantIndex],
          [field]: field === "price" ? (Number(val) || 0) : (Number(val) || 0)
        };
      }
      return { ...r, variants: nextVariants };
    }));
  };

  const saveAssignmentRow = async (row: typeof assignmentRows[number]) => {
    setSavingRow(row.copyId); setRowMsg(null);
    try {
      await adminUpdateAssignmentPricing(row.copyId, {
        sellingPrice: Number(row.price) || 0,
        stockQuantity: Number(row.stock) || 0,
        variants: row.variants,
      });
      await load();
      setRowMsg(`Saved ${row.store}.`);
    } catch (e) {
      setRowMsg(e instanceof Error ? e.message : "Save failed.");
    } finally { setSavingRow(null); }
  };

  const [confirmRemoveAssignment, setConfirmRemoveAssignment] = useState<any | null>(null);

  const removeAssignmentRow = (row: typeof assignmentRows[number]) => {
    setConfirmRemoveAssignment(row);
  };

  const performRemoveAssignment = async () => {
    if (!viewAssignmentsFor || !confirmRemoveAssignment) return;
    const row = confirmRemoveAssignment;
    setConfirmRemoveAssignment(null);
    setRemovingRow(row.copyId); setRowMsg(null);
    try {
      const adminUid = auth.currentUser?.uid ?? "admin";
      await adminRemoveAssignment(row.copyId, viewAssignmentsFor.name, row.phone, adminUid);
      setAssignmentRows(prev => prev.filter(r => r.copyId !== row.copyId));
      await load();
      setRowMsg(`Removed ${row.store}.`);
    } catch (e) {
      setRowMsg(e instanceof Error ? e.message : "Remove failed.");
    } finally { setRemovingRow(null); }
  };

  // Seller-owned copies are surfaced via the "Assigned" column on their base
  // product, so exclude them from the main catalog list to avoid duplicate rows.
  const COPY_SOURCES = new Set(["admin_assigned", "retailer_inventory_copy", "manufacturer_assigned"]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, MarketplaceProduct[]>();
    for (const p of products) {
      if (COPY_SOURCES.has((p as any).source)) continue;
      const key = p.name.toLowerCase().trim();
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }

    const result: MarketplaceProduct[] = [];
    for (const [key, list] of Array.from(groups.entries())) {
      // Find canonical one in group: prefer manufacturer_inventory, then admin, then retailer_inventory
      const canonical = list.find(p => p.source === 'manufacturer_inventory')
        || list.find(p => p.source === 'admin')
        || list[0];

      // Merge all variants from all docs in the list
      const mergedVariants: any[] = [];
      const seenVariantKeys = new Set<string>();

      for (const p of list) {
        if (p.variants && p.variants.length > 0) {
          for (const v of p.variants) {
            const vKey = `${v.unit}-${v.price}`;
            if (!seenVariantKeys.has(vKey)) {
              seenVariantKeys.add(vKey);
              mergedVariants.push(v);
            }
          }
        } else {
          // If no variants array, treat the product itself as a variant
          const unit = (p as any).unit || p.stock || "Standard";
          const vKey = `${unit}-${p.price}`;
          if (!seenVariantKeys.has(vKey)) {
            seenVariantKeys.add(vKey);
            mergedVariants.push({
              unit,
              price: p.price,
              stock: p.stock === 'Out of Stock' ? 0 : 50
            });
          }
        }
      }

      const allDocIds = list.map(p => p.id);

      result.push({
        ...canonical,
        variants: mergedVariants,
        allDocIds,
      } as any);
    }
    return result;
  }, [products]);

  const filtered = useMemo(() => {
    return groupedProducts.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || [p.name, p.category, p.store].join(" ").toLowerCase().includes(q);
      const matchCat = catFilter === "all" || p.category === catFilter;
      return matchSearch && matchCat;
    });
  }, [groupedProducts, search, catFilter]);

  const resetForm = () => { setForm(EMPTY_FORM); setVariants([emptyVariant()]); setImages([newSlot()]); setEditId(null); setFormError(null); };

  const openAdd = () => { resetForm(); setShowForm(true); };
  const openEdit = (p: MarketplaceProduct) => {
    setForm({
      name: p.name, fullName: p.fullName || "", category: p.category,
      description: p.description, stock: p.stock, store: p.store, distance: p.distance,
    });
    setVariants(variantsToRows((p as any).variants, { unit: (p as any).unit, price: p.price }));
    const urls: string[] = (p as any).images?.length ? (p as any).images : (p.image ? [p.image] : []);
    setImages(urls.length ? urls.map(u => ({ mode: "url" as const, url: u, uploading: false, error: "" })) : [newSlot()]);
    setEditId(p.id);
    setFormError(null);
    setShowForm(true);
  };

  const updateSlot = (i: number, patch: Partial<ImageSlot>) =>
    setImages(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const clearSlot = (i: number) =>
    setImages(prev => prev.length === 1 ? [newSlot()] : prev.filter((_, idx) => idx !== i));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { setFormError("Product name is required."); return; }
    const parsed = parseVariantsForSave(variants);
    if (!parsed.ok) { setFormError(parsed.error); return; }
    if (images.some(s => s.uploading)) { setFormError("Wait for image uploads to finish."); return; }
    const imageUrls = images.map(s => s.url.trim()).filter(Boolean);
    if (!imageUrls.length) { setFormError("At least one image is required."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(), fullName: form.fullName.trim() || form.name.trim(),
        price: parsed.variants[0].price, unit: parsed.variants[0].unit, variants: parsed.variants,
        category: form.category, description: form.description.trim(),
        image: imageUrls[0], images: imageUrls,
        stock: form.stock, store: form.store.trim(), distance: form.distance.trim(),
      };
      if (editId) {
        await adminUpdateProduct(editId, payload);
        // Deactivate other duplicates in Firestore if any exist
        const originalProduct = products.find(p => p.id === editId);
        if (originalProduct) {
          const docIds = (originalProduct as any).allDocIds || [];
          const otherDocIds = docIds.filter((id: string) => id !== editId);
          if (otherDocIds.length > 0) {
            const { writeBatch, doc, serverTimestamp } = await import("firebase/firestore");
            const { db: fdb } = await import("../../firebase");
            const batch = writeBatch(fdb);
            otherDocIds.forEach((id: string) => {
              batch.update(doc(fdb, 'products', id), { isActive: false, updatedAt: serverTimestamp() });
            });
            // Update any copy products linked to the deactivated duplicates
            const otherDocIdsSet = new Set(otherDocIds);
            const copyProductsToUpdate = rawProducts.filter(
              (rp) => rp.source === "admin_assigned" && otherDocIdsSet.has(rp.originalProductId)
            );
            copyProductsToUpdate.forEach((cp) => {
              batch.update(doc(fdb, 'products', cp.id), { originalProductId: editId });
            });
            await batch.commit().catch(err => console.error("Failed to deactivate duplicates:", err));
          }
        }
      } else {
        await adminCreateProduct(payload as any);
      }
      await load();
      setShowForm(false);
    } catch (err) {
      console.error(err);
      setFormError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async (p: MarketplaceProduct) => {
    setDeleting(p.id);
    setDeleteError(null);
    try {
      await adminDeleteProduct(p.id);
      const docIds = (p as any).allDocIds || [p.id];
      const otherDocIds = docIds.filter((id: string) => id !== p.id);
      if (otherDocIds.length > 0) {
        const { writeBatch, doc } = await import("firebase/firestore");
        const { db: fdb } = await import("../../firebase");
        const batch = writeBatch(fdb);
        otherDocIds.forEach((id: string) => {
          batch.delete(doc(fdb, 'products', id));
        });
        await batch.commit().catch(err => console.error("Failed to delete duplicate docs:", err));
      }
      setProducts(prev => prev.filter(x => !docIds.includes(x.id)));
      setConfirmDelete(null);
    } catch {
      setDeleteError("Delete failed. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 sm:gap-3">
            <Box className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            <h1 className="text-lg font-black text-on-surface sm:text-2xl">Products</h1>
          </div>
          <p className="ml-7 text-xs text-on-surface-variant sm:ml-9 sm:text-sm">All marketplace products. Admin can add, edit, or delete any product.</p>
        </div>
        <button onClick={openAdd} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-container sm:w-auto shrink-0">
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${catFilter === c ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input type="text" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant" />
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Product</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Category</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Price</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Images</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Stock</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Store</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Assigned</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const imgs: string[] = (p as any).images?.length ? (p as any).images : (p.image ? [p.image] : []);
                  return (
                    <tr key={p.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-surface-container shrink-0 relative">
                            {imgs[0] ? (
                              <img src={imgs[0]} alt={p.name} className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-on-surface-variant/30">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-on-surface">{p.name}</p>
                            <p className="text-xs text-on-surface-variant truncate max-w-[160px]">{p.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[10px] font-black uppercase">{p.category}</span>
                      </td>
                      <td className="px-5 py-3 font-bold text-on-surface">₹{p.price}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          {imgs.slice(0, 3).map((url, i) => (
                            <div key={i} className="w-7 h-7 rounded-lg overflow-hidden bg-surface-container border border-outline-variant/20">
                              <img src={url} alt="" className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </div>
                          ))}
                          {imgs.length > 3 && (
                            <span className="text-[10px] font-bold text-on-surface-variant">+{imgs.length - 3}</span>
                          )}
                          {imgs.length === 0 && <span className="text-xs text-on-surface-variant/50">—</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold ${p.stock === "In Stock" ? "text-green-600" : p.stock === "Low Stock" ? "text-yellow-600" : "text-red-500"}`}>{p.stock}</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-on-surface-variant">{p.store}</td>
                      <td className="px-5 py-3">
                        {(() => {
                          const docIds = (p as any).allDocIds || [p.id];
                          const n = docIds.reduce((sum: number, docId: string) => sum + (assignmentsByOriginal.get(docId) ?? []).length, 0);
                          return n > 0 ? (
                            <button onClick={() => openAssignments(p)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-secondary/10 px-2.5 py-1 text-xs font-bold text-secondary hover:bg-secondary/20 transition-colors">
                              <Users className="h-3.5 w-3.5" /> {n} seller{n !== 1 ? "s" : ""}
                            </button>
                          ) : <span className="text-xs text-on-surface-variant/50">—</span>;
                        })()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setAssignTarget(p); setAssignErr(null); setAssignOk(null); setSellerSearch(""); loadSellers(); }}
                            className="p-1.5 rounded-lg hover:bg-secondary/10 text-on-surface-variant hover:text-secondary transition-colors" title="Assign to seller">
                            <Link2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setConfirmDelete(p); setDeleteError(null); }} disabled={deleting === p.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-variant hover:text-red-600 transition-colors disabled:opacity-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-on-surface-variant">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-outline-variant/10 md:hidden">
            {filtered.map(p => {
              const imgs: string[] = (p as any).images?.length ? (p as any).images : (p.image ? [p.image] : []);
              return (
                <div key={p.id} className="space-y-3 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-container">
                      {imgs[0] ? (
                        <img src={imgs[0]} alt={p.name} className="h-full w-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-on-surface-variant/30">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-on-surface">{p.name}</p>
                      <p className="mt-0.5 text-[11px] text-on-surface-variant">{p.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-black uppercase text-on-surface-variant">{p.category}</span>
                        <span className="text-sm font-bold text-on-surface">₹{p.price}</span>
                        <span className={`text-[11px] font-bold ${p.stock === "In Stock" ? "text-green-600" : p.stock === "Low Stock" ? "text-yellow-600" : "text-red-500"}`}>{p.stock}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-on-surface-variant">{p.store || "—"}</p>
                      {(() => {
                        const docIds = (p as any).allDocIds || [p.id];
                        const n = docIds.reduce((sum: number, docId: string) => sum + (assignmentsByOriginal.get(docId) ?? []).length, 0);
                        return n > 0 ? (
                          <button onClick={() => openAssignments(p)} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-secondary">
                            <Users className="h-3 w-3" /> {n} seller{n !== 1 ? "s" : ""}
                          </button>
                        ) : <p className="text-[11px] text-on-surface-variant">{imgs.length} image{imgs.length !== 1 ? "s" : ""}</p>;
                      })()}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setAssignTarget(p); setAssignErr(null); setAssignOk(null); setSellerSearch(""); loadSellers(); }}
                        className="rounded-lg border border-secondary/30 px-2.5 py-1.5 text-[11px] font-medium text-secondary hover:bg-secondary/5 transition-colors">
                        Assign
                      </button>
                      <button onClick={() => openEdit(p)} className="rounded-lg border border-outline-variant/30 px-2.5 py-1.5 text-[11px] font-medium text-on-surface hover:bg-surface-container transition-colors">
                        Edit
                      </button>
                      <button onClick={() => { setConfirmDelete(p); setDeleteError(null); }} disabled={deleting === p.id}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-on-surface-variant">No products found.</div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-64px)] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-surface-container p-5 shrink-0 sm:p-6">
              <h2 className="text-lg font-bold text-on-surface">{editId ? "Edit Product" : "Add Product"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-surface-container transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSave} className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">{formError}</div>
              )}

              {/* Text fields */}
              {[
                { label: "Product Name *", key: "name", placeholder: "e.g. Organic Urea" },
                { label: "Full Name", key: "fullName", placeholder: "Extended product name" },
                { label: "Store Name", key: "store", placeholder: "e.g. Sharma Agro Store" },
                { label: "Distance", key: "distance", placeholder: "e.g. 2.3 km" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              ))}

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>

              {/* Pack sizes & prices */}
              <PackSizesEditor variants={variants} onChange={setVariants} disabled={saving} />

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Overall Stock Status</label>
                <select value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                  className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none">
                  {["In Stock", "Low Stock", "Out of Stock"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Product description…"
                  className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none" />
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant">Images * (up to {MAX_IMAGES})</label>
                  {images.length < MAX_IMAGES && (
                    <button type="button" onClick={() => setImages(p => [...p, newSlot()])}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add image
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {images.map((slot, i) => (
                    <ImageCard key={i} slot={slot} index={i}
                      onChange={patch => updateSlot(i, patch)}
                      onClear={() => clearSlot(i)} />
                  ))}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                  {saving ? "Saving…" : editId ? "Save Changes" : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mb-4">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-on-surface">Delete Product</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                Are you sure you want to delete <span className="font-semibold text-on-surface">&quot;{confirmDelete.name}&quot;</span>? This action cannot be undone.
              </p>
            </div>
            {deleteError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">{deleteError}</div>
            )}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button type="button" onClick={() => { setConfirmDelete(null); setDeleteError(null); }} disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={() => performDelete(confirmDelete)} disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting === confirmDelete.id ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting…</>
                ) : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Assign to Seller Modal ─────────────────────────────────────────── */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-on-surface/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl max-h-[90dvh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="h-5 w-5 text-secondary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">Assign Product</p>
                  <p className="text-xs text-on-surface-variant truncate">{assignTarget.name}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setAssignTarget(null); setAssignErr(null); setAssignOk(null); }}
                className="p-2 rounded-xl hover:bg-surface-container shrink-0"><X className="h-5 w-5" /></button>
            </div>

            {/* Search */}
            <div className="px-5 pt-4 pb-2 shrink-0">
              {assignErr && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-medium">{assignErr}</div>
              )}
              {assignOk && (
                <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 shrink-0" />{assignOk}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-outline" />
                <input type="text" placeholder="Search by name or phone…"
                  value={sellerSearch} onChange={e => setSellerSearch(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low pl-9 pr-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Seller list */}
            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/10 px-2 pb-4">
              {!sellersLoaded ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sellers.filter(s => {
                  const q = sellerSearch.toLowerCase();
                  return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
                }).length === 0 ? (
                <p className="text-sm text-center text-on-surface-variant py-10">
                  No sellers found. Create one in <strong>Users &amp; Roles</strong> first.
                </p>
              ) : sellers
                  .filter(s => {
                    const q = sellerSearch.toLowerCase();
                    return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
                  })
                  .map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-3 hover:bg-surface-container-low rounded-xl transition-colors">
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      s.role === "manufacturer" ? "bg-blue-500" : "bg-green-500",
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-on-surface truncate">{s.name}</p>
                        {s.isPreCreated && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-100 text-amber-700 shrink-0">OTP pending</span>
                        )}
                      </div>
                      <p className="text-[10px] text-on-surface-variant font-mono">{s.phone}</p>
                      {s.city && <p className="text-[10px] text-on-surface-variant">{s.city}</p>}
                    </div>
                    <span className={cn(
                      "shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase",
                      s.role === "manufacturer" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700",
                    )}>{s.role}</span>
                    <button
                      type="button"
                      disabled={assigningSeller === s.id}
                      onClick={() => handleAssignToSeller(s)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      {assigningSeller === s.id
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Assigning…</>
                        : <><Link2 className="h-3.5 w-3.5" /> Assign</>
                      }
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Assignments Viewer (who carries this product) ──────────────────── */}
      {viewAssignmentsFor && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-end justify-center bg-on-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-64px)] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Store className="h-5 w-5 text-secondary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">Assigned sellers</p>
                  <p className="text-xs text-on-surface-variant truncate">{viewAssignmentsFor.name}</p>
                </div>
              </div>
              <button type="button" onClick={() => setViewAssignmentsFor(null)}
                className="p-2 rounded-xl hover:bg-surface-container shrink-0"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {rowMsg && (
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs font-medium text-on-surface-variant">{rowMsg}</div>
              )}
              {assignmentsLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : assignmentRows.length === 0 ? (
                <p className="text-sm text-center text-on-surface-variant py-10">Not assigned to any seller yet.</p>
              ) : assignmentRows.map(row => (
                <div key={row.copyId} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-on-surface truncate">{row.store}</p>
                        <span className={cn(
                          "shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase",
                          row.role === "manufacturer" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700",
                        )}>{row.role}</span>
                      </div>
                      <p className="text-[10px] text-on-surface-variant font-mono">{row.phone}</p>
                    </div>
                    <button type="button" onClick={() => removeAssignmentRow(row)} disabled={removingRow === row.copyId}
                      className="shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50" title="Remove assignment">
                      {removingRow === row.copyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                  {row.variants && row.variants.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Variants Pricing & Stock:</p>
                      {row.variants.map((v: any, vIdx: number) => (
                        <div key={vIdx} className="flex items-center gap-2 bg-surface-container-low/50 p-2 rounded-xl border border-outline-variant/20">
                          <span className="text-xs font-semibold text-on-surface w-20 truncate">{v.unit}</span>
                          <label className="flex items-center gap-1 text-xs flex-1">
                            <span className="font-medium text-on-surface-variant">Price:</span>
                            <input type="number" min={0} value={v.price}
                              onChange={e => setRowVariantField(row.copyId, vIdx, "price", e.target.value)}
                              className="w-full rounded-lg border border-outline-variant/30 bg-white px-2 py-1 text-xs outline-none focus:border-primary" />
                          </label>
                          <label className="flex items-center gap-1 text-xs flex-1">
                            <span className="font-medium text-on-surface-variant">Stock:</span>
                            <input type="number" min={0} value={v.stock !== undefined ? v.stock : ""}
                              onChange={e => setRowVariantField(row.copyId, vIdx, "stock", e.target.value)}
                              className="w-full rounded-lg border border-outline-variant/30 bg-white px-2 py-1 text-xs text-center outline-none focus:border-primary" />
                          </label>
                        </div>
                      ))}
                      <div className="flex justify-end pt-1">
                        <button type="button" onClick={() => saveAssignmentRow(row)} disabled={savingRow === row.copyId}
                          className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all">
                          {savingRow === row.copyId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Variants"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <label className="flex flex-col gap-1 text-xs flex-1">
                        <span className="font-medium text-on-surface-variant">Price (₹)</span>
                        <input type="number" min={0} value={row.price}
                          onChange={e => setRowField(row.copyId, "price", e.target.value)}
                          className="w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs flex-1">
                        <span className="font-medium text-on-surface-variant">Stock Qty</span>
                        <input type="number" min={0} value={row.stock}
                          onChange={e => setRowField(row.copyId, "stock", e.target.value)}
                          className="w-full rounded-xl border border-outline-variant/40 bg-white px-3 py-2 text-sm text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                      </label>
                      <button type="button" onClick={() => saveAssignmentRow(row)} disabled={savingRow === row.copyId}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all">
                        {savingRow === row.copyId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Remove Assignment Confirmation Modal */}
      {confirmRemoveAssignment && viewAssignmentsFor && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-[60] flex items-end justify-center bg-on-surface/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 text-red-600 mb-4">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-on-surface">Remove Assignment</h3>
              <p className="text-sm text-on-surface-variant mt-2">
                Are you sure you want to remove <span className="font-semibold text-on-surface">&quot;{viewAssignmentsFor.name}&quot;</span> from <span className="font-semibold text-on-surface">{confirmRemoveAssignment.store}</span>?
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button type="button" onClick={() => setConfirmRemoveAssignment(null)}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button type="button" onClick={performRemoveAssignment}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
