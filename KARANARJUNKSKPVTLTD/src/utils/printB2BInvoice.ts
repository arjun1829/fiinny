import { getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantDoc } from './tenantPath';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';

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

function fmt(n: number) {
    return n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function esc(s: string | undefined | null): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Fetches a saved B2B invoice from Firestore, generates standalone HTML,
 * and opens the browser print dialog — without navigating to the editing page.
 */
export async function printB2BInvoice(orderId: string, tenantId: string): Promise<void> {
    const [orderSnap, branding] = await Promise.all([
        getDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId)),
        fetchInvoiceBranding(tenantId),
    ]);

    if (!orderSnap.exists()) {
        alert('Invoice not found.');
        return;
    }

    const o = orderSnap.data() as Record<string, any>;
    const sellerName = branding?.businessName || 'Your Business Name';
    const netAmount = Number(o.netAmount ?? o.grandTotal ?? 0);
    const prevBal = Number(o.previousBalance ?? 0);
    const netBalance = Number(o.netBalance ?? netAmount + prevBal);
    const taxableValue = Number(o.taxableValue ?? 0);
    const cgst = Number(o.cgst ?? 0);
    const sgst = Number(o.sgst ?? 0);
    const totalTax = Number(o.totalTax ?? 0);
    const discountAmount = Number(o.discountAmount ?? 0);
    const roundOff = Number(o.roundOff ?? 0);
    const totalGross = Number(o.lineItems?.reduce((s: number, r: any) => s + (Number(r.grossAmount) || 0), 0) ?? 0);

    // Derive GST % from first non-zero line item
    const firstGstPct = Number((o.lineItems ?? []).find((r: any) => Number(r.gstPct) > 0)?.gstPct ?? 0);
    const halfPct = firstGstPct / 2;

    const lineRows = (o.lineItems ?? []).map((r: any, idx: number) => `
        <tr>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${idx + 1}</td>
            <td style="border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.itemDescription)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.batchNo)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.expDate)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.gstPct)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.midOff)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.per)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.boxes)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.boxQty)}</td>
            <td style="text-align:center;font-weight:600;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.quantity)}</td>
            <td style="text-align:center;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${esc(r.rate)}</td>
            <td style="text-align:center;font-weight:600;border:1px solid #222;padding:2px 3px;font-size:0.78rem">${r.grossAmount ? fmt(Number(r.grossAmount)) : ''}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B2B Invoice ${esc(o.orderNumber)}</title>
<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; box-sizing: border-box; }
  html, body { background: #fff; color: #000; margin: 0; padding: 0; font-family: 'Times New Roman', serif; }
  .card { max-width: 1050px; margin: 0 auto; padding: 20px 24px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f2f2f2; font-weight: 700; text-align: center; border: 1px solid #222; padding: 4px 5px; font-size: 0.82rem; }
  td { border: 1px solid #222; padding: 4px 5px; font-size: 0.82rem; }
  .label { font-weight: 700; font-size: 0.82rem; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<div class="card">

  <!-- TITLE -->
  <div style="text-align:center;font-weight:700;font-size:1rem;letter-spacing:0.15em;margin-bottom:2px">GST INVOICE</div>
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px;flex-wrap:wrap;gap:0.5rem">
    <div style="display:flex;align-items:center;gap:12px">
      ${branding?.logoUrl ? `<img src="${esc(branding.logoUrl)}" alt="Logo" style="height:44px;object-fit:contain">` : ''}
      <div>
        <h1 style="margin:0;font-size:1.6rem;font-weight:900">${esc(sellerName)}</h1>
        <div style="font-size:0.78rem;color:#444;margin-top:2px">
          ${esc(branding?.address)}<br>
          ${branding?.gstin ? `<strong>GSTIN:</strong> ${esc(branding.gstin)}&nbsp;` : ''}
          ${branding?.contact ? `Contact No.: ${esc(branding.contact)}` : ''}
          ${branding?.email ? `&nbsp; Email: ${esc(branding.email)}` : ''}
        </div>
      </div>
    </div>
    <div style="text-align:right;font-weight:700;font-size:1rem;color:#111;border:2px solid #111;padding:4px 12px;border-radius:6px">CREDIT BILL</div>
  </div>

  ${branding?.gstin ? `<div style="text-align:center;font-weight:700;font-size:0.9rem;margin-bottom:10px;letter-spacing:0.05em">GSTTIN NO: ${esc(branding.gstin)}</div>` : ''}

  <!-- BUYER + META -->
  <div style="display:grid;grid-template-columns:1fr 1fr;margin-bottom:10px;border:1px solid #222">
    <div style="border-right:1px solid #222;padding:8px">
      <div class="label" style="margin-bottom:4px">Details for Buyer (Billed &amp; Shipped To)</div>
      <div style="font-weight:700;font-size:0.88rem">${esc(o.retailerName)}</div>
      <div style="font-size:0.82rem;margin-top:2px">${esc(o.buyerAddress)}</div>
      ${o.buyerGstin ? `<div style="font-size:0.82rem;margin-top:2px"><span class="label">GSTIN:</span> ${esc(o.buyerGstin)}</div>` : ''}
      ${o.buyerContact ? `<div style="font-size:0.82rem;margin-top:2px"><span class="label">Contact No.:</span> ${esc(o.buyerContact)}</div>` : ''}
    </div>
    <div style="padding:8px;display:flex;flex-direction:column;gap:4px">
      <div style="display:grid;grid-template-columns:130px 1fr;gap:4px;align-items:center">
        <span class="label">Invoice No :</span><span style="font-weight:700">${esc(o.orderNumber)}</span>
      </div>
      <div style="display:grid;grid-template-columns:130px 1fr;gap:4px;align-items:center">
        <span class="label">Invoice Date :</span><span>${esc(o.invoiceDate)}</span>
      </div>
      <div style="display:grid;grid-template-columns:130px 1fr;gap:4px;align-items:center">
        <span class="label">Terms of Delivery :</span><span>${esc(o.termsOfDelivery)}</span>
      </div>
      <div style="display:grid;grid-template-columns:130px 1fr;gap:4px;align-items:center">
        <span class="label">Mode of Payment :</span><span>${esc(o.modeOfPayment)}</span>
      </div>
      <div style="display:grid;grid-template-columns:130px 1fr;gap:4px;align-items:center">
        <span class="label">Salesman Name :</span><span>${esc(o.salesmanName)}</span>
      </div>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <div style="margin-bottom:10px;overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th style="width:30px">S.No</th>
          <th style="min-width:140px">Item Descriptions</th>
          <th style="width:78px">BATCH NO.</th>
          <th style="width:78px">Exp. Date</th>
          <th style="width:46px">GST %</th>
          <th style="width:54px">Mid Off</th>
          <th style="width:44px">Per</th>
          <th style="width:46px">Boxes</th>
          <th style="width:52px">Box Qty</th>
          <th style="width:54px">Qty</th>
          <th style="width:62px">RATE</th>
          <th style="width:82px">Gross Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
        <tr style="font-weight:700;background:#f9f9f9">
          <td colspan="11" style="text-align:right;padding-right:8px;border:1px solid #222;font-size:0.78rem">TOTAL</td>
          <td style="text-align:center;border:1px solid #222;font-size:0.78rem">${fmt(totalGross)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- GST SUMMARY + NET AMOUNT -->
  <div style="display:grid;grid-template-columns:1fr 1fr;margin-bottom:10px;border:1px solid #222">
    <div style="border-right:1px solid #222;padding:8px">
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
        <thead>
          <tr>
            <th style="border:1px solid #ccc;padding:3px 5px;background:#f2f2f2">Taxable Value</th>
            <th style="border:1px solid #ccc;padding:3px 5px;background:#f2f2f2">Central Tax Rate</th>
            <th style="border:1px solid #ccc;padding:3px 5px;background:#f2f2f2">Amount</th>
            <th style="border:1px solid #ccc;padding:3px 5px;background:#f2f2f2">State Tax Rate</th>
            <th style="border:1px solid #ccc;padding:3px 5px;background:#f2f2f2">Amount</th>
            <th style="border:1px solid #ccc;padding:3px 5px;background:#f2f2f2">Total Tax Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">${fmt(taxableValue)}</td>
            <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">${halfPct}%</td>
            <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">${fmt(cgst)}</td>
            <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">${halfPct}%</td>
            <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">${fmt(sgst)}</td>
            <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">${fmt(totalTax)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #ccc;padding:3px 5px;font-weight:700">Total: ${fmt(taxableValue)}</td>
            <td colspan="4" style="border:1px solid #ccc;padding:3px 5px"></td>
            <td style="border:1px solid #ccc;padding:3px 5px;font-weight:700;text-align:center">${fmt(totalTax)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:8px;display:flex;flex-direction:column;gap:3px;font-size:0.82rem">
      <div style="display:flex;justify-content:space-between"><span>Output CGST@${halfPct}%</span><span>${fmt(cgst)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Output SGST@${halfPct}%</span><span>${fmt(sgst)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Round Off</span><span>${fmt(roundOff)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Discount (-)</span><span>${fmt(discountAmount)}</span></div>
      <div style="border-top:2px solid #111;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;font-weight:900;font-size:1rem">
        <span>NET AMOUNT</span><span>₹${netAmount.toLocaleString('en-IN')}</span>
      </div>
    </div>
  </div>

  <!-- AMOUNT IN WORDS -->
  <div style="border:1px solid #222;margin-bottom:10px;display:grid;grid-template-columns:100px 1fr;align-items:stretch">
    <div style="border-right:1px solid #222;padding:6px;font-weight:700;display:flex;align-items:center;font-size:0.82rem">Amount<br>in Words</div>
    <div style="padding:6px;font-weight:600;font-size:0.85rem;font-style:italic">INR ${numberToWords(netAmount)}</div>
  </div>

  <!-- BALANCE + BANK + SIGNATURE -->
  <div style="display:grid;grid-template-columns:1fr 1fr;margin-bottom:10px;border:1px solid #222">
    <div style="border-right:1px solid #222;padding:8px;font-size:0.82rem">
      <div class="label" style="margin-bottom:6px">Account Statement</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span>Previous Balance</span><span>₹${prevBal.toLocaleString('en-IN')} Dr</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span>Current Invoice</span><span style="font-weight:600">₹${netAmount.toLocaleString('en-IN')} Dr</span>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid #ccc;padding-top:3px;font-weight:700">
        <span>Net Balance</span><span>₹${netBalance.toLocaleString('en-IN')} Dr</span>
      </div>
    </div>
    <div style="padding:8px;font-size:0.8rem">
      <div class="label" style="margin-bottom:4px">Company's Bank Details for NEFT / RTGS :</div>
      <div style="white-space:pre-line;color:#333;line-height:1.6">${esc(branding?.bankDetails ?? '')}</div>
    </div>
  </div>

  <!-- REMARK -->
  <div style="border:1px solid #222;margin-bottom:0;padding:5px 8px;font-size:0.82rem;display:flex;align-items:center;gap:8px">
    <strong>REMARK :</strong>
  </div>

  <!-- DECLARATION + SIGNATURE -->
  <div style="border:1px solid #222;border-top:none;margin-bottom:10px;display:grid;grid-template-columns:1fr 1fr">
    <div style="border-right:1px solid #222;padding:8px;font-size:0.75rem">
      <div class="label" style="margin-bottom:3px">Declaration :</div>
      <div style="color:#444;line-height:1.5">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
    </div>
    <div style="padding:8px;display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;font-size:0.8rem">
      <div style="font-weight:700">For ${esc(sellerName)}</div>
      ${branding?.signatureUrl ? `<img src="${esc(branding.signatureUrl)}" alt="" style="height:46px;max-width:160px;object-fit:contain;margin-top:4px">` : ''}
      <div style="border-top:1px solid #555;padding-top:4px;min-width:140px;text-align:center;margin-top:${branding?.signatureUrl ? '4px' : '28px'}">
        ${esc(branding?.signatureName ?? 'Authorised Signatory')}
      </div>
    </div>
  </div>

  <!-- JURISDICTION -->
  <div style="text-align:center;font-weight:700;font-size:0.82rem;letter-spacing:0.06em;margin-bottom:16px">SUBJECT TO PUNE JURISDICTION</div>

</div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
        alert('Please allow popups to print the invoice.');
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 700);
}
