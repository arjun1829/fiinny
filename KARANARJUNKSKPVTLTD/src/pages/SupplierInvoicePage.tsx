import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Printer, Loader2 } from 'lucide-react';
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
import { PURCHASE_PRINT_CSS } from '../utils/purchaseInvoiceHtml';
import { rateWithGstToWithoutGst, rateWithoutGstToWithGst } from '../utils/purchaseInvoiceCalc';
import ProductAutocomplete, { type ProductLite } from '../components/ProductAutocomplete';

const today = () => new Date().toISOString().slice(0, 10);
const fmtDateDMY = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return (y && m && d) ? `${d}/${m}/${y}` : s; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const n = (s: string | number | undefined) => parseFloat(String(s ?? 0)) || 0;

const GST_OPTIONS = [0, 5, 12, 18, 28];

// ── Types ─────────────────────────────────────────────────────────────────────
type Line = {
  productId: string;
  productName: string;
  manufacturer: string;   // replaces packaging
  batchNumber: string;    // new
  expiryDate: string;     // new
  rateWithoutGst: string; // primary input
  gstPct: string;         // dropdown
  rateWithGst: string;    // bidirectional with rateWithoutGst
  quantity: string;       // total units received
  mrp: string;            // MRP printed on pack — fed directly to product master
  ptr: string;            // PTR, trade price to retailer — fed directly to product master
  salesRate: string;      // selling price fed directly to product master
};

const emptyLine = (): Line => ({
  productId: '', productName: '', manufacturer: '',
  batchNumber: '', expiryDate: '',
  rateWithoutGst: '', gstPct: '5', rateWithGst: '', quantity: '', mrp: '', ptr: '', salesRate: '',
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

function computeLine(l: Line) {
  const gstPctNum = n(l.gstPct);
  const rateWo = n(l.rateWithoutGst);
  const qty = n(l.quantity);
  const amountWithoutGst = r2(rateWo * qty);
  const gstAmount = r2(amountWithoutGst * gstPctNum / 100);
  const finalAmount = r2(amountWithoutGst + gstAmount);
  return { qty, amountWithoutGst, gstAmount, finalAmount };
}

function isActiveLine(l: Line) {
  return l.productName.trim() !== '' || n(l.quantity) > 0;
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
            name?: string; mfgCompany?: string; baseUnit?: string; unit?: string;
            purchasePrice?: number; gstPct?: number; retailerPrice?: number; maxRetailPrice?: number; sellingPrice?: number;
            boxCapacity?: number; unitSize?: number; unitMeasure?: string;
          };
          return {
            id: d.id,
            name: p.name ?? '',
            mfgCompany: p.mfgCompany,
            baseUnit: p.baseUnit,
            unit: p.unit,
            purchasePrice: p.purchasePrice,
            gstPct: p.gstPct,
            retailerPrice: p.retailerPrice,
            maxRetailPrice: p.maxRetailPrice,
            sellingPrice: p.sellingPrice,
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

    // Restore prevPosted for idempotent inventory re-posting on edit
    if (Array.isArray(d.postedLines)) {
      prevPostedRef.current = d.postedLines as PostedLine[];
    }

    const rawLines = Array.isArray(d.lines) ? d.lines : [];
    if (rawLines.length > 0) {
      setLines(rawLines.map((l: Record<string, unknown>) => {
        const gstPct = n((l.gstPct as string | number | undefined) ?? 5);
        // Handle both new format (rateWithoutGst) and old format (rateWithGst)
        const rateWithoutGst = l.rateWithoutGst != null
          ? String(l.rateWithoutGst)
          : l.rateWithGst != null
            ? String(rateWithGstToWithoutGst(n(l.rateWithGst as number), gstPct))
            : '';
        const rateWithGst = rateWithoutGst
          ? String(rateWithoutGstToWithGst(n(rateWithoutGst), gstPct))
          : String(l.rateWithGst ?? '');
        // Backward-compat: old lines had boxQty * qtyPerBox for quantity
        const quantity = l.quantity != null
          ? String(l.quantity)
          : String((n(l.boxQty as number) * n(l.qtyPerBox as number)) || '');
        return {
          productId: String(l.productId ?? ''),
          productName: String(l.productName ?? l.description ?? ''),
          manufacturer: String(l.manufacturer ?? l.packaging ?? ''),
          batchNumber: String(l.batchNumber ?? ''),
          expiryDate: String(l.expiryDate ?? ''),
          rateWithoutGst,
          gstPct: String(gstPct),
          rateWithGst,
          quantity,
          mrp: String(l.mrp ?? ''),
          ptr: String(l.ptr ?? ''),
          salesRate: String(l.salesRate ?? ''),
        };
      }));
    }
  };

  // ── Line helpers ──────────────────────────────────────────────────────────
  const setLine = (i: number, key: keyof Line, val: string) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [key]: val } : l));

  const setRateWithoutGst = (i: number, val: string) => {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      const derived = val ? String(rateWithoutGstToWithGst(n(val), n(l.gstPct))) : '';
      return { ...l, rateWithoutGst: val, rateWithGst: derived };
    }));
  };

  const setRateWithGst = (i: number, val: string) => {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      const derived = val ? String(rateWithGstToWithoutGst(n(val), n(l.gstPct))) : '';
      return { ...l, rateWithGst: val, rateWithoutGst: derived };
    }));
  };

  const setGstPct = (i: number, val: string) => {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      // Recompute rateWithGst from rateWithoutGst when GST changes
      const rateWithGst = l.rateWithoutGst
        ? String(rateWithoutGstToWithGst(n(l.rateWithoutGst), n(val)))
        : l.rateWithGst;
      return { ...l, gstPct: val, rateWithGst };
    }));
  };

  const selectFromPriceList = (i: number, itemId: string) => {
    const item = priceList.find(p => p.id === itemId);
    if (!item) return;
    const gstPct = item.gstPct;
    const rateWithGst = String(rateWithoutGstToWithGst(item.purchaseRate, gstPct));
    const masterMatch = products.find(
      p => p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()
    );
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l,
      productId: masterMatch?.id ?? '',
      productName: item.productName,
      manufacturer: l.manufacturer, // keep what user typed
      gstPct: String(gstPct),
      rateWithoutGst: String(item.purchaseRate),
      rateWithGst,
    } : l));
  };

  const selectFromMaster = (i: number, p: ProductLite) => {
    const gstPct = p.gstPct ?? 0;
    const rateWithoutGst = p.purchasePrice != null ? String(p.purchasePrice) : '';
    const rateWithGst = rateWithoutGst ? String(rateWithoutGstToWithGst(n(rateWithoutGst), gstPct)) : '';
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l,
      productId: p.id,
      productName: p.name,
      manufacturer: p.mfgCompany || l.manufacturer, // auto-fill from master; keep user's value if master has none
      gstPct: String(gstPct),
      rateWithoutGst,
      rateWithGst,
      mrp: p.maxRetailPrice != null ? String(p.maxRetailPrice) : l.mrp,
      ptr: p.retailerPrice != null ? String(p.retailerPrice) : l.ptr,
      salesRate: p.sellingPrice != null ? String(p.sellingPrice) : l.salesRate,
    } : l));
  };

  const addLine = () => setLines(ls => [...ls, emptyLine()]);
  const removeLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  // ── Computed ──────────────────────────────────────────────────────────────
  const computed = useMemo(() => lines.map(l => ({ ...l, ...computeLine(l) })), [lines]);
  const activeComputed = useMemo(() => computed.filter(l => isActiveLine(l)), [computed]);

  const totals = useMemo(() => ({
    totalQty: activeComputed.reduce((s, l) => s + l.qty, 0),
    totalAmountWithoutGst: r2(activeComputed.reduce((s, l) => s + l.amountWithoutGst, 0)),
    totalGst: r2(activeComputed.reduce((s, l) => s + l.gstAmount, 0)),
    totalFinalAmount: r2(activeComputed.reduce((s, l) => s + l.finalAmount, 0)),
  }), [activeComputed]);

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
      manufacturer: l.manufacturer.trim(),
      batchNumber: l.batchNumber.trim(),
      expiryDate: l.expiryDate,
      gstPct: n(l.gstPct),
      rateWithoutGst: n(l.rateWithoutGst),
      rateWithGst: n(l.rateWithGst),
      quantity: n(l.quantity),
      mrp: n(l.mrp),
      ptr: n(l.ptr),
      salesRate: n(l.salesRate),
      amountWithoutGst: l.amountWithoutGst,
      gstAmount: l.gstAmount,
      finalAmount: l.finalAmount,
    })),
    totalQty: totals.totalQty,
    totalAmountWithoutGst: totals.totalAmountWithoutGst,
    totalGst: totals.totalGst,
    totalFinalAmount: totals.totalFinalAmount,
    netAmount: totals.totalFinalAmount, // used by supplier ledger sync
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

      // Sync supplier ledger totals
      if (payload.supplierId) {
        syncSupplierTotals(db, tenantId, payload.supplierId).catch(err =>
          console.error('Ledger sync failed (invoice already saved):', err));
      }

      // Post to inventory — increases stock, updates purchase rate, creates/updates batches
      const forPost = activeComputed.map(l => ({
        description: l.productName.trim(),
        mfgCompany: l.manufacturer.trim() || undefined,
        batchNo: l.batchNumber.trim() || undefined,
        expDate: l.expiryDate || undefined,
        rate: n(l.rateWithoutGst),
        gstPct: n(l.gstPct),
        quantity: n(l.quantity),
        mrp: n(l.mrp) || undefined,
        retailerPrice: n(l.ptr) || undefined,
        sellingPrice: n(l.salesRate) || undefined,
      }));
      postSupplierInvoiceToInventory(tenantId, id, forPost, supplier.name || '', products, prevPostedRef.current, meta.internalPurchaseId || meta.supplierInvoiceNumber)
        .then(newPosted => {
          prevPostedRef.current = newPosted;
          // Store postedLines on invoice doc for idempotency on future edits
          const ref = getTenantDoc(db, tenantId, 'supplierInvoices', id);
          updateDoc(ref, { postedLines: newPosted }).catch(console.error);
        })
        .catch(err => console.error('Inventory posting failed (invoice already saved):', err));

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
<style>${PURCHASE_PRINT_CSS}</style></head><body>${html}</body></html>`);
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
      <div className="no-print" style={{ maxWidth: '1200px', margin: '0 auto 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
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
        <div className="no-print" style={{ maxWidth: '1200px', margin: '0 auto 1rem', padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div className="si-card glass-panel" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.75rem', borderRadius: '12px' }}>

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
            <div><div className="pi-label">Purchase Date</div><div className="pi-val">{fmtDateDMY(meta.invoiceDate) || '—'}</div></div>
            <div><div className="pi-label">Status</div><div className="pi-val">{meta.status}</div></div>
          </div>

          <table className="pi-table">
            <thead>
              <tr>
                <th style={{ width: '22px' }}>#</th>
                <th style={{ width: '150px' }}>Product</th>
                <th style={{ width: '80px' }}>Manufacturer</th>
                <th style={{ width: '70px' }}>Batch No.</th>
                <th style={{ width: '65px' }}>Expiry</th>
                <th style={{ width: '55px' }}>Rate w/o GST</th>
                <th style={{ width: '30px' }}>GST%</th>
                <th style={{ width: '55px' }}>Rate incl. GST</th>
                <th style={{ width: '35px' }}>Qty</th>
                <th style={{ width: '45px' }}>MRP</th>
                <th style={{ width: '45px' }}>PTR</th>
                <th style={{ width: '50px' }}>Sale Rate</th>
                <th style={{ width: '65px' }}>Amt w/o GST</th>
                <th style={{ width: '50px' }}>GST Amt</th>
                <th style={{ width: '65px' }}>Final Amount</th>
              </tr>
            </thead>
            <tbody>
              {activeComputed.map((l, i) => (
                <tr key={i}>
                  <td className="c">{i + 1}</td>
                  <td>{l.productName}</td>
                  <td className="c">{l.manufacturer}</td>
                  <td className="c">{l.batchNumber}</td>
                  <td className="c">{fmtDateDMY(l.expiryDate) || '—'}</td>
                  <td className="r">{n(l.rateWithoutGst).toFixed(2)}</td>
                  <td className="c">{l.gstPct}%</td>
                  <td className="r">{n(l.rateWithGst).toFixed(2)}</td>
                  <td className="c">{l.qty}</td>
                  <td className="r">{l.mrp ? n(l.mrp).toFixed(2) : '—'}</td>
                  <td className="r">{l.ptr ? n(l.ptr).toFixed(2) : '—'}</td>
                  <td className="r">{l.salesRate ? n(l.salesRate).toFixed(2) : '—'}</td>
                  <td className="r">{fmtINR(l.amountWithoutGst)}</td>
                  <td className="r">{fmtINR(l.gstAmount)}</td>
                  <td className="r">{fmtINR(l.finalAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} className="c">TOTALS</td>
                <td className="c">{totals.totalQty}</td>
                <td className="c">—</td>
                <td className="c">—</td>
                <td className="c">—</td>
                <td className="r">{fmtINR(totals.totalAmountWithoutGst)}</td>
                <td className="r">{fmtINR(totals.totalGst)}</td>
                <td className="r">{fmtINR(totals.totalFinalAmount)}</td>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '36px' }} />
                  <col style={{ width: '200px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '108px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '36px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Product Name</th>
                    <th style={thStyle}>Manufacturer</th>
                    <th style={thStyle}>Batch No.</th>
                    <th style={thStyle}>Expiry Date</th>
                    <th style={{ ...thStyle, background: 'hsla(220,40%,30%,0.3)' }}>Purchase Rate<br/>(w/o GST) ✏</th>
                    <th style={{ ...thStyle, background: 'hsla(220,40%,30%,0.3)' }}>GST %</th>
                    <th style={{ ...thStyle, background: 'var(--primary-light)', color: '#fff' }}>Purchase Rate<br/>(incl. GST) ✏</th>
                    <th style={{ ...thStyle, background: 'var(--secondary)', color: '#fff' }}>Quantity ✏</th>
                    <th style={{ ...thStyle, background: 'hsla(145,60%,35%,0.25)' }}>MRP ✏</th>
                    <th style={{ ...thStyle, background: 'hsla(145,60%,35%,0.25)' }}>PTR ✏</th>
                    <th style={{ ...thStyle, background: 'hsla(145,60%,35%,0.25)' }}>Sale Rate ✏</th>
                    <th style={{ ...thStyle, color: 'var(--text-tertiary)' }}>Final Amount</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const c = computed[i];
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'hsla(220,20%,50%,0.04)' }}>
                        <td style={{ ...tdAuto, textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>

                        {/* Product selector — always searches the full inventory master;
                            supplier price list (if any) is an optional quick-fill below it. */}
                        <td style={tdInput}>
                          <ProductAutocomplete
                            value={l.productName}
                            onChange={v => setLine(i, 'productName', v)}
                            onSelect={p => selectFromMaster(i, p)}
                            products={products}
                            placeholder="Search product…"
                            style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
                          />
                          {priceList.length > 0 && (
                            <select
                              className="input-field"
                              value={
                                priceList.find(p => p.productName === l.productName)?.id ?? ''
                              }
                              onChange={e => selectFromPriceList(i, e.target.value)}
                              style={{ width: '100%', margin: '3px 0 0', padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}
                            >
                              <option value="">— quick-fill from price list —</option>
                              {priceList.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.productName}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Manufacturer */}
                        <td style={tdInput}>
                          <input className="input-field" value={l.manufacturer} onChange={e => setLine(i, 'manufacturer', e.target.value)} placeholder="Brand / Mfg"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} />
                        </td>

                        {/* Batch Number */}
                        <td style={tdInput}>
                          <input className="input-field" value={l.batchNumber} onChange={e => setLine(i, 'batchNumber', e.target.value)} placeholder="e.g. B2024-01"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} />
                        </td>

                        {/* Expiry Date */}
                        <td style={tdInput}>
                          <input className="input-field" type="date" value={l.expiryDate} onChange={e => setLine(i, 'expiryDate', e.target.value)}
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} />
                        </td>

                        {/* Purchase Rate without GST — primary input */}
                        <td style={{ ...tdInput, background: 'hsla(220,40%,50%,0.06)' }}>
                          <input className="input-field" type="number" value={l.rateWithoutGst} onChange={e => setRateWithoutGst(i, e.target.value)} placeholder="0.00"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.88rem', textAlign: 'right', fontWeight: 600 }} />
                        </td>

                        {/* GST % dropdown */}
                        <td style={{ ...tdInput, background: 'hsla(220,40%,50%,0.06)' }}>
                          <select className="input-field" value={l.gstPct} onChange={e => setGstPct(i, e.target.value)}
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}>
                            {GST_OPTIONS.map(g => (
                              <option key={g} value={String(g)}>{g}%</option>
                            ))}
                          </select>
                        </td>

                        {/* Purchase Rate including GST — bidirectional */}
                        <td style={{ ...tdInput, background: 'hsla(210,80%,50%,0.08)' }}>
                          <input className="input-field" type="number" value={l.rateWithGst} onChange={e => setRateWithGst(i, e.target.value)} placeholder="0.00"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.88rem', textAlign: 'right', fontWeight: 700 }} />
                        </td>

                        {/* Quantity */}
                        <td style={{ ...tdInput, background: 'hsla(var(--secondary-hsl, 145,60%,40%),0.08)' }}>
                          <input className="input-field" type="number" value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} placeholder="0"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 700 }} />
                        </td>

                        {/* MRP, PTR, Sale Rate — fed directly into product master on save */}
                        <td style={{ ...tdInput, background: 'hsla(145,60%,40%,0.06)' }}>
                          <input className="input-field" type="number" value={l.mrp} onChange={e => setLine(i, 'mrp', e.target.value)} placeholder="0.00"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }} />
                        </td>
                        <td style={{ ...tdInput, background: 'hsla(145,60%,40%,0.06)' }}>
                          <input className="input-field" type="number" value={l.ptr} onChange={e => setLine(i, 'ptr', e.target.value)} placeholder="0.00"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }} />
                        </td>
                        <td style={{ ...tdInput, background: 'hsla(145,60%,40%,0.06)' }}>
                          <input className="input-field" type="number" value={l.salesRate} onChange={e => setLine(i, 'salesRate', e.target.value)} placeholder="0.00"
                            style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 600 }} />
                        </td>

                        {/* Final Amount — auto-computed */}
                        <AutoCell>
                          {c.finalAmount > 0 ? <strong style={{ color: 'var(--text-primary)' }}>{fmtINR(c.finalAmount)}</strong> : '—'}
                        </AutoCell>

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
                <div style={{ ...summaryRow, borderBottom: 'none' }}><span style={{ fontSize: '0.82rem' }}>Total Quantity</span><strong>{totals.totalQty}</strong></div>
              </div>

              <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>Purchase Amounts</div>
                <div style={summaryRow}><span style={{ fontSize: '0.82rem' }}>Amount w/o GST</span><strong>{fmtINR(totals.totalAmountWithoutGst)}</strong></div>
                <div style={summaryRow}><span style={{ fontSize: '0.82rem' }}>GST</span><strong>{fmtINR(totals.totalGst)}</strong></div>
                <div style={{ ...summaryRow, borderBottom: 'none', fontSize: '1rem' }}>
                  <span style={{ fontWeight: 700 }}>Final Amount</span>
                  <strong style={{ color: 'var(--secondary)', fontSize: '1.1rem' }}>{fmtINR(totals.totalFinalAmount)}</strong>
                </div>
              </div>

            </div>
          </div>

        </div>{/* end screen editor */}
      </div>
    </div>
  );
}
