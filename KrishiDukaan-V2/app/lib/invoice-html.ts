import { formatCustomerAddress, normalizeOrderItems } from "../../types/order";
import type { OrderDoc } from "../../types/order";
import { loadInvoiceFontsBase64 } from "./invoice-fonts";

/**
 * Invoice as an HTML document, rendered to PDF by Chromium (lib/invoice-pdf.ts).
 *
 * This replaces the old jsPDF builder (utils/invoice-generator.ts), which could
 * not render Indic scripts: jsPDF has no OpenType shaping engine, so Devanagari
 * (Marathi/Hindi) and Gujarati conjuncts / vowel signs came out broken or blank
 * and ₹ fell back to "Rs.". Chromium shapes complex scripts correctly (HarfBuzz)
 * and subsets+embeds the bundled Noto fonts, so the PDF reads the same on every
 * device.
 *
 * The LAYOUT, branding, tables, GST handling, totals and amount-in-words are a
 * faithful port of the previous jsPDF invoice — the financial logic below is
 * copied verbatim so invoices reconcile exactly as before. Only the rendering
 * backend and the font coverage changed.
 */

// Brand colours (same hex values the jsPDF version used).
const PRIMARY = "#154212";
const SECONDARY = "#705a4c";
const LIGHT_BG = "#f8f7f3";
const BORDER = "#dcdcd7";
const TEXT_DARK = "#1e1e1e";
const TEXT_GREY = "#6e6e69";

// ── Money / numbers ─────────────────────────────────────────────────────────
function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

export function resolveInvoiceNumber(order: OrderDoc): string {
  return order.invoiceNumber ?? `INV-${order.id.slice(0, 8).toUpperCase()}`;
}

// ── HTML escaping ────────────────────────────────────────────────────────────
// Every piece of order-supplied text (names, addresses, product/variant names)
// goes through this so the original characters are preserved and the markup can
// never break, whatever the customer typed.
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function fontFaceCss(): string {
  const f = loadInvoiceFontsBase64();
  const face = (family: string, b64: string, weight: number) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
    `src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  return [
    face("KDNoto", f.sansRegular, 400),
    face("KDNoto", f.sansBold, 700),
    face("KDNoto", f.devRegular, 400),
    face("KDNoto", f.devBold, 700),
    face("KDNoto", f.gujRegular, 400),
    face("KDNoto", f.gujBold, 700),
  ].join("");
}

// ── Builder ──────────────────────────────────────────────────────────────────
export function buildInvoiceHtml(order: OrderDoc, seller?: InvoiceSellerInfo): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const invoiceNum = resolveInvoiceNumber(order);

  // ── Items ──────────────────────────────────────────────────────────────────
  const items = normalizeOrderItems(order.items as any);
  const bodyRows = items
    .map((item, i) => {
      const net = round2(item.lineTotal ?? item.price * item.qty);
      const applicable = !!(item.gstApplicable && item.gstRate);
      const included = applicable && item.gstIncluded !== false;
      const taxAmt = applicable ? round2((item.gstAmount ?? 0) * item.qty) : 0;
      const lineTotal = included ? net : round2(net + taxAmt);
      const name = item.variantUnit ? `${item.name} (${item.variantUnit})` : item.name;
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(name)}</td>
        <td class="r">${formatINR(item.price)}</td>
        <td class="c">${item.qty}</td>
        <td class="r">${formatINR(net)}</td>
        <td class="c">${applicable ? `${item.gstRate}%${included ? " (incl.)" : ""}` : "—"}</td>
        <td class="r">${applicable ? formatINR(taxAmt) : "—"}</td>
        <td class="r">${formatINR(lineTotal)}</td>
      </tr>`;
    })
    .join("");

  // ── Summary figures (read from the FINALIZED order — never recomputed) ───────
  const subtotal = order.subtotal ?? 0;

  const bd = order.deliveryBreakdown;
  const deliveryFree = bd?.free ?? false;
  const deliverySlab = bd?.slab ?? 0;
  const deliveryExtra = bd?.extra ?? 0;
  const deliveryWaived = bd?.waived ?? 0;
  const deliveryPaid = deliveryFree ? 0 : (order.deliveryCharge ?? (deliverySlab + deliveryExtra));

  const gstItems = items.filter((i) => i.gstApplicable && i.gstRate);
  const gstRates = Array.from(new Set(gstItems.map((i) => i.gstRate).filter(Boolean)));
  const rateLabel = gstRates.length === 1 ? `${gstRates[0]}%` : "";

  const totalGstStored = round2(order.totalGst ?? 0);
  let addedGst = round2(order.totalGstAdded ?? 0);
  if (order.totalGstAdded === undefined && totalGstStored > 0) {
    const noGstTotal = round2(subtotal + deliveryPaid);
    if ((order.grandTotal ?? noGstTotal) > noGstTotal + 0.01) addedGst = totalGstStored;
  }
  const includedGst = round2(totalGstStored - addedGst);
  const grand = order.grandTotal ?? round2(subtotal + deliveryPaid + addedGst);

  // ── Summary rows ─────────────────────────────────────────────────────────────
  const summaryRows: string[] = [
    `<div class="srow"><span>Product Subtotal</span><span>${formatINR(subtotal)}</span></div>`,
  ];
  if (addedGst > 0) {
    summaryRows.push(
      `<div class="srow"><span>GST${rateLabel ? ` (${rateLabel})` : ""}</span><span>+ ${formatINR(addedGst)}</span></div>`,
    );
  }
  if (deliveryFree) {
    const waived =
      deliveryWaived > 0
        ? `<span class="strike">${formatINR(deliveryWaived)}</span> <span class="free">FREE</span>`
        : `<span class="free">FREE</span>`;
    summaryRows.push(`<div class="srow"><span>Delivery Charge</span><span>${waived}</span></div>`);
  } else {
    summaryRows.push(
      `<div class="srow"><span>Delivery Charge</span><span>${formatINR(deliveryPaid)}</span></div>`,
    );
  }
  summaryRows.push(
    `<div class="srow total"><span>Invoice Value</span><span>${formatINR(grand)}</span></div>`,
  );

  // ── Notes under the summary ──────────────────────────────────────────────────
  const notes: string[] = [];
  if (includedGst > 0) {
    notes.push(
      `<div class="note accent">GST${rateLabel ? ` (${rateLabel} included)` : " (included)"}: ${formatINR(includedGst)}</div>`,
    );
    notes.push(
      `<div class="note">${
        addedGst > 0
          ? "Included GST is part of the product price. GST marked + is added on top."
          : "GST is included in the product price and is not charged separately."
      }</div>`,
    );
  }
  if (deliveryFree) {
    notes.push(
      `<div class="note accent">Free Delivery${deliveryWaived > 0 ? ` — ${formatINR(deliveryWaived)} waived` : ""}.</div>`,
    );
  } else if (deliveryExtra > 0) {
    notes.push(`<div class="note">Delivery: slab ${formatINR(deliverySlab)} + extra ${formatINR(deliveryExtra)}.</div>`);
  }
  if ((order.totalWeightKg ?? 0) > 0) {
    notes.push(`<div class="note">Est. weight: ${esc(order.totalWeightKg)} kg</div>`);
  }

  // ── Transaction / totals detail block ────────────────────────────────────────
  const paymentTxnId = order.payment?.razorpayPaymentId ?? order.payment?.razorpayOrderId ?? "—";
  const modeOfPayment = order.payment ? "Online (Razorpay)" : "Cash on Delivery";
  const dateTime = (() => {
    try {
      const d = (order.createdAt as any)?.toDate?.() ?? new Date(order.createdAt as string);
      return d.toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return formatDate(order.createdAt);
    }
  })();
  const gstNum = order.sellerGstNumber ?? seller?.gstin;

  const detailRows: [string, string, boolean?][] = [
    ["Amount in Words", amountInWords(grand)],
    ["Payment Transaction ID", String(paymentTxnId)],
    ["Date & Time", dateTime],
    ["Invoice Value", formatINR(grand), true],
    ["Product Value", formatINR(subtotal)],
    ["Mode of Payment", modeOfPayment],
    ...(gstNum ? ([["Seller GSTIN", String(gstNum)]] as [string, string][]) : []),
  ];

  // ── Info boxes ───────────────────────────────────────────────────────────────
  const sellerLines = [
    seller?.name ?? order.sellerName ?? "Seller",
    seller?.address ?? "",
    [seller?.city, seller?.state].filter(Boolean).join(", "),
    seller?.phone ? `Ph: ${seller.phone}` : "",
    (seller?.gstin ?? order.sellerGstNumber) ? `GSTIN: ${seller?.gstin ?? order.sellerGstNumber}` : "",
  ].filter(Boolean).slice(0, 5);

  const customerLines = [
    order.customerName,
    formatCustomerAddress(order.customerAddress),
    order.customerPhone ? `Ph: ${order.customerPhone}` : "",
  ].filter(Boolean);

  const infoLines = (lines: string[]) =>
    lines.map((l) => `<div class="iline">${esc(l)}</div>`).join("");

  const status = (order.status ?? "placed").replace(/_/g, " ").toUpperCase();
  const genDate = new Date().toLocaleDateString("en-IN");

  // ── Document ─────────────────────────────────────────────────────────────────
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
${fontFaceCss()}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{font-family:'KDNoto',sans-serif;color:${TEXT_DARK};-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4;margin:0;}
.page{width:210mm;min-height:297mm;position:relative;padding-bottom:16mm;}
.pad{padding:0 15mm;}
/* Header band */
.band{background:${PRIMARY};color:#fff;height:28mm;display:flex;align-items:center;justify-content:space-between;padding:0 15mm;}
.brand{font-size:16pt;font-weight:700;line-height:1;}
.brand small{display:block;font-size:8pt;font-weight:400;margin-top:2mm;}
.htitle{text-align:right;}
.htitle b{font-size:18pt;font-weight:700;}
.htitle small{display:block;font-size:8pt;font-weight:400;margin-top:2mm;}
/* Meta row */
.meta{display:flex;background:${LIGHT_BG};border:0.3mm solid ${BORDER};border-radius:2mm;margin-top:6mm;}
.meta>div{flex:1;padding:2.5mm 4mm;}
.meta .k{font-size:7pt;color:${TEXT_GREY};}
.meta .v{font-size:8.5pt;font-weight:700;margin-top:1mm;}
/* Info boxes */
.boxes{display:flex;gap:6mm;margin-top:6mm;}
.box{flex:1;background:${LIGHT_BG};border:0.3mm solid ${BORDER};border-radius:2mm;overflow:hidden;min-height:38mm;}
.box .bh{color:#fff;font-size:7pt;font-weight:700;padding:1.6mm 3mm;}
.box .bb{padding:2.5mm 3mm;font-size:8pt;line-height:1.5;}
.iline{word-break:break-word;}
/* Items table */
table{width:100%;border-collapse:collapse;margin-top:8mm;font-size:7.5pt;}
th{background:${PRIMARY};color:#fff;font-weight:700;padding:2.2mm;border:0.2mm solid ${PRIMARY};text-align:left;}
td{padding:2.2mm;border:0.2mm solid ${BORDER};vertical-align:top;word-break:break-word;}
tbody tr:nth-child(even){background:${LIGHT_BG};}
td.r,th.r{text-align:right;}
td.c,th.c{text-align:center;}
/* Summary */
.summary{width:75mm;margin-left:auto;margin-top:6mm;}
.srow{display:flex;justify-content:space-between;background:${LIGHT_BG};padding:1.8mm 3mm;font-size:7.5pt;}
.srow.total{background:${PRIMARY};color:#fff;font-size:9pt;font-weight:700;padding:2.5mm 3mm;}
.strike{text-decoration:line-through;color:${TEXT_GREY};}
.free{color:${PRIMARY};font-weight:700;}
.srow.total .free{color:#fff;}
.notes{width:75mm;margin-left:auto;margin-top:2mm;}
.note{font-size:6.5pt;color:${TEXT_GREY};line-height:1.4;margin-top:0.8mm;}
.note.accent{font-size:7pt;color:${PRIMARY};}
/* Detail block */
.detail{border:0.3mm solid ${BORDER};border-radius:2mm;margin-top:6mm;padding:2mm;}
.drow{display:flex;font-size:7.5pt;padding:0.8mm 0;}
.drow .dk{width:42mm;color:${TEXT_GREY};flex:none;}
.drow .dv{flex:1;}
.drow.bold .dv{font-weight:700;}
/* Footer */
.footer{position:absolute;bottom:0;left:0;right:0;height:12mm;background:${PRIMARY};color:#fff;font-size:7pt;display:flex;align-items:center;justify-content:space-between;padding:0 15mm;}
</style></head>
<body>
<div class="page">
  <div class="band">
    <div class="brand">KrishiDukan<small>Agricultural Marketplace</small></div>
    <div class="htitle"><b>TAX INVOICE</b><small>${esc(invoiceNum)}</small></div>
  </div>
  <div class="pad">
    <div class="meta">
      <div><div class="k">ORDER ID</div><div class="v">#${esc(order.id.slice(0, 8).toUpperCase())}</div></div>
      <div><div class="k">DATE</div><div class="v">${esc(formatDate(order.createdAt))}</div></div>
      <div><div class="k">STATUS</div><div class="v">${esc(status)}</div></div>
    </div>

    <div class="boxes">
      <div class="box"><div class="bh" style="background:${PRIMARY}">SOLD BY</div><div class="bb">${infoLines(sellerLines)}</div></div>
      <div class="box"><div class="bh" style="background:${SECONDARY}">BILL TO</div><div class="bb">${infoLines(customerLines)}</div></div>
    </div>

    <table>
      <thead><tr>
        <th class="c">Sr.</th><th>Product</th><th class="r">Unit Price</th><th class="c">Qty</th>
        <th class="r">Net Amount</th><th class="c">Tax Rate</th><th class="r">Tax Amount</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>

    <div class="summary">${summaryRows.join("")}</div>
    ${notes.length ? `<div class="notes">${notes.join("")}</div>` : ""}

    <div class="detail">
      ${detailRows
        .map(
          ([k, v, bold]) =>
            `<div class="drow${bold ? " bold" : ""}"><div class="dk">${esc(k)}</div><div class="dv">${esc(v)}</div></div>`,
        )
        .join("")}
    </div>
  </div>
  <div class="footer">
    <span>Generated by KrishiDukan · ${esc(genDate)}</span>
    <span>krishidukan.com</span>
  </div>
</div>
</body></html>`;
}
