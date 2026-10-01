import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { subscriptionEventId } from "../../../lib/ads/openai-pixel";
import {
  conversionsApiConfigured,
  sendSubscriptionCreated,
} from "../../../lib/ads/openai-conversions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ads/subscription-created
 *
 * Reports a NEWLY paid seller subscription to OpenAI Ads, for the "Paid seller
 * subscription" data source.
 *
 * WHY THIS EXISTS AT ALL, RATHER THAN JUST THE PIXEL:
 * the browser is not a trustworthy place to decide this. Two reasons specific
 * to this codebase:
 *
 *  1. The Pixel fires wherever it is called from, so a page that merely LOOKS
 *     like success would report a conversion. The only facts that make this a
 *     real paid enrolment live on the server: Razorpay says the payment was
 *     captured, and a subscription document actually exists for it.
 *  2. Activation here is written from the browser (firebase.ts
 *     updateSubscriptionStatus). Payments whose activation never completed do
 *     exist in this project's data. Confirming the subscription document
 *     server-side is what keeps those out of the conversion count.
 *
 * So the client may ASK for this event, but every condition is re-checked here
 * against Razorpay and Firestore. Nothing the caller sends is trusted except
 * the payment id it is asking about, and the `oppref` the Pixel captured
 * (which the Conversions API cannot read for itself).
 *
 * WHAT IS DELIBERATELY NOT COUNTED: opening checkout, signing up, loading a
 * success URL, a failed or cancelled payment, a free trial, an admin's manual
 * activation (no captured Razorpay payment), and renewals or seat top-ups by a
 * seller who already had a subscription.
 *
 * Always returns 200 with a `status`. This endpoint is advisory — a failure
 * here must never look like a failed purchase to the caller.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

type Outcome =
  | "sent"
  | "duplicate"
  | "renewal"
  | "not_activated"
  | "not_captured"
  | "forbidden"
  | "not_configured"
  | "send_failed";

function done(status: Outcome, extra?: Record<string, unknown>) {
  return NextResponse.json({ status, ...extra });
}

export async function POST(req: NextRequest) {
  try {
    const header = req.headers.get("Authorization") ?? "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!idToken) return done("forbidden");

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return done("forbidden");
    }

    const body = (await req.json()) as { razorpayPaymentId?: string; oppref?: string | null };
    const paymentId = String(body.razorpayPaymentId ?? "").trim();
    if (!paymentId) return done("forbidden");

    const db = getAdminDb();

    // ── The subscription must actually exist (activation confirmed) ───────
    const subSnap = await db
      .collection("subscriptions")
      .where("razorpayPaymentId", "==", paymentId)
      .limit(2)
      .get();
    if (subSnap.empty) return done("not_activated");

    const subDoc = subSnap.docs[0];
    const sub = subDoc.data();

    // The caller must own what they are reporting.
    if (sub.ownerId && sub.ownerId !== uid) return done("forbidden");

    // An admin's manual activation carries no captured gateway payment, and a
    // revoked or non-active record is not an enrolment.
    if (sub.subscriptionStatus && sub.subscriptionStatus !== "active") {
      return done("not_activated");
    }

    // ── Razorpay must say the money was actually captured ─────────────────
    try {
      const payment = (await razorpay.payments.fetch(paymentId)) as { status?: string };
      if (payment?.status !== "captured") return done("not_captured");
    } catch {
      // Unverifiable means not reported. A hand-typed payment id on a manual
      // activation lands here, which is the intended outcome.
      return done("not_captured");
    }

    // ── New enrolment, not a renewal or a seat top-up ──────────────────────
    // updateSubscriptionStatus writes a fresh subscription document for every
    // purchase, so an earlier document for the same owner means this seller was
    // already subscribed and must not be counted as a new subscriber.
    const owners: Promise<FirebaseFirestore.QuerySnapshot>[] = [
      db.collection("subscriptions").where("ownerId", "==", uid).get(),
    ];
    if (sub.ownerPhone) {
      owners.push(
        db.collection("subscriptions").where("ownerPhone", "==", sub.ownerPhone).get(),
      );
    }
    const ownerSnaps = await Promise.all(owners);

    const thisCreated = sub.createdAt?.toMillis?.() ?? sub.startDate?.toMillis?.() ?? null;
    const seen = new Set<string>();
    let hasEarlier = false;
    for (const snap of ownerSnaps) {
      for (const d of snap.docs) {
        if (d.id === subDoc.id || seen.has(d.id)) continue;
        seen.add(d.id);
        const other = d.data();
        const created = other.createdAt?.toMillis?.() ?? other.startDate?.toMillis?.() ?? null;
        // Unknown timestamps count as earlier: a prior subscription we cannot
        // date is still a prior subscription, and under-reporting a renewal is
        // safer than inflating new-subscriber numbers.
        if (thisCreated === null || created === null || created < thisCreated) {
          hasEarlier = true;
          break;
        }
      }
      if (hasEarlier) break;
    }
    if (hasEarlier) return done("renewal");

    const eventId = subscriptionEventId(paymentId);

    // Without a key we cannot send, so do NOT reserve the deduplication record
    // — that would permanently suppress this conversion once the key is added.
    if (!conversionsApiConfigured()) return done("not_configured", { eventId });

    // ── Reserve exactly once, so retries and refreshes cannot double-report ─
    const ref = db.collection("adConversions").doc(eventId);
    const reserved = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return false;
      tx.create(ref, {
        eventId,
        event: "subscription_created",
        razorpayPaymentId: paymentId,
        subscriptionId: subDoc.id,
        ownerId: uid,
        status: "sending",
        createdAt: new Date().toISOString(),
      });
      return true;
    });
    if (!reserved) return done("duplicate", { eventId });

    const origin = new URL(req.url).origin;
    const result = await sendSubscriptionCreated({
      eventId,
      sourceUrl: `${origin}/dashboard/subscription`,
      oppref: typeof body.oppref === "string" && body.oppref ? body.oppref : null,
    });

    if (!result.ok) {
      // Release the reservation so a later retry can still report this.
      await ref.delete().catch(() => {});
      console.error("[ads/subscription-created] send failed:", result);
      return done("send_failed", { eventId });
    }

    await ref.update({ status: "sent", sentAt: new Date().toISOString() });
    return done("sent", { eventId });
  } catch (err) {
    console.error("[ads/subscription-created] failed:", err);
    return done("send_failed");
  }
}
