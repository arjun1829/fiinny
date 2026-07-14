/**
 * Shared supplier-ledger amount formulas — the single source of truth for
 * "what is this PO / supplier invoice / payment worth". Used by both
 * supplierLedgerSync.ts (per-supplier cache refresh) and Master Analytics
 * (tenant-wide, date-filtered aggregation), so the two can never disagree.
 */
import { getDocs, Firestore, Timestamp } from 'firebase/firestore';
import { getTenantCollection } from './tenantPath';

export interface SupplierPO { id?: string; supplierName?: string; totalAmount?: number; amount?: number; poDate?: string; date?: string; status?: string; createdAt?: Timestamp; }
export interface SupplierPayment { id?: string; supplierName?: string; amount?: number; date?: string; createdAt?: Timestamp; }
export interface SupplierInvoiceDoc { id?: string; supplierId?: string; supplierName?: string; netAmount?: number; invoiceDate?: string; createdAt?: Timestamp; }
export interface SupplierDoc { id: string; name: string; createdAt?: Timestamp; }

export const poAmount = (po: SupplierPO): number => Number(po.totalAmount ?? po.amount ?? 0);
export const invAmount = (inv: SupplierInvoiceDoc): number => Number(inv.netAmount ?? 0);
export const pmtAmount = (p: SupplierPayment): number => Number(p.amount ?? 0);

/** The date a PO/invoice/payment doc counts against for filtering & trend charts — mirrors poDateVal/sortVal in SupplierLedgerDetailPage. */
export const poDateVal = (po: SupplierPO) => po.poDate ?? po.date ?? po.createdAt;
export const invDateVal = (inv: SupplierInvoiceDoc) => inv.invoiceDate ?? inv.createdAt;
export const pmtDateVal = (p: SupplierPayment) => p.date ?? p.createdAt;

/** Millisecond value for a Firestore Timestamp, date string, or missing value — mirrors sortVal in SupplierLedgerDetailPage. */
export function docDateMs(v: Timestamp | string | undefined): number {
    if (!v) return 0;
    if (typeof v === 'string') { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
    if (typeof v.toMillis === 'function') return v.toMillis();
    return 0;
}

export interface RawSupplierCollections {
    suppliers: SupplierDoc[];
    purchaseOrders: SupplierPO[];
    payments: SupplierPayment[];
    invoices: SupplierInvoiceDoc[];
}

/** Fetches all four supplier-ledger collections for a tenant, tenant-scoped, in parallel — used by Master Analytics. */
export async function fetchSupplierLedgerCollections(db: Firestore, tenantId: string): Promise<RawSupplierCollections> {
    const [supSnap, posSnap, pmtsSnap, invSnap] = await Promise.all([
        getDocs(getTenantCollection(db, tenantId, 'suppliers')),
        getDocs(getTenantCollection(db, tenantId, 'purchaseOrders')),
        getDocs(getTenantCollection(db, tenantId, 'supplierPayments')),
        getDocs(getTenantCollection(db, tenantId, 'supplierInvoices')),
    ]);
    return {
        suppliers: supSnap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierDoc)),
        purchaseOrders: posSnap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierPO)),
        payments: pmtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierPayment)),
        invoices: invSnap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierInvoiceDoc)),
    };
}
