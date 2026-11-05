/**
 * Builds the ZIP the CA asked for: one PDF per bill — in the exact format we
 * already print (customer B2B invoice / purchase invoice) — plus a register
 * (Excel) listing every bill with GSTIN and tax split, so the CA can tick
 * them off against GSTR-1 / GSTR-2B without opening each PDF.
 */
import * as XLSX from 'xlsx';
import type { InvoiceTemplateBranding } from '../types/invoiceTemplate';
import { buildZip, downloadBytes, type ZipEntry } from './zipStore';
import { buildB2BInvoiceHtml } from './b2bInvoiceHtml';
import { buildPurchaseInvoiceHtml } from './purchaseInvoiceHtml';
import { htmlToPdf } from './htmlToPdf';
import { normalizeGstin, safeFileName, formatIsoDate } from './billFilters';
import {
    salesFigures, salesInvoiceNo, salesInvoiceIso,
    purchaseFigures, purchaseBillNo, purchaseBillIso,
} from './billFigures';

// Firestore docs are loosely typed; fields are read defensively below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;
export type BillKind = 'sales' | 'purchase';

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

/** Renders one bill to PDF using the same HTML as its Print button. */
export function billToPdf(kind: BillKind, b: AnyRec, branding: CaExportOptions['branding']): Promise<Uint8Array> {
    return kind === 'sales'
        // B2B print card is 1050px wide, printed on A4 portrait.
        ? htmlToPdf(buildB2BInvoiceHtml(b, branding), { widthPx: 1100, format: 'a4', orientation: 'portrait', marginMm: 6 })
        // Purchase print uses @page A3 landscape, 8mm margins.
        : htmlToPdf(buildPurchaseInvoiceHtml(b, branding), { widthPx: 1500, format: 'a3', orientation: 'landscape', marginMm: 8 });
}

function summaryRow(kind: BillKind, b: AnyRec, ownGstin?: string) {
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
    const title = kind === 'sales' ? 'Sales Register (B2B GST Invoices)' : 'Purchase Register (Supplier Bills)';
    const ws = XLSX.utils.aoa_to_sheet([
        [`${branding?.businessName || ''}${branding?.gstin ? `  ·  GSTIN ${branding.gstin}` : ''}`],
        [`${title}  ·  ${periodLabel}  ·  ${rows.length} bill(s)`],
        [],
    ]);
    XLSX.utils.sheet_add_json(ws, rows.length ? [...rows, total] : [{ Note: 'No bills in this selection' }], { origin: 'A4' });
    ws['!cols'] = Object.keys(rows[0] ?? { Note: '' }).map(k => ({ wch: k.includes('Customer') || k === 'Supplier' ? 32 : Math.max(12, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind === 'sales' ? 'Sales Register' : 'Purchase Register');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** Builds the ZIP and triggers the download. Bills that fail to render are skipped and reported. */
export async function exportBillsZip(opts: CaExportOptions): Promise<CaExportResult> {
    const { kind, bills, branding, onProgress } = opts;
    const folder = kind === 'sales' ? 'Sales Invoices' : 'Purchase Bills';
    const entries: ZipEntry[] = [];
    const failed: string[] = [];
    const ok: AnyRec[] = [];

    for (let i = 0; i < bills.length; i++) {
        const b = bills[i];
        const no = kind === 'sales' ? salesInvoiceNo(b) : purchaseBillNo(b);
        const party = kind === 'sales' ? b.retailerName : b.supplierName;
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

    const registerName = kind === 'sales' ? 'Sales Register' : 'Purchase Register';
    entries.unshift({ name: `${registerName} - ${safeFileName(opts.periodLabel)}.xlsx`, data: buildSummaryXlsx(kind, ok, branding, opts.periodLabel) });

    const biz = safeFileName(branding?.businessName || 'Bills').replace(/\s+/g, '_');
    const fileName = `${biz}_${kind === 'sales' ? 'Sales' : 'Purchase'}_Bills_${opts.periodSlug}.zip`;
    downloadBytes(buildZip(entries), fileName);
    return { fileName, count: ok.length, failed };
}
