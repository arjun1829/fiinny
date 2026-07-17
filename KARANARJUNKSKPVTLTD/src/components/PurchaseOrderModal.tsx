import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package, Plus, Trash2, X, AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react';
import { addDoc, updateDoc, getDocs, query, where, orderBy, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import ProductAutocomplete, { type ProductLite } from './ProductAutocomplete';

/** A stored PO line item. */
export interface POLine {
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
  gstPct?: number;
  hsnCode?: string;
}

/** Minimal PO shape this modal needs to pre-fill in edit mode. */
export interface POForEdit {
  id: string;
  poNumber?: string;
  internalPurchaseId?: string;
  poDate?: string;
  date?: Timestamp | string;
  status?: string;
  notes?: string;
  lines?: POLine[];
  items?: { description?: string; name?: string; quantity?: number; qty?: number; unit?: string; rate?: number; amount?: number }[];
}

interface PurchaseOrderModalProps {
  /** Linked supplier name written onto new POs (preserves the existing name-based join). */
  supplierName: string;
  /** Pass a PO to edit, or null/undefined to add a new one. */
  editing?: POForEdit | null;
  onClose: () => void;
  /** Called after a successful save — parent runs its existing load(true) recompute. */
  onSaved: () => void;
}

type FormLine = { description: string; quantity: string; unit: string; rate: string };
const emptyLine = (): FormLine => ({ description: '', quantity: '', unit: '', rate: '' });

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Normalize a PO's stored lines/items into editable form lines (mirrors the page's poLines). */
function poFormLines(po: POForEdit): FormLine[] {
  if (Array.isArray(po.lines) && po.lines.length) {
    return po.lines.map(l => ({
      description: l.description ?? '', quantity: String(l.quantity ?? ''),
      unit: l.unit ?? '', rate: String(l.rate ?? ''),
    }));
  }
  if (Array.isArray(po.items) && po.items.length) {
    return po.items.map(it => ({
      description: it.description ?? it.name ?? '',
      quantity: String(it.quantity ?? it.qty ?? ''),
      unit: it.unit ?? '', rate: String(it.rate ?? ''),
    }));
  }
  return [emptyLine()];
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '0.3rem',
};

export default function PurchaseOrderModal({ supplierName, editing, onClose, onSaved }: PurchaseOrderModalProps) {
  const { tenantId, currentUser } = useAuth();
  const isEdit = !!editing;

  const [form, setForm] = useState<{ poNumber: string; internalPurchaseId: string; poDate: string; status: string; notes: string; lines: FormLine[] }>(
    () => editing
      ? {
          poNumber: editing.poNumber ?? '',
          internalPurchaseId: editing.internalPurchaseId ?? '',
          poDate: editing.poDate ?? (typeof editing.date === 'string' ? editing.date : today()),
          status: editing.status ?? 'received',
          notes: editing.notes ?? '',
          lines: poFormLines(editing),
        }
      : { poNumber: '', internalPurchaseId: '', poDate: today(), status: 'received', notes: '', lines: [emptyLine()] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Product catalog for the description autocomplete — fetched once per modal open.
  const [products, setProducts] = useState<ProductLite[]>([]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // The auto-generated Internal Purchase ID (create mode only). Used to detect
  // manual overrides so the uniqueness check only runs when the value changed.
  const autoGenIdRef = useRef<string>('');

  // Autofocus first field. State is seeded once; parent remounts on open.
  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Load the product catalog once for product suggestions (read-only).
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(getTenantCollection(db, tenantId, 'products'), orderBy('name')));
        if (!cancelled) {
          setProducts(snap.docs.map(d => {
            const data = d.data() as { name?: string; baseUnit?: string; unit?: string };
            return { id: d.id, name: data.name ?? '', baseUnit: data.baseUnit, unit: data.unit };
          }));
        }
      } catch {
        // Non-fatal: autocomplete just shows no suggestions; manual typing still works.
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Auto-generate the Internal Purchase ID on create (never on edit).
  // Uses an atomic year-scoped counter — the same race-safe pattern as the
  // B2B invoice number generator (counters/{name} via runTransaction).
  useEffect(() => {
    if (isEdit || !tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const year = new Date().getFullYear();
        const counterRef = getTenantDoc(db, tenantId, 'counters', 'internalPurchaseId');
        let seq = 1;
        await runTransaction(db, async tx => {
          const snap = await tx.get(counterRef);
          const data = snap.exists() ? snap.data() as { year?: number; seq?: number } : null;
          seq = (data && data.year === year) ? (data.seq || 0) + 1 : 1;
          tx.set(counterRef, { year, seq }, { merge: true });
        });
        const generated = `PUR-${year}-${String(seq).padStart(6, '0')}`;
        if (!cancelled) {
          autoGenIdRef.current = generated;
          // Only fill if the user hasn't already typed something.
          setForm(f => f.internalPurchaseId ? f : { ...f, internalPurchaseId: generated });
        }
      } catch {
        // Non-fatal: the user can still type an Internal Purchase ID manually.
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, tenantId]);

  /** Auto-fill description + unit from a picked product. Rate is left for the user
   *  to enter from the supplier bill (catalog purchase prices may be stale). */
  const selectProduct = (i: number, p: ProductLite) =>
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, idx) => idx === i
        ? { ...l, description: p.name, unit: l.unit || p.baseUnit || p.unit || '' }
        : l),
    }));

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const formTotal = useMemo(
    () => form.lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0), 0),
    [form.lines]
  );

  const setLine = (i: number, key: keyof FormLine, val: string) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [key]: val } : l) }));
  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (i: number) =>
    setForm(f => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines }));

  const handleSave = async () => {
    if (!tenantId) return;
    if (!form.poNumber.trim()) { setError('Enter a PO / bill number'); return; }
    // Identical line math to the original inline handler.
    const lines: POLine[] = form.lines
      .filter(l => l.description.trim())
      .map(l => {
        const q = parseFloat(l.quantity) || 0;
        const r = parseFloat(l.rate) || 0;
        return { description: l.description.trim(), quantity: q, unit: l.unit.trim(), rate: r, amount: +(q * r).toFixed(2) };
      });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const internalId = form.internalPurchaseId.trim();
    setSaving(true); setError(null);
    try {
      // Uniqueness check only when the ID was manually changed from the
      // auto-generated value (the auto value is already unique via the counter).
      const isManualOverride = internalId !== '' && internalId !== autoGenIdRef.current;
      if (isManualOverride) {
        const dupSnap = await getDocs(query(
          getTenantCollection(db, tenantId, 'purchaseOrders'),
          where('internalPurchaseId', '==', internalId),
        ));
        const clash = dupSnap.docs.some(d => d.id !== editing?.id);
        if (clash) {
          setError(`Internal Purchase ID "${internalId}" already exists. Choose a different one.`);
          setSaving(false);
          return;
        }
      }

      if (editing) {
        await updateDoc(getTenantDoc(db, tenantId, 'purchaseOrders', editing.id), {
          poNumber: form.poNumber.trim(), internalPurchaseId: internalId, poDate: form.poDate, status: form.status,
          notes: form.notes.trim(), lines, totalAmount: total, taxableValue: total, updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(getTenantCollection(db, tenantId, 'purchaseOrders'), {
          supplierName, poNumber: form.poNumber.trim(), internalPurchaseId: internalId, poDate: form.poDate, status: form.status,
          notes: form.notes.trim(), lines, totalAmount: total, taxableValue: total,
          createdAt: serverTimestamp(), createdBy: currentUser?.email ?? '',
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save purchase order');
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
      aria-label={isEdit ? 'Edit Purchase Order' : 'Add Purchase Order'}
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

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Package size={18} className="primary-gradient-text" /> {isEdit ? 'Edit Purchase Order' : 'Add Purchase Order'}
        </h2>

        {error && (
          <div style={{ padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>PO / Bill No. *</label>
            <input ref={firstFieldRef} className="input-field" placeholder="e.g. UAB/1620/25-26" value={form.poNumber} onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))} style={{ width: '100%', margin: 0 }} />
          </div>
          <div>
            <label style={labelStyle}>Date *</label>
            <input className="input-field" type="date" value={form.poDate} onChange={e => setForm(f => ({ ...f, poDate: e.target.value }))} style={{ width: '100%', margin: 0 }} />
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Internal Purchase ID</label>
          <input
            className="input-field"
            placeholder="PUR-2026-000001"
            value={form.internalPurchaseId}
            readOnly
            title="ERP-generated — not editable"
            style={{ width: '100%', margin: 0, opacity: 0.75, cursor: 'default', background: 'var(--surface-raised)' }}
          />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
            ERP-generated unique purchase reference. Independent of the supplier's invoice number.
          </div>
        </div>

        <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>Products</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {form.lines.map((l, i) => {
            const amt = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
            return (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <ProductAutocomplete
                  value={l.description}
                  onChange={val => setLine(i, 'description', val)}
                  onSelect={p => selectProduct(i, p)}
                  products={products}
                  placeholder="Type to search product…"
                />
                <input className="input-field" type="number" placeholder="Qty" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} style={{ width: '76px', margin: 0 }} />
                <input className="input-field" placeholder="Unit" value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} style={{ width: '84px', margin: 0 }} />
                <input className="input-field" type="number" placeholder="Rate" value={l.rate} onChange={e => setLine(i, 'rate', e.target.value)} style={{ width: '100px', margin: 0 }} />
                <span style={{ width: '92px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>{inr(amt)}</span>
                <button onClick={() => removeLine(i)} className="btn-icon" title="Remove line" style={{ padding: '0.3rem', color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
        <button className="btn btn-secondary" onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
          <Plus size={13} /> Add line
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select className="input-field" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%', margin: 0 }}>
              {['received', 'pending', 'partial', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 700, textAlign: 'right' }}>PO Total</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ff9800', textAlign: 'right' }}>{inr(formTotal)}</div>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            className="input-field"
            placeholder="Care-off retailer, reference / bill no., delivery terms, or any remarks for this purchase…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            style={{ width: '100%', margin: 0, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.75rem' }}>
          <button className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.poNumber.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> {isEdit ? 'Save Changes' : 'Add PO'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
