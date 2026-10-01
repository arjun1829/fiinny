/**
 * Read-only usage view for a single promo code — SUCCESSFUL SUBSCRIPTIONS only.
 *
 * A promo counts as "used" only once a subscription was successfully created
 * with it. Attribution lives on the subscription doc (`promoCode`), written from
 * the gateway-verified value at activation time (see app/api/payment/verify +
 * updateSubscriptionStatus / _activateSubscription). Payments that were merely
 * attempted, failed, cancelled or abandoned never produce a subscription doc, so
 * they are excluded here by construction.
 *
 * Idempotent: results are de-duplicated by `razorpayOrderId`, so a duplicate
 * webhook/callback/retry that wrote a second subscription doc for the same
 * payment is still counted once.
 *
 * Additive — reads only `subscriptions` (+ `users` for display names). Does not
 * touch Razorpay, the payment flow, promo validation or discount calculation.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../../lib/firebase-admin";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { subscriptionPlanLabel } from "../../../../../lib/pricing";

interface Ctx {
  params: Promise<{ id: string }>;
}

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  return null;
}

/** Resolves a buyer's display name from users/{phone} then users/{uid}. */
async function resolveName(
  db: FirebaseFirestore.Firestore,
  ownerPhone: string | null,
  ownerId: string | null,
): Promise<string | null> {
  for (const key of [ownerPhone, ownerId]) {
    if (!key) continue;
    try {
      const snap = await db.collection("users").doc(key).get();
      if (!snap.exists) continue;
      const d = snap.data() ?? {};
      const name =
        (d.businessName && String(d.businessName)) ||
        (d.name && String(d.name)) ||
        (d.ownerName && String(d.ownerName)) ||
        (d.shopName && String(d.shopName)) ||
        "";
      if (name) return name;
    } catch {
      /* try next key */
    }
  }
  return null;
}

export async function GET(request: Request, { params }: Ctx) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const { id } = await params;
    const db = getAdminDb();

    // The code is stored uppercased on the subscription doc (both clients
    // normalise it). Single-field equality → auto-indexed; no composite index.
    const snap = await db
      .collection("subscriptions")
      .where("promoCode", "==", id)
      .get();

    // Idempotency: collapse duplicate subscription docs that share a Razorpay
    // order id (duplicate callbacks/retries) into one logical use. Docs with no
    // order id (should not happen for a paid sub) fall back to their doc id.
    const seen = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of snap.docs) {
      const d = doc.data();
      const key = String(d.razorpayOrderId ?? `doc:${doc.id}`);
      if (!seen.has(key)) seen.set(key, { ...d, __id: doc.id });
    }

    const uses = await Promise.all(
      Array.from(seen.values()).map(async (d) => {
        const ownerPhone = d.ownerPhone != null ? String(d.ownerPhone) : null;
        const ownerId = d.ownerId != null ? String(d.ownerId) : null;
        return {
          id: String(d.__id),
          name: await resolveName(db, ownerPhone, ownerId),
          ownerPhone,
          ownerType: d.ownerType != null ? String(d.ownerType) : null,
          planName: subscriptionPlanLabel(d),
          durationMonths:
            typeof d.durationMonths === "number" ? d.durationMonths : null,
          seatsPurchased:
            typeof d.seatsPurchased === "number" ? d.seatsPurchased : null,
          amountPaid: typeof d.amountPaid === "number" ? d.amountPaid : null,
          currency: d.currency != null ? String(d.currency) : "INR",
          subscriptionStatus:
            d.subscriptionStatus != null ? String(d.subscriptionStatus) : null,
          razorpayOrderId:
            d.razorpayOrderId != null ? String(d.razorpayOrderId) : null,
          purchasedAt: toIso(d.startDate) ?? toIso(d.createdAt),
        };
      }),
    );

    uses.sort((a, b) => (b.purchasedAt ?? "").localeCompare(a.purchasedAt ?? ""));

    // The code's discount % (current), surfaced for context. Existing field.
    let discountPercent: number | null = null;
    try {
      const promoSnap = await db.collection("promoCodes").doc(id).get();
      const pv = promoSnap.exists ? promoSnap.data()?.discountPercent : undefined;
      if (typeof pv === "number") discountPercent = pv;
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({
      code: id,
      discountPercent,
      counts: { total: uses.length },
      uses,
    });
  } catch (e) {
    console.error("[api/admin/promo-codes/:id/usage GET]", e);
    return NextResponse.json(
      { error: "Failed to load promo usage." },
      { status: 500 },
    );
  }
}
