import { useState, useEffect } from 'react';
import { Save, Loader2, Printer, Plus, Trash2, UserPlus, ArrowLeft } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import UpiQrCode from '../components/UpiQrCode';
import {
    addDoc, getDoc, getDocs, runTransaction, serverTimestamp, updateDoc,
    query, where, limit, onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { validateGSTIN } from '../utils/gstinValidator';

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
}

interface B2BRow {
    productId: string;
    itemDescription: string;
    batchNo: string;
    expDate: string;
    gstPct: string;
    midOff: string;
    per: string;
    boxes: string;
    boxQty: string;
    quantity: string;
    rate: string;
    grossAmount: number;
}

const PAYMENT_MODES = ['Cash', '15 Days', '30 Days', '45 Days', 'Credit'];

const DEFAULT_BANK_DETAILS = '';
const EMPTY_ROW = (): B2BRow => ({
    productId: '',
    itemDescription: '',
    batchNo: '',
    expDate: '',
    gstPct: '5',
    midOff: 'Nos',
    per: 'Nos',
    boxes: '',
    boxQty: '',
    quantity: '',
    rate: '',
    grossAmount: 0,
});

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
    const { tenantId, tenantData } = useAuth();
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

    const today = new Date().toISOString().split('T')[0];

    const [header, setHeader] = useState({
        invoiceNo: '',
        invoiceDate: today,
        termsOfDelivery: '',
        modeOfPayment: '15 Days',
        salesmanName: '',
        buyerName: '',
        buyerAddress: '',
        buyerGstin: '',
        buyerContact: '',
        buyerState: 'Maharashtra',
        retailerId: '',
    });

    const [rows, setRows] = useState<B2BRow[]>(
        Array.from({ length: 10 }, EMPTY_ROW)
    );

    const [previousBalance, setPreviousBalance] = useState('');
    const [discount, setDiscount] = useState('0');

    // ─── Load branding, products, next invoice number ───
    useEffect(() => {
        if (!tenantId) return;

        const qProducts = query(getTenantCollection(db, tenantId, 'products'));
        const unsubProducts = onSnapshot(qProducts, snap => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
        });

        const qRetailers = query(getTenantCollection(db, tenantId, 'retailers'));
        const unsubRetailers = onSnapshot(qRetailers, snap => {
            setRetailers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const init = async () => {
            try {
                const [brd] = await Promise.all([fetchInvoiceBranding(tenantId)]);
                setBranding(brd);

                const counterRef = getTenantDoc(db, tenantId, 'counters', 'b2bInvoiceCounter');
                const counterSnap = await getDoc(counterRef);
                const seq = counterSnap.exists() ? (counterSnap.data().lastInvoiceNumber || 0) + 1 : 1;
                setNextInvoiceNo(`SIPL/${new Date().getFullYear().toString().slice(-2)}-${(new Date().getFullYear() + 1).toString().slice(-2)}/${seq.toString().padStart(3, '0')}`);
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
                termsOfDelivery: d.termsOfDelivery || prev.termsOfDelivery,
                buyerName: d.retailerName || d.buyerName || prev.buyerName,
                buyerAddress: d.buyerAddress || prev.buyerAddress,
                buyerGstin: d.buyerGstin || prev.buyerGstin,
                buyerContact: d.buyerContact || prev.buyerContact,
                buyerState: d.buyerState || prev.buyerState,
                retailerId: d.retailerId || prev.retailerId,
            }));
            // Restore discount / previous balance
            if (d.discountAmount !== undefined) setDiscount(String(d.discountAmount));
            if (d.previousBalance !== undefined) setPreviousBalance(String(d.previousBalance));
            // Restore line items — pad to at least 10 rows
            if (d.lineItems && d.lineItems.length > 0) {
                const restored: B2BRow[] = d.lineItems.map((li: any) => ({
                    productId: li.productId || '',
                    itemDescription: li.itemDescription || '',
                    batchNo: li.batchNo || '',
                    expDate: li.expDate || '',
                    gstPct: String(li.gstPct ?? '5'),
                    midOff: li.midOff || 'Nos',
                    per: li.per || 'Nos',
                    boxes: li.boxes !== undefined && li.boxes !== null && li.boxes !== 0 ? String(li.boxes) : '',
                    boxQty: li.boxQty !== undefined && li.boxQty !== null && li.boxQty !== 0 ? String(li.boxQty) : '',
                    quantity: String(li.quantity ?? ''),
                    rate: String(li.rate ?? ''),
                    grossAmount: li.grossAmount || 0,
                }));
                // Pad with empty rows to fill grid
                while (restored.length < 10) restored.push(EMPTY_ROW());
                setRows(restored);
            }
        }).catch(e => console.error('Failed to load existing order:', e));
    }, [prefilledOrderId, tenantId]);

    // ─── Auto-fill buyer by phone ───
    const handleBuyerPhoneBlur = async () => {
        if (!tenantId || !header.buyerContact || header.buyerContact.length < 5) return;
        try {
            const q = query(getTenantCollection(db, tenantId, 'retailers'), where('number', '==', header.buyerContact), limit(1));
            const snaps = await getDocs(q);
            if (!snaps.empty) {
                const d = snaps.docs[0].data();
                setHeader(prev => ({
                    ...prev,
                    retailerId: snaps.docs[0].id,
                    buyerName: d.name || prev.buyerName,
                    buyerAddress: `${d.atPost || ''}, Tal. ${d.taluka || ''}, Dist. ${d.district || ''}`.trim(),
                    buyerGstin: d.gstin || prev.buyerGstin,
                }));
            }
        } catch (e) { console.error(e); }
    };

    // ─── Row calculations ───
    const handleRowChange = (idx: number, field: keyof B2BRow, value: string) => {
        const newRows = [...rows];
        if (field === 'productId') {
            const p = products.find(pr => pr.id === value);
            if (p) {
                newRows[idx].productId = p.id;
                newRows[idx].itemDescription = p.name;
                newRows[idx].rate = (p.retailerPrice || p.maxRetailPrice || 0).toString();
                newRows[idx].gstPct = (p.gstPct || 5).toString();
                newRows[idx].per = p.baseUnit || 'Nos';
                newRows[idx].midOff = p.baseUnit || 'Nos';
            }
        } else if (field === 'itemDescription') {
            newRows[idx].productId = '';
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
    const discountAmt = parseFloat(discount) || 0;
    const roundOff = Math.round(computedTaxable + totalTax - discountAmt) - (computedTaxable + totalTax - discountAmt);
    const netAmount = Math.round(computedTaxable + totalTax - discountAmt);
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
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; }
  html, body { background: #fff !important; color: #000 !important; margin: 0; padding: 0; }
  .b2b-wrapper { background: #fff !important; padding: 0 !important; }
  .no-print { display: none !important; }
  .b2b-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; padding: 10px !important; background: #fff !important; color: #000 !important; }
  input, select, textarea { display: none !important; }
  .print-val { display: inline !important; font-family: 'Times New Roman', serif; color: #000; }
  .b2b-table { border-collapse: collapse; width: 100%; }
  .b2b-table th, .b2b-table td { border: 1px solid #222 !important; padding: 2px 3px !important; font-size: 0.78rem !important; }
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

    const handleSave = async (isPrint = false) => {
        if (!tenantId) return;
        if (activeRows.length === 0) { alert('Please add at least one item.'); return; }
        setIsProcessing(true);
        try {
            // Editing keeps the original invoice number; only a brand-new invoice consumes the counter.
            const invNo = isEditing ? existingOrder.orderNumber : await generateInvoiceNumber();
            const lineItems = activeRows.map(r => ({
                itemDescription: r.itemDescription,
                batchNo: r.batchNo,
                expDate: r.expDate,
                gstPct: parseFloat(r.gstPct) || 0,
                per: r.per,
                boxes: parseFloat(r.boxes) || 0,
                boxQty: parseFloat(r.boxQty) || 0,
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
                termsOfDelivery: header.termsOfDelivery,
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
                status: header.modeOfPayment === 'Cash' ? 'paid' : 'pending',
                paymentStatus: header.modeOfPayment === 'Cash' ? 'Paid' : 'Pending',
            };

            if (isEditing) {
                await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', prefilledOrderId), {
                    ...orderPayload,
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(getTenantCollection(db, tenantId, 'salesOrders'), {
                    ...orderPayload,
                    createdAt: serverTimestamp(),
                });
            }

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
            }

            if (!isPrint) {
                alert(`Invoice ${invNo} saved!`);
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
            console.error(e);
            alert('Error saving invoice. Please try again.');
        }
        setIsProcessing(false);
    };

    const resetForm = () => {
        setHeader({ invoiceNo: '', invoiceDate: today, termsOfDelivery: '', modeOfPayment: '15 Days', salesmanName: '', buyerName: '', buyerAddress: '', buyerGstin: '', buyerContact: '', buyerState: 'Maharashtra', retailerId: '' });
        setRows(Array.from({ length: 10 }, EMPTY_ROW));
        setPreviousBalance('');
        setDiscount('0');
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
                    .b2b-wrapper { padding: 0 !important; background: transparent !important; }
                    .b2b-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; padding: 10px !important; }
                    .no-print { display: none !important; }
                    .b2b-table th, .b2b-table td { padding: 2px 3px !important; font-size: 0.78rem !important; }
                    h1 { font-size: 1.2rem !important; }
                    input, select, textarea {
                        display: none !important;
                    }
                    .print-val {
                        display: inline !important;
                        font-family: 'Times New Roman', serif;
                        font-size: inherit;
                        color: #000;
                    }
                    select { background-image: none !important; }
                }
                .print-val { display: none; }
                .b2b-table { border-collapse: collapse; width: 100%; }
                .b2b-table th, .b2b-table td { border: 1px solid #222; padding: 4px 5px; font-size: 0.82rem; }
                .b2b-table th { background: #f2f2f2; font-weight: 700; text-align: center; }
                .b2b-input { width: 100%; border: none; background: transparent; outline: none; font-family: inherit; color: inherit; font-size: inherit; }
                .b2b-cell { border: 1px solid #222; padding: 4px 6px; font-size: 0.82rem; }
                .b2b-label { font-weight: 700; font-size: 0.82rem; }
                .b2b-dropdown { position: absolute; top: 100%; left: 0; min-width: 220px; max-height: 200px; overflow-y: auto; background: #fff; border: 1px solid #ccc; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
                .b2b-dropdown-item { padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid #eee; text-align: left; }
                .b2b-dropdown-item:hover { background: #e8f5e9; }
            `}</style>

            {/* ── Onboard Retailer shortcut (no-print) ── */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem', maxWidth: '1050px', marginLeft: 'auto', marginRight: 'auto' }}>
                <Link
                    to="/onboarding"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.1rem', background: 'var(--primary-light)', color: '#fff', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit' }}
                >
                    <UserPlus size={16} /> Onboard New Retailer
                </Link>
            </div>

            <div style={{ maxWidth: '1050px', margin: '0 auto', background: '#fff', color: '#000', fontFamily: "'Times New Roman', serif", boxShadow: '0 10px 40px rgba(0,0,0,0.1)', borderRadius: '12px', border: '1px solid #ddd', padding: '20px 24px' }} className="b2b-card">

                {/* ── TITLE ── */}
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.15em', marginBottom: '2px' }}>
                    GST INVOICE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '44px', objectFit: 'contain' }} />}
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{sellerName}</h1>
                            <div style={{ fontSize: '0.78rem', color: '#444', marginTop: '2px' }}>
                                {branding?.address || tenantData?.location || 'Address'}<br />
                                {branding?.gstin && <><strong>GSTIN:</strong> {branding.gstin} &nbsp;</>}
                                {branding?.contact && <>Contact No.: {branding.contact}</>}
                                {branding?.email && <>&nbsp; Email: {branding.email}</>}
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: '#111', border: '2px solid #111', padding: '4px 12px', borderRadius: '6px' }}>
                        CREDIT BILL
                    </div>
                </div>

                {/* ── GSTIN BANNER ── */}
                {branding?.gstin && (
                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', marginBottom: '10px', letterSpacing: '0.05em' }}>
                        GSTTIN NO: {branding.gstin}
                    </div>
                )}

                {/* ── BUYER + INVOICE META ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '10px', border: '1px solid #222' }}>
                    {/* Buyer box */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                        <div className="b2b-label" style={{ marginBottom: '4px' }}>Details for Buyer (Billed &amp; Shipped To)</div>
                        
                        <div style={{ position: 'relative' }}>
                            <input 
                                className="b2b-input" 
                                style={{ fontWeight: 700, fontSize: '0.88rem' }} 
                                placeholder="Buyer / Retailer Name" 
                                value={header.buyerName} 
                                onChange={e => {
                                    setHeader(h => ({ ...h, buyerName: e.target.value, retailerId: '' }));
                                    setShowRetailerDropdown(e.target.value.length > 0);
                                }}
                                onFocus={() => header.buyerName.length > 0 && setShowRetailerDropdown(true)}
                                onBlur={() => setTimeout(() => setShowRetailerDropdown(false), 200)}
                            />
                            <span className="print-val" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{header.buyerName}</span>
                            {showRetailerDropdown && (
                                <div className="b2b-dropdown no-print" style={{ top: '100%', left: 0, width: '100%' }}>
                                    {retailers
                                        .filter(r => (r.name || '').toLowerCase().includes(header.buyerName.toLowerCase()))
                                        .slice(0, 10)
                                        .map(r => (
                                            <div
                                                key={r.id}
                                                className="b2b-dropdown-item"
                                                onMouseDown={() => {
                                                    setHeader(prev => ({
                                                        ...prev,
                                                        retailerId: r.id,
                                                        buyerName: r.name || '',
                                                        buyerContact: r.number || prev.buyerContact,
                                                        buyerAddress: `${r.atPost || ''}, Tal. ${r.taluka || ''}, Dist. ${r.district || ''}`.trim(),
                                                        buyerGstin: r.gstin || prev.buyerGstin,
                                                    }));
                                                    setShowRetailerDropdown(false);
                                                }}
                                            >
                                                <div style={{ fontWeight: 600 }}>{r.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#666' }}>{r.number} {r.atPost ? `• ${r.atPost}` : ''}</div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div style={{ position: 'relative' }}>
                            <textarea className="b2b-input" style={{ display: 'block', marginTop: '3px', resize: 'none', minHeight: '44px' }} placeholder="Address" value={header.buyerAddress} onChange={e => setHeader(h => ({ ...h, buyerAddress: e.target.value }))} />
                            <span className="print-val" style={{ display: 'none', whiteSpace: 'pre-wrap', marginTop: '3px', fontSize: '0.82rem' }}>{header.buyerAddress}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                            <span className="b2b-label">GST No.:</span>
                            <div style={{ flexGrow: 1, minWidth: '120px' }}>
                                <input
                                    className="b2b-input"
                                    style={{ width: '100%', textTransform: 'uppercase' }}
                                    placeholder="Buyer GSTIN"
                                    value={header.buyerGstin}
                                    onChange={e => setHeader(h => ({ ...h, buyerGstin: e.target.value.toUpperCase() }))}
                                    maxLength={15}
                                />
                                <span className="print-val" style={{ textTransform: 'uppercase' }}>{header.buyerGstin}</span>
                                {header.buyerGstin && (() => {
                                    const result = validateGSTIN(header.buyerGstin);
                                    return result.valid
                                        ? <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '2px' }}>✓ {result.state}</div>
                                        : <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '2px' }}>⚠ {result.error}</div>;
                                })()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                            <span className="b2b-label">Contact No.:</span>
                            <input className="b2b-input" style={{ flexGrow: 1 }} placeholder="Phone No" value={header.buyerContact} onChange={e => setHeader(h => ({ ...h, buyerContact: e.target.value }))} onBlur={handleBuyerPhoneBlur} />
                            <span className="print-val">{header.buyerContact}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                            <span className="b2b-label">State :</span>
                            <input className="b2b-input" style={{ flexGrow: 1 }} value={header.buyerState} onChange={e => setHeader(h => ({ ...h, buyerState: e.target.value }))} />
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
                            <input type="date" className="b2b-input" value={header.invoiceDate} onChange={e => setHeader(h => ({ ...h, invoiceDate: e.target.value }))} />
                            <span className="print-val"></span>
                            <span className="print-val">{header.invoiceDate}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Terms of Delivery :</span>
                            <input className="b2b-input" placeholder="e.g. By Vehicle" value={header.termsOfDelivery} onChange={e => setHeader(h => ({ ...h, termsOfDelivery: e.target.value }))} />
                            <span className="print-val"></span>
                            <span className="print-val">{header.termsOfDelivery}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Mode of Payment :</span>
                            <select className="b2b-input" value={header.modeOfPayment} onChange={e => setHeader(h => ({ ...h, modeOfPayment: e.target.value }))}>
                                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <span className="print-val"></span>
                            <span className="print-val">{header.modeOfPayment}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '4px', alignItems: 'center' }}>
                            <span className="b2b-label">Salesman Name :</span>
                            <input className="b2b-input" placeholder="Salesman / Agent" value={header.salesmanName} onChange={e => setHeader(h => ({ ...h, salesmanName: e.target.value }))} />
                            <span className="print-val"></span>
                            <span className="print-val">{header.salesmanName}</span>
                        </div>
                    </div>
                </div>

                {/* ── ITEMS TABLE ── */}
                <div style={{ marginBottom: '10px', overflowX: 'auto' }}>
                    <table className="b2b-table">
                        <thead>
                            <tr>
                                <th style={{ width: '30px' }}>S.No</th>
                                <th style={{ minWidth: '140px' }}>Item Descriptions</th>
                                <th style={{ width: '78px' }}>BATCH NO.</th>
                                <th style={{ width: '78px' }}>Exp. Date</th>
                                <th style={{ width: '46px' }}>GST %</th>
                                <th style={{ width: '54px' }}>Mid Off</th>
                                <th style={{ width: '44px' }}>Per</th>
                                <th style={{ width: '46px' }}>Boxes</th>
                                <th style={{ width: '52px' }}>Box Qty</th>
                                <th style={{ width: '54px' }}>Qty</th>
                                <th style={{ width: '62px' }}>RATE</th>
                                <th style={{ width: '82px' }}>Gross Amount</th>
                                <th className="no-print" style={{ width: '32px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{idx + 1}</td>

                                        {/* Item Description */}
                                        <td style={{ position: 'relative' }}>
                                            <input
                                                className="b2b-input"
                                                placeholder="Search product..."
                                                value={row.itemDescription}
                                                onChange={e => {
                                                    handleRowChange(idx, 'itemDescription', e.target.value);
                                                    if (e.target.value.length > 0) setActiveRowIndex(idx);
                                                    else setActiveRowIndex(null);
                                                }}
                                                onFocus={() => row.itemDescription.length > 0 && setActiveRowIndex(idx)}
                                                onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                            />
                                            <span className="print-val">{row.itemDescription}</span>
                                            {activeRowIndex === idx && (
                                                <div className="b2b-dropdown no-print">
                                                    {products
                                                        .filter(p => p.name.toLowerCase().includes(row.itemDescription.toLowerCase()))
                                                        .slice(0, 50)
                                                        .map(p => (
                                                            <div
                                                                key={p.id}
                                                                className="b2b-dropdown-item"
                                                                onMouseDown={() => { handleRowChange(idx, 'productId', p.id); setActiveRowIndex(null); }}
                                                            >
                                                                {p.name}
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                        </td>

                                        <td><input className="b2b-input" style={{ textAlign: 'center' }} value={row.batchNo} onChange={e => handleRowChange(idx, 'batchNo', e.target.value)} /><span className="print-val">{row.batchNo}</span></td>
                                        <td><input type="month" className="b2b-input" style={{ textAlign: 'center', fontSize: '0.76rem' }} value={row.expDate} onChange={e => handleRowChange(idx, 'expDate', e.target.value)} /><span className="print-val">{row.expDate}</span></td>
                                        <td style={{ textAlign: 'center' }}><input type="number" className="b2b-input" style={{ textAlign: 'center' }} value={row.gstPct} onChange={e => handleRowChange(idx, 'gstPct', e.target.value)} /><span className="print-val">{row.gstPct}</span></td>
                                        <td style={{ textAlign: 'center' }}><input className="b2b-input" style={{ textAlign: 'center' }} value={row.midOff} onChange={e => handleRowChange(idx, 'midOff', e.target.value)} /><span className="print-val">{row.midOff}</span></td>
                                        <td style={{ textAlign: 'center' }}><input className="b2b-input" style={{ textAlign: 'center' }} value={row.per} onChange={e => handleRowChange(idx, 'per', e.target.value)} /><span className="print-val">{row.per}</span></td>
                                        <td style={{ textAlign: 'center' }}><input type="number" min="0" className="b2b-input" style={{ textAlign: 'center' }} value={row.boxes} onChange={e => handleRowChange(idx, 'boxes', e.target.value)} /><span className="print-val">{row.boxes}</span></td>
                                        <td style={{ textAlign: 'center' }}><input type="number" min="0" className="b2b-input" style={{ textAlign: 'center' }} value={row.boxQty} onChange={e => handleRowChange(idx, 'boxQty', e.target.value)} /><span className="print-val">{row.boxQty}</span></td>
                                        <td style={{ textAlign: 'center', fontWeight: 600 }}><input type="number" min="0" className="b2b-input" style={{ textAlign: 'center', fontWeight: 600 }} placeholder="0" value={row.quantity} onChange={e => handleRowChange(idx, 'quantity', e.target.value)} /><span className="print-val">{row.quantity}</span></td>
                                        <td style={{ textAlign: 'center' }}><input type="number" className="b2b-input" style={{ textAlign: 'center' }} value={row.rate} onChange={e => handleRowChange(idx, 'rate', e.target.value)} /><span className="print-val">{row.rate}</span></td>
                                        <td style={{ textAlign: 'center', fontWeight: row.grossAmount ? 600 : 400 }}>{row.grossAmount ? fmt(row.grossAmount) : ''}</td>
                                        <td className="no-print" style={{ textAlign: 'center', padding: '2px' }}>
                                            <button onClick={() => removeRow(idx)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e53935', padding: '2px' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            {/* TOTAL row */}
                            <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                                <td colSpan={11} style={{ textAlign: 'right', paddingRight: '8px' }}>TOTAL</td>
                                <td style={{ textAlign: 'center' }}>{fmt(totalGross)}</td>
                                <td className="no-print"></td>
                            </tr>
                        </tbody>
                    </table>
                    {/* Add Row button */}
                    <button
                        className="no-print"
                        onClick={addRow}
                        style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px dashed #999', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '0.82rem', color: '#555' }}
                    >
                        <Plus size={14} /> Add Row
                    </button>
                </div>

                {/* ── GST SUMMARY + NET AMOUNT ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '10px', border: '1px solid #222' }}>
                    {/* GST Breakdown table */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr>
                                    <th style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>Taxable Value</th>
                                    <th style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>Central Tax Rate</th>
                                    <th style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>Amount</th>
                                    <th style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>State Tax Rate</th>
                                    <th style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>Amount</th>
                                    <th style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>Total Tax Amount</th>
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

                    {/* Net Amount column */}
                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Output CGST@{cgstPct}%</span><span>{fmt(totalCgst)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Output SGST@{sgstPct}%</span><span>{fmt(totalSgst)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Round Off</span><span>{fmt(roundOff)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Discount (-)</span>
                            <input
                                type="number"
                                className="b2b-input no-print"
                                style={{ width: '70px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '3px', padding: '1px 4px' }}
                                value={discount}
                                onChange={e => setDiscount(e.target.value)}
                            />
                            <span className="print-only" style={{ display: 'none' }}>{discount}</span>
                        </div>
                        <div style={{ borderTop: '2px solid #111', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
                            <span>NET AMOUNT</span><span>₹{netAmount.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>

                {/* ── AMOUNT IN WORDS ── */}
                <div style={{ border: '1px solid #222', marginBottom: '10px', display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'stretch' }}>
                    <div style={{ borderRight: '1px solid #222', padding: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', fontSize: '0.82rem' }}>
                        Amount<br />in Words
                    </div>
                    <div style={{ padding: '6px', fontWeight: 600, fontSize: '0.85rem', fontStyle: 'italic' }}>
                        INR {numberToWords(netAmount)}
                    </div>
                </div>

                {/* ── BALANCE + BANK + SIGNATURE ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '10px', border: '1px solid #222' }}>
                    {/* Balance section */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px', fontSize: '0.82rem' }}>
                        <div className="b2b-label" style={{ marginBottom: '6px' }}>Account Statement</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span>Previous Balance</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                    type="number"
                                    className="b2b-input no-print"
                                    style={{ width: '80px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '3px', padding: '1px 4px' }}
                                    value={previousBalance}
                                    placeholder="0.00"
                                    onChange={e => setPreviousBalance(e.target.value)}
                                />
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Dr</span>
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span>Current Invoice</span>
                            <span style={{ fontWeight: 600 }}>
                                ₹{netAmount.toLocaleString('en-IN')} Dr
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc', paddingTop: '3px', fontWeight: 700 }}>
                            <span>Net Balance</span>
                            <span>₹{netBalance.toLocaleString('en-IN')} Dr</span>
                        </div>
                    </div>

                    {/* Bank details + Signature */}
                    <div style={{ padding: '8px', fontSize: '0.8rem' }}>
                        <div className="b2b-label" style={{ marginBottom: '4px' }}>Company's Bank Details for NEFT / RTGS :</div>
                        <div style={{ whiteSpace: 'pre-line', color: '#333', marginBottom: '8px', lineHeight: '1.6' }}>
                            {branding?.bankDetails || DEFAULT_BANK_DETAILS}
                        </div>
                        {/* UPI QR — shown only on print */}
                        {branding?.upiId && (
                            <div style={{ marginTop: '8px', borderTop: '1px solid #ccc', paddingTop: '6px' }}>
                                <UpiQrCode
                                    upiId={branding.upiId}
                                    payeeName={sellerName}
                                    amount={netAmount}
                                    transactionNote={displayInvoiceNo}
                                    size={90}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* ── REMARK ROW (full width) ── */}
                <div style={{ border: '1px solid #222', marginBottom: '0', padding: '5px 8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong>REMARK :</strong>
                    <input className="b2b-input" style={{ flexGrow: 1 }} placeholder="Any remarks here..." />
                </div>

                {/* ── DECLARATION (left) + SIGNATURE (right) ── */}
                <div style={{ border: '1px solid #222', borderTop: 'none', marginBottom: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    {/* Declaration */}
                    <div style={{ borderRight: '1px solid #222', padding: '8px', fontSize: '0.75rem' }}>
                        <div className="b2b-label" style={{ marginBottom: '3px' }}>Declaration :</div>
                        <div style={{ color: '#444', lineHeight: '1.5' }}>
                            We declare that this invoice shows the actual price of the goods described
                            and that all particulars are true and correct.
                        </div>
                    </div>
                    {/* Signature */}
                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700 }}>For {sellerName}</div>
                        {branding?.signatureUrl && (
                            <img src={branding.signatureUrl} alt="" style={{ height: '46px', maxWidth: '160px', objectFit: 'contain', marginTop: '4px' }} />
                        )}
                        <div style={{ borderTop: '1px solid #555', paddingTop: '4px', minWidth: '140px', textAlign: 'center', marginTop: branding?.signatureUrl ? '4px' : '28px' }}>
                            {branding?.signatureName || 'Authorised Signatory'}
                        </div>
                    </div>
                </div>

                {/* ── JURISDICTION ── */}
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.06em', marginBottom: '16px' }}>
                    SUBJECT TO PUNE JURISDICTION
                </div>

                {/* ── ACTION BUTTONS ── */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={isProcessing}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', background: '#1565C0', color: '#fff', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />} Save & Print
                    </button>
                    <button
                        onClick={handlePrintOnly}
                        disabled={isProcessing}
                        title="Print the current invoice without saving"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', background: 'transparent', color: '#1565C0', border: '2px solid #1565C0', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                    >
                        <Printer size={18} /> Print Invoice
                    </button>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isProcessing}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px', background: '#2E7D32', color: '#fff', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Save Invoice
                    </button>
                </div>
            </div>
        </div>
    );
}
