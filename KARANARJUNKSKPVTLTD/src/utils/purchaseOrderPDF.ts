import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface POLineItem {
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
}

export interface POPDFOptions {
  poNumber?: string;
  internalId: string;
  date: string;
  status?: string;
  notes?: string;
  supplierName: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierGstin?: string;
  lines: POLineItem[];
  totalAmount: number;
}

const BUYER_NAME = 'KaranArjun Krushi Seva Kendra';
const MARGIN = 14;

function fmtINR(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function headerLine(doc: jsPDF, y: number, W: number): number {
  // Left: Buyer (our company)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(28, 100, 50);
  doc.text(BUYER_NAME.toUpperCase(), MARGIN, y);

  // Right: Document title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('PURCHASE ORDER', W - MARGIN, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, W - MARGIN, y, { align: 'right' });

  return y + 2;
}

function divider(doc: jsPDF, y: number, W: number): number {
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, y, W - MARGIN, y);
  return y + 5;
}

function metaBlock(doc: jsPDF, y: number, W: number, opts: POPDFOptions): number {
  const leftX = MARGIN;
  const rightX = W / 2 + 4;

  // Left column: PO details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('PO / Bill No.', leftX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.poNumber || '—', leftX + 28, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Internal ID', leftX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.internalId, leftX + 28, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Date', leftX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.date, leftX + 28, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Status', leftX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.status ? opts.status.charAt(0).toUpperCase() + opts.status.slice(1) : '—', leftX + 28, y);

  // Right column: Supplier details
  const supY0 = y - 15; // start same height as first row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('Supplier', rightX, supY0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(opts.supplierName, rightX + 22, supY0);

  let supY = supY0 + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);

  if (opts.supplierAddress) {
    const lines = doc.splitTextToSize(opts.supplierAddress, W / 2 - MARGIN - 24);
    doc.text(lines, rightX + 22, supY);
    supY += lines.length * 4.5;
  }
  if (opts.supplierPhone) {
    doc.text(`Ph: ${opts.supplierPhone}`, rightX + 22, supY);
    supY += 4.5;
  }
  if (opts.supplierEmail) {
    doc.text(opts.supplierEmail, rightX + 22, supY);
    supY += 4.5;
  }
  if (opts.supplierGstin) {
    doc.text(`GSTIN: ${opts.supplierGstin}`, rightX + 22, supY);
    supY += 4.5;
  }

  return Math.max(y, supY) + 5;
}

export function generatePurchaseOrderPDF(opts: POPDFOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  let y = MARGIN;
  y = headerLine(doc, y, W);
  y += 3;
  y = divider(doc, y, W);
  y = metaBlock(doc, y, W, opts);
  y = divider(doc, y, W);

  // Items table
  const tableRows = opts.lines.map(l => [
    l.description,
    l.quantity.toString(),
    l.unit || '—',
    fmtINR(l.rate),
    fmtINR(l.amount),
  ]);

  const totalQty = opts.lines.reduce((s, l) => s + l.quantity, 0);

  // Footer row
  const footerRow = [
    { content: 'Total', styles: { fontStyle: 'bold' as const } },
    { content: totalQty.toString(), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
    '',
    '',
    { content: fmtINR(opts.totalAmount), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
  ];

  autoTable(doc, {
    startY: y,
    head: [['Product / Description', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)']],
    body: tableRows.length > 0 ? [...tableRows, footerRow] : [[{ content: 'No line items recorded.', colSpan: 5, styles: { halign: 'center' as const, fontStyle: 'italic' as const } }]],
    theme: 'striped',
    headStyles: {
      fillColor: [28, 100, 50],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left' },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 20, halign: 'left' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: MARGIN, right: MARGIN },
    didDrawPage: (data) => {
      const pageCount = (doc.internal as any).getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `${BUYER_NAME} | Purchase Order ${opts.poNumber || opts.internalId} | Page ${data.pageNumber} of ${pageCount}`,
        MARGIN,
        doc.internal.pageSize.getHeight() - 8,
      );
    },
  });

  // Notes
  if (opts.notes) {
    const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 20;
    const notesY = finalY + 6;
    if (notesY < doc.internal.pageSize.getHeight() - 25) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text('Notes:', MARGIN, notesY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      const noteLines = doc.splitTextToSize(opts.notes, W - MARGIN * 2 - 12);
      doc.text(noteLines, MARGIN + 12, notesY);
    }
  }

  // Total amount summary box
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 20;
  const summaryY = finalY + (opts.notes ? 14 : 8);
  if (summaryY < doc.internal.pageSize.getHeight() - 20) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Total Amount:', W - MARGIN - 55, summaryY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(28, 100, 50);
    doc.text(`₹${fmtINR(opts.totalAmount)}`, W - MARGIN, summaryY, { align: 'right' });
  }

  const slug = opts.supplierName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const poSlug = (opts.poNumber || opts.internalId).replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`PO_${slug}_${poSlug}.pdf`);
}
