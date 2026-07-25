import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Printer, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import {
  getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { syncSupplierTotals } from '../utils/supplierLedgerSync';
import { postSupplierInvoiceToInventory, type PostedLine } from '../utils/inventoryPosting';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { fmtINR } from '../utils/gstCalculator';
import { calcPurchaseLine, calcPurchaseTotals, rateWithGstToWithoutGst, rateWithoutGstToWithGst, type PurchaseLineInput } from '../utils/purchaseInvoiceCalc';
import ProductAutocomplete, { type ProductLite } from '../components/ProductAutocomplete';

const today = () => new Date().toISOString().slice(0, 10);

// ── Types ─────────────────────────────────────────────────────────────────────
type Line = {
  productId: string;
  productName: string;
  packaging: string;
  gstPct: string;       // auto from price list / master; editable
  rateWithGst: string;  // PRIMARY USER INPUT — rate including GST
  creditRate: string;
  qtyPerBox: string;
  boxQty: string;       // secondary user input
};

const emptyLine = (): Line => ({
  productId: '', productName: '', packaging: '',
  gstPct: '5', rateWithGst: '', creditRate: '', qtyPerBox: '', boxQty: '',
});

interface SupplierDoc {
  name?: string; address?: string; gstin?: string; phone?: string; email?: string; contactPerson?: string; state?: string;
}

interface PriceListItem {
  id: string;
  productName: string;
  packaging: string;
  purchaseRate: number; // rate WITHOUT GST stored in price list
  gstPct: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const n = (s: string | number | undefined) => parseFloat(String(s ?? 0)) || 0;

function computeLine(l: Line) {
  const gstPct = n(l.gstPct);
  // Derive rate excluding GST from the user-entered rate including GST
  const rateWithoutGst = rateWithGstToWithoutGst(n(l.rateWithGst), gstPct);
  const input: PurchaseLineInput = {
    rateWithoutGst,
    gstPct,
    creditRate: n(l.creditRate),
    qtyPerBox: n(l.qtyPerBox),
    boxQty: n(l.boxQty),
  };
  return { ...input, ...calcPurchaseLine(input) };
}

function isActiveLine(l: { productName: string; boxQty: string | number }) {
  return l.productName.trim() !== '' || n(l.boxQty) > 0;
}

const AutoCell = ({ children }: { children: React.ReactNode }) => (
  <td style={tdAuto}>{children}</td>
);

// ── Styles ────────────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  border: '1px solid var(--surface-border)', padding: '6px 8px',
  background: 'var(--surface-raised)', fontWeight: 700, fontSize: '0.72rem',
  whiteSpace: 'nowrap', textAlign: 'center', color: 'var(--text-secondary)',
  position: 'sticky', top: 0, zIndex: 2,
};
const tdInput: React.CSSProperties = {
  border: '1px solid var(--surface-border)', padding: '3px 4px', fontSize: '0.8rem',
};
const tdAuto: React.CSSProperties = {
  border: '1px solid var(--surface-border)', padding: '4px 8px',
  fontSize: '0.8rem', textAlign: 'right', color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};
const tdAutoCenter: React.CSSProperties = { ...tdAuto, textAlign: 'center' };
const summaryRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '0.35rem 0', fontSize: '0.875rem', borderBottom: '1px solid var(--surface-border)',
};

export default function SupplierInvoicePage() {
  const { tenantId, tenantData, currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const supplierIdParam = searchParams.get('supplierId') || '';
  const invoiceIdParam = searchParams.get('invoiceId') || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<{ businessName?: string; address?: string; gstin?: string; contact?: string; email?: string; signatureName?: string; signatureUrl?: string } | null>(null);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [priceList, setPriceList] = useState<PriceListItem[]>([]);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string>(invoiceIdParam);

  const autoGenIdRef = useRef<string>('');
  // Stock already posted to inventory by a prior save — reversed before re-posting
  // so editing an invoice never double-counts stock.
  const prevPostedRef = useRef<PostedLine[]>([]);

  const [supplier, setSupplier] = useState<SupplierDoc>({});
  const [meta, setMeta] = useState({
    internalPurchaseId: '',
    supplierInvoiceNumber: '',
    invoiceDate: today(),
    status: 'received',
  });
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: 5 }, emptyLine));

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [brd, prodSnap, supSnap, plSnap] = await Promise.all([
          fetchInvoiceBranding(tenantId),
          getDocs(query(getTenantCollection(db, tenantId, 'products'), orderBy('name'))),
          supplierIdParam
            ? getDoc(getTenantDoc(db, tenantId, 'suppliers', supplierIdParam))
            : Promise.resolve(null),
          supplierIdParam
            ? getDocs(getTenantCollection(db, tenantId, 'suppliers', supplierIdParam, 'priceList'))
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setBranding(brd as unknown as typeof branding);
        const masterProducts = prodSnap.docs.map(d => {
          const p = d.data() as {
            name?: string; baseUnit?: string; unit?: string;
            purchasePrice?: number; gstPct?: number; retailerPrice?: number;
            boxCapacity?: number; unitSize?: number; unitMeasure?: string;
          };
          return {
            id: d.id,
            name: p.name ?? '',
            baseUnit: p.baseUnit,
            unit: p.unit,
            purchasePrice: p.purchasePrice,
            gstPct: p.gstPct,
            retailerPrice: p.retailerPrice,
            boxCapacity: p.boxCapacity,
            unitSize: p.unitSize,
            unitMeasure: p.unitMeasure,
          };
        });
        setProducts(masterProducts);

        if (plSnap) {
          setPriceList(
            plSnap.docs
              .map(d => ({ id: d.id, ...d.data() } as PriceListItem))
              .sort((a, b) => a.productName.localeCompare(b.productName))
          );
        }

        if (supSnap && supSnap.exists()) {
          const s = supSnap.data() as SupplierDoc;
          setSupplier({ name: s.name ?? '', address: s.address ?? '', gstin: s.gstin ?? '', phone: s.phone ?? '', email: s.email ?? '', contactPerson: s.contactPerson ?? '', state: s.state ?? '' });
        }

        if (invoiceIdParam) {
          const invSnap = await getDoc(getTenantDoc(db, tenantId, 'supplierInvoices', invoiceIdParam));
          if (invSnap.exists() && !cancelled) loadInvoice(invSnap.data());
        } else {
          await generateInternalId(tenantId);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, supplierIdParam, invoiceIdParam]);

  const generateInternalId = async (tid: string) => {
    try {
      const year = new Date().getFullYear();
      const counterRef = getTenantDoc(db, tid, 'counters', 'internalPurchaseId');
      let seq = 1;
      await runTransaction(db, async tx => {
        const snap = await tx.get(counterRef);
        const data = snap.exists() ? snap.data() as { year?: number; seq?: number } : null;
        seq = (data && data.year === year) ? (data.seq || 0) + 1 : 1;
        tx.set(counterRef, { year, seq }, { merge: true });
      });
      const generated = `PUR-${year}-${String(seq).padStart(6, '0')}`;
      autoGenIdRef.current = generated;
      setMeta(m => m.internalPurchaseId ? m : { ...m, internalPurchaseId: generated });
    } catch {
      // Non-fatal — user can type manually.
    }
  };

  const loadInvoice = (d: Record<string, unknown>) => {
    setSupplier({
      name: String(d.supplierName ?? ''), address: String(d.supplierAddress ?? ''),
      gstin: String(d.supplierGstin ?? ''), phone: String(d.supplierPhone ?? ''),
      email: String(d.supplierEmail ?? ''), contactPerson: String(d.supplierContactPerson ?? ''),
      state: String(d.supplierState ?? ''),
    });
    setMeta(m => ({
      ...m,
      internalPurchaseId: String(d.internalPurchaseId ?? ''),
      supplierInvoiceNumber: String(d.supplierInvoiceNumber ?? ''),
      invoiceDate: String(d.invoiceDate ?? today()),
      status: String(d.status ?? 'received'),
    }));
    autoGenIdRef.current = String(d.internalPurchaseId ?? '');

    const rawLines = Array.isArray(d.lines) ? d.lines : [];
    if (rawLines.length > 0) {
      setLines(rawLines.map((l: Record<string, unknown>) => {
        const gstPct = n((l.gstPct as string | number | undefined) ?? 5);
        // New format stores rateWithGst directly; old format stored rateWithoutGst — convert forward.
        const rateWithGst = l.rateWithGst != null
          ? String(l.rateWithGst)
          : String(rateWithoutGstToWithGst(n((l.rateWithoutGst as string | number | undefined) ?? (l.rate as string | number | undefined) ?? 0), gstPct) || '');
        return {
          productId: String(l.productId ?? ''),
          productName: String(l.productName ?? l.description ?? ''),
          packaging: String(l.packaging ?? ''),
          gstPct: String(gstPct),
          rateWithGst,
          creditRate: String(l.creditRate ?? ''),
          qtyPerBox: String(l.qtyPerBox ?? ''),
          boxQty: String(l.boxQty ?? ''),
        };
      }));
    }
  };

  // ── Line helpers ──────────────────────────────────────────────────────────
  const setLine = (i: number, key: keyof Line, val: string) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [key]: val } : l));

  /** Select a product from the supplier price list. Auto-fills packaging, GST%,
   *  and Rate with GST (= purchaseRate × (1+gstPct/100) — user confirms). */
  const selectFromPriceList = (i: number, itemId: string) => {
    const item = priceList.find(p => p.id === itemId);
    if (!item) return;
    const gstPct = item.gstPct;
    const rateWithGst = rateWithoutGstToWithGst(item.purchaseRate, gstPct);
    // Try to enrich with creditRate / qtyPerBox from master products by name match
    const masterMatch = products.find(
      p => p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()
    );
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l,
      productId: masterMatch?.id ?? '',
      productName: item.productName,
      packaging: item.packaging,
      gstPct: String(gstPct),
      rateWithGst: String(rateWithGst),
      creditRate: masterMatch?.retailerPrice != null ? String(masterMatch.retailerPrice) : l.creditRate,
      qtyPerBox: masterMatch?.boxCapacity != null ? String(masterMatch.boxCapacity) : l.qtyPerBox,
    } : l));
  };

  /** Select a product from the master catalog (fallback when no price list). */
  const selectFromMaster = (i: number, p: ProductLite) => {
    const gstPct = p.gstPct ?? 0;
    const rateWithGst = p.purchasePrice != null
      ? String(rateWithoutGstToWithGst(p.purchasePrice, gstPct))
      : '';
    const packaging = p.unitSize && p.unitMeasure ? `${p.unitSize}${p.unitMeasure}` : (p.baseUnit ?? p.unit ?? '');
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l,
      productId: p.id,
      productName: p.name,
      packaging,
      gstPct: String(gstPct),
      rateWithGst: rateWithGst || l.rateWithGst,
      creditRate: p.retailerPrice != null ? String(p.retailerPrice) : l.creditRate,
      qtyPerBox: p.boxCapacity != null ? String(p.boxCapacity) : l.qtyPerBox,
    } : l));
  };

  const addLine = () => setLines(ls => [...ls, emptyLine()]);
  const removeLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  // ── Computed ──────────────────────────────────────────────────────────────
  const computed = useMemo(() => {
    return lines.map(l => ({ ...l, ...computeLine(l) }));
  }, [lines]);

  const activeComputed = useMemo(() => computed.filter(l => isActiveLine(l)), [computed]);

  const totals = useMemo(() => calcPurchaseTotals(activeComputed), [activeComputed]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const buildPayload = () => ({
    supplierId: supplierIdParam || null,
    supplierName: (supplier.name || '').trim(),
    supplierAddress: (supplier.address || '').trim(),
    supplierGstin: (supplier.gstin || '').trim(),
    supplierPhone: (supplier.phone || '').trim(),
    supplierEmail: (supplier.email || '').trim(),
    supplierContactPerson: (supplier.contactPerson || '').trim(),
    supplierState: (supplier.state || '').trim(),
    internalPurchaseId: meta.internalPurchaseId.trim(),
    supplierInvoiceNumber: meta.supplierInvoiceNumber.trim(),
    invoiceDate: meta.invoiceDate,
    status: meta.status,
    lines: activeComputed.map(l => ({
      productId: l.productId,
      productName: l.productName.trim(),
      packaging: l.packaging,
      gstPct: n(l.gstPct),
      rateWithGst: n(l.rateWithGst),                                     // user input
      rateWithoutGst: rateWithGstToWithoutGst(n(l.rateWithGst), n(l.gstPct)), // derived
      creditRate: n(l.creditRate),
      qtyPerBox: n(l.qtyPerBox),
      boxQty: n(l.boxQty),
      qty: l.qty,
      amountWithoutGst: l.amountWithoutGst,
      gstAmount: l.gstAmount,
      amountWithGst: l.amountWithGst,
      creditAmount: l.creditAmount,
      differenceAmount: l.differenceAmount,
      unitValue: l.unitValue,
    })),
    totalBoxQty: totals.totalBoxQty,
    totalQty: totals.totalQty,
    totalAmountWithoutGst: totals.totalAmountWithoutGst,
    totalGst: totals.totalGst,
    totalAmountWithGst: totals.totalAmountWithGst,
    totalCreditAmount: totals.totalCreditAmount,
    totalDifferenceAmount: totals.totalDifferenceAmount,
    totalUnitValue: totals.totalUnitValue,
    netAmount: totals.totalAmountWithGst,  // used by supplier ledger sync
  });

  const validate = async (): Promise<boolean> => {
    if (!supplier.name?.trim()) { setError('Supplier name is required'); return false; }
    if (!meta.supplierInvoiceNumber.trim()) { setError('Bill No. is required'); return false; }
    if (activeComputed.length === 0) { setError('Add at least one product line'); return false; }
    const internalId = meta.internalPurchaseId.trim();
    if (internalId && internalId !== autoGenIdRef.current && tenantId) {
      const dup = await getDocs(query(getTenantCollection(db, tenantId, 'supplierInvoices'), where('internalPurchaseId', '==', internalId)));
      if (dup.docs.some(d => d.id !== savedInvoiceId)) {
        setError(`Internal Purchase ID "${internalId}" already exists.`);
        return false;
      }
    }
    return true;
  };

  const persist = async (): Promise<string | null> => {
    if (!tenantId) return null;
    setError(null);
    if (!(await validate())) return null;
    setSaving(true);
    try {
      const payload = buildPayload();
      let id: string;
      if (savedInvoiceId) {
        await updateDoc(getTenantDoc(db, tenantId, 'supplierInvoices', savedInvoiceId), { ...payload, updatedAt: serverTimestamp() });
        id = savedInvoiceId;
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'supplierInvoices'), {
          ...payload, createdAt: serverTimestamp(), createdBy: currentUser?.email ?? '',
        });
        setSavedInvoiceId(ref.id);
        id = ref.id;
      }
      if (payload.supplierId) {
        syncSupplierTotals(db, tenantId, payload.supplierId).catch(err =>
          console.error('Ledger sync failed (invoice already saved):', err));
      }
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save invoice');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const id = await persist();
    if (id) alert('Purchase invoice saved.');
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const container = document.querySelector('.si-card') as HTMLElement | null;
    const html = container ? container.outerHTML : document.body.innerHTML;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(el => el.outerHTML).join('\n');
    const win = window.open('', '_blank');
    if (!win) { window.print(); return; }
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Purchase Invoice ${meta.internalPurchaseId}</title>
${styles}
<style>
  @page { size: A3 landscape; margin: 8mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; box-sizing: border-box; }
  html, body { background: #fff !important; color: #000 !important; margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 8pt; }
  .si-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; background: #fff !important; color: #000 !important; max-width: 100% !important; }
  .no-print { display: none !important; }
  .si-print-only { display: block !important; }
  input, select, textarea, button { display: none !important; }
  .pi-header { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border: 1px solid #000; margin-bottom: 6px; }
  .pi-header-col { padding: 6px 8px; }
  .pi-header-col:first-child { border-right: 1px solid #ccc; }
  .pi-meta { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid #000; margin-bottom: 6px; }
  .pi-meta > div { padding: 4px 6px; border-right: 1px solid #ccc; }
  .pi-meta > div:last-child { border-right: none; }
  .pi-label { font-size: 7pt; color: #666; text-transform: uppercase; }
  .pi-val { font-weight: 700; font-size: 8.5pt; }
  .pi-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .pi-table th, .pi-table td { border: 1px solid #999; padding: 2px 3px; font-size: 7pt; vertical-align: middle; }
  .pi-table th { background: #f0f0f0; font-weight: 700; text-align: center; }
  .pi-table td.r { text-align: right; }
  .pi-table td.c { text-align: center; }
  .pi-table tfoot td { background: #e8e8e8; font-weight: 700; }
  .pi-totals { margin-top: 6px; display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; border: 1px solid #000; padding: 6px; }
  .pi-tot-item { text-align: center; }
  .pi-tot-label { font-size: 6.5pt; color: #555; }
  .pi-tot-val { font-size: 9pt; font-weight: 700; }
  .pi-diff { color: #1a6600; }
</style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 700);
  };

  const handleSaveAndPrint = async () => {
    const id = await persist();
    if (id) setTimeout(handlePrint, 150);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" style={{ margin: '0 auto' }} /></div>;

  const companyName = branding?.businessName || (tenantData as { businessName?: string } | null)?.businessName || 'Your Business Name';

  const inputStyle = (width?: string): React.CSSProperties => ({
    width: width || '100%', margin: 0, padding: '0.4rem 0.5rem', fontSize: '0.82rem',
  });

  return (
    <div className="si-wrapper" style={{ background: 'var(--surface-base)', padding: '1.5rem', minHeight: '100vh' }}>
      <style>{`.si-print-only { display: none; }`}</style>

      {/* Toolbar */}
      <div className="no-print" style={{ maxWidth: '1400px', margin: '0 auto 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => navigate(supplierIdParam ? `/supplier-ledger/${supplierIdParam}` : '/supplier-ledger')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
          <ArrowLeft size={16} /> Back to Supplier
        </button>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={handleSaveAndPrint} disabled={saving} className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1565C0', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />} Save & Print
          </button>
          <button onClick={handlePrint} className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', color: '#1565C0', border: '2px solid #1565C0', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700 }}>
            <Printer size={16} /> Print
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem', fontWeight: 700 }}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {savedInvoiceId ? 'Update Invoice' : 'Save Invoice'}
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print" style={{ maxWidth: '1400px', margin: '0 auto 1rem', padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div className="si-card glass-panel" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.75rem', borderRadius: '12px' }}>

        {/* ── Print-only layout ─────────────────────────────────────────── */}
        <div className="si-print-only">
          <h2 style={{ textAlign: 'center', margin: '0 0 6px', fontSize: '13pt' }}>Purchase Invoice</h2>

          <div className="pi-header">
            <div className="pi-header-col">
              <div className="pi-label">Supplier</div>
              <div className="pi-val">{supplier.name}</div>
              {supplier.address && <div>{supplier.address}</div>}
              {supplier.gstin && <div>GSTIN: {supplier.gstin}</div>}
              {supplier.phone && <div>{supplier.phone}</div>}
              {supplier.state && <div>State: {supplier.state}</div>}
            </div>
            <div className="pi-header-col">
              <div className="pi-label">Buyer</div>
              <div className="pi-val">{companyName}</div>
              {branding?.address && <div>{branding.address}</div>}
              {branding?.gstin && <div>GSTIN: {branding.gstin}</div>}
              {branding?.contact && <div>{branding.contact}</div>}
            </div>
          </div>

          <div className="pi-meta">
            <div><div className="pi-label">Internal Purchase ID</div><div className="pi-val">{meta.internalPurchaseId || '—'}</div></div>
            <div><div className="pi-label">Bill No.</div><div className="pi-val">{meta.supplierInvoiceNumber || '—'}</div></div>
            <div><div className="pi-label">Purchase Date</div><div className="pi-val">{meta.invoiceDate || '—'}</div></div>
            <div><div className="pi-label">Status</div><div className="pi-val">{meta.status}</div></div>
          </div>

          <table className="pi-table">
            <thead>
              <tr>
                <th style={{ width: '22px' }}>#</th>
                <th style={{ width: '130px' }}>Product</th>
                <th style={{ width: '40px' }}>Pkg</th>
                <th style={{ width: '28px' }}>GST%</th>
                <th style={{ width: '50px' }}>Rate<br/>+GST</th>
                <th style={{ width: '50px' }}>Rate<br/>w/o GST</th>
                <th style={{ width: '46px' }}>Credit<br/>Rate</th>
                <th style={{ width: '32px' }}>Qty/<br/>Box</th>
                <th style={{ width: '32px' }}>Box<br/>Qty</th>
                <th style={{ width: '32px' }}>Qty</th>
                <th style={{ width: '52px' }}>Amt<br/>w/o GST</th>
                <th style={{ width: '44px' }}>GST<br/>Amt</th>
                <th style={{ width: '52px' }}>Amt<br/>+GST</th>
                <th style={{ width: '52px' }}>Credit<br/>Amt</th>
                <th style={{ width: '44px' }}>Diff<br/>Amt</th>
                <th style={{ width: '44px' }}>Unit<br/>Value</th>
              </tr>
            </thead>
            <tbody>
              {activeComputed.map((l, i) => (
                <tr key={i}>
                  <td className="c">{i + 1}</td>
                  <td>{l.productName}</td>
                  <td className="c">{l.packaging}</td>
                  <td className="c">{l.gstPct}%</td>
                  <td className="r">{n(l.rateWithGst).toFixed(2)}</td>
                  <td className="r">{rateWithGstToWithoutGst(n(l.rateWithGst), n(l.gstPct)).toFixed(2)}</td>
                  <td className="r">{l.creditRate}</td>
                  <td className="c">{l.qtyPerBox}</td>
                  <td className="c">{l.boxQty}</td>
                  <td className="c">{l.qty}</td>
                  <td className="r">{fmtINR(l.amountWithoutGst)}</td>
                  <td className="r">{fmtINR(l.gstAmount)}</td>
                  <td className="r">{fmtINR(l.amountWithGst)}</td>
                  <td className="r">{fmtINR(l.creditAmount)}</td>
                  <td className="r" style={{ color: l.differenceAmount >= 0 ? '#1a6600' : '#c00' }}>{fmtINR(l.differenceAmount)}</td>
                  <td className="r">{fmtINR(l.unitValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} className="c">TOTALS</td>
                <td className="c">{totals.totalBoxQty}</td>
                <td className="c">{totals.totalQty}</td>
                <td className="r">{fmtINR(totals.totalAmountWithoutGst)}</td>
                <td className="r">{fmtINR(totals.totalGst)}</td>
                <td className="r">{fmtINR(totals.totalAmountWithGst)}</td>
                <td className="r">{fmtINR(totals.totalCreditAmount)}</td>
                <td className="r" style={{ color: totals.totalDifferenceAmount >= 0 ? '#1a6600' : '#c00' }}>{fmtINR(totals.totalDifferenceAmount)}</td>
                <td className="r">{fmtINR(totals.totalUnitValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Screen editor ─────────────────────────────────────────────── */}
        <div className="no-print">
          <h2 style={{ textAlign: 'center', margin: '0 0 1.5rem', fontSize: '1.3rem', fontWeight: 800 }}>Purchase Invoice</h2>

          {/* Section 1: Purchase Details */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              1 · Purchase Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>

              {/* Supplier block */}
              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem', gridColumn: 'span 2' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary-light)', marginBottom: '0.75rem' }}>Supplier</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Name *</label>
                    <input className="input-field" value={supplier.name || ''} onChange={e => setSupplier(s => ({ ...s, name: e.target.value }))} placeholder="Supplier name" style={inputStyle()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>GSTIN</label>
                    <input className="input-field" value={supplier.gstin || ''} onChange={e => setSupplier(s => ({ ...s, gstin: e.target.value }))} placeholder="GSTIN" style={inputStyle()} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Address</label>
                    <input className="input-field" value={supplier.address || ''} onChange={e => setSupplier(s => ({ ...s, address: e.target.value }))} placeholder="Address" style={inputStyle()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Phone</label>
                    <input className="input-field" value={supplier.phone || ''} onChange={e => setSupplier(s => ({ ...s, phone: e.target.value }))} placeholder="Phone" style={inputStyle()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>State</label>
                    <input className="input-field" value={supplier.state || ''} onChange={e => setSupplier(s => ({ ...s, state: e.target.value }))} placeholder="State" style={inputStyle()} />
                  </div>
                </div>
              </div>

              {/* Bill details */}
              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary-light)', marginBottom: '0.25rem' }}>Bill Details</div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Bill No. (Supplier Invoice) *</label>
                  <input className="input-field" value={meta.supplierInvoiceNumber} onChange={e => setMeta(m => ({ ...m, supplierInvoiceNumber: e.target.value }))} placeholder="e.g. INV-48" style={inputStyle()} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Purchase Date</label>
                  <input className="input-field" type="date" value={meta.invoiceDate} onChange={e => setMeta(m => ({ ...m, invoiceDate: e.target.value }))} style={inputStyle()} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Internal Purchase ID</label>
                  <input className="input-field" value={meta.internalPurchaseId} readOnly title="Auto-generated" style={{ ...inputStyle(), opacity: 0.7, cursor: 'not-allowed', background: 'var(--surface-raised)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Status</label>
                  <select className="input-field" value={meta.status} onChange={e => setMeta(m => ({ ...m, status: e.target.value }))} style={inputStyle()}>
                    <option value="received">Received</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Products Table */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              2 · Products
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--surface-border)', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1600px', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '38px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '38px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '62px' }} />
                  <col style={{ width: '106px' }} />
                  <col style={{ width: '96px' }} />
                  <col style={{ width: '96px' }} />
                  <col style={{ width: '76px' }} />
                  <col style={{ width: '76px' }} />
                  <col style={{ width: '60px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '36px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Product Name</th>
                    <th style={thStyle}>Packaging</th>
                    <th style={{ ...thStyle, background: 'hsla(220,40%,30%,0.3)' }}>GST %</th>
                    <th style={{ ...thStyle, background: 'var(--primary-light)', color: '#fff' }}>Rate +GST ✏</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Rate w/o GST</th>
                    <th style={{ ...thStyle, background: 'hsla(220,40%,30%,0.3)' }}>Credit Rate</th>
                    <th style={{ ...thStyle, background: 'hsla(220,40%,30%,0.3)' }}>Qty/Box</th>
                    <th style={{ ...thStyle, background: 'var(--secondary)', color: '#fff' }}>Box Qty ✏</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Qty</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Amt w/o GST</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>GST Amt</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Amt +GST</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Credit Amt</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Diff Amt</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Unit Value</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const c = computed[i];
                    const derivedRateWithoutGst = rateWithGstToWithoutGst(n(l.rateWithGst), n(l.gstPct));
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'hsla(220,20%,50%,0.04)' }}>
                        <td style={{ ...tdAuto, textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>

                        {/* Product selector — price list when available, else master search */}
                        <td style={tdInput}>
                          {priceList.length > 0 ? (
                            <select
                              className="input-field"
                              value={
                                priceList.find(p => p.productName === l.productName && p.packaging === l.packaging)?.id ??
                                priceList.find(p => p.productName === l.productName)?.id ??
                                ''
                              }
                              onChange={e => selectFromPriceList(i, e.target.value)}
                              style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
                            >
                              <option value="">— Select from price list —</option>
                              {priceList.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.productName}{item.packaging ? ` (${item.packaging})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <ProductAutocomplete
                              value={l.productName}
                              onChange={v => setLine(i, 'productName', v)}
                              onSelect={p => selectFromMaster(i, p)}
                              products={products}
                              placeholder="Search product…"
                              style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
                            />
                          )}
                        </td>

                        {/* Packaging — auto-filled, editable */}
                        <td style={tdInput}>
                          <input className="input-field" value={l.packaging} onChange={e => setLine(i, 'packaging', e.target.value)} placeholder="e.g. 500ml"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} />
                        </td>

                        {/* GST % — auto-filled from price list, editable */}
                        <td style={tdInput}>
                          <input className="input-field" type="number" value={l.gstPct} onChange={e => setLine(i, 'gstPct', e.target.value)} placeholder="5"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }} />
                        </td>

                        {/* Rate with GST — PRIMARY USER INPUT */}
                        <td style={{ ...tdInput, background: 'hsla(210,80%,50%,0.08)' }}>
                          <input className="input-field" type="number" value={l.rateWithGst} onChange={e => setLine(i, 'rateWithGst', e.target.value)} placeholder="0.00"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.88rem', textAlign: 'right', fontWeight: 700 }} />
                        </td>

                        {/* Rate without GST — auto-computed */}
                        <td style={{ ...tdAutoCenter, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {derivedRateWithoutGst > 0 ? derivedRateWithoutGst.toFixed(2) : '—'}
                        </td>

                        {/* Credit Rate — editable */}
                        <td style={tdInput}>
                          <input className="input-field" type="number" value={l.creditRate} onChange={e => setLine(i, 'creditRate', e.target.value)} placeholder="0"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }} />
                        </td>

                        {/* Qty/Box — auto, editable */}
                        <td style={tdInput}>
                          <input className="input-field" type="number" value={l.qtyPerBox} onChange={e => setLine(i, 'qtyPerBox', e.target.value)} placeholder="0"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }} />
                        </td>

                        {/* Box Qty — SECONDARY USER INPUT */}
                        <td style={{ ...tdInput, background: 'hsla(var(--secondary-hsl, 145,60%,40%),0.08)' }}>
                          <input className="input-field" type="number" value={l.boxQty} onChange={e => setLine(i, 'boxQty', e.target.value)} placeholder="0"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 700 }} />
                        </td>

                        <AutoCell>{c.qty > 0 ? c.qty : '—'}</AutoCell>
                        <AutoCell>{c.amountWithoutGst > 0 ? fmtINR(c.amountWithoutGst) : '—'}</AutoCell>
                        <AutoCell>{c.gstAmount > 0 ? fmtINR(c.gstAmount) : '—'}</AutoCell>
                        <AutoCell>{c.amountWithGst > 0 ? fmtINR(c.amountWithGst) : '—'}</AutoCell>
                        <AutoCell>{c.creditAmount > 0 ? fmtINR(c.creditAmount) : '—'}</AutoCell>
                        <td style={{ ...tdAuto, color: c.differenceAmount >= 0 ? '#22c55e' : '#ef4444' }}>
                          {c.differenceAmount !== 0 ? fmtINR(c.differenceAmount) : '—'}
                        </td>
                        <AutoCell>{c.unitValue > 0 ? fmtINR(c.unitValue) : '—'}</AutoCell>
                        <td style={{ ...tdAuto, textAlign: 'center', padding: '4px' }}>
                          <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-secondary" onClick={addLine}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              <Plus size={13} /> Add Row
            </button>
          </div>

          {/* Section 3: Summary */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              3 · Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>

              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Quantities</div>
                <div style={summaryRow}><span style={{ fontSize: '0.82rem' }}>Total Box Qty</span><strong>{totals.totalBoxQty}</strong></div>
                <div style={{ ...summaryRow, borderBottom: 'none' }}><span style={{ fontSize: '0.82rem' }}>Total Qty</span><strong>{totals.totalQty}</strong></div>
              </div>

              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Purchase Amounts</div>
                <div style={summaryRow}><span style={{ fontSize: '0.82rem' }}>Total Amount w/o GST</span><strong>{fmtINR(totals.totalAmountWithoutGst)}</strong></div>
                <div style={summaryRow}><span style={{ fontSize: '0.82rem' }}>Total GST</span><strong>{fmtINR(totals.totalGst)}</strong></div>
                <div style={{ ...summaryRow, borderBottom: 'none', fontSize: '1rem' }}>
                  <span style={{ fontWeight: 700 }}>Total Amount +GST</span>
                  <strong style={{ color: 'var(--secondary)', fontSize: '1.1rem' }}>{fmtINR(totals.totalAmountWithGst)}</strong>
                </div>
              </div>

              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Credit & Margin</div>
                <div style={summaryRow}><span style={{ fontSize: '0.82rem' }}>Total Credit Amount</span><strong>{fmtINR(totals.totalCreditAmount)}</strong></div>
                <div style={{ ...summaryRow, borderBottom: 'none' }}>
                  <span style={{ fontSize: '0.82rem' }}>Total Difference</span>
                  <strong style={{ color: totals.totalDifferenceAmount >= 0 ? '#22c55e' : '#ef4444' }}>
                    {fmtINR(totals.totalDifferenceAmount)}
                  </strong>
                </div>
              </div>

              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Unit Economics</div>
                <div style={{ ...summaryRow, borderBottom: 'none' }}><span style={{ fontSize: '0.82rem' }}>Total Unit Value</span><strong>{fmtINR(totals.totalUnitValue)}</strong></div>
              </div>

            </div>
          </div>

        </div>{/* end screen editor */}
      </div>
    </div>
  );
}
