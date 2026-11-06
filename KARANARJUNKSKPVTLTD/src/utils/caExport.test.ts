import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    toIsoDate, inPeriod, gstinStatus, matchesGst, partyKey, matchesParty,
    defaultBillFilters, periodSlug, safeFileName, type BillFilterState,
} from './billFilters';
import { crc32, buildZip } from './zipStore';
import { salesFigures, purchaseFigures } from './billFigures';
import { buildB2BInvoiceHtml } from './b2bInvoiceHtml';
import { buildPurchaseInvoiceHtml } from './purchaseInvoiceHtml';
import { buildSummaryXlsx } from './caExport';

const f = (patch: Partial<BillFilterState>): BillFilterState => ({ ...defaultBillFilters(), ...patch });

describe('toIsoDate', () => {
    it('reads every date shape bills are stored with', () => {
        expect(toIsoDate('2026-10-04')).toBe('2026-10-04');
        expect(toIsoDate('2026-10-04T10:00:00.000Z')).toBe('2026-10-04');
        expect(toIsoDate('04/10/2026')).toBe('2026-10-04');   // Indian DD/MM/YYYY
        expect(toIsoDate('4-10-2026')).toBe('2026-10-04');
        expect(toIsoDate('04.10.26')).toBe('2026-10-04');
        expect(toIsoDate({ toDate: () => new Date(2026, 9, 4, 15) })).toBe('2026-10-04');
        expect(toIsoDate({ seconds: new Date(2026, 9, 4, 12).getTime() / 1000 })).toBe('2026-10-04');
        expect(toIsoDate(new Date(2026, 9, 4))).toBe('2026-10-04');
    });
    it('rejects junk instead of inventing a date', () => {
        expect(toIsoDate('')).toBeNull();
        expect(toIsoDate(undefined)).toBeNull();
        expect(toIsoDate('31/02/2026')).toBeNull();
        expect(toIsoDate('not a date')).toBeNull();
    });
});

describe('inPeriod', () => {
    it('month / date / range', () => {
        expect(inPeriod('2026-10-31', f({ periodMode: 'month', month: '2026-10' }))).toBe(true);
        expect(inPeriod('2026-11-01', f({ periodMode: 'month', month: '2026-10' }))).toBe(false);
        expect(inPeriod('2026-10-05', f({ periodMode: 'date', date: '2026-10-05' }))).toBe(true);
        expect(inPeriod('2026-10-06', f({ periodMode: 'date', date: '2026-10-05' }))).toBe(false);
        const r = f({ periodMode: 'range', from: '2026-10-01', to: '2026-10-15' });
        expect(inPeriod('2026-10-01', r)).toBe(true);
        expect(inPeriod('2026-10-15', r)).toBe(true);
        expect(inPeriod('2026-10-16', r)).toBe(false);
        expect(inPeriod('2026-09-30', r)).toBe(false);
        expect(inPeriod('2026-12-31', f({ periodMode: 'range', from: '2026-10-01' }))).toBe(true);
        expect(inPeriod(null, f({ periodMode: 'month', month: '2026-10' }))).toBe(false);
        expect(inPeriod(null, f({ periodMode: 'all' }))).toBe(true);
    });
});

describe('GSTIN filter', () => {
    it('only a correctly formatted GSTIN counts as "with GSTIN"', () => {
        expect(gstinStatus('27AAPFU0939F1ZV')).toBe('valid');
        expect(gstinStatus(' 27aapfu0939f1zv ')).toBe('valid');
        expect(gstinStatus('NA')).toBe('invalid');
        expect(gstinStatus('9876543210')).toBe('invalid');
        expect(gstinStatus('')).toBe('missing');
        expect(matchesGst('27AAPFU0939F1ZV', 'with')).toBe(true);
        expect(matchesGst('NA', 'with')).toBe(false);
        expect(matchesGst('NA', 'without')).toBe(true);
        expect(matchesGst(undefined, 'all')).toBe(true);
    });
});

describe('party filter', () => {
    it('groups spelling variants of the same shop', () => {
        expect(partyKey('  Baliraja   Agro ')).toBe(partyKey('BALIRAJA AGRO'));
        expect(matchesParty('Baliraja Agro', f({ parties: ['baliraja agro'] }))).toBe(true);
        expect(matchesParty('Sachin Agro clinic', f({ parties: ['baliraja agro'] }))).toBe(false);
        expect(matchesParty('anyone', f({ parties: [] }))).toBe(true);
    });
});

describe('file names', () => {
    it('are safe on Windows', () => {
        expect(safeFileName('SIPL/26-27/210 - VAISHNAVI AGRO')).toBe('SIPL-26-27-210 - VAISHNAVI AGRO');
        expect(periodSlug(f({ periodMode: 'month', month: '2026-10' }))).toBe('2026-10');
        expect(safeFileName('26/27/058 - JAIVICON PVT.LTD.')).toBe('26-27-058 - JAIVICON PVT.LTD');
    });
});

describe('zip', () => {
    it('crc32 matches the reference value', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });
    it('writes a valid archive layout and de-duplicates names', () => {
        const z = buildZip([
            { name: 'a.pdf', data: new Uint8Array([1, 2, 3]) },
            { name: 'a.pdf', data: new Uint8Array([4]) },
        ]);
        const v = new DataView(z.buffer);
        expect(v.getUint32(0, true)).toBe(0x04034b50);
        const eocd = z.length - 22;
        expect(v.getUint32(eocd, true)).toBe(0x06054b50);
        expect(v.getUint16(eocd + 10, true)).toBe(2);
        expect(new TextDecoder().decode(z)).toContain('a (2).pdf');
    });
});

// A real B2B invoice shape as B2BInvoicePage writes it (gross is GST-inclusive).
const sale = {
    id: 'abc', orderNumber: 'SIPL/26-27/207', invoiceType: 'B2B_GST',
    retailerName: 'Baliraja Agro', buyerAddress: 'Karmala, Tal. Karmala, Dist. Solapur',
    buyerGstin: '27AAPFU0939F1ZV', invoiceDate: '2026-10-28', modeOfPayment: '15 Days',
    lineItems: [
        { itemDescription: 'FASTER 100ML', batchNo: 'B12', expDate: '12/2027', gstPct: 18, quantity: 10, rate: 472, grossAmount: 4720 },
        { itemDescription: 'Urea ₹ 45kg — Devanagari: युरिया', gstPct: 5, quantity: 2, rate: 1680, grossAmount: 3360 },
    ],
    taxableValue: 4000 + 3200, cgst: 360 + 80, sgst: 360 + 80, totalTax: 880, discountAmount: 0, roundOff: 0, netAmount: 8080,
};

const purchase = {
    id: 'p1', supplierName: 'Shriram Agro Chemicals', supplierGstin: '29AAPFU0939F1ZV',
    supplierInvoiceNumber: 'SAC/1192', internalPurchaseId: 'PUR-0042', invoiceDate: '2026-10-12',
    lines: [{ productName: 'Chlorpyrifos 1L', manufacturer: 'Dhanuka', batchNumber: 'X1', expiryDate: '2028-01-01', gstPct: 18, rateWithoutGst: 500, quantity: 4, amountWithoutGst: 2000, gstAmount: 360, finalAmount: 2360 }],
    totalAmountWithoutGst: 2000, totalGst: 360, totalFinalAmount: 2360,
};

describe('tax figures', () => {
    it('sales: stored totals win, rate-wise split matches', () => {
        const fig = salesFigures(sale, '27AAACK1234A1Z5');
        expect(fig.interState).toBe(false);
        expect(fig.taxable).toBe(7200);
        expect(fig.cgst).toBe(440);
        expect(fig.total).toBe(8080);
        expect(fig.rateRows).toEqual([
            { rate: 5, taxable: 3200, cgst: 80, sgst: 80, igst: 0 },
            { rate: 18, taxable: 4000, cgst: 360, sgst: 360, igst: 0 },
        ]);
    });
    it('sales: legacy doc without stored totals is computed from lines', () => {
        const legacy: Record<string, unknown> = { ...sale };
        for (const k of ['taxableValue', 'cgst', 'sgst', 'totalTax', 'roundOff']) delete legacy[k];
        const fig = salesFigures(legacy);
        expect(fig.taxable).toBe(7200);
        expect(fig.totalTax).toBe(880);
    });
    it('purchase: Karnataka supplier to Maharashtra buyer is IGST', () => {
        const fig = purchaseFigures(purchase, '27AAACK1234A1Z5');
        expect(fig.interState).toBe(true);
        expect(fig.igst).toBe(360);
        expect(fig.cgst).toBe(0);
        expect(fig.total).toBe(2360);
    });
});

describe('existing print formats + register + zip', () => {
    const branding = { businessName: 'Karan Arjun Krushi Seva Kendra', address: 'Pune, Maharashtra', gstin: '27AAACK1234A1Z5' };

    it('sales PDF source is the customer invoice HTML', () => {
        const html = buildB2BInvoiceHtml(sale, branding);
        expect(html).toContain('GST INVOICE');
        expect(html).toContain('SIPL/26-27/207');
        expect(html).toContain('27AAPFU0939F1ZV');
        expect(html).toContain('SUBJECT TO PUNE JURISDICTION');
    });

    it('purchase PDF source is the purchase invoice print layout', () => {
        const html = buildPurchaseInvoiceHtml(purchase, branding);
        expect(html).toContain('Purchase Invoice');
        expect(html).toContain('SAC/1192');
        expect(html).toContain('12/10/2026');
        expect(html).toContain('Chlorpyrifos 1L');
        expect(html).toContain('@page { size: A3 landscape');
        expect(buildPurchaseInvoiceHtml({ ...purchase, supplierName: '<script>x</script>' }, branding)).not.toContain('<script>x');
    });

    it('builds a register and a zip that real unzip tools open', () => {
        const xlsx = buildSummaryXlsx('sales', [sale], branding, 'October 2026');
        expect(xlsx[0]).toBe(0x50); // 'PK'
        const zip = buildZip([
            { name: 'Sales Register - October 2026.xlsx', data: xlsx },
            { name: 'Sales Invoices/SIPL-26-27-207 - Baliraja Agro.html', data: new TextEncoder().encode(buildB2BInvoiceHtml(sale, branding)) },
        ]);
        const out = process.env.CA_EXPORT_OUT;
        if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'sample.zip'), zip); }
        expect(zip.length).toBeGreaterThan(xlsx.length);
    });
});

describe('purchase bill paid status (FIFO on supplier account)', () => {
    it('linked payments settle their bill first, the rest clears oldest dues first', async () => {
        const { allocateSupplierPayments } = await import('./supplierBillPayments');
        const m = allocateSupplierPayments({
            suppliers: [{ id: 's1', name: 'Sthapling Krushi' }],
            purchaseOrders: [{ id: 'po1', supplierName: 'STHAPLING  KRUSHI', totalAmount: 1000, poDate: '2026-06-01' }],
            invoices: [
                { id: 'a', supplierId: 's1', netAmount: 5000, invoiceDate: '2026-07-01' },
                { id: 'b', supplierId: 's1', netAmount: 3000, invoiceDate: '2026-08-01' },
                { id: 'c', supplierId: 's1', netAmount: 2000, invoiceDate: '2026-09-01' },
                { id: 'gone', supplierId: 's1', netAmount: 9999, invoiceDate: '2026-05-01', deleted: true },
            ],
            payments: [
                { supplierId: 's1', amount: 2000, linkedInvoiceId: 'c', linkedInvoiceType: 'invoice' }, // settles c
                { supplierName: 'Sthapling Krushi', amount: 6500 }, // PO 1000, a 5000, b 500 of 3000
            ],
        });
        expect(m.get('c')).toEqual({ amount: 2000, paid: 2000, due: 0, fullyPaid: true });
        expect(m.get('a')?.fullyPaid).toBe(true);
        expect(m.get('b')).toEqual({ amount: 3000, paid: 500, due: 2500, fullyPaid: false });
        expect(m.has('gone')).toBe(false);
    });
});
