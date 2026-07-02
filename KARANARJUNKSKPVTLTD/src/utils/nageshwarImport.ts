/**
 * Nageshwar Krushi Seva Kendra — Supplier AP Import
 * A/p-Shinde, Tal-Karjat, Ahmednagar 414402
 * Phone: (02489)-241011, 9423208267
 *
 * Source: Statement of A/c (account 00479 "SUB D KARAN ARJUN K S K NADGAVO")
 *   FY2025-26 (01/04/2025–31/03/2026): opening ₹2,79,876 Dr → closing ₹81,706 Dr
 *   FY2026-27 (01/04/2026–...):         opening ₹81,706 Dr  → closing ₹70,206 Dr
 *
 * Reconciliation: opening 2,79,876 + bills 10,25,860 − payments 12,35,530 = 70,206.
 * "TO B.NO ..." rows are bills (purchases / AP). "BY ..." rows are payments /
 * returns that reduce the payable. Verified row-by-row against the running balance.
 */
import { writeBatch, doc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { deleteBySourceRef } from './importCleanup';

const SUPPLIER_NAME    = 'Nageshwar Krushi Seva Kendra';
const SUPPLIER_ADDRESS = 'A/p-Shinde, Tal-Karjat, Ahmednagar 414402';
const SUPPLIER_PHONE   = '(02489)-241011, 9423208267';
const SOURCE_REF       = 'NAGESHWAR_SUPPLIER_IMPORT';

export const OPENING_BALANCE = 279876;   // as on 01/04/2025 (Dr)
export const CLOSING_BALANCE = 70206;    // as on 15/06/2026 (Dr)

interface Bill { billNo: string; date: string; amount: number; notes?: string; }
interface Payment { date: string; amount: number; mode: string; notes: string; }

export const BILLS: Bill[] = [
  { billNo: 'SL26000178', date: '2025-05-14', amount: 1450,   notes: 'Ref No.163' },
  { billNo: 'SL26000318', date: '2025-05-30', amount: 36020 },
  { billNo: 'SL26000427', date: '2025-05-31', amount: 100400 },
  { billNo: 'SL26000569', date: '2025-06-03', amount: 54030,  notes: 'BAI SABLE POHACH' },
  { billNo: 'SL26000642', date: '2025-06-04', amount: 12000 },
  { billNo: 'SL26000703', date: '2025-06-05', amount: 12000,  notes: 'MULGA' },
  { billNo: 'SL26000771', date: '2025-06-05', amount: 12000 },
  { billNo: 'SL26000772', date: '2025-06-05', amount: 2500 },
  { billNo: 'SL26000796', date: '2025-06-06', amount: 12000 },
  { billNo: 'SL26000850', date: '2025-06-07', amount: 54000,  notes: 'SHOKAT' },
  { billNo: 'SL26000890', date: '2025-06-07', amount: 13400 },
  { billNo: 'SL26000888', date: '2025-06-12', amount: 17100 },
  { billNo: 'SL26001003', date: '2025-06-17', amount: 10200,  notes: 'Ref No.244' },
  { billNo: 'SL26001196', date: '2025-06-22', amount: 6800,   notes: 'Ref No.D-262 MEJAR' },
  { billNo: 'SL26001384', date: '2025-06-22', amount: 68750 },
  { billNo: 'SL26001385', date: '2025-06-22', amount: 17300 },
  { billNo: 'SL26001388', date: '2025-06-22', amount: 36000 },
  { billNo: 'SL26001389', date: '2025-06-22', amount: 54860 },
  { billNo: 'SL26002198', date: '2025-07-16', amount: 48800 },
  { billNo: 'SL26002197', date: '2025-07-16', amount: 113480 },
  { billNo: 'SL26002200', date: '2025-07-16', amount: 21820 },
  { billNo: 'SL26002457', date: '2025-07-31', amount: 3975,   notes: 'AVINASH GAYKWAD - SIJENTA' },
  { billNo: 'SL26003584', date: '2025-10-16', amount: 5200 },
  { billNo: 'SL26004204', date: '2025-11-12', amount: 5900,   notes: 'MEJAR' },
  { billNo: 'SL26004513', date: '2025-11-24', amount: 14400 },
  { billNo: 'SL26004653', date: '2025-11-30', amount: 30000 },
  { billNo: 'SL26004911', date: '2025-12-10', amount: 26000,  notes: 'Ref No.311' },
  { billNo: 'SL26004975', date: '2025-12-13', amount: 7560 },
  { billNo: 'SL26005066', date: '2025-12-18', amount: 5125 },
  { billNo: 'SL26005399', date: '2025-12-30', amount: 15600 },
  { billNo: 'SL26005519', date: '2026-01-01', amount: 157905 },
  { billNo: 'SL26005543', date: '2026-01-03', amount: 12800 },
  { billNo: 'SL26005675', date: '2026-01-10', amount: 5125 },
  { billNo: 'SL26005934', date: '2026-01-21', amount: 31360 },
];

/** Helper: N identical payment rows (the statement records many ₹10,000 cash drops). */
const rep = (n: number, p: Payment): Payment[] => Array.from({ length: n }, () => ({ ...p }));

export const PAYMENTS: Payment[] = [
  // ── FY2025-26 ──
  { date: '2025-05-29', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-05-30', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-05-31', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-05-31', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-05-31', amount: 6500,  mode: 'Cash',          notes: 'CASH' },
  { date: '2025-05-31', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-05-31', amount: 48500, mode: 'Bank Transfer', notes: '02/249 KARAN' },
  { date: '2025-05-31', amount: 25000, mode: 'Bank Transfer', notes: '02/249 KARAN' },
  { date: '2025-06-02', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-02', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-03', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-04', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-05', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-06', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-07', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-06-22', amount: 12520, mode: 'Sales Return',  notes: 'SRT NO. 2600036' },
  { date: '2025-07-15', amount: 100000, mode: 'Cash',         notes: 'CASH' },
  { date: '2025-07-18', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-07-18', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-07-18', amount: 10000, mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-07-18', amount: 5000,  mode: 'Cash',          notes: 'CASH BANTI' },
  { date: '2025-07-18', amount: 1600,  mode: 'Credit Note',   notes: 'ZINC 10KG - 5 BAG' },
  { date: '2025-08-15', amount: 51000, mode: 'Bank Transfer', notes: '02/249 KARAN ARJUN KSK' },
  { date: '2025-08-16', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-08-16', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-08-16', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-08-16', amount: 2000,  mode: 'Bank Transfer', notes: '02/249' },
  { date: '2025-08-16', amount: 18000, mode: 'Bank Transfer', notes: '02/249' },
  { date: '2025-11-08', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-11-08', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-11-08', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-11-08', amount: 6000,  mode: 'Cash',          notes: 'CASH' },
  { date: '2025-11-08', amount: 14000, mode: 'UPI',           notes: 'UPI 02/249 KARAN ARJUN KSK' },
  { date: '2025-11-25', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2025-11-25', amount: 25000, mode: 'UPI',           notes: 'UPI 02/249 KARAN ARJUN KSK' },
  { date: '2025-11-26', amount: 15000, mode: 'UPI',           notes: '02/249 UPI' },
  ...rep(10, { date: '2025-12-29', amount: 10000, mode: 'Cash', notes: 'CASH' }),
  ...rep(10, { date: '2026-01-03', amount: 10000, mode: 'Cash', notes: 'CASH' }),
  ...rep(5,  { date: '2026-01-06', amount: 10000, mode: 'Cash', notes: 'CASH' }),
  { date: '2026-01-13', amount: 10000, mode: 'Cash',          notes: 'CASH' },
  { date: '2026-01-13', amount: 3000,  mode: 'Cash',          notes: 'CASH' },
  ...rep(10, { date: '2026-01-16', amount: 10000, mode: 'Cash', notes: 'CASH' }),
  ...rep(5,  { date: '2026-01-28', amount: 10000, mode: 'Cash', notes: 'CASH' }),
  ...rep(10, { date: '2026-03-02', amount: 10000, mode: 'Cheque', notes: 'CH' }),
  { date: '2026-03-10', amount: 10000, mode: 'Cash',          notes: 'CASH GHULE SAHEB' },
  { date: '2026-03-10', amount: 10000, mode: 'Cash',          notes: 'CASH GHULE SAHEB' },
  { date: '2026-03-15', amount: 46160, mode: 'Sales Return',  notes: 'SRT NO. 2600107' },
  ...rep(5,  { date: '2026-03-17', amount: 10000, mode: 'Cash', notes: 'CASH' }),
  { date: '2026-03-17', amount: 7700,  mode: 'Cash',          notes: 'CASH' },
  { date: '2026-03-24', amount: 37050, mode: 'Sales Return',  notes: 'SELSH RETAN' },
  // ── FY2026-27 ──
  { date: '2026-06-15', amount: 10000, mode: 'Cash',          notes: 'CASH KARAN ARJUN GULVE' },
  { date: '2026-06-15', amount: 1500,  mode: 'Cash',          notes: 'CASH GULE' },
];

export const TOTAL_INVOICED = OPENING_BALANCE + BILLS.reduce((s, b) => s + b.amount, 0);
export const TOTAL_PAID = PAYMENTS.reduce((s, p) => s + p.amount, 0);

export interface NageshwarImportCounts {
  purchases: number;
  payments: number;
  skipped: boolean;
}

export async function runNageshwarImport(db: Firestore, tenantId: string, force = false): Promise<NageshwarImportCounts> {
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
  const counts: NageshwarImportCounts = { purchases: 0, payments: 0, skipped: false };

  const supplierRef = getTenantDoc(db, tenantId, 'suppliers', 'NAGESHWAR_KRUSHI_SEVA_KENDRA');
  batch.set(supplierRef, {
    name: SUPPLIER_NAME, address: SUPPLIER_ADDRESS, phone: SUPPLIER_PHONE,
    outstandingBalance: CLOSING_BALANCE, totalInvoiced: TOTAL_INVOICED, totalPaid: TOTAL_PAID,
    balanceAsOf: '2026-06-15', sourceRef: SOURCE_REF, updatedAt: ts,
  }, { merge: true });
  ops++;

  // Opening balance carried into the statement (01/04/2025) — modelled as a debit PO.
  const openRef = doc(getTenantCollection(db, tenantId, 'purchaseOrders'));
  batch.set(openRef, {
    supplierName: SUPPLIER_NAME, poNumber: 'OPENING-2025-04-01', poDate: '2025-04-01',
    totalAmount: OPENING_BALANCE, taxableValue: OPENING_BALANCE, status: 'received',
    notes: 'Opening balance as on 01/04/2025', sourceRef: SOURCE_REF, createdAt: ts,
  });
  ops++; counts.purchases++;

  for (const bill of BILLS) {
    const ref = doc(getTenantCollection(db, tenantId, 'purchaseOrders'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, poNumber: bill.billNo, poDate: bill.date,
      totalAmount: bill.amount, taxableValue: bill.amount, status: 'received',
      notes: bill.notes ?? 'Direct purchase', sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.purchases++;
    await maybeFlush();
  }

  for (const pmt of PAYMENTS) {
    const ref = doc(getTenantCollection(db, tenantId, 'supplierPayments'));
    batch.set(ref, {
      supplierName: SUPPLIER_NAME, amount: pmt.amount, mode: pmt.mode,
      date: pmt.date, notes: pmt.notes, sourceRef: SOURCE_REF, createdAt: ts,
    });
    ops++; counts.payments++;
    await maybeFlush();
  }

  await flush();
  return counts;
}
