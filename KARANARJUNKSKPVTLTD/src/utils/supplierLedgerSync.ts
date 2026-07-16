/**
 * Recomputes a supplier's cached ledger totals (totalInvoiced/totalPaid/
 * outstandingBalance on suppliers/{id}) from the underlying purchaseOrders,
 * supplierInvoices and supplierPayments collections, and persists them.
 *
 * This is the single source of truth for that aggregation — originally lived
 * only inside SupplierLedgerDetailPage's load(persist=true) path, which meant
 * any writer that didn't route through that page (e.g. Supplier Invoice
 * create/edit) left the cached fields stale. Call this after any write that
 * changes a supplier's invoiced/paid amounts.
 *
 * The per-doc amount formulas (poAmount/invAmount/pmtAmount) live in
 * supplierAnalytics.ts and are shared with Master Analytics, so both always
 * agree on what a PO/invoice/payment is "worth" even though this function
 * still uses its own targeted, supplier-scoped queries for performance.
 */
import { getDoc, getDocs, updateDoc, query, where, serverTimestamp, Firestore } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantPath';
import { poAmount, invAmount, pmtAmount } from './supplierAnalytics';

export async function syncSupplierTotals(db: Firestore, tenantId: string, supplierId: string): Promise<void> {
    const supSnap = await getDoc(getTenantDoc(db, tenantId, 'suppliers', supplierId));
    if (!supSnap.exists()) return;
    const supplierName = supSnap.data().name;

    const [posSnap, pmtsSnap, invSnap] = await Promise.all([
        getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierName', '==', supplierName))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierPayments'), where('supplierName', '==', supplierName))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierInvoices'), where('supplierId', '==', supplierId))),
    ]);

    const poInvoiced = posSnap.docs.reduce((s, d) => s + poAmount(d.data()), 0);
    const invInvoiced = invSnap.docs.reduce((s, d) => s + invAmount(d.data()), 0);
    const totalInvoiced = poInvoiced + invInvoiced;
    const totalPaid = pmtsSnap.docs.reduce((s, d) => s + pmtAmount(d.data()), 0);
    const outstandingBalance = totalInvoiced - totalPaid;

    await updateDoc(getTenantDoc(db, tenantId, 'suppliers', supplierId), {
        totalInvoiced, totalPaid, outstandingBalance, updatedAt: serverTimestamp(),
    });
}
