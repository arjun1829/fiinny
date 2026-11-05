/**
 * Tax figures for one bill, read the same way the invoice screens write them.
 *
 * Sales (B2B_GST salesOrders): line `grossAmount` is GST-inclusive, so the
 * taxable value is gross / (1 + rate) — exactly what B2BInvoicePage stores in
 * taxableValue / cgst / sgst. Stored totals win; per-line maths is only the
 * fallback for old docs that never had them.
 *
 * Purchase (supplierInvoices): lines carry amountWithoutGst / gstAmount /
 * finalAmount, written by SupplierInvoicePage.
 */
import { isInterState } from './gstinValidator';
import { normalizeGstin, toIsoDate } from './billFilters';

// Firestore docs are loosely typed; fields are read defensively below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

export const num = (v: unknown): number => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface RateRow { rate: number; taxable: number; cgst: number; sgst: number; igst: number }

export interface BillFigures {
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    discount: number;
    roundOff: number;
    total: number;
    interState: boolean;
    rateRows: RateRow[];
}

export interface SalesLine { description: string; batch: string; expiry: string; gstPct: number; qty: string; rate: number; amount: number }
export interface PurchaseLine { description: string; manufacturer: string; batch: string; expiry: string; gstPct: number; qty: number; rate: number; taxable: number; gst: number; amount: number }

// ── Sales ───────────────────────────────────────────────────────────────────

export function salesLines(o: AnyRec): SalesLine[] {
    const raw: AnyRec[] = Array.isArray(o.lineItems) ? o.lineItems : [];
    return raw
        .map(r => {
            const qty = num(r.quantity);
            const rate = num(r.rate ?? r.mrp ?? r.price);
            const amount = num(r.grossAmount ?? r.amount ?? r.total) || r2(qty * rate);
            return {
                description: String(r.itemDescription ?? r.productName ?? r.description ?? '').trim(),
                batch: String(r.batchNo ?? r.batchNumber ?? '').trim(),
                expiry: String(r.expDate ?? r.expiryDate ?? '').trim(),
                gstPct: num(r.gstPct ?? r.gstRate),
                qty: String(r.quantity ?? '').trim(),
                rate,
                amount,
            };
        })
        .filter(l => l.description || l.amount);
}

export function salesFigures(o: AnyRec, sellerGstin?: string): BillFigures {
    const lines = salesLines(o);
    const interState = isInterState(normalizeGstin(sellerGstin), normalizeGstin(o.buyerGstin));

    const byRate = new Map<number, RateRow>();
    for (const l of lines) {
        const taxable = l.amount / (1 + l.gstPct / 100);
        const tax = taxable * l.gstPct / 100;
        const row = byRate.get(l.gstPct) ?? { rate: l.gstPct, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        row.taxable += taxable;
        if (interState) row.igst += tax; else { row.cgst += tax / 2; row.sgst += tax / 2; }
        byRate.set(l.gstPct, row);
    }
    const rateRows = [...byRate.values()]
        .map(r => ({ rate: r.rate, taxable: r2(r.taxable), cgst: r2(r.cgst), sgst: r2(r.sgst), igst: r2(r.igst) }))
        .sort((a, b) => a.rate - b.rate);
    const sum = (k: keyof RateRow) => r2(rateRows.reduce((s, r) => s + r[k], 0));

    const hasStored = o.taxableValue != null || o.totalTax != null;
    const taxable = hasStored ? r2(num(o.taxableValue)) : sum('taxable');
    let cgst = hasStored ? r2(num(o.cgst)) : sum('cgst');
    let sgst = hasStored ? r2(num(o.sgst)) : sum('sgst');
    let igst = hasStored ? r2(num(o.igst)) : sum('igst');
    // Stored docs always split CGST/SGST; re-label as IGST for an inter-state buyer.
    if (hasStored && interState && !igst) { igst = r2(cgst + sgst); cgst = 0; sgst = 0; }
    const totalTax = hasStored && o.totalTax != null ? r2(num(o.totalTax)) : r2(cgst + sgst + igst);
    const discount = r2(num(o.discountAmount));
    const total = r2(num(o.netAmount ?? o.grandTotal ?? o.totalAmount) || Math.round(taxable + totalTax - discount));
    const roundOff = o.roundOff != null ? r2(num(o.roundOff)) : r2(total - (taxable + totalTax - discount));

    return { taxable, cgst, sgst, igst, totalTax, discount, roundOff, total, interState, rateRows };
}

export const salesInvoiceNo = (o: AnyRec) => String(o.orderNumber || o.invoiceNo || String(o.id || '').slice(-8).toUpperCase());
/** Invoice date is what GST returns are filed on; createdAt is only the fallback. */
export const salesInvoiceIso = (o: AnyRec) => toIsoDate(o.invoiceDate) ?? toIsoDate(o.createdAt);

// ── Purchase ────────────────────────────────────────────────────────────────

export function purchaseLines(b: AnyRec): PurchaseLine[] {
    const raw: AnyRec[] = Array.isArray(b.lines) ? b.lines : [];
    return raw
        .map(l => {
            const qty = num(l.quantity);
            const gstPct = num(l.gstPct);
            const rate = num(l.rateWithoutGst ?? l.rate);
            const taxable = num(l.amountWithoutGst ?? l.amount) || r2(qty * rate); // older form: `amount`
            const gst = l.gstAmount != null ? num(l.gstAmount) : r2(taxable * gstPct / 100);
            const amount = num(l.finalAmount) || r2(taxable + gst);
            return {
                description: String(l.productName ?? l.description ?? '').trim(),
                manufacturer: String(l.manufacturer ?? '').trim(),
                batch: String(l.batchNumber ?? l.batchNo ?? '').trim(),
                expiry: String(l.expiryDate ?? l.expDate ?? '').trim(),
                gstPct, qty, rate, taxable, gst, amount,
            };
        })
        .filter(l => l.description || l.amount);
}

export function purchaseFigures(b: AnyRec, ownGstin?: string): BillFigures {
    const lines = purchaseLines(b);
    const interState = isInterState(normalizeGstin(ownGstin), normalizeGstin(b.supplierGstin));

    const byRate = new Map<number, RateRow>();
    for (const l of lines) {
        const row = byRate.get(l.gstPct) ?? { rate: l.gstPct, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        row.taxable += l.taxable;
        if (interState) row.igst += l.gst; else { row.cgst += l.gst / 2; row.sgst += l.gst / 2; }
        byRate.set(l.gstPct, row);
    }
    const rateRows = [...byRate.values()]
        .map(r => ({ rate: r.rate, taxable: r2(r.taxable), cgst: r2(r.cgst), sgst: r2(r.sgst), igst: r2(r.igst) }))
        .sort((a, b) => a.rate - b.rate);
    const sum = (k: keyof RateRow) => r2(rateRows.reduce((s, r) => s + r[k], 0));

    // Older purchase form stored doc-level taxableValue / totalTax instead.
    const storedTaxable = b.totalAmountWithoutGst ?? b.taxableValue;
    const storedTax = b.totalGst ?? b.totalTax;
    const taxable = storedTaxable != null ? r2(num(storedTaxable)) : sum('taxable');
    const totalTax = storedTax != null ? r2(num(storedTax)) : r2(sum('cgst') + sum('sgst') + sum('igst'));
    const cgst = interState ? 0 : r2(totalTax / 2);
    const sgst = interState ? 0 : r2(totalTax - cgst);
    const igst = interState ? totalTax : 0;
    const total = r2(num(b.totalFinalAmount ?? b.netAmount ?? b.grandTotal) || lines.reduce((s, l) => s + l.amount, 0));

    return { taxable, cgst, sgst, igst, totalTax, discount: 0, roundOff: r2(total - taxable - totalTax), total, interState, rateRows };
}

export const purchaseBillNo = (b: AnyRec) =>
    String(b.supplierInvoiceNumber || b.internalPurchaseId || String(b.id || '').slice(0, 8).toUpperCase());
export const purchaseBillIso = (b: AnyRec) => toIsoDate(b.invoiceDate) ?? toIsoDate(b.createdAt);
