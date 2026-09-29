import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCustomerAddress, normalizeOrderItems } from "../../types/order";
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

// ── Amount in words (Indian numbering) ──────────────────────────────────────────
const WORD_ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const WORD_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n: number): string {
  if (n < 20) return WORD_ONES[n];
  return WORD_TENS[Math.floor(n / 10)] + (n % 10 ? " " + WORD_ONES[n % 10] : "");
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  let out = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) out += integerToWords(crore) + " Crore ";
  if (lakh) out += twoDigitsToWords(lakh) + " Lakh ";
  if (thousand) out += twoDigitsToWords(thousand) + " Thousand ";
  if (hundred) out += WORD_ONES[hundred] + " Hundred ";
  if (n) out += (out ? "" : "") + twoDigitsToWords(n) + " ";
  return out.trim();
}

/** e.g. 2200.5 → "Two Thousand Two Hundred Rupees and Fifty Paise Only" */
function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let s = `${integerToWords(rupees)} Rupee${rupees === 1 ? "" : "s"}`;
  if (paise > 0) s += ` and ${twoDigitsToWords(paise)} Paise`;
  return `${s} Only`;
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

function resolveInvoiceNumber(order: OrderDoc): string {
  return order.invoiceNumber ?? `INV-${order.id.slice(0, 8).toUpperCase()}`;
}

// ── Core builder — constructs the jsPDF document without saving or downloading ─
function buildInvoicePDF(order: OrderDoc, seller?: InvoiceSellerInfo): jsPDF {
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
  const invoiceNum = resolveInvoiceNumber(order);
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
    formatCustomerAddress(order.customerAddress),
    order.customerPhone ? `Ph: ${order.customerPhone}` : "",
  ];
  drawInfoBox(M + colW + 6, y, "BILL TO", customerLines, SECONDARY);

  y += boxH + 8;

  // ── Items table (GST invoice style) ────────────────────────────────────────
  // Per line, straight from the finalized order:
  //  - Net Amount = the customer-facing line value (price x qty).
  //  - Inclusive GST: Total = Net (GST already inside); Tax shown "(incl.)" for info.
  //  - Exclusive GST: Total = Net + Tax (GST added).
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const items = normalizeOrderItems(order.items as any);
  const tableHead = [[
    "Sr.", "Product", "Unit Price", "Qty", "Net Amount", "Tax Rate", "Tax Amount", "Total",
  ]];
  const tableBody = items.map((item, i) => {
    const net = round2(item.lineTotal ?? item.price * item.qty);
    const applicable = !!(item.gstApplicable && item.gstRate);
    const included = applicable && item.gstIncluded !== false;
    const taxAmt = applicable ? round2((item.gstAmount ?? 0) * item.qty) : 0;
    const lineTotal = included ? net : round2(net + taxAmt);
    const name = item.variantUnit ? `${item.name} (${item.variantUnit})` : item.name;
    return [
      String(i + 1),
      name,
      formatINR(item.price),
      String(item.qty),
      formatINR(net),
      applicable ? `${item.gstRate}%${included ? " (incl.)" : ""}` : "—",
      applicable ? formatINR(taxAmt) : "—",
      formatINR(lineTotal),
    ];
  });

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
      fontSize: 7.5,
      cellPadding: 2.2,
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: TEXT_DARK,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: "auto" },
      2: { halign: "right",  cellWidth: 22 },
      3: { halign: "center", cellWidth: 9 },
      4: { halign: "right",  cellWidth: 24 },
      5: { halign: "center", cellWidth: 20 },
      6: { halign: "right",  cellWidth: 23 },
      7: { halign: "right",  cellWidth: 24 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Summary box ─────────────────────────────────────────────────────────
  // Everything here is read from the FINALIZED order (the amounts the customer was
  // actually charged) — never recomputed from current product/slab settings.
  const summaryW = 75;
  const summaryX = W - M - summaryW;
  const subtotal = order.subtotal ?? 0;

  // Delivery — prefer the frozen breakdown; fall back to the flat charge for legacy orders.
  const bd = order.deliveryBreakdown;
  const deliveryFree = bd?.free ?? false;
  const deliverySlab = bd?.slab ?? 0;
  const deliveryExtra = bd?.extra ?? 0;
  const deliveryWaived = bd?.waived ?? 0;
  const deliveryPaid = deliveryFree ? 0 : (order.deliveryCharge ?? (deliverySlab + deliveryExtra));

  // GST — split into "added to total" vs. "already included", tied to the stored
  // totals so the invoice always reconciles with the actual grand total (new and
  // legacy orders alike).
  const gstItems = items.filter((i) => i.gstApplicable && i.gstRate);
  const gstRates = Array.from(new Set(gstItems.map((i) => i.gstRate).filter(Boolean)));
  const rateLabel = gstRates.length === 1 ? `${gstRates[0]}%` : "";

  const totalGstStored = round2(order.totalGst ?? 0);
  let addedGst = round2(order.totalGstAdded ?? 0);
  // Legacy orders pre-date `totalGstAdded` and charged GST on top. Infer that case
  // from the grand total so their invoices stay correct.
  if (order.totalGstAdded === undefined && totalGstStored > 0) {
    const noGstTotal = round2(subtotal + deliveryPaid);
    if ((order.grandTotal ?? noGstTotal) > noGstTotal + 0.01) addedGst = totalGstStored;
  }
  const includedGst = round2(totalGstStored - addedGst);

  const grand = order.grandTotal ?? round2(subtotal + deliveryPaid + addedGst);

  // Summary rows. `kind` lets the delivery row render "FREE" specially.
  type Row = { label: string; value: string; bold?: boolean; free?: boolean };
  const summaryRows: Row[] = [{ label: "Product Subtotal", value: formatINR(subtotal) }];
  if (addedGst > 0) {
    summaryRows.push({ label: `GST${rateLabel ? ` (${rateLabel})` : ""}`, value: `+ ${formatINR(addedGst)}` });
  }
  summaryRows.push(
    deliveryFree
      ? { label: "Delivery Charge", value: "FREE", free: true }
      : { label: "Delivery Charge", value: formatINR(deliveryPaid) },
  );
  summaryRows.push({ label: "Invoice Value", value: formatINR(grand), bold: true });

  let sy = y;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);

  summaryRows.forEach(({ label, value, bold, free }) => {
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
    const valRightX = summaryX + summaryW - 3;
    if (free && deliveryWaived > 0) {
      // "Rs.220.00  FREE" with the waived figure struck through.
      const waivedStr = formatINR(deliveryWaived);
      const full = `${waivedStr}  FREE`;
      const wFull = doc.getTextWidth(full);
      const wWaived = doc.getTextWidth(waivedStr);
      const startX = valRightX - wFull;
      doc.setTextColor(...TEXT_GREY);
      doc.text(full, valRightX, sy + rowH * 0.65, { align: "right" });
      // strike the waived amount
      doc.setDrawColor(...TEXT_GREY);
      doc.setLineWidth(0.4);
      doc.line(startX, sy + rowH * 0.5, startX + wWaived, sy + rowH * 0.5);
      // recolour "FREE" in brand green
      doc.setTextColor(...PRIMARY);
      doc.setFont("helvetica", "bold");
      doc.text("FREE", valRightX, sy + rowH * 0.65, { align: "right" });
    } else {
      doc.text(value, valRightX, sy + rowH * 0.65, { align: "right" });
    }
    sy += rowH;
  });

  // ── Notes under the summary ───────────────────────────────────────────────
  const noteX = summaryX + 3;
  let noteY = sy + 4;
  const note = (text: string, colour: [number, number, number] = TEXT_GREY, size = 6.5) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colour);
    const wrapped = doc.splitTextToSize(text, summaryW);
    doc.text(wrapped, noteX, noteY);
    noteY += wrapped.length * 3.2 + 1;
  };

  // GST-included disclosure (business default). Shows the amount inside the price.
  if (includedGst > 0) {
    note(`GST${rateLabel ? ` (${rateLabel} included)` : " (included)"}: ${formatINR(includedGst)}`, PRIMARY, 7);
    note("GST is included in the product price and is not charged separately.");
  }
  // Delivery detail: free (waived) or slab + extra breakdown.
  if (deliveryFree) {
    note(`Free Delivery${deliveryWaived > 0 ? ` — ${formatINR(deliveryWaived)} waived` : ""}.`, PRIMARY, 7);
  } else if (deliveryExtra > 0) {
    note(`Delivery: slab ${formatINR(deliverySlab)} + extra ${formatINR(deliveryExtra)}.`);
  }

  // Weight note
  if ((order.totalWeightKg ?? 0) > 0) {
    note(`Est. weight: ${order.totalWeightKg} kg`);
  }

  // ── Transaction / totals detail block (left column) ───────────────────────
  const paymentTxnId =
    order.payment?.razorpayPaymentId ?? order.payment?.razorpayOrderId ?? "—";
  const modeOfPayment = order.payment ? "Online (Razorpay)" : "Cash on Delivery";
  const dateTime = (() => {
    try {
      const d = (order.createdAt as any)?.toDate?.() ?? new Date(order.createdAt as string);
      return d.toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return formatDate(order.createdAt); }
  })();
  const gstNum = order.sellerGstNumber ?? seller?.gstin;

  const detailRows: [string, string][] = [
    ["Amount in Words", amountInWords(grand)],
    ["Payment Transaction ID", paymentTxnId],
    ["Date & Time", dateTime],
    ["Invoice Value", formatINR(grand)],
    ["Product Value", formatINR(subtotal)],
    ["Mode of Payment", modeOfPayment],
    ...(gstNum ? ([["Seller GSTIN", gstNum]] as [string, string][]) : []),
  ];

  let dy = Math.max(noteY, sy) + 6;
  const detailW = W - M * 2;
  doc.setDrawColor(...BORDER);
  doc.setFillColor(...LIGHT_BG);
  const detailBoxTop = dy - 2;
  // measure height (label line for words may wrap)
  const labelW = 42;
  detailRows.forEach(([label, value]) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_DARK);
    const wrapped = doc.splitTextToSize(value, detailW - labelW - 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_GREY);
    doc.text(label, M + 2, dy + 3.5);
    doc.setTextColor(...TEXT_DARK);
    doc.setFont("helvetica", label === "Invoice Value" ? "bold" : "normal");
    doc.text(wrapped, M + labelW, dy + 3.5);
    dy += Math.max(wrapped.length * 3.6, 5);
  });
  // frame around the detail block
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, detailBoxTop, detailW, dy - detailBoxTop + 1, 2, 2, "S");

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

  return doc;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the invoice as a Blob.
 * Used by the upload layer (Phase 2) to push the PDF to Firebase Storage.
 */
export function buildInvoiceBlob(order: OrderDoc, seller?: InvoiceSellerInfo): Blob {
  return buildInvoicePDF(order, seller).output("blob");
}

/**
 * Generates the invoice PDF and immediately triggers a browser download.
 * Fallback path used for legacy orders that pre-date Storage upload.
 */
export function downloadInvoicePDF(order: OrderDoc, seller?: InvoiceSellerInfo): void {
  buildInvoicePDF(order, seller).save(`${resolveInvoiceNumber(order)}.pdf`);
}

/**
 * Primary invoice action for every UI button.
 *
 * - invoice.storagePath present → open /invoice/{orderId}.
 *   The route handler proxies PDF bytes from Storage; Firebase URLs are never
 *   exposed to the client and the browser URL stays at krishidukan.com.
 * - No stored invoice (pre-Phase 2 orders) → fall back to client-side jsPDF generation.
 *
 * This is the only function UI components should call.
 * WhatsApp uses https://krishidukan.com/invoice/{orderId} directly.
 */
export function openInvoice(order: OrderDoc, seller?: InvoiceSellerInfo): void {
  if (order.invoice?.storagePath) {
    window.open(`/invoice/${order.id}`, "_blank", "noopener,noreferrer");
  } else {
    downloadInvoicePDF(order, seller);
  }
}
