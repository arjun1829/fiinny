/**
 * STHAPLING KRUSHI SEVA KENDRA — Supplier AP Import
 * A/p-Mahijalgaon, Tal-Karjat, Ahmednagar 414401
 * Mobile: 9763713544, 9970865721
 *
 * FY2025-26: 35 bills ₹26,98,078.90 | 26 RTGS payments ₹20,90,000
 * FY2026-27: ₹1,00,000 (05/05/2026) + ₹1,80,000 & ₹20,000 RTGS (18/06/2026,
 *            receipts RC27000153 / RC27000154)
 * Current outstanding: ₹3,08,078.90 (as on 18/06/2026)
 */
import { writeBatch, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { deleteBySourceRef } from './importCleanup';

const SUPPLIER_NAME    = 'STHAPLING KRUSHI SEVA KENDRA';
const SUPPLIER_ADDRESS = 'A/p-Mahijalgaon, Tal-Karjat, Ahmednagar 414401';
const SUPPLIER_PHONE   = '9763713544, 9970865721';
const CLOSING_BALANCE  = 308078.90;
const TOTAL_INVOICED   = 2698078.90;
const TOTAL_PAID       = 2390000;
const SOURCE_REF       = 'STHAPLING_SUPPLIER_IMPORT';

interface Bill { billNo: string; date: string; amount: number; refNo?: string; }
interface Payment { date: string; amount: number; notes: string; }

const BILLS: Bill[] = [
  { billNo: 'SL26000655', date: '2025-06-01', amount: 50480 },
  { billNo: 'SL26001079', date: '2025-06-22', amount: 228598,   refNo: '1297' },
  { billNo: 'SL26001271', date: '2025-06-28', amount: 78890,    refNo: '953'  },
  { billNo: 'SL26001252', date: '2025-06-28', amount: 89280,    refNo: '925'  },
  { billNo: 'SL26001448', date: '2025-07-05', amount: 115005,   refNo: '975'  },
  { billNo: 'SL26001467', date: '2025-07-05', amount: 28930 },
  { billNo: 'SL26001601', date: '2025-07-12', amount: 7360 },
  { billNo: 'SL26001622', date: '2025-07-12', amount: 85125,    refNo: '1410' },
  { billNo: 'SL26001877', date: '2025-07-24', amount: 11720.80 },
  { billNo: 'SL26001913', date: '2025-07-25', amount: 45654.40, refNo: '1445' },
  { billNo: 'SL26002034', date: '2025-07-29', amount: 23320 },
  { billNo: 'SL26002243', date: '2025-08-10', amount: 68259.20, refNo: '1493' },
  { billNo: 'SL26002489', date: '2025-08-26', amount: 80698.20 },
  { billNo: 'SL26002813', date: '2025-09-18', amount: 50290 },
  { billNo: 'SL26002821', date: '2025-09-18', amount: 12450,    refNo: '1602' },
  { billNo: 'SL26003159', date: '2025-10-11', amount: 21500 },
  { billNo: 'SL26003599', date: '2025-11-10', amount: 72589.60 },
  { billNo: 'SL26004215', date: '2025-12-10', amount: 153331.80 },
  { billNo: 'SL26004217', date: '2025-12-10', amount: 17040 },
  { billNo: 'SL26004346', date: '2025-12-17', amount: 84184.20 },
  { billNo: 'SL26004588', date: '2025-12-26', amount: 161290.80 },
  { billNo: 'SL26004589', date: '2025-12-26', amount: 299496 },
  { billNo: 'SL26004689', date: '2025-12-31', amount: 47400.80 },
  { billNo: 'SL26004697', date: '2025-12-31', amount: 36100 },
  { billNo: 'SL26004817', date: '2026-01-05', amount: 26400 },
  { billNo: 'SL26004820', date: '2026-01-05', amount: 121324.30 },
  { billNo: 'SL26004875', date: '2026-01-06', amount: 27600,    refNo: '1833' },
  { billNo: 'SL26004905', date: '2026-01-08', amount: 167340 },
  { billNo: 'SL26004983', date: '2026-01-11', amount: 90523.20 },
  { billNo: 'SL26005107', date: '2026-01-15', amount: 20783.40 },
  { billNo: 'SL26005335', date: '2026-01-25', amount: 81272.40 },
  { billNo: 'SL26005382', date: '2026-01-26', amount: 26000,    refNo: '1849' },
  { billNo: 'SL26005457', date: '2026-01-29', amount: 37930 },
  { billNo: 'SL26005463', date: '2026-01-29', amount: 100714.20 },
  { billNo: 'SL26005623', date: '2026-02-03', amount: 129197.60 },
];

const PAYMENTS: Payment[] = [
  { date: '2025-07-08', amount: 250000, notes: 'BY RTGS 08/07/2025' },
  { date: '2025-08-06', amount: 100000, notes: 'BY RTGS 06/08/2025' },
  { date: '2025-10-06', amount: 100000, notes: 'BY RTGS 6/10/25' },
  { date: '2025-10-03', amount: 50000,  notes: 'BY RTGS 03/10/2025' },
  { date: '2025-11-24', amount: 50000,  notes: 'BY RTGS 24/11/25' },
  { date: '2025-12-06', amount: 50000,  notes: 'BY RTGS 06/12/2025' },
  { date: '2025-12-16', amount: 50000,  notes: 'BY RTGS 16/12/2025' },
  { date: '2025-12-22', amount: 70000,  notes: 'BY RTGS 22/12/2025' },
  { date: '2025-12-25', amount: 50000,  notes: 'BY RTGS 25/12/2025' },
  { date: '2025-11-10', amount: 50000,  notes: 'BY RTGS 10/11/2025' },
  { date: '2025-12-29', amount: 50000,  notes: 'BY RTGS 29/12/2025' },
  { date: '2025-12-31', amount: 25000,  notes: 'BY RTGS 31/12/2025' },
  { date: '2026-01-05', amount: 70000,  notes: 'BY RTGS 05/01/2026' },
  { date: '2026-01-07', amount: 25000,  notes: 'BY RTGS 07/01/2026' },
  { date: '2026-01-10', amount: 50000,  notes: 'BY RTGS 10/01/2026' },
  { date: '2026-01-19', amount: 100000, notes: 'BY RTGS 19/01/2026' },
  { date: '2026-01-23', amount: 100000, notes: 'BY RTGS 23/01/2026 (50000+50000)' },
  { date: '2026-01-28', amount: 100000, notes: 'BY RTGS 28/01/2026' },
  { date: '2026-02-02', amount: 50000,  notes: 'BY RTGS 2/2/26' },
  { date: '2026-02-05', amount: 100000, notes: 'BY RTGS 05/02/2026' },
  { date: '2026-02-23', amount: 100000, notes: 'BY RTGS 23/02/2026' },
  { date: '2026-03-13', amount: 100000, notes: 'BY RTGS 13/03/2026' },
  { date: '2026-03-18', amount: 100000, notes: 'BY RTGS 18/03/2026' },
  { date: '2026-03-20', amount: 100000, notes: 'BY RTGS 20/03/2026' },
  { date: '2026-03-25', amount: 100000, notes: 'BY RTGS 25/03/2026' },
  { date: '2026-03-27', amount: 100000, notes: 'BY RTGS 27/03/2026' },
  // FY2026-27
  { date: '2026-03-05', amount: 100000, notes: 'BY RTGS 05/03/2026 (credited 05/05/2026)' },
  { date: '2026-06-18', amount: 180000, notes: 'BY RTGS 18/06/2026 (Receipt RC27000153)' },
  { date: '2026-06-18', amount: 20000,  notes: 'BY RTGS 18/06/2026 ONLINE (Receipt RC27000154)' },
];

export interface StaphlingImportCounts {
  purchases: number;
  payments: number;
  skipped: boolean;
}

export async function runStaphlingImport(db: Firestore, tenantId: string, force = false): Promise<StaphlingImportCounts> {
  if (!force) {
    const check = await getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('sourceRef', '==', SOURCE_REF)));
    if (!check.empty) return { purchases: 0, payments: 0, skipped: true };
  } else {
    await deleteBySourceRef(db, tenantId, SOURCE_REF, ['purchaseOrders', 'supplierPayments']);
  }

  const OPS_LIMIT = 490;
  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => { await batch.commit(); batch = writeBatch(db); ops = 0; };
  const maybeFlush = async () => { if (ops >= OPS_LIMIT) await flush(); };
  const ts = Timestamp.now();
  const counts: StaphlingImportCounts = { purchases: 0, payments: 0, skipped: false };

  const supplierRef = getTenantDoc(db, tenantId, 'suppliers', 'STHAPLING_KRUSHI_SEVA_KENDRA');
  batch.set(supplierRef, {
    name: SUPPLIER_NAME, address: SUPPLIER_ADDRESS, phone: SUPPLIER_PHONE,
    outstandingBalance: CLOSING_BALANCE, totalInvoiced: TOTAL_INVOICED, totalPaid: TOTAL_PAID,
    balanceAsOf: '2026-06-18', sourceRef: SOURCE_REF, updatedAt: ts,
  }, { merge: true });
  ops++;

  for (const bill of BILLS) {
    const ref = doc(getTenantCollection(db, tenantId, 'purchaseOrders'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, poNumber: bill.billNo, poDate: bill.date,
      totalAmount: bill.amount, taxableValue: bill.amount,
      refNo: bill.refNo ?? null, status: 'received',
      notes: bill.refNo ? `Ref: ${bill.refNo}` : 'Direct purchase',
      sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.purchases++;
    await maybeFlush();
  }

  for (const pmt of PAYMENTS) {
    const ref = doc(getTenantCollection(db, tenantId, 'supplierPayments'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, amount: pmt.amount, mode: 'RTGS',
      date: pmt.date, notes: pmt.notes, sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.payments++;
    await maybeFlush();
  }

  await flush();
  return counts;
}
