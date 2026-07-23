import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Pencil, X, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronRight,
  Building2, Landmark, IndianRupee, FileText, Settings2, ExternalLink,
} from 'lucide-react';
import { addDoc, updateDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import {
  checkMobile, checkGstin, checkPan, checkIfsc, checkEmail,
  checkNonNegativeNumber, checkWebsite, findDuplicateName,
} from '../utils/supplierValidators';

/** Shape of a supplier document as far as this form cares about it. */
export interface SupplierLike {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  supplierType?: string;
  contactPerson?: string;
  paymentTerms?: string;
  pan?: string;
  website?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
  creditLimit?: number;
  openingBalance?: number;
  isPreferred?: boolean;
  notes?: string;
  status?: string;
}

type CreateProps = {
  mode: 'create';
  onClose: () => void;
  /** `openId` is the new doc id when "Save & Open" was used. */
  onCreated: (openId?: string) => void;
};

type EditProps = {
  mode: 'edit';
  supplierId: string;
  initial: SupplierLike;
  onClose: () => void;
  onSaved: () => void;
};

type SupplierFormModalProps = CreateProps | EditProps;

const SUPPLIER_TYPES = ['Manufacturer', 'Distributor', 'Wholesaler', 'Retailer', 'Transporter', 'Service', 'Other'];
const PAYMENT_TERMS = ['Advance', 'Cash on Delivery', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Custom'];

const emptyForm = {
  // Step 1 — required information
  name: '', supplierType: '', contactPerson: '', mobile: '', address: '', gstin: '', paymentTerms: '',
  // Step 2 — Business
  email: '', pan: '', website: '',
  // Step 2 — Banking
  bankName: '', accountHolder: '', accountNumber: '', ifsc: '',
  // Step 2 — Financial
  creditLimit: '', openingBalance: '',
  // Step 2 — Preferences
  isPreferred: false, notes: '', status: 'active',
};

type Form = typeof emptyForm;
type Errors = Partial<Record<keyof Form, string>>;

/** Map a stored supplier doc into the string-based form state (reverse of buildPayload). */
function toFormState(s: SupplierLike): Form {
  const numStr = (n?: number) => (n === undefined || n === null || n === 0 ? '' : String(n));
  return {
    name: s.name ?? '',
    supplierType: s.supplierType ?? '',
    contactPerson: s.contactPerson ?? '',
    mobile: s.phone ?? '',
    address: s.address ?? '',
    gstin: s.gstin ?? '',
    paymentTerms: s.paymentTerms ?? '',
    email: s.email ?? '',
    pan: s.pan ?? '',
    website: s.website ?? '',
    bankName: s.bankName ?? '',
    accountHolder: s.accountHolder ?? '',
    accountNumber: s.accountNumber ?? '',
    ifsc: s.ifsc ?? '',
    creditLimit: numStr(s.creditLimit),
    openingBalance: numStr(s.openingBalance),
    isPreferred: !!s.isPreferred,
    notes: s.notes ?? '',
    status: s.status ?? 'active',
  };
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '0.3rem',
};
const errStyle: React.CSSProperties = {
  fontSize: '0.72rem', color: '#ff4d4f', marginTop: '0.25rem',
  display: 'flex', alignItems: 'center', gap: '0.25rem',
};
const groupTitle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--text-tertiary)', margin: '0.25rem 0 0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
};

export default function SupplierFormModal(props: SupplierFormModalProps) {
  const { mode, onClose } = props;
  const isEdit = mode === 'edit';
  const { tenantId, currentUser } = useAuth();

  const [form, setForm] = useState<Form>(() => (isEdit ? toFormState(props.initial) : emptyForm));
  const [errors, setErrors] = useState<Errors>({});
  const [dupWarning, setDupWarning] = useState(false);
  // In edit mode, default the "additional info" section open so the user sees all fields.
  const [moreOpen, setMoreOpen] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Autofocus the first field on mount. State starts fresh/pre-filled because the
  // parent remounts this component on each open, so no reset effect is needed.
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

  const set = <K extends keyof Form>(key: K, val: Form[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  /** Returns true if valid; populates `errors` otherwise. */
  const validate = useCallback((existing: { name?: string }[]): boolean => {
    const e: Errors = {};
    if (!form.name.trim()) e.name = 'Supplier name is required';
    if (!form.address.trim()) e.address = 'Address is required';

    const m = checkMobile(form.mobile); if (!m.valid) e.mobile = m.error;
    const g = checkGstin(form.gstin); if (!g.valid) e.gstin = g.error;
    const p = checkPan(form.pan); if (!p.valid) e.pan = p.error;
    const i = checkIfsc(form.ifsc); if (!i.valid) e.ifsc = i.error;
    const em = checkEmail(form.email); if (!em.valid) e.email = em.error;
    const w = checkWebsite(form.website); if (!w.valid) e.website = w.error;
    const cl = checkNonNegativeNumber(form.creditLimit, 'Credit Limit'); if (!cl.valid) e.creditLimit = cl.error;
    const ob = checkNonNegativeNumber(form.openingBalance, 'Opening Balance'); if (!ob.valid) e.openingBalance = ob.error;

    setErrors(e);
    // Duplicate name is a soft warning — surfaced but does not block.
    setDupWarning(findDuplicateName(form.name, existing));
    return Object.values(e).every(v => !v);
  }, [form]);

  const num = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : 0);

  /** Profile fields shared by create and edit. Never includes financial/identity fields. */
  const profilePayload = () => ({
    // Legacy/base fields — unchanged semantics, read by list + detail pages.
    name: form.name.trim(),
    address: form.address.trim(),
    email: form.email.trim(),
    phone: form.mobile.trim(),            // Mobile maps to existing `phone` field
    gstin: form.gstin.trim().toUpperCase(),
    // New optional fields (additive — backward compatible).
    supplierType: form.supplierType || '',
    contactPerson: form.contactPerson.trim(),
    paymentTerms: form.paymentTerms || '',
    pan: form.pan.trim().toUpperCase(),
    website: form.website.trim(),
    bankName: form.bankName.trim(),
    accountHolder: form.accountHolder.trim(),
    accountNumber: form.accountNumber.trim(),
    ifsc: form.ifsc.trim().toUpperCase(),
    creditLimit: num(form.creditLimit),
    openingBalance: num(form.openingBalance), // stored only — NOT wired into outstanding math
    isPreferred: form.isPreferred,
    notes: form.notes.trim(),
    status: form.status,
  });

  const save = async (openAfter: boolean) => {
    if (!tenantId) return;
    setSaving(true); setSaveError(null);
    try {
      // Load current names for duplicate detection (cheap, list is small).
      // In edit mode, exclude the supplier being edited so its own name isn't flagged.
      const snap = await getDocs(getTenantCollection(db, tenantId, 'suppliers'));
      const existing = snap.docs
        .filter(d => !(isEdit && d.id === props.supplierId))
        .map(d => ({ name: (d.data() as { name?: string }).name }));

      if (!validate(existing)) { setSaving(false); return; }

      if (isEdit) {
        // Update profile fields only — financials (outstandingBalance/totalInvoiced/
        // totalPaid) and createdAt are intentionally left untouched.
        await updateDoc(getTenantDoc(db, tenantId, 'suppliers', props.supplierId), {
          ...profilePayload(),
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.email ?? '',
        });
        props.onSaved();
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'suppliers'), {
          ...profilePayload(),
          outstandingBalance: 0,
          totalInvoiced: 0,
          totalPaid: 0,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email ?? '',
        });
        props.onCreated(openAfter ? ref.id : undefined);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save supplier');
    }
    setSaving(false);
  };

  // Only string-valued keys are usable as text inputs.
  type StringKey = { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form];

  const field = (
    key: StringKey, label: string, placeholder: string,
    opts: { required?: boolean; type?: string; refEl?: React.Ref<HTMLInputElement> } = {},
  ) => (
    <div>
      <label style={labelStyle}>{label}{opts.required ? ' *' : ''}</label>
      <input
        ref={opts.refEl}
        className="input-field"
        type={opts.type ?? 'text'}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        style={{ width: '100%', margin: 0, ...(errors[key] ? { borderColor: '#ff4d4f' } : {}) }}
        aria-invalid={!!errors[key]}
      />
      {errors[key] && <div style={errStyle}><AlertCircle size={12} /> {errors[key]}</div>}
    </div>
  );

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
      aria-label={isEdit ? 'Edit Supplier' : 'Add Supplier'}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
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

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isEdit
            ? <><Pencil size={18} className="primary-gradient-text" /> Edit Supplier</>
            : <><Plus size={18} className="primary-gradient-text" /> Add Supplier</>}
        </h2>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
          Required details first — expand “Additional Information” for the rest.
        </p>

        {saveError && (
          <div style={{ padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertCircle size={16} /> {saveError}
          </div>
        )}

        {/* ── Step 1: Required Information ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {field('name', 'Supplier Name', 'e.g. UNIMAX AGRI BIO-TECHNOLOGIES', { required: true, refEl: firstFieldRef })}
          <div>
            <label style={labelStyle}>Supplier Type</label>
            <select className="input-field" value={form.supplierType} onChange={e => set('supplierType', e.target.value)} style={{ width: '100%', margin: 0 }}>
              <option value="">Select type…</option>
              {SUPPLIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {field('contactPerson', 'Contact Person', 'e.g. Mr. Kale')}
          {field('mobile', 'Mobile Number', '9876543210', { required: true, type: 'tel' })}
          {field('gstin', 'GST Number', '27AAPFU0939F1ZV')}
          <div>
            <label style={labelStyle}>Payment Terms</label>
            <select className="input-field" value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} style={{ width: '100%', margin: 0 }}>
              <option value="">Select terms…</option>
              {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label style={labelStyle}>Address *</label>
          <textarea
            className="input-field"
            placeholder="Village, Taluka, District"
            value={form.address}
            onChange={e => set('address', e.target.value)}
            rows={2}
            style={{ width: '100%', margin: 0, resize: 'vertical', ...(errors.address ? { borderColor: '#ff4d4f' } : {}) }}
            aria-invalid={!!errors.address}
          />
          {errors.address && <div style={errStyle}><AlertCircle size={12} /> {errors.address}</div>}
        </div>

        {dupWarning && (
          <div style={{ marginTop: '1rem', padding: '0.7rem 0.85rem', background: 'hsla(38,92%,50%,0.1)', color: '#f59e0b', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertCircle size={15} /> Another supplier with this name already exists. You can still save if this is intentional.
          </div>
        )}

        {/* ── Step 2: Additional Information (collapsible) ─────────────── */}
        <button
          type="button"
          onClick={() => setMoreOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', fontWeight: 700, fontSize: '0.9rem', padding: 0, marginTop: '1.5rem' }}
          aria-expanded={moreOpen}
        >
          {moreOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Additional Information (optional)
        </button>

        {moreOpen && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Business */}
            <div>
              <div style={groupTitle}><Building2 size={13} /> Business</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {field('email', 'Email', 'contact@supplier.com', { type: 'email' })}
                {field('pan', 'PAN Number', 'AAPFU0939F')}
                {field('website', 'Website', 'https://supplier.com')}
              </div>
            </div>
            {/* Banking */}
            <div>
              <div style={groupTitle}><Landmark size={13} /> Banking</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {field('bankName', 'Bank Name', 'e.g. HDFC Bank')}
                {field('accountHolder', 'Account Holder', 'As per bank records')}
                {field('accountNumber', 'Account Number', '00000000000')}
                {field('ifsc', 'IFSC Code', 'HDFC0001234')}
              </div>
            </div>
            {/* Financial */}
            <div>
              <div style={groupTitle}><IndianRupee size={13} /> Financial</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {field('creditLimit', 'Credit Limit (₹)', '0', { type: 'number' })}
                {field('openingBalance', 'Opening Balance (₹)', '0', { type: 'number' })}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <FileText size={11} /> Opening balance is recorded for reference and does not change current Outstanding.
              </div>
            </div>
            {/* Preferences */}
            <div>
              <div style={groupTitle}><Settings2 size={13} /> Preferences</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select className="input-field" value={form.status} onChange={e => set('status', e.target.value)} style={{ width: '100%', margin: 0 }}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', paddingBottom: '0.65rem' }}>
                  <input type="checkbox" checked={form.isPreferred} onChange={e => set('isPreferred', e.target.checked)} />
                  Preferred Supplier
                </label>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  className="input-field"
                  placeholder="Optional remarks"
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={2}
                  style={{ width: '100%', margin: 0, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>Cancel</button>
          {isEdit ? (
            <button className="btn btn-primary" onClick={() => save(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> Save Changes</>}
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Save
              </button>
              <button className="btn btn-primary" onClick={() => save(true)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><ExternalLink size={15} /> Save & Open</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
