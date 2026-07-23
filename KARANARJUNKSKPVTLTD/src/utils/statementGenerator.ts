import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface StatementBranding {
    businessName: string;
    address?: string;
    gstin?: string;
}

export interface StatementSalesOrder {
    id: string;
    orderNumber?: string;
    invoiceNumber?: string;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    invoiceDate?: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
    retailerName?: string;
    invoiceType?: string;
}

export interface StatementPayment {
    id: string;
    paymentId?: string;
    amount: number;
    paymentDate?: string;
    paymentMethod?: string;
    notes?: string;
    orderNumber?: string;
    createdAt?: { toDate?: () => Date; seconds?: number };
}

interface StatementOptions {
    retailer: {
        name: string;
        atPost?: string;
        taluka?: string;
        district?: string;
        gstin?: string;
        number?: string;
    };
    salesOrders: StatementSalesOrder[];
    payments: StatementPayment[];
    branding: StatementBranding;
    fromDate: Date | null;
    toDate: Date | null;
}

function fmt(n: number) {
    return n === 0 ? '' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBalance(n: number) {
    if (n === 0) return '0.00';
    return Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resolveDate(so: StatementSalesOrder): Date {
    if (so.invoiceDate) return new Date(so.invoiceDate);
    if (so.createdAt?.toDate) return so.createdAt.toDate();
    if (so.createdAt?.seconds) return new Date(so.createdAt.seconds * 1000);
    return new Date(0);
}

function resolvePaymentDate(p: StatementPayment): Date {
    if (p.paymentDate) return new Date(p.paymentDate);
    if (p.createdAt?.toDate) return p.createdAt.toDate();
    if (p.createdAt?.seconds) return new Date(p.createdAt.seconds * 1000);
    return new Date(0);
}

function formatDateStr(d: Date): string {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type TxRow = {
    date: Date;
    dateStr: string;
    particulars: string;
    type: string;
    refNo: string;
    debit: number;
    credit: number;
};

export function generateRetailerStatement(opts: StatementOptions): void {
    const { retailer, salesOrders, payments, branding, fromDate, toDate } = opts;

    // Normalise range boundaries to start/end of day
    const rangeStart = fromDate ? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0) : null;
    const rangeEnd   = toDate   ? new Date(toDate.getFullYear(),   toDate.getMonth(),   toDate.getDate(),   23, 59, 59) : null;

    // Build full transaction list
    const allTx: TxRow[] = [];

    for (const so of salesOrders) {
        const d = resolveDate(so);
        const amount = Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
        if (amount === 0) continue;
        allTx.push({
            date: d,
            dateStr: formatDateStr(d),
            particulars: `Invoice${so.retailerName ? ` — ${so.retailerName}` : ''}`,
            type: so.invoiceType === 'B2B_GST' ? 'GST Invoice' : 'Invoice',
            refNo: so.orderNumber || so.invoiceNumber || so.id.slice(-8).toUpperCase(),
            debit: amount,
            credit: 0,
        });
    }

    for (const p of payments) {
        const d = resolvePaymentDate(p);
        const amount = Number(p.amount ?? 0);
        if (amount === 0) continue;
        allTx.push({
            date: d,
            dateStr: formatDateStr(d),
            particulars: p.notes || `Payment${p.paymentMethod ? ` (${p.paymentMethod})` : ''}`,
            type: 'Payment',
            refNo: p.paymentId || p.orderNumber || p.id.slice(-8).toUpperCase(),
            debit: 0,
            credit: amount,
        });
    }

    // Sort chronologically
    allTx.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate opening balance (sum of all transactions before rangeStart)
    let openingBalance = 0;
    for (const tx of allTx) {
        if (rangeStart && tx.date < rangeStart) {
            openingBalance += tx.debit - tx.credit;
        }
    }

    // Filter transactions to the selected period
    const periodTx = allTx.filter(tx => {
        if (rangeStart && tx.date < rangeStart) return false;
        if (rangeEnd   && tx.date > rangeEnd)   return false;
        return true;
    });

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const MARGIN = 14;
    let y = 14;

    // ── Retailer primary header ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(28, 120, 60);
    doc.text(retailer.name.toUpperCase(), MARGIN, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Ledger Account', MARGIN, y);
    y += 5;

    const addr = [retailer.atPost, retailer.taluka, retailer.district].filter(Boolean).join(' / ');
    if (addr) { doc.text(addr, MARGIN, y); y += 4.5; }

    const periodLabel = (rangeStart || rangeEnd)
        ? `${rangeStart ? formatDateStr(rangeStart) : 'All'} → ${rangeEnd ? formatDateStr(rangeEnd) : 'Today'}`
        : 'All Transactions';
    doc.text(`Statement Period: ${periodLabel}`, MARGIN, y);
    y += 5;

    // ── Document title + generated date (right-aligned) ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 30);
    doc.text('LEDGER STATEMENT', W - MARGIN, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${formatDateStr(new Date())}`, W - MARGIN, 22, { align: 'right' });
    if (branding.businessName) {
        doc.text(`Issued by: ${branding.businessName}`, W - MARGIN, 27, { align: 'right' });
    }

    // ── Divider ──
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 6;

    // ── Opening balance row ──
    const openingRows: (string | { content: string; styles?: object })[][] = [];
    openingRows.push([
        { content: '', styles: {} },
        { content: 'Opening Balance', styles: { fontStyle: 'bold' as const } },
        '',
        '',
        openingBalance > 0 ? fmt(openingBalance) : '',
        openingBalance < 0 ? fmt(-openingBalance) : '',
        { content: fmtBalance(openingBalance) + (openingBalance >= 0 ? ' Dr' : ' Cr'), styles: { fontStyle: 'bold' as const } },
    ]);

    // ── Transaction rows with running balance ──
    const txRows: (string | { content: string; styles?: object })[][] = [];
    let runBalance = openingBalance;

    for (const tx of periodTx) {
        runBalance += tx.debit - tx.credit;
        const balLabel = runBalance >= 0 ? fmtBalance(runBalance) + ' Dr' : fmtBalance(-runBalance) + ' Cr';
        txRows.push([
            tx.dateStr,
            tx.particulars,
            tx.type,
            tx.refNo,
            fmt(tx.debit),
            fmt(tx.credit),
            balLabel,
        ]);
    }

    // ── Totals row ──
    const totalDebit  = periodTx.reduce((s, t) => s + t.debit,  0);
    const totalCredit = periodTx.reduce((s, t) => s + t.credit, 0);
    const closingBalance = openingBalance + totalDebit - totalCredit;

    const totalRow: (string | { content: string; styles?: object })[][] = [[
        { content: '', styles: {} },
        { content: 'Closing Balance', styles: { fontStyle: 'bold' as const } },
        '',
        '',
        { content: fmt(totalDebit),   styles: { fontStyle: 'bold' as const } },
        { content: fmt(totalCredit),  styles: { fontStyle: 'bold' as const } },
        { content: fmtBalance(closingBalance) + (closingBalance >= 0 ? ' Dr' : ' Cr'), styles: { fontStyle: 'bold' as const, textColor: closingBalance > 0 ? [200, 30, 30] : [28, 140, 70] } },
    ]];

    // ── autoTable ──
    autoTable(doc, {
        startY: y,
        head: [['Date', 'Particulars', 'Type', 'Ref No', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)']],
        body: [...openingRows, ...txRows, ...totalRow],
        theme: 'striped',
        headStyles: {
            fillColor: [28, 120, 60],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left',
        },
        styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 22, halign: 'left' },
            1: { cellWidth: 'auto', halign: 'left' },
            2: { cellWidth: 24, halign: 'left' },
            3: { cellWidth: 26, halign: 'left' },
            4: { cellWidth: 22, halign: 'right' },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: 26, halign: 'right' },
        },
        margin: { left: MARGIN, right: MARGIN },
        didDrawPage: (data) => {
            // Footer on every page
            const pageCount = (doc.internal as any).getNumberOfPages();
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `${branding.businessName} | ${retailer.name} Ledger Statement | Page ${data.pageNumber} of ${pageCount}`,
                MARGIN,
                doc.internal.pageSize.getHeight() - 8,
            );
        },
    });

    // ── Summary block below table ──
    const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 20;
    const SY = finalY + 8;

    if (SY < doc.internal.pageSize.getHeight() - 30) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);

        const summaryItems = [
            ['Total Debit',  `Rs. ${totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
            ['Total Credit', `Rs. ${totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
            ['Outstanding',  `Rs. ${Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${closingBalance >= 0 ? '(Dr)' : '(Cr)'}`],
        ];

        let sx = MARGIN;
        for (const [label, value] of summaryItems) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(label, sx, SY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(closingBalance > 0 && label === 'Outstanding' ? 200 : 30, closingBalance > 0 && label === 'Outstanding' ? 30 : 30, 30);
            doc.text(value, sx, SY + 5);
            sx += 60;
        }
    }

    // ── Download ──
    const slug = retailer.name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    const dateStr = new Date().toISOString().slice(0, 10);
    doc.save(`Statement_${slug}_${dateStr}.pdf`);
}
