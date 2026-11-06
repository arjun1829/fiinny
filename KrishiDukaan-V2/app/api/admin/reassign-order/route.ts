import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/admin-auth";
import { getAdminDb } from "../../../lib/firebase-admin";
import { eligibleRetailersForOrder, reassignOrderByAdmin } from "../../../lib/admin-order-reassignment";

/**
 * Admin "Route Order" — reassign a placed, not-yet-accepted order to another
 * eligible retailer. All logic (eligibility, Razorpay transfer reverse/recreate,
 * concurrency, audit) is in lib/admin-order-reassignment.ts; this is the
 * admin-authenticated edge.
 *
 *   GET  ?orderId=…          → { eligible: EligibleRetailer[] }
 *   POST { orderId, newSellerPhone, reason } → reassigns
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const orderId = (req.nextUrl.searchParams.get("orderId") ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  try {
    const snap = await getAdminDb().collection("orders").doc(orderId).get();
    if (!snap.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const eligible = await eligibleRetailersForOrder(snap.data() as FirebaseFirestore.DocumentData);
    return NextResponse.json({ eligible });
  } catch (e) {
    console.error("[admin/reassign-order] eligibility lookup failed:", e);
    return NextResponse.json({ error: "Could not load eligible retailers." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { orderId?: string; newSellerPhone?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  try {
    const res = await reassignOrderByAdmin({
      orderId,
      newSellerPhone: String(body.newSellerPhone ?? ""),
      reason: String(body.reason ?? ""),
      adminUid: auth.uid,
    });
    if (res.ok === false) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true, orderId, ...res });
  } catch (e) {
    console.error("[admin/reassign-order] failed:", e);
    return NextResponse.json({ error: "Could not reassign the order." }, { status: 500 });
  }
}
