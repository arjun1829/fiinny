import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "./firebase-admin";
import { buildInvoiceBlob } from "../utils/invoice-generator";
import type { OrderDoc } from "../../types/order";

/**
 * Server-side invoice PDF for ANY order.
 *
 * The web used to build the invoice inside the customer's browser, right after
 * writing the order — so an order written by the mobile app, or rebuilt by the
 * payment webhook, never got a PDF and its /invoice/{orderId} link (the one in
 * the WhatsApp message) answered "not yet generated". This runs the very same
 * builder (utils/invoice-generator) on the server, so every order, from every
 * client, gets the same invoice, stored where /invoice/[orderId] already looks:
 *
 *   Storage   invoices/{orderId}/{invoiceNumber}.pdf
 *   Firestore orders/{orderId}.invoice { invoiceNumber, storagePath, generatedAt, version }
 *
 * Idempotent: an order that already has an invoice is left alone unless `force`
 * is set (used to regenerate after a correction).
 */
export type InvoiceOutcome =
  | { ok: true; generated: boolean; storagePath: string; invoiceNumber: string }
  | { ok: false; status: number; error: string };

export async function ensureOrderInvoice(
  orderId: string,
  opts: { force?: boolean } = {},
): Promise<InvoiceOutcome> {
  const db = getAdminDb();
  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: "Order not found." };

  const data = snap.data() as Record<string, unknown>;
  const invoiceNumber = String(data.invoiceNumber ?? `INV-${orderId.slice(0, 8).toUpperCase()}`);
  const existing = (data.invoice as { storagePath?: string } | undefined)?.storagePath;
  if (existing && !opts.force) {
    return { ok: true, generated: false, storagePath: existing, invoiceNumber };
  }

  try {
    const order = { id: orderId, ...data, invoiceNumber } as unknown as OrderDoc;
    const bytes = Buffer.from(await buildInvoiceBlob(order).arrayBuffer());
    const storagePath = `invoices/${orderId}/${invoiceNumber}.pdf`;
    await getAdminStorage()
      .bucket()
      .file(storagePath)
      .save(bytes, { contentType: "application/pdf", resumable: false });

    await ref.update({
      // An order that never had a number (recovered / older app orders) gets
      // the same one the invoice shows.
      ...(data.invoiceNumber ? {} : { invoiceNumber }),
      invoice: { invoiceNumber, storagePath, generatedAt: FieldValue.serverTimestamp(), version: 1 },
    });
    return { ok: true, generated: true, storagePath, invoiceNumber };
  } catch (e) {
    console.error("[order-invoice] generation failed", orderId, e);
    return { ok: false, status: 500, error: "Could not generate the invoice." };
  }
}
