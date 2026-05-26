"use client";

import { useEffect, useState } from "react";
import { Layers, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react";
import { fetchHubs, saveHub, updateHub, deleteHub, importHubs } from "../../firebase";
import type { Hub } from "../../firebase";
import { INITIAL_HUBS } from "../../initialHubs";

type HubForm = {
  name: string;
  tagline: string;
  heroImage: string;
  iconImage: string;
  seeds: { name: string; price: string; img: string }[];
  nutrition: { name: string; desc: string; icon: string }[];
  irrigationImage: string;
  irrigationItems: { name: string; price: string }[];
  advisoryTitle: string;
  advisoryDescription: string;
  growthStages: { phase: string; duration: string; description: string; products: string }[];
  commonMistakes: string[];
  idealClimate: string;
  soilType: string;
  waterNeeds: string;
  bestSeason: string;
};

const EMPTY_FORM: HubForm = {
  name: "", tagline: "", heroImage: "", iconImage: "",
  seeds: [{ name: "", price: "", img: "" }],
  nutrition: [{ name: "", desc: "", icon: "Sprout" }],
  irrigationImage: "",
  irrigationItems: [{ name: "", price: "" }],
  advisoryTitle: "", advisoryDescription: "",
  growthStages: [{ phase: "", duration: "", description: "", products: "" }],
  commonMistakes: [""],
  idealClimate: "", soilType: "", waterNeeds: "", bestSeason: "",
};

const ICON_OPTIONS = ["Sprout", "Water", "Science", "Check"];

function formToHub(f: HubForm): Omit<Hub, "id"> {
  return {
    name: f.name.trim(),
    tagline: f.tagline.trim(),
    heroImage: f.heroImage.trim(),
    iconImage: f.iconImage.trim() || undefined,
    seeds: f.seeds.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), price: Number(s.price) || 0, img: s.img.trim() })),
    nutrition: f.nutrition.filter(n => n.name.trim()).map(n => ({ name: n.name.trim(), desc: n.desc.trim(), icon: n.icon })),
    irrigation: {
      image: f.irrigationImage.trim(),
      items: f.irrigationItems.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), price: i.price.trim() })),
    },
    advisory: { title: f.advisoryTitle.trim(), description: f.advisoryDescription.trim() },
    growthStages: f.growthStages.filter(s => s.phase.trim()).map(s => ({
      phase: s.phase.trim(),
      duration: s.duration.trim(),
      description: s.description.trim(),
      products: s.products.split(",").map(p => p.trim()).filter(Boolean)
    })),
    commonMistakes: f.commonMistakes.map(m => m.trim()).filter(Boolean),
    idealClimate: f.idealClimate.trim(),
    soilType: f.soilType.trim(),
    waterNeeds: f.waterNeeds.trim(),
    bestSeason: f.bestSeason.trim(),
  };
}

function hubToForm(h: Hub): HubForm {
  return {
    name: h.name, tagline: h.tagline, heroImage: h.heroImage,
    iconImage: h.iconImage || "",
    seeds: h.seeds.length ? h.seeds.map(s => ({ name: s.name, price: String(s.price), img: s.img })) : [{ name: "", price: "", img: "" }],
    nutrition: h.nutrition.length ? h.nutrition.map(n => ({ name: n.name, desc: n.desc, icon: n.icon })) : [{ name: "", desc: "", icon: "Sprout" }],
    irrigationImage: h.irrigation.image,
    irrigationItems: h.irrigation.items.length ? h.irrigation.items.map(i => ({ name: i.name, price: i.price })) : [{ name: "", price: "" }],
    advisoryTitle: h.advisory.title, advisoryDescription: h.advisory.description,
    growthStages: h.growthStages?.length 
      ? h.growthStages.map(s => ({ phase: s.phase, duration: s.duration, description: s.description, products: s.products.join(", ") }))
      : [{ phase: "", duration: "", description: "", products: "" }],
    commonMistakes: h.commonMistakes?.length ? h.commonMistakes : [""],
    idealClimate: h.idealClimate || "",
    soilType: h.soilType || "",
    waterNeeds: h.waterNeeds || "",
    bestSeason: h.bestSeason || "",
  };
}

function ArrayField<T extends Record<string, string>>({
  label, items, onChange, fields, addLabel,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  fields: { key: keyof T; placeholder: string; type?: "select"; options?: string[] }[];
  addLabel: string;
}) {
  const blank = Object.fromEntries(fields.map(f => [f.key, ""])) as T;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">{label}</label>
        <button type="button" onClick={() => onChange([...items, { ...blank }])}
          className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-start">
            {fields.map(f => (
              f.type === "select" ? (
                <select key={String(f.key)} value={String(item[f.key])}
                  onChange={e => { const n = [...items]; n[i] = { ...n[i], [f.key]: e.target.value }; onChange(n); }}
                  className="rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input key={String(f.key)} type="text" value={String(item[f.key])} placeholder={f.placeholder}
                  onChange={e => { const n = [...items]; n[i] = { ...n[i], [f.key]: e.target.value }; onChange(n); }}
                  className="flex-1 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20" />
              )
            ))}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="p-2 text-on-surface-variant hover:text-red-500 transition-colors shrink-0 mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminHubsPage() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<HubForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedHub, setExpandedHub] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchHubs()
      .then(setHubs)
      .catch(err => {
        console.error("Failed to fetch hubs:", err);
        setError("Failed to load hubs from Firebase. Please make sure you are logged in and have admin permissions.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); };
  const openEdit = (h: Hub) => { setForm(hubToForm(h)); setEditId(h.id); setShowForm(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.tagline.trim()) {
      alert("Hub name and tagline are required."); return;
    }
    setSaving(true);
    try {
      const payload = formToHub(form);
      if (editId) {
        await updateHub(editId, payload);
      } else {
        await saveHub(payload);
      }
      await load();
      setShowForm(false);
    } catch (err) {
      console.error(err);
      alert("Save failed. Check console.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: Hub) => {
    if (!confirm(`Delete "${h.name} Hub"? This removes it from the platform.`)) return;
    setDeleting(h.id);
    try {
      await deleteHub(h.id);
      setHubs(prev => prev.filter(x => x.id !== h.id));
    } catch {
      alert("Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const handleImportDefaults = async () => {
    if (!confirm("This will write the 10 default crop hubs into your Firebase database. Proceed?")) return;
    setSaving(true);
    try {
      await importHubs(INITIAL_HUBS);
      alert("Successfully seeded 10 default crop hubs in Firestore!");
      load();
    } catch (err) {
      console.error("Failed to seed default hubs:", err);
      alert("Failed to seed default hubs. Check console/Firestore Rules.");
    } finally {
      setSaving(false);
    }
  };

  const f = form;
  const setF = setForm;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Layers className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">Hubs</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9">
            Manage crop hubs — add, edit, delete. Hubs saved here replace the default mock hubs on the public site.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={handleImportDefaults} disabled={saving}
            className="flex items-center gap-2 border border-outline bg-surface-container-low text-on-surface-variant text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-surface-container transition-colors disabled:opacity-50">
            {saving ? "Importing..." : "Import Default Hubs"}
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary-container transition-colors">
            <Plus className="h-4 w-4" /> New Hub
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between gap-4">
          <p className="font-semibold">{error}</p>
          <button onClick={load} className="shrink-0 bg-red-100 hover:bg-red-200 text-red-900 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : hubs.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-outline-variant p-16 text-center">
          <Layers className="h-10 w-10 text-outline mx-auto mb-4" />
          <h3 className="text-lg font-bold text-on-surface mb-1">No hubs yet</h3>
          <p className="text-sm text-on-surface-variant mb-6">Your Firestore database has no hubs. You can seed it with the 10 default hubs or create a new one.</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={openAdd} className="bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-primary-container transition-colors">
              Create Custom Hub
            </button>
            <button onClick={handleImportDefaults} disabled={saving} className="bg-secondary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-secondary-container transition-colors disabled:opacity-50">
              {saving ? "Importing..." : "Seed 10 Default Hubs"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {hubs.map(h => (
            <div key={h.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
              {/* Hub header */}
              <div className="flex items-center gap-4 p-5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-surface-container shrink-0">
                  {h.heroImage ? (
                    <img src={h.heroImage} alt={h.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-6 w-6 text-outline" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-on-surface text-lg">{h.name} Hub</h3>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full">Live</span>
                  </div>
                  <p className="text-sm text-on-surface-variant truncate">{h.tagline}</p>
                  <div className="flex gap-4 mt-1">
                    <span className="text-xs text-on-surface-variant">{h.seeds.length} seeds</span>
                    <span className="text-xs text-on-surface-variant">{h.nutrition.length} nutrition</span>
                    <span className="text-xs text-on-surface-variant">{h.irrigation.items.length} irrigation items</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setExpandedHub(expandedHub === h.id ? null : h.id)}
                    className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant transition-colors">
                    {expandedHub === h.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(h)} className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(h)} disabled={deleting === h.id}
                    className="p-2 rounded-xl hover:bg-red-50 text-on-surface-variant hover:text-red-600 transition-colors disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedHub === h.id && (
                <div className="border-t border-outline-variant/20 p-5 grid grid-cols-1 md:grid-cols-3 gap-6 bg-surface-container-low">
                  {/* Seeds */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Seeds / Products</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {h.seeds.map((s, i) => (
                        <div key={i} className="bg-white rounded-2xl p-3 border border-surface-container">
                          <div className="aspect-square rounded-xl overflow-hidden bg-surface-container mb-2">
                            {s.img ? <img src={s.img} alt={s.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-4 w-4 text-outline" /></div>}
                          </div>
                          <p className="text-xs font-bold text-on-surface truncate">{s.name}</p>
                          <p className="text-xs font-black text-secondary">₹{s.price}/unit</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Nutrition */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Nutrition</h4>
                    <div className="space-y-2">
                      {h.nutrition.map((n, i) => (
                        <div key={i} className="bg-white rounded-xl p-3 border border-surface-container">
                          <p className="text-xs font-bold text-on-surface">{n.name}</p>
                          <p className="text-xs text-on-surface-variant">{n.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Irrigation + Advisory */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Irrigation</h4>
                      {h.irrigation.image && (
                        <div className="rounded-xl overflow-hidden h-20 mb-2">
                          <img src={h.irrigation.image} alt="irrigation" className="w-full h-full object-cover" />
                        </div>
                      )}
                      {h.irrigation.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b border-surface-container">
                          <span className="text-on-surface">{item.name}</span>
                          <span className="font-bold text-secondary">{item.price}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-2">Advisory</h4>
                      <p className="text-xs font-bold text-on-surface">{h.advisory.title}</p>
                      <p className="text-xs text-on-surface-variant mt-1 line-clamp-3">{h.advisory.description}</p>
                    </div>
                  </div>

                  {/* Growth Stages (New Row or spanned) */}
                  <div className="md:col-span-3 border-t border-outline-variant/10 pt-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Growth Journey</h4>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      {h.growthStages?.map((s, i) => (
                        <div key={i} className="bg-white p-3 rounded-xl border border-surface-container">
                          <p className="text-[10px] font-black text-primary uppercase mb-1">Stage {i+1}: {s.phase}</p>
                          <p className="text-[10px] font-bold text-on-surface line-clamp-2">{s.description}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {s.products.map((p, pi) => (
                              <span key={pi} className="text-[8px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">{p}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Common Mistakes */}
                  <div className="md:col-span-3 border-t border-outline-variant/10 pt-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant mb-3">Common Mistakes</h4>
                    <div className="flex flex-wrap gap-2">
                      {h.commonMistakes?.map((m, i) => (
                        <div key={i} className="bg-red-50 text-red-700 px-3 py-1 rounded-lg text-[10px] font-bold border border-red-100 flex items-center gap-1">
                          <X className="h-3 w-3" /> {m}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-50 flex items-start justify-center bg-on-surface/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-surface-container sticky top-0 bg-white rounded-t-3xl z-10">
              <h2 className="text-lg font-bold text-on-surface">{editId ? "Edit Hub" : "New Hub"}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-surface-container transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              {/* Basic info */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">Basic Info</h3>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Hub Name *</label>
                  <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Tomato" required
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Tagline *</label>
                  <input value={f.tagline} onChange={e => setF(p => ({ ...p, tagline: e.target.value }))}
                    placeholder="One-line description of the hub" required
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Hero Image URL</label>
                  <input value={f.heroImage} onChange={e => setF(p => ({ ...p, heroImage: e.target.value }))}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {f.heroImage && (
                    <div className="mt-2 rounded-xl overflow-hidden h-28">
                      <img src={f.heroImage} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Crop Icon URL (Home Page)</label>
                  <input value={f.iconImage} onChange={e => setF(p => ({ ...p, iconImage: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {f.iconImage && (
                    <div className="mt-2 rounded-xl overflow-hidden w-16 h-16 border border-surface-container">
                      <img src={f.iconImage} alt="icon preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </div>

                {/* Profile Stats */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Ideal Climate</label>
                    <input value={f.idealClimate} onChange={e => setF(p => ({ ...p, idealClimate: e.target.value }))}
                      placeholder="e.g. Tropical"
                      className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Soil Type</label>
                    <input value={f.soilType} onChange={e => setF(p => ({ ...p, soilType: e.target.value }))}
                      placeholder="e.g. Well-drained"
                      className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Water Needs</label>
                    <input value={f.waterNeeds} onChange={e => setF(p => ({ ...p, waterNeeds: e.target.value }))}
                      placeholder="e.g. Moderate"
                      className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Best Season</label>
                    <input value={f.bestSeason} onChange={e => setF(p => ({ ...p, bestSeason: e.target.value }))}
                      placeholder="e.g. Spring"
                      className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
              </div>

              {/* Seeds */}
              <div className="border-t border-surface-container pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Seeds / Products</h3>
                  <button type="button"
                    onClick={() => setF(p => ({ ...p, seeds: [...p.seeds, { name: "", price: "", img: "" }] }))}
                    className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                    <Plus className="h-3 w-3" /> Add Seed
                  </button>
                </div>
                <div className="space-y-3">
                  {f.seeds.map((seed, i) => (
                    <div key={i} className="rounded-2xl border border-outline-variant bg-surface-container-low p-3 space-y-2">
                      {/* Row 1: name + price + delete */}
                      <div className="flex gap-2 items-center">
                        <input
                          type="text" value={seed.name} placeholder="Seed / product name"
                          onChange={e => { const s = [...f.seeds]; s[i] = { ...s[i], name: e.target.value }; setF(p => ({ ...p, seeds: s })); }}
                          className="flex-1 min-w-0 rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20" />
                        <input
                          type="text" value={seed.price} placeholder="Price (₹)"
                          onChange={e => { const s = [...f.seeds]; s[i] = { ...s[i], price: e.target.value }; setF(p => ({ ...p, seeds: s })); }}
                          className="w-24 shrink-0 rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20" />
                        <button type="button"
                          onClick={() => setF(p => ({ ...p, seeds: p.seeds.filter((_, j) => j !== i) }))}
                          className="p-2 text-on-surface-variant hover:text-red-500 transition-colors shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {/* Row 2: image URL full-width + preview */}
                      <div className="flex gap-2 items-center">
                        <input
                          type="text" value={seed.img} placeholder="Image URL (https://...)"
                          onChange={e => { const s = [...f.seeds]; s[i] = { ...s[i], img: e.target.value }; setF(p => ({ ...p, seeds: s })); }}
                          className="flex-1 min-w-0 rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20" />
                        {seed.img && (
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-surface-container shrink-0">
                            <img src={seed.img} alt={seed.name} className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {f.seeds.length === 0 && (
                    <p className="text-xs text-on-surface-variant text-center py-4">No seeds yet. Click Add Seed.</p>
                  )}
                </div>
              </div>

              {/* Nutrition */}
              <div className="border-t border-surface-container pt-5">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Targeted Nutrition</h3>
                <ArrayField
                  label="Nutrition Items"
                  items={f.nutrition}
                  onChange={nutrition => setF(p => ({ ...p, nutrition }))}
                  fields={[
                    { key: "name", placeholder: "e.g. Urea (Nitrogen Rich)" },
                    { key: "desc", placeholder: "Short description" },
                    { key: "icon", placeholder: "Icon", type: "select", options: ICON_OPTIONS },
                  ]}
                  addLabel="Add Item"
                />
              </div>

              {/* Irrigation */}
              <div className="border-t border-surface-container pt-5">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Irrigation</h3>
                <div className="mb-4">
                  <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Section Image URL</label>
                  <input value={f.irrigationImage} onChange={e => setF(p => ({ ...p, irrigationImage: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                  {f.irrigationImage && (
                    <div className="mt-2 rounded-xl overflow-hidden h-20">
                      <img src={f.irrigationImage} alt="preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </div>
                <ArrayField
                  label="Irrigation Products"
                  items={f.irrigationItems}
                  onChange={irrigationItems => setF(p => ({ ...p, irrigationItems }))}
                  fields={[
                    { key: "name", placeholder: "Product name" },
                    { key: "price", placeholder: "e.g. ₹12/m" },
                  ]}
                  addLabel="Add Item"
                />
              </div>

              {/* Advisory */}
              <div className="border-t border-surface-container pt-5">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4">Agronomy Advisory</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Advisory Title</label>
                    <input value={f.advisoryTitle} onChange={e => setF(p => ({ ...p, advisoryTitle: e.target.value }))}
                      placeholder="e.g. Preventing Blossom End Rot"
                      className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-on-surface-variant mb-1">Advisory Description</label>
                    <textarea value={f.advisoryDescription} onChange={e => setF(p => ({ ...p, advisoryDescription: e.target.value }))}
                      rows={4} placeholder="Detailed advisory text for farmers…"
                      className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none" />
                  </div>
                </div>
              </div>

              {/* Growth Stages */}
              <div className="border-t border-surface-container pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Growth Journey</h3>
                  <button type="button"
                    onClick={() => setF(p => ({ ...p, growthStages: [...p.growthStages, { phase: "", duration: "", description: "", products: "" }] }))}
                    className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                    <Plus className="h-3 w-3" /> Add Stage
                  </button>
                </div>
                <div className="space-y-4">
                  {f.growthStages.map((stage, i) => (
                    <div key={i} className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 space-y-3 relative">
                      <button type="button"
                        onClick={() => setF(p => ({ ...p, growthStages: p.growthStages.filter((_, j) => j !== i) }))}
                        className="absolute top-2 right-2 p-1 text-on-surface-variant hover:text-red-500 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Phase Name</label>
                          <input
                            type="text" value={stage.phase} placeholder="e.g. Flowering"
                            onChange={e => { const s = [...f.growthStages]; s[i] = { ...s[i], phase: e.target.value }; setF(p => ({ ...p, growthStages: s })); }}
                            className="w-full rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Duration</label>
                          <input
                            type="text" value={stage.duration} placeholder="e.g. 2-3 Weeks"
                            onChange={e => { const s = [...f.growthStages]; s[i] = { ...s[i], duration: e.target.value }; setF(p => ({ ...p, growthStages: s })); }}
                            className="w-full rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Description</label>
                        <textarea
                          value={stage.description} placeholder="What happens in this stage?" rows={2}
                          onChange={e => { const s = [...f.growthStages]; s[i] = { ...s[i], description: e.target.value }; setF(p => ({ ...p, growthStages: s })); }}
                          className="w-full rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-on-surface-variant mb-1">Recommended Products (comma separated)</label>
                        <input
                          type="text" value={stage.products} placeholder="e.g. Urea, NPK 19:19:19"
                          onChange={e => { const s = [...f.growthStages]; s[i] = { ...s[i], products: e.target.value }; setF(p => ({ ...p, growthStages: s })); }}
                          className="w-full rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Common Mistakes */}
              <div className="border-t border-surface-container pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-primary">Common Mistakes</h3>
                  <button type="button"
                    onClick={() => setF(p => ({ ...p, commonMistakes: [...p.commonMistakes, ""] }))}
                    className="text-xs font-bold text-primary flex items-center gap-1 hover:underline">
                    <Plus className="h-3 w-3" /> Add Mistake
                  </button>
                </div>
                <div className="space-y-2">
                  {f.commonMistakes.map((mistake, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text" value={mistake} placeholder="Mistake to avoid..."
                        onChange={e => { const m = [...f.commonMistakes]; m[i] = e.target.value; setF(p => ({ ...p, commonMistakes: m })); }}
                        className="flex-1 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      <button type="button"
                        onClick={() => setF(p => ({ ...p, commonMistakes: p.commonMistakes.filter((_, j) => j !== i) }))}
                        className="p-2 text-on-surface-variant hover:text-red-500 transition-colors shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 border-t border-surface-container pt-5">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-2xl border border-outline-variant text-sm font-bold hover:bg-surface-container transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                  {saving ? "Saving…" : editId ? "Save Hub" : "Create Hub"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
