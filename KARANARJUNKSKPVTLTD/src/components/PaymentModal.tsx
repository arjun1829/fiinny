import { useState, useEffect, useRef } from 'react';
import {
  IndianRupee, X, AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react';
import { addDoc, updateDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';

/** Minimal payment shape this modal needs to pre-fill in edit mode. */
export interface PaymentForEdit {
  id: string;
  amount?: number;
  mode?: string;
  paymentMode?: string;
  reference?: string;
  receiptNo?: string;
  notes?: string;
  date?: Timestamp | string;
  createdAt?: Timestamp;
}

interface PaymentModalProps {
  supplierId: string;
  supplierName: string;
  /** Shown in the subtitle for context only — not part of the write. */
  outstandingBalance: number;
  /** Pass a payment to edit, or null/undefined to record a new one. */
  editing?: PaymentForEdit | null;
  onClose: () => void;
  /** Called after a successful save — parent runs its existing load(true) recompute. */
  onSaved: () => void;
}

const PAYMENT_MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Credit Note', 'Sales Return', 'Other'];

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const pmtModeOf = (p: PaymentForEdit) => p.mode || p.paymentMode || 'Bank Transfer';
const pmtRefOf = (p: PaymentForEdit) => p.reference || p.receiptNo || '';

/** Millisecond value for a Timestamp|string date (mirrors the page's sortVal). */
function dateMs(v?: Timestamp | string): number {
  if (!v) return 0;
  if (typeof v === 'string') { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
  if (typeof (v as Timestamp).toMillis === 'function') return (v as Timestamp).toMillis();
  return 0;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '0.3rem',
};

export default function PaymentModal({
  supplierId, supplierName, outstandingBalance, editing, onClose, onSaved,
}: PaymentModalProps) {
  const { tenantId, currentUser } = useAuth();
  const isEdit = !!editing;

  const [form, setForm] = useState(() => editing
    ? {
        amount: String(editing.amount ?? ''),
        mode: pmtModeOf(editing),
        reference: pmtRefOf(editing),
        notes: editing.notes ?? '',
        date: typeof editing.date === 'string'
          ? editing.date
          : (editing.date ? new Date(dateMs(editing.date)).toISOString().slice(0, 10) : today()),
      }
    : { amount: '', mode: 'Bank Transfer', reference: '', notes: '', date: today() }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Autofocus first field. State is seeded once; parent remounts on open.
  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const handleSave = async () => {
    if (!tenantId) return;
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true); setError(null);
    try {
      if (editing) {
        await updateDoc(getTenantDoc(db, tenantId, 'supplierPayments', editing.id), {
          amount: amt, mode: form.mode, reference: form.reference.trim(),
          notes: form.notes.trim(), date: form.date, updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(getTenantCollection(db, tenantId, 'supplierPayments'), {
          supplierId, supplierName, amount: amt, mode: form.mode,
          reference: form.reference.trim(), notes: form.notes.trim(), date: form.date,
          createdAt: serverTimestamp(), createdBy: currentUser?.email ?? '',
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment');
    }
    setSaving(false);
  };

  return (
    <div
      ref={overlayRef}
      onMouseDown={e => { if (e.target === overlayRef.current && !saving) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.18s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit Payment' : 'Record Payment'}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto',
          padding: '1.75rem', position: 'relative', borderRadius: '16px',
          animation: 'scaleUp 0.22s ease-out',
        }}
      >
        <button
          onClick={() => !saving && onClose()}
          className="btn-icon"
          aria-label="Close"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IndianRupee size={18} className="primary-gradient-text" /> {isEdit ? 'Edit Payment' : 'Record Payment'}
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>
          To: <strong>{supplierName}</strong> · Outstanding: <strong style={{ color: '#ff4d4f' }}>{inr(outstandingBalance)}</strong>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Amount (₹) *</label>
              <input ref={firstFieldRef} className="input-field" type="number" min="1" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%', margin: 0 }} />
            </div>
            <div>
              <label style={labelStyle}>Date *</label>
              <input className="input-field" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', margin: 0 }} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Payment Mode</label>
            <select className="input-field" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))} style={{ width: '100%', margin: 0 }}>
              {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Reference / UTR / Receipt</label>
            <input className="input-field" placeholder="Transaction ID, cheque or receipt no." value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={{ width: '100%', margin: 0 }} />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea className="input-field" placeholder="Optional remarks" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%', margin: 0, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.75rem' }}>
          <button className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.amount} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> {isEdit ? 'Save Changes' : 'Record Payment'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
