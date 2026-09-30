import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { isInternalRequest } from "../../../lib/internal-auth";
import { ensureOrderInvoice } from "../../../lib/order-invoice";

/**
 * POST /api/orders/invoice   { orderId, force? }
 *
 * Generates (or returns) the invoice PDF for an order — see lib/order-invoice.
 *
 * Who may call it:
 *   - our own Cloud Functions (x-cron-secret) — the order-created trigger and
 *     the sweep that catches any order still without an invoice;
 *   - the order's customer (the app calls it right after writing an order);
 *   - the order's seller or an admin.
 * `force` (regenerate) is admin / internal only.
 */
export async function POST(request: Request) {
  let body: { orderId?: unknown; force?: unknown } = {};
  try { body = await request.json(); } catch { /* handled below */ }
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId || orderId.includes("/")) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const internal = await isInternalRequest(request);
  let isAdmin = internal;

  if (!internal) {
    const header = request.headers.get("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    let uid: string;
    try { uid = (await getAdminAuth().verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ error: "Invalid authorization token." }, { status: 401 }); }

    const db = getAdminDb();
    const [orderSnap, idx, userDoc] = await Promise.all([
      db.collection("orders").doc(orderId).get(),
      db.collection("uidIndex").doc(uid).get(),
      db.collection("users").doc(uid).get(),
    ]);
    if (!orderSnap.exists) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const o = orderSnap.data() ?? {};
    const phone = idx.exists ? String(idx.data()?.phone ?? "") : "";
    const bare = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
    const isCustomer = o.customerId === uid;
    const isSeller =
      !!phone && [o.sellerPhone, o.sellerId].some((v) => bare(v) && bare(v) === bare(phone));
    let role = String(userDoc.data()?.role ?? "");
    if (!role && phone) role = String((await db.collection("users").doc(phone).get()).data()?.role ?? "");
    isAdmin = role === "admin";
    if (!isCustomer && !isSeller && !isAdmin) {
      return NextResponse.json({ error: "This is not your order." }, { status: 403 });
    }
  }

  const res = await ensureOrderInvoice(orderId, { force: body.force === true && isAdmin });
  if (res.ok === false) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, generated: res.generated, invoiceNumber: res.invoiceNumber });
}
