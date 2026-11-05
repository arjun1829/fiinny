import { getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantDoc } from './tenantPath';
import { fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { buildB2BInvoiceHtml } from './b2bInvoiceHtml';

/**
 * Fetches a saved B2B invoice from Firestore, generates standalone HTML,
 * and opens the browser print dialog — without navigating to the editing page.
 */
export async function printB2BInvoice(orderId: string, tenantId: string): Promise<void> {
    const [orderSnap, branding] = await Promise.all([
        getDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId)),
        fetchInvoiceBranding(tenantId),
    ]);

    if (!orderSnap.exists()) {
        alert('Invoice not found.');
        return;
    }

    const html = buildB2BInvoiceHtml(orderSnap.data(), branding);

    const win = window.open('', '_blank');
    if (!win) {
        alert('Please allow popups to print the invoice.');
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 700);
}
