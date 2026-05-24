"use client";

import { useEffect, useState } from "react";
import { Box, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { fetchMarketplaceProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct } from "../../firebase";
import type { MarketplaceProduct } from "../../../types/product";

const EMPTY_FORM = {
  name: "", fullName: "", price: "", category: "seeds",
  description: "", image: "", stock: "In Stock", store: "", distance: "Nearby",
};

const CATEGORIES = ["seeds", "fertilizers", "pesticides", "irrigation", "tools", "general"];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
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

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setFormError(null); setShowForm(true); };
  const openEdit = (p: MarketplaceProduct) => {
    setForm({
      name: p.name, fullName: p.fullName || "", price: String(p.price), category: p.category,
      description: p.description, image: p.image, stock: p.stock, store: p.store, distance: p.distance,
    });
    setEditId(p.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.image) {
      setFormError("Name, price, and image URL are required."); return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(), fullName: form.fullName.trim() || form.name.trim(),
        price: Number(form.price), category: form.category, description: form.description.trim(),
        image: form.image.trim(), stock: form.stock, store: form.store.trim(), distance: form.distance.trim(),
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

      {/* Filters */}
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
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Stock</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Store</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-surface-container shrink-0">
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
                      <span className={`text-xs font-bold ${p.stock === "In Stock" ? "text-green-600" : p.stock === "Low Stock" ? "text-harvest" : "text-red-500"}`}>{p.stock}</span>
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
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-on-surface-variant">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-surface-container">
              <h2 className="text-lg font-bold text-on-surface">{editId ? "Edit Product" : "Add Product"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-surface-container transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">
                  {formError}
                </div>
              )}
              {[
                { label: "Product Name *", key: "name", placeholder: "e.g. Organic Urea" },
                { label: "Full Name", key: "fullName", placeholder: "Extended product name" },
                { label: "Price (₹) *", key: "price", placeholder: "e.g. 450", type: "number" },
                { label: "Image URL *", key: "image", placeholder: "https://..." },
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 backdrop-blur-sm p-4">
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
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => { setConfirmDelete(null); setDeleteError(null); }} 
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => performDelete(confirmDelete)} 
                disabled={deleting === confirmDelete.id}
                className="flex-1 py-3 bg-red-600 text-white text-sm font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting === confirmDelete.id ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
