import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package, Plus, Trash2, X, AlertCircle, Loader2, CheckCircle2, Tag,
} from 'lucide-react';
import { addDoc, updateDoc, getDocs, query, where, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';

/** A stored PO line item. */
export interface POLine {
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
  gstPct?: number;
  hsnCode?: string;
  packaging?: string;
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

/** One item in a supplier price list (fetched when supplierId is provided). */
interface PriceListItem {
  id: string;
  productName: string;
  packaging: string;
  purchaseRate: number;
  gstPct: number;
}

interface PurchaseOrderModalProps {
  supplierId?: string;
  supplierName: string;
  editing?: POForEdit | null;
  onClose: () => void;
  onSaved: () => void;
}

type FormLine = {
  priceListItemId: string;
  description: string;
  packaging: string;
  quantity: string;
  unit: string;
  rate: string;
  gstPct: string;
};

const emptyLine = (): FormLine => ({
  priceListItemId: '', description: '', packaging: '',
  quantity: '', unit: '', rate: '', gstPct: '0',
});

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function poFormLines(po: POForEdit): FormLine[] {
  if (Array.isArray(po.lines) && po.lines.length) {
    return po.lines.map(l => ({
      priceListItemId: '',
      description: l.description ?? '',
      packaging: l.packaging ?? '',
      quantity: String(l.quantity ?? ''),
      unit: l.unit ?? '',
      rate: String(l.rate ?? ''),
      gstPct: String(l.gstPct ?? '0'),
    }));
  }
  if (Array.isArray(po.items) && po.items.length) {
    return po.items.map(it => ({
      priceListItemId: '',
      description: it.description ?? it.name ?? '',
      packaging: '',
      quantity: String(it.quantity ?? it.qty ?? ''),
      unit: it.unit ?? '',
      rate: String(it.rate ?? ''),
      gstPct: '0',
    }));
  }
  return [emptyLine()];
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '0.3rem',
};

export default function PurchaseOrderModal({ supplierId, supplierName, editing, onClose, onSaved }: PurchaseOrderModalProps) {
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
      : { poNumber: '', internalPurchaseId: '', poDate: today(), status: 'pending', notes: '', lines: [emptyLine()] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poNumberTouched, setPoNumberTouched] = useState(false);
  const [priceList, setPriceList] = useState<PriceListItem[]>([]);
  const [plLoading, setPlLoading] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const autoGenIdRef = useRef<string>('');

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Load supplier price list when supplierId is provided
  useEffect(() => {
    if (!tenantId || !supplierId) return;
    let cancelled = false;
    setPlLoading(true);
    getDocs(getTenantCollection(db, tenantId, 'suppliers', supplierId, 'priceList'))
      .then(snap => {
        if (cancelled) return;
        setPriceList(snap.docs.map(d => ({ id: d.id, ...d.data() } as PriceListItem))
          .sort((a, b) => a.productName.localeCompare(b.productName)));
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setPlLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, supplierId]);

  // When editing a saved PO, backfill priceListItemId by matching saved description against price list
  useEffect(() => {
    if (priceList.length === 0) return;
    setForm(f => ({
      ...f,
      lines: f.lines.map(l => {
        if (l.priceListItemId) return l;
        const match =
          priceList.find(p => p.productName === l.description && p.packaging === l.packaging) ??
          priceList.find(p => p.productName === l.description);
        return match ? { ...l, priceListItemId: match.id } : l;
      }),
    }));
  }, [priceList]);

  // Auto-generate Internal Purchase ID on create
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
          setForm(f => f.internalPurchaseId ? f : { ...f, internalPurchaseId: generated });
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [isEdit, tenantId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  // When a price list product is selected, auto-fill the line
  const selectPriceListItem = (lineIdx: number, itemId: string) => {
    const item = priceList.find(p => p.id === itemId);
    if (!item) return;
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => i === lineIdx ? {
        ...l,
        priceListItemId: item.id,
        description: item.productName,
        packaging: item.packaging,
        unit: item.packaging,
        rate: String(item.purchaseRate),
        gstPct: String(item.gstPct),
      } : l),
    }));
  };

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
    if (!form.poNumber.trim()) { setPoNumberTouched(true); setError('Enter a PO / bill number to save.'); return; }
    const lines: POLine[] = form.lines
      .filter(l => l.description.trim())
      .map(l => {
        const q = parseFloat(l.quantity) || 0;
        const r = parseFloat(l.rate) || 0;
        return {
          description: l.description.trim(),
          quantity: q,
          unit: l.unit.trim() || l.packaging.trim(),
          packaging: l.packaging.trim(),
          rate: r,
          amount: +(q * r).toFixed(2),
          gstPct: parseFloat(l.gstPct) || 0,
        };
      });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const internalId = form.internalPurchaseId.trim();
    setSaving(true); setError(null);
    try {
      const isManualOverride = internalId !== '' && internalId !== autoGenIdRef.current;
      if (isManualOverride) {
        const dupSnap = await getDocs(query(
          getTenantCollection(db, tenantId, 'purchaseOrders'),
          where('internalPurchaseId', '==', internalId),
        ));
        if (dupSnap.docs.some(d => d.id !== editing?.id)) {
          setError(`Internal Purchase ID "${internalId}" already exists.`);
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

  const hasPriceList = priceList.length > 0;

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
      role="dialog" aria-modal="true"
      aria-label={isEdit ? 'Edit Purchase Order' : 'Add Purchase Order'}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto',
          padding: '1.75rem', position: 'relative', borderRadius: '16px',
          animation: 'scaleUp 0.22s ease-out',
        }}
      >
        <button onClick={() => !saving && onClose()} className="btn-icon" aria-label="Close"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
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

        {/* Header fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>PO / Bill No. *</label>
            <input
              ref={firstFieldRef}
              className="input-field"
              placeholder="e.g. UAB/1620/25-26"
              value={form.poNumber}
              onChange={e => setForm(f => ({ ...f, poNumber: e.target.value }))}
              onBlur={() => setPoNumberTouched(true)}
              style={{ width: '100%', margin: 0, borderColor: poNumberTouched && !form.poNumber.trim() ? '#ff4d4f' : undefined }}
            />
            {poNumberTouched && !form.poNumber.trim() && (
              <div style={{ fontSize: '0.72rem', color: '#ff4d4f', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertCircle size={11} /> Enter the supplier's bill or invoice number to save.
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Date *</label>
            <input className="input-field" type="date" value={form.poDate}
              onChange={e => setForm(f => ({ ...f, poDate: e.target.value }))} style={{ width: '100%', margin: 0 }} />
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Internal Purchase ID</label>
          <input className="input-field" placeholder="PUR-2026-000001" value={form.internalPurchaseId} readOnly
            title="ERP-generated — not editable"
            style={{ width: '100%', margin: 0, opacity: 0.75, cursor: 'default', background: 'var(--surface-raised)' }} />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.3rem' }}>
            ERP-generated unique purchase reference.
          </div>
        </div>

        {/* Products */}
        <label style={{ ...labelStyle, marginBottom: '0.5rem' }}>
          Products
          {plLoading && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>loading price list…</span>}
          {!plLoading && hasPriceList && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--primary-light)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
              <Tag size={11} /> {priceList.length} products from supplier price list
            </span>
          )}
        </label>

        {/* Loading state */}
        {plLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            <Loader2 size={16} className="animate-spin" /> Loading supplier price list…
          </div>
        )}

        {/* Empty price list — block entry, prompt user to set up price list first */}
        {!plLoading && supplierId && !hasPriceList && (
          <div style={{ padding: '1rem', background: 'hsla(45,93%,47%,0.08)', border: '1px solid hsla(45,93%,47%,0.3)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <Tag size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.05rem' }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>No price list configured for this supplier</div>
              Go to the supplier profile → <strong>Price List</strong> tab and add products before creating a PO.
            </div>
          </div>
        )}

        {/* Product lines — only shown when price list is available */}
        {!plLoading && hasPriceList && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {form.lines.map((l, i) => {
              const qty = parseFloat(l.quantity) || 0;
              const rate = parseFloat(l.rate) || 0;
              const amt = qty * rate;
              const gst = parseFloat(l.gstPct) || 0;

              return (
                <div key={i} style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Row 1: price-list-only product selector */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      className="input-field"
                      value={l.priceListItemId}
                      onChange={e => selectPriceListItem(i, e.target.value)}
                      style={{ flex: 1, margin: 0 }}
                    >
                      <option value="">— Select product —</option>
                      {priceList.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.productName}{item.packaging ? ` (${item.packaging})` : ''} — ₹{item.purchaseRate} + {item.gstPct}% GST
                        </option>
                      ))}
                    </select>
                    <button onClick={() => removeLine(i)} className="btn-icon" title="Remove line"
                      style={{ padding: '0.3rem', color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Row 2: auto-filled fields + quantity */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Packaging — read-only from price list, editable for overrides */}
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>PKG</span>
                      <input className="input-field" placeholder="packaging" value={l.packaging}
                        onChange={e => setLine(i, 'packaging', e.target.value)}
                        style={{ width: '80px', margin: 0, fontSize: '0.8rem', padding: '0.25rem 0.4rem', color: l.priceListItemId ? 'var(--text-secondary)' : undefined }} />
                    </div>
                    {/* Rate */}
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>RATE</span>
                      <input className="input-field" type="number" placeholder="₹" value={l.rate}
                        onChange={e => setLine(i, 'rate', e.target.value)}
                        style={{ width: '90px', margin: 0, fontSize: '0.8rem', padding: '0.25rem 0.4rem' }} />
                    </div>
                    {/* GST */}
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>GST%</span>
                      <input className="input-field" type="number" placeholder="0" value={l.gstPct}
                        onChange={e => setLine(i, 'gstPct', e.target.value)}
                        style={{ width: '64px', margin: 0, fontSize: '0.8rem', padding: '0.25rem 0.4rem' }} />
                    </div>
                    {/* Quantity — highlighted as primary input */}
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginLeft: 'auto' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>QTY</span>
                      <input className="input-field" type="number" placeholder="0"
                        value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)}
                        style={{ width: '80px', margin: 0, fontSize: '0.9rem', padding: '0.3rem 0.4rem', fontWeight: 700,
                          border: '2px solid var(--primary-light)', boxShadow: '0 0 0 2px hsla(210,80%,50%,0.15)' }} />
                    </div>
                    {/* Amount */}
                    <div style={{ minWidth: '90px', textAlign: 'right', fontSize: '0.88rem', fontWeight: 700, color: '#ff9800', flexShrink: 0 }}>
                      {amt > 0 ? inr(amt) : ''}
                      {amt > 0 && gst > 0 && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                          +{inr(amt * gst / 100)} GST
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!plLoading && hasPriceList && (
          <button className="btn btn-secondary" onClick={addLine}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
            <Plus size={13} /> Add product
          </button>
        )}

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
          <textarea className="input-field" placeholder="Care-off retailer, reference / bill no., delivery terms, or any remarks…"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2} style={{ width: '100%', margin: 0, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.75rem' }}>
          <button className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.poNumber.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={15} /> {isEdit ? 'Save Changes' : 'Add PO'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
