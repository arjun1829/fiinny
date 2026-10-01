/**
 * Successful-use counts for every promo code, for the Promo Codes list.
 *
 * "Successful use" = a subscription doc exists carrying `promoCode`. Attempted /
 * failed / cancelled / abandoned payments never create one, so they are excluded
 * by construction. Counts are de-duplicated by `razorpayOrderId` so a duplicate
 * callback/retry that wrote two subscription docs for one payment counts once.
 *
 * One indexed equality query per promo code (codes are few); no full-collection
 * scan and no composite index. Additive read-only endpoint — touches nothing in
 * the payment / Razorpay / validation / discount paths.
 *
 * Note: this static segment sits beside the dynamic `[id]` route. Next.js
 * resolves the literal `/usage-counts` here, and `/<CODE>` to `[id]`.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../lib/admin-auth";

export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const db = getAdminDb();
    const codesSnap = await db.collection("promoCodes").get();
    const codes = codesSnap.docs.map((d) => String(d.data()?.code ?? d.id));

    const counts: Record<string, number> = {};
    await Promise.all(
      codes.map(async (code) => {
        const subs = await db
          .collection("subscriptions")
          .where("promoCode", "==", code)
          .get();
        const orders = new Set<string>();
        for (const s of subs.docs) {
          const d = s.data();
          orders.add(String(d.razorpayOrderId ?? `doc:${s.id}`));
        }
        counts[code] = orders.size;
      }),
    );

    return NextResponse.json({ counts });
  } catch (e) {
    console.error("[api/admin/promo-codes/usage-counts GET]", e);
    return NextResponse.json(
      { error: "Failed to load promo usage counts." },
      { status: 500 },
    );
  }
}
