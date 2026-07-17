/**
 * M/S. PAWAN FERTILIZERS — Supplier AP Import
 * New Shopping Centre, Mahatma Phule Chowk, Market Yard, Ahmednagar 414001
 * Phone: (0241) 2359007
 *
 * 2 purchase orders ₹3,76,500 | 8 payments/credits ₹3,76,500
 * Closing balance: ₹0 (FULLY SETTLED as of 16/03/2026)
 * Period: 01 Apr 2025 – 31 Mar 2026
 */
import { writeBatch, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { deleteBySourceRef } from './importCleanup';

const SUPPLIER_NAME    = 'M/S. PAWAN FERTILIZERS';
const SUPPLIER_ADDRESS = 'New Shopping Centre, Mahatma Phule Chowk, Market Yard, Ahmednagar 414001';
const SUPPLIER_PHONE   = '(0241) 2359007';
const CLOSING_BALANCE  = 0;
const TOTAL_INVOICED   = 376500;
const TOTAL_PAID       = 376500;
const SOURCE_REF       = 'PAWAN_FERTILIZERS_IMPORT';

interface Bill { billNo: string; date: string; amount: number; refNo?: string; }
interface Payment { date: string; amount: number; mode: string; notes: string; receiptNo?: string; }

const BILLS: Bill[] = [
  { billNo: 'D260000890', date: '2025-05-17', amount: 226100, refNo: '11001' },
  { billNo: 'D260001062', date: '2025-05-20', amount: 150400, refNo: '11104' },
];

const PAYMENTS: Payment[] = [
  { date: '2025-05-15', amount: 80000, mode: 'Cheque/DD', notes: 'Union Bank CH/DD KARAN',    receiptNo: '350' },
  { date: '2025-05-15', amount: 10000, mode: 'Cheque/DD', notes: 'Union Bank CH/DD KASRAN',   receiptNo: '351' },
  { date: '2025-05-15', amount: 5000,  mode: 'Cheque/DD', notes: 'Union Bank CH/DD KARAN',    receiptNo: '352' },
  { date: '2025-05-17', amount: 83600, mode: 'Cash',       notes: 'Cash payment',             receiptNo: '349' },
  { date: '2025-05-17', amount: 80000, mode: 'Cheque/DD', notes: 'Union Bank CH/DD KARAN',    receiptNo: '381' },
  { date: '2025-07-15', amount: 90000, mode: 'Cash',       notes: 'Cash payment',             receiptNo: '1737' },
  { date: '2025-11-08', amount: 1800,  mode: 'Credit Note', notes: 'CR Note CBN2600140 | PHI BAJRA 40 PKT @ ₹45' },
  { date: '2026-03-16', amount: 26100, mode: 'Credit Note', notes: 'CR Note CBN2601722 | MAHYCO CORN 3845S' },
];

export interface PawanImportCounts { purchases: number; payments: number; skipped: boolean; }

export async function runPawanFertilizersImport(db: Firestore, tenantId: string, force = false): Promise<PawanImportCounts> {
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
  const counts: PawanImportCounts = { purchases: 0, payments: 0, skipped: false };

  batch.set(getTenantDoc(db, tenantId, 'suppliers', 'PAWAN_FERTILIZERS'), {
    name: SUPPLIER_NAME, address: SUPPLIER_ADDRESS, phone: SUPPLIER_PHONE,
    outstandingBalance: CLOSING_BALANCE, totalInvoiced: TOTAL_INVOICED, totalPaid: TOTAL_PAID,
    balanceAsOf: '2026-03-16', sourceRef: SOURCE_REF, updatedAt: ts,
  }, { merge: true });
  ops++;

  for (const bill of BILLS) {
    const ref = doc(getTenantCollection(db, tenantId, 'purchaseOrders'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, poNumber: bill.billNo, poDate: bill.date,
      totalAmount: bill.amount, taxableValue: bill.amount,
      refNo: bill.refNo ?? null, status: 'received',
      notes: `Seeds | Ref ${bill.refNo}`,
      sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.purchases++;
    await maybeFlush();
  }

  for (const pmt of PAYMENTS) {
    const ref = doc(getTenantCollection(db, tenantId, 'supplierPayments'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, amount: pmt.amount,
      mode: pmt.mode, date: pmt.date, notes: pmt.notes,
      receiptNo: pmt.receiptNo ?? null,
      sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.payments++;
    await maybeFlush();
  }

  await flush();
  return counts;
}
