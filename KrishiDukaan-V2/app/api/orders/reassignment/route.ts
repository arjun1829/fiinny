import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { acceptReassignment, declineReassignment } from "../../../lib/order-reassignment";

/**
 * POST /api/orders/reassignment  { orderId, action: "accept" | "decline" }
 *
 * A candidate seller answering an offer for an order another seller rejected
 * (see lib/order-reassignment.ts). The caller's identity comes from their
 * verified ID token, never the body — being a candidate is checked inside the
 * accept transaction against the order's own candidate list.
 */
export async function POST(req: NextRequest) {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid authorization token" }, { status: 401 });
  }

  const idx = await getAdminDb().collection("uidIndex").doc(uid).get();
  const phone = idx.exists ? String(idx.data()?.phone ?? "").trim() : "";
  if (!phone) return NextResponse.json({ error: "No seller account found for this login." }, { status: 403 });

  let body: { orderId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  try {
    if (body.action === "accept") {
      const res = await acceptReassignment(orderId, phone);
      if (res.ok === false) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, orderId, accepted: true, payout: res.transfer });
    }
    if (body.action === "decline") {
      const res = await declineReassignment(orderId, phone);
      if (res.ok === false) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, orderId, declined: true });
    }
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
  } catch (e) {
    console.error("[orders/reassignment] failed:", e);
    return NextResponse.json({ error: "Could not update the request." }, { status: 500 });
  }
}
