import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "../../lib/firebase-admin";
import { ensureOrderInvoice } from "../../lib/order-invoice";
import { isInvoiceReady } from "../../../types/order";

/** A small readable page instead of bare text (this link is opened from WhatsApp). */
function messagePage(title: string, body: string, status: number): NextResponse {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · KrishiDukan</title><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f5;color:#1b1c1b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}main{background:#fff;border-radius:16px;padding:28px 24px;max-width:420px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-size:18px;margin:0 0 8px;color:#1f6b2e}p{margin:0 0 18px;font-size:14px;line-height:1.5;color:#44483f}a{display:inline-block;background:#1f6b2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><a href="/">Go to KrishiDukan</a></main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * GET /invoice/:orderId
 *
 * Public endpoint that proxies the stored invoice PDF from Firebase Storage.
 * The Firebase Storage URL is never exposed to the client — the browser always
 * sees krishidukan.com/invoice/{orderId}.
 *
 * Flow:
 *   1. Fetch the order document from Firestore (Admin SDK — no client auth needed).
 *   2. Read invoice.storagePath.
 *   3. Download PDF bytes from Firebase Storage (Admin SDK).
 *   4. Return as application/pdf so the browser renders inline.
 *
 * 404 when the order doesn't exist or the invoice hasn't been generated yet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const { orderId } = params;

  // 1. Fetch order
  const db = getAdminDb();
  const orderSnap = await db.collection("orders").doc(orderId).get();

  if (!orderSnap.exists) {
    return new NextResponse("Invoice not found.", { status: 404 });
  }

  const order = orderSnap.data()!;
  let storagePath = order.invoice?.storagePath as string | undefined;
  const invoiceNumber = (
    order.invoice?.invoiceNumber ?? order.invoiceNumber ?? orderId
  ) as string;

  if (!storagePath) {
    // The invoice is issued when the seller accepts the order; the WhatsApp
    // confirmation sent at checkout already carries this link.
    if (!isInvoiceReady(order.status)) {
      const closed = order.status === "rejected" || order.status === "cancelled";
      return messagePage(
        closed ? "No invoice for this order" : "Invoice not ready yet",
        closed
          ? "This order was cancelled, so no invoice was created."
          : "Your invoice will be ready once the seller accepts your order. Please check again after that.",
        closed ? 404 : 202,
      );
    }
    // Accepted but the background generation hasn't run yet: make it now.
    const made = await ensureOrderInvoice(orderId);
    if (made.ok && made.storagePath) storagePath = made.storagePath;
    if (!storagePath) {
      return messagePage("Invoice not ready yet", "We are preparing your invoice. Please try again in a minute.", 503);
    }
  }

  // 2. Download PDF from Storage
  const bucket = getAdminStorage().bucket();
  const file = bucket.file(storagePath);

  const [exists] = await file.exists();
  if (!exists) {
    return new NextResponse("Invoice file not found in storage.", { status: 404 });
  }

  const [contents] = await file.download();

  // 3. Lazy cleanup: remove stale downloadUrl written by old code, if present.
  // Fire-and-forget — a failure here must not block PDF delivery.
  if (order.invoice?.downloadUrl !== undefined) {
    db.collection("orders").doc(orderId).update({
      "invoice.downloadUrl": FieldValue.delete(),
    }).catch(() => {/* non-fatal */});
  }

  // 4. Return PDF — Storage URL is never sent to the client.
  // Buffer is wrapped as Uint8Array to satisfy NextResponse's BodyInit type.
  return new NextResponse(new Uint8Array(contents), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceNumber}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
