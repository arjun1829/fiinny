import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, X, CheckCircle2, Loader2, AlertCircle,
  IndianRupee, Package, Truck, ChevronRight, Link2,
} from 'lucide-react';
import { addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';

interface Supplier {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  outstandingBalance: number;
  totalInvoiced?: number;
  totalPaid?: number;
}

export default function SupplierLedgerPage() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', address: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSuppliers = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'suppliers'));
      const list: Supplier[] = snap.docs.map(d => ({ id: d.id, outstandingBalance: 0, ...d.data() } as Supplier));
      list.sort((a, b) => b.outstandingBalance - a.outstandingBalance);
      setSuppliers(list);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadSuppliers(); }, [tenantId]);

  const handleAddSupplier = async () => {
    if (!tenantId || !supplierForm.name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const ref = await addDoc(getTenantCollection(db, tenantId, 'suppliers'), {
        name: supplierForm.name.trim(),
        address: supplierForm.address.trim(),
        email: supplierForm.email.trim(),
        phone: supplierForm.phone.trim(),
        outstandingBalance: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        createdAt: serverTimestamp(),
      });
      setShowAddSupplier(false);
      setSupplierForm({ name: '', address: '', email: '', phone: '' });
      navigate(`/supplier-ledger/${ref.id}`);
    } catch (e: any) { setSaveError(e.message); }
    setSaving(false);
  };

  const totalOutstanding = suppliers.reduce((s, sup) => s + (sup.outstandingBalance || 0), 0);
  const totalInvoiced = suppliers.reduce((s, sup) => s + (sup.totalInvoiced || 0), 0);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Truck size={24} className="primary-gradient-text" /> Supplier Ledger
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Track what you owe to each supplier — double-click to open details
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/careoff-sync')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={16} /> Sync Care-Off → AR
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddSupplier(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Suppliers', value: suppliers.length, icon: <Building2 size={18} />, color: 'var(--primary-light)' },
          { label: 'Total Outstanding', value: `₹${totalOutstanding.toLocaleString('en-IN')}`, icon: <IndianRupee size={18} />, color: '#ff4d4f' },
          { label: 'Total Invoiced', value: `₹${totalInvoiced.toLocaleString('en-IN')}`, icon: <Package size={18} />, color: '#ff9800' },
        ].map(c => (
          <div key={c.label} className="glass-panel" style={{ padding: '1.2rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.color, marginBottom: '0.5rem' }}>
              {c.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Supplier list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
            <Loader2 size={24} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
            <div>Loading suppliers…</div>
          </div>
        )}
        {!loading && suppliers.length === 0 && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: '12px' }}>
            <Building2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No suppliers yet</div>
            <div style={{ fontSize: '0.82rem' }}>Add your first supplier to get started.</div>
          </div>
        )}
        {suppliers.map(sup => (
          <div
            key={sup.id}
            className="glass-panel"
            onDoubleClick={() => navigate(`/supplier-ledger/${sup.id}`)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderRadius: '12px', cursor: 'pointer', border: '1px solid var(--surface-border)', transition: 'border 0.15s, background 0.15s', userSelect: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary-light)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--surface-border)')}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Building2 size={16} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                {sup.name}
              </div>
              {sup.address && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.2rem', paddingLeft: '1.5rem' }}>{sup.address}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexShrink: 0, marginLeft: '1rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Invoiced</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>₹{(sup.totalInvoiced ?? 0).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Paid</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary-light)' }}>₹{(sup.totalPaid ?? 0).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Outstanding</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: sup.outstandingBalance > 0 ? '#ff4d4f' : 'var(--primary-light)' }}>
                  ₹{sup.outstandingBalance.toLocaleString('en-IN')}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </div>
        ))}
        {!loading && suppliers.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
            Double-click a supplier to open details
          </p>
        )}
      </div>

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '2rem', position: 'relative' }}>
            <button onClick={() => setShowAddSupplier(false)} className="btn-icon" style={{ position: 'absolute', top: '1rem', right: '1rem' }}><X size={20} /></button>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={18} className="primary-gradient-text" /> Add Supplier
            </h2>
            {saveError && (
              <div style={{ padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}>
                <AlertCircle size={16} /> {saveError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {([
                { key: 'name', label: 'Supplier Name *', placeholder: 'e.g. UNIMAX AGRI BIO-TECHNOLOGIES' },
                { key: 'address', label: 'Address', placeholder: 'Village, Taluka, District' },
                { key: 'phone', label: 'Phone', placeholder: '9876543210' },
                { key: 'email', label: 'Email', placeholder: 'contact@supplier.com' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{f.label}</label>
                  <input className="input-field" placeholder={f.placeholder} value={supplierForm[f.key]} onChange={e => setSupplierForm(s => ({ ...s, [f.key]: e.target.value }))} style={{ width: '100%' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddSupplier(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddSupplier} disabled={saving || !supplierForm.name.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> Save & Open</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
