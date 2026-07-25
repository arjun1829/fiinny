import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceTemplate, InvoiceTemplateBranding } from '../types/invoiceTemplate';

export interface InvoiceData {
    order?: any;           // single order
    orders?: any[];        // multiple orders (outstanding invoice)
    retailer: any;
    invoiceNumber?: string;
    isOutstanding?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────
function getFieldValue(field: any, data: any, isPdf = false): string {
    const raw = data[field.sourceKey];
    if (raw === undefined || raw === null || raw === '') return '—';
    if (field.isCurrency) return `${isPdf ? 'Rs.' : '₹'} ${Number(raw).toLocaleString('en-IN')}`;
    return String(raw);
}

function formatDate(d?: Date) {
    return (d || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * jsPDF's built-in fonts (Helvetica/Times/Courier) only support WinAnsi
 * (Latin-1) encoding — any character outside that range (₹, →, ·, smart
 * quotes, em/en dashes) corrupts the whole text run instead of just that
 * glyph. Swap the common offenders for ASCII equivalents before handing
 * strings to jsPDF/autoTable.
 */
function pdfSafe(s: string): string {
    return s
        .replace(/₹/g, 'Rs.')
        .replace(/→/g, '->')
        .replace(/[·•]/g, '-')
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, '-');
}

// ── PDF Generator ─────────────────────────────────────────────
export function generateInvoicePDF(
    template: InvoiceTemplate,
    branding: InvoiceTemplateBranding,
    data: InvoiceData
) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const { retailer, order, orders, isOutstanding } = data;
    const allOrders = orders || (order ? [order] : []);
    const invNo = data.invoiceNumber || `INV-${(order?.id || Date.now().toString()).substring(0, 6).toUpperCase()}`;
    const visibleFields = template.fields.filter(f => f.show).sort((a, b) => a.order - b.order);

    // ── Header ──
    doc.setFontSize(22);
    doc.setTextColor(40, 167, 69);
    doc.text(branding.businessName || 'Business', 14, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(branding.address || '', 14, 27, { maxWidth: 110 });

    if (branding.gstin || branding.licenseNumbers) {
        const items = [branding.gstin && `GSTIN: ${branding.gstin}`, branding.licenseNumbers && `LIC: ${branding.licenseNumbers}`].filter(Boolean);
        doc.text(items.join('   '), 14, 34);
    }

    if (branding.logoUrl) {
        try {
            doc.addImage(branding.logoUrl, 'PNG', 160, 10, 36, 18);
        } catch { /* skip if invalid */ }
    }

    let yOffset = 44;

    // ── Invoice Type Banner ──
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(isOutstanding ? 'OUTSTANDING STATEMENT' : template.name.toUpperCase(), 14, yOffset);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Invoice No: ${invNo}`, 14, yOffset + 7);
    doc.text(`Date: ${formatDate()}`, 14, yOffset + 12);

    // ── Billed To ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Billed To:', 125, yOffset);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(retailer?.name || '—', 125, yOffset + 6, { maxWidth: 70 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    if (retailer?.number) doc.text(`Ph: ${retailer.number}`, 125, yOffset + 11);
    const addr = [retailer?.atPost, retailer?.taluka, retailer?.district].filter(Boolean).join(', ');
    if (addr) doc.text(addr, 125, yOffset + 16, { maxWidth: 70 });
    if (retailer?.gstin) doc.text(`GSTIN: ${retailer.gstin}`, 125, yOffset + 22);

    yOffset += 34;

    // ── Table ──
    const head = visibleFields.map(f => f.label);
    const body = allOrders.map(ord =>
        visibleFields.map(f => getFieldValue(f, ord, true))
    );

    autoTable(doc, {
        startY: yOffset,
        head: [head],
        body,
        theme: 'grid',
        headStyles: { fillColor: [40, 167, 69], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 9 },
        columnStyles: { [visibleFields.length - 1]: { fontStyle: 'bold' } }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || yOffset + 20;

    // ── Totals ──
    const totalAmt = allOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    const label = isOutstanding ? 'TOTAL OUTSTANDING' : 'GRAND TOTAL';
    doc.text(`${label}: Rs. ${totalAmt.toLocaleString('en-IN')}`, 190, finalY + 14, { align: 'right' });

    // ── Bank Details ──
    if (branding.bankDetails) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        const bankLines = doc.splitTextToSize(`Bank Details:\n${branding.bankDetails}`, 90);
        doc.text(bankLines, 14, finalY + 14);
    }

    // ── Terms ──
    if (branding.terms) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        const termLines = doc.splitTextToSize(`Terms & Conditions:\n${branding.terms}`, 182);
        doc.text(termLines, 14, finalY + 30);
    }

    // ── Signatory ──
    if (branding.signatureName) {
        const sigY = Math.max(finalY + 50, 260);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.text('Authorised Signatory', 190, sigY - 4, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(branding.signatureName, 190, sigY + 1, { align: 'right' });
        doc.line(134, sigY - 5, 190, sigY - 5);
    }

    return doc;
}

export function downloadInvoicePDF(
    template: InvoiceTemplate,
    branding: InvoiceTemplateBranding,
    data: InvoiceData,
    filename?: string
) {
    const doc = generateInvoicePDF(template, branding, data);
    const name = filename || `Invoice_${data.retailer?.name?.replace(/\s/g, '_') || 'receipt'}_${Date.now()}.pdf`;
    doc.save(name);
    return name;
}

// ── Thermal 80mm Print ────────────────────────────────────────
export function printThermalInvoice(
    template: InvoiceTemplate,
    branding: InvoiceTemplateBranding,
    data: InvoiceData
) {
    const { retailer, order, orders, isOutstanding } = data;
    const allOrders = orders || (order ? [order] : []);
    const visibleFields = template.fields.filter(f => f.show).sort((a, b) => a.order - b.order);
    const totalAmt = allOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const invNo = data.invoiceNumber || `INV-${(order?.id || Date.now().toString()).substring(0, 6).toUpperCase()}`;

    const rows = allOrders.map(ord =>
        `<tr>${visibleFields.map(f => `<td style="padding:2px 4px;${f.bold ? 'font-weight:bold;' : ''}">${getFieldValue(f, ord)}</td>`).join('')}</tr>`
    ).join('');

    const win = window.open('', '_blank', 'width=340,height=700');
    if (!win) { alert('Pop-up blocked! Please allow pop-ups for this site.'); return; }

    win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Print Invoice</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; width: 80mm; max-width: 80mm; padding: 6px 8px; color: #000; background: #fff; font-size: 11px; }
    h2  { text-align: center; font-size: 14px; margin-bottom: 2px; }
    .sub { text-align: center; font-size: 9px; color: #444; margin-bottom: 4px; }
    .info { font-size: 10px; margin: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10px; }
    th { border-bottom: 1px solid #000; text-align: left; padding: 2px 4px; font-size: 9px; }
    .total { border-top: 2px solid #000; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; }
    .bank  { font-size: 8px; margin-top: 6px; color: #333; }
    .footer{ text-align: center; margin-top: 10px; font-size: 9px; border-top: 1px dashed #000; padding-top: 6px; }
    .sig   { margin-top: 16px; text-align: right; font-size: 9px; border-top: 1px solid #000; padding-top: 4px; display: inline-block; min-width: 100px; }
    @media print { body { width: 80mm; } button { display: none; } }
  </style>
</head>
<body>
  <h2>${branding.thermalHeader || branding.businessName}</h2>
  <div class="sub">${branding.address || ''}</div>
  ${branding.gstin ? `<div class="sub">GSTIN: ${branding.gstin}</div>` : ''}

  <div class="info">
    <div><b>${isOutstanding ? 'OUTSTANDING STATEMENT' : template.name}</b></div>
    <div>Inv No: ${invNo}</div>
    <div>Date: ${formatDate()}</div>
    <div>Bill To: <b>${retailer?.name || '—'}</b></div>
    ${retailer?.number ? `<div>Ph: ${retailer.number}</div>` : ''}
  </div>

  <table>
    <thead><tr>${visibleFields.map(f => `<th>${f.label}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total">
    <span>${isOutstanding ? 'OUTSTANDING' : 'TOTAL'}</span>
    <span>₹ ${totalAmt.toLocaleString('en-IN')}</span>
  </div>

  ${branding.bankDetails ? `<div class="bank">Bank: ${branding.bankDetails.replace(/\n/g, ' | ')}</div>` : ''}

  <div class="footer">
    ${branding.thermalFooter || '*** Thank You! Visit Again ***'}<br/>
    ${branding.businessName}
    ${branding.signatureName ? `<div class="sig">Auth. Sig: ${branding.signatureName}</div>` : ''}
  </div>

  <script>setTimeout(() => { window.print(); }, 600);</script>
</body>
</html>`);
    win.document.close();
}

// ── Supplier Payment Receipt ────────────────────────────────────
export interface SupplierPaymentData {
    paymentId?: string;
    amount: number;
    paymentDate?: string;
    paymentMethod?: string;
    accountDetails?: { accountName?: string; transactionRef?: string };
    bankDetails?: {
        holderName?: string;
        beneficiaryName?: string;
        payerAccountNumber?: string;
        beneficiaryAccountNumber?: string;
        ifscCode?: string;
        cbsTransactionId?: string;
        statusRemark?: string;
    };
    notes?: string;
    linkedInvoiceNumber?: string;
}

export interface SupplierLite {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    outstandingBalance?: number;
}

export function generatePaymentReceiptPDF(
    branding: InvoiceTemplateBranding,
    payment: SupplierPaymentData,
    supplier: SupplierLite,
) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Header ──
    doc.setFontSize(22);
    doc.setTextColor(40, 167, 69);
    doc.text(branding.businessName || 'Business', 14, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(branding.address || '', 14, 27, { maxWidth: 110 });

    if (branding.gstin || branding.licenseNumbers) {
        const items = [branding.gstin && `GSTIN: ${branding.gstin}`, branding.licenseNumbers && `LIC: ${branding.licenseNumbers}`].filter(Boolean);
        doc.text(items.join('   '), 14, 34);
    }

    if (branding.logoUrl) {
        try { doc.addImage(branding.logoUrl, 'PNG', 160, 10, 36, 18); } catch { /* skip if invalid */ }
    }

    let y = 44;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('PAYMENT RECEIPT', 14, y);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Receipt No: ${payment.paymentId || '-'}`, 14, y + 7);
    doc.text(`Date: ${payment.paymentDate ? formatDate(new Date(payment.paymentDate)) : formatDate()}`, 14, y + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Paid To:', 125, y);
    doc.text(pdfSafe(supplier.name || '-'), 125, y + 6, { maxWidth: 70 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    let sy = y + 11;
    if (supplier.phone) { doc.text(`Ph: ${supplier.phone}`, 125, sy); sy += 5; }
    if (supplier.address) { doc.text(pdfSafe(supplier.address), 125, sy, { maxWidth: 70 }); sy += 5; }
    if (supplier.gstin) { doc.text(`GSTIN: ${supplier.gstin}`, 125, sy); }

    y += 32;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, 196, y);
    y += 10;

    // ── Amount ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(40, 167, 69);
    doc.text(`Amount Paid: Rs. ${Number(payment.amount || 0).toLocaleString('en-IN')}`, 14, y);
    y += 12;

    // ── Details table ──
    const accountDetails = payment.accountDetails;
    const rows: [string, string][] = [
        ['Payment Method', payment.paymentMethod || 'Cash'],
    ];
    if (accountDetails?.accountName) rows.push([payment.paymentMethod === 'Cheque' ? 'Bank Name' : 'Account / Bank', pdfSafe(accountDetails.accountName)]);
    if (accountDetails?.transactionRef) rows.push([payment.paymentMethod === 'Cheque' ? 'Cheque No.' : 'Transaction Ref (UTR)', pdfSafe(accountDetails.transactionRef)]);

    const bd = payment.bankDetails;
    if (bd?.holderName) rows.push(['Payer Account Holder', pdfSafe(bd.holderName)]);
    if (bd?.payerAccountNumber) rows.push(['Payer A/c Number', pdfSafe(bd.payerAccountNumber)]);
    if (bd?.beneficiaryName) rows.push(['Beneficiary Name', pdfSafe(bd.beneficiaryName)]);
    if (bd?.beneficiaryAccountNumber) rows.push(['Beneficiary A/c No.', pdfSafe(bd.beneficiaryAccountNumber)]);
    if (bd?.ifscCode) rows.push(['IFSC Code', pdfSafe(bd.ifscCode)]);
    if (bd?.cbsTransactionId) rows.push(['CBS Transaction ID', pdfSafe(bd.cbsTransactionId)]);
    if (bd?.statusRemark) rows.push(['Status / Remark', pdfSafe(bd.statusRemark)]);

    if (payment.linkedInvoiceNumber) rows.push(['Applied Against', pdfSafe(payment.linkedInvoiceNumber)]);
    if (payment.notes) rows.push(['Notes', pdfSafe(payment.notes)]);

    autoTable(doc, {
        startY: y,
        body: rows,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 1.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: [80, 80, 80] }, 1: { textColor: [0, 0, 0] } },
        margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || y + 20;

    if (typeof supplier.outstandingBalance === 'number') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Outstanding Balance After This Payment: Rs. ${supplier.outstandingBalance.toLocaleString('en-IN')}`, 14, finalY + 10);
    }

    if (branding.signatureName) {
        const sigY = Math.max(finalY + 40, 250);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.text('Authorised Signatory', 190, sigY - 4, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(branding.signatureName, 190, sigY + 1, { align: 'right' });
        doc.line(134, sigY - 5, 190, sigY - 5);
    }

    return doc;
}

export function downloadPaymentReceiptPDF(
    branding: InvoiceTemplateBranding,
    payment: SupplierPaymentData,
    supplier: SupplierLite,
) {
    const doc = generatePaymentReceiptPDF(branding, payment, supplier);
    const name = `Receipt_${(supplier.name || 'supplier').replace(/\s/g, '_')}_${payment.paymentId || Date.now()}.pdf`;
    doc.save(name);
    return name;
}

// ── Supplier Account Statement ──────────────────────────────────
export interface StatementRow {
    date: any;
    particulars: string;
    debit: number;
    credit: number;
    balance: number;
}

export function generateSupplierStatementPDF(
    branding: InvoiceTemplateBranding,
    supplier: SupplierLite & { totalInvoiced?: number; totalPaid?: number },
    rows: StatementRow[],
    formatRowDate: (v: any) => string,
) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(22);
    doc.setTextColor(40, 167, 69);
    doc.text(branding.businessName || 'Business', 14, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(branding.address || '', 14, 27, { maxWidth: 110 });

    if (branding.gstin || branding.licenseNumbers) {
        const items = [branding.gstin && `GSTIN: ${branding.gstin}`, branding.licenseNumbers && `LIC: ${branding.licenseNumbers}`].filter(Boolean);
        doc.text(items.join('   '), 14, 34);
    }

    if (branding.logoUrl) {
        try { doc.addImage(branding.logoUrl, 'PNG', 160, 10, 36, 18); } catch { /* skip if invalid */ }
    }

    let y = 44;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('STATEMENT OF ACCOUNT', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Party: ${pdfSafe(supplier.name || '-')}`, 14, y + 7);
    doc.text(`Generated: ${formatDate()}`, 14, y + 12);
    if (supplier.phone) doc.text(`Ph: ${supplier.phone}`, 14, y + 17);

    y += 26;

    autoTable(doc, {
        startY: y,
        head: [['Date', 'Particulars', 'Debit', 'Credit', 'Balance']],
        body: rows.map(r => [
            formatRowDate(r.date),
            pdfSafe(r.particulars),
            r.debit ? r.debit.toLocaleString('en-IN') : '',
            r.credit ? r.credit.toLocaleString('en-IN') : '',
            r.balance.toLocaleString('en-IN'),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [40, 167, 69], fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || y + 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Invoiced: Rs. ${(supplier.totalInvoiced ?? 0).toLocaleString('en-IN')}`, 14, finalY + 10);
    doc.text(`Total Paid: Rs. ${(supplier.totalPaid ?? 0).toLocaleString('en-IN')}`, 14, finalY + 16);
    doc.setTextColor(supplier.outstandingBalance && supplier.outstandingBalance > 0 ? 220 : 40, supplier.outstandingBalance && supplier.outstandingBalance > 0 ? 60 : 167, supplier.outstandingBalance && supplier.outstandingBalance > 0 ? 60 : 69);
    doc.text(`Outstanding Payable: Rs. ${(supplier.outstandingBalance ?? 0).toLocaleString('en-IN')}`, 14, finalY + 22);

    return doc;
}

export function downloadSupplierStatementPDF(
    branding: InvoiceTemplateBranding,
    supplier: SupplierLite & { totalInvoiced?: number; totalPaid?: number },
    rows: StatementRow[],
    formatRowDate: (v: any) => string,
) {
    const doc = generateSupplierStatementPDF(branding, supplier, rows, formatRowDate);
    const name = `Statement_${(supplier.name || 'supplier').replace(/\s/g, '_')}_${Date.now()}.pdf`;
    doc.save(name);
    return name;
}

// ── Email Opener ──────────────────────────────────────────────
export function emailInvoice(
    template: InvoiceTemplate,
    branding: InvoiceTemplateBranding,
    data: InvoiceData
): string {
    const { retailer, order, orders, isOutstanding } = data;
    const allOrders = orders || (order ? [order] : []);
    const totalAmt = allOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const invNo = data.invoiceNumber || `INV-${(order?.id || Date.now().toString()).substring(0, 6).toUpperCase()}`;

    const subject = encodeURIComponent(
        isOutstanding
            ? `Outstanding Statement from ${branding.businessName}`
            : `Invoice ${invNo} from ${branding.businessName}`
    );

    const lines = [
        `Dear ${retailer?.name || 'Customer'},`,
        '',
        isOutstanding
            ? `Please find below your outstanding dues amounting to ₹ ${totalAmt.toLocaleString('en-IN')}.`
            : `Please find below the invoice details for your recent purchase.`,
        '',
        `Invoice No: ${invNo}`,
        `Date: ${formatDate()}`,
        '',
        ...allOrders.map(o => `• ${o.productName || '—'} — ${o.quantity} ${o.unit || ''} — ₹ ${Number(o.amount).toLocaleString('en-IN')}`),
        '',
        `Total: ₹ ${totalAmt.toLocaleString('en-IN')}`,
        '',
        branding.bankDetails ? `Payment Details:\n${branding.bankDetails}` : '',
        '',
        'Thank you for your business!',
        '',
        `Regards,`,
        branding.businessName,
        branding.signatureName || '',
    ].filter(l => l !== null);

    const body = encodeURIComponent(lines.join('\n'));
    const email = retailer?.email || '';

    // Also download PDF so user can attach
    downloadInvoicePDF(template, branding, data);

    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    return email;
}
