/**
 * Builds the ZIP the CA asked for: one PDF per bill — in the exact format we
 * already print (customer B2B invoice / purchase invoice) — plus a register
 * (Excel) listing every bill with GSTIN and tax split, so the CA can tick
 * them off against GSTR-1 / GSTR-2B without opening each PDF.
 */
import * as XLSX from 'xlsx';
import { createElement } from 'react';
import i18n from '../i18n';
import { PosInvoicePreview, posReprintProps } from '../components/PosInvoicePreview';
import type { InvoiceTemplateBranding } from '../types/invoiceTemplate';
import { buildZip, downloadBytes, type ZipEntry } from './zipStore';
import { buildB2BInvoiceHtml } from './b2bInvoiceHtml';
import { buildPurchaseInvoiceHtml } from './purchaseInvoiceHtml';
import { htmlToPdf, reactToPdf } from './htmlToPdf';
import { normalizeGstin, safeFileName, formatIsoDate } from './billFilters';
import {
    salesFigures, salesInvoiceNo, salesInvoiceIso,
    purchaseFigures, purchaseBillNo, purchaseBillIso,
} from './billFigures';

// Firestore docs are loosely typed; fields are read defensively below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;
/** sales = B2B GST invoices · purchase = supplier bills · pos = Order History (POS bills + any B2B rows) */
export type BillKind = 'sales' | 'purchase' | 'pos';

export interface CaExportOptions {
    kind: BillKind;
    bills: AnyRec[];
    branding: Partial<InvoiceTemplateBranding> | null;
    /** e.g. 'October 2026' — written on the register. */
    periodLabel: string;
    /** e.g. '2026-10' — used in the ZIP file name. */
    periodSlug: string;
    onProgress?: (done: number, total: number) => void;
}

export interface CaExportResult { fileName: string; count: number; failed: string[] }

/** English labels, exactly what an English POS reprint prints. */
const posLabelEn = (key: string): string => i18n.t(`pos_bill.${key}`, { lng: 'en' }) as string;

const isB2BGst = (b: AnyRec) => b.invoiceType === 'B2B_GST';

/** Renders one bill to PDF using the same layout as its Print / Reprint button. */
export function billToPdf(kind: BillKind, b: AnyRec, branding: CaExportOptions['branding']): Promise<Uint8Array> {
    if (kind === 'pos' && !isB2BGst(b)) {
        // POS Reprint: PosInvoicePreview with the saved bill, A5 landscape (the POS default).
        // 202mm printable width ≈ 763 CSS px.
        return reactToPdf(
            createElement(PosInvoicePreview, { ...posReprintProps(b), branding, billFormat: 'A5', L: posLabelEn }),
            { widthPx: 763, format: 'a5', orientation: 'landscape', marginMm: 4 },
        );
    }
    return kind === 'sales' || kind === 'pos'
        // B2B print card is 1050px wide, printed on A4 portrait.
        ? htmlToPdf(buildB2BInvoiceHtml(b, branding), { widthPx: 1100, format: 'a4', orientation: 'portrait', marginMm: 6 })
        // Purchase print uses @page A3 landscape, 8mm margins.
        : htmlToPdf(buildPurchaseInvoiceHtml(b, branding), { widthPx: 1500, format: 'a3', orientation: 'landscape', marginMm: 8 });
}

/** POS bill tax split — same maths as PosInvoicePreview (line amounts GST-inclusive, 5% when unset). */
function posFigures(b: AnyRec) {
    const lines: AnyRec[] = Array.isArray(b.lineItems) ? b.lineItems : [];
    let taxable = 0, tax = 0;
    for (const li of lines) {
        const g = typeof li.gstPct === 'number' ? li.gstPct : 5;
        const amt = Number(li.amount) || 0;
        taxable += amt / (1 + g / 100);
        tax += (amt / (1 + g / 100)) * g / 100;
    }
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return { taxable: r2(taxable), cgst: r2(tax / 2), sgst: r2(tax / 2), tax: r2(tax), total: r2(Number(b.grandTotal ?? b.netAmount ?? b.totalAmount ?? 0)) };
}

function summaryRow(kind: BillKind, b: AnyRec, ownGstin?: string) {
    if (kind === 'pos') {
        const f = isB2BGst(b) ? (() => { const s = salesFigures(b, ownGstin); return { taxable: s.taxable, cgst: s.cgst + s.igst / 2, sgst: s.sgst + s.igst / 2, tax: s.totalTax, total: s.total }; })() : posFigures(b);
        return {
            'Bill Date': formatIsoDate(salesInvoiceIso(b)),
            'Bill No': salesInvoiceNo(b),
            'Type': isB2BGst(b) ? 'B2B' : 'POS',
            'Customer': String(b.retailerName || 'Walk-in Customer'),
            'Phone': String(b.phoneNumber || b.buyerContact || ''),
            'Payment Mode': String(b.paymentMethod || b.modeOfPayment || ''),
            'Taxable Value': f.taxable, 'CGST': f.cgst, 'SGST': f.sgst, 'Total Tax': f.tax,
            'Bill Value': f.total,
        };
    }
    if (kind === 'sales') {
        const f = salesFigures(b, ownGstin);
        return {
            'Invoice Date': formatIsoDate(salesInvoiceIso(b)),
            'Invoice No': salesInvoiceNo(b),
            'Customer': String(b.retailerName || ''),
            'Customer GSTIN': normalizeGstin(b.buyerGstin),
            'Taxable Value': f.taxable, 'CGST': f.cgst, 'SGST': f.sgst, 'IGST': f.igst,
            'Total Tax': f.totalTax, 'Discount': f.discount, 'Round Off': f.roundOff,
            'Invoice Value': f.total,
        };
    }
    const f = purchaseFigures(b, ownGstin);
    return {
        'Bill Date': formatIsoDate(purchaseBillIso(b)),
        'Supplier Bill No': purchaseBillNo(b),
        'Our Purchase ID': String(b.internalPurchaseId || ''),
        'Supplier': String(b.supplierName || ''),
        'Supplier GSTIN': normalizeGstin(b.supplierGstin),
        'Taxable Value': f.taxable, 'CGST': f.cgst, 'SGST': f.sgst, 'IGST': f.igst,
        'Total GST': f.totalTax, 'Bill Value': f.total,
    };
}

export function buildSummaryXlsx(kind: BillKind, bills: AnyRec[], branding: CaExportOptions['branding'], periodLabel: string): Uint8Array {
    const rows = bills.map(b => summaryRow(kind, b, branding?.gstin));
    const total: AnyRec = {};
    if (rows.length) {
        const keys = Object.keys(rows[0]);
        keys.forEach(k => { total[k] = ''; });
        total[keys[1]] = 'TOTAL';
        keys.filter(k => typeof (rows[0] as AnyRec)[k] === 'number').forEach(k => {
            total[k] = Math.round(rows.reduce((s, r) => s + Number((r as AnyRec)[k] || 0), 0) * 100) / 100;
        });
    }
    const title = kind === 'sales' ? 'Sales Register (B2B GST Invoices)' : kind === 'pos' ? 'Sales Register (POS Bills)' : 'Purchase Register (Supplier Bills)';
    const ws = XLSX.utils.aoa_to_sheet([
        [`${branding?.businessName || ''}${branding?.gstin ? `  ·  GSTIN ${branding.gstin}` : ''}`],
        [`${title}  ·  ${periodLabel}  ·  ${rows.length} bill(s)`],
        [],
    ]);
    XLSX.utils.sheet_add_json(ws, rows.length ? [...rows, total] : [{ Note: 'No bills in this selection' }], { origin: 'A4' });
    ws['!cols'] = Object.keys(rows[0] ?? { Note: '' }).map(k => ({ wch: k.includes('Customer') || k === 'Supplier' ? 32 : Math.max(12, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind === 'purchase' ? 'Purchase Register' : 'Sales Register');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** Builds the ZIP and triggers the download. Bills that fail to render are skipped and reported. */
export async function exportBillsZip(opts: CaExportOptions): Promise<CaExportResult> {
    const { kind, bills, branding, onProgress } = opts;
    const folder = kind === 'sales' ? 'Sales Invoices' : kind === 'pos' ? 'POS Bills' : 'Purchase Bills';
    const entries: ZipEntry[] = [];
    const failed: string[] = [];
    const ok: AnyRec[] = [];

    for (let i = 0; i < bills.length; i++) {
        const b = bills[i];
        const no = kind === 'purchase' ? purchaseBillNo(b) : salesInvoiceNo(b);
        const party = kind === 'purchase' ? b.supplierName : (b.retailerName || (kind === 'pos' ? 'Walk-in Customer' : ''));
        try {
            const pdf = await billToPdf(kind, b, branding);
            entries.push({ name: `${folder}/${safeFileName(`${no} - ${party || 'Unknown'}`)}.pdf`, data: pdf });
            ok.push(b);
        } catch (e) {
            console.error(`PDF failed for ${no}`, e);
            failed.push(no);
        }
        onProgress?.(i + 1, bills.length);
    }

    const registerName = kind === 'sales' ? 'Sales Register' : kind === 'pos' ? 'POS Sales Register' : 'Purchase Register';
    entries.unshift({ name: `${registerName} - ${safeFileName(opts.periodLabel)}.xlsx`, data: buildSummaryXlsx(kind, ok, branding, opts.periodLabel) });

    const biz = safeFileName(branding?.businessName || 'Bills').replace(/\s+/g, '_');
    const fileName = `${biz}_${kind === 'sales' ? 'Sales' : kind === 'pos' ? 'POS' : 'Purchase'}_Bills_${opts.periodSlug}.zip`;
    downloadBytes(buildZip(entries), fileName);
    return { fileName, count: ok.length, failed };
}
