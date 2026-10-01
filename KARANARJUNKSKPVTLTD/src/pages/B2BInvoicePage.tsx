import { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Printer, Plus, Trash2, UserPlus, ArrowLeft, Truck, Lock, LockOpen } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import UpiQrCode from '../components/UpiQrCode';
import {
    addDoc, collection, deleteDoc, getDoc, getDocs, runTransaction, serverTimestamp, updateDoc, writeBatch, doc,
    query, where, limit, onSnapshot
} from 'firebase/firestore';
import { prepareStockDeduction, recordStockMovements, formatLowStockAlert } from '../utils/stockDeduction';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { getAllConfiguredLicenses } from '../utils/invoiceCategories';
import { validateGSTIN } from '../utils/gstinValidator';
import { INVOICE_CONTACT_LABEL } from '../utils/constants';
import { logAudit } from '../utils/auditLog';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Product {
    id: string;
    name: string;
    maxRetailPrice: number;
    retailerPrice: number;
    sellingPrice: number;
    gstPct?: number;
    baseUnit?: string;
    mfgCompany?: string;
    batchNumber?: string;
    expiryDate?: string;
    barcode?: string;
}

interface SalesUser {
    id: string;
    name: string;
    email: string;
}

interface B2BRow {
    productId: string;
    itemDescription: string;
    mfgCompany: string;
    batchNo: string;
    expDate: string;
    gstPct: string;
    per: string;
    quantity: string;
    rate: string;
    grossAmount: number;
}

const PAYMENT_MODES = ['Cash', '15 Days', '30 Days', '45 Days', 'Credit'];

// Digits-only phone comparison — partner numbers are stored in inconsistent
// shapes across imports and manual entry.
const phoneKey = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

const DEFAULT_BANK_DETAILS = '';
const EMPTY_ROW = (): B2BRow => ({
    productId: '',
    itemDescription: '',
    mfgCompany: '',
    batchNo: '',
    expDate: '',
    gstPct: '5',
    per: 'Nos',
    quantity: '',
    rate: '',
    grossAmount: 0,
});

// MM/YY typed string → YYYY-MM stored string (mirrors POSPage.fromMonthYear)
function fromMonthYear(val: string): string {
    const s = (val || '').trim();
    const short = /^(\d{2})\/(\d{2})$/.exec(s);
    if (short) return `20${short[2]}-${short[1]}`;
    const long = /^(\d{2})\/(\d{4})$/.exec(s);
    if (long) return `${long[2]}-${long[1]}`;
    return s;
}

// ─────────────────────────────────────────────
// Number to Words (Indian system)
// ─────────────────────────────────────────────
function numberToWords(num: number): string {
    if (num === 0) return 'Zero';
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

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function B2BInvoicePage() {
    const { tenantId, tenantData, currentUser, userName, userRole } = useAuth();
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const prefilledRetailerId = searchParams.get('retailerId') || '';

    const [branding, setBranding] = useState<any>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [retailers, setRetailers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [nextInvoiceNo, setNextInvoiceNo] = useState('');
    const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
    const [showRetailerDropdown, setShowRetailerDropdown] = useState(false);

    // Salesperson dropdown
    const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
    const [salesmanSearch, setSalesmanSearch] = useState('');
    const [showSalesmanDropdown, setShowSalesmanDropdown] = useState(false);

    // Per-row product search text (separate from the confirmed itemDescription)
    const [rowSearch, setRowSearch] = useState<Record<number, string>>({});
    const [highlightedProductIdx, setHighlightedProductIdx] = useState(-1);

    // Track which products already had batch info auto-filled to avoid re-fetching
    const autoFilledBatchesRef = useRef<Set<string>>(new Set());

    const today = new Date().toISOString().split('T')[0];

    const [transporters, setTransporters] = useState<{ id: string; name: string; mobile?: string; contactPerson?: string }[]>([]);

    const [header, setHeader] = useState({
        invoiceNo: '',
        invoiceDate: today,
        termsOfDelivery: '',
        modeOfPayment: '15 Days',
        salesmanName: '',
        salesmanId: '',
        buyerName: '',
        buyerAddress: '',
        buyerGstin: '',
        buyerContact: '',
        buyerState: 'Maharashtra',
        retailerId: '',
        transporterId: '',
        transporterName: '',
        transporterContact: '',
    });

    const [rows, setRows] = useState<B2BRow[]>(
        Array.from({ length: 5 }, EMPTY_ROW)
    );

    const [previousBalance, setPreviousBalance] = useState('');
    const [discount, setDiscount] = useState('0');
    // Print paper size. A5 landscape is the default finalized design; A4 prints
    // the same card scaled to portrait. Screen editing is unaffected by this.
    const [billFormat, setBillFormat] = useState<'A5' | 'A4'>('A5');
    // Free-text remarks shown in the invoice's Remark row (UI only, matches the
    // old layout; not persisted so save/backend logic is untouched).
    const [remarks, setRemarks] = useState('');

    // ─── Load branding, products, next invoice number ───
    useEffect(() => {
        if (!tenantId) return;

        const qProducts = query(getTenantCollection(db, tenantId, 'products'));
        const unsubProducts = onSnapshot(qProducts, snap => {
            // `name` is coerced to a string here rather than guarded at each use:
            // the product search runs unconditionally on every render, so a single
            // doc missing `name` throws on .toLowerCase() and the error boundary
            // takes down the whole invoice screen.
            setProducts(snap.docs.map(d => {
                const data = d.data();
                return { id: d.id, ...data, name: String(data.name ?? '') };
            }) as Product[]);
        });

        const qRetailers = query(getTenantCollection(db, tenantId, 'retailers'));
        const unsubRetailers = onSnapshot(qRetailers, snap => {
            setRetailers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const qTransporters = query(getTenantCollection(db, tenantId, 'transporters'));
        const unsubTransporters = onSnapshot(qTransporters, snap => {
            setTransporters(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; mobile?: string; contactPerson?: string })));
        });

        const init = async () => {
            try {
                const [brd] = await Promise.all([fetchInvoiceBranding(tenantId)]);
                setBranding(brd);

                const counterRef = getTenantDoc(db, tenantId, 'counters', 'b2bInvoiceCounter');
                const counterSnap = await getDoc(counterRef);
                const seq = counterSnap.exists() ? (counterSnap.data().lastInvoiceNumber || 0) + 1 : 1;
                setNextInvoiceNo(`SIPL/${new Date().getFullYear().toString().slice(-2)}-${(new Date().getFullYear() + 1).toString().slice(-2)}/${seq.toString().padStart(3, '0')}`);

                // Fetch users with the 'sales' role for the salesperson dropdown
                const usersSnap = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('role', '==', 'sales')));
                setSalesUsers(usersSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email || d.id, email: d.data().email || '' })));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        init();
        return () => {
            unsubProducts();
            unsubRetailers();
            unsubTransporters();
        };
    }, [tenantId]);

    // ─── Pre-fill buyer from retailerId query param ───
    useEffect(() => {
        if (!prefilledRetailerId || retailers.length === 0) return;
        const r = retailers.find((x: any) => x.id === prefilledRetailerId);
        if (!r) return;
        setHeader(prev => ({
            ...prev,
            retailerId: r.id,
            buyerName: r.name || prev.buyerName,
            buyerContact: r.number || prev.buyerContact,
            buyerAddress: `${r.atPost || ''}, Tal. ${r.taluka || ''}, Dist. ${r.district || ''}`.trim(),
            buyerGstin: r.gstin || prev.buyerGstin,
            buyerState: r.state || prev.buyerState,
        }));
        if (!searchParams.get('orderId')) applyRetailerBalance(r);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefilledRetailerId, retailers]);

    // ─── Load existing order by orderId query param ───
    const prefilledOrderId = searchParams.get('orderId') || '';
    const [existingOrder, setExistingOrder] = useState<any>(null);
    useEffect(() => {
        if (!prefilledOrderId || !tenantId) return;
        getDoc(getTenantDoc(db, tenantId, 'salesOrders', prefilledOrderId)).then(snap => {
            if (!snap.exists()) return;
            const d = snap.data();
            setExistingOrder({ id: snap.id, ...d });
            // Restore header fields
            setHeader(prev => ({
                ...prev,
                invoiceNo: d.orderNumber || prev.invoiceNo,
                invoiceDate: d.invoiceDate || prev.invoiceDate,
                modeOfPayment: d.modeOfPayment || prev.modeOfPayment,
                salesmanName: d.salesmanName || prev.salesmanName,
                salesmanId: d.salesmanId || prev.salesmanId,
                termsOfDelivery: d.termsOfDelivery || prev.termsOfDelivery,
                buyerName: d.retailerName || d.buyerName || prev.buyerName,
                buyerAddress: d.buyerAddress || prev.buyerAddress,
                buyerGstin: d.buyerGstin || prev.buyerGstin,
                buyerContact: d.buyerContact || prev.buyerContact,
                buyerState: d.buyerState || prev.buyerState,
                retailerId: d.retailerId || prev.retailerId,
                transporterId: d.transporterId || prev.transporterId,
                transporterName: d.transporterName || prev.transporterName,
                transporterContact: d.transporterContact || prev.transporterContact,
            }));
            // Restore discount / previous balance
            if (d.discountAmount !== undefined) setDiscount(String(d.discountAmount));
            if (d.previousBalance !== undefined) setPreviousBalance(String(d.previousBalance));
            // Restore line items — pad to at least 10 rows
            if (d.lineItems && d.lineItems.length > 0) {
                const restored: B2BRow[] = d.lineItems.map((li: any) => ({
                    productId: li.productId || '',
                    itemDescription: li.itemDescription || '',
                    mfgCompany: li.mfgCompany || '',
                    batchNo: li.batchNo || '',
                    expDate: li.expDate || '',
                    gstPct: String(li.gstPct ?? '5'),
                    per: li.per || 'Nos',
                    quantity: String(li.quantity ?? ''),
                    rate: String(li.rate ?? ''),
                    grossAmount: li.grossAmount || 0,
                }));
                // Pad with empty rows to fill grid
                while (restored.length < 5) restored.push(EMPTY_ROW());
                setRows(restored);
            }
        }).catch(e => console.error('Failed to load existing order:', e));
    }, [prefilledOrderId, tenantId]);

    // Auto-fill batch number + expiry date from inventoryBatches for newly selected products.
    // Uses the same FIFO logic as POS (earliest non-zero batch) and only fires once per product.
    useEffect(() => {
        if (!tenantId) return;
        const filledRef = autoFilledBatchesRef.current;
        rows.forEach((row, idx) => {
            if (!row.productId || filledRef.has(`${idx}-${row.productId}`)) return;
            // Only auto-fill if the row has no batch info yet
            if (row.batchNo || row.expDate) { filledRef.add(`${idx}-${row.productId}`); return; }
            filledRef.add(`${idx}-${row.productId}`);
            getDocs(query(getTenantCollection(db, tenantId, 'inventoryBatches'), where('productId', '==', row.productId))).then(snap => {
                const batches = snap.docs.map(d => ({ id: d.id, ...d.data() as any }))
                    .filter((b: any) => (b.quantity ?? 0) > 0)
                    .sort((a: any, b: any) => {
                        if (!a.expiryDate && !b.expiryDate) return 0;
                        if (!a.expiryDate) return 1;
                        if (!b.expiryDate) return -1;
                        return (a.expiryDate as string).localeCompare(b.expiryDate as string);
                    });
                const top = batches[0];
                if (!top) return;
                setRows(prev => prev.map((r, i) => {
                    if (i !== idx || r.productId !== row.productId) return r;
                    if (r.batchNo || r.expDate) return r; // already filled manually
                    return { ...r, batchNo: top.batchNumber ?? '', expDate: top.expiryDate ?? '' };
                }));
            }).catch(console.error);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows.map(r => r.productId).join(','), tenantId]);

    // Pull the partner's running dues into Previous Balance, computed the same
    // way Worklist → Retailer Details derives "Outstanding Dues" — live from
    // salesOrders + the payments subcollection — rather than the retailer
    // doc's `outstandingAmount` cache. That cache is a best-effort counter
    // several flows (Digital Khata entries/payments, some payment edits) never
    // write back to, so it silently drifts from the real balance shown on the
    // Retailer Details page. Skipped while editing a saved invoice, whose own
    // previousBalance is restored from the order and must not be overwritten.
    const applyRetailerBalance = async (r: any) => {
        if (prefilledOrderId) return;
        if (!tenantId || !r?.id) {
            setPreviousBalance(String(Number(r?.outstandingAmount) || 0));
            return;
        }
        try {
            const [ordersSnap, paymentsSnap] = await Promise.all([
                getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), where('retailerId', '==', r.id))),
                getDocs(getTenantCollection(db, tenantId, 'retailers', r.id, 'payments')),
            ]);
            const totalSales = ordersSnap.docs.reduce((s, d) => {
                const so = d.data() as any;
                if (so.deleted) return s;
                return s + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
            }, 0);
            const totalPaid = paymentsSnap.docs.reduce((s, d) => s + Number((d.data() as any).amount ?? 0), 0);
            setPreviousBalance(String(Math.max(0, totalSales - totalPaid)));
        } catch (e) {
            console.error('Failed to compute live outstanding balance:', e);
            setPreviousBalance(String(Number(r?.outstandingAmount) || 0));
        }
    };

    // ─── Auto-fill buyer by phone ───
    // Matches on digits only: numbers are stored inconsistently (numeric type,
    // +91 prefix, spaces, dashes), so an exact string match missed most partners.
    const handleBuyerPhoneBlur = async () => {
        if (!tenantId) return;
        const key = phoneKey(header.buyerContact);
        if (key.length < 6) return;
        const match = retailers.find((r: any) => {
            const stored = phoneKey(r.number ?? r.phone);
            if (!stored) return false;
            return stored === key || stored.slice(-10) === key.slice(-10);
        });
        if (!match) return;
        setHeader(prev => ({
            ...prev,
            retailerId: match.id,
            buyerName: match.name || prev.buyerName,
            buyerAddress: `${match.atPost || ''}, Tal. ${match.taluka || ''}, Dist. ${match.district || ''}`.trim(),
            buyerGstin: match.gstin || prev.buyerGstin,
        }));
        applyRetailerBalance(match);
    };

    // ─── Row calculations ───
    const handleRowChange = (idx: number, field: keyof B2BRow, value: string) => {
        const newRows = [...rows];
        if (field === 'productId') {
            const p = products.find(pr => pr.id === value);
            if (p) {
                newRows[idx].productId = p.id;
                newRows[idx].itemDescription = p.name;
                newRows[idx].mfgCompany = p.mfgCompany || '';
                newRows[idx].rate = (p.retailerPrice || p.maxRetailPrice || 0).toString();
                newRows[idx].gstPct = (p.gstPct || 5).toString();
                newRows[idx].per = p.baseUnit || 'Nos';
                // Default quantity to 1 on selection (was blank/0). Stays fully
                // editable afterwards via the Qty input.
                if (!newRows[idx].quantity || parseFloat(newRows[idx].quantity) === 0) newRows[idx].quantity = '1';
                // Fill batch/expiry from product document as fallback (inventoryBatches useEffect refines this)
                if (!newRows[idx].batchNo) newRows[idx].batchNo = p.batchNumber || '';
                if (!newRows[idx].expDate) newRows[idx].expDate = p.expiryDate || '';
                // Clear the search text for this row after selection
                setRowSearch(s => ({ ...s, [idx]: '' }));
                setHighlightedProductIdx(-1);
            }
        } else if (field === 'itemDescription') {
            newRows[idx].productId = '';
            newRows[idx].mfgCompany = '';
            newRows[idx].itemDescription = value;
        } else {
            (newRows[idx][field] as string) = value;
        }
        // Recalculate gross = rate × quantity
        const rate = parseFloat(newRows[idx].rate) || 0;
        const qty = parseFloat(newRows[idx].quantity) || 0;
        newRows[idx].grossAmount = rate * qty;
        setRows(newRows);
    };

    const addRow = () => setRows(r => [...r, EMPTY_ROW()]);
    const removeRow = (idx: number) => setRows(r => r.filter((_, i) => i !== idx));

    // ─── Totals ───
    const activeRows = rows.filter(r => r.itemDescription || r.rate);
    const totalGross = rows.reduce((s, r) => s + (r.grossAmount || 0), 0);
    const taxableValue = totalGross; // Pre-GST taxable (gross already includes GST in this template style)
    // Compute weighted average GST
    const cgstPct = 2.5; // Typically 2.5% CGST + 2.5% SGST = 5% total for agri inputs
    const sgstPct = 2.5;
    // Compute GST from gross (reverse calculation: taxable = gross / (1 + gst/100))
    const computedTaxable = rows.reduce((s, r) => {
        const gstPct = parseFloat(r.gstPct) || 0;
        const gross = r.grossAmount || 0;
        return s + gross / (1 + gstPct / 100);
    }, 0);
    const totalCgst = rows.reduce((s, r) => {
        const gstPct = parseFloat(r.gstPct) || 0;
        const gross = r.grossAmount || 0;
        const taxable = gross / (1 + gstPct / 100);
        return s + taxable * (gstPct / 2) / 100;
    }, 0);
    const totalSgst = totalCgst;
    const totalTax = totalCgst + totalSgst;
    const discountAmt = Math.max(0, parseFloat(discount) || 0);
    const roundOff = Math.round(computedTaxable + totalTax - discountAmt) - (computedTaxable + totalTax - discountAmt);
    // Discount can never drive the payable below zero.
    const netAmount = Math.max(0, Math.round(computedTaxable + totalTax - discountAmt));
    const prevBal = parseFloat(previousBalance) || 0;
    const netBalance = netAmount + prevBal;

    const fmt = (n: number) => n.toFixed(2);

    // Single source of truth for the displayed/printed invoice number: while editing,
    // it is always the persisted orderNumber, never the freshly generated counter value.
    const displayInvoiceNo = existingOrder ? (existingOrder.orderNumber || nextInvoiceNo) : nextInvoiceNo;

    // ─── Generate invoice number ───
    const generateInvoiceNumber = async (): Promise<string> => {
        if (!tenantId) return `B2B-${Date.now()}`;
        const counterRef = getTenantDoc(db, tenantId, 'counters', 'b2bInvoiceCounter');
        let seq = 1;
        await runTransaction(db, async tx => {
            const snap = await tx.get(counterRef);
            if (!snap.exists()) {
                tx.set(counterRef, { lastInvoiceNumber: 1 });
            } else {
                seq = (snap.data().lastInvoiceNumber || 0) + 1;
                tx.update(counterRef, { lastInvoiceNumber: seq });
            }
        });
        const y = new Date().getFullYear();
        return `SIPL/${y.toString().slice(-2)}-${(y + 1).toString().slice(-2)}/${seq.toString().padStart(3, '0')}`;
    };

    // ─── Print (snapshot the live invoice DOM into a new window) ───
    // Shared by Save & Print and the print-only action so there is one print path.
    // Snapshotting into a separate window fixes the iOS Safari blank-print race.
    const printInvoiceDOM = (invNoLabel: string) => {
        const container = document.querySelector('.b2b-card') as HTMLElement | null;
        const html = container ? container.outerHTML : document.body.innerHTML;
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(el => el.outerHTML).join('\n');
        // A5 landscape (default) or A4 portrait. The card uses %-based column
        // widths, so it reflows to fill whichever page width is chosen.
        const pageRule = billFormat === 'A4' ? 'size: A4 portrait; margin: 8mm;' : 'size: A5 landscape; margin: 4mm;';
        // A4 = old sectioned portrait (Times New Roman, old table). A5 = compact
        // landscape whose cells are fully inline-styled, so no table override.
        const printCardCss = billFormat === 'A4'
            ? ".b2b-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; padding: 6px !important; background: #fff !important; color: #000 !important; width: 100% !important; max-width: 100% !important; min-height: 0 !important; font-family: 'Times New Roman', serif; }\n  .b2b-table th, .b2b-table td { border: 1px solid #222 !important; padding: 3px 4px !important; font-size: 0.76rem !important; }"
            : ".b2b-card { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; width: 100% !important; max-width: 100% !important; min-height: 0 !important; font-family: 'Arial, Helvetica, sans-serif'; }";
        const win = window.open('', '_blank');
        if (!win) {
            window.print();
            return;
        }
        win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B2B Invoice ${invNoLabel}</title>
${styles}
<style>
  @page { ${pageRule} }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; }
  html, body { background: #fff !important; color: #000 !important; margin: 0; padding: 0; }
  .b2b-wrapper { background: #fff !important; padding: 0 !important; }
  .no-print { display: none !important; }
  ${printCardCss}
  input, select, textarea { display: none !important; }
  .print-val { display: inline !important; color: #000; }
  .b2b-table { border-collapse: collapse; width: 100%; }
  @media print { .no-print { display: none !important; } }
</style>
</head><body>${html}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 700);
    };

    // ─── Print only (no save, no counter increment) ───
    // Prints the current invoice as-shown using the on-screen preview number.
    const handlePrintOnly = () => {
        if (activeRows.length === 0) { alert('Please add at least one item.'); return; }
        printInvoiceDOM(displayInvoiceNo);
    };

    // ─── Save ───
    const isEditing = !!prefilledOrderId && !!existingOrder;
    const isLocked = isEditing && existingOrder?.status !== 'delivered' && !existingOrder?.manuallyUnlocked;

    const handleUnlock = async () => {
        if (!tenantId || !prefilledOrderId) return;
        await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', prefilledOrderId), { manuallyUnlocked: true });
        // Reload existingOrder to reflect the unlock
        const snap = await getDoc(getTenantDoc(db, tenantId, 'salesOrders', prefilledOrderId));
        if (snap.exists()) setExistingOrder({ id: snap.id, ...snap.data() });
    };

    const handleSave = async (isPrint = false) => {
        if (isLocked) return;
        if (!tenantId) return;
        if (!header.salesmanName) { alert('Please select a Salesperson before saving.'); return; }
        if (activeRows.length === 0) { alert('Please add at least one item.'); return; }

        // Resolve productId by exact name match when the row was typed but the
        // autocomplete suggestion was never clicked — otherwise stock deduction
        // and stock movement recording silently skip that line entirely.
        const productIdByName = new Map(products.map(p => [(p.name || '').trim().toLowerCase(), p.id]));
        const resolveProductId = (r: { productId: string; itemDescription: string }) =>
            r.productId || productIdByName.get((r.itemDescription || '').trim().toLowerCase()) || '';

        // ── Stock validation (new sales only, not edits) ──────────────────
        // Negative stock is allowed: selling beyond recorded inventory is a
        // warning, not a blocker. Only genuinely fatal issues (e.g. product
        // not found) stop the save.
        if (!isEditing) {
            const saleLines = activeRows
                .filter(r => resolveProductId(r) && parseFloat(r.quantity) > 0)
                .map(r => ({
                    productId: resolveProductId(r),
                    productName: r.itemDescription,
                    qty: parseFloat(r.quantity) || 0,
                    batchNo: r.batchNo || undefined,
                }));
            if (saleLines.length > 0) {
                const check = await prepareStockDeduction(tenantId, saleLines, true);
                if (!check.valid) {
                    alert('Stock validation failed:\n\n' + check.errors.join('\n'));
                    return;
                }
                // Low-stock (negative) is not blocked here — it's confirmed after
                // the invoice saves via a clear Low Stock alert (see below).
            }
        }

        setIsProcessing(true);
        try {
            // Editing keeps the original invoice number; only a brand-new invoice consumes the counter.
            const invNo = isEditing ? existingOrder.orderNumber : await generateInvoiceNumber();
            const lineItems = activeRows.map(r => ({
                productId: resolveProductId(r),
                itemDescription: r.itemDescription,
                mfgCompany: r.mfgCompany || '',
                batchNo: r.batchNo,
                expDate: r.expDate,
                gstPct: parseFloat(r.gstPct) || 0,
                per: r.per,
                quantity: parseFloat(r.quantity) || 0,
                rate: parseFloat(r.rate) || 0,
                grossAmount: r.grossAmount,
            }));
            const orderPayload = {
                orderNumber: invNo,
                invoiceType: 'B2B_GST',
                retailerId: header.retailerId,
                retailerName: header.buyerName,
                buyerAddress: header.buyerAddress,
                buyerGstin: header.buyerGstin,
                buyerContact: header.buyerContact,
                modeOfPayment: header.modeOfPayment,
                salesmanName: header.salesmanName,
                salesmanId: header.salesmanId || null,
                termsOfDelivery: header.termsOfDelivery,
                transporterId: header.transporterId || null,
                transporterName: header.transporterName || null,
                transporterContact: header.transporterContact || null,
                lineItems,
                taxableValue: computedTaxable,
                cgst: totalCgst,
                sgst: totalSgst,
                totalTax,
                discountAmount: discountAmt,
                roundOff,
                netAmount,
                grandTotal: netAmount,   // alias so OrderHistoryPage & PaymentReminders can read it
                previousBalance: prevBal,
                netBalance,
                invoiceDate: header.invoiceDate,
                // 'confirmed' enters the tracking pipeline (Order Placed → Dispatched → Delivered).
                // Cash invoices are immediately settled so 'paid' is correct there.
                // On edit we preserve the existing tracking status if it's already in the pipeline.
                status: (() => {
                    if (header.modeOfPayment === 'Cash') return 'paid';
                    if (isEditing) {
                        const cur = existingOrder?.status || '';
                        if (['confirmed', 'dispatched', 'delivered', 'cancelled'].includes(cur)) return cur;
                    }
                    return 'confirmed';
                })(),
                paymentStatus: header.modeOfPayment === 'Cash' ? 'Paid' : 'Pending',
                // amountPaid mirrors paymentStatus here so the same field every other
                // screen reads (WorklistDetailsPage's order cards, Add Payment, etc.)
                // agrees with the "Paid" badge instead of showing full outstanding.
                amountPaid: header.modeOfPayment === 'Cash' ? netAmount : 0,
            };

            let savedOrderId = prefilledOrderId || '';
            if (isEditing) {
                await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', prefilledOrderId), {
                    ...orderPayload,
                    updatedAt: serverTimestamp(),
                });
                logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'B2B Invoice', action: 'Update', entityName: header.buyerName || 'Customer', entityId: prefilledOrderId, description: `B2B Invoice edited · ${invNo} · ₹${netAmount.toLocaleString('en-IN')}`, after: { orderNumber: invNo, grandTotal: netAmount, modeOfPayment: header.modeOfPayment } });
            } else {
                const ref = await addDoc(getTenantCollection(db, tenantId, 'salesOrders'), {
                    ...orderPayload,
                    createdAt: serverTimestamp(),
                });
                savedOrderId = ref.id;
                logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'B2B Invoice', action: 'Generate Invoice', entityName: header.buyerName || 'Customer', entityId: savedOrderId, description: `B2B Invoice created · ${invNo} · ₹${netAmount.toLocaleString('en-IN')}`, after: { orderNumber: invNo, grandTotal: netAmount, modeOfPayment: header.modeOfPayment } });

                // ── FIFO batch deduction for new invoices ─────────────────
                const saleLines = lineItems
                    .filter(li => li.productId && li.quantity > 0)
                    .map(li => ({ productId: li.productId, productName: li.itemDescription, qty: li.quantity, batchNo: li.batchNo || undefined }));
                if (saleLines.length > 0) {
                    try {
                        // allowNegative=true — deduction still produces updates
                        // when stock is insufficient, letting quantities go negative.
                        const deduction = await prepareStockDeduction(tenantId, saleLines, true);
                        if (deduction.valid && (deduction.batchUpdates.length > 0 || deduction.productUpdates.length > 0)) {
                            const wb = writeBatch(db);
                            for (const upd of deduction.batchUpdates) {
                                wb.update(getTenantDoc(db, tenantId, 'inventoryBatches', upd.batchDocId), { quantity: upd.newQty, updatedAt: serverTimestamp() });
                            }
                            for (const upd of deduction.productUpdates) {
                                const fields: Record<string, unknown> = { loosePieces: upd.newLoosePieces, updatedAt: serverTimestamp() };
                                if (upd.newQuantity !== undefined) fields.quantity = upd.newQuantity;
                                wb.update(getTenantDoc(db, tenantId, 'products', upd.productId), fields);
                            }
                            await wb.commit();
                            recordStockMovements(tenantId, deduction.movements, {
                                type: 'sale_b2b', sourceType: 'B2B Invoice', sourceId: savedOrderId, sourceNumber: invNo,
                                date: header.invoiceDate || new Date().toISOString().slice(0, 10),
                            }).catch(console.error);
                        }
                        // Invoice is saved. If any product went below zero, confirm
                        // clearly that it saved while inventory is now negative.
                        if (deduction.stockWarnings.length > 0) {
                            alert(formatLowStockAlert(deduction.stockWarnings));
                        }
                    } catch (e) {
                        console.error('B2B stock deduction failed (invoice already saved):', e);
                    }
                }
            }

            // ── The invoice itself is now committed. ──────────────────────────
            // Confirm it immediately, on BOTH the Save and Save & Print paths.
            // Previously only the non-print path alerted, so Save & Print saved
            // silently and there was no way to tell it had worked.
            showToast(`Invoice ${invNo} saved.`, 'success');

            // Everything below is bookkeeping ON TOP of a saved invoice. It runs
            // in its own try/catch so a failure here can never surface as
            // "Error saving invoice" — that message sent people back to press
            // Save again, which burns a fresh number off the counter and writes
            // a SECOND invoice for the same sale, double-applying these totals.
            try {
                // If editing and the order previously belonged to a different retailer
                // (or had no retailer), reverse its contribution there first.
                const prevRetailerId = isEditing ? (existingOrder.retailerId || '') : '';
                if (isEditing && prevRetailerId && prevRetailerId !== header.retailerId) {
                    const prevRetailerRef = getTenantDoc(db, tenantId, 'retailers', prevRetailerId);
                    const prevRetailerSnap = await getDoc(prevRetailerRef);
                    if (prevRetailerSnap.exists()) {
                        const rData = prevRetailerSnap.data();
                        const wasPaid = existingOrder.modeOfPayment === 'Cash';
                        const prevNetAmount = Number(existingOrder.netAmount || existingOrder.grandTotal || 0);
                        await updateDoc(prevRetailerRef, {
                            totalSales: Math.max(0, Number(rData.totalSales || 0) - prevNetAmount),
                            outstandingAmount: Math.max(0, Number(rData.outstandingAmount || 0) - (wasPaid ? 0 : prevNetAmount)),
                            totalPaid: Math.max(0, Number(rData.totalPaid || 0) - (wasPaid ? prevNetAmount : 0)),
                        });
                    }
                    // Also remove the stale Cash auto-payment recorded under the old retailer.
                    const stalePayments = await getDocs(query(
                        getTenantCollection(db, tenantId, 'retailers', prevRetailerId, 'payments'),
                        where('orderId', '==', savedOrderId),
                        where('source', '==', 'b2b_invoice_cash'),
                    ));
                    for (const d of stalePayments.docs) await deleteDoc(d.ref);
                }

                // Apply this invoice's contribution to the (current) retailer's financials.
                // On edit against the SAME retailer, reverse the order's previous contribution
                // before applying the new one so totals reflect the delta, not a double-count.
                if (header.retailerId) {
                    const retailerRef = getTenantDoc(db, tenantId, 'retailers', header.retailerId);
                    const retailerSnap = await getDoc(retailerRef);
                    if (retailerSnap.exists()) {
                        const rData = retailerSnap.data();
                        const currentSales = Number(rData.totalSales || 0);
                        const currentOutstanding = Number(rData.outstandingAmount || 0);
                        const currentTotalPaid = Number(rData.totalPaid || 0);

                        const sameRetailer = isEditing && prevRetailerId === header.retailerId;
                        const wasPaid = sameRetailer && existingOrder.modeOfPayment === 'Cash';
                        const prevNetAmount = sameRetailer ? Number(existingOrder.netAmount || existingOrder.grandTotal || 0) : 0;

                        const salesAfterReversal = currentSales - prevNetAmount;
                        const outstandingAfterReversal = currentOutstanding - (wasPaid ? 0 : prevNetAmount);
                        const totalPaidAfterReversal = currentTotalPaid - (wasPaid ? prevNetAmount : 0);

                        const isPaid = header.modeOfPayment === 'Cash';
                        const newSales = salesAfterReversal + netAmount;
                        const newOutstanding = outstandingAfterReversal + (isPaid ? 0 : netAmount);
                        const newTotalPaid = totalPaidAfterReversal + (isPaid ? netAmount : 0);

                        await updateDoc(retailerRef, {
                            totalSales: Math.max(0, newSales),
                            outstandingAmount: Math.max(0, newOutstanding),
                            totalPaid: Math.max(0, newTotalPaid),
                            lastOrderedAt: serverTimestamp()
                        });
                    }

                    // Keep the retailer's payments subcollection in sync with this
                    // invoice's Cash auto-payment, since Total Sales/Amount Paid on
                    // the Worklist and Partner Worklist pages are computed by summing
                    // that subcollection, not by reading paymentStatus off the order.
                    const cashPaymentsQuery = query(
                        getTenantCollection(db, tenantId, 'retailers', header.retailerId, 'payments'),
                        where('orderId', '==', savedOrderId),
                        where('source', '==', 'b2b_invoice_cash'),
                    );
                    const existingCashPayments = await getDocs(cashPaymentsQuery);
                    const isPaidNow = header.modeOfPayment === 'Cash';

                    if (isPaidNow) {
                        if (existingCashPayments.empty) {
                            await addDoc(getTenantCollection(db, tenantId, 'retailers', header.retailerId, 'payments'), {
                                amount: netAmount,
                                paymentDate: header.invoiceDate,
                                paymentMethod: 'Cash',
                                notes: `B2B GST Invoice ${invNo}`,
                                orderId: savedOrderId,
                                orderNumber: invNo,
                                linkedOrderIds: [savedOrderId],
                                unallocatedAmount: 0,
                                source: 'b2b_invoice_cash',
                                createdAt: serverTimestamp(),
                            });
                        } else {
                            await updateDoc(existingCashPayments.docs[0].ref, {
                                amount: netAmount,
                                paymentDate: header.invoiceDate,
                                orderNumber: invNo,
                            });
                        }
                    } else if (!existingCashPayments.empty) {
                        await deleteDoc(existingCashPayments.docs[0].ref);
                    }
                }
            } catch (bookkeepingErr) {
                console.error('Retailer totals update failed (invoice already saved):', bookkeepingErr);
                showToast(
                    `Invoice ${invNo} saved, but the retailer's balance could not be updated. Do NOT save again — reopen the retailer to refresh their totals.`,
                    'error',
                    9000,
                );
            }

            if (!isPrint) {
                if (isEditing) {
                    navigate(header.retailerId ? `/worklist/${header.retailerId}` : '/worklist');
                } else {
                    resetForm();
                }
            } else {
                setIsProcessing(false);
                // Snapshot DOM -> new window to fix iOS Safari blank print
                // (window.print() on same page would race with resetForm() clearing state)
                setTimeout(() => {
                    printInvoiceDOM(invNo);
                    // Safe to reset now — new window has a static clone
                    if (isEditing) {
                        navigate(header.retailerId ? `/worklist/${header.retailerId}` : '/worklist');
                    } else {
                        resetForm();
                    }
                }, 200);
                return;
            }
        } catch (e) {
            // Only the invoice write itself reaches here now — the retailer
            // bookkeeping has its own handler — so "nothing was saved" is
            // accurate, and retrying is genuinely the right thing to do.
            console.error(e);
            alert('Error saving invoice — nothing was saved. Please try again.');
        }
        setIsProcessing(false);
    };

    const resetForm = () => {
        setHeader({ invoiceNo: '', invoiceDate: today, termsOfDelivery: '', modeOfPayment: '15 Days', salesmanName: '', salesmanId: '', buyerName: '', buyerAddress: '', buyerGstin: '', buyerContact: '', buyerState: 'Maharashtra', retailerId: '', transporterId: '', transporterName: '', transporterContact: '' });
        setRows(Array.from({ length: 5 }, EMPTY_ROW));
        setPreviousBalance('');
        setDiscount('0');
        setRowSearch({});
        setSalesmanSearch('');
        autoFilledBatchesRef.current.clear();
        // Refresh next invoice number
        if (tenantId) {
            getDoc(getTenantDoc(db, tenantId, 'counters', 'b2bInvoiceCounter')).then(snap => {
                const seq = snap.exists() ? (snap.data().lastInvoiceNumber || 0) + 1 : 1;
                const y = new Date().getFullYear();
                setNextInvoiceNo(`SIPL/${y.toString().slice(-2)}-${(y + 1).toString().slice(-2)}/${seq.toString().padStart(3, '0')}`);
            });
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}><Loader2 className="animate-spin" style={{ margin: '0 auto' }} /></div>;

    const sellerName = branding?.businessName || tenantData?.businessName || 'Your Business Name';
    const allLicenses = getAllConfiguredLicenses(branding);

    // On-screen paper geometry — the preview mirrors the selected print format
    // exactly. Both A5-landscape (210×148mm) and A4-portrait (210×297mm) share a
    // 210mm width, so columns/fonts are identical; only orientation (page
    // height) and print margins differ. PX_PER_MM keeps A5 at the prior ~1050px.
    const PX_PER_MM = 5;
    const paper = billFormat === 'A4' ? { wMm: 210, hMm: 297 } : { wMm: 210, hMm: 148 };
    const cardWidthPx = paper.wMm * PX_PER_MM;               // 1050px for both
    const cardMinHeightPx = paper.hMm * PX_PER_MM;           // taller for A4

    // MM/YY display for expiry dates stored as YYYY-MM
    const toMonthYear = (val: string) => {
        const m = /^(\d{4})-(\d{2})/.exec((val || '').trim());
        return m ? `${m[2]}/${m[1].slice(2)}` : (val || '');
    };

    return (
        <div style={{ background: 'var(--surface-base)', padding: '2rem', minHeight: '100vh' }} className="b2b-wrapper">
            {prefilledRetailerId && (
                <button className="btn btn-secondary no-print" onClick={() => navigate(`/worklist/${prefilledRetailerId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                    <ArrowLeft size={16} /> Back to Partner
                </button>
            )}
            <style>{`
                @media print {
                    @page { ${billFormat === 'A4' ? 'size: A4 portrait; margin: 8mm;' : 'size: A5 landscape; margin: 4mm;'} }
                    .b2b-wrapper { padding: 0 !important; background: transparent !important; }
                    .b2b-card { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 0 !important; }
                    .no-print { display: none !important; }
                    input, select, textarea { display: none !important; }
                    .print-val { display: inline !important; color: #000; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
                .print-val { display: none; }
                .b2b-table { border-collapse: collapse; width: 100%; }
                .b2b-table th, .b2b-table td { border: 1px solid #222; padding: 4px 5px; font-size: 0.82rem; }
                .b2b-table th { background: #f2f2f2; font-weight: 700; text-align: center; }
                .b2b-cell { border: 1px solid #222; padding: 4px 6px; font-size: 0.82rem; }
                .b2b-input { width: 100%; border: none; background: transparent; outline: none; font-family: inherit; color: inherit; font-size: inherit; }
                .b2b-label { font-weight: 700; font-size: 0.82rem; }
                .b2b-dropdown { position: absolute; top: 100%; left: 0; min-width: 220px; max-height: 200px; overflow-y: auto; background: #fff; border: 1px solid #ccc; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
                .b2b-dropdown-item { padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid #eee; text-align: left; }
                .b2b-dropdown-item:hover { background: #e8f5e9; }
            `}</style>

            {/* ── Toolbar: paper-size selector + Onboard Retailer (no-print) ── */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', maxWidth: '1050px', marginLeft: 'auto', marginRight: 'auto' }}>
                {/* Paper-size selector — accountant can print A5 or A4 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Print size:</span>
                    <div style={{ display: 'inline-flex', border: '1.5px solid #1565C0', borderRadius: '8px', overflow: 'hidden' }}>
                        {(['A5', 'A4'] as const).map(f => (
                            <button key={f} type="button" onClick={() => setBillFormat(f)}
                                style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', background: billFormat === f ? '#1565C0' : 'transparent', color: billFormat === f ? '#fff' : '#1565C0', fontFamily: 'inherit' }}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <Link
                    to="/onboarding"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.1rem', background: 'var(--primary-light)', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit' }}
                >
                    <UserPlus size={16} /> Onboard New Retailer
                </Link>
            </div>

            {billFormat === 'A5' ? (
            <div style={{ width: cardWidthPx, minHeight: cardMinHeightPx, maxWidth: '100%', margin: '0 auto', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', borderRadius: '8px', border: '1.5px solid #333', overflow: 'hidden' }} className="b2b-card b2b-a5">

                {/* ══ HEADER ══════════════════════════════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: `${allLicenses.length > 0 ? 'auto ' : ''}1fr 145px`, borderBottom: '1.5px solid #333' }}>

                    {/* License box */}
                    {allLicenses.length > 0 && (
                        <div style={{ borderRight: '1px solid #aaa', padding: '4px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
                            {allLicenses.map(lic => (
                                <div key={lic.label} style={{ fontSize: '0.44rem', color: '#333', whiteSpace: 'nowrap' }}>
                                    <strong>{lic.label}:</strong> {lic.number}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Center: GST INVOICE + Business Info */}
                    <div style={{ borderRight: '1px solid #aaa', padding: '4px 10px', textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5px' }}>
                        <div style={{ fontWeight: 900, fontSize: '0.82rem', letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: '#111', lineHeight: 1.1 }}>GST INVOICE</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                            {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '18px', objectFit: 'contain' }} />}
                            <div style={{ fontWeight: 800, fontSize: '0.68rem', lineHeight: 1.15 }}>{sellerName}</div>
                        </div>
                        {(branding?.address || tenantData?.location) && (
                            <div style={{ fontSize: '0.50rem', color: '#333', lineHeight: 1.35 }}>{branding?.address || tenantData?.location}</div>
                        )}
                        <div style={{ fontSize: '0.48rem', color: '#333', display: 'flex', gap: '5px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                            {branding?.gstin && <span><strong>GSTIN:</strong> {branding.gstin}</span>}
                            <span>| <strong>Contact:</strong> {INVOICE_CONTACT_LABEL}</span>
                            {branding?.contact && <span>| <strong>Ph:</strong> {branding.contact}</span>}
                        </div>
                    </div>

                    {/* Right: Invoice meta (editable on screen, static on print) */}
                    <div style={{ padding: '4px 7px', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: '0.52rem', gap: '3px' }}>
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ whiteSpace: 'nowrap' }}>Invoice No:</strong>
                            <span style={{ fontWeight: 900 }}>{displayInvoiceNo}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <strong style={{ whiteSpace: 'nowrap' }}>Date:</strong>
                            <input type="date" className="b2b-input no-print" style={{ width: '95px', fontSize: '0.52rem' }} value={header.invoiceDate} onChange={e => setHeader(h => ({ ...h, invoiceDate: e.target.value }))} />
                            <span className="print-val">{header.invoiceDate}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <strong style={{ whiteSpace: 'nowrap' }}>Mode:</strong>
                            <select className="b2b-input no-print" style={{ fontSize: '0.52rem' }} value={header.modeOfPayment} onChange={e => setHeader(h => ({ ...h, modeOfPayment: e.target.value }))}>
                                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <span className="print-val" style={{ fontWeight: 900 }}>{header.modeOfPayment}</span>
                        </div>
                    </div>
                </div>

                {/* ══ BUYER ROW 1 — Name / Contact / Address / GSTIN ══════ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.75fr 1.2fr 1.2fr', borderBottom: '1px solid #aaa', fontSize: '0.57rem' }}>
                    {/* Buyer name with autocomplete */}
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Buyer:</strong>
                        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                            <input className="b2b-input no-print" style={{ fontWeight: 800, fontSize: '0.57rem' }} placeholder="Buyer / Retailer Name" value={header.buyerName}
                                onChange={e => { setHeader(h => ({ ...h, buyerName: e.target.value, retailerId: '' })); setShowRetailerDropdown(e.target.value.length > 0); }}
                                onFocus={() => header.buyerName.length > 0 && setShowRetailerDropdown(true)}
                                onBlur={() => setTimeout(() => setShowRetailerDropdown(false), 200)} />
                            <span className="print-val" style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.buyerName}</span>
                            {showRetailerDropdown && (
                                <div className="b2b-dropdown no-print">
                                    {retailers.filter(r => (r.name || '').toLowerCase().includes(header.buyerName.toLowerCase())).slice(0, 10).map(r => (
                                        <div key={r.id} className="b2b-dropdown-item"
                                            onMouseDown={() => {
                                                setHeader(prev => ({ ...prev, retailerId: r.id, buyerName: r.name || '', buyerContact: r.number || prev.buyerContact, buyerAddress: `${r.atPost || ''}, Tal. ${r.taluka || ''}, Dist. ${r.district || ''}`.trim(), buyerGstin: r.gstin || prev.buyerGstin }));
                                                applyRetailerBalance(r);
                                                setShowRetailerDropdown(false);
                                            }}>
                                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>{r.number} {r.atPost ? `• ${r.atPost}` : ''}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Contact */}
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Ph:</strong>
                        <input className="b2b-input no-print" style={{ fontSize: '0.57rem' }} placeholder="Phone" value={header.buyerContact} onChange={e => setHeader(h => ({ ...h, buyerContact: e.target.value }))} onBlur={handleBuyerPhoneBlur} />
                        <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.buyerContact}</span>
                    </div>
                    {/* Address */}
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Addr:</strong>
                        <input className="b2b-input no-print" style={{ fontSize: '0.57rem' }} placeholder="Address" value={header.buyerAddress} onChange={e => setHeader(h => ({ ...h, buyerAddress: e.target.value }))} />
                        <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.buyerAddress}</span>
                    </div>
                    {/* GSTIN */}
                    <div style={{ padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>GSTIN:</strong>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <input className="b2b-input no-print" style={{ fontSize: '0.57rem', textTransform: 'uppercase' }} placeholder="Buyer GSTIN" value={header.buyerGstin} onChange={e => setHeader(h => ({ ...h, buyerGstin: e.target.value.toUpperCase() }))} maxLength={15} />
                            <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, textTransform: 'uppercase' }}>{header.buyerGstin}</span>
                            {header.buyerGstin && (() => {
                                const result = validateGSTIN(header.buyerGstin);
                                return result.valid
                                    ? <div className="no-print" style={{ fontSize: '0.52rem', color: '#10b981' }}>✓ {result.state}</div>
                                    : <div className="no-print" style={{ fontSize: '0.52rem', color: '#ef4444' }}>⚠ {result.error}</div>;
                            })()}
                        </div>
                    </div>
                </div>

                {/* ══ BUYER ROW 2 — State / Terms / Salesman / Transporter ═ */}
                <div style={{ display: 'grid', gridTemplateColumns: '0.55fr 0.9fr 0.9fr 1.0fr 1.0fr', borderBottom: '1px solid #aaa', fontSize: '0.57rem' }}>
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>State:</strong>
                        <input className="b2b-input no-print" style={{ fontSize: '0.57rem' }} value={header.buyerState} onChange={e => setHeader(h => ({ ...h, buyerState: e.target.value }))} />
                        <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.buyerState}</span>
                    </div>
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Terms:</strong>
                        <input className="b2b-input no-print" style={{ fontSize: '0.57rem' }} placeholder="e.g. By Vehicle" value={header.termsOfDelivery} onChange={e => setHeader(h => ({ ...h, termsOfDelivery: e.target.value }))} />
                        <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.termsOfDelivery}</span>
                    </div>
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center', position: 'relative' }}>
                        <strong style={{ color: header.salesmanName ? '#666' : '#c62828', whiteSpace: 'nowrap', flexShrink: 0 }}>Salesperson*:</strong>
                        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                            <input className="b2b-input no-print" style={{ fontSize: '0.57rem', fontWeight: header.salesmanName ? 600 : 400 }}
                                placeholder="Search salesperson…"
                                value={header.salesmanName ? header.salesmanName : salesmanSearch}
                                onChange={e => {
                                    setSalesmanSearch(e.target.value);
                                    setHeader(h => ({ ...h, salesmanName: '', salesmanId: '' }));
                                    setShowSalesmanDropdown(true);
                                }}
                                onFocus={() => setShowSalesmanDropdown(true)}
                                onBlur={() => setTimeout(() => setShowSalesmanDropdown(false), 200)} />
                            <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.salesmanName}</span>
                            {showSalesmanDropdown && (
                                <div className="b2b-dropdown no-print" style={{ minWidth: '180px' }}>
                                    {salesUsers
                                        .filter(u => (u.name || '').toLowerCase().includes(salesmanSearch.toLowerCase()))
                                        .map(u => (
                                            <div key={u.id} className="b2b-dropdown-item"
                                                onMouseDown={() => {
                                                    setHeader(h => ({ ...h, salesmanName: u.name, salesmanId: u.id }));
                                                    setSalesmanSearch('');
                                                    setShowSalesmanDropdown(false);
                                                }}>
                                                <div style={{ fontWeight: 600 }}>{u.name}</div>
                                                {u.email && <div style={{ fontSize: '0.72rem', color: '#666' }}>{u.email}</div>}
                                            </div>
                                        ))}
                                    {salesUsers.filter(u => (u.name || '').toLowerCase().includes(salesmanSearch.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '6px 10px', fontSize: '0.82rem', color: '#999' }}>No sales users found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}><Truck size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> Trans:</strong>
                        <select className="b2b-input no-print" style={{ fontSize: '0.57rem' }} value={header.transporterId}
                            onChange={e => {
                                const t = transporters.find(x => x.id === e.target.value);
                                setHeader(h => ({ ...h, transporterId: e.target.value, transporterName: t?.name || '', transporterContact: t?.mobile || '' }));
                            }}>
                            <option value="">— Select —</option>
                            {transporters.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.transporterName || '—'}</span>
                    </div>
                    <div style={{ padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                        <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Trans. Ph:</strong>
                        <input className="b2b-input no-print" style={{ fontSize: '0.57rem' }} placeholder="Transporter mobile" value={header.transporterContact} onChange={e => setHeader(h => ({ ...h, transporterContact: e.target.value }))} />
                        <span className="print-val" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{header.transporterContact || '—'}</span>
                    </div>
                </div>

                {/* ══ ITEMS TABLE — identical columns to POS ══════════════ */}
                <table className="b2b-table" style={{ tableLayout: 'fixed' as const }}>
                    <colgroup>
                        {/* # */}      <col style={{ width: '2.5%' }} />
                        {/* Product */} <col />
                        {/* Company */} <col style={{ width: '9%' }} />
                        {/* Batch */}   <col style={{ width: '9.5%' }} />
                        {/* Exp */}     <col style={{ width: '8%' }} />
                        {/* Per */}     <col style={{ width: '4.5%' }} />
                        {/* Qty */}     <col style={{ width: '5%' }} />
                        {/* Rate */}    <col style={{ width: '10%' }} />
                        {/* GST% */}    <col style={{ width: '5%' }} />
                        {/* Amount */}  <col style={{ width: '12%' }} />
                        {/* Del */}     <col style={{ width: '2.5%' }} />
                    </colgroup>
                    <thead>
                        <tr style={{ background: '#f5f5f5', borderBottom: '1.5px solid #333' }}>
                            {([
                                ['#', 'center', '3px 1px'],
                                ['Product', 'left', '3px 5px'],
                                ['Company', 'center', '3px 2px'],
                                ['Batch No.', 'center', '3px 2px'],
                                ['Exp', 'center', '3px 1px'],
                                ['Per', 'center', '3px 1px'],
                                ['Qty', 'center', '3px 1px'],
                                ['Rate', 'right', '3px 3px'],
                                ['GST%', 'center', '3px 1px'],
                                ['Amount', 'right', '3px 3px'],
                            ] as const).map(([label, align, pad]) => (
                                <th key={label} style={{ border: '1px solid #ccc', padding: pad, textAlign: align as 'left' | 'center' | 'right', fontWeight: 700, fontSize: '0.74rem', overflow: 'hidden', whiteSpace: 'nowrap' as const }}>
                                    {label}
                                </th>
                            ))}
                            <th style={{ border: '1px solid #ccc' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                {/* # */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', textAlign: 'center' as const, fontSize: '0.72rem' }}>{idx + 1}</td>

                                {/* Product — POS-style search with keyboard nav */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px 3px', position: 'relative' }}>
                                    {(() => {
                                        const searchText = activeRowIndex === idx ? (rowSearch[idx] ?? row.itemDescription) : row.itemDescription;
                                        const filtered = products.filter(p =>
                                            (p.name || '').toLowerCase().includes((rowSearch[idx] || '').toLowerCase()) ||
                                            (p.barcode && p.barcode === rowSearch[idx])
                                        ).slice(0, 50);
                                        return (<>
                                            <input className="b2b-input no-print"
                                                style={{ fontWeight: row.productId ? 600 : 400, fontSize: '0.78rem' }}
                                                placeholder="Search product…"
                                                value={searchText}
                                                onChange={e => {
                                                    setRowSearch(s => ({ ...s, [idx]: e.target.value }));
                                                    setActiveRowIndex(e.target.value.length > 0 ? idx : null);
                                                    setHighlightedProductIdx(-1);
                                                    if (!e.target.value) handleRowChange(idx, 'itemDescription', '');
                                                }}
                                                onFocus={() => { setActiveRowIndex(idx); setHighlightedProductIdx(-1); }}
                                                onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                                onKeyDown={e => {
                                                    if (activeRowIndex !== idx) return;
                                                    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedProductIdx(i => Math.min(i + 1, filtered.length - 1)); }
                                                    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedProductIdx(i => Math.max(i - 1, -1)); }
                                                    else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const pick = highlightedProductIdx >= 0 ? filtered[highlightedProductIdx] : filtered.length === 1 ? filtered[0] : null;
                                                        if (pick) { handleRowChange(idx, 'productId', pick.id); setActiveRowIndex(null); }
                                                    }
                                                }} />
                                            <span className="print-val" style={{ fontWeight: 600, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{row.itemDescription}</span>
                                            {activeRowIndex === idx && filtered.length > 0 && (
                                                <div className="b2b-dropdown no-print">
                                                    {filtered.map((p, pi) => (
                                                        <div key={p.id} className="b2b-dropdown-item"
                                                            style={{ background: pi === highlightedProductIdx ? '#e8f5e9' : undefined }}
                                                            onMouseDown={() => { handleRowChange(idx, 'productId', p.id); setActiveRowIndex(null); }}>
                                                            {p.name} <span style={{ color: '#888' }}>· ₹{p.retailerPrice || p.maxRetailPrice || 0}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>);
                                    })()}
                                </td>

                                {/* Company — auto-filled, display only */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', fontSize: '0.72rem', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{row.mfgCompany}</td>

                                {/* Batch No. */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                    <input className="b2b-input no-print" style={{ textAlign: 'center', fontSize: '0.72rem' }} value={row.batchNo} onChange={e => handleRowChange(idx, 'batchNo', e.target.value)} />
                                    <span className="print-val" style={{ fontSize: '0.72rem' }}>{row.batchNo}</span>
                                </td>

                                {/* Exp — MM/YY text input, identical to POS */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                    <input type="text" className="b2b-input no-print" style={{ textAlign: 'center', fontSize: '0.70rem', width: '100%' }} placeholder="MM/YY"
                                        value={toMonthYear(row.expDate)}
                                        onChange={e => handleRowChange(idx, 'expDate', fromMonthYear(e.target.value))} />
                                    <span className="print-val" style={{ fontSize: '0.70rem', whiteSpace: 'nowrap' as const }}>{toMonthYear(row.expDate)}</span>
                                </td>

                                {/* Per */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', textAlign: 'center' as const, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                    <input className="b2b-input no-print" style={{ textAlign: 'center', fontSize: '0.72rem' }} value={row.per} onChange={e => handleRowChange(idx, 'per', e.target.value)} />
                                    <span className="print-val">{row.per}</span>
                                </td>

                                {/* Qty */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                    <input type="number" min="0" className="b2b-input no-print" style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.78rem' }} placeholder="0" value={row.quantity}
                                        onChange={e => handleRowChange(idx, 'quantity', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                                    <span className="print-val" style={{ fontWeight: 700 }}>{row.quantity}</span>
                                </td>

                                {/* Rate */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                    <input type="number" min="0" className="b2b-input no-print" style={{ textAlign: 'right', paddingRight: '3px', fontSize: '0.78rem' }} value={row.rate}
                                        onChange={e => handleRowChange(idx, 'rate', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                                    <span className="print-val" style={{ textAlign: 'right' as const }}>{row.rate}</span>
                                </td>

                                {/* GST% */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                    <input type="number" className="b2b-input no-print" style={{ textAlign: 'center', fontSize: '0.72rem' }} value={row.gstPct}
                                        onChange={e => handleRowChange(idx, 'gstPct', e.target.value)} onWheel={e => e.currentTarget.blur()} />
                                    <span className="print-val">{row.gstPct}%</span>
                                </td>

                                {/* Amount */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '3px 4px', textAlign: 'right' as const, fontWeight: 700, fontSize: '0.78rem' }}>{row.grossAmount ? fmt(row.grossAmount) : ''}</td>

                                {/* Delete */}
                                <td style={{ border: '1px solid #e8e8e8', padding: '1px', textAlign: 'center' as const }}>
                                    <button onClick={() => removeRow(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e53935', padding: '2px' }}>
                                        <Trash2 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        <tr style={{ background: '#f5f5f5', borderTop: '1.5px solid #333' }}>
                            <td colSpan={9} style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right' as const, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.04em', fontSize: '0.78rem' }}>Total</td>
                            <td style={{ border: '1px solid #ccc', padding: '4px 4px', textAlign: 'right' as const, fontWeight: 900, fontSize: '0.88rem' }}>{fmt(totalGross)}</td>
                            <td style={{ border: '1px solid #ccc' }}></td>
                        </tr>
                    </tbody>
                </table>

                {/* Add Row button — no-print */}
                <div className="no-print" style={{ padding: '4px 6px', borderTop: '1px solid #eee', borderBottom: '1.5px solid #333' }}>
                    <button onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px dashed #999', borderRadius: '6px', padding: '2px 10px', cursor: 'pointer', fontSize: '0.78rem', color: '#555' }}>
                        <Plus size={13} /> Add Row
                    </button>
                </div>

                {/* ══ FOOTER ══════════════════════════════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr 1.0fr', borderTop: '1.5px solid #333' }}>

                    {/* Col 1: GST Summary + Declaration + Bank Details */}
                    <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ background: '#f5f5f5', padding: '1.5px 5px', borderBottom: '1px solid #ccc', fontSize: '0.52rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>GST Summary</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.52rem' }}>
                            <thead>
                                <tr>
                                    {['Taxable', 'CGST 2.5%', 'SGST 2.5%', 'Total Tax'].map(h => (
                                        <th key={h} style={{ border: '1px solid #ddd', padding: '1.5px 2px', textAlign: 'center' as const, background: '#fafafa', fontWeight: 700 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    {[computedTaxable, totalCgst, totalSgst, totalTax].map((v, vi) => (
                                        <td key={vi} style={{ border: '1px solid #ddd', padding: '1.5px 2px', textAlign: 'center' as const }}>{fmt(v)}</td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                        <div style={{ padding: '3px 5px', fontSize: '0.46rem', color: '#555', lineHeight: 1.35, flex: 1 }}>
                            <strong>Declaration:</strong> We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                        </div>
                        {branding?.bankDetails && (
                            <div style={{ borderTop: '1px solid #ddd', padding: '2px 5px', fontSize: '0.44rem', color: '#333', lineHeight: 1.4 }}>
                                <strong>Bank / NEFT:</strong> {branding.bankDetails}
                            </div>
                        )}
                    </div>

                    {/* Col 2: Net Amount + Balance + Amount in Words */}
                    <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '3px 6px', flex: 1, fontSize: '0.56rem', display: 'flex', flexDirection: 'column', gap: '1.5px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#2E7D32' }}>
                                <span>Discount (-)</span>
                                <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                    <input type="number" className="b2b-input no-print" style={{ width: '55px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '3px', padding: '1px 3px', fontSize: '0.52rem' }} value={discount} onChange={e => setDiscount(e.target.value)} />
                                    <span className="print-val">{discountAmt > 0 ? `-${fmt(discountAmt)}` : '—'}</span>
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Round Off</span><span>{fmt(roundOff)}</span>
                            </div>
                            <div style={{ borderTop: '1.5px solid #333', paddingTop: '1.5px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.70rem' }}>
                                <span>NET AMOUNT</span><span>₹{netAmount.toLocaleString('en-IN')}</span>
                            </div>
                            <div style={{ borderTop: '1px solid #ddd', marginTop: '2px', paddingTop: '2px', fontSize: '0.52rem', display: 'flex', flexDirection: 'column', gap: '1.5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#c62828' }}>
                                    <span>Previous Balance (Dr)</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <input type="number" className="b2b-input no-print" style={{ width: '55px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '3px', padding: '1px 3px', fontSize: '0.52rem' }} value={previousBalance} placeholder="0.00" onChange={e => setPreviousBalance(e.target.value)} />
                                        <span className="print-val">{previousBalance || '0.00'}</span>
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Current Invoice</span>
                                    <span style={{ fontWeight: 600 }}>₹{netAmount.toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ borderTop: '1px solid #ccc', paddingTop: '1.5px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.56rem' }}>
                                    <span>Net Balance (Dr)</span><span>₹{netBalance.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid #ddd', padding: '2px 6px', fontSize: '0.48rem', lineHeight: 1.3 }}>
                            <strong>Amount in Words:</strong> <span style={{ fontStyle: 'italic' }}>INR {numberToWords(netAmount)}</span>
                        </div>
                        <div style={{ borderTop: '1px solid #ddd', padding: '2px 6px', fontSize: '0.44rem', textAlign: 'center' as const, fontWeight: 700, letterSpacing: '0.05em' }}>
                            SUBJECT TO PUNE JURISDICTION
                        </div>
                    </div>

                    {/* Col 3: Signatures + UPI QR */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'row' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '3px 8px', alignItems: 'center' }}>
                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', fontSize: '0.50rem', fontWeight: 700, textAlign: 'center' as const, width: '100%' }}>Customer Signature</div>
                            </div>
                            <div style={{ flex: 1, borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '3px 8px', alignItems: 'center' }}>
                                {branding?.signatureUrl && (
                                    <img src={branding.signatureUrl} alt="" style={{ height: '30px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
                                )}
                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', fontSize: '0.50rem', fontWeight: 700, textAlign: 'center' as const, width: '100%' }}>{branding?.signatureName || 'Authorized Signatory'}</div>
                            </div>
                        </div>
                        {branding?.upiId && (
                            <div style={{ borderTop: '1px solid #ddd', textAlign: 'center' as const, padding: '2px 5px' }}>
                                <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={netAmount} transactionNote={displayInvoiceNo} size={38} />
                                <div style={{ fontSize: '6px' }}>Scan to Pay</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            ) : (
            <div style={{ width: cardWidthPx, minHeight: cardMinHeightPx, maxWidth: '100%', margin: '0 auto', background: '#fff', color: '#000', fontFamily: "'Times New Roman', serif", boxShadow: '0 10px 40px rgba(0,0,0,0.1)', borderRadius: '10px', border: '1px solid #ddd', padding: '18px 22px' }} className="b2b-card b2b-a4">

                {/* ── TITLE + BUSINESS HEADER ── */}
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.15em', marginBottom: '2px' }}>GST INVOICE</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '44px', objectFit: 'contain' }} />}
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{sellerName}</h1>
                            <div style={{ fontSize: '0.78rem', color: '#444', marginTop: '2px' }}>
                                {branding?.address || tenantData?.location || 'Address'}<br />
                                {branding?.gstin && <><strong>GSTIN:</strong> {branding.gstin} &nbsp;</>}
                                <strong>Contact:</strong> {INVOICE_CONTACT_LABEL} &nbsp;
                                {branding?.contact && <>Contact No.: {branding.contact}</>}
                                {branding?.email && <>&nbsp; Email: {branding.email}</>}
                            </div>
                            {allLicenses.length > 0 && (
                                <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {allLicenses.map(lic => <span key={lic.label}><strong>{lic.label}:</strong> {lic.number}</span>)}
                                </div>
                            )}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: '#111', border: '2px solid #111', padding: '4px 12px', borderRadius: '6px' }}>
                        {header.modeOfPayment === 'Cash' ? 'CASH BILL' : 'CREDIT BILL'}
                    </div>
                </div>

                {/* ── GSTIN BANNER ── */}
                {branding?.gstin && (
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', marginBottom: '10px', letterSpacing: '0.05em' }}>
                        GSTIN NO: {branding.gstin}
                    </div>
                )}

                {/* ── BUYER + INVOICE META ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: '10px', border: '1px solid #222' }}>
                    {/* Buyer box */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                        <div className="b2b-label" style={{ marginBottom: '4px' }}>Details for Buyer (Billed &amp; Shipped To)</div>
                        {/* Buyer name — retailer autocomplete (current handler) */}
                        <div style={{ position: 'relative' }}>
                            <input className="b2b-input no-print" style={{ fontWeight: 700, fontSize: '0.88rem' }} placeholder="Buyer / Retailer Name"
                                value={header.buyerName}
                                onChange={e => { setHeader(h => ({ ...h, buyerName: e.target.value, retailerId: '' })); setShowRetailerDropdown(e.target.value.length > 0); }}
                                onFocus={() => header.buyerName.length > 0 && setShowRetailerDropdown(true)}
                                onBlur={() => setTimeout(() => setShowRetailerDropdown(false), 200)} />
                            <span className="print-val" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{header.buyerName}</span>
                            {showRetailerDropdown && (
                                <div className="b2b-dropdown no-print" style={{ width: '100%' }}>
                                    {retailers.filter(r => (r.name || '').toLowerCase().includes(header.buyerName.toLowerCase())).slice(0, 10).map(r => (
                                        <div key={r.id} className="b2b-dropdown-item"
                                            onMouseDown={() => {
                                                setHeader(prev => ({ ...prev, retailerId: r.id, buyerName: r.name || '', buyerContact: r.number || prev.buyerContact, buyerAddress: `${r.atPost || ''}, Tal. ${r.taluka || ''}, Dist. ${r.district || ''}`.trim(), buyerGstin: r.gstin || prev.buyerGstin }));
                                                applyRetailerBalance(r);
                                                setShowRetailerDropdown(false);
                                            }}>
                                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>{r.number} {r.atPost ? `• ${r.atPost}` : ''}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Address */}
                        <div style={{ position: 'relative' }}>
                            <textarea className="b2b-input no-print" style={{ display: 'block', marginTop: '3px', resize: 'none', minHeight: '40px' }} placeholder="Address" value={header.buyerAddress} onChange={e => setHeader(h => ({ ...h, buyerAddress: e.target.value }))} />
                            <span className="print-val" style={{ whiteSpace: 'pre-wrap', marginTop: '3px', fontSize: '0.82rem' }}>{header.buyerAddress}</span>
                        </div>
                        {/* GSTIN + validation (current) */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                            <span className="b2b-label">GST No.:</span>
                            <div style={{ flexGrow: 1, minWidth: '120px' }}>
                                <input className="b2b-input no-print" style={{ width: '100%', textTransform: 'uppercase' }} placeholder="Buyer GSTIN" value={header.buyerGstin} onChange={e => setHeader(h => ({ ...h, buyerGstin: e.target.value.toUpperCase() }))} maxLength={15} />
                                <span className="print-val" style={{ textTransform: 'uppercase' }}>{header.buyerGstin}</span>
                                {header.buyerGstin && (() => {
                                    const result = validateGSTIN(header.buyerGstin);
                                    return result.valid
                                        ? <div className="no-print" style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>✓ {result.state}</div>
                                        : <div className="no-print" style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '2px' }}>⚠ {result.error}</div>;
                                })()}
                            </div>
                        </div>
                        {/* Contact — phone blur lookup (current) */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                            <span className="b2b-label">Contact No.:</span>
                            <input className="b2b-input no-print" style={{ flexGrow: 1 }} placeholder="Phone No" value={header.buyerContact} onChange={e => setHeader(h => ({ ...h, buyerContact: e.target.value }))} onBlur={handleBuyerPhoneBlur} />
                            <span className="print-val">{header.buyerContact}</span>
                        </div>
                        {/* State */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                            <span className="b2b-label">State :</span>
                            <input className="b2b-input no-print" style={{ flexGrow: 1 }} value={header.buyerState} onChange={e => setHeader(h => ({ ...h, buyerState: e.target.value }))} />
                            <span className="print-val">{header.buyerState}</span>
                        </div>
                    </div>

                    {/* Invoice meta */}
                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Invoice No :</span>
                            <span style={{ fontWeight: 700 }}>{displayInvoiceNo}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Invoice Date :</span>
                            <input type="date" className="b2b-input no-print" value={header.invoiceDate} onChange={e => setHeader(h => ({ ...h, invoiceDate: e.target.value }))} />
                            <span className="print-val" style={{ gridColumn: 2 }}>{header.invoiceDate}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Terms of Delivery :</span>
                            <input className="b2b-input no-print" placeholder="e.g. By Vehicle" value={header.termsOfDelivery} onChange={e => setHeader(h => ({ ...h, termsOfDelivery: e.target.value }))} />
                            <span className="print-val" style={{ gridColumn: 2 }}>{header.termsOfDelivery}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Truck size={11} /> Transporter :</span>
                            <select className="b2b-input no-print" value={header.transporterId}
                                onChange={e => { const t = transporters.find(x => x.id === e.target.value); setHeader(h => ({ ...h, transporterId: e.target.value, transporterName: t?.name || '', transporterContact: t?.mobile || '' })); }}>
                                <option value="">— Select Transporter —</option>
                                {transporters.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <span className="print-val" style={{ gridColumn: 2 }}>{header.transporterName || '—'}</span>
                        </div>
                        {header.transporterId && (
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                                <span className="b2b-label">Transporter Ph :</span>
                                <input className="b2b-input no-print" placeholder="Transporter mobile" value={header.transporterContact} onChange={e => setHeader(h => ({ ...h, transporterContact: e.target.value }))} />
                                <span className="print-val" style={{ gridColumn: 2 }}>{header.transporterContact}</span>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Mode of Payment :</span>
                            <select className="b2b-input no-print" value={header.modeOfPayment} onChange={e => setHeader(h => ({ ...h, modeOfPayment: e.target.value }))}>
                                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <span className="print-val" style={{ gridColumn: 2 }}>{header.modeOfPayment}</span>
                        </div>
                        {/* Salesperson — CURRENT searchable dropdown + mandatory validation */}
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label" style={{ color: header.salesmanName ? undefined : '#c62828' }}>Salesman Name* :</span>
                            <div style={{ position: 'relative' }}>
                                <input className="b2b-input no-print" style={{ fontWeight: header.salesmanName ? 600 : 400 }} placeholder="Search salesperson…"
                                    value={header.salesmanName ? header.salesmanName : salesmanSearch}
                                    onChange={e => { setSalesmanSearch(e.target.value); setHeader(h => ({ ...h, salesmanName: '', salesmanId: '' })); setShowSalesmanDropdown(true); }}
                                    onFocus={() => setShowSalesmanDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowSalesmanDropdown(false), 200)} />
                                <span className="print-val">{header.salesmanName}</span>
                                {showSalesmanDropdown && (
                                    <div className="b2b-dropdown no-print" style={{ minWidth: '180px' }}>
                                        {salesUsers.filter(u => (u.name || '').toLowerCase().includes(salesmanSearch.toLowerCase())).map(u => (
                                            <div key={u.id} className="b2b-dropdown-item"
                                                onMouseDown={() => { setHeader(h => ({ ...h, salesmanName: u.name, salesmanId: u.id })); setSalesmanSearch(''); setShowSalesmanDropdown(false); }}>
                                                <div style={{ fontWeight: 600 }}>{u.name}</div>
                                                {u.email && <div style={{ fontSize: '0.72rem', color: '#666' }}>{u.email}</div>}
                                            </div>
                                        ))}
                                        {salesUsers.filter(u => (u.name || '').toLowerCase().includes(salesmanSearch.toLowerCase())).length === 0 && (
                                            <div style={{ padding: '6px 10px', fontSize: '0.82rem', color: '#999' }}>No sales users found</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── ITEMS TABLE — CURRENT columns + logic, old visual styling ── */}
                <div style={{ marginBottom: '10px', overflowX: 'auto' }}>
                    <table className="b2b-table">
                        <thead>
                            <tr>
                                <th style={{ width: '30px' }}>S.No</th>
                                <th style={{ minWidth: '150px' }}>Item Descriptions</th>
                                <th style={{ width: '90px' }}>Company</th>
                                <th style={{ width: '80px' }}>Batch No.</th>
                                <th style={{ width: '72px' }}>Exp. Date</th>
                                <th style={{ width: '48px' }}>Per</th>
                                <th style={{ width: '48px' }}>GST %</th>
                                <th style={{ width: '56px' }}>Qty</th>
                                <th style={{ width: '70px' }}>Rate</th>
                                <th style={{ width: '88px' }}>Gross Amount</th>
                                <th className="no-print" style={{ width: '32px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{idx + 1}</td>
                                    {/* Item Description — CURRENT product search with keyboard nav */}
                                    <td style={{ position: 'relative' }}>
                                        {(() => {
                                            const searchText = activeRowIndex === idx ? (rowSearch[idx] ?? row.itemDescription) : row.itemDescription;
                                            const filtered = products.filter(p => (p.name || '').toLowerCase().includes((rowSearch[idx] || '').toLowerCase()) || (p.barcode && p.barcode === rowSearch[idx])).slice(0, 50);
                                            return (<>
                                                <input className="b2b-input no-print" style={{ fontWeight: row.productId ? 600 : 400 }} placeholder="Search product…" value={searchText}
                                                    onChange={e => { setRowSearch(s => ({ ...s, [idx]: e.target.value })); setActiveRowIndex(e.target.value.length > 0 ? idx : null); setHighlightedProductIdx(-1); if (!e.target.value) handleRowChange(idx, 'itemDescription', ''); }}
                                                    onFocus={() => { setActiveRowIndex(idx); setHighlightedProductIdx(-1); }}
                                                    onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                                    onKeyDown={e => {
                                                        if (activeRowIndex !== idx) return;
                                                        if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedProductIdx(i => Math.min(i + 1, filtered.length - 1)); }
                                                        else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedProductIdx(i => Math.max(i - 1, -1)); }
                                                        else if (e.key === 'Enter') { e.preventDefault(); const pick = highlightedProductIdx >= 0 ? filtered[highlightedProductIdx] : filtered.length === 1 ? filtered[0] : null; if (pick) { handleRowChange(idx, 'productId', pick.id); setActiveRowIndex(null); } }
                                                    }} />
                                                <span className="print-val">{row.itemDescription}</span>
                                                {activeRowIndex === idx && filtered.length > 0 && (
                                                    <div className="b2b-dropdown no-print">
                                                        {filtered.map((p, pi) => (
                                                            <div key={p.id} className="b2b-dropdown-item" style={{ background: pi === highlightedProductIdx ? '#e8f5e9' : undefined }}
                                                                onMouseDown={() => { handleRowChange(idx, 'productId', p.id); setActiveRowIndex(null); }}>
                                                                {p.name} <span style={{ color: '#888' }}>· ₹{p.retailerPrice || p.maxRetailPrice || 0}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>);
                                        })()}
                                    </td>
                                    {/* Company — auto-filled, display only */}
                                    <td style={{ textAlign: 'center' }}>{row.mfgCompany}</td>
                                    {/* Batch No. */}
                                    <td><input className="b2b-input no-print" style={{ textAlign: 'center' }} value={row.batchNo} onChange={e => handleRowChange(idx, 'batchNo', e.target.value)} /><span className="print-val">{row.batchNo}</span></td>
                                    {/* Exp — MM/YY text input (current) */}
                                    <td><input type="text" className="b2b-input no-print" style={{ textAlign: 'center' }} placeholder="MM/YY" value={toMonthYear(row.expDate)} onChange={e => handleRowChange(idx, 'expDate', fromMonthYear(e.target.value))} /><span className="print-val">{toMonthYear(row.expDate)}</span></td>
                                    {/* Per */}
                                    <td style={{ textAlign: 'center' }}><input className="b2b-input no-print" style={{ textAlign: 'center' }} value={row.per} onChange={e => handleRowChange(idx, 'per', e.target.value)} /><span className="print-val">{row.per}</span></td>
                                    {/* GST% */}
                                    <td style={{ textAlign: 'center' }}><input type="number" className="b2b-input no-print" style={{ textAlign: 'center' }} value={row.gstPct} onChange={e => handleRowChange(idx, 'gstPct', e.target.value)} onWheel={e => e.currentTarget.blur()} /><span className="print-val">{row.gstPct}</span></td>
                                    {/* Qty */}
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}><input type="number" min="0" className="b2b-input no-print" style={{ textAlign: 'center', fontWeight: 600 }} placeholder="0" value={row.quantity} onChange={e => handleRowChange(idx, 'quantity', e.target.value)} onWheel={e => e.currentTarget.blur()} /><span className="print-val">{row.quantity}</span></td>
                                    {/* Rate */}
                                    <td style={{ textAlign: 'center' }}><input type="number" min="0" className="b2b-input no-print" style={{ textAlign: 'center' }} value={row.rate} onChange={e => handleRowChange(idx, 'rate', e.target.value)} onWheel={e => e.currentTarget.blur()} /><span className="print-val">{row.rate}</span></td>
                                    {/* Gross Amount */}
                                    <td style={{ textAlign: 'center', fontWeight: row.grossAmount ? 600 : 400 }}>{row.grossAmount ? fmt(row.grossAmount) : ''}</td>
                                    {/* Delete */}
                                    <td className="no-print" style={{ textAlign: 'center', padding: '2px' }}>
                                        <button onClick={() => removeRow(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e53935', padding: '2px' }}><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                            {/* TOTAL row */}
                            <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                                <td colSpan={9} style={{ textAlign: 'right', paddingRight: '8px' }}>TOTAL</td>
                                <td style={{ textAlign: 'center' }}>{fmt(totalGross)}</td>
                                <td className="no-print"></td>
                            </tr>
                        </tbody>
                    </table>
                    <button className="no-print" onClick={addRow} style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px dashed #999', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '0.82rem', color: '#555' }}>
                        <Plus size={14} /> Add Row
                    </button>
                </div>

                {/* ── GST SUMMARY + NET AMOUNT ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: '10px', border: '1px solid #222' }}>
                    {/* GST breakdown */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr>
                                    {['Taxable Value', 'Central Tax Rate', 'Amount', 'State Tax Rate', 'Amount', 'Total Tax Amount'].map(h => (
                                        <th key={h} style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{fmt(computedTaxable)}</td>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{cgstPct}%</td>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{fmt(totalCgst)}</td>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{sgstPct}%</td>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{fmt(totalSgst)}</td>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{fmt(totalTax)}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', fontWeight: 700 }}>Total: {fmt(taxableValue)}</td>
                                    <td colSpan={4}></td>
                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', fontWeight: 700, textAlign: 'center' }}>{fmt(totalTax)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    {/* Net amount */}
                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Output CGST@{cgstPct}%</span><span>{fmt(totalCgst)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Output SGST@{sgstPct}%</span><span>{fmt(totalSgst)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Round Off</span><span>{fmt(roundOff)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Discount (-)</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="number" className="b2b-input no-print" style={{ width: '70px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '3px', padding: '1px 4px' }} value={discount} onChange={e => setDiscount(e.target.value)} />
                                <span className="print-val">{discountAmt > 0 ? fmt(discountAmt) : '0.00'}</span>
                            </span>
                        </div>
                        <div style={{ borderTop: '2px solid #111', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
                            <span>NET AMOUNT</span><span>₹{netAmount.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>

                {/* ── AMOUNT IN WORDS ── */}
                <div style={{ border: '1px solid #222', marginBottom: '10px', display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'stretch' }}>
                    <div style={{ borderRight: '1px solid #222', padding: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', fontSize: '0.82rem' }}>Amount in Words</div>
                    <div style={{ padding: '6px', fontWeight: 600, fontSize: '0.85rem', fontStyle: 'italic' }}>INR {numberToWords(netAmount)}</div>
                </div>

                {/* ── ACCOUNT STATEMENT + BANK DETAILS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: '10px', border: '1px solid #222' }}>
                    {/* Account statement / balance */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px', fontSize: '0.82rem' }}>
                        <div className="b2b-label" style={{ marginBottom: '6px' }}>Account Statement</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span title="Pulled from the partner's outstanding dues; edit if needed">Previous Balance</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="number" className="b2b-input no-print" style={{ width: '80px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '3px', padding: '1px 4px' }} value={previousBalance} placeholder="0.00" onChange={e => setPreviousBalance(e.target.value)} />
                                <span className="print-val">{previousBalance || '0.00'}</span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Dr</span>
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span>Current Invoice</span><span style={{ fontWeight: 600 }}>₹{netAmount.toLocaleString('en-IN')} Dr</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc', paddingTop: '3px', fontWeight: 700 }}>
                            <span>Net Balance</span><span>₹{netBalance.toLocaleString('en-IN')} Dr</span>
                        </div>
                    </div>
                    {/* Bank details + UPI QR */}
                    <div style={{ padding: '8px', fontSize: '0.8rem' }}>
                        <div className="b2b-label" style={{ marginBottom: '4px' }}>Company's Bank Details for NEFT / RTGS :</div>
                        <div style={{ whiteSpace: 'pre-line', color: '#333', marginBottom: '8px', lineHeight: 1.6 }}>{branding?.bankDetails || DEFAULT_BANK_DETAILS || '—'}</div>
                        {branding?.upiId && (
                            <div style={{ marginTop: '8px', borderTop: '1px solid #ccc', paddingTop: '6px' }}>
                                <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={netAmount} transactionNote={displayInvoiceNo} size={80} />
                                <div style={{ fontSize: '0.7rem', color: '#666' }}>Scan to Pay</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── REMARK ── */}
                <div style={{ border: '1px solid #222', padding: '5px 8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>REMARK :</strong>
                    <input className="b2b-input no-print" style={{ flexGrow: 1 }} placeholder="Any remarks here..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                    <span className="print-val" style={{ flexGrow: 1 }}>{remarks}</span>
                </div>

                {/* ── DECLARATION + AUTHORISED SIGNATURE ── */}
                <div style={{ border: '1px solid #222', borderTop: 'none', marginBottom: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <div style={{ borderRight: '1px solid #222', padding: '8px', fontSize: '0.75rem' }}>
                        <div className="b2b-label" style={{ marginBottom: '3px' }}>Declaration :</div>
                        <div style={{ color: '#444', lineHeight: 1.5 }}>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
                        <div style={{ marginTop: '18px', borderTop: '1px solid #555', paddingTop: '3px', width: '150px', textAlign: 'center', fontSize: '0.72rem' }}>Customer Signature</div>
                    </div>
                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700 }}>For {sellerName}</div>
                        {branding?.signatureUrl && <img src={branding.signatureUrl} alt="" style={{ height: '46px', maxWidth: '160px', objectFit: 'contain', marginTop: '4px' }} />}
                        <div style={{ borderTop: '1px solid #555', paddingTop: '4px', minWidth: '140px', textAlign: 'center', marginTop: branding?.signatureUrl ? '4px' : '28px' }}>{branding?.signatureName || 'Authorised Signatory'}</div>
                    </div>
                </div>

                {/* ── JURISDICTION ── */}
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.06em', marginBottom: '4px' }}>SUBJECT TO PUNE JURISDICTION</div>
            </div>
            )}

            {/* ── ACTION BUTTONS ── */}
            {(() => {
                const missingFields = [
                    !header.salesmanName && 'Salesperson',
                    activeRows.length === 0 && 'at least one item',
                ].filter(Boolean);
                const isDisabled = isProcessing || missingFields.length > 0 || isLocked;
                return (
                    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', maxWidth: '1050px', marginLeft: 'auto', marginRight: 'auto' }}>
                        {isLocked && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '10px', fontSize: '0.88rem', color: '#f59e0b', fontWeight: 600, width: '100%', maxWidth: '600px' }}>
                                <Lock size={16} />
                                <span style={{ flex: 1 }}>This invoice is locked for editing. Status must be Delivered, or unlock manually.</span>
                                <button onClick={handleUnlock}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.5)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit' }}>
                                    <LockOpen size={14} /> Unlock Invoice
                                </button>
                            </div>
                        )}
                        {existingOrder?.manuallyUnlocked && existingOrder?.status !== 'delivered' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>
                                <LockOpen size={14} /> Invoice manually unlocked — editing allowed
                            </div>
                        )}
                        {missingFields.length > 0 && (
                            <div style={{ fontSize: '0.82rem', color: '#c62828', fontWeight: 600 }}>
                                Required: {missingFields.join(', ')}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => handleSave(true)} disabled={isDisabled}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', background: isDisabled ? '#9cb8e0' : '#1565C0', color: '#fff', border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />} Save & Print
                            </button>
                            <button onClick={handlePrintOnly} disabled={isProcessing} title="Print the current invoice without saving"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', background: 'transparent', color: '#1565C0', border: '2px solid #1565C0', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                                <Printer size={18} /> Print Invoice
                            </button>
                            <button onClick={() => handleSave(false)} disabled={isDisabled}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', background: isDisabled ? '#7fb57f' : '#2E7D32', color: '#fff', border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Save Invoice
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
