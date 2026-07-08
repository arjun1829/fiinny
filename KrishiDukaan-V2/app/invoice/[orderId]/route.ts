import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "../../lib/firebase-admin";

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
  const storagePath = order.invoice?.storagePath as string | undefined;
  const invoiceNumber = (
    order.invoice?.invoiceNumber ?? order.invoiceNumber ?? orderId
  ) as string;

  if (!storagePath) {
    return new NextResponse("Invoice not yet generated for this order.", { status: 404 });
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
