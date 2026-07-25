import { useState, useEffect, useRef } from 'react';
import { IndianRupee, X, AlertCircle, Loader2, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
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
  bankDetails?: {
    holderName?: string;
    beneficiaryName?: string;
    payerAccountNumber?: string;
    beneficiaryAccountNumber?: string;
    ifscCode?: string;
    cbsTransactionId?: string;
    statusRemark?: string;
  };
  notes?: string;
  linkedInvoiceId?: string;
  linkedInvoiceNumber?: string;
  linkedInvoiceType?: 'po' | 'invoice';
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  createdAt?: Timestamp;
}

export interface ApplicableDoc {
  id: string;
  type: 'po' | 'invoice';
  label: string;
  amount: number;
}

interface PaymentModalProps {
  supplierId: string;
  supplierName: string;
  outstandingBalance: number;
  editing?: PaymentForEdit | null;
  applicableDocs?: ApplicableDoc[];
  onClose: () => void;
  onSaved: () => void;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'NEFT', 'RTGS', 'Bank Transfer', 'Cheque', 'Other'];
const ACCOUNT_DETAIL_METHODS = new Set(['UPI', 'NEFT', 'RTGS', 'Bank Transfer', 'Cheque', 'Other']);
const accountFieldLabels = (method: string) =>
  method === 'Cheque'
    ? { name: 'Bank Name', ref: 'Cheque Number' }
    : { name: 'Account Name', ref: 'Transaction Reference Number (UTR / UPI Ref)' };
const accountFieldPlaceholders = (method: string) =>
  method === 'Cheque'
    ? { name: 'e.g. HDFC Bank', ref: 'e.g. 004521' }
    : { name: 'e.g. HDFC Bank, Google Pay', ref: 'UTR / Transaction ID' };

interface BankDetailsForm {
  holderName: string;
  beneficiaryName: string;
  payerAccountNumber: string;
  beneficiaryAccountNumber: string;
  ifscCode: string;
  cbsTransactionId: string;
  statusRemark: string;
}

const emptyBankDetails: BankDetailsForm = {
  holderName: '', beneficiaryName: '', payerAccountNumber: '', beneficiaryAccountNumber: '',
  ifscCode: '', cbsTransactionId: '', statusRemark: '',
};

const BANK_DETAIL_FIELDS: { key: keyof BankDetailsForm; label: string; placeholder: string }[] = [
  { key: 'holderName', label: 'Payer Account Holder Name', placeholder: 'e.g. TANPURE ARJUN POPAT' },
  { key: 'payerAccountNumber', label: 'Payer A/c Number', placeholder: 'e.g. SB-102004001002198' },
  { key: 'beneficiaryName', label: 'Beneficiary Name', placeholder: "e.g. Agrimass BioFertilizers" },
  { key: 'beneficiaryAccountNumber', label: 'Beneficiary A/c No.', placeholder: 'e.g. 1828651100003216' },
  { key: 'ifscCode', label: 'IFSC Code', placeholder: 'e.g. IBKL0001828' },
  { key: 'cbsTransactionId', label: 'CBS Transaction ID', placeholder: 'e.g. 466917' },
  { key: 'statusRemark', label: 'Status / Remark', placeholder: 'e.g. SUCCESS' },
];

const ATTACHMENT_FAIL_MSG = 'Payment was saved, but the proof attachment failed to upload (slow/blocked connection). You can attach it later via Edit.';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Upload timed out')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

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
  supplierId, supplierName, outstandingBalance, editing, applicableDocs = [], onClose, onSaved,
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
        linkedDocId: editing.linkedInvoiceId ? `${editing.linkedInvoiceType || 'invoice'}:${editing.linkedInvoiceId}` : '',
        ...emptyBankDetails,
        ...(editing.bankDetails ?? {}),
      }
    : { amount: '', paymentMethod: 'Cash', transactionRef: '', accountName: '', notes: '', paymentDate: today(), linkedDocId: '', ...emptyBankDetails }
  );

  const [moreOpen, setMoreOpen] = useState(() => !!editing?.bankDetails && Object.values(editing.bankDetails).some(v => v));
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
    let attachmentWarning: string | null = null;
    try {
      const accountDetails = {
        accountName: form.accountName.trim(),
        transactionRef: form.transactionRef.trim(),
      };
      const bankDetails = BANK_DETAIL_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: form[f.key].trim() }), {} as BankDetailsForm);
      const linkedDoc = form.linkedDocId ? applicableDocs.find(d => `${d.type}:${d.id}` === form.linkedDocId) : undefined;
      const linkedFields = linkedDoc
        ? { linkedInvoiceId: linkedDoc.id, linkedInvoiceNumber: linkedDoc.label, linkedInvoiceType: linkedDoc.type }
        : { linkedInvoiceId: null, linkedInvoiceNumber: null, linkedInvoiceType: null };

      if (editing) {
        const updateData: Record<string, unknown> = {
          amount: amt,
          paymentMethod: form.paymentMethod,
          paymentDate: form.paymentDate,
          accountDetails,
          bankDetails,
          notes: form.notes.trim(),
          ...linkedFields,
          mode: form.paymentMethod,
          date: form.paymentDate,
          reference: form.transactionRef.trim(),
          updatedAt: serverTimestamp(),
        };
        if (proofFile) {
          try {
            const meta = await withTimeout(uploadPaymentProof(tenantId, editing.id, proofFile), 60000);
            updateData.attachmentUrl = meta.url;
            updateData.attachmentName = meta.name;
            updateData.attachmentType = meta.type;
          } catch (upErr) { console.error('Payment proof upload failed:', upErr); attachmentWarning = ATTACHMENT_FAIL_MSG; }
        } else if (proofCleared) {
          updateData.attachmentUrl = null;
          updateData.attachmentName = null;
          updateData.attachmentType = null;
        }
        await withTimeout(updateDoc(getTenantDoc(db, tenantId, 'supplierPayments', editing.id), updateData), 20000);
      } else {
        const paymentId = await withTimeout(generatePaymentId(tenantId), 15000).catch(() => `PAY-${new Date().getFullYear()}-${String((Date.now() % 9998) + 1).padStart(4, '0')}`);
        const proofData: Record<string, string> = {};
        if (proofFile) {
          try {
            const meta = await withTimeout(uploadPaymentProof(tenantId, paymentId, proofFile), 60000);
            proofData.attachmentUrl = meta.url;
            proofData.attachmentName = meta.name;
            proofData.attachmentType = meta.type;
          } catch (upErr) { console.error('Payment proof upload failed:', upErr); attachmentWarning = ATTACHMENT_FAIL_MSG; }
        }
        await withTimeout(addDoc(getTenantCollection(db, tenantId, 'supplierPayments'), {
          paymentId,
          partnerId: supplierId,
          supplierId,
          supplierName,
          amount: amt,
          paymentMethod: form.paymentMethod,
          paymentDate: form.paymentDate,
          accountDetails,
          bankDetails,
          notes: form.notes.trim(),
          linkedOrderIds: [],
          unallocatedAmount: amt,
          ...linkedFields,
          ...proofData,
          mode: form.paymentMethod,
          date: form.paymentDate,
          reference: form.transactionRef.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser?.email ?? '',
        }), 20000);
      }
      if (attachmentWarning) alert(attachmentWarning);
      onSaved();
    } catch (e) {
      console.error('Record Payment save failed:', e);
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
                  <label style={labelStyle}>{accountFieldLabels(form.paymentMethod).name}</label>
                  <input className="input-field" placeholder={accountFieldPlaceholders(form.paymentMethod).name} value={form.accountName} onChange={e => setForm(f => ({ ...f, accountName: e.target.value }))} style={{ width: '100%', margin: 0 }} />
                </div>
                <div>
                  <label style={labelStyle}>{accountFieldLabels(form.paymentMethod).ref}</label>
                  <input className="input-field" placeholder={accountFieldPlaceholders(form.paymentMethod).ref} value={form.transactionRef} onChange={e => setForm(f => ({ ...f, transactionRef: e.target.value }))} style={{ width: '100%', margin: 0 }} />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(o => !o)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', fontWeight: 600, fontSize: '0.82rem', padding: 0 }}
                    aria-expanded={moreOpen}
                  >
                    {moreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} More bank / transaction details (optional)
                  </button>
                  {moreOpen && (
                    <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                      {BANK_DETAIL_FIELDS.map(f => (
                        <div key={f.key}>
                          <label style={labelStyle}>{f.label}</label>
                          <input className="input-field" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={{ width: '100%', margin: 0 }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {applicableDocs.length > 0 && (
              <div>
                <label style={labelStyle}>Apply to Invoice / PO (optional)</label>
                <select className="input-field" value={form.linkedDocId} onChange={e => setForm(f => ({ ...f, linkedDocId: e.target.value }))} style={{ width: '100%', margin: 0 }}>
                  <option value="">— Not linked to a specific invoice —</option>
                  {applicableDocs.map(d => (
                    <option key={`${d.type}:${d.id}`} value={`${d.type}:${d.id}`}>{d.label} · {inr(d.amount)}</option>
                  ))}
                </select>
              </div>
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
