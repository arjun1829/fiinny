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
import { calcInvoiceGST, fmtINR, round2 } from '../utils/gstCalculator';
import { AGRI_CATEGORIES } from '../utils/constants';
import ProductAutocomplete, { type ProductLite } from '../components/ProductAutocomplete';

// ── Amount-in-words (same logic as the B2B invoice) ──────────────────────────
function numberToWords(num: number): string {
  if (!num || num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  };
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart);
  if (decPart > 0) result += ' and ' + convert(decPart) + ' Paise';
  return result + ' only';
}

const today = () => new Date().toISOString().slice(0, 10);

// ── Types ────────────────────────────────────────────────────────────────────
type Line = {
  description: string; mfgCompany: string; batchNo: string; mfgDate: string; expDate: string;
  hsnCode: string; boxCount: string; piecesPerBox: string; quantity: string; unit: string;
  rate: string; mrp: string; farmerRate: string; retailerRate: string; discount: string; gstPct: string;
  // Remaining product-master fields, edited in the per-line details panel.
  productNumber: string; type: string; unitSize: string; unitMeasure: string;
  boxMrp: string; boxPtr: string; boxPurchase: string; boxSelling: string;
};
const emptyLine = (): Line => ({
  description: '', mfgCompany: '', batchNo: '', mfgDate: '', expDate: '',
  hsnCode: '', boxCount: '', piecesPerBox: '', quantity: '', unit: '',
  rate: '', mrp: '', farmerRate: '', retailerRate: '', discount: '', gstPct: '0',
  productNumber: '', type: '', unitSize: '', unitMeasure: 'pcs',
  boxMrp: '', boxPtr: '', boxPurchase: '', boxSelling: '',
});

interface SupplierDoc {
  name?: string; address?: string; gstin?: string; phone?: string; email?: string; contactPerson?: string; state?: string;
}

/** A saved supplier-invoice doc as read back for edit/view. */
interface SavedInvoiceData {
  supplierName?: string; supplierAddress?: string; supplierGstin?: string; supplierPhone?: string;
  supplierEmail?: string; supplierContactPerson?: string; supplierState?: string;
  internalPurchaseId?: string; supplierInvoiceNumber?: string; invoiceDate?: string; dueDate?: string;
  deliveryNote?: string; buyerOrderNumber?: string; vehicleNumber?: string; termsOfDelivery?: string;
  dispatchedThrough?: string; destination?: string; linkedPurchaseOrderId?: string;
  taxMode?: string; notes?: string; declaration?: string; status?: string;
  lines?: Array<{ description?: string; mfgCompany?: string; batchNo?: string; mfgDate?: string; expDate?: string; hsnCode?: string; boxCount?: number; piecesPerBox?: number; quantity?: number; unit?: string; rate?: number; mrp?: number; farmerRate?: number; retailerRate?: number; discount?: number; gstPct?: number; productNumber?: string; type?: string; unitSize?: number; unitMeasure?: string; boxMrp?: number; boxPtr?: number; boxPurchase?: number; boxSelling?: number }>;
  charges?: { transportation?: number; loading?: number; unloading?: number; otherCharges?: number; discount?: number };
  postedLines?: Array<{ productId: string; boxes: number; loose: number }>;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem',
};
const cell: React.CSSProperties = { border: '1px solid var(--surface-border)', padding: '4px 6px', fontSize: '0.82rem' };

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
  // Full product docs keyed by id — used to prefill a line when an existing
  // product is picked from the autocomplete. ProductAutocomplete itself only
  // needs ProductLite, so we look the rich doc up by the selected id.
  const [productsFull, setProductsFull] = useState<Record<string, any>>({});
  // Which line rows have their product-details panel expanded.
  const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>({});
  const [purchaseOrders, setPurchaseOrders] = useState<{ id: string; label: string }[]>([]);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string>(invoiceIdParam);

  const autoGenIdRef = useRef<string>('');
  // Stock already posted to inventory by a prior save — reversed before re-posting
  // so editing an invoice never double-counts stock.
  const prevPostedRef = useRef<PostedLine[]>([]);

  // ── Supplier (auto-filled, editable) ──
  const [supplier, setSupplier] = useState<SupplierDoc>({});

  // ── Invoice header ──
  const [meta, setMeta] = useState({
    internalPurchaseId: '',
    supplierInvoiceNumber: '',
    invoiceDate: today(),
    dueDate: '',
    deliveryNote: '',
    buyerOrderNumber: '',
    vehicleNumber: '',
    termsOfDelivery: '',
    dispatchedThrough: '',
    destination: '',
    linkedPurchaseOrderId: '',
    taxMode: 'none' as 'none' | 'gst',
    notes: '',
    declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    status: 'received',
  });

  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: 5 }, emptyLine));
  const [charges, setCharges] = useState({ transportation: '', loading: '', unloading: '', otherCharges: '', discount: '' });

  // ── Load branding, products, supplier, POs, counter / existing invoice ──
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [brd, prodSnap, poSnap] = await Promise.all([
          fetchInvoiceBranding(tenantId),
          getDocs(query(getTenantCollection(db, tenantId, 'products'), orderBy('name'))),
          supplierIdParam
            ? getDoc(getTenantDoc(db, tenantId, 'suppliers', supplierIdParam))
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setBranding(brd as unknown as typeof branding);
        setProducts(prodSnap.docs.map(d => {
          const data = d.data() as { name?: string; baseUnit?: string; unit?: string };
          return { id: d.id, name: data.name ?? '', baseUnit: data.baseUnit, unit: data.unit };
        }));
        setProductsFull(Object.fromEntries(prodSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }])));

        // Supplier auto-fill
        let supplierName = '';
        if (poSnap && poSnap.exists()) {
          const s = poSnap.data() as SupplierDoc;
          supplierName = s.name ?? '';
          setSupplier({
            name: s.name ?? '', address: s.address ?? '', gstin: s.gstin ?? '',
            phone: s.phone ?? '', email: s.email ?? '', contactPerson: s.contactPerson ?? '', state: s.state ?? '',
          });
        }

        // Existing POs for this supplier (optional linking). Matched by both
        // the stable supplierId and the current name — legacy POs saved before
        // supplierId existed only carry the name, and a renamed supplier's POs
        // would otherwise vanish from this list on an id-only match.
        if (supplierName || supplierIdParam) {
          const [byId, byName] = await Promise.all([
            supplierIdParam
              ? getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierId', '==', supplierIdParam)))
              : Promise.resolve(null),
            supplierName
              ? getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierName', '==', supplierName)))
              : Promise.resolve(null),
          ]);
          const poMap = new Map<string, { poNumber?: string; totalAmount?: number }>();
          byId?.docs.forEach(d => poMap.set(d.id, d.data() as any));
          byName?.docs.forEach(d => { if (!poMap.has(d.id)) poMap.set(d.id, d.data() as any); });
          if (!cancelled) {
            setPurchaseOrders(Array.from(poMap.entries()).map(([id, pd]) => (
              { id, label: `${pd.poNumber ?? id.slice(0, 8)} · ₹${(pd.totalAmount ?? 0).toLocaleString('en-IN')}` }
            )));
          }
        }

        // Existing invoice (edit/view) or generate Internal Purchase ID (create)
        if (invoiceIdParam) {
          const invSnap = await getDoc(getTenantDoc(db, tenantId, 'supplierInvoices', invoiceIdParam));
          if (invSnap.exists() && !cancelled) {
            loadInvoice(invSnap.data());
          }
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
      // Non-fatal — user can type one manually.
    }
  };

  const loadInvoice = (d: SavedInvoiceData) => {
    setSupplier({
      name: d.supplierName ?? '', address: d.supplierAddress ?? '', gstin: d.supplierGstin ?? '',
      phone: d.supplierPhone ?? '', email: d.supplierEmail ?? '', contactPerson: d.supplierContactPerson ?? '', state: d.supplierState ?? '',
    });
    setMeta(m => ({
      ...m,
      internalPurchaseId: d.internalPurchaseId ?? '',
      supplierInvoiceNumber: d.supplierInvoiceNumber ?? '',
      invoiceDate: d.invoiceDate ?? today(),
      dueDate: d.dueDate ?? '',
      deliveryNote: d.deliveryNote ?? '',
      buyerOrderNumber: d.buyerOrderNumber ?? '',
      vehicleNumber: d.vehicleNumber ?? '',
      termsOfDelivery: d.termsOfDelivery ?? '',
      dispatchedThrough: d.dispatchedThrough ?? '',
      destination: d.destination ?? '',
      linkedPurchaseOrderId: d.linkedPurchaseOrderId ?? '',
      taxMode: d.taxMode === 'gst' ? 'gst' : 'none',
      notes: d.notes ?? '',
      declaration: d.declaration ?? m.declaration,
      status: d.status ?? 'received',
    }));
    autoGenIdRef.current = d.internalPurchaseId ?? '';
    prevPostedRef.current = Array.isArray(d.postedLines) ? d.postedLines : [];
    if (Array.isArray(d.lines) && d.lines.length) {
      setLines(d.lines.map(l => ({
        description: l.description ?? '', mfgCompany: l.mfgCompany ?? '', batchNo: l.batchNo ?? '', mfgDate: l.mfgDate ?? '', expDate: l.expDate ?? '',
        hsnCode: l.hsnCode ?? '', boxCount: String(l.boxCount ?? ''), piecesPerBox: String(l.piecesPerBox ?? ''),
        quantity: String(l.quantity ?? ''), unit: l.unit ?? '',
        rate: String(l.rate ?? ''), mrp: String(l.mrp ?? ''), farmerRate: String(l.farmerRate ?? ''), retailerRate: String(l.retailerRate ?? ''),
        discount: String(l.discount ?? ''), gstPct: String(l.gstPct ?? '0'),
        productNumber: l.productNumber ?? '', type: l.type ?? '',
        unitSize: l.unitSize ? String(l.unitSize) : '', unitMeasure: l.unitMeasure ?? 'pcs',
        boxMrp: l.boxMrp ? String(l.boxMrp) : '', boxPtr: l.boxPtr ? String(l.boxPtr) : '',
        boxPurchase: l.boxPurchase ? String(l.boxPurchase) : '', boxSelling: l.boxSelling ? String(l.boxSelling) : '',
      })));
    }
    if (d.charges) {
      setCharges({
        transportation: String(d.charges.transportation ?? ''), loading: String(d.charges.loading ?? ''),
        unloading: String(d.charges.unloading ?? ''), otherCharges: String(d.charges.otherCharges ?? ''),
        discount: String(d.charges.discount ?? ''),
      });
    }
  };

  // ── Line helpers ──
  const setLine = (i: number, key: keyof Line, val: string) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  const addLine = () => setLines(ls => [...ls, emptyLine()]);
  const removeLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);
  // Picking an existing product pulls its whole master record into the line —
  // company, packing, GST, SKU and all eight prices — so a re-purchase only needs
  // the batch/expiry/qty typed, and any rate the buyer changes here becomes the
  // new source of truth on save. Values already typed on the line are kept.
  const selectProduct = (i: number, p: ProductLite) => {
    const full = productsFull[p.id] || {};
    const s = (v: unknown) => (v === undefined || v === null || v === '' ? '' : String(v));
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l,
      description: p.name,
      unit: l.unit || full.baseUnit || p.baseUnit || p.unit || '',
      mfgCompany: l.mfgCompany || s(full.mfgCompany),
      hsnCode: l.hsnCode || s(full.hsnCode),
      piecesPerBox: l.piecesPerBox || s(full.boxCapacity),
      gstPct: (l.gstPct && l.gstPct !== '0') ? l.gstPct : (s(full.gstPct) || '0'),
      productNumber: l.productNumber || s(full.productNumber),
      type: l.type || s(full.type),
      unitSize: l.unitSize || s(full.unitSize),
      unitMeasure: l.unitMeasure && l.unitMeasure !== 'pcs' ? l.unitMeasure : (s(full.unitMeasure) || 'pcs'),
      rate: l.rate || s(full.purchasePrice),
      mrp: l.mrp || s(full.maxRetailPrice),
      farmerRate: l.farmerRate || s(full.sellingPrice),
      retailerRate: l.retailerRate || s(full.retailerPrice),
      boxPurchase: l.boxPurchase || s(full.boxPurchasePrice),
      boxMrp: l.boxMrp || s(full.boxMaxRetailPrice),
      boxSelling: l.boxSelling || s(full.boxSellingPrice),
      boxPtr: l.boxPtr || s(full.boxRetailerPrice),
    } : l));
  };

  // Effective units for a line: boxes×pcs-per-box when packing is given, else the
  // flat quantity. Used for amount, totals and the stock posted to inventory.
  const effQty = (l: Line): number => {
    const boxes = parseFloat(l.boxCount) || 0;
    const pcs = parseFloat(l.piecesPerBox) || 0;
    return (boxes > 0 && pcs > 0) ? boxes * pcs : (parseFloat(l.quantity) || 0);
  };

  // ── Computed line amount (qty × rate − discount) ──
  const lineAmount = (l: Line): number => {
    const q = effQty(l);
    const r = parseFloat(l.rate) || 0;
    const disc = parseFloat(l.discount) || 0;
    return round2(Math.max(0, q * r - disc));
  };

  // ── Totals (reuse gstCalculator for the tax split) ──
  const totals = useMemo(() => {
    const activeLines = lines.filter(l => l.description.trim() || l.rate);
    // taxable per line = qty*rate - discount (net rate basis for GST mode)
    const gstInput = activeLines.map(l => {
      const q = effQty(l);
      const r = parseFloat(l.rate) || 0;
      const disc = parseFloat(l.discount) || 0;
      const netRate = q > 0 ? Math.max(0, (q * r - disc)) / q : 0; // discount-adjusted rate
      return { description: l.description, hsnCode: l.hsnCode, quantity: q, rate: netRate, gstPct: meta.taxMode === 'gst' ? (parseFloat(l.gstPct) || 0) : 0 };
    });
    const sellerState = supplier.state || '';
    const buyerState = (tenantData as { state?: string } | null)?.state || 'Maharashtra';
    const gst = calcInvoiceGST(gstInput, sellerState, buyerState);

    const extraCharges = (['transportation', 'loading', 'unloading', 'otherCharges'] as const).reduce(
      (s, k) => s + (parseFloat(charges[k]) || 0), 0);
    const chargeDiscount = parseFloat(charges.discount) || 0;

    const taxableValue = round2(gst.totals.taxableValue);
    const cgst = round2(gst.totals.cgst);
    const sgst = round2(gst.totals.sgst);
    const igst = round2(gst.totals.igst);
    const totalTax = round2(gst.totals.totalTax);

    const preRound = taxableValue + totalTax + extraCharges - chargeDiscount;
    const netAmount = Math.round(preRound);
    const roundOff = round2(netAmount - preRound);

    return { taxableValue, cgst, sgst, igst, totalTax, extraCharges, chargeDiscount, netAmount, roundOff };
  }, [lines, charges, meta.taxMode, supplier.state, tenantData]);

  // ── Save ──
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
    dueDate: meta.dueDate,
    deliveryNote: meta.deliveryNote.trim(),
    buyerOrderNumber: meta.buyerOrderNumber.trim(),
    vehicleNumber: meta.vehicleNumber.trim(),
    termsOfDelivery: meta.termsOfDelivery.trim(),
    dispatchedThrough: meta.dispatchedThrough.trim(),
    destination: meta.destination.trim(),
    linkedPurchaseOrderId: meta.linkedPurchaseOrderId || null,
    taxMode: meta.taxMode,
    lines: lines.filter(l => l.description.trim() || l.rate).map(l => ({
      description: l.description.trim(), mfgCompany: l.mfgCompany.trim(),
      batchNo: l.batchNo.trim(), mfgDate: l.mfgDate, expDate: l.expDate,
      hsnCode: l.hsnCode.trim(),
      boxCount: parseFloat(l.boxCount) || 0, piecesPerBox: parseFloat(l.piecesPerBox) || 0,
      quantity: effQty(l), unit: l.unit.trim(),
      rate: parseFloat(l.rate) || 0, mrp: parseFloat(l.mrp) || 0,
      farmerRate: parseFloat(l.farmerRate) || 0, retailerRate: parseFloat(l.retailerRate) || 0,
      discount: parseFloat(l.discount) || 0,
      gstPct: meta.taxMode === 'gst' ? (parseFloat(l.gstPct) || 0) : 0,
      productNumber: l.productNumber.trim(), type: l.type.trim(),
      unitSize: parseFloat(l.unitSize) || 0, unitMeasure: l.unitMeasure.trim(),
      boxMrp: parseFloat(l.boxMrp) || 0, boxPtr: parseFloat(l.boxPtr) || 0,
      boxPurchase: parseFloat(l.boxPurchase) || 0, boxSelling: parseFloat(l.boxSelling) || 0,
      amount: lineAmount(l),
    })),
    charges: {
      transportation: parseFloat(charges.transportation) || 0,
      loading: parseFloat(charges.loading) || 0,
      unloading: parseFloat(charges.unloading) || 0,
      otherCharges: parseFloat(charges.otherCharges) || 0,
      discount: parseFloat(charges.discount) || 0,
    },
    taxableValue: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    totalTax: totals.totalTax,
    roundOff: totals.roundOff,
    netAmount: totals.netAmount,
    notes: meta.notes.trim(),
    declaration: meta.declaration.trim(),
    status: meta.status,
  });

  const validate = async (): Promise<boolean> => {
    if (!supplier.name?.trim()) { setError('Supplier name is required'); return false; }
    if (!meta.supplierInvoiceNumber.trim()) { setError('Supplier invoice number is required'); return false; }
    if (!lines.some(l => l.description.trim())) { setError('Add at least one product line'); return false; }
    // Internal Purchase ID uniqueness — only if manually changed
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

  /** Saves and returns the doc id (or null on failure). */
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

      // ── Post to inventory: create/update products + batch records, add stock.
      // Idempotent — reverses the previously posted snapshot before re-applying,
      // so editing an invoice reconciles stock instead of double-counting.
      try {
        const posted = await postSupplierInvoiceToInventory(
          tenantId, id, payload.lines, payload.supplierName,
          products.map(p => ({ id: p.id, name: p.name })),
          prevPostedRef.current,
        );
        prevPostedRef.current = posted;
        await updateDoc(getTenantDoc(db, tenantId, 'supplierInvoices', id), {
          postedLines: posted, inventoryPostedAt: serverTimestamp(),
        });
      } catch (invErr) {
        // The invoice itself saved; surface an inventory-sync warning but don't fail the save.
        console.error('Inventory posting failed (invoice saved):', invErr);
        setError('Invoice saved, but updating inventory stock failed. Re-save to retry.');
      }
      // Keep the Supplier Ledger list's cached totals in sync — the ledger list
      // reads suppliers/{id}.totalInvoiced/totalPaid/outstandingBalance directly
      // rather than recomputing them, so this write must happen here too.
      if (payload.supplierId) {
        syncSupplierTotals(db, tenantId, payload.supplierId).catch(err =>
          console.error('Failed to sync supplier ledger totals (invoice already saved):', err));
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
    if (id) alert('Supplier invoice saved.');
  };

  // ── Print (snapshot the invoice card to a new window — iOS-safe, same as B2B) ──
  const printInvoiceDOM = () => {
    const container = document.querySelector('.si-card') as HTMLElement | null;
    const html = container ? container.outerHTML : document.body.innerHTML;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(el => el.outerHTML).join('\n');
    const win = window.open('', '_blank');
    if (!win) { window.print(); return; }
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Supplier Invoice ${meta.internalPurchaseId || meta.supplierInvoiceNumber}</title>
${styles}
<style>
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; box-sizing: border-box; }
  html, body { background: #fff !important; color: #000 !important; margin: 0; padding: 0; font-family: 'Times New Roman', Georgia, serif; }

  /* Reset the dark editor chrome to a clean white document */
  .si-wrapper { background: #fff !important; padding: 0 !important; min-height: auto !important; }
  .si-card { box-shadow: none !important; border: 1px solid #000 !important; border-radius: 0 !important;
             margin: 0 auto !important; padding: 0 !important; background: #fff !important; color: #000 !important; max-width: 100% !important; }
  .no-print, .si-card .no-print { display: none !important; }

  /* Inputs become their printable text values */
  input, select, textarea { display: none !important; }
  .si-print-only { display: block !important; }
  .print-val { display: inline !important; color: #000 !important; }

  /* Headings / titles */
  .si-card h1 { font-size: 16pt !important; text-align: center; margin: 0; padding: 8px 0 6px; border-bottom: 1px solid #000; }
  .si-print-section { padding: 6px 10px; }
  .si-print-label { font-size: 8pt; color: #444; text-transform: uppercase; letter-spacing: 0.3px; }
  .si-print-value { font-size: 10pt; font-weight: 600; }

  /* Two-column boxed party blocks */
  .si-parties { display: flex; width: 100%; border-bottom: 1px solid #000; }
  .si-parties > div { width: 50%; padding: 8px 10px; font-size: 9.5pt; line-height: 1.4; }
  .si-parties > div:first-child { border-right: 1px solid #000; }
  .si-party-title { font-weight: 700; font-size: 8.5pt; text-transform: uppercase; margin-bottom: 4px; }

  /* Invoice-detail grid */
  .si-meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #000; }
  .si-meta-grid > div { padding: 5px 8px; border-right: 1px solid #ccc; }
  .si-meta-grid > div:nth-child(4n) { border-right: none; }

  /* Product table — fixed widths, repeating headers, clean borders */
  .si-table { border-collapse: collapse !important; width: 100% !important; table-layout: fixed; }
  .si-table thead { display: table-header-group; }     /* repeat header each printed page */
  .si-table tr { page-break-inside: avoid; }
  .si-table th, .si-table td { border: 1px solid #000 !important; padding: 3px 4px !important;
                               font-size: 8.5pt !important; color: #000 !important;
                               word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
  .si-table th { background: #f0f0f0 !important; font-weight: 700; text-align: center; }
  .si-table td.num, .si-table th.num { text-align: right; }

  /* Totals / summary stay together */
  .si-summary, .si-footer { page-break-inside: avoid; }
  .si-summary-box { border: 1px solid #000; padding: 6px 10px; font-size: 9.5pt; }
  .si-words { padding: 6px 10px; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 9.5pt; }
  .si-footer { display: flex; justify-content: space-between; padding: 14px 10px 24px; font-size: 9pt; gap: 20px; }
  .si-sign { text-align: right; }

  @media print { .no-print { display: none !important; } }
</style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 700);
  };

  const handleSaveAndPrint = async () => {
    const id = await persist();
    if (id) setTimeout(printInvoiceDOM, 150);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" style={{ margin: '0 auto' }} /></div>;

  const companyName = branding?.businessName || (tenantData as { businessName?: string } | null)?.businessName || 'Your Business Name';
  const totalQty = lines.reduce((s, l) => s + effQty(l), 0);

  // small input style for the table
  const tInput = (val: string, onChange: (v: string) => void, ph?: string, type = 'text', width?: string): React.ReactElement => (
    <input className="input-field" type={type} placeholder={ph} value={val} onChange={e => onChange(e.target.value)}
      style={{ width: width || '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }} />
  );

  return (
    <div className="si-wrapper" style={{ background: 'var(--surface-base)', padding: '1.5rem', minHeight: '100vh' }}>
      {/* The .print-val spans hold the printable text; hidden on screen, shown only in print. */}
      <style>{`
        .si-print-only { display: none; }
        @media screen {
          .si-card .print-val { display: none !important; }
        }
      `}</style>
      {/* Toolbar (not printed) */}
      <div className="no-print" style={{ maxWidth: '1050px', margin: '0 auto 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => navigate(supplierIdParam ? `/supplier-ledger/${supplierIdParam}` : '/supplier-ledger')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
          <ArrowLeft size={16} /> Back to Supplier
        </button>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={handleSaveAndPrint} disabled={saving} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1565C0', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />} Save & Print
          </button>
          <button onClick={printInvoiceDOM} disabled={saving} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', color: '#1565C0', border: '2px solid #1565C0', padding: '0.6rem 1.5rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
            <Printer size={16} /> Print
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem', fontWeight: 700 }}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} {savedInvoiceId ? 'Update Invoice' : 'Save Invoice'}
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print" style={{ maxWidth: '1050px', margin: '0 auto 1rem', padding: '0.75rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', fontSize: '0.875rem' }}>{error}</div>
      )}

      {/* Invoice card */}
      <div className="si-card glass-panel" style={{ maxWidth: '1050px', margin: '0 auto', padding: '1.75rem', borderRadius: '12px' }}>
        <h1 style={{ textAlign: 'center', fontSize: '1.4rem', margin: '0 0 1rem', fontWeight: 800 }}>Supplier Purchase Invoice</h1>

        {/* ── Clean print-only invoice (rendered to paper; hidden on screen) ── */}
        {(() => {
          const activeLines = lines.filter(l => l.description.trim() || l.rate);
          const cols = meta.taxMode === 'gst'
            ? ['9mm', 'auto', '22mm', '18mm', '13mm', '13mm', '15mm', '11mm', '11mm', '15mm', '11mm', '11mm', '20mm']
            : ['9mm', 'auto', '24mm', '20mm', '15mm', '15mm', '17mm', '13mm', '13mm', '17mm', '13mm', '22mm'];
          const headers = meta.taxMode === 'gst'
            ? ['#', 'Description', 'Company', 'Batch', 'Mfg', 'Expiry', 'HSN', 'Qty', 'Unit', 'Rate', 'Disc', 'GST%', 'Amount']
            : ['#', 'Description', 'Company', 'Batch', 'Mfg', 'Expiry', 'HSN', 'Qty', 'Unit', 'Rate', 'Disc', 'Amount'];
          const numCol = (h: string) => ['Qty', 'Rate', 'Disc', 'GST%', 'Amount'].includes(h);
          return (
            <div className="si-print-only">
              <div className="si-parties">
                <div>
                  <div className="si-party-title">Supplier (From)</div>
                  <div style={{ fontWeight: 700 }}>{supplier.name}</div>
                  {supplier.address && <div>{supplier.address}</div>}
                  {supplier.gstin && <div>GSTIN: {supplier.gstin}</div>}
                  {(supplier.phone || supplier.contactPerson) && <div>{supplier.phone}{supplier.contactPerson ? ` · ${supplier.contactPerson}` : ''}</div>}
                  {supplier.email && <div>{supplier.email}</div>}
                  {supplier.state && <div>State: {supplier.state}</div>}
                </div>
                <div>
                  <div className="si-party-title">Buyer (Bill To)</div>
                  <div style={{ fontWeight: 700 }}>{companyName}</div>
                  {(branding?.address || (tenantData as { location?: string } | null)?.location) && <div>{branding?.address || (tenantData as { location?: string } | null)?.location}</div>}
                  {branding?.gstin && <div>GSTIN: {branding.gstin}</div>}
                  {branding?.contact && <div>Contact: {branding.contact}</div>}
                  {branding?.email && <div>{branding.email}</div>}
                </div>
              </div>

              <div className="si-meta-grid">
                <div><div className="si-print-label">Internal Purchase ID</div><div className="si-print-value">{meta.internalPurchaseId || '—'}</div></div>
                <div><div className="si-print-label">Supplier Invoice No.</div><div className="si-print-value">{meta.supplierInvoiceNumber || '—'}</div></div>
                <div><div className="si-print-label">Invoice Date</div><div className="si-print-value">{meta.invoiceDate || '—'}</div></div>
                <div><div className="si-print-label">Due Date</div><div className="si-print-value">{meta.dueDate || '—'}</div></div>
                <div><div className="si-print-label">Delivery Note</div><div className="si-print-value">{meta.deliveryNote || '—'}</div></div>
                <div><div className="si-print-label">Buyer Order No.</div><div className="si-print-value">{meta.buyerOrderNumber || '—'}</div></div>
                <div><div className="si-print-label">Vehicle No.</div><div className="si-print-value">{meta.vehicleNumber || '—'}</div></div>
                <div><div className="si-print-label">Terms of Delivery</div><div className="si-print-value">{meta.termsOfDelivery || '—'}</div></div>
                <div><div className="si-print-label">Dispatched Through</div><div className="si-print-value">{meta.dispatchedThrough || '—'}</div></div>
                <div><div className="si-print-label">Destination</div><div className="si-print-value">{meta.destination || '—'}</div></div>
              </div>

              <table className="si-table">
                <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead><tr>{headers.map((h, i) => <th key={i} className={numCol(h) ? 'num' : undefined}>{h}</th>)}</tr></thead>
                <tbody>
                  {activeLines.map((l, i) => (
                    <tr key={i}>
                      <td className="num">{i + 1}</td>
                      <td>{l.description}</td>
                      <td>{l.mfgCompany}</td>
                      <td>{l.batchNo}</td>
                      <td>{l.mfgDate}</td>
                      <td>{l.expDate}</td>
                      <td>{l.hsnCode}</td>
                      <td className="num">{effQty(l) || l.quantity}</td>
                      <td>{l.unit}</td>
                      <td className="num">{l.rate}</td>
                      <td className="num">{l.discount}</td>
                      {meta.taxMode === 'gst' && <td className="num">{l.gstPct}</td>}
                      <td className="num">{fmtINR(lineAmount(l))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="si-summary" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div className="si-summary-box" style={{ minWidth: '60mm', marginTop: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Taxable Value</span><strong>{fmtINR(totals.taxableValue)}</strong></div>
                  {meta.taxMode === 'gst' && totals.cgst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST</span><strong>{fmtINR(totals.cgst)}</strong></div>}
                  {meta.taxMode === 'gst' && totals.sgst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST</span><strong>{fmtINR(totals.sgst)}</strong></div>}
                  {meta.taxMode === 'gst' && totals.igst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IGST</span><strong>{fmtINR(totals.igst)}</strong></div>}
                  {totals.extraCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Charges</span><strong>{fmtINR(totals.extraCharges)}</strong></div>}
                  {totals.chargeDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><strong>(−){fmtINR(totals.chargeDiscount)}</strong></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Round Off</span><strong>{fmtINR(totals.roundOff)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', marginTop: '3px', paddingTop: '3px', fontSize: '11pt' }}><strong>Net Amount</strong><strong>₹{totals.netAmount.toLocaleString('en-IN')}</strong></div>
                  <div style={{ textAlign: 'right', fontSize: '8pt', color: '#444' }}>Total Qty: {totalQty}</div>
                </div>
              </div>

              <div className="si-words"><strong>Amount in Words:</strong> INR {numberToWords(totals.netAmount)}</div>
              {meta.notes && <div className="si-print-section"><strong>Remark:</strong> {meta.notes}</div>}
              <div className="si-footer">
                <div style={{ maxWidth: '55%' }}><strong>Declaration:</strong><br /><em>{meta.declaration}</em></div>
                <div className="si-sign">
                  for {companyName}
                  {branding?.signatureUrl
                    ? <><br /><img src={branding.signatureUrl} alt="" style={{ height: '44px', maxWidth: '160px', objectFit: 'contain' }} /><br /></>
                    : <><br /><br /><br /></>}
                  {branding?.signatureName || 'Authorised Signatory'}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── On-screen editor (hidden in print) ── */}
        <div className="no-print">

        {/* Supplier + Company blocks */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--primary-light)' }}>Supplier (From)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div><label style={labelStyle}>Supplier Name *</label>{tInput(supplier.name || '', v => setSupplier(s => ({ ...s, name: v })), 'Supplier name')}<span className="print-val" style={{ fontWeight: 700 }}>{supplier.name}</span></div>
              <div><label style={labelStyle}>Address</label>{tInput(supplier.address || '', v => setSupplier(s => ({ ...s, address: v })), 'Address')}<span className="print-val">{supplier.address}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div><label style={labelStyle}>GSTIN</label>{tInput(supplier.gstin || '', v => setSupplier(s => ({ ...s, gstin: v })), 'GSTIN')}<span className="print-val">{supplier.gstin}</span></div>
                <div><label style={labelStyle}>State</label>{tInput(supplier.state || '', v => setSupplier(s => ({ ...s, state: v })), 'State')}<span className="print-val">{supplier.state}</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div><label style={labelStyle}>Phone</label>{tInput(supplier.phone || '', v => setSupplier(s => ({ ...s, phone: v })), 'Phone')}<span className="print-val">{supplier.phone}</span></div>
                <div><label style={labelStyle}>Contact Person</label>{tInput(supplier.contactPerson || '', v => setSupplier(s => ({ ...s, contactPerson: v })), 'Contact')}<span className="print-val">{supplier.contactPerson}</span></div>
              </div>
              <div><label style={labelStyle}>Email</label>{tInput(supplier.email || '', v => setSupplier(s => ({ ...s, email: v })), 'Email')}<span className="print-val">{supplier.email}</span></div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--primary-light)' }}>Buyer (Bill To)</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{companyName}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.6 }}>
              {branding?.address || (tenantData as { location?: string } | null)?.location || ''}<br />
              {branding?.gstin && <>GSTIN: {branding.gstin}<br /></>}
              {branding?.contact && <>Contact: {branding.contact} </>}
              {branding?.email && <>· {branding.email}</>}
            </div>
          </div>
        </div>

        {/* Invoice details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Internal Purchase ID</label>
            <input className="input-field" value={meta.internalPurchaseId} readOnly title="ERP-generated — not editable" placeholder="PUR-2026-000001"
              style={{ width: '100%', margin: 0, padding: '0.4rem 0.5rem', fontSize: '0.82rem', opacity: 0.75, cursor: 'not-allowed', background: 'var(--surface-raised)' }} />
            <span className="print-val">{meta.internalPurchaseId}</span>
          </div>
          <div><label style={labelStyle}>Supplier Invoice No. *</label>{tInput(meta.supplierInvoiceNumber, v => setMeta(m => ({ ...m, supplierInvoiceNumber: v })), 'e.g. 48')}<span className="print-val">{meta.supplierInvoiceNumber}</span></div>
          <div><label style={labelStyle}>Invoice Date</label>{tInput(meta.invoiceDate, v => setMeta(m => ({ ...m, invoiceDate: v })), '', 'date')}<span className="print-val">{meta.invoiceDate}</span></div>
          <div><label style={labelStyle}>Due Date</label>{tInput(meta.dueDate, v => setMeta(m => ({ ...m, dueDate: v })), '', 'date')}<span className="print-val">{meta.dueDate}</span></div>
          <div><label style={labelStyle}>Delivery Note</label>{tInput(meta.deliveryNote, v => setMeta(m => ({ ...m, deliveryNote: v })), 'Delivery note')}<span className="print-val">{meta.deliveryNote}</span></div>
          <div><label style={labelStyle}>Buyer Order No.</label>{tInput(meta.buyerOrderNumber, v => setMeta(m => ({ ...m, buyerOrderNumber: v })), 'Order no.')}<span className="print-val">{meta.buyerOrderNumber}</span></div>
          <div><label style={labelStyle}>Vehicle No.</label>{tInput(meta.vehicleNumber, v => setMeta(m => ({ ...m, vehicleNumber: v })), 'Vehicle')}<span className="print-val">{meta.vehicleNumber}</span></div>
          <div><label style={labelStyle}>Terms of Delivery</label>{tInput(meta.termsOfDelivery, v => setMeta(m => ({ ...m, termsOfDelivery: v })), 'Terms')}<span className="print-val">{meta.termsOfDelivery}</span></div>
          <div><label style={labelStyle}>Dispatched Through</label>{tInput(meta.dispatchedThrough, v => setMeta(m => ({ ...m, dispatchedThrough: v })), 'e.g. Self')}<span className="print-val">{meta.dispatchedThrough}</span></div>
          <div><label style={labelStyle}>Destination</label>{tInput(meta.destination, v => setMeta(m => ({ ...m, destination: v })), 'Destination')}<span className="print-val">{meta.destination}</span></div>
          <div className="no-print">
            <label style={labelStyle}>Link Purchase Order (optional)</label>
            <select className="input-field" value={meta.linkedPurchaseOrderId} onChange={e => setMeta(m => ({ ...m, linkedPurchaseOrderId: e.target.value }))} style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}>
              <option value="">— None (standalone) —</option>
              {purchaseOrders.map(po => <option key={po.id} value={po.id}>{po.label}</option>)}
            </select>
          </div>
          <div className="no-print">
            <label style={labelStyle}>Tax Mode</label>
            <select className="input-field" value={meta.taxMode} onChange={e => setMeta(m => ({ ...m, taxMode: e.target.value as 'none' | 'gst' }))} style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}>
              <option value="none">Bill of Supply (No Tax)</option>
              <option value="gst">GST Invoice</option>
            </select>
          </div>
        </div>

        {/* Product table (on-screen editor) */}
        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table className="si-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: meta.taxMode === 'gst' ? '1320px' : '1260px', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '34px' }} />
              <col style={{ width: '30px' }} />
              <col style={{ width: '230px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '95px' }} />
              <col style={{ width: '95px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '65px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '85px' }} />
              <col style={{ width: '70px' }} />
              {meta.taxMode === 'gst' && <col style={{ width: '60px' }} />}
              <col style={{ width: '100px' }} />
              <col style={{ width: '34px' }} />
            </colgroup>
            <thead>
              <tr>
                {['#', '', 'Product Name', 'Company', 'Batch', 'Mfg', 'Expiry', 'Boxes', 'Pcs/Box', 'Qty', 'Unit', 'Purchase', 'Disc', meta.taxMode === 'gst' ? 'GST%' : null, 'Amount', ''].filter(h => h !== null).map((h, i) => (
                  <th key={i} style={{ ...cell, background: 'var(--surface-raised)', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap', textAlign: 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <Fragment key={i}>
                <tr>
                  <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ ...cell, textAlign: 'center', padding: 0 }}>
                    <button
                      type="button"
                      title="Product details, pricing & packing"
                      onClick={() => setExpandedLines(e => ({ ...e, [i]: !e[i] }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex', alignItems: 'center' }}>
                      {expandedLines[i] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td style={cell}>
                    <ProductAutocomplete value={l.description} onChange={v => setLine(i, 'description', v)} onSelect={p => selectProduct(i, p)} products={products} placeholder="Product name…" style={{ padding: '0.35rem 0.45rem', fontSize: '0.8rem' }} />
                  </td>
                  <td style={cell}>{tInput(l.mfgCompany, v => setLine(i, 'mfgCompany', v), 'Company')}</td>
                  <td style={cell}>{tInput(l.batchNo, v => setLine(i, 'batchNo', v), 'Batch')}</td>
                  <td style={cell}>{tInput(l.mfgDate, v => setLine(i, 'mfgDate', v), '', 'month')}</td>
                  <td style={cell}>{tInput(l.expDate, v => setLine(i, 'expDate', v), '', 'month')}</td>
                  <td style={cell}>{tInput(l.boxCount, v => setLine(i, 'boxCount', v), '0', 'number')}</td>
                  <td style={cell}>{tInput(l.piecesPerBox, v => setLine(i, 'piecesPerBox', v), '0', 'number')}</td>
                  <td style={cell}>{tInput(l.quantity, v => setLine(i, 'quantity', v), String(effQty(l) || 0), 'number')}</td>
                  <td style={cell}>{tInput(l.unit, v => setLine(i, 'unit', v), 'Unit')}</td>
                  <td style={cell}>{tInput(l.rate, v => setLine(i, 'rate', v), '0', 'number')}</td>
                  <td style={cell}>{tInput(l.discount, v => setLine(i, 'discount', v), '0', 'number')}</td>
                  {meta.taxMode === 'gst' && <td style={cell}>{tInput(l.gstPct, v => setLine(i, 'gstPct', v), '0', 'number')}</td>}
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{fmtINR(lineAmount(l))}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>
                    <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                  </td>
                </tr>

                {/* Full product master for this line — everything the Inventory
                    "Add Product" form has. Saving the invoice writes these to the
                    product, making the supplier ledger the source of truth. */}
                {expandedLines[i] && (
                  <tr>
                    <td colSpan={meta.taxMode === 'gst' ? 16 : 15} style={{ ...cell, background: 'var(--surface-raised)', padding: '1rem 1.25rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>

                        {/* Product Basics */}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.6rem', color: 'var(--primary-light)' }}>Product Basics</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <div><label style={labelStyle}>Product No. (SKU)</label>{tInput(l.productNumber, v => setLine(i, 'productNumber', v), 'KA-001')}</div>
                            <div><label style={labelStyle}>HSN / SAC</label>{tInput(l.hsnCode, v => setLine(i, 'hsnCode', v), 'HSN')}</div>
                            <div><label style={labelStyle}>GST %</label>{tInput(l.gstPct, v => setLine(i, 'gstPct', v), '0', 'number')}</div>
                            <div>
                              <label style={labelStyle}>Category</label>
                              <select className="input-field" value={l.type} onChange={e => setLine(i, 'type', e.target.value)}
                                style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}>
                                <option value="">— Select —</option>
                                {AGRI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div><label style={labelStyle}>Pieces / Box</label>{tInput(l.piecesPerBox, v => setLine(i, 'piecesPerBox', v), '1', 'number')}</div>
                            <div>
                              <label style={labelStyle}>Base Unit</label>
                              <select className="input-field" value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)}
                                style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}>
                                {['pcs', 'ltr', 'kg', 'g', 'ml'].map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            <div><label style={labelStyle}>Unit Size (qty/pc)</label>{tInput(l.unitSize, v => setLine(i, 'unitSize', v), '1', 'number')}</div>
                            <div>
                              <label style={labelStyle}>Unit Measure</label>
                              <select className="input-field" value={l.unitMeasure} onChange={e => setLine(i, 'unitMeasure', e.target.value)}
                                style={{ width: '100%', margin: 0, padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}>
                                {['pcs', 'ltr', 'kg', 'g', 'ml'].map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Piece-Level Pricing */}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.6rem', color: 'var(--primary-light)' }}>Piece-Level Pricing</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <div><label style={labelStyle}>MRP (printed on pack)</label>{tInput(l.mrp, v => setLine(i, 'mrp', v), '0.00', 'number')}</div>
                            <div><label style={labelStyle}>PTR (price to retailer)</label>{tInput(l.retailerRate, v => setLine(i, 'retailerRate', v), '0.00', 'number')}</div>
                            <div><label style={labelStyle}>Rate (your purchase cost)</label>{tInput(l.rate, v => setLine(i, 'rate', v), '0.00', 'number')}</div>
                            <div><label style={labelStyle}>Selling price to farmer</label>{tInput(l.farmerRate, v => setLine(i, 'farmerRate', v), '0.00', 'number')}</div>
                          </div>
                        </div>

                        {/* Box-Level Pricing */}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.6rem', color: 'var(--secondary)' }}>Box-Level Pricing <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span></div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <div><label style={labelStyle}>Box MRP</label>{tInput(l.boxMrp, v => setLine(i, 'boxMrp', v), '0.00', 'number')}</div>
                            <div><label style={labelStyle}>Box PTR</label>{tInput(l.boxPtr, v => setLine(i, 'boxPtr', v), '0.00', 'number')}</div>
                            <div><label style={labelStyle}>Box Rate (purchase)</label>{tInput(l.boxPurchase, v => setLine(i, 'boxPurchase', v), '0.00', 'number')}</div>
                            <div><label style={labelStyle}>Box Selling</label>{tInput(l.boxSelling, v => setLine(i, 'boxSelling', v), '0.00', 'number')}</div>
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.85rem', marginBottom: 0 }}>
                        Saving this invoice writes these values to the product master. Fields left blank keep the product's existing value.
                      </p>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-secondary no-print" onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
          <Plus size={13} /> Add line
        </button>

        {/* Charges + Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          <div className="no-print" style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem' }}>Additional Charges</div>
            {([['transportation', 'Transportation'], ['loading', 'Loading'], ['unloading', 'Unloading'], ['otherCharges', 'Other Charges'], ['discount', 'Discount (−)']] as const).map(([k, lbl]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{lbl}</label>
                <input className="input-field" type="number" value={charges[k]} onChange={e => setCharges(c => ({ ...c, [k]: e.target.value }))} placeholder="0" style={{ width: '120px', margin: 0, padding: '0.3rem 0.5rem', fontSize: '0.82rem' }} />
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}><span>Taxable Value</span><strong>{fmtINR(totals.taxableValue)}</strong></div>
            {meta.taxMode === 'gst' && totals.cgst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}><span>CGST</span><strong>{fmtINR(totals.cgst)}</strong></div>}
            {meta.taxMode === 'gst' && totals.sgst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}><span>SGST</span><strong>{fmtINR(totals.sgst)}</strong></div>}
            {meta.taxMode === 'gst' && totals.igst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}><span>IGST</span><strong>{fmtINR(totals.igst)}</strong></div>}
            {totals.extraCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}><span>Charges</span><strong>{fmtINR(totals.extraCharges)}</strong></div>}
            {totals.chargeDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#ef4444' }}><span>Discount</span><strong>(−){fmtINR(totals.chargeDiscount)}</strong></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}><span>Round Off</span><strong>{fmtINR(totals.roundOff)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '2px solid var(--surface-border)', fontSize: '1.1rem' }}><span style={{ fontWeight: 700 }}>Net Amount</span><strong style={{ color: 'var(--secondary)' }}>₹{totals.netAmount.toLocaleString('en-IN')}</strong></div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', textAlign: 'right' }}>Total Qty: {totalQty}</div>
          </div>
        </div>

        {/* Amount in words + footer */}
        <div style={{ marginTop: '1.25rem', fontSize: '0.85rem' }}>
          <strong>Amount in Words:</strong> INR {numberToWords(totals.netAmount)}
        </div>

        <div className="no-print" style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div><label style={labelStyle}>Notes</label><textarea className="input-field" rows={2} value={meta.notes} onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))} placeholder="Any remarks for this purchase invoice…" style={{ width: '100%', margin: 0, resize: 'vertical' }} /></div>
          <div><label style={labelStyle}>Declaration</label><textarea className="input-field" rows={2} value={meta.declaration} onChange={e => setMeta(m => ({ ...m, declaration: e.target.value }))} style={{ width: '100%', margin: 0, resize: 'vertical' }} /></div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <div style={{ maxWidth: '50%' }}><em>{meta.declaration}</em></div>
          <div style={{ textAlign: 'right' }}>
            for {companyName}
            {branding?.signatureUrl
              ? <><br /><img src={branding.signatureUrl} alt="" style={{ height: '44px', maxWidth: '160px', objectFit: 'contain' }} /><br /></>
              : <><br /><br /><br /></>}
            {branding?.signatureName || 'Authorised Signatory'}
          </div>
        </div>

        </div>{/* end on-screen editor (.no-print) */}
      </div>
    </div>
  );
}
