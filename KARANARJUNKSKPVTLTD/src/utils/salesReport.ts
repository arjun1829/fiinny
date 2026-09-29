/**
 * Sales Report — pure calculation helpers.
 *
 * Extracted from SalesReportPage so the field-mapping logic (which must agree
 * with how POS / B2B invoices actually store their sales orders) can be
 * unit-tested in isolation. No Firestore, no React here.
 *
 * IMPORTANT: this module only READS the existing salesOrders schema written by
 * POSPage (B2C) and B2BInvoicePage (B2B). It never introduces a new sales
 * model, and it must not diverge from the payment fields those pages persist:
 *   - grandTotal / netAmount / totalAmount — the bill total
 *   - amountPaid / paidAmount              — how much has been collected
 *   - creditAmount                         — POS-recorded outstanding (B2C)
 *   - paymentStatus                        — 'Paid' | 'Partial' | 'Pending'
 */

import { classifySale, type SaleChannel } from './stockReport';

export type { SaleChannel };

// Payment classification surfaced in the report — derived from paid vs. total,
// NOT from the raw paymentMethod string (which can be UPI/Card/Khata/etc.).
export type PaymentType = 'cash' | 'credit' | 'partial';

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
    cash:    'Cash',
    credit:  'Credit',
    partial: 'Partial',
};

// ── Raw shape (a subset of the salesOrders document) ────────────────────────
export interface RawSalesOrder {
    orderNumber?: string;
    invoiceDate?: string;
    status?: string;

    // Customer / party (POS uses retailerName+address; B2B uses buyerName+buyerAddress).
    retailerName?: string;
    buyerName?: string;
    address?: string;
    buyerAddress?: string;
    taluka?: string;
    district?: string;
    pin?: string | number;

    // Amounts — several aliases exist across POS/B2B; resolve in priority order.
    grandTotal?: number | string;
    netAmount?: number | string;
    totalAmount?: number | string;
    amount?: number | string;
    amountPaid?: number | string;
    paidAmount?: number | string;
    creditAmount?: number | string;
    paymentStatus?: string;
    paymentMethod?: string;
    modeOfPayment?: string;
}

export interface SalesBillRow {
    orderId: string;
    billNumber: string;
    date: string;                // YYYY-MM-DD (invoiceDate)
    channel: SaleChannel;        // sale_pos (B2C) | sale_b2b
    customerName: string;
    address: string;
    billAmount: number;
    amountPaid: number;
    outstanding: number;         // credit / outstanding remaining on the bill
    paymentType: PaymentType;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const has = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

/** The bill total — first defined alias among the POS/B2B aliases. */
export function resolveBillAmount(o: RawSalesOrder): number {
    return num(o.grandTotal ?? o.netAmount ?? o.totalAmount ?? o.amount ?? 0);
}

/**
 * How much has been collected against the bill. Mirrors POSPage's live
 * outstanding lookup: prefer the explicit amountPaid/paidAmount field; when
 * absent, fall back to the paymentStatus flag (Paid ⇒ fully paid, else 0).
 */
export function resolveAmountPaid(o: RawSalesOrder, billAmount: number): number {
    const raw = o.amountPaid ?? o.paidAmount;
    if (has(raw)) return Math.max(0, num(raw));
    return String(o.paymentStatus || '').toLowerCase() === 'paid' ? billAmount : 0;
}

/**
 * Payment classification for the report. Derived purely from paid vs. total so
 * paid + outstanding always reconciles to the bill:
 *   - nothing outstanding  → Cash (fully settled)
 *   - nothing paid         → Credit
 *   - some of each         → Partial
 */
export function classifyPayment(billAmount: number, amountPaid: number): PaymentType {
    const outstanding = billAmount - amountPaid;
    if (outstanding <= 0.005) return 'cash';
    if (amountPaid <= 0.005) return 'credit';
    return 'partial';
}

/** Compose a human-readable address across the differing POS/B2B fields. */
export function resolveAddress(o: RawSalesOrder): string {
    if (has(o.buyerAddress)) return String(o.buyerAddress).trim();
    return [o.address, o.taluka, o.district, o.pin]
        .map(p => (has(p) ? String(p).trim() : ''))
        .filter(Boolean)
        .join(', ');
}

/**
 * Map one salesOrders document to a report row. Returns null for cancelled
 * orders or documents missing an invoice date (nothing to place on the report).
 */
export function resolveSalesBill(orderId: string, o: RawSalesOrder): SalesBillRow | null {
    if (String(o.status || '').toLowerCase() === 'cancelled') return null;
    const date = o.invoiceDate || '';
    if (!date) return null;

    const billNumber = (o.orderNumber || '').trim() || orderId.slice(-8).toUpperCase();
    const channel = classifySale(o.orderNumber || '');
    const billAmount = resolveBillAmount(o);
    const amountPaid = Math.min(billAmount, resolveAmountPaid(o, billAmount));
    const outstanding = Math.max(0, billAmount - amountPaid);
    const paymentType = classifyPayment(billAmount, amountPaid);

    return {
        orderId,
        billNumber,
        date,
        channel,
        customerName: o.retailerName || o.buyerName || 'Walk-in Customer',
        address: resolveAddress(o),
        billAmount,
        amountPaid,
        outstanding,
        paymentType,
    };
}
