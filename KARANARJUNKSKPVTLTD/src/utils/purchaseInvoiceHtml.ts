/**
 * The Purchase Invoice exactly as SupplierInvoicePage prints it, rebuilt from a
 * saved supplierInvoices doc so a month of bills can be exported without
 * opening each one.
 *
 * KEEP IN SYNC with the `.si-print-only` block in SupplierInvoicePage.tsx —
 * the markup below mirrors it element for element, and both use
 * PURCHASE_PRINT_CSS so the styling cannot drift.
 */
import type { InvoiceTemplateBranding } from '../types/invoiceTemplate';
import { fmtINR } from './gstCalculator';

/** Print stylesheet shared with SupplierInvoicePage's Print button. */
export const PURCHASE_PRINT_CSS = `
  @page { size: A3 landscape; margin: 8mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; box-sizing: border-box; }
  html, body { background: #fff !important; color: #000 !important; margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 8pt; }
  .si-card { box-shadow: none !important; border: none !important; border-radius: 0 !important; background: #fff !important; color: #000 !important; max-width: 100% !important; }
  .no-print { display: none !important; }
  .si-print-only { display: block !important; }
  input, select, textarea, button { display: none !important; }
  .pi-header { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border: 1px solid #000; margin-bottom: 6px; }
  .pi-header-col { padding: 6px 8px; }
  .pi-header-col:first-child { border-right: 1px solid #ccc; }
  .pi-meta { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid #000; margin-bottom: 6px; }
  .pi-meta > div { padding: 4px 6px; border-right: 1px solid #ccc; }
  .pi-meta > div:last-child { border-right: none; }
  .pi-label { font-size: 7pt; color: #666; text-transform: uppercase; }
  .pi-val { font-weight: 700; font-size: 8.5pt; }
  .pi-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .pi-table th, .pi-table td { border: 1px solid #999; padding: 2px 4px; font-size: 7.5pt; vertical-align: middle; }
  .pi-table th { background: #f0f0f0; font-weight: 700; text-align: center; }
  .pi-table td.r { text-align: right; }
  .pi-table td.c { text-align: center; }
  .pi-table tfoot td { background: #e8e8e8; font-weight: 700; }
  .pi-totals { margin-top: 6px; display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; border: 1px solid #000; padding: 6px; }
  .pi-tot-item { text-align: center; }
  .pi-tot-label { font-size: 6.5pt; color: #555; }
  .pi-tot-val { font-size: 9pt; font-weight: 700; }
`;

// Same helpers SupplierInvoicePage uses.
const fmtDateDMY = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return (y && m && d) ? `${d}/${m}/${y}` : s; };
const n = (s: string | number | undefined) => parseFloat(String(s ?? 0)) || 0;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Current lines carry productName / rateWithoutGst / amountWithoutGst /
 * gstAmount / finalAmount. Bills recorded with the older purchase form carry
 * description / batchNo / expDate / mfgCompany / rate / amount instead — map
 * those onto the same columns so they don't print blank.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLine(l: Record<string, any>) {
    const gst = n(l.gstPct);
    const rateWo = l.rateWithoutGst != null ? n(l.rateWithoutGst)
        : l.rateWithGst != null ? r2(n(l.rateWithGst) / (1 + gst / 100))
        : n(l.rate);
    const qty = n(l.quantity);
    const amountWithoutGst = l.amountWithoutGst != null ? n(l.amountWithoutGst) : (l.amount != null ? n(l.amount) : r2(rateWo * qty));
    const gstAmount = l.gstAmount != null ? n(l.gstAmount) : r2(amountWithoutGst * gst / 100);
    return {
        productName: l.productName ?? l.description ?? '',
        manufacturer: l.manufacturer ?? l.packaging ?? l.mfgCompany ?? '',
        batchNumber: l.batchNumber ?? l.batchNo ?? '',
        expiryDate: String(l.expiryDate ?? l.expDate ?? ''),
        rateWithoutGst: rateWo,
        gstPct: gst,
        rateWithGst: l.rateWithGst != null ? n(l.rateWithGst) : r2(rateWo * (1 + gst / 100)),
        quantity: qty,
        mrp: l.mrp, ptr: l.ptr ?? l.retailerRate, salesRate: l.salesRate,
        amountWithoutGst,
        gstAmount,
        finalAmount: l.finalAmount != null ? n(l.finalAmount) : r2(amountWithoutGst + gstAmount),
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPurchaseInvoiceHtml(b: Record<string, any>, branding: Partial<InvoiceTemplateBranding> | null | undefined): string {
    const lines = (Array.isArray(b.lines) ? b.lines : []).map(normalizeLine);
    const companyName = branding?.businessName || 'Your Business Name';
    const totalQty = n(b.totalQty) || lines.reduce((s, l) => s + n(l.quantity), 0);
    // Older bills stored doc-level taxableValue / totalTax / netAmount instead.
    const totWo = b.totalAmountWithoutGst ?? b.taxableValue ?? lines.reduce((s, l) => s + n(l.amountWithoutGst), 0);
    const totGst = b.totalGst ?? b.totalTax ?? lines.reduce((s, l) => s + n(l.gstAmount), 0);
    const totFinal = b.totalFinalAmount ?? b.netAmount ?? lines.reduce((s, l) => s + n(l.finalAmount), 0);

    const rows = lines.map((l, i) => `
              <tr>
                <td class="c">${i + 1}</td>
                <td>${esc(l.productName)}</td>
                <td class="c">${esc(l.manufacturer)}</td>
                <td class="c">${esc(l.batchNumber)}</td>
                <td class="c">${esc(fmtDateDMY(l.expiryDate) || '—')}</td>
                <td class="r">${n(l.rateWithoutGst).toFixed(2)}</td>
                <td class="c">${esc(l.gstPct)}%</td>
                <td class="r">${n(l.rateWithGst).toFixed(2)}</td>
                <td class="c">${n(l.quantity)}</td>
                <td class="r">${l.mrp ? n(l.mrp).toFixed(2) : '—'}</td>
                <td class="r">${l.ptr ? n(l.ptr).toFixed(2) : '—'}</td>
                <td class="r">${l.salesRate ? n(l.salesRate).toFixed(2) : '—'}</td>
                <td class="r">${fmtINR(n(l.amountWithoutGst))}</td>
                <td class="r">${fmtINR(n(l.gstAmount))}</td>
                <td class="r">${fmtINR(n(l.finalAmount))}</td>
              </tr>`).join('');

    const body = `
<div class="si-card">
  <div class="si-print-only">
    <h2 style="text-align:center;margin:0 0 6px;font-size:13pt">Purchase Invoice</h2>

    <div class="pi-header">
      <div class="pi-header-col">
        <div class="pi-label">Supplier</div>
        <div class="pi-val">${esc(b.supplierName)}</div>
        ${b.supplierAddress ? `<div>${esc(b.supplierAddress)}</div>` : ''}
        ${b.supplierGstin ? `<div>GSTIN: ${esc(b.supplierGstin)}</div>` : ''}
        ${b.supplierPhone ? `<div>${esc(b.supplierPhone)}</div>` : ''}
        ${b.supplierState ? `<div>State: ${esc(b.supplierState)}</div>` : ''}
      </div>
      <div class="pi-header-col">
        <div class="pi-label">Buyer</div>
        <div class="pi-val">${esc(companyName)}</div>
        ${branding?.address ? `<div>${esc(branding.address)}</div>` : ''}
        ${branding?.gstin ? `<div>GSTIN: ${esc(branding.gstin)}</div>` : ''}
        ${branding?.contact ? `<div>${esc(branding.contact)}</div>` : ''}
      </div>
    </div>

    <div class="pi-meta">
      <div><div class="pi-label">Internal Purchase ID</div><div class="pi-val">${esc(b.internalPurchaseId || '—')}</div></div>
      <div><div class="pi-label">Bill No.</div><div class="pi-val">${esc(b.supplierInvoiceNumber || '—')}</div></div>
      <div><div class="pi-label">Purchase Date</div><div class="pi-val">${esc(fmtDateDMY(String(b.invoiceDate ?? '')) || '—')}</div></div>
      <div><div class="pi-label">Status</div><div class="pi-val">${esc(b.status)}</div></div>
    </div>

    <table class="pi-table">
      <thead>
        <tr>
          <th style="width:22px">#</th>
          <th style="width:150px">Product</th>
          <th style="width:80px">Manufacturer</th>
          <th style="width:70px">Batch No.</th>
          <th style="width:65px">Expiry</th>
          <th style="width:55px">Rate w/o GST</th>
          <th style="width:30px">GST%</th>
          <th style="width:55px">Rate incl. GST</th>
          <th style="width:35px">Qty</th>
          <th style="width:45px">MRP</th>
          <th style="width:45px">PTR</th>
          <th style="width:50px">Sale Rate</th>
          <th style="width:65px">Amt w/o GST</th>
          <th style="width:50px">GST Amt</th>
          <th style="width:65px">Final Amount</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="8" class="c">TOTALS</td>
          <td class="c">${totalQty}</td>
          <td class="c">—</td>
          <td class="c">—</td>
          <td class="c">—</td>
          <td class="r">${fmtINR(n(totWo))}</td>
          <td class="r">${fmtINR(n(totGst))}</td>
          <td class="r">${fmtINR(n(totFinal))}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>`;

    return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Purchase Invoice ${esc(b.internalPurchaseId)}</title>
<style>${PURCHASE_PRINT_CSS}</style></head><body>${body}</body></html>`;
}
