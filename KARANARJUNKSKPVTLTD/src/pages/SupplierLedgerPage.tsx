import { useState, useEffect } from 'react';
import {
  Building2, Plus, X, CheckCircle2, Loader2, AlertCircle,
  ChevronDown, ChevronUp, IndianRupee, Package, CreditCard, Truck, Download,
} from 'lucide-react';
import {
  addDoc, getDocs, query, updateDoc, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { fmtINR } from '../utils/gstCalculator';
import { runNandgaonImport } from '../utils/nandgaonImport';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  outstandingBalance: number;
  totalInvoiced?: number;
  totalPaid?: number;
  balanceAsOf?: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string;
  totalAmount: number;
  status: string;
  notes?: string;
  lines?: { description: string; quantity: number; rate: number; amount: number }[];
}

interface SupplierPayment {
  id: string;
  receiptNo: string;
  date: string;
  amount: number;
  paymentMode: string;
  notes?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplierLedgerPage() {
  const { tenantId } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add supplier modal
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', address: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Record payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: today(), mode: 'cash', notes: '' });
  const [paymentSaving, setPaymentSaving] = useState(false);

  // UNIMAX one-time import
  const [importState, setImportState] = useState<'idle'|'running'|'done'|'error'>('idle');
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleRunImport = async (force = false) => {
    if (!tenantId) return;
    setImportState('running'); setImportError(null);
    try {
      const counts = await runNandgaonImport(db, tenantId, force);
      if (counts.skipped) {
        setImportError('already-exists');
        setImportState('error');
      } else {
        setImportResult(counts);
        setImportState('done');
        loadSuppliers();
      }
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
      setImportState('error');
    }
  };

  // Expand detail sections
  const [poExpanded, setPoExpanded] = useState(true);
  const [pmtExpanded, setPmtExpanded] = useState(true);

  function today() { return new Date().toISOString().split('T')[0]; }

  // ── Load suppliers ──────────────────────────────────────────────────────────
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

  // ── Load detail for selected supplier ──────────────────────────────────────
  const loadDetail = async (supplier: Supplier) => {
    if (!tenantId) return;
    setSelected(supplier);
    setDetailLoading(true);
    try {
      const [poSnap, pmtSnap] = await Promise.all([
        getDocs(query(
          getTenantCollection(db, tenantId, 'purchaseOrders'),
          where('supplierName', '==', supplier.name),
        )),
        getDocs(query(
          getTenantCollection(db, tenantId, 'supplierPayments'),
          where('supplierName', '==', supplier.name),
        )),
      ]);
      const poList = poSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
      poList.sort((a, b) => b.poDate.localeCompare(a.poDate));
      const pmtList = pmtSnap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierPayment));
      pmtList.sort((a, b) => b.date.localeCompare(a.date));
      setPOs(poList);
      setPayments(pmtList);
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  // ── Add supplier ───────────────────────────────────────────────────────────
  const handleAddSupplier = async () => {
    if (!tenantId || !supplierForm.name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      await addDoc(getTenantCollection(db, tenantId, 'suppliers'), {
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
      loadSuppliers();
    } catch (e: any) { setSaveError(e.message); }
    setSaving(false);
  };

  // ── Record payment ─────────────────────────────────────────────────────────
  const handleRecordPayment = async () => {
    if (!tenantId || !selected || !paymentForm.amount) return;
    const amt = parseFloat(paymentForm.amount);
    if (isNaN(amt) || amt <= 0) return;
    setPaymentSaving(true);
    try {
      const seq = payments.length + 1;
      await addDoc(getTenantCollection(db, tenantId, 'supplierPayments'), {
        supplierName: selected.name,
        receiptNo: `PMT/${selected.name.replace(/\s+/g, '_').toUpperCase().slice(0, 8)}/${String(seq).padStart(3, '0')}`,
        date: paymentForm.date,
        amount: amt,
        paymentMode: paymentForm.mode,
        notes: paymentForm.notes,
        createdAt: serverTimestamp(),
      });
      // Update supplier outstanding
      const newBalance = Math.max(0, selected.outstandingBalance - amt);
      await updateDoc(getTenantDoc(db, tenantId, 'suppliers', selected.id) as any, {
        outstandingBalance: newBalance,
        totalPaid: (selected.totalPaid ?? 0) + amt,
        updatedAt: serverTimestamp(),
      });
      setShowPayment(false);
      setPaymentForm({ amount: '', date: today(), mode: 'cash', notes: '' });
      // Refresh
      loadSuppliers();
      loadDetail({ ...selected, outstandingBalance: newBalance });
    } catch (e: any) { console.error(e); }
    setPaymentSaving(false);
  };

  // ── Summary totals ─────────────────────────────────────────────────────────
  const totalOutstanding = suppliers.reduce((s, sup) => s + (sup.outstandingBalance || 0), 0);
  const totalInvoiced = suppliers.reduce((s, sup) => s + (sup.totalInvoiced || 0), 0);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Truck size={24} className="primary-gradient-text" /> Supplier Ledger
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Track what you owe to each supplier — purchases, payments, outstanding balance
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddSupplier(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Add Supplier
        </button>
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

      {/* ── UNIMAX Ledger Import Banner ─────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid hsla(38,90%,50%,0.25)', background: 'hsla(38,90%,50%,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={16} style={{ color: '#ff9800' }} /> UNIMAX Nandgaon Ledger Import
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              Imports 64 purchase orders (AP), 50 retailer care-off orders (AR), 14 payments — ₹8,10,993 outstanding
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {importState === 'done' && importResult && (
              <span style={{ fontSize: '0.82rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={15} /> {importResult.purchaseOrders} POs · {importResult.arOrders} AR orders · {importResult.newRetailers} new retailers
              </span>
            )}
            {importState === 'error' && (
              <span style={{ fontSize: '0.82rem', color: '#ff4d4f', maxWidth: '260px' }}>
                {importError === 'already-exists' ? (
                  <>Already imported. <button onClick={() => handleRunImport(true)} style={{ background: 'none', border: 'none', color: '#ff9800', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.82rem' }}>Force re-import</button></>
                ) : importError}
              </span>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => handleRunImport(false)}
              disabled={importState === 'running'}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              {importState === 'running'
                ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                : <><Download size={14} /> Run Import</>}
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout: supplier list + detail panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '360px 1fr' : '1fr', gap: '1rem', alignItems: 'start' }}>

        {/* Supplier list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
              <Loader2 size={24} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
              <div>Loading suppliers…</div>
            </div>
          )}
          {!loading && suppliers.length === 0 && (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: '12px' }}>
              <Building2 size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <div>No suppliers yet.</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Add your first supplier or run the UNIMAX ledger import.</div>
            </div>
          )}
          {suppliers.map(sup => (
            <div
              key={sup.id}
              className="glass-panel"
              onClick={() => loadDetail(sup)}
              style={{
                padding: '1rem 1.25rem', borderRadius: '12px', cursor: 'pointer',
                border: selected?.id === sup.id ? '2px solid var(--primary-light)' : '1px solid var(--surface-border)',
                transition: 'border 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sup.name}
                  </div>
                  {sup.address && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sup.address}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: sup.outstandingBalance > 0 ? '#ff4d4f' : 'var(--primary-light)' }}>
                    ₹{sup.outstandingBalance.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>outstanding</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                {sup.totalInvoiced != null && <span>Invoiced: ₹{sup.totalInvoiced.toLocaleString('en-IN')}</span>}
                {sup.totalPaid != null && <span>Paid: ₹{sup.totalPaid.toLocaleString('en-IN')}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '1.5rem', position: 'sticky', top: '80px' }}>
            {/* Detail header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{selected.name}</h2>
                {selected.address && <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>{selected.address}</div>}
                {selected.email && <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{selected.email}</div>}
              </div>
              <button className="btn-icon" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            {/* Outstanding + Record Payment */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: selected.outstandingBalance > 0 ? 'hsla(0,100%,50%,0.07)' : 'hsla(152,60%,40%,0.07)', borderRadius: '10px', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding Payable</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: selected.outstandingBalance > 0 ? '#ff4d4f' : 'var(--primary-light)' }}>
                  ₹{selected.outstandingBalance.toLocaleString('en-IN')}
                </div>
                {selected.balanceAsOf && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>as of {selected.balanceAsOf}</div>}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowPayment(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <CreditCard size={15} /> Record Payment
              </button>
            </div>

            {detailLoading && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-tertiary)' }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}

            {!detailLoading && (
              <>
                {/* Purchase Orders */}
                <div style={{ marginBottom: '1rem' }}>
                  <button
                    onClick={() => setPoExpanded(e => !e)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Package size={15} /> Purchase Orders ({pos.length})
                    </span>
                    {poExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {poExpanded && (
                    <div style={{ marginTop: '0.5rem', maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {pos.length === 0 && <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>No purchase orders yet</div>}
                      {pos.map(po => (
                        <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--surface-raised)', borderRadius: '8px', fontSize: '0.82rem' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{po.poNumber}</div>
                            <div style={{ color: 'var(--text-tertiary)' }}>{po.poDate} · {po.notes?.slice(0, 40)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{po.totalAmount.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '0.72rem', color: po.status === 'received' ? 'var(--primary-light)' : '#ff9800' }}>{po.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payments */}
                <div>
                  <button
                    onClick={() => setPmtExpanded(e => !e)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CreditCard size={15} /> Payments ({payments.length})
                    </span>
                    {pmtExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {pmtExpanded && (
                    <div style={{ marginTop: '0.5rem', maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {payments.length === 0 && <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>No payments recorded</div>}
                      {payments.map(pmt => (
                        <div key={pmt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'hsla(152,60%,40%,0.06)', borderRadius: '8px', fontSize: '0.82rem' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pmt.receiptNo}</div>
                            <div style={{ color: 'var(--text-tertiary)' }}>{pmt.date} · {pmt.paymentMode}</div>
                            {pmt.notes && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.74rem' }}>{pmt.notes.slice(0, 50)}</div>}
                          </div>
                          <div style={{ fontWeight: 700, color: 'var(--primary-light)', flexShrink: 0, marginLeft: '0.5rem' }}>
                            ₹{pmt.amount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Add Supplier Modal ─────────────────────────────────────────────────── */}
      {showAddSupplier && (
        <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '2rem', position: 'relative' }}>
            <button onClick={() => setShowAddSupplier(false)} className="btn-icon" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={18} className="primary-gradient-text" /> Add Supplier
            </h2>
            {saveError && (
              <div style={{ padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}>
                <AlertCircle size={16} /> {saveError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { key: 'name', label: 'Supplier Name *', placeholder: 'e.g. UNIMAX AGRI BIO-TECHNOLOGIES' },
                { key: 'address', label: 'Address', placeholder: 'Village, Taluka, District' },
                { key: 'phone', label: 'Phone', placeholder: '9876543210' },
                { key: 'email', label: 'Email', placeholder: 'contact@supplier.com' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{f.label}</label>
                  <input
                    className="input-field"
                    placeholder={f.placeholder}
                    value={(supplierForm as any)[f.key]}
                    onChange={e => setSupplierForm(s => ({ ...s, [f.key]: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddSupplier(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddSupplier} disabled={saving || !supplierForm.name.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> Save Supplier</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ───────────────────────────────────────────────── */}
      {showPayment && selected && (
        <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
          <div className="modal-content animate-slide-up glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem', position: 'relative' }}>
            <button onClick={() => setShowPayment(false)} className="btn-icon" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={18} className="primary-gradient-text" /> Record Payment
            </h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
              To: {selected.name} · Outstanding: ₹{selected.outstandingBalance.toLocaleString('en-IN')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Amount Paid (₹) *</label>
                <input
                  className="input-field"
                  type="number"
                  placeholder="0"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Date</label>
                <input
                  className="input-field"
                  type="date"
                  value={paymentForm.date}
                  onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Payment Mode</label>
                <select
                  className="input-field"
                  value={paymentForm.mode}
                  onChange={e => setPaymentForm(f => ({ ...f, mode: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Notes</label>
                <input
                  className="input-field"
                  placeholder="By hand Kale Saheb, reference no., etc."
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowPayment(false)} disabled={paymentSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRecordPayment} disabled={paymentSaving || !paymentForm.amount} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {paymentSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> Record ₹{parseFloat(paymentForm.amount || '0').toLocaleString('en-IN')}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
