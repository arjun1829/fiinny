import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Loader2, Search, X, Printer, FileText } from 'lucide-react';
import { query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { useTranslation } from 'react-i18next';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { PosInvoicePreview } from '../components/PosInvoicePreview';

// A returned original sale (B2C only in this iteration).
interface SalesOrder {
  id: string;
  orderNumber?: string;
  retailerName?: string;
  phoneNumber?: string;
  address?: string;
  pin?: string;
  taluka?: string;
  district?: string;
  invoiceType?: string;
  invoiceDate?: string;
  createdAt?: any;
  paymentMethod?: string;
  grandTotal?: number;
  returnTotal?: number;
  hasReturns?: boolean;
  deleted?: boolean;
  lineItems?: any[];
}

interface ReturnLine {
  lineIdx?: number;
  productName: string;
  mfgCompany?: string;
  batchNo?: string;
  expDate?: string;
  unit?: string;
  mrp?: number;
  gstPct?: number;
  originalQty?: number;
  returnQty: number;
  amount: number;
}

interface ReturnDoc {
  id: string;
  returnNumber?: string;
  originalOrderId: string;
  originalOrderNumber?: string;
  customerName?: string;
  phoneNumber?: string;
  address?: string;
  pin?: string;
  taluka?: string;
  district?: string;
  lineItems: ReturnLine[];
  returnTotal?: number;
  reason?: string;
  refundMethod?: string;
  notes?: string;
  status?: string;
  returnDate?: string;
  createdAt?: any;
}

// B2C only — a sale that is neither a B2B GST invoice nor a plain B2B Sales
// Order (orderNumber 'SO-…'). Mirrors ReturnsPage/OrderHistoryPage.
function isB2C(o: { invoiceType?: string; orderNumber?: string }): boolean {
  return o.invoiceType !== 'B2B_GST' && !(o.orderNumber || '').startsWith('SO-');
}

const fmtINR = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const toDateStr = (o: { invoiceDate?: string; createdAt?: any }) =>
  o.invoiceDate || (o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : '—');
const returnDateStr = (r: ReturnDoc) =>
  r.returnDate || (r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : '—');

export default function SalesReturnsPage() {
  const { tenantId } = useAuth();
  const { t } = useTranslation();
  const L = (key: string): string => t(`pos_bill.${key}`) as string;

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [returns, setReturns] = useState<ReturnDoc[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [branding, setBranding] = useState<any>(null);
  const [billFormat, setBillFormat] = useState<'A5' | 'A4'>('A5');

  const [selected, setSelected] = useState<SalesOrder | null>(null);
  // A specific return to print as a CREDIT NOTE (drives the print portal).
  const [printPayload, setPrintPayload] = useState<{ order: SalesOrder; ret: ReturnDoc } | null>(null);

  // Only bills that carry a completed Sales Return — driven by the additive
  // `hasReturns` linkage, NOT the whole order book. Order History still shows all.
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(
      query(getTenantCollection(db, tenantId, 'salesOrders'), where('hasReturns', '==', true)),
      (snap) => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as SalesOrder)
          .filter(o => isB2C(o) && !o.deleted);
        setOrders(list);
        setLoadingOrders(false);
      },
      () => setLoadingOrders(false),
    );
    return () => unsub();
  }, [tenantId]);

  // All B2C sales returns, grouped per original bill below.
  useEffect(() => {
    if (!tenantId) return;
    const unsub = onSnapshot(
      query(getTenantCollection(db, tenantId, 'returns'), where('channel', '==', 'b2c')),
      (snap) => {
        setReturns(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ReturnDoc));
        setLoadingReturns(false);
      },
      () => setLoadingReturns(false),
    );
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    fetchInvoiceBranding(tenantId).then(setBranding).catch(() => {});
  }, [tenantId]);

  // originalOrderId → its returns (newest first).
  const returnsByOrder = useMemo(() => {
    const map = new Map<string, ReturnDoc[]>();
    for (const r of returns) {
      const arr = map.get(r.originalOrderId) || [];
      arr.push(r);
      map.set(r.originalOrderId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (returnDateStr(b) > returnDateStr(a) ? 1 : -1));
    }
    return map;
  }, [returns]);

  const loading = loadingOrders || loadingReturns;

  const rows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders
      .map(o => {
        const rets = returnsByOrder.get(o.id) || [];
        const latest = rets[0];
        return {
          order: o,
          returns: rets,
          // Prefer the cumulative linkage total; fall back to summing the returns.
          returnedAmount: Number(o.returnTotal ?? rets.reduce((s, r) => s + Number(r.returnTotal || 0), 0)),
          latestReturnDate: latest ? returnDateStr(latest) : '—',
          status: rets.length > 0 && rets.every(r => (r.status || 'completed') === 'completed') ? 'Completed' : 'Processed',
        };
      })
      .filter(r => !term
        || (r.order.orderNumber || '').toLowerCase().includes(term)
        || (r.order.retailerName || '').toLowerCase().includes(term))
      .sort((a, b) => (b.latestReturnDate > a.latestReturnDate ? 1 : -1));
  }, [orders, returnsByOrder, searchTerm]);

  // ── Credit Note print (shared POS print portal + PosInvoicePreview) ────────
  function printCreditNote(order: SalesOrder, ret: ReturnDoc) {
    setPrintPayload({ order, ret });
    document.body.classList.add('pos-printing');
    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('pos-printing');
    };
    window.addEventListener('afterprint', cleanup);
    // Let the portal render the selected return before invoking print.
    setTimeout(() => window.print(), 80);
  }

  const invoiceCart = (lineItems: any[] | undefined, isReturn: boolean) =>
    (lineItems || []).map((li: any) => ({
      name: li.productName,
      mfgCompany: li.mfgCompany,
      batchNo: li.batchNo,
      expDate: li.expDate,
      gstPct: li.gstPct,
      unit: li.unit,
      baseUnit: li.unit,
      cartQuantity: isReturn ? li.returnQty : li.quantity,
      cartTotal: li.amount,
      sellingPrice: li.mrp,
      maxRetailPrice: li.mrp,
    }));

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <RotateCcw size={30} /> {t('salesReturns.title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('salesReturns.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{L('bill_format')}</span>
          {(['A5', 'A4'] as const).map(f => (
            <button key={f} onClick={() => setBillFormat(f)}
              style={{ padding: '0.35rem 0.9rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', border: '1px solid var(--surface-border)', background: billFormat === f ? 'var(--primary)' : 'var(--surface-base)', color: billFormat === f ? '#fff' : 'var(--text-secondary)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" className="input-field" style={{ paddingLeft: '2.5rem', margin: 0 }}
            placeholder={t('salesReturns.search_ph')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{rows.length} {t('salesReturns.records')}</span>
      </div>

      {/* Table */}
      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={40} className="spin" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>{t('salesReturns.loading')}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <th style={{ padding: '1rem', fontWeight: 600 }}>{t('salesReturns.bill_no')}</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>{t('salesReturns.customer')}</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>{t('salesReturns.bill_date')}</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>{t('salesReturns.bill_amount')}</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>{t('salesReturns.returned_amount')}</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>{t('salesReturns.return_date')}</th>
                <th style={{ padding: '1rem', fontWeight: 600 }}>{t('salesReturns.status')}</th>
                <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>{t('salesReturns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <RotateCcw size={44} style={{ margin: '0 auto 1rem', opacity: 0.2, display: 'block' }} />
                    <p>{t('salesReturns.empty')}</p>
                  </td>
                </tr>
              ) : rows.map(({ order, returns: rets, returnedAmount, latestReturnDate, status }) => (
                <tr key={order.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{order.orderNumber || 'N/A'}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{order.retailerName || 'Walk-in'}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{toDateStr(order)}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-primary)' }}>{fmtINR(Number(order.grandTotal || 0))}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{fmtINR(returnedAmount)}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{latestReturnDate}{rets.length > 1 ? ` · ${rets.length} CNs` : ''}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 600 }}>{status}</span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      <button onClick={() => setSelected(order)} title={t('salesReturns.view')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.7rem', background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}>
                        <FileText size={13} /> {t('salesReturns.view')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail modal — original invoice + all linked returns ─────────────── */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'hsla(220,30%,4%,0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
          onClick={() => setSelected(null)}>
          <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', padding: '1.5rem', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selected.orderNumber}</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {selected.retailerName || 'Walk-in'} · {toDateStr(selected)} · {fmtINR(Number(selected.grandTotal || 0))}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={22} /></button>
            </div>

            {/* Original invoice (reuses the invoice layout; read-only) */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                {t('salesReturns.original_invoice')}
              </div>
              <div style={{ background: '#fff', borderRadius: '6px', overflow: 'auto' }}>
                <PosInvoicePreview
                  cart={invoiceCart(selected.lineItems, false)}
                  customer={{ name: selected.retailerName, phone: selected.phoneNumber, address: selected.address, pin: selected.pin, taluka: selected.taluka, district: selected.district }}
                  branding={branding}
                  billNumber={selected.orderNumber || ''}
                  grandTotal={Number(selected.grandTotal || 0)}
                  billFormat={billFormat}
                  invoiceDate={selected.invoiceDate}
                  modeOfPayment={selected.paymentMethod || 'Cash'}
                  L={L}
                />
              </div>
            </div>

            {/* Linked returns */}
            <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              {t('salesReturns.linked_returns')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(returnsByOrder.get(selected.id) || []).map(ret => (
                <div key={ret.id} style={{ border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '1rem', background: 'var(--surface-base)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t('salesReturns.credit_note')} {ret.returnNumber}
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '99px', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 700 }}>{ret.status || 'completed'}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                        {returnDateStr(ret)}{ret.reason ? ` · ${ret.reason}` : ''}{ret.refundMethod ? ` · ${ret.refundMethod}` : ''}
                      </div>
                    </div>
                    <button onClick={() => printCreditNote(selected, ret)} className="btn"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                      <Printer size={15} /> {t('salesReturns.print_credit_note')}
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                          <th style={{ padding: '0.4rem' }}>{L('item_description')}</th>
                          <th style={{ padding: '0.4rem' }}>{L('batch_no')}</th>
                          <th style={{ padding: '0.4rem', textAlign: 'center' }}>{t('salesReturns.returned_qty')}</th>
                          <th style={{ padding: '0.4rem', textAlign: 'right' }}>{L('rate')}</th>
                          <th style={{ padding: '0.4rem', textAlign: 'center' }}>{L('gst_pct')}</th>
                          <th style={{ padding: '0.4rem', textAlign: 'right' }}>{t('salesReturns.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ret.lineItems.map((li, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                            <td style={{ padding: '0.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>{li.productName}</td>
                            <td style={{ padding: '0.4rem', color: 'var(--text-secondary)' }}>{li.batchNo || '—'}</td>
                            <td style={{ padding: '0.4rem', textAlign: 'center' }}>{li.returnQty}</td>
                            <td style={{ padding: '0.4rem', textAlign: 'right' }}>{fmtINR(Number(li.mrp || 0))}</td>
                            <td style={{ padding: '0.4rem', textAlign: 'center' }}>{typeof li.gstPct === 'number' ? li.gstPct : 5}%</td>
                            <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 700 }}>{fmtINR(Number(li.amount || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 800 }}>
                          <td colSpan={5} style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{t('salesReturns.return_total')}</td>
                          <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', color: '#f59e0b' }}>{fmtINR(Number(ret.returnTotal || 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {ret.notes && <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{t('salesReturns.notes')}: {ret.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Credit Note print portal — reuses the shared #pos-print-root + PosInvoicePreview */}
      {printPayload && createPortal(
        <div id="pos-print-root">
          <PosInvoicePreview
            cart={invoiceCart(printPayload.ret.lineItems, true)}
            customer={{
              name: printPayload.ret.customerName || printPayload.order.retailerName,
              phone: printPayload.ret.phoneNumber || printPayload.order.phoneNumber,
              address: printPayload.ret.address || printPayload.order.address,
              pin: printPayload.ret.pin || printPayload.order.pin,
              taluka: printPayload.ret.taluka || printPayload.order.taluka,
              district: printPayload.ret.district || printPayload.order.district,
            }}
            branding={branding}
            billNumber={printPayload.ret.returnNumber || ''}
            originalBillNumber={printPayload.order.orderNumber}
            documentTitle="CREDIT NOTE"
            grandTotal={Number(printPayload.ret.returnTotal || 0)}
            billFormat={billFormat}
            invoiceDate={printPayload.ret.returnDate}
            modeOfPayment={printPayload.ret.refundMethod || 'Cash'}
            L={L}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
