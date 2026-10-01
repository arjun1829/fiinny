import UpiQrCode from './UpiQrCode';
import { getInvoiceProductCategories, getAllConfiguredLicenses } from '../utils/invoiceCategories';
import { INVOICE_CONTACT_LABEL } from '../utils/constants';

// ── English fallback for the L() translation helper ─────────────────────────
// When the component is used without a translation function (e.g. from
// InvoiceSettingsPage), labels fall back to English so the preview is readable.
const EN: Record<string, string> = {
    gst_invoice: 'GST INVOICE',
    cash_bill: 'CASH BILL',
    credit_bill: 'CREDIT BILL',
    item_description: 'Item Descriptions',
    company: 'Company',
    batch_no: 'Batch',
    exp_date: 'Exp',
    gst_pct: 'GST%',
    per: 'Per',
    qty: 'Qty',
    rate: 'Rate',
    gross_amount: 'Amount',
    sno: '#',
    total: 'TOTAL',
    discount: 'Discount',
    transport_charges: 'Transport',
    labor_charges: 'Labour',
    net_amount: 'NET AMOUNT',
    amount_paid: 'Amount Paid',
    credit_amount: 'Credit Amount',
    previous_outstanding: 'Previous Outstanding',
    total_payable: 'Total Payable',
    amount_in_words: 'Amount in Words',
    declaration: 'Declaration',
    declaration_text: 'We certify that the details in this invoice are true and correct. Goods once sold are not eligible for a full refund.',
    scan_to_pay: 'Scan to Pay',
    for_business: 'For',
    authorised_signatory: 'Authorised Signatory',
    taxable: 'Taxable',
    cgst: 'CGST',
    sgst: 'SGST',
    total_tax: 'Total Tax',
    output_cgst: 'Output CGST',
    output_sgst: 'Output SGST',
    buyer_title: 'Buyer',
    contact: 'Contact',
    bill_no: 'Bill No',
    bill_date: 'Date',
    mode_of_payment: 'Mode',
};
const defaultL = (key: string): string => EN[key] ?? key;

// ── Helper functions (exported so POSPage can import them) ───────────────────

export function numberToWords(num: number): string {
    if (!num || num < 0) return 'Zero only';
    if (num === 0) return 'Zero only';
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

// "2026-03" or "2026-03-15" → "03/26" for compact display
export function toMonthYear(val: string): string {
    // Matches YYYY-MM or YYYY-MM-DD; we only need year+month
    const m = /^(\d{4})-(\d{2})/.exec((val || '').trim());
    return m ? `${m[2]}/${m[1].slice(2)}` : (val || '');
}

// Minimum total product rows shown on the printed/previewed invoice — matches
// POSPage's FRESH_BILL_ROW_COUNT so a fresh bill's on-screen row count and its
// printed row count agree. Blank rows pad up to this floor; a cart with more
// items than this simply shows all of them, no padding.
const INVOICE_PRINT_ROW_COUNT = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface PosInvoiceItem {
    name: string;
    mfgCompany?: string;
    batchNo?: string;
    expDate?: string;
    gstPct?: number;
    unit?: string;
    baseUnit?: string;
    cartQuantity: number;
    cartTotal: number;
    sellingPrice?: number;
    maxRetailPrice?: number;
    type?: string;
}

export interface PosInvoiceCustomer {
    name?: string;
    phone?: string;
    address?: string; // village / atPost
    taluka?: string;
    district?: string;
    pin?: string;
}

export interface PosInvoiceBranding {
    businessName?: string;
    address?: string;
    gstin?: string;
    contact?: string;
    logoUrl?: string;
    signatureUrl?: string;
    signatureName?: string;
    upiId?: string;
    fertilizerLicense?: string;
    pesticideLicense?: string;
    seedsLicense?: string;
    // Presentation-only text-case preference for customer/product/company/
    // batch/unit fields on the invoice (see `up()` below). Never mutates
    // stored data — 'uppercase' only changes how it's rendered. Missing/
    // undefined (existing tenants with no saved preference) behaves exactly
    // like 'normal' — the original mixed-case display.
    invoiceTextCase?: 'normal' | 'uppercase';
}

interface Props {
    cart: PosInvoiceItem[];
    customer: PosInvoiceCustomer;
    branding: PosInvoiceBranding | null;
    billNumber: string;
    discount?: number;
    transportCharges?: number;
    laborCharges?: number;
    grandTotal: number;
    creditPaidNow?: number;
    creditAmount?: number;
    billFormat?: 'A4' | 'A5';
    invoiceDate?: string;
    modeOfPayment?: string;
    previousOutstanding?: number;
    L?: (key: string) => string;
    activeCats?: string[];
    // Sales Return / Credit Note reuse: overrides the "GST INVOICE" header title
    // and, when set, prints the original bill reference. Both default to the
    // normal invoice behaviour, so existing POS bill printing is unaffected.
    documentTitle?: string;
    originalBillNumber?: string;
}

// ── Component — single source of truth for the POS GST invoice layout ────────

export function PosInvoicePreview({
    cart,
    customer,
    branding,
    billNumber,
    discount = 0,
    transportCharges = 0,
    laborCharges = 0,
    grandTotal,
    creditPaidNow = 0,
    creditAmount = 0,
    billFormat = 'A5',
    invoiceDate,
    modeOfPayment = 'Cash',
    previousOutstanding = 0,
    L = defaultL,
    activeCats: activeCatsProp,
    documentTitle,
    originalBillNumber,
}: Props) {
    const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);
    const lineGst = (i: PosInvoiceItem) => (typeof i.gstPct === 'number' ? i.gstPct : 5);
    const rate = (i: PosInvoiceItem) => Number(i.sellingPrice) || Number(i.maxRetailPrice) || 0;
    // Presentation-only uppercasing for the printed invoice — never mutates the
    // source cart/customer objects (POSPage state, salesOrders, Product Master
    // all keep whatever casing was originally entered). Falsy/undefined values
    // pass through untouched instead of becoming the string "undefined".
    // Gated by the tenant's saved Invoice Text Format preference (Admin →
    // Invoice Settings) — missing/undefined defaults to 'normal', so existing
    // tenants who never touched this setting keep today's exact behavior.
    const uppercaseEnabled = branding?.invoiceTextCase === 'uppercase';
    const up = (v?: string | null) => (uppercaseEnabled && v ? v.toUpperCase() : v);

    const totalQty = cart.reduce((s, i) => s + (i.cartQuantity || 0), 0);
    const taxable = cart.reduce((s, i) => s + (i.cartTotal || 0) / (1 + lineGst(i) / 100), 0);
    const cgst = cart.reduce((s, i) => { const g = lineGst(i); return s + ((i.cartTotal || 0) / (1 + g / 100)) * (g / 2) / 100; }, 0);
    const sgst = cgst;
    const tax = cgst + sgst;
    // The POS bill has no Round Off adjustment. `grandTotal` is the NET AMOUNT
    // (Bill Total + charges − discount, discount applied here). Total Payable
    // adds Previous Outstanding to it — the discount is never subtracted again.
    const payable = grandTotal || 0;
    const billTotal = taxable + tax;
    const hasAdjustments = (transportCharges || 0) > 0 || (laborCharges || 0) > 0 || (discount || 0) > 0;
    const sellerName = branding?.businessName || 'Your Business Name';
    const isA5 = billFormat === 'A5';
    const baseFont = isA5 ? '0.65rem' : '0.82rem';
    const dateLabel = invoiceDate || new Date().toISOString().split('T')[0];
    const activeCats = activeCatsProp ?? getInvoiceProductCategories(cart);
    const allLicenses = getAllConfiguredLicenses(branding);

    return (
        <div style={{ padding: isA5 ? '4mm 6mm' : '12mm', fontFamily: "'Times New Roman', serif", background: '#fff', color: '#000', fontSize: baseFont }}>
            <style>{`
                @media print { @page { size: ${isA5 ? 'A5 landscape' : 'A4'}; margin: ${isA5 ? '4mm' : '10mm'}; } }
                .kaprint-table { border-collapse: collapse; width: 100%; }
                .kaprint-table th, .kaprint-table td { border: 1px solid #222; padding: ${isA5 ? '1px 2px' : '3px 5px'}; font-size: ${baseFont}; }
                .kaprint-table th { background: #f2f2f2; font-weight: 700; text-align: center; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            `}</style>

            {isA5 ? (
                // ── A5 LANDSCAPE — Reference Invoice Redesign ─────────────────
                <div style={{ border: '1.5px solid #333', fontFamily: 'Arial, Helvetica, sans-serif' }}>

                    {/* ══ HEADER ══════════════════════════════════════════════════ */}
                    {/* License box is its own auto-width column so it never stretches */}
                    <div style={{ display: 'grid', gridTemplateColumns: `${allLicenses.length > 0 ? 'auto ' : ''}1fr 130px`, borderBottom: '1.5px solid #333' }}>

                        {/* License box — compact, left-most, sized to content */}
                        {allLicenses.length > 0 && (
                            <div style={{ borderRight: '1px solid #aaa', padding: '4px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
                                {allLicenses.map(lic => (
                                    <div key={lic.label} style={{ fontSize: '0.44rem', color: '#333', whiteSpace: 'nowrap' }}>
                                        <strong>{lic.label}:</strong> {lic.number}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Center: GST INVOICE (primary) + Business info */}
                        <div style={{ borderRight: '1px solid #aaa', padding: '4px 10px', textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5px' }}>
                            <div style={{ fontWeight: 900, fontSize: '0.82rem', letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: '#111', lineHeight: 1.1 }}>{documentTitle || 'GST INVOICE'}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                                {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '18px', objectFit: 'contain' }} />}
                                <div style={{ fontWeight: 800, fontSize: '0.68rem', lineHeight: 1.15 }}>{sellerName}</div>
                            </div>
                            {branding?.address && <div style={{ fontSize: '0.50rem', color: '#333', lineHeight: 1.35 }}>{branding.address}</div>}
                            <div style={{ fontSize: '0.48rem', color: '#333', display: 'flex', gap: '5px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                                {branding?.gstin && <span><strong>GSTIN:</strong> {branding.gstin}</span>}
                                <span>| <strong>Contact:</strong> {INVOICE_CONTACT_LABEL}</span>
                                {branding?.contact && <span>| <strong>Ph:</strong> {branding.contact}</span>}
                            </div>
                        </div>

                        {/* Right: Bill meta */}
                        <div style={{ padding: '4px 7px', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: '0.52rem', gap: '2.5px' }}>
                            <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>{originalBillNumber ? 'CN No:' : 'Bill No:'}</strong><span style={{ fontWeight: 900 }}>{billNumber}</span></div>
                            {originalBillNumber && <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>Ref Bill:</strong><span>{originalBillNumber}</span></div>}
                            <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>Date:</strong><span>{dateLabel}</span></div>
                            <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>Mode:</strong><strong style={{ fontWeight: 900 }}>{modeOfPayment}</strong></div>
                        </div>
                    </div>

                    {/* ══ CUSTOMER ROW ════════════════════════════════════════════ */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.75fr 0.85fr 0.85fr 1.0fr 0.45fr', borderBottom: '1px solid #aaa', fontSize: '0.57rem' }}>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Buyer:</strong>
                            <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{up(customer.name) || '—'}</span>
                        </div>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Ph:</strong>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.phone || '—'}</span>
                        </div>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Village:</strong>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{up(customer.address) || '—'}</span>
                        </div>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Taluka:</strong>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{up(customer.taluka) || '—'}</span>
                        </div>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>District:</strong>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{up(customer.district) || '—'}</span>
                        </div>
                        <div style={{ padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>PIN:</strong>
                            <span>{customer.pin || '—'}</span>
                        </div>
                    </div>

                    {/* ══ ITEMS TABLE ══════════════════════════════════════════════ */}
                    {/* Column widths in % so they scale identically on screen and print.
                        Product is left as auto so it absorbs all remaining space (~38%). */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.62rem', tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '2.5%' }} />   {/* # */}
                            <col />                              {/* Product — auto */}
                            <col style={{ width: '9%' }} />     {/* Company */}
                            <col style={{ width: '9.5%' }} />   {/* Batch */}
                            <col style={{ width: '8%' }} />     {/* Exp */}
                            <col style={{ width: '4.5%' }} />   {/* Per */}
                            <col style={{ width: '5%' }} />     {/* Qty */}
                            <col style={{ width: '10%' }} />    {/* Rate */}
                            <col style={{ width: '5%' }} />     {/* GST% */}
                            <col style={{ width: '12%' }} />    {/* Amount */}
                        </colgroup>
                        <thead>
                            <tr style={{ background: '#f5f5f5', borderBottom: '1.5px solid #333' }}>
                                {([
                                    ['#', 'center', '2px 1px'],
                                    ['Product', 'left', '2px 4px'],
                                    ['Company', 'center', '2px 2px'],
                                    ['Batch No.', 'center', '2px 2px'],
                                    ['Exp', 'center', '2px 1px'],
                                    ['Per', 'center', '2px 1px'],
                                    ['Qty', 'center', '2px 1px'],
                                    ['Rate', 'right', '2px 3px'],
                                    ['GST%', 'center', '2px 1px'],
                                    ['Amount', 'right', '2px 3px'],
                                ] as const).map(([label, align, pad]) => (
                                    <th key={label} style={{ border: '1px solid #ccc', padding: pad, textAlign: align, fontWeight: 700, fontSize: '0.60rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map((item, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const }}>{i + 1}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{up(item.name)}</td>
                                    {/* Company/Batch No. wrap within their existing fixed-width column
                                        instead of clipping with an ellipsis — the column widths (colgroup
                                        above) are unchanged, only the overflow behavior differs from the
                                        other still-nowrap cells (Product name, Exp, Per) in this row. */}
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 2px', textAlign: 'center' as const, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.15 }}>{up(item.mfgCompany) || ''}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 2px', textAlign: 'center' as const, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.15 }}>{up(item.batchNo) || ''}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const, whiteSpace: 'nowrap' }}>{toMonthYear(item.expDate || '')}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{up(item.unit || item.baseUnit) || ''}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const, fontWeight: 700 }}>{item.cartQuantity}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 3px', textAlign: 'right' as const }}>{rate(item)}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const }}>{lineGst(item)}%</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 3px', textAlign: 'right' as const, fontWeight: 700 }}>{fmt(item.cartTotal)}</td>
                                </tr>
                            ))}
                            {Array.from({ length: Math.max(0, INVOICE_PRINT_ROW_COUNT - cart.length) }).map((_, i) => (
                                <tr key={`e-${i}`} style={{ height: '13px' }}>
                                    {Array.from({ length: 10 }).map((_, j) => <td key={j} style={{ border: '1px solid #e0e0e0' }}></td>)}
                                </tr>
                            ))}
                            <tr style={{ background: '#f5f5f5', borderTop: '1.5px solid #333' }}>
                                <td colSpan={6} style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right' as const, fontWeight: 800, fontSize: '0.62rem', textTransform: 'uppercase' as const }}>Total</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 1px', textAlign: 'center' as const, fontWeight: 900, fontSize: '0.62rem' }}>{totalQty}</td>
                                <td colSpan={2} style={{ border: '1px solid #ccc' }}></td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 3px', textAlign: 'right' as const, fontWeight: 900, fontSize: '0.62rem' }}>{fmt(taxable + tax)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* ══ FOOTER ══════════════════════════════════════════════════ */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr 1.0fr', borderTop: '1.5px solid #333' }}>

                        {/* Col 1: GST Summary + Declaration */}
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
                                        {[taxable, cgst, sgst, tax].map((v, vi) => (
                                            <td key={vi} style={{ border: '1px solid #ddd', padding: '1.5px 2px', textAlign: 'center' as const }}>{fmt(v)}</td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                            <div style={{ padding: '3px 5px', fontSize: '0.46rem', color: '#555', lineHeight: 1.35, flex: 1 }}>
                                <strong>{L('declaration')}:</strong> {L('declaration_text')}
                            </div>
                        </div>

                        {/* Col 2: Net Amount + Words + Categories */}
                        <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '3px 6px', flex: 1, fontSize: '0.56rem', display: 'flex', flexDirection: 'column', gap: '1.5px' }}>
                                {hasAdjustments && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('bill_total')}</span><span>₹{billTotal.toLocaleString('en-IN')}</span></div>
                                )}
                                {transportCharges > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('transport_charges')}</span><span>+{fmt(transportCharges)}</span></div>
                                )}
                                {laborCharges > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('labor_charges')}</span><span>+{fmt(laborCharges)}</span></div>
                                )}
                                {discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}>
                                        <span>{L('discount')}</span><span>-₹{fmt(discount)}</span>
                                    </div>
                                )}
                                <div style={{ borderTop: '1.5px solid #333', paddingTop: '1.5px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.70rem' }}>
                                    <span>{L('net_amount')}</span><span>₹{payable.toLocaleString('en-IN')}</span>
                                </div>
                                {(modeOfPayment === 'Khata' || modeOfPayment === 'Credit') && (<>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}>
                                        <span>{L('amount_paid')}</span><span>₹{Number(creditPaidNow).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div style={{ borderTop: '1px solid #555', paddingTop: '1px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: creditAmount > 0 ? '#c62828' : '#2E7D32' }}>
                                        <span>{L('credit_amount')}</span><span>₹{Number(creditAmount).toLocaleString('en-IN')}</span>
                                    </div>
                                </>)}
                                {previousOutstanding > 0 && (<>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828' }}>
                                        <span>{L('previous_outstanding')} (Dr)</span><span>₹{Number(previousOutstanding).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div style={{ borderTop: '1.5px solid #333', paddingTop: '1.5px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                        <span>{L('total_payable')}</span><span>₹{(payable + Number(previousOutstanding)).toLocaleString('en-IN')}</span>
                                    </div>
                                </>)}
                            </div>
                            <div style={{ borderTop: '1px solid #ddd', padding: '2px 6px', fontSize: '0.48rem', lineHeight: 1.3 }}>
                                <strong>{L('amount_in_words')}:</strong> <span style={{ fontStyle: 'italic' }}>INR {numberToWords(payable)}</span>
                            </div>
                        </div>

                        {/* Col 3: Signatures side by side + optional QR */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'row' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '3px 8px', alignItems: 'center' }}>
                                    <div style={{ borderTop: '1px solid #555', paddingTop: '2px', fontSize: '0.50rem', fontWeight: 700, textAlign: 'center' as const, width: '100%' }}>Customer Signature</div>
                                </div>
                                <div style={{ flex: 1, borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '3px 8px', alignItems: 'center' }}>
                                    {branding?.signatureUrl && (
                                        <img src={branding.signatureUrl} alt="" style={{ height: '30px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
                                    )}
                                    <div style={{ borderTop: '1px solid #555', paddingTop: '2px', fontSize: '0.50rem', fontWeight: 700, textAlign: 'center' as const, width: '100%' }}>Authorized Signature</div>
                                </div>
                            </div>
                            {branding?.upiId && (
                                <div style={{ borderTop: '1px solid #ddd', textAlign: 'center' as const, padding: '2px 5px' }}>
                                    <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={payable} transactionNote={billNumber} size={38} />
                                    <div style={{ fontSize: '6px' }}>{L('scan_to_pay')}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                // ── A4 PORTRAIT ───────────────────────────────────────────────
                <>
                    <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '2px' }}>{documentTitle || L('gst_invoice')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '6px', marginBottom: '8px', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '44px', objectFit: 'contain' }} />}
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>{sellerName}</h1>
                                <div style={{ fontSize: '0.78rem', color: '#333', marginTop: '2px' }}>
                                    {branding?.address || ''}<br />
                                    {branding?.gstin && <><strong>GSTIN:</strong> {branding.gstin} &nbsp;</>}
                                    <strong>Contact:</strong> {INVOICE_CONTACT_LABEL} &nbsp;
                                    {branding?.contact && <>Contact No.: {branding.contact}</>}
                                </div>
                                {allLicenses.length > 0 && (
                                    <div style={{ fontSize: '0.70rem', color: '#555', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
                                        {allLicenses.map(lic => <span key={lic.label}><strong>{lic.label}:</strong> {lic.number}</span>)}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700, border: '2px solid #111', padding: '3px 10px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                            {originalBillNumber ? 'CREDIT NOTE' : (modeOfPayment === 'Khata' || modeOfPayment === 'Credit' ? L('credit_bill') : L('cash_bill'))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #222', marginBottom: '8px' }}>
                        <div style={{ borderRight: '1px solid #222', padding: '6px' }}>
                            <div style={{ fontWeight: 700, marginBottom: '3px' }}>{L('buyer_title')}</div>
                            <div style={{ fontWeight: 700 }}>{up(customer.name)}</div>
                            {customer.address && <div>{up(customer.address)}{customer.pin ? ` - ${customer.pin}` : ''}</div>}
                            {customer.phone && <div>{L('contact')}: {customer.phone}</div>}
                        </div>
                        <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{originalBillNumber ? 'Credit Note No' : L('bill_no')} :</strong><span>{billNumber}</span></div>
                            {originalBillNumber && <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Ref Bill No :</strong><span>{originalBillNumber}</span></div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('bill_date')} :</strong><span>{dateLabel}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('mode_of_payment')} :</strong><span>{modeOfPayment}</span></div>
                        </div>
                    </div>

                    <table className="kaprint-table" style={{ marginBottom: '8px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '30px' }}>{L('sno')}</th>
                                <th style={{ textAlign: 'left' as const }}>{L('item_description')}</th>
                                <th>{L('company')}</th><th>{L('batch_no')}</th><th>{L('exp_date')}</th>
                                <th>{L('gst_pct')}</th><th>{L('per')}</th><th>{L('qty')}</th>
                                <th>{L('rate')}</th><th>{L('gross_amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map((item, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'center' as const }}>{i + 1}</td>
                                    <td>{up(item.name)}</td>
                                    <td>{up(item.mfgCompany) || ''}</td>
                                    <td style={{ textAlign: 'center' as const }}>{up(item.batchNo) || ''}</td>
                                    <td style={{ textAlign: 'center' as const }}>{toMonthYear(item.expDate || '')}</td>
                                    <td style={{ textAlign: 'center' as const }}>{lineGst(item)}</td>
                                    <td style={{ textAlign: 'center' as const }}>{up(item.unit || item.baseUnit) || ''}</td>
                                    <td style={{ textAlign: 'center' as const }}>{item.cartQuantity}</td>
                                    <td style={{ textAlign: 'center' as const }}>{rate(item)}</td>
                                    <td style={{ textAlign: 'center' as const }}>{fmt(item.cartTotal)}</td>
                                </tr>
                            ))}
                            {Array.from({ length: Math.max(0, INVOICE_PRINT_ROW_COUNT - cart.length) }).map((_, i) => (
                                <tr key={`e-${i}`} style={{ height: '20px' }}>
                                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>
                            ))}
                            <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                                <td colSpan={7} style={{ textAlign: 'right', paddingRight: '8px' }}>{L('total')}</td>
                                <td style={{ textAlign: 'center' as const }}>{totalQty}</td>
                                <td></td>
                                <td style={{ textAlign: 'center' as const }}>{fmt(taxable + tax)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #222', marginBottom: '8px' }}>
                        <div style={{ borderRight: '1px solid #222', padding: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.78rem' }}>
                                <thead>
                                    <tr>{[L('taxable'), `${L('cgst')}%`, L('gross_amount'), `${L('sgst')}%`, L('gross_amount'), L('total_tax')].map((h, hi) => <th key={hi} style={{ border: '1px solid #ccc', padding: '2px 4px', background: '#f2f2f2' }}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(taxable)}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>2.5%</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(cgst)}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>2.5%</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(sgst)}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(tax)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_cgst')}@2.5%</span><span>{fmt(cgst)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_sgst')}@2.5%</span><span>{fmt(sgst)}</span></div>
                            {hasAdjustments && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('bill_total')}</span><span>₹{billTotal.toLocaleString('en-IN')}</span></div>}
                            {transportCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('transport_charges')}</span><span>+{fmt(transportCharges)}</span></div>}
                            {laborCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('labor_charges')}</span><span>+{fmt(laborCharges)}</span></div>}
                            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}><span>{L('discount')}</span><span>-₹{fmt(discount)}</span></div>}
                            <div style={{ borderTop: '2px solid #111', marginTop: '3px', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
                                <span>{L('net_amount')}</span><span>₹{payable.toLocaleString('en-IN')}</span>
                            </div>
                            {(modeOfPayment === 'Khata' || modeOfPayment === 'Credit') && (<>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', color: '#2E7D32' }}>
                                    <span>{L('amount_paid')}</span><span>₹{Number(creditPaidNow).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: creditAmount > 0 ? '#c62828' : '#2E7D32' }}>
                                    <span>{L('credit_amount')}</span><span>₹{Number(creditAmount).toLocaleString('en-IN')}</span>
                                </div>
                            </>)}
                            {previousOutstanding > 0 && (<>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                    <span>{L('previous_outstanding')} (Dr)</span><span>₹{Number(previousOutstanding).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ borderTop: '1px solid #111', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                    <span>{L('total_payable')}</span><span>₹{(payable + Number(previousOutstanding)).toLocaleString('en-IN')}</span>
                                </div>
                            </>)}
                        </div>
                    </div>

                    <div style={{ border: '1px solid #222', marginBottom: '8px', display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                        <div style={{ borderRight: '1px solid #222', padding: '5px', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{L('amount_in_words')}</div>
                        <div style={{ padding: '5px', fontWeight: 600, fontStyle: 'italic' }}>INR {numberToWords(payable)}</div>
                    </div>

                    {/* Category omitted from printed invoice */}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', marginTop: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#444', maxWidth: '60%' }}>
                            <strong>{L('declaration')} :</strong> {L('declaration_text')}
                        </div>
                        {branding?.upiId && (
                            <div style={{ textAlign: 'center' as const }}>
                                <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={payable} transactionNote={billNumber} size={80} />
                                <div style={{ fontSize: '9px' }}>{L('scan_to_pay')}</div>
                            </div>
                        )}
                        <div style={{ textAlign: 'center' as const, minWidth: '130px' }}>
                            <div style={{ fontWeight: 700 }}>{L('for_business')} {sellerName}</div>
                            {branding?.signatureUrl ? (
                                <img src={branding.signatureUrl} alt="" style={{ height: '46px', maxWidth: '150px', objectFit: 'contain', margin: '2px auto' }} />
                            ) : (
                                <div style={{ height: '30px' }} />
                            )}
                            <div style={{ borderTop: '1px solid #555', paddingTop: '3px' }}>{branding?.signatureName || L('authorised_signatory')}</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
