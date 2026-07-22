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

    // Query by both the stable id and the current name and merge (deduped by
    // doc id): older PO/payment docs were only ever tagged with supplierName,
    // so an id-only query would silently drop them the moment a supplier gets
    // renamed, wiping totalPaid/outstandingBalance back to the wrong number.
    const [posByIdSnap, posByNameSnap, pmtsByIdSnap, pmtsByNameSnap, invSnap] = await Promise.all([
        getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierId', '==', supplierId))),
        getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), where('supplierName', '==', supplierName))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierPayments'), where('supplierId', '==', supplierId))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierPayments'), where('supplierName', '==', supplierName))),
        getDocs(query(getTenantCollection(db, tenantId, 'supplierInvoices'), where('supplierId', '==', supplierId))),
    ]);

    const posDocsMap = new Map<string, ReturnType<typeof posByIdSnap.docs[number]['data']>>();
    posByIdSnap.docs.forEach(d => posDocsMap.set(d.id, d.data()));
    posByNameSnap.docs.forEach(d => {
        if (!posDocsMap.has(d.id)) posDocsMap.set(d.id, d.data());
        if (!(d.data() as any).supplierId) updateDoc(getTenantDoc(db, tenantId, 'purchaseOrders', d.id), { supplierId }).catch(() => {});
    });
    const pmtDocsMap = new Map<string, ReturnType<typeof pmtsByIdSnap.docs[number]['data']>>();
    pmtsByIdSnap.docs.forEach(d => pmtDocsMap.set(d.id, d.data()));
    pmtsByNameSnap.docs.forEach(d => {
        if (!pmtDocsMap.has(d.id)) pmtDocsMap.set(d.id, d.data());
        if (!(d.data() as any).supplierId) updateDoc(getTenantDoc(db, tenantId, 'supplierPayments', d.id), { supplierId }).catch(() => {});
    });

    const poInvoiced = Array.from(posDocsMap.values()).reduce((s, d) => s + poAmount(d), 0);
    const invInvoiced = invSnap.docs.reduce((s, d) => s + invAmount(d.data()), 0);
    const totalInvoiced = poInvoiced + invInvoiced;
    const totalPaid = Array.from(pmtDocsMap.values()).reduce((s, d) => s + pmtAmount(d), 0);
    const outstandingBalance = totalInvoiced - totalPaid;

    await updateDoc(getTenantDoc(db, tenantId, 'suppliers', supplierId), {
        totalInvoiced, totalPaid, outstandingBalance, updatedAt: serverTimestamp(),
    });
}
