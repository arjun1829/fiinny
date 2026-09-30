import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { expirySecret } from "../notifications/reassignment";

/**
 * Invoice PDFs for orders the website did not write.
 *
 * The web builds the invoice in the customer's browser right after creating an
 * order. An order written by the mobile app — or rebuilt by the payment webhook
 * — never had one, so the /invoice/{orderId} link in the WhatsApp message gave
 * "not yet generated". The PDF itself is built by the Next app
 * (app/lib/order-invoice.ts, the same builder the web uses); these functions
 * only make sure it is asked for. Both call POST /api/orders/invoice with the
 * shared server secret, which is idempotent.
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

/**
 * A new order with no invoice number was not written by the website (which
 * stamps one at creation and builds its own PDF) — so generate it now. Web
 * orders are left to the sweep below, which only acts if their own browser-side
 * generation failed.
 */
export const generateInvoiceForNewOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const d = event.data?.data() as Record<string, unknown> | undefined;
  if (!d || d.invoiceNumber || (d.invoice as { storagePath?: string } | undefined)?.storagePath) return;
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

    const missing = snap.docs.filter(
      (d) => !(d.data().invoice as { storagePath?: string } | undefined)?.storagePath,
    );
    let ok = 0;
    for (const d of missing.slice(0, 40)) {
      if (await requestInvoice(d.id)) ok += 1;
    }
    logger.info("[invoice-sweep]", { examined: snap.size, missing: missing.length, generated: ok });
  },
);
