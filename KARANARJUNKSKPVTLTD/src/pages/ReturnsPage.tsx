import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, RotateCcw, Loader2, X, CheckCircle2, Printer, FileText } from 'lucide-react';
import {
  query, where, getDocs, orderBy, limit, doc,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { getDoc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import { prepareStockReturn, recordStockMovements } from '../utils/stockDeduction';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { PosInvoicePreview } from '../components/PosInvoicePreview';

// ── Types (POS/B2C line-item shape — mrp/amount, NOT unitPrice/price) ─────────
interface LineItem {
  productId?: string;
  productName: string;
  mfgCompany?: string;
  batchNo?: string;
  expDate?: string;
  quantity: number;
  unit?: string;
  mrp?: number;
  amount?: number;
  gstPct?: number;
}

interface SalesOrder {
  id: string;
  orderNumber: string;
  retailerName?: string;
  phoneNumber?: string;
  address?: string;
  pin?: string;
  taluka?: string;
  district?: string;
  retailerId?: string;
  invoiceType?: string;
  paymentMethod?: string;
  grandTotal?: number;
  createdAt?: any;
  invoiceDate?: string;
  status?: string;
  deleted?: boolean;
  lineItems: LineItem[];
  // Additive return linkage (may be absent on bills with no returns).
  returnedQty?: Record<string, number>;
  returnTotal?: number;
  returnIds?: string[];
  hasReturns?: boolean;
}

// Row state per original line index.
interface ReturnRow {
  lineIdx: number;
  returnQty: number;
}

const RETURN_REASONS = [
  'Defective / Damaged',
  'Wrong Item Delivered',
  'Customer Changed Mind',
  'Quality Not Satisfactory',
  'Expired / Near Expiry',
  'Other',
];
const REFUND_METHODS = ['Cash', 'Store Credit', 'Khata Adjustment', 'UPI / Bank Transfer'];

const BILL_FORMATS: ('A5' | 'A4')[] = ['A5', 'A4'];

// A sale is B2C (returnable in this iteration) when it is NOT a B2B GST invoice
// and NOT a plain B2B Sales Order (orderNumber 'SO-…'). Mirrors OrderHistoryPage.
function isB2C(o: { invoiceType?: string; orderNumber?: string }): boolean {
  return o.invoiceType !== 'B2B_GST' && !(o.orderNumber || '').startsWith('SO-');
}

const lineRate = (li: LineItem): number => Number(li.mrp) || 0;
const lineGst = (li: LineItem): number => (typeof li.gstPct === 'number' ? li.gstPct : 5);
const fmtINR = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ReturnsPage() {
  const { tenantId, currentUser, userName } = useAuth();
  const { showToast } = useToast();
  const { t, i18n } = useTranslation();
  const L = (key: string): string => t(`pos_bill.${key}`) as string;

  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [refundMethod, setRefundMethod] = useState(REFUND_METHODS[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [billFormat, setBillFormat] = useState<'A5' | 'A4'>('A5');

  const [branding, setBranding] = useState<any>(null);
  // Set after a successful return; drives the success panel + the print portal.
  const [completed, setCompleted] = useState<{
    returnNumber: string;
    order: SalesOrder;
    lines: any[];
    returnTotal: number;
  } | null>(null);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!tenantId) return;
    fetchInvoiceBranding(tenantId).then(setBranding).catch(() => {});
  }, [tenantId]);

  // Deep link from Order History: ?orderId=<id> pre-loads that bill's return form.
  useEffect(() => {
    const orderId = searchParams.get('orderId');
    if (!tenantId || !orderId) return;
    getDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId)).then(snap => {
      if (!snap.exists()) { showToast('That bill could not be found.', 'error'); return; }
      const data = { id: snap.id, ...snap.data() } as SalesOrder;
      if (!isB2C(data)) { showToast('Only B2C bills can be returned.', 'error'); return; }
      if (data.deleted || String(data.status || '').toLowerCase() === 'cancelled') { showToast('This bill is cancelled and cannot be returned.', 'error'); return; }
      selectOrder(data);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, searchParams]);

  if (!tenantId) return null;

  // ── Search original B2C invoices by bill no / phone / name ─────────────────
  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) return;
    setSearching(true);
    setSelectedOrder(null);
    setOrders([]);
    try {
      const col = getTenantCollection(db, tenantId!, 'salesOrders');
      const digits = term.replace(/\D/g, '');
      const results = new Map<string, SalesOrder>();

      const snaps = await Promise.all([
        // Exact bill number
        getDocs(query(col, where('orderNumber', '==', term), limit(10))),
        // Exact phone
        digits.length >= 8
          ? getDocs(query(col, where('phoneNumber', '==', term), orderBy('createdAt', 'desc'), limit(10)))
          : Promise.resolve({ docs: [] as any[] }),
        // Name prefix
        getDocs(query(col, where('retailerName', '>=', term), where('retailerName', '<=', term + ''), orderBy('retailerName'), limit(10))),
      ]);

      for (const snap of snaps) {
        for (const d of snap.docs) {
          const data = { id: d.id, ...d.data() } as SalesOrder;
          // B2C only, with line items, not soft-deleted or cancelled.
          if (!isB2C(data) || data.deleted) continue;
          if (String(data.status || '').toLowerCase() === 'cancelled') continue;
          if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) continue;
          results.set(d.id, data);
        }
      }

      const list = [...results.values()];
      setOrders(list);
      if (list.length === 0) showToast('No B2C bills found for that search.', 'error');
    } catch (e: any) {
      showToast('Search failed: ' + (e?.message || e), 'error');
    } finally {
      setSearching(false);
    }
  }

  function alreadyReturned(order: SalesOrder, lineIdx: number): number {
    return Number(order.returnedQty?.[String(lineIdx)] || 0);
  }
  function returnableQty(order: SalesOrder, lineIdx: number): number {
    const orig = Number(order.lineItems[lineIdx]?.quantity || 0);
    return Math.max(0, orig - alreadyReturned(order, lineIdx));
  }

  function selectOrder(order: SalesOrder) {
    setSelectedOrder(order);
    setRows((order.lineItems || []).map((_, lineIdx) => ({ lineIdx, returnQty: 0 })));
    setReason(RETURN_REASONS[0]);
    setRefundMethod(REFUND_METHODS[0]);
    setNotes('');
    setCompleted(null);
  }

  function setReturnQty(lineIdx: number, qty: number) {
    if (!selectedOrder) return;
    const max = returnableQty(selectedOrder, lineIdx);
    const clamped = Math.min(Math.max(0, Math.floor(qty || 0)), max);
    setRows(prev => prev.map(r => (r.lineIdx === lineIdx ? { ...r, returnQty: clamped } : r)));
  }

  // GST-inclusive return figures (same convention as the POS sale).
  function computeTotals(order: SalesOrder, activeRows: ReturnRow[]) {
    let subtotal = 0, taxable = 0, cgst = 0;
    for (const r of activeRows) {
      if (r.returnQty <= 0) continue;
      const li = order.lineItems[r.lineIdx];
      const amount = lineRate(li) * r.returnQty; // GST-inclusive
      const g = lineGst(li);
      const t0 = amount / (1 + g / 100);
      subtotal += amount;
      taxable += t0;
      cgst += (t0 * (g / 2)) / 100;
    }
    return { subtotal, taxable, cgst, sgst: cgst, totalTax: cgst * 2, returnTotal: subtotal };
  }

  const totals = selectedOrder ? computeTotals(selectedOrder, rows) : { subtotal: 0, taxable: 0, cgst: 0, sgst: 0, totalTax: 0, returnTotal: 0 };
  const hasReturnQty = rows.some(r => r.returnQty > 0);

  // ── Submit: one transaction — re-read, revalidate, create return, restock,
  //    link original, adjust customer counters, bump the CN counter. ──────────
  async function handleSubmit() {
    if (!selectedOrder || submitting) return;
    const activeRows = rows.filter(r => r.returnQty > 0);
    if (activeRows.length === 0) { showToast('Enter a return quantity for at least one product.', 'error'); return; }

    setSubmitting(true);
    try {
      // Resolve batch/product restore targets (queries can't run in a txn).
      const stockLines = activeRows.map(r => {
        const li = selectedOrder.lineItems[r.lineIdx];
        return { productId: li.productId || '', productName: li.productName, qty: r.returnQty, batchNo: li.batchNo };
      });
      const plan = await prepareStockReturn(tenantId!, stockLines);

      const orderRef = getTenantDoc(db, tenantId!, 'salesOrders', selectedOrder.id);
      const counterRef = getTenantDoc(db, tenantId!, 'counters', 'salesReturnCounter');
      const newReturnRef = doc(getTenantCollection(db, tenantId!, 'returns'));

      let returnNumber = '';
      let finalReturnTotal = 0;
      let finalLines: any[] = [];
      let movements: any[] = [];

      await runTransaction(db, async (tx) => {
        // reset per-attempt accumulators (a txn body can retry)
        movements = [];

        // ---- READS (all before any write) ----
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) throw new Error('The original bill no longer exists.');
        const order = { id: orderSnap.id, ...orderSnap.data() } as SalesOrder;

        if (!isB2C(order)) throw new Error('Only B2C bills can be returned in this flow.');
        if (order.deleted || String(order.status || '').toLowerCase() === 'cancelled')
          throw new Error('This bill is cancelled and cannot be returned.');

        const retailerRef = order.retailerId ? getTenantDoc(db, tenantId!, 'retailers', order.retailerId) : null;
        const retailerSnap = retailerRef ? await tx.get(retailerRef) : null;
        const counterSnap = await tx.get(counterRef);
        const productSnaps = await Promise.all(plan.productRestores.map(p => tx.get(getTenantDoc(db, tenantId!, 'products', p.productId))));
        const batchSnaps = await Promise.all(plan.batchRestores.map(b => tx.get(getTenantDoc(db, tenantId!, 'inventoryBatches', b.batchDocId))));

        // ---- REVALIDATE returnable against the FRESH doc (concurrency guard) ----
        const freshReturnedQty: Record<string, number> = { ...(order.returnedQty || {}) };
        const returnLines: any[] = [];
        for (const r of activeRows) {
          const li = order.lineItems[r.lineIdx];
          if (!li) throw new Error('A returned line no longer matches the bill.');
          const orig = Number(li.quantity || 0);
          const prior = Number(freshReturnedQty[String(r.lineIdx)] || 0);
          if (r.returnQty > orig - prior) {
            throw new Error(`Cannot return ${r.returnQty} of "${li.productName}". Only ${orig - prior} left to return.`);
          }
          const amount = lineRate(li) * r.returnQty;
          returnLines.push({
            lineIdx: r.lineIdx,
            productId: li.productId || '',
            productName: li.productName,
            mfgCompany: li.mfgCompany || '',
            batchNo: li.batchNo || '',
            expDate: li.expDate || '',
            unit: li.unit || 'pcs',
            mrp: lineRate(li),
            gstPct: lineGst(li),
            originalQty: orig,
            returnQty: r.returnQty,
            amount,
          });
          freshReturnedQty[String(r.lineIdx)] = prior + r.returnQty;
        }

        const tot = computeTotals(order, activeRows);
        finalReturnTotal = tot.returnTotal;
        finalLines = returnLines;

        // Credit Note number
        const seq = (counterSnap.exists() ? Number(counterSnap.data().lastReturnNumber || 0) : 0) + 1;
        returnNumber = `CN-${seq.toString().padStart(4, '0')}`;

        // ---- WRITES ----
        // 1) Return document
        tx.set(newReturnRef, {
          returnType: 'SALES_RETURN',
          channel: 'b2c',
          returnNumber,
          originalOrderId: order.id,
          originalOrderNumber: order.orderNumber || '',
          customerName: order.retailerName || 'Walk-in Customer',
          phoneNumber: order.phoneNumber || '',
          retailerId: order.retailerId || null,
          address: order.address || '',
          pin: order.pin || '',
          taluka: order.taluka || '',
          district: order.district || '',
          lineItems: returnLines,
          subtotalReturn: tot.subtotal,
          taxableReturn: tot.taxable,
          cgstReturn: tot.cgst,
          sgstReturn: tot.sgst,
          totalTaxReturn: tot.totalTax,
          returnTotal: tot.returnTotal,
          reason,
          refundMethod,
          notes: notes.trim() || '',
          status: 'completed',
          createdBy: currentUser?.uid || null,
          createdByName: userName || currentUser?.email || 'Unknown',
          returnDate: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
        });

        // 2) Restock — batch increments (record movements). Skip a batch that was
        //    deleted since prepare() (tx.update on a missing doc throws); the
        //    product-level loosePieces restore below still recovers the count.
        for (let i = 0; i < plan.batchRestores.length; i++) {
          const b = plan.batchRestores[i];
          const snap = batchSnaps[i];
          if (!snap.exists()) continue;
          const newQty = Number((snap.data() as any).quantity || 0) + b.qtyToAdd;
          tx.update(getTenantDoc(db, tenantId!, 'inventoryBatches', b.batchDocId), { quantity: newQty, updatedAt: serverTimestamp() });
          movements.push({ productId: b.productId, productName: b.productName, batchNumber: b.batchNumber, qtyIn: b.qtyToAdd, qtyOut: 0, remainingBatchQty: newQty, remainingStock: newQty });
        }

        // 3) Restock — product loosePieces (box/loose recompute for non-batch)
        for (let i = 0; i < plan.productRestores.length; i++) {
          const p = plan.productRestores[i];
          const snap = productSnaps[i];
          if (!snap.exists()) continue; // product deleted — nothing to restock into
          const pdata = snap.data() as any;
          const productRef = getTenantDoc(db, tenantId!, 'products', p.productId);
          if (p.isBatchModel) {
            // loosePieces mirrors the batch total → rise by the same qty.
            tx.update(productRef, { loosePieces: Number(pdata.loosePieces || 0) + p.qtyToAdd, updatedAt: serverTimestamp() });
          } else {
            const cap = Number(pdata.boxCapacity || 1);
            let loose = Number(pdata.loosePieces || 0) + p.qtyToAdd;
            let boxes = Number(pdata.quantity || 0);
            if (cap > 1 && loose >= cap) { boxes += Math.floor(loose / cap); loose = loose % cap; }
            tx.update(productRef, { quantity: boxes, loosePieces: loose, updatedAt: serverTimestamp() });
            movements.push({ productId: p.productId, productName: p.productName, batchNumber: '', qtyIn: p.qtyToAdd, qtyOut: 0, remainingBatchQty: 0, remainingStock: boxes * cap + loose });
          }
        }

        // 4) Additive linkage on the ORIGINAL sale — never touches core fields.
        tx.update(orderRef, {
          returnedQty: freshReturnedQty,
          returnTotal: Number(order.returnTotal || 0) + tot.returnTotal,
          returnIds: [...(Array.isArray(order.returnIds) ? order.returnIds : []), newReturnRef.id],
          hasReturns: true,
          updatedAt: serverTimestamp(),
        } as any);

        // 5) Customer financials — reduce totalSales; reduce outstanding only for
        //    credit/Khata sales. Paid-sale refunds are handled via refundMethod
        //    (recorded on the return doc); no negative salesOrders are created.
        if (retailerSnap && retailerSnap.exists()) {
          const rd = retailerSnap.data() as any;
          const wasCredit = order.paymentMethod === 'Khata';
          const updates: Record<string, any> = {
            totalSales: Math.max(0, Number(rd.totalSales || 0) - tot.returnTotal),
            updatedAt: serverTimestamp(),
          };
          if (wasCredit) {
            updates.outstandingAmount = Math.max(0, Number(rd.outstandingAmount || 0) - tot.returnTotal);
          }
          tx.update(retailerRef!, updates);
        }

        // 6) Bump the Credit Note counter
        tx.set(counterRef, { lastReturnNumber: seq }, { merge: true });
      });

      // Best-effort stock-movement audit trail (never blocks the committed return).
      if (movements.length > 0) {
        recordStockMovements(tenantId!, movements, {
          type: 'sales_return',
          sourceType: 'Sales Return',
          sourceId: newReturnRef.id,
          sourceNumber: returnNumber,
          date: new Date().toISOString().slice(0, 10),
        }).catch(console.error);
      }

      showToast(`Sales Return saved · ${returnNumber} · ${fmtINR(finalReturnTotal)}`, 'success');
      setCompleted({ returnNumber, order: selectedOrder, lines: finalLines, returnTotal: finalReturnTotal });
    } catch (e: any) {
      showToast(e?.message || 'Could not process the return. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Print the Credit Note through the shared POS print portal ──────────────
  function triggerPrint() {
    document.body.classList.add('pos-printing');
    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('pos-printing');
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 60);
  }

  function resetAll() {
    setSelectedOrder(null);
    setOrders([]);
    setSearchTerm('');
    setRows([]);
    setReason(RETURN_REASONS[0]);
    setRefundMethod(REFUND_METHODS[0]);
    setNotes('');
    setCompleted(null);
  }

  // Map return lines → PosInvoicePreview cart shape for the Credit Note.
  const creditNoteCart = completed
    ? completed.lines.map(li => ({
        name: li.productName,
        mfgCompany: li.mfgCompany,
        batchNo: li.batchNo,
        expDate: li.expDate,
        gstPct: li.gstPct,
        unit: li.unit,
        baseUnit: li.unit,
        cartQuantity: li.returnQty,
        cartTotal: li.amount,
        sellingPrice: li.mrp,
        maxRetailPrice: li.mrp,
      }))
    : [];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <RotateCcw size={30} /> {t('returns.title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('returns.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{L('bill_format')}</span>
          {BILL_FORMATS.map(f => (
            <button key={f} onClick={() => setBillFormat(f)}
              style={{ padding: '0.35rem 0.9rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', border: '1px solid var(--surface-border)', background: billFormat === f ? 'var(--primary)' : 'var(--surface-base)', color: billFormat === f ? '#fff' : 'var(--text-secondary)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Success panel */}
      {completed ? (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <CheckCircle2 size={56} style={{ color: 'var(--success, #10b981)', margin: '0 auto 1rem' }} />
          <h2 style={{ marginBottom: '0.4rem' }}>{t('returns.processed')}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('returns.credit_note')}: <strong>{completed.returnNumber}</strong> · {fmtINR(completed.returnTotal)}
          </p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {t('returns.against_bill')}: {completed.order.orderNumber}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={triggerPrint} className="btn" style={{ background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              <Printer size={18} /> {t('returns.print_credit_note')}
            </button>
            <button onClick={resetAll} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
              <RotateCcw size={18} /> {t('returns.new_return')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('returns.find_bill')}</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '2.5rem', margin: 0 }}
                  placeholder={t('returns.search_ph')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                />
              </div>
              <button onClick={handleSearch} disabled={searching || !searchTerm.trim()} className="btn"
                style={{ background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.4rem', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: searching || !searchTerm.trim() ? 0.6 : 1 }}>
                {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />} {t('returns.search')}
              </button>
            </div>

            {/* Results */}
            {orders.length > 0 && !selectedOrder && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {orders.map(o => (
                  <button key={o.id} onClick={() => selectOrder(o)}
                    style={{ textAlign: 'left', padding: '0.75rem 1rem', border: '1px solid var(--surface-border)', borderRadius: '10px', background: 'var(--surface-base)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{o.orderNumber}</span>
                      <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{o.retailerName || 'Walk-in'}</span>
                      {o.phoneNumber && <span style={{ marginLeft: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{o.phoneNumber}</span>}
                      {o.hasReturns && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>• {t('returns.has_returns')}</span>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{fmtINR(Number(o.grandTotal || 0))}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{o.invoiceDate || (o.createdAt?.toDate?.()?.toLocaleDateString?.() ?? '')}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Return form */}
          {selectedOrder && (
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{t('returns.returning_against')} {selectedOrder.orderNumber}</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
                    {selectedOrder.retailerName || 'Walk-in'} · {selectedOrder.paymentMethod === 'Khata' ? t('returns.credit_sale') : t('returns.paid_sale')}
                  </p>
                </div>
                <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
              </div>

              {/* Items table — POS bill columns + returnable/return-qty */}
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem' }}>#</th>
                      <th style={{ padding: '0.5rem' }}>{L('item_description')}</th>
                      <th style={{ padding: '0.5rem' }}>{L('company')}</th>
                      <th style={{ padding: '0.5rem' }}>{L('batch_no')}</th>
                      <th style={{ padding: '0.5rem' }}>{L('exp_date')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>{t('returns.orig_qty')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>{t('returns.already_returned')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>{t('returns.returnable')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>{t('returns.return_qty')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>{L('rate')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>{L('gst_pct')}</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('returns.return_amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.lineItems.map((li, idx) => {
                      const returnable = returnableQty(selectedOrder, idx);
                      const row = rows.find(r => r.lineIdx === idx);
                      const rq = row?.returnQty || 0;
                      const amount = lineRate(li) * rq;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--surface-border)', opacity: returnable === 0 ? 0.5 : 1 }}>
                          <td style={{ padding: '0.5rem', color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{li.productName}</td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{li.mfgCompany || '—'}</td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{li.batchNo || '—'}</td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{li.expDate || '—'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>{li.quantity}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>{alreadyReturned(selectedOrder, idx)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700, color: returnable === 0 ? 'var(--text-tertiary)' : '#2E7D32' }}>{returnable}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <input
                              type="number" min={0} max={returnable}
                              value={rq || ''}
                              disabled={returnable === 0}
                              onChange={e => setReturnQty(idx, Number(e.target.value))}
                              onWheel={e => e.currentTarget.blur()}
                              placeholder="0"
                              style={{ width: '68px', textAlign: 'center', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.3rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                            />
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{fmtINR(lineRate(li))}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>{lineGst(li)}%</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>{amount ? fmtINR(amount) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Reason / refund / notes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{t('returns.reason')}</label>
                  <select className="input-field" style={{ margin: 0 }} value={reason} onChange={e => setReason(e.target.value)}>
                    {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{t('returns.refund_method')}</label>
                  <select className="input-field" style={{ margin: 0 }} value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                    {REFUND_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{t('returns.notes')}</label>
                  <input className="input-field" style={{ margin: 0 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('returns.notes_ph')} />
                </div>
              </div>

              {/* Footer: total + submit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{t('returns.return_total')}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary-light)' }}>{fmtINR(totals.returnTotal)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('returns.via')} {refundMethod}</div>
                </div>
                <button onClick={handleSubmit} disabled={submitting || !hasReturnQty} className="btn"
                  style={{ background: '#1565C0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.8rem', borderRadius: '8px', fontWeight: 700, border: 'none', cursor: submitting || !hasReturnQty ? 'not-allowed' : 'pointer', opacity: submitting || !hasReturnQty ? 0.5 : 1 }}>
                  {submitting ? <Loader2 size={18} className="spin" /> : <FileText size={18} />} {t('returns.process')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Credit Note print portal — reuses the shared #pos-print-root + PosInvoicePreview */}
      {completed && createPortal(
        <div id="pos-print-root">
          <PosInvoicePreview
            cart={creditNoteCart}
            customer={{
              name: completed.order.retailerName, phone: completed.order.phoneNumber,
              address: completed.order.address, pin: completed.order.pin,
              taluka: completed.order.taluka, district: completed.order.district,
            }}
            branding={branding}
            billNumber={completed.returnNumber}
            originalBillNumber={completed.order.orderNumber}
            documentTitle="CREDIT NOTE"
            grandTotal={completed.returnTotal}
            billFormat={billFormat}
            invoiceDate={new Date().toISOString().split('T')[0]}
            modeOfPayment={refundMethod}
            L={L}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
