/**
 * Releases a seller's Razorpay Route transfer once their order is delivered.
 *
 * THE RULE
 * --------
 * Transfers are created on hold at checkout (see api/payment/create-cart-order).
 * Money sits with KrishiDukan until the seller marks the order delivered, and
 * then settles to them the NEXT DAY.
 *
 * WHY A FIRESTORE TRIGGER RATHER THAN AN API CALL
 * -----------------------------------------------
 * An order can be marked delivered from at least four places — the web seller
 * dashboard (app/firebase.ts updateOrderStatus), the mobile seller screen
 * (dashboard_repository.dart updateOrderStatus), the admin orders table, and the
 * WhatsApp webhook. Hanging the release off each of those means one of them
 * eventually ships without it, and the failure mode is a seller who delivered
 * and never got paid. A trigger on the document catches every path, including
 * ones added later.
 *
 * WHY NO SCHEDULER
 * ----------------
 * The "next day" delay is Razorpay's `on_hold_until`, not a cron of ours. We set
 * a release timestamp once, at delivery, and Razorpay settles at that moment. A
 * scheduled job re-checking held transfers would be a second source of truth
 * that can drift, double-release, or silently stop running.
 *
 * REVERSALS ARE OUT OF SCOPE by decision — this only ever releases, and it
 * never releases a transfer that has been reversed.
 */
import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");

const RAZORPAY_API = "https://api.razorpay.com/v1";

/** Hours between "marked delivered" and the money settling to the seller. */
const RELEASE_DELAY_HOURS = 24;

/**
 * Firestore path holding the live Route configuration.
 * Mirrors ROUTE_CONFIG_PATH in app/lib/route-split.ts; functions/ builds
 * separately from the Next app, so the path is restated rather than imported.
 */
const ROUTE_CONFIG = { collection: "settings", doc: "route" } as const;

/**
 * Whether this trigger is allowed to move money yet.
 *
 * Deliberately defaults to FALSE — the opposite of every other value in
 * settings/route, which fall back to safe live defaults so that a missing
 * document cannot take checkout down. This one is not a rate, it is a switch on
 * real transfers: deploying these functions before the document is seeded must
 * do nothing at all, rather than start settling money to sellers against a
 * configuration nobody has reviewed.
 *
 * Flip settings/route.releaseEnabled to true to turn releases on. It is read per
 * delivery rather than at deploy time, so enabling and disabling needs no
 * redeploy — which also means it can be switched off in seconds if a release
 * goes wrong.
 */
async function releaseEnabled(): Promise<boolean> {
  try {
    const snap = await admin
      .firestore()
      .collection(ROUTE_CONFIG.collection)
      .doc(ROUTE_CONFIG.doc)
      .get();
    return snap.exists && snap.data()?.releaseEnabled === true;
  } catch (err) {
    // A failed read is not a reason to act on an unknown configuration.
    logger.error("[route-release] settings/route unreadable, staying disabled", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

interface RazorpayTransfer {
  id: string;
  on_hold: boolean;
  amount_reversed?: number;
  on_hold_until: number | null;
  amount: number;
  recipient: string;
  notes?: Record<string, string>;
}

function authHeader(): string {
  const token = Buffer.from(
    `${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`,
  ).toString("base64");
  return `Basic ${token}`;
}

/** Every transfer created against a payment. */
async function fetchTransfersForPayment(paymentId: string): Promise<RazorpayTransfer[]> {
  const res = await fetch(`${RAZORPAY_API}/payments/${paymentId}/transfers`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(`fetch transfers failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { items?: RazorpayTransfer[] };
  return body.items ?? [];
}

/** Schedule a held transfer to settle at `releaseAtUnix`. */
async function scheduleRelease(transferId: string, releaseAtUnix: number): Promise<void> {
  const res = await fetch(`${RAZORPAY_API}/transfers/${transferId}`, {
    method: "PATCH",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ on_hold: 1, on_hold_until: releaseAtUnix }),
  });
  if (!res.ok) {
    throw new Error(`schedule release failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * The seller key a transfer was tagged with at creation.
 *
 * create-cart-order writes `notes.sellerKey` on every transfer precisely so a
 * transfer can be matched back to one order without storing transfer ids at
 * checkout time. Matching on amount instead would be ambiguous the first time
 * two sellers on one order charge the same total.
 */
function sellerKeyOfOrder(order: FirebaseFirestore.DocumentData): string {
  const phone = String(order.sellerPhone ?? "").trim();
  if (phone) return phone;
  return String(order.sellerId ?? "").trim();
}

export const releaseTransferOnDelivery = onDocumentWritten(
  {
    document: "orders/{orderId}",
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    // Only the transition INTO delivered. Re-saving a delivered order (a note
    // edit, a later status write) must not reschedule a release that already
    // happened, and must not re-hold a transfer Razorpay has already settled.
    const wasDelivered = before?.status === "delivered";
    const isDelivered = after.status === "delivered";
    if (!isDelivered || wasDelivered) return;

    const orderId = event.params.orderId;

    if (!(await releaseEnabled())) {
      logger.info("[route-release] disabled by settings/route.releaseEnabled", { orderId });
      return;
    }

    // Idempotency guard independent of the before/after check: two writes racing
    // to delivered would both see wasDelivered === false.
    if (after.routeRelease?.transferId) {
      logger.info("[route-release] already scheduled, skipping", { orderId });
      return;
    }

    const paymentId = String(after.payment?.razorpayPaymentId ?? "").trim();
    if (!paymentId) {
      // Cash on delivery, or an order that predates Route. Nothing to release.
      logger.info("[route-release] no razorpay payment on order, nothing to release", { orderId });
      return;
    }

    const sellerKey = sellerKeyOfOrder(after);
    if (!sellerKey) {
      logger.error("[route-release] order has no resolvable seller key", { orderId });
      return;
    }

    try {
      const transfers = await fetchTransfersForPayment(paymentId);
      if (transfers.length === 0) {
        // Expected for now: sellers are onboarded lazily, so most orders carry
        // no transfer at all and settle to the platform as they always have.
        logger.info("[route-release] payment has no transfers (seller not onboarded)", {
          orderId,
          paymentId,
        });
        return;
      }

      // A REASSIGNED order must never fall back to "the only transfer on the
      // payment": that is the original seller's transfer, so delivery by the
      // new seller would release money to the seller who rejected it. For
      // those, match only the transfer the order recorded (routeTransfer.id),
      // or one tagged for the CURRENT seller. No match → no release; the new
      // seller is then paid by the manual payout run, which checks Razorpay.
      //
      // Every other order keeps exactly the matching it always had, so this
      // change cannot alter a release for a normal order.
      const recordedId = String(after.routeTransfer?.id ?? "").trim();
      let match: RazorpayTransfer | undefined;
      if (recordedId) {
        match = transfers.find((t) => t.id === recordedId);
      } else if (after.reassignment) {
        const key = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
        const ids = [String(after.sellerPhone ?? ""), String(after.sellerId ?? "")].filter(Boolean);
        match = transfers.find((t) => {
          const note = String(t.notes?.sellerKey ?? "").trim();
          return Boolean(note) && (ids.includes(note) || ids.some((i) => key(i).length === 10 && key(i) === key(note)));
        });
      } else {
        match =
          transfers.find((t) => t.notes?.sellerKey === sellerKey) ??
          // One-seller orders are unambiguous even without the note — this covers
          // any transfer created before the note existed.
          (transfers.length === 1 ? transfers[0] : undefined);
      }

      if (!match) {
        logger.error("[route-release] no transfer matches this order's seller", {
          orderId,
          sellerKey,
          transferCount: transfers.length,
        });
        return;
      }

      // A reversed transfer is the rejecting seller's money already pulled
      // back — releasing it would be a no-op at best.
      if ((match.amount_reversed ?? 0) >= match.amount) {
        logger.warn("[route-release] matched transfer is fully reversed, not releasing", {
          orderId,
          transferId: match.id,
        });
        return;
      }

      if (!match.on_hold) {
        logger.info("[route-release] transfer already released", {
          orderId,
          transferId: match.id,
        });
        await event.data!.after.ref.set(
          {
            routeRelease: {
              transferId: match.id,
              status: "already_released",
              recordedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
        return;
      }

      const releaseAt = new Date(Date.now() + RELEASE_DELAY_HOURS * 60 * 60 * 1000);
      const releaseAtUnix = Math.floor(releaseAt.getTime() / 1000);

      await scheduleRelease(match.id, releaseAtUnix);

      await event.data!.after.ref.set(
        {
          routeRelease: {
            transferId: match.id,
            amount: match.amount,
            status: "scheduled",
            releaseAt: admin.firestore.Timestamp.fromDate(releaseAt),
            scheduledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );

      logger.info("[route-release] scheduled", {
        orderId,
        transferId: match.id,
        amount: match.amount,
        releaseAt: releaseAt.toISOString(),
      });
    } catch (err) {
      // Deliberately swallowed after logging: throwing would retry the trigger
      // and re-PATCH a transfer that may already be scheduled. The order stays
      // without a routeRelease field, which is the signal to investigate.
      logger.error("[route-release] failed", {
        orderId,
        paymentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
