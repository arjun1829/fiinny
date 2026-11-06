import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { expirySecret } from "../notifications/reassignment";

/**
 * Invoice PDFs, issued when the seller accepts an order (web, app, manual and
 * recovered orders alike). The PDF itself is built by the Next app
 * (app/lib/order-invoice.ts); these functions only ask for it, through
 * POST /api/orders/invoice with the shared server secret, which is idempotent
 * and refuses orders that aren't accepted yet.
 */

const APP_BASE_URL = "https://krishidukan.com";

async function requestInvoice(orderId: string): Promise<boolean> {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/orders/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": await expirySecret() },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) {
      logger.warn("[invoice] route returned non-OK", { orderId, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("[invoice] request failed", { orderId, err: String(err) });
    return false;
  }
}

/** Statuses that have an invoice — same list as types/order.ts INVOICE_READY_STATUSES. */
const INVOICE_READY = new Set(["accepted", "dispatched", "out_for_delivery", "delivered"]);

/**
 * The invoice is issued when the seller ACCEPTS the order — not when it is
 * placed, since the seller may still reject it. Runs on the move into an
 * accepted (or later) status for an order with no stored invoice; any other
 * update returns straight away. Replaces generateInvoiceForNewOrder.
 */
export const generateInvoiceOnAccept = onDocumentUpdated({ document: "orders/{orderId}", region: "asia-south1" }, async (event) => {
  const before = event.data?.before.data() as Record<string, unknown> | undefined;
  const after = event.data?.after.data() as Record<string, unknown> | undefined;
  if (!after || !INVOICE_READY.has(String(after.status ?? ""))) return;
  if (before && INVOICE_READY.has(String(before.status ?? ""))) return;
  if ((after.invoice as { storagePath?: string } | undefined)?.storagePath) return;
  await requestInvoice(event.params.orderId);
});

/**
 * Safety net, every 15 minutes: any order from the last 24 hours that still
 * has no invoice (the trigger ran before the route was deployed, the route was
 * briefly down, or a web order's browser-side generation failed) is asked for
 * again. Single-field range query, filtered in memory — no composite index.
 */
export const sweepMissingInvoices = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Asia/Kolkata" },
  async () => {
    // Give the website's own generation a few minutes before stepping in.
    const newest = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const oldest = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const snap = await admin
      .firestore()
      .collection("orders")
      .where("createdAt", ">", oldest)
      .where("createdAt", "<", newest)
      .limit(300)
      .get();

    // Only accepted (or later) orders have an invoice; placed ones wait.
    const missing = snap.docs.filter(
      (d) =>
        INVOICE_READY.has(String(d.data().status ?? "")) &&
        !(d.data().invoice as { storagePath?: string } | undefined)?.storagePath,
    );
    let ok = 0;
    for (const d of missing.slice(0, 40)) {
      if (await requestInvoice(d.id)) ok += 1;
    }
    logger.info("[invoice-sweep]", { examined: snap.size, missing: missing.length, generated: ok });
  },
);
