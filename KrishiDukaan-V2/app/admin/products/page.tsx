"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Plus, Pencil, Trash2, Search, X, ImageIcon, Upload } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { fetchMarketplaceProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct } from "../../firebase";
import type { MarketplaceProduct } from "../../../types/product";

const CATEGORIES = ["seeds", "fertilizers", "pesticides", "irrigation", "tools", "general"];
const MAX_IMAGES = 5;

type ImageSlot = { mode: "url" | "upload"; url: string; uploading: boolean; error: string };

const newSlot = (): ImageSlot => ({ mode: "url", url: "", uploading: false, error: "" });

const EMPTY_FORM = {
  name: "", fullName: "", price: "", category: "seeds",
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState<ImageSlot[]>([newSlot()]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MarketplaceProduct | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchMarketplaceProducts().then(setProducts).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || [p.name, p.category, p.store].join(" ").toLowerCase().includes(q);
    const matchCat = catFilter === "all" || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const resetForm = () => { setForm(EMPTY_FORM); setImages([newSlot()]); setEditId(null); setFormError(null); };

  const openAdd = () => { resetForm(); setShowForm(true); };
  const openEdit = (p: MarketplaceProduct) => {
    setForm({
      name: p.name, fullName: p.fullName || "", price: String(p.price), category: p.category,
      description: p.description, stock: p.stock, store: p.store, distance: p.distance,
    });
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
    if (!form.name || !form.price) { setFormError("Name and price are required."); return; }
    if (images.some(s => s.uploading)) { setFormError("Wait for image uploads to finish."); return; }
    const imageUrls = images.map(s => s.url.trim()).filter(Boolean);
    if (!imageUrls.length) { setFormError("At least one image is required."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(), fullName: form.fullName.trim() || form.name.trim(),
        price: Number(form.price), category: form.category, description: form.description.trim(),
        image: imageUrls[0], images: imageUrls,
        stock: form.stock, store: form.store.trim(), distance: form.distance.trim(),
      };
      if (editId) {
        await adminUpdateProduct(editId, payload);
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
      setProducts(prev => prev.filter(x => x.id !== p.id));
      setConfirmDelete(null);
    } catch {
      setDeleteError("Delete failed. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Box className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">Products</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9">All marketplace products. Admin can add, edit, or delete any product — no seat limits.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary-container transition-colors shrink-0">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Product</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Category</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Price</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Images</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Stock</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Store</th>
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
                        <div className="flex items-center justify-end gap-2">
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
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-on-surface-variant">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-surface-container shrink-0">
              <h2 className="text-lg font-bold text-on-surface">{editId ? "Edit Product" : "Add Product"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-surface-container transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSave} className="overflow-y-auto p-6 space-y-4 flex-1">
              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">{formError}</div>
              )}

              {/* Text fields */}
              {[
                { label: "Product Name *", key: "name", placeholder: "e.g. Organic Urea" },
                { label: "Full Name", key: "fullName", placeholder: "Extended product name" },
                { label: "Price (₹) *", key: "price", placeholder: "e.g. 450", type: "number" },
                { label: "Store Name", key: "store", placeholder: "e.g. Sharma Agro Store" },
                { label: "Distance", key: "distance", placeholder: "e.g. 2.3 km" },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">{label}</label>
                  <input type={type || "text"} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
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

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Stock Status</label>
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
                <div className="grid grid-cols-2 gap-3">
                  {images.map((slot, i) => (
                    <ImageCard key={i} slot={slot} index={i}
                      onChange={patch => updateSlot(i, patch)}
                      onClear={() => clearSlot(i)} />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
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
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
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
            <div className="flex gap-3 pt-2">
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
    </div>
  );
}
