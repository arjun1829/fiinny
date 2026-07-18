import { useState, useEffect, useRef } from 'react';
import { IndianRupee, X, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { addDoc, updateDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { generatePaymentId } from '../utils/paymentIdGenerator';
import { uploadPaymentProof } from '../utils/uploadPaymentProof';
import PaymentAttachmentField from './PaymentAttachmentField';

export interface PaymentForEdit {
  id: string;
  paymentId?: string;
  amount?: number;
  // legacy field names (read-only for backward compat)
  mode?: string;
  paymentMode?: string;
  reference?: string;
  receiptNo?: string;
  date?: Timestamp | string;
  // new field names
  paymentMethod?: string;
  paymentDate?: string;
  transactionRef?: string;
  accountName?: string;
  accountDetails?: { accountName?: string; transactionRef?: string };
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  createdAt?: Timestamp;
}

interface PaymentModalProps {
  supplierId: string;
  supplierName: string;
  outstandingBalance: number;
  editing?: PaymentForEdit | null;
  onClose: () => void;
  onSaved: () => void;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];
const ACCOUNT_DETAIL_METHODS = new Set(['UPI', 'Bank Transfer', 'Other']);

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const pmtMethodOf = (p: PaymentForEdit) => p.paymentMethod || p.mode || p.paymentMode || 'Cash';
const pmtDateOf = (p: PaymentForEdit): string => {
  if (p.paymentDate) return p.paymentDate;
  if (typeof p.date === 'string') return p.date;
  if (p.date && typeof (p.date as Timestamp).toMillis === 'function') {
    const ms = (p.date as Timestamp).toMillis();
    if (!isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return today();
};
const pmtRefOf = (p: PaymentForEdit) =>
  p.transactionRef || p.accountDetails?.transactionRef || p.reference || p.receiptNo || '';
const pmtAccountOf = (p: PaymentForEdit) =>
  p.accountName || p.accountDetails?.accountName || '';

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
        paymentMethod: pmtMethodOf(editing),
        transactionRef: pmtRefOf(editing),
        accountName: pmtAccountOf(editing),
        notes: editing.notes ?? '',
        paymentDate: pmtDateOf(editing),
      }
    : { amount: '', paymentMethod: 'Cash', transactionRef: '', accountName: '', notes: '', paymentDate: today() }
  );

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofCleared, setProofCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const showAccountDetails = ACCOUNT_DETAIL_METHODS.has(form.paymentMethod);

  const handleSave = async () => {
    if (!tenantId) return;
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true); setError(null);
    try {
      const accountDetails = {
        accountName: form.accountName.trim(),
        transactionRef: form.transactionRef.trim(),
      };

      if (editing) {
        const updateData: Record<string, unknown> = {
          amount: amt,
          paymentMethod: form.paymentMethod,
          paymentDate: form.paymentDate,
          accountDetails,
          notes: form.notes.trim(),
          mode: form.paymentMethod,
          date: form.paymentDate,
          reference: form.transactionRef.trim(),
          updatedAt: serverTimestamp(),
        };
        if (proofFile) {
          const meta = await uploadPaymentProof(tenantId, editing.id, proofFile);
          updateData.attachmentUrl = meta.url;
          updateData.attachmentName = meta.name;
          updateData.attachmentType = meta.type;
        } else if (proofCleared) {
          updateData.attachmentUrl = null;
          updateData.attachmentName = null;
          updateData.attachmentType = null;
        }
        await updateDoc(getTenantDoc(db, tenantId, 'supplierPayments', editing.id), updateData);
      } else {
        const paymentId = await generatePaymentId(tenantId);
        const proofData: Record<string, string> = {};
        if (proofFile) {
          const meta = await uploadPaymentProof(tenantId, paymentId, proofFile);
          proofData.attachmentUrl = meta.url;
          proofData.attachmentName = meta.name;
          proofData.attachmentType = meta.type;
        }
        await addDoc(getTenantCollection(db, tenantId, 'supplierPayments'), {
          paymentId,
          partnerId: supplierId,
          supplierId,
          supplierName,
          amount: amt,
          paymentMethod: form.paymentMethod,
          paymentDate: form.paymentDate,
          accountDetails,
          notes: form.notes.trim(),
          linkedOrderIds: [],
          unallocatedAmount: amt,
          ...proofData,
          mode: form.paymentMethod,
          date: form.paymentDate,
          reference: form.transactionRef.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser?.email ?? '',
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save payment');
    }
    setSaving(false);
  };

  const existingAttachment = editing?.attachmentUrl
    ? { url: editing.attachmentUrl, name: editing.attachmentName || '', type: editing.attachmentType || '' }
    : null;

  return (
    // Outer: fixed overlay, handles background + single scroll container
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        overflowY: 'auto',
        background: 'hsla(220, 30%, 4%, 0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.18s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit Payment' : 'Record Payment'}
    >
      {/* Centering wrapper — backdrop click closes the modal */}
      <div
        ref={overlayRef}
        onMouseDown={e => { if (e.target === overlayRef.current && !saving) onClose(); }}
        style={{
          minHeight: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem 1rem',
        }}
      >
        {/* Panel — no maxHeight, no overflowY */}
        <div
          className="glass-panel"
          style={{
            width: '100%', maxWidth: '480px',
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
                <label style={labelStyle}>Payment Date *</label>
                <input className="input-field" type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} style={{ width: '100%', margin: 0 }} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Payment Method</label>
              <select className="input-field" value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} style={{ width: '100%', margin: 0 }}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>

            {showAccountDetails && (
              <>
                <div>
                  <label style={labelStyle}>Account Name</label>
                  <input className="input-field" placeholder="e.g. HDFC Bank, Google Pay" value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} style={{ width: '100%', margin: 0 }} />
                </div>
                <div>
                  <label style={labelStyle}>Transaction Reference Number</label>
                  <input className="input-field" placeholder="UTR / Transaction ID" value={form.transactionRef} onChange={e => setForm(f => ({ ...f, transactionRef: e.target.value }))} style={{ width: '100%', margin: 0 }} />
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>Notes</label>
              <textarea className="input-field" placeholder="Optional remarks" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%', margin: 0, resize: 'vertical' }} />
            </div>

            <PaymentAttachmentField
              pendingFile={proofFile}
              existingAttachment={existingAttachment}
              attachmentCleared={proofCleared}
              onFileSelect={setProofFile}
              onClear={() => { setProofFile(null); setProofCleared(true); }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.75rem' }}>
            <button className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.amount} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> {isEdit ? 'Save Changes' : 'Record Payment'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
