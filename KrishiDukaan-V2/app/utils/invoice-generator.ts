import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrderDoc } from "../../types/order";

// Brand colours
const PRIMARY   = [21,  66,  18]  as [number, number, number]; // #154212
const SECONDARY = [112, 90,  76]  as [number, number, number]; // #705a4c
const LIGHT_BG  = [248, 247, 243] as [number, number, number]; // off-white
const BORDER    = [220, 220, 215] as [number, number, number];
const TEXT_DARK = [30,  30,  30]  as [number, number, number];
const TEXT_GREY = [110, 110, 105] as [number, number, number];

function formatINR(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(createdAt: unknown): string {
  try {
    const d = (createdAt as any)?.toDate?.() ?? new Date(createdAt as string);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }
}

export interface InvoiceSellerInfo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  gstin?: string;
}

export function generateInvoicePDF(order: OrderDoc, seller?: InvoiceSellerInfo): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 15; // margin
  let y = M;

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("KrishiDukan", M, 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Agricultural Marketplace", M, 16.5);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", W - M, 13, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const invoiceNum = order.invoiceNumber ?? `INV-${order.id.slice(0, 8).toUpperCase()}`;
  doc.text(invoiceNum, W - M, 20, { align: "right" });

  y = 35;

  // ── Invoice meta row ────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, y, W - M * 2, 14, 2, 2, "FD");

  doc.setTextColor(...TEXT_GREY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const cols3 = (W - M * 2) / 3;

  const metaItems = [
    ["ORDER ID", `#${order.id.slice(0, 8).toUpperCase()}`],
    ["DATE", formatDate(order.createdAt)],
    ["STATUS", (order.status ?? "placed").replace(/_/g, " ").toUpperCase()],
  ] as const;

  metaItems.forEach(([label, value], i) => {
    const x = M + i * cols3 + 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_GREY);
    doc.text(label, x, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_DARK);
    doc.setFontSize(8.5);
    doc.text(value, x, y + 10);
    doc.setFontSize(7);
  });

  y += 20;

  // ── Seller + Customer columns ────────────────────────────────────────────
  const colW = (W - M * 2 - 6) / 2;
  const boxH = 38;

  const drawInfoBox = (
    bx: number,
    by: number,
    title: string,
    lines: string[],
    accent: [number, number, number],
  ) => {
    doc.setFillColor(...LIGHT_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(bx, by, colW, boxH, 2, 2, "FD");

    doc.setFillColor(...accent);
    doc.rect(bx, by, colW, 6, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title, bx + 3, by + 4.2);

    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let ly = by + 11;
    lines.filter(Boolean).slice(0, 5).forEach((line) => {
      const wrapped = doc.splitTextToSize(line, colW - 6);
      doc.text(wrapped, bx + 3, ly);
      ly += wrapped.length * 4.5;
    });
  };

  // Seller box
  const sellerLines = [
    seller?.name ?? order.sellerName ?? "Seller",
    seller?.address ?? "",
    [seller?.city, seller?.state].filter(Boolean).join(", "),
    seller?.phone ? `Ph: ${seller.phone}` : "",
    (seller?.gstin ?? order.sellerGstNumber) ? `GSTIN: ${seller?.gstin ?? order.sellerGstNumber}` : "",
  ];
  drawInfoBox(M, y, "SOLD BY", sellerLines, PRIMARY);

  // Customer box
  const customerLines = [
    order.customerName,
    order.customerAddress,
    order.customerPhone ? `Ph: ${order.customerPhone}` : "",
  ];
  drawInfoBox(M + colW + 6, y, "BILL TO", customerLines, SECONDARY);

  y += boxH + 8;

  // ── Items table ──────────────────────────────────────────────────────────
  const tableHead = [["#", "Product", "Package", "Qty", "Unit Price", "Total"]];
  const tableBody = (order.items ?? []).map((item, i) => [
    String(i + 1),
    item.name,
    item.variantUnit ?? "—",
    String(item.qty),
    formatINR(item.price),
    formatINR(item.lineTotal ?? item.price * item.qty),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: tableHead,
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: PRIMARY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: TEXT_DARK,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 22 },
      3: { halign: "center", cellWidth: 10 },
      4: { halign: "right",  cellWidth: 28 },
      5: { halign: "right",  cellWidth: 28 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Summary box ─────────────────────────────────────────────────────────
  const summaryW = 75;
  const summaryX = W - M - summaryW;
  const subtotal = order.subtotal ?? 0;
  const delivery = order.deliveryCharge ?? 0;
  const grand   = order.grandTotal    ?? subtotal + delivery;

  const summaryRows: [string, string, boolean?][] = [
    ["Product Subtotal", formatINR(subtotal)],
    ["Delivery Charge",  formatINR(delivery)],
    ["Grand Total",       formatINR(grand), true],
  ];

  let sy = y;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);

  summaryRows.forEach(([label, value, bold]) => {
    if (bold) {
      doc.setFillColor(...PRIMARY);
      doc.rect(summaryX, sy, summaryW, 9, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(summaryX, sy, summaryW, 7, "F");
      doc.setTextColor(...TEXT_DARK);
      doc.setFont("helvetica", "normal");
    }
    const rowH = bold ? 9 : 7;
    doc.setFontSize(bold ? 9 : 7.5);
    doc.text(label, summaryX + 3, sy + rowH * 0.65);
    doc.text(value, summaryX + summaryW - 3, sy + rowH * 0.65, { align: "right" });
    sy += rowH;
  });

  // Weight note
  if ((order.totalWeightKg ?? 0) > 0) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_GREY);
    doc.text(`Est. weight: ${order.totalWeightKg} kg`, summaryX + 3, sy + 4);
  }

  // GST note
  const gstNum = order.sellerGstNumber ?? seller?.gstin;
  if (gstNum) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_GREY);
    doc.text(`GST: ${gstNum}`, M, sy + 4);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, pageH - 12, W, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Generated by KrishiDukan · ${new Date().toLocaleDateString("en-IN")}`,
    M,
    pageH - 4.5,
  );
  doc.text("krishidukan.com", W - M, pageH - 4.5, { align: "right" });

  // ── Save ─────────────────────────────────────────────────────────────────
  doc.save(`${invoiceNum}.pdf`);
}
