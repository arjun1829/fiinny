/**
 * SHRINATH KRUSHI SEVA KENDRA — Supplier AP Import
 * AT Post Talegaon Dhamdhere, Tal-Shirur, Dist-Pune 412208
 * Mobile: 9822997551
 * Bank: Bank of Maharashtra, A/c 20163489788, IFSC MAHB0000744
 *
 * 7 purchase invoices ₹7,67,500 | 6 payments ₹5,47,345
 * Closing balance: ₹2,20,155 (Karan Arjun owes Shrinath)
 * Period: 01 Apr 2025 – 31 Mar 2026
 */
import { writeBatch, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { deleteBySourceRef } from './importCleanup';

const SUPPLIER_NAME    = 'SHRINATH KRUSHI SEVA KENDRA';
const SUPPLIER_ADDRESS = 'AT Post Talegaon Dhamdhere, Tal-Shirur, Dist-Pune 412208';
const SUPPLIER_PHONE   = '9822997551';
const CLOSING_BALANCE  = 220155;
const TOTAL_INVOICED   = 767500;
const TOTAL_PAID       = 547345;
const SOURCE_REF       = 'SHRINATH_SUPPLIER_IMPORT';

interface POLine { description: string; quantity: number; unit: string; rate: number; amount: number; }
interface Invoice { vchNo: string; date: string; amount: number; taxableValue: number; cgst: number; sgst: number; lines: POLine[]; }
interface Payment { date: string; amount: number; mode: string; receiptNo: string; bank: string; }

const INVOICES: Invoice[] = [
  {
    vchNo: 'WP/25-26/8390', date: '2026-01-02', amount: 107100, taxableValue: 90763, cgst: 8168.67, sgst: 8168.67,
    lines: [
      { description: 'Fusilade (Syngenta)-400ml',    quantity: 100, unit: 'Nag', rate: 512.71,  amount: 51271 },
      { description: 'Sandovit Gold (Syngenta)-50ml', quantity: 200, unit: 'Nag', rate: 63.56,   amount: 12712 },
      { description: 'Fusilade (Syngenta)-250ml',    quantity: 80,  unit: 'Nag', rate: 334.75,  amount: 26780 },
    ],
  },
  {
    vchNo: 'WP/25-26/8589', date: '2026-01-06', amount: 246500, taxableValue: 208900, cgst: 18801, sgst: 18801,
    lines: [
      { description: 'Evenso (Syngenta)-250ml',       quantity: 200, unit: 'Nag', rate: 279.66,  amount: 55932 },
      { description: 'Fusilade (Syngenta)-250ml',     quantity: 400, unit: 'Nag', rate: 334.75,  amount: 133900 },
      { description: 'Sandovit Gold (Syngenta)-50ml', quantity: 300, unit: 'Nag', rate: 63.56,   amount: 19068 },
    ],
  },
  {
    vchNo: 'WP/25-26/8838', date: '2026-01-13', amount: 84100, taxableValue: 71271.10, cgst: 6414.40, sgst: 6414.40,
    lines: [
      { description: 'Evenso (Syngenta)-250ml',       quantity: 120, unit: 'Nag', rate: 279.66,  amount: 33559.20 },
      { description: 'Sandovit Gold (Syngenta)-50ml', quantity: 200, unit: 'Nag', rate: 63.56,   amount: 12712 },
      { description: 'Evenso (Syngenta)-1ltr',        quantity: 10,  unit: 'Nag', rate: 1042.37, amount: 10423.70 },
      { description: 'Amistar Top (Syngenta)-200ml',  quantity: 20,  unit: 'Nag', rate: 728.81,  amount: 14576.20 },
    ],
  },
  {
    vchNo: 'WP/25-26/9101', date: '2026-01-20', amount: 132150, taxableValue: 114132, cgst: 9009, sgst: 9009,
    lines: [
      { description: 'Evenso (Syngenta)-250ml',       quantity: 160, unit: 'Nag', rate: 279.66,  amount: 44745.60 },
      { description: 'Fusilade (Syngenta)-400ml',     quantity: 60,  unit: 'Nag', rate: 559.32,  amount: 33559.20 },
      { description: 'Fusilade (Syngenta)-1ltr',      quantity: 10,  unit: 'Nag', rate: 1322.03, amount: 13220.30 },
      { description: 'Sandovit Gold (Syngenta)-50ml', quantity: 50,  unit: 'Nag', rate: 63.56,   amount: 3178 },
      { description: 'Isabion-5 (Syngenta)-500ml',    quantity: 20,  unit: 'Nag', rate: 495.24,  amount: 9904.80 },
      { description: 'Isabion-5 (Syngenta)-1ltr',     quantity: 10,  unit: 'Nag', rate: 952.38,  amount: 9523.80 },
    ],
  },
  {
    vchNo: 'WP/25-26/9241', date: '2026-01-23', amount: 91600, taxableValue: 77625.60, cgst: 6986.30, sgst: 6986.30,
    lines: [
      { description: 'Actra (Syngenta)-5gm',      quantity: 400, unit: 'Nag', rate: 8.47,   amount: 3388 },
      { description: 'Actra (Syngenta)-100gm',     quantity: 80,  unit: 'Nag', rate: 144.07, amount: 11525.60 },
      { description: 'Karate (Syngenta)-500ml',    quantity: 40,  unit: 'Nag', rate: 279.66, amount: 11186.40 },
      { description: 'Fusilade (Syngenta)-250ml',  quantity: 80,  unit: 'Nag', rate: 364.41, amount: 29152.80 },
      { description: 'Fusilade (Syngenta)-400ml',  quantity: 40,  unit: 'Nag', rate: 559.32, amount: 22372.80 },
    ],
  },
  {
    vchNo: 'WP/25-26/9379', date: '2026-01-27', amount: 77000, taxableValue: 65254.40, cgst: 5872.89, sgst: 5872.89,
    lines: [
      { description: 'Evenso (Syngenta)-500ml',  quantity: 30, unit: 'Nag', rate: 559.32, amount: 16779.60 },
      { description: 'Evenso (Syngenta)-250ml',  quantity: 40, unit: 'Nag', rate: 288.14, amount: 11525.60 },
      { description: 'Fusilade (Syngenta)-250ml', quantity: 40, unit: 'Nag', rate: 364.41, amount: 14576.40 },
      { description: 'Fusilade (Syngenta)-400ml', quantity: 40, unit: 'Nag', rate: 559.32, amount: 22372.80 },
    ],
  },
  {
    vchNo: 'WP/25-26/10401', date: '2026-03-03', amount: 29050, taxableValue: 24618.75, cgst: 2215.69, sgst: 2215.69,
    lines: [
      { description: 'Rosentra (Syngenta)-30ml',  quantity: 20, unit: 'Nag', rate: 847.46, amount: 16949.20 },
      { description: 'Sicher (Syngenta)-500gm',   quantity: 20, unit: 'Nag', rate: 127.12, amount: 2542.40 },
      { description: '2 4 D Main (Adama)-1ltr',   quantity: 10, unit: 'Nag', rate: 237.29, amount: 2372.90 },
      { description: '2 4 D Main (Adama)-400ml',  quantity: 25, unit: 'Nag', rate: 110.17, amount: 2754.25 },
    ],
  },
];

const PAYMENTS: Payment[] = [
  { date: '2026-01-06', amount: 50000,  mode: 'Bank Transfer', receiptNo: '9187',  bank: 'Bank of Maharashtra CC-20163489788' },
  { date: '2026-01-22', amount: 100000, mode: 'Bank Transfer', receiptNo: '9714',  bank: 'HDFC Bank-99999822997551' },
  { date: '2026-02-17', amount: 100000, mode: 'Bank Transfer', receiptNo: '10502', bank: 'HDFC Bank-99999822997551' },
  { date: '2026-03-02', amount: 97345,  mode: 'Bank Transfer', receiptNo: '10911', bank: 'Bank of Maharashtra-899' },
  { date: '2026-03-09', amount: 100000, mode: 'Bank Transfer', receiptNo: '11173', bank: 'HDFC Bank-99999822997551' },
  { date: '2026-03-16', amount: 100000, mode: 'Bank Transfer', receiptNo: '11436', bank: 'HDFC Bank-99999822997551' },
];

export interface ShrinathImportCounts { purchases: number; payments: number; skipped: boolean; }

export async function runShrinathImport(db: Firestore, tenantId: string, force = false): Promise<ShrinathImportCounts> {
  if (!force) {
    const check = await getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('sourceRef', '==', SOURCE_REF)));
    if (!check.empty) return { purchases: 0, payments: 0, skipped: true };
  } else {
    await deleteBySourceRef(db, tenantId, SOURCE_REF, ['purchaseOrders', 'supplierPayments']);
  }

  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => { await batch.commit(); batch = writeBatch(db); ops = 0; };
  const maybeFlush = async () => { if (ops >= 490) await flush(); };
  const ts = Timestamp.now();
  const counts: ShrinathImportCounts = { purchases: 0, payments: 0, skipped: false };

  batch.set(getTenantDoc(db, tenantId, 'suppliers', 'SHRINATH_KRUSHI_SEVA_KENDRA'), {
    name: SUPPLIER_NAME, address: SUPPLIER_ADDRESS, phone: SUPPLIER_PHONE,
    outstandingBalance: CLOSING_BALANCE, totalInvoiced: TOTAL_INVOICED, totalPaid: TOTAL_PAID,
    balanceAsOf: '2026-03-31', sourceRef: SOURCE_REF, updatedAt: ts,
  }, { merge: true });
  ops++;

  for (const inv of INVOICES) {
    const ref = doc(getTenantCollection(db, tenantId, 'purchaseOrders'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, poNumber: inv.vchNo, poDate: inv.date,
      totalAmount: inv.amount, taxableValue: inv.taxableValue,
      cgst: inv.cgst, sgst: inv.sgst, totalTax: inv.cgst + inv.sgst,
      lines: inv.lines.map(l => ({ description: l.description, quantity: l.quantity, unit: l.unit, rate: l.rate, amount: l.amount, gstPct: 18, hsnCode: '' })),
      status: 'received', sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.purchases++;
    await maybeFlush();
  }

  for (const pmt of PAYMENTS) {
    const ref = doc(getTenantCollection(db, tenantId, 'supplierPayments'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, amount: pmt.amount, mode: pmt.mode,
      date: pmt.date, receiptNo: pmt.receiptNo,
      notes: `${pmt.bank} | Receipt ${pmt.receiptNo}`,
      sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.payments++;
    await maybeFlush();
  }

  await flush();
  return counts;
}
