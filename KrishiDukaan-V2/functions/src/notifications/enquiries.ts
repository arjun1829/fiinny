import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { notify, phoneVariants, firstPhone } from "../notify";
import { queueWaNotification } from "../wa-notify";

const db = (): admin.firestore.Firestore => admin.firestore();

/**
 * Buyer enquiries from checkouts that never completed.
 *
 * A `paymentAttempts` doc is written server-side the moment a Razorpay order
 * is created — before the customer ever sees the checkout sheet — and only
 * moves to 'paid' when the money actually lands (see app/lib/payment-attempts.ts).
 * An attempt still sitting at 'created' well after that, or one explicitly
 * marked 'failed', is a real lost sale. Admin could already see those; this
 * sweep turns each one into something the SELLERS can act on.
 *
 * For every product in the abandoned basket we find every seller offering that
 * product for ONLINE delivery — not just the shop the buyer happened to pick,
 * since the buyer was shopping for the product, and any of those sellers can
 * still win the sale by calling them. Each of those sellers gets one
 * `enquiries` doc (their products only) plus a notification.
 *
 * Why a separate collection instead of opening up `paymentAttempts`: an
 * attempt doc holds EVERY seller's lines in a multi-seller cart plus the
 * buyer's delivery address, and Firestore rules cannot filter fields. An
 * enquiry carries only what one seller is allowed to see — their own lines,
 * and the buyer's name and phone so they can follow up.
 */

/**
 * How long an attempt must sit at 'created' before it counts as abandoned.
 * Matches ABANDON_AFTER_MS in app/admin/payments/page.tsx — the admin queue
 * and the seller enquiry must never disagree about what "abandoned" means.
 * Generous on purpose: a customer mid-UPI is not a lost sale.
 */
const ABANDON_AFTER_MS = 30 * 60 * 1000;

/** How far back a sweep looks. Comfortably wider than the schedule interval,
 *  so a skipped or failed run is picked up by the next one. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Cap on attempts examined per run, so one sweep can't run unbounded. */
const SWEEP_LIMIT = 300;

/** 10-digit key used to dedupe a seller across the +91/bare phone formats
 *  both schemas store. */
function phoneKey(phone: string): string {
  const t = phone.trim();
  const stripped = t.startsWith("+91") ? t.slice(3) : t;
  return stripped.replace(/\D/g, "").slice(-10);
}

type SellerRef = { phone: string; name: string };

/**
 * Every seller offering [productId] for online delivery, keyed by phone.
 *
 * Online is decided the same way the marketplace decides whether to show a
 * Buy button: the listing itself must not be offline-only, and the seller's
 * account-level Online Delivery flag must not be explicitly off. A MISSING
 * account flag counts as on — the overwhelming majority of live seller docs
 * predate that field, and treating absence as "offline" would silently
 * exclude nearly all of them (the same rule the app applies).
 */
async function onlineSellersForProduct(productId: string): Promise<SellerRef[]> {
  const found = new Map<string, SellerRef>();
  const add = (rawPhone: unknown, rawName: unknown) => {
    const phone = firstPhone(rawPhone);
    if (!phone) return;
    const key = phoneKey(phone);
    if (!key || found.has(key)) return;
    found.set(key, { phone, name: String(rawName ?? "").trim() });
  };

  try {
    const snap = await db().collection("products").doc(productId).get();
    if (!snap.exists) return [];
    const d = snap.data() ?? {};

    // A seller copy points back at the canonical product; the canonical is
    // what carries availability[] for every other seller of the same item.
    const canonicalId = String(
      d.originalProductId ?? d.manufacturerProductId ?? productId,
    );
    let canonical = d;
    if (canonicalId !== productId) {
      const cSnap = await db().collection("products").doc(canonicalId).get();
      if (cSnap.exists) canonical = cSnap.data() ?? {};
    }

    const listingIsOnline = (p: Record<string, unknown>) =>
      p.sellMode !== "offline_store_only" && p.isOnline !== false;

    // 1. Sellers recorded on the canonical product's availability[].
    const availability = Array.isArray(canonical.availability)
      ? (canonical.availability as Record<string, unknown>[])
      : [];
    for (const av of availability) {
      if (av.isOnline !== true) continue;
      add(av.storePhone ?? av.storeId, av.storeName);
    }

    // 2. The canonical product's own owner, when they sell it themselves.
    if (listingIsOnline(canonical)) {
      add(
        canonical.retailerPhone ?? canonical.ownerPhone ?? canonical.manufacturerPhone,
        canonical.store ?? canonical.storeName,
      );
    }

    // 3. Seller copies of the canonical — a retailer's own doc is the source
    //    of truth for whether THEY sell it online, and a copy may exist with
    //    no matching availability[] entry yet.
    const copyQueries = await Promise.all(
      ["originalProductId", "manufacturerProductId"].map((field) =>
        db()
          .collection("products")
          .where(field, "==", canonicalId)
          .limit(100)
          .get()
          .catch(() => null),
      ),
    );
    for (const q of copyQueries) {
      if (!q) continue;
      for (const doc of q.docs) {
        const c = doc.data() ?? {};
        if (c.isActive === false) continue;
        if (!listingIsOnline(c)) continue;
        add(c.retailerPhone ?? c.ownerPhone, c.store ?? c.storeName);
      }
    }
  } catch (err) {
    logger.error("[enquiries] could not resolve sellers for product", {
      productId,
      err: String(err),
    });
    return [];
  }

  // Account-level Online Delivery gate — a seller who switched online selling
  // off should not be handed online leads, even if a stale listing says online.
  const allowed: SellerRef[] = [];
  await Promise.all(
    Array.from(found.values()).map(async (seller) => {
      try {
        for (const variant of phoneVariants(seller.phone)) {
          const snap = await db().collection("users").doc(variant).get();
          if (!snap.exists) continue;
          if (snap.data()?.onlineDelivery === false) return; // explicitly off
          break;
        }
      } catch {
        // Unreadable account doc — fall through and keep the seller rather
        // than dropping a real lead over a transient read failure.
      }
      allowed.push(seller);
    }),
  );
  return allowed;
}

type AttemptItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

/** The lines of one attempt that concern a single seller. */
type SellerEnquiry = {
  seller: SellerRef;
  items: AttemptItem[];
};

function readItems(raw: unknown): AttemptItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => {
      const it = (i ?? {}) as Record<string, unknown>;
      return {
        productId: String(it.productId ?? ""),
        name: String(it.name ?? "Product"),
        qty: Number(it.qty ?? 1) || 1,
        unitPrice: Number(it.unitPrice ?? 0) || 0,
        lineTotal: Number(it.lineTotal ?? 0) || 0,
      };
    })
    .filter((i) => i.productId);
}

/**
 * Fans one abandoned attempt out to every online seller of everything in it.
 * Returns how many sellers were reached.
 */
async function createEnquiriesForAttempt(
  attemptId: string,
  attempt: Record<string, unknown>,
  reason: "abandoned" | "failed",
): Promise<number> {
  const items = readItems(attempt.items);
  if (items.length === 0) return 0;

  const buyerName = String(
    attempt.customerName ?? attempt.userName ?? "",
  ).trim();
  const buyerPhone = firstPhone(
    attempt.customerPhone,
    attempt.userPhone,
    attempt.razorpayContact,
  );
  // With no way to call them back, an enquiry gives the seller nothing to act
  // on — skip rather than filling their list with dead ends.
  if (!buyerPhone) {
    logger.info("[enquiries] skipping attempt with no reachable buyer", {
      attemptId,
    });
    return 0;
  }

  // Resolve sellers once per distinct product, then group by seller so a
  // seller with three of the basket's lines gets ONE enquiry, not three.
  const bySeller = new Map<string, SellerEnquiry>();
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const sellerLists = await Promise.all(
    productIds.map(async (id) => ({ id, sellers: await onlineSellersForProduct(id) })),
  );
  const sellersByProduct = new Map(sellerLists.map((s) => [s.id, s.sellers]));

  for (const item of items) {
    for (const seller of sellersByProduct.get(item.productId) ?? []) {
      const key = phoneKey(seller.phone);
      const entry = bySeller.get(key) ?? { seller, items: [] };
      entry.items.push(item);
      bySeller.set(key, entry);
    }
  }
  if (bySeller.size === 0) return 0;

  const now = admin.firestore.FieldValue.serverTimestamp();
  let reached = 0;

  for (const [key, entry] of Array.from(bySeller.entries())) {
    // Deterministic id — a re-run of the sweep overwrites the same doc rather
    // than creating a second copy of the same enquiry.
    const enquiryId = `${attemptId}_${key}`;
    const summary = entry.items[0].name;
    const more = entry.items.length - 1;
    const itemSummary = more > 0 ? `${summary} +${more} more` : summary;
    const value = entry.items.reduce((s, i) => s + (i.lineTotal || i.unitPrice * i.qty), 0);

    try {
      await db()
        .collection("enquiries")
        .doc(enquiryId)
        .set(
          {
            attemptId,
            reason,
            status: "open",

            sellerPhone: entry.seller.phone,
            // Both phone formats, so a client query matches whichever format
            // the seller's own account doc uses (same trick as notifications).
            sellerPhones: phoneVariants(entry.seller.phone),
            sellerName: entry.seller.name || null,

            buyerName: buyerName || null,
            buyerPhone,

            items: entry.items,
            itemCount: entry.items.length,
            itemSummary,
            value,

            createdAt: now,
            updatedAt: now,
          },
          { merge: true },
        );
      reached += 1;
    } catch (err) {
      logger.error("[enquiries] could not write enquiry", {
        enquiryId,
        err: String(err),
      });
      continue;
    }

    const who = buyerName || "A customer";
    await notify(
      entry.seller.phone,
      "enquiry",
      "Customer didn't complete payment 🛒",
      `${who} tried to order ${itemSummary} but didn't pay. Call them to help finish the order.`,
      { enquiryId },
    );

    await queueWaNotification(
      entry.seller.phone,
      `🛒 एका ग्राहकाने ऑर्डर पूर्ण केली नाही — ${itemSummary}`,
      {
        template: "enquiry_notification",
        type: "enquiry",
        payload: {
          shopName: entry.seller.name || "",
          customerName: who,
          product: itemSummary,
        },
        source: { event: "checkout_abandoned", entityType: "enquiry", entityId: enquiryId },
      },
    );
  }

  return reached;
}

/**
 * Sweeps recent payment attempts and raises seller enquiries for the ones that
 * never got paid.
 *
 * Runs on a schedule rather than a Firestore trigger because abandonment is
 * the ABSENCE of an event: nothing is written when a customer walks away from
 * the Razorpay sheet, so there is no document change to react to.
 */
export const raiseAbandonedCheckoutEnquiries = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Asia/Kolkata" },
  async () => {
    const now = Date.now();
    const cutoff = admin.firestore.Timestamp.fromMillis(now - LOOKBACK_MS);

    // Range + order on the same field only needs the automatic single-field
    // index; status and age are filtered in memory so no composite index has
    // to be deployed for this sweep to run.
    const snap = await db()
      .collection("paymentAttempts")
      .where("createdAt", ">=", cutoff)
      .orderBy("createdAt", "desc")
      .limit(SWEEP_LIMIT)
      .get();

    let processed = 0;
    let sellersNotified = 0;

    for (const doc of snap.docs) {
      const d = doc.data() ?? {};

      // Subscription checkouts have no products and no seller to route to.
      if (d.kind === "subscription") continue;
      if (d.status === "paid") continue;
      // Already fanned out on an earlier run.
      if (d.enquiriesRaisedAt) continue;

      const createdMs =
        (d.createdAt as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;

      let reason: "abandoned" | "failed";
      if (d.status === "failed") {
        reason = "failed";
      } else if (createdMs && now - createdMs > ABANDON_AFTER_MS) {
        reason = "abandoned";
      } else {
        continue; // still in flight — not a lost sale yet
      }

      try {
        const reached = await createEnquiriesForAttempt(doc.id, d, reason);
        sellersNotified += reached;
        processed += 1;
        // Stamped even when no seller was reached, so a basket whose products
        // have no online seller isn't re-examined on every sweep forever.
        await doc.ref.set(
          {
            enquiriesRaisedAt: admin.firestore.FieldValue.serverTimestamp(),
            enquirySellerCount: reached,
          },
          { merge: true },
        );
      } catch (err) {
        logger.error("[enquiries] attempt failed to process", {
          attemptId: doc.id,
          err: String(err),
        });
      }
    }

    logger.info("[enquiries] sweep complete", {
      examined: snap.size,
      processed,
      sellersNotified,
    });
  },
);
