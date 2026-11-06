import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { randomBytes } from "crypto";
import { notify } from "../notify";
import { queueWaNotification } from "../wa-notify";

/**
 * Notifications + timekeeping for seller reassignment. The state machine and
 * every money movement live in the Next app (app/lib/order-reassignment.ts);
 * this file only tells candidates about offers and keeps the 24h clock.
 */

/**
 * The shared secret for the expiry route, kept in a server-only Firestore doc
 * (_serverConfig is denied to every client in firestore.rules) and read by
 * BOTH sides. Using the Next app's CRON_SECRET env var instead would mean this
 * function and the web deploy each carry their own copy — and if they ever
 * differed, every ping would be refused and reassigning orders would never
 * expire, so customers would never be auto-refunded. One source can't disagree
 * with itself. Generated on first run.
 */
export async function expirySecret(): Promise<string> {
  const ref = admin.firestore().collection("_serverConfig").doc("cron");
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.data()?.reassignmentExpirySecret;
    if (typeof existing === "string" && existing.length >= 32) return existing;
    const created = randomBytes(32).toString("hex");
    tx.set(ref, { reassignmentExpirySecret: created }, { merge: true });
    return created;
  });
}

/** Where the Next API (and so the expiry route) is served. */
const APP_BASE_URL = "https://krishidukan.com";

/**
 * A candidate seller was offered a rejected order → tell them. The offer doc
 * is written server-side when the original seller rejects; tapping the
 * notification opens the Requests section of the seller's Orders tab.
 */
export const notifySellerOfOrderOffer = onDocumentCreated(
  { document: "sellerOffers/{sellerKey}/offers/{orderId}", region: "asia-south1" },
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d || d.status !== "open") return;

    const sellerPhone = String(d.sellerPhone ?? "");
    const orderId = String(d.orderId ?? "");
    const summary = String(d.itemSummary ?? "an order");
    const earning = typeof d.sellerEarning === "number" ? ` · earn ₹${d.sellerEarning}` : "";
    const area = [d.deliveryCity, d.deliveryPincode].filter(Boolean).join(" ");

    await notify(
      sellerPhone,
      "order_offer",
      "New order request 🛒",
      `Another seller couldn't fulfil ${summary}${area ? ` for ${area}` : ""}${earning}. Accept within 24 hours to deliver it.`,
      { orderId },
    );

    await queueWaNotification(
      sellerPhone,
      `🛒 नवीन ऑर्डर विनंती — ${summary}`,
      {
        template: "order_reassign_offer",
        type: "order",
        payload: { product: summary, area },
        source: { event: "order_reassign_offer", entityType: "order", entityId: orderId },
      },
    );
  },
);

/**
 * An admin reassigned an order to a new retailer (app/lib/admin-order-
 * reassignment.ts writes order.adminReassignment). Tell the new retailer it has
 * landed on them, and the previous retailer it has been taken off them. Fires
 * only on the transition INTO a reassignment (the audit timestamp changing), so
 * re-saving the order later does not re-notify.
 */
export const notifyOnAdminReassignment = onDocumentWritten(
  { document: "orders/{orderId}", region: "asia-south1" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after?.adminReassignment) return;
    const at = String(after.adminReassignment.at ?? "");
    if (!at || before?.adminReassignment?.at === at) return; // not a new reassignment

    const orderId = event.params.orderId;
    const toPhone = String(after.adminReassignment.toSellerPhone ?? "");
    const fromPhone = String(after.adminReassignment.fromSellerPhone ?? "");
    const items = Array.isArray(after.items) ? after.items : [];
    const first = items[0] as Record<string, unknown> | undefined;
    const summary = first
      ? `${String(first.name ?? "an item")}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
      : "an order";

    if (toPhone) {
      await notify(
        toPhone,
        "order_reassigned_to_you",
        "New order assigned 🛒",
        `An order for ${summary} has been routed to you. Open it to accept and fulfil.`,
        { orderId },
      );
      await queueWaNotification(
        toPhone,
        `🛒 नवीन ऑर्डर — ${summary}`,
        {
          template: "order_reassign_offer",
          type: "order",
          payload: { product: summary, area: "" },
          source: { event: "order_admin_reassigned", entityType: "order", entityId: orderId },
        },
      );
    }

    if (fromPhone) {
      await notify(
        fromPhone,
        "order_reassigned_away",
        "Order reassigned",
        `An order for ${summary} was reassigned to another store by the KrishiDukan team.`,
        { orderId },
      );
    }
  },
);

/**
 * Pings the expiry route every 15 minutes. The refund itself is done there,
 * by refundOrder — the one refund implementation — rather than restated here.
 * Until that route is deployed this just logs a 404; nothing is refunded and
 * nothing breaks, because no order can be 'reassigning' before the reject
 * route that creates them is live either.
 */
export const expireOrderReassignments = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Asia/Kolkata" },
  async () => {
    try {
      const res = await fetch(`${APP_BASE_URL}/api/cron/order-reassignment-expiry`, {
        method: "POST",
        headers: { "x-cron-secret": await expirySecret() },
      });
      const body = await res.text();
      if (!res.ok) {
        logger.warn("[reassignment-expiry] route returned non-OK", { status: res.status, body: body.slice(0, 300) });
        return;
      }
      logger.info("[reassignment-expiry] swept", { result: body.slice(0, 500) });
    } catch (err) {
      logger.error("[reassignment-expiry] ping failed", { err: String(err) });
    }
  },
);
