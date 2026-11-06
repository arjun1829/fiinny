/**
 * Which purchase bills are fully paid?
 *
 * Supplier payments are mostly recorded against the supplier's running account,
 * not against a specific bill (only a few carry linkedInvoiceId). So paid
 * status per bill is worked out the way an accountant adjusts an "on account"
 * ledger:
 *
 *   1. A payment linked to a bill/PO settles that document first.
 *   2. Everything else (unlinked payments + any linked overpayment) settles the
 *      supplier's oldest dues first (FIFO by bill / PO date).
 *
 * Dues and amounts use the same formulas as the supplier ledger
 * (poAmount / invAmount / pmtAmount in supplierAnalytics.ts), so the per-bill
 * picture always adds up to the ledger's outstanding balance.
 */
import {
    poAmount, invAmount, pmtAmount, poDateVal, invDateVal,
    type SupplierPO, type SupplierPayment, type SupplierInvoiceDoc,
} from './supplierAnalytics';
import { toIsoDate, partyKey } from './billFilters';

export interface BillPaidInfo { amount: number; paid: number; due: number; fullyPaid: boolean }

type Deletable = { id?: string; deleted?: boolean };
type Payment = SupplierPayment & Deletable & { linkedInvoiceId?: string | null; linkedInvoiceType?: 'po' | 'invoice' | null; paymentDate?: string };

interface Due { key: string; invoiceId?: string; date: string; amount: number; left: number }

/** Half a rupee of tolerance for rounding in stored amounts. */
const TOLERANCE = 0.5;

export function allocateSupplierPayments(input: {
    suppliers: { id: string; name?: string }[];
    purchaseOrders: (SupplierPO & Deletable)[];
    invoices: (SupplierInvoiceDoc & Deletable)[];
    payments: Payment[];
}): Map<string, BillPaidInfo> {
    // Older docs carry only supplierName — resolve them to the supplier id.
    const idByName = new Map(input.suppliers.map(s => [partyKey(s.name), s.id]));
    const supplierOf = (d: { supplierId?: string; supplierName?: string }) =>
        d.supplierId || idByName.get(partyKey(d.supplierName)) || `name:${partyKey(d.supplierName)}`;

    const dues = new Map<string, Due[]>();
    const dueByDoc = new Map<string, Due>();
    const add = (sup: string, d: Due) => {
        if (!dues.has(sup)) dues.set(sup, []);
        dues.get(sup)!.push(d);
        dueByDoc.set(d.key, d);
    };
    for (const po of input.purchaseOrders) {
        if (po.deleted) continue;
        const amount = poAmount(po);
        add(supplierOf(po), { key: `po:${po.id}`, date: toIsoDate(poDateVal(po)) ?? '9999', amount, left: amount });
    }
    for (const inv of input.invoices) {
        if (inv.deleted) continue;
        const amount = invAmount(inv);
        add(supplierOf(inv), { key: `invoice:${inv.id}`, invoiceId: inv.id, date: toIsoDate(invDateVal(inv)) ?? '9999', amount, left: amount });
    }

    // Pool of money per supplier after linked payments are applied.
    const pool = new Map<string, number>();
    for (const p of input.payments) {
        if (p.deleted) continue;
        let amt = pmtAmount(p);
        if (amt <= 0) continue;
        const target = p.linkedInvoiceId ? dueByDoc.get(`${p.linkedInvoiceType || 'invoice'}:${p.linkedInvoiceId}`) : undefined;
        if (target) {
            const used = Math.min(target.left, amt);
            target.left -= used;
            amt -= used;
        }
        const sup = supplierOf(p);
        pool.set(sup, (pool.get(sup) ?? 0) + amt);
    }

    const out = new Map<string, BillPaidInfo>();
    for (const [sup, list] of dues) {
        let money = pool.get(sup) ?? 0;
        list.sort((a, b) => a.date.localeCompare(b.date));
        for (const d of list) {
            const used = Math.min(d.left, money);
            d.left -= used;
            money -= used;
            if (d.invoiceId) {
                const due = Math.max(0, Math.round(d.left * 100) / 100);
                out.set(d.invoiceId, { amount: d.amount, paid: Math.round((d.amount - due) * 100) / 100, due, fullyPaid: due <= TOLERANCE });
            }
        }
    }
    return out;
}
