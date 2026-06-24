/**
 * LUCKY KRUSHI SEVA KENDRA — Supplier AP Import
 * Opp. Sahakari Bank Main Road Karjat, Tal-Karjat, Ahmednagar 414402
 * Mobile: 9860909522
 *
 * 10 purchase bills ₹4,55,730 | 21 payments/credits ₹4,16,105
 * Closing balance: ₹39,625 (Karan Arjun owes Lucky)
 * Period: 01 Apr 2025 – 31 Mar 2026
 */
import { writeBatch, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { deleteBySourceRef } from './importCleanup';

const SUPPLIER_NAME    = 'LUCKY KRUSHI SEVA KENDRA';
const SUPPLIER_ADDRESS = 'Opp. Sahakari Bank Main Road Karjat, Tal-Karjat, Ahmednagar 414402';
const SUPPLIER_PHONE   = '9860909522';
const CLOSING_BALANCE  = 39625;
const TOTAL_INVOICED   = 455730;
const TOTAL_PAID       = 416105;
const SOURCE_REF       = 'LUCKY_SUPPLIER_IMPORT';

interface Bill { billNo: string; date: string; amount: number; type: string; notes?: string; }
interface Payment { date: string; amount: number; mode: string; notes: string; }

const BILLS: Bill[] = [
  { billNo: 'P260000648', date: '2025-05-21', amount: 4050,   type: 'Insecticide' },
  { billNo: 'P260000666', date: '2025-05-22', amount: 9720,   type: 'Insecticide' },
  { billNo: 'S260000232', date: '2025-05-23', amount: 20750,  type: 'Seeds', notes: 'Ref 7393' },
  { billNo: 'S260000272', date: '2025-05-23', amount: 154700, type: 'Seeds', notes: 'Ref 7363' },
  { billNo: 'S260000497', date: '2025-05-31', amount: 60600,  type: 'Seeds', notes: 'Ref 7605' },
  { billNo: 'S260000898', date: '2025-06-05', amount: 46000,  type: 'Seeds', notes: 'Walunj Sagar' },
  { billNo: 'P260000944', date: '2025-06-09', amount: 32010,  type: 'Insecticide', notes: 'MAJOR' },
  { billNo: 'S260001673', date: '2025-06-27', amount: 45700,  type: 'Seeds', notes: 'Sagar Walunj' },
  { billNo: 'S260001981', date: '2025-07-18', amount: 44900,  type: 'Seeds', notes: 'Sagar Walunj' },
  { billNo: 'S260002461', date: '2025-09-06', amount: 37300,  type: 'Seeds', notes: 'Ref 7742' },
];

const PAYMENTS: Payment[] = [
  { date: '2025-06-02', amount: 20000, mode: 'Cash', notes: 'Cash Jama Shinde Saheb' },
  { date: '2025-06-03', amount: 20000, mode: 'Cash', notes: 'Cash Jama Shinde Saheb' },
  { date: '2025-06-04', amount: 20000, mode: 'Cash', notes: 'Cash Jama Shinde Saheb' },
  { date: '2025-06-05', amount: 10000, mode: 'Cash', notes: 'Cash Jama Shinde Saheb' },
  { date: '2025-07-04', amount: 6815,  mode: 'Sales Return', notes: 'SRT No. 2600134 Ref S260000232' },
  { date: '2025-09-06', amount: 30000, mode: 'Bank Transfer', notes: 'Transfer 617380496527' },
  { date: '2025-11-02', amount: 20000, mode: 'Cash', notes: 'Cash Jama' },
  { date: '2025-11-03', amount: 20000, mode: 'Cash', notes: 'Cash Jama' },
  { date: '2025-11-03', amount: 10000, mode: 'Cash', notes: 'Cash Jama' },
  { date: '2025-11-18', amount: 20000, mode: 'Cash', notes: 'Cash Jama' },
  { date: '2025-11-19', amount: 20000, mode: 'Cash', notes: 'Cash Jama' },
  { date: '2025-12-19', amount: 50000, mode: 'Bank Transfer', notes: 'Transfer 854239769214' },
  { date: '2026-01-08', amount: 20000, mode: 'Bank Transfer', notes: 'Transfer 280574064827' },
  { date: '2026-01-08', amount: 15000, mode: 'Cash', notes: 'Cash Shinde Saheb' },
  { date: '2026-01-08', amount: 15000, mode: 'Cash', notes: 'Cash Shinde Saheb' },
  { date: '2026-02-03', amount: 70000, mode: 'Cheque', notes: 'TRF Cheque' },
  { date: '2026-02-14', amount: 22500, mode: 'Credit Note', notes: 'CR Note CBN2600158 | CORN5101 - 90 PKT × ₹250' },
  { date: '2026-02-14', amount: 13500, mode: 'Credit Note', notes: 'CR Note CBN2600159 | CORN5106 - 54 PKT × ₹250' },
  { date: '2026-02-14', amount: 5400,  mode: 'Credit Note', notes: 'CR Note CBN2600160 | CORN5252 - 20 PKT × ₹270' },
  { date: '2026-02-14', amount: 1680,  mode: 'Credit Note', notes: 'CR Note CBN2600161 | BAJRA 4242 - 24 PKT × ₹70' },
  { date: '2026-02-14', amount: 6210,  mode: 'Credit Note', notes: 'CR Note CBN2600162 | CORN5402 - 27 PKT × ₹230' },
];

export interface LuckyImportCounts { purchases: number; payments: number; skipped: boolean; }

export async function runLuckyImport(db: Firestore, tenantId: string, force = false): Promise<LuckyImportCounts> {
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
  const counts: LuckyImportCounts = { purchases: 0, payments: 0, skipped: false };

  batch.set(getTenantDoc(db, tenantId, 'suppliers', 'LUCKY_KRUSHI_SEVA_KENDRA'), {
    name: SUPPLIER_NAME, address: SUPPLIER_ADDRESS, phone: SUPPLIER_PHONE,
    outstandingBalance: CLOSING_BALANCE, totalInvoiced: TOTAL_INVOICED, totalPaid: TOTAL_PAID,
    balanceAsOf: '2026-03-31', sourceRef: SOURCE_REF, updatedAt: ts,
  }, { merge: true });
  ops++;

  for (const bill of BILLS) {
    const ref = doc(getTenantCollection(db, tenantId, 'purchaseOrders'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, poNumber: bill.billNo, poDate: bill.date,
      totalAmount: bill.amount, taxableValue: bill.amount,
      notes: `${bill.type}${bill.notes ? ' | ' + bill.notes : ''}`,
      status: 'received', sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.purchases++;
    await maybeFlush();
  }

  for (const pmt of PAYMENTS) {
    const ref = doc(getTenantCollection(db, tenantId, 'supplierPayments'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, amount: pmt.amount,
      mode: pmt.mode, date: pmt.date, notes: pmt.notes,
      sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.payments++;
    await maybeFlush();
  }

  await flush();
  return counts;
}
