import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { Factory, Plus, Pencil, Trash2, Phone, Mail, Building2, X, Save } from 'lucide-react';

interface Manufacturer {
    id: string;
    name: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    address?: string;
    createdAt?: any;
}

const emptyForm = { name: '', contactPerson: '', phone: '', email: '', gstin: '', address: '' };

export default function ManufacturersPage() {
    const { tenantId } = useAuth();
    const { showToast } = useToast();
    const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Manufacturer | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const fetchManufacturers = async () => {
        if (!tenantId) return;
        try {
            const q = query(getTenantCollection(db, tenantId, 'manufacturers'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setManufacturers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Manufacturer)));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchManufacturers(); }, [tenantId]);

    const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
    const openEdit = (m: Manufacturer) => {
        setEditing(m);
        setForm({ name: m.name, contactPerson: m.contactPerson || '', phone: m.phone || '', email: m.email || '', gstin: m.gstin || '', address: m.address || '' });
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId || !form.name.trim()) return;
        setSaving(true);
        try {
            if (editing) {
                await updateDoc(getTenantDoc(db, tenantId, 'manufacturers', editing.id), { ...form, updatedAt: serverTimestamp() });
                showToast('Manufacturer updated!', 'success');
            } else {
                await addDoc(getTenantCollection(db, tenantId, 'manufacturers'), { ...form, createdAt: serverTimestamp() });
                showToast('Manufacturer added!', 'success');
            }
            setShowModal(false);
            fetchManufacturers();
        } catch (err) {
            console.error(err);
            showToast('Failed to save manufacturer.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (m: Manufacturer) => {
        if (!tenantId || !window.confirm(`Delete manufacturer "${m.name}"?`)) return;
        try {
            await deleteDoc(getTenantDoc(db, tenantId, 'manufacturers', m.id));
            showToast('Manufacturer deleted.', 'success');
            fetchManufacturers();
        } catch (err) {
            showToast('Failed to delete.', 'error');
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>Manufacturers</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Manage your supply chain partners who fulfil and ship orders.</p>
                </div>
                <button className="btn btn-primary animate-pulse" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={18} /> Add Manufacturer
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : manufacturers.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Factory size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>No manufacturers yet</h3>
                    <p style={{ color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>Add the manufacturers you source products from.</p>
                    <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add First Manufacturer</button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {manufacturers.map(m => (
                        <div key={m.id} className="glass-panel" style={{ padding: '1.5rem', position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Factory size={24} color="white" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{m.name}</h3>
                                    {m.contactPerson && <p style={{ margin: '0.15rem 0 0', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{m.contactPerson}</p>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                {m.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Phone size={13} /> {m.phone}</span>}
                                {m.email && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Mail size={13} /> {m.email}</span>}
                                {m.gstin && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Building2 size={13} /> GSTIN: {m.gstin}</span>}
                                {m.address && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>📍 {m.address}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} onClick={() => openEdit(m)}>
                                    <Pencil size={14} /> Edit
                                </button>
                                <button onClick={() => handleDelete(m)} style={{ padding: '0.4rem 0.75rem', background: 'hsla(0,84%,60%,0.1)', color: 'var(--danger)', border: '1px solid hsla(0,84%,60%,0.2)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Modal — rendered via portal to document.body so it escapes the page's
                .animate-fade-in transform (a transformed ancestor becomes the containing
                block for position:fixed, which previously clipped the modal under the
                sticky Administration tab bar and cut off the bottom of the form). */}
            {showModal && createPortal(
                <div style={{ position: 'fixed', inset: 0, background: 'hsla(0,0%,0%,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '2rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                            <X size={20} />
                        </button>
                        <h2 style={{ marginBottom: '1.5rem' }}>{editing ? 'Edit Manufacturer' : 'Add Manufacturer'}</h2>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group">
                                <label>Company Name *</label>
                                <input required className="input-field" placeholder="e.g. Syngenta India Ltd" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div className="input-group">
                                <label>Contact Person</label>
                                <input className="input-field" placeholder="e.g. Rajesh Sharma" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="input-group">
                                    <label>Phone</label>
                                    <input type="tel" className="input-field" placeholder="+91..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                                </div>
                                <div className="input-group">
                                    <label>Email</label>
                                    <input type="email" className="input-field" placeholder="mfg@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>GSTIN</label>
                                <input className="input-field" placeholder="27XXXXX..." value={form.gstin} onChange={e => setForm(p => ({ ...p, gstin: e.target.value }))} />
                            </div>
                            <div className="input-group">
                                <label>Address</label>
                                <input className="input-field" placeholder="City, State" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={saving}>
                                    <Save size={16} /> {saving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
