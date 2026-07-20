import * as admin from "firebase-admin";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { queueWaNotification } from "./wa-notify";

export { sendWaNotification, retryWaNotifications, webhookReceiver } from "./wa-dispatch";

admin.initializeApp();
const db = admin.firestore();

/**
 * syncSellerProductToCanonical
 *
 * Triggers on every write to products/{productId}.
 * If the doc is a seller copy (has manufacturerProductId or originalProductId),
 * it fans out the changed price / stock / discount to:
 *   1. The canonical product's availability[] entry  (marketplace reads this)
 *   2. The seller's inventory doc                    (web dashboard reads this)
 *
 * This makes sync atomic and server-side — independent of whether the mobile
 * client successfully called syncMarketMirror / syncInventoryDoc.
 */
export const syncSellerProductToCanonical = onDocumentWritten(
  "products/{productId}",
  async (event) => {
    const snap = event.data?.after;

    // Doc deleted — nothing to sync
    if (!snap || !snap.exists) return;

    const d = snap.data() as Record<string, unknown>;

    // Only process seller copies that link to a root/canonical product
    const rootId =
      (d.manufacturerProductId as string | undefined) ||
      (d.originalProductId as string | undefined);

    if (!rootId || rootId === snap.id) return;

    // Identifiers used to match the availability[] entry
    const ownerId = String(
      d.ownerId ?? d.retailerId ?? d.retailerDocId ?? ""
    );
    const ownerPhone = String(d.retailerPhone ?? d.ownerPhone ?? "");

    if (!ownerId && !ownerPhone) return;

    // P8: Skip when only onboarding metadata changed (retailerId, retailerPhone,
    // ownerId, updatedAt). Backfill writes exactly these fields without touching
    // price/stock/discount, so cascading into availability + inventory is unnecessary
    // and was the primary source of the ~2000-request burst during invite acceptance.
    // Exception: let identity changes through so storePhone can be enriched below.
    const before = event.data?.before?.exists
      ? (event.data.before.data() as Record<string, unknown>)
      : null;

    if (before !== null) {
      const priceChanged =
        before.price !== d.price || before.sellingPrice !== d.sellingPrice;
      const stockChanged =
        before.stockQuantity !== d.stockQuantity ||
        before.stock !== d.stock ||
        before.isActive !== d.isActive;
      const discountChanged =
        before.discountEnabled !== d.discountEnabled ||
        before.discountPct !== d.discountPct ||
        before.effectiveDiscountPct !== d.effectiveDiscountPct;
      const identityChanged =
        before.retailerPhone !== d.retailerPhone ||
        before.ownerPhone !== d.ownerPhone ||
        before.ownerId !== d.ownerId ||
        before.retailerId !== d.retailerId;
      if (!priceChanged && !stockChanged && !discountChanged && !identityChanged) return;
    }

    // Values to mirror
    const sellingPrice =
      typeof d.price === "number" ? d.price :
      typeof d.sellingPrice === "number" ? d.sellingPrice : null;

    const stockQty =
      typeof d.stockQuantity === "number" ? d.stockQuantity :
      typeof d.stock === "number" ? d.stock : null;

    const stockLabel =
      d.isActive === false
        ? "Out of Stock"
        : typeof d.stock === "string"
        ? (d.stock as string)
        : stockQty != null
        ? (stockQty > 0 ? "In Stock" : "Out of Stock")
        : null;

    // Effective discount pct (already computed by the writer)
    const effectivePct =
      typeof d.effectiveDiscountPct === "number"
        ? d.effectiveDiscountPct
        : typeof d.discountPct === "number" && d.discountEnabled === true
        ? (d.discountPct as number)
        : 0;

    // ── 1. Update canonical availability[] entry ──────────────────────────────
    try {
      const rootRef = db.collection("products").doc(rootId);
      await db.runTransaction(async (txn) => {
        const rootSnap = await txn.get(rootRef);
        if (!rootSnap.exists) return;

        const root = rootSnap.data() as Record<string, unknown>;
        const availability = Array.isArray(root.availability)
          ? [...(root.availability as Record<string, unknown>[])]
          : [];

        if (!availability.length) return;

        let changed = false;
        const updated = availability.map((entry) => {
          const sid = String(entry.storeId ?? "");
          const sphone = String(entry.storePhone ?? "");
          const matches =
            (ownerId && (sid === ownerId || sphone === ownerId)) ||
            (ownerPhone && (sphone === ownerPhone || sid === ownerPhone));
          if (!matches) return entry;

          changed = true;
          const patch: Record<string, unknown> = { ...entry };
          if (sellingPrice != null) patch.sellingPrice = sellingPrice;
          if (stockLabel != null) patch.stockLevel = stockLabel;
          patch.discountPct = effectivePct;
          // P6: Enrich storePhone when it is missing in the availability entry.
          // This replaces the per-product arrayRemove+arrayUnion loop that backfill
          // used to run after the batch commit (which generated N extra HTTP requests).
          if (!entry.storePhone && ownerPhone) patch.storePhone = ownerPhone;
          return patch;
        });

        if (changed) {
          txn.update(rootRef, {
            availability: updated,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (err) {
      console.error(
        `[syncSellerProductToCanonical] availability sync failed for root=${rootId}:`,
        err
      );
    }

    // ── 2. Update seller's inventory doc ─────────────────────────────────────
    // Only sync fields that actually changed to avoid unnecessary writes.
    // (before is already declared above for the P8 early-exit check)
    const priceChanged =
      before == null || before.price !== d.price ||
      before.sellingPrice !== d.sellingPrice;
    const stockChanged =
      before == null || before.stockQuantity !== d.stockQuantity ||
      before.stock !== d.stock || before.isActive !== d.isActive;
    const discountChanged =
      before == null ||
      before.discountEnabled !== d.discountEnabled ||
      before.discountPct !== d.discountPct ||
      before.effectiveDiscountPct !== d.effectiveDiscountPct;

    if (!priceChanged && !stockChanged && !discountChanged) return;

    try {
      const invSnap = await db
        .collection("inventory")
        .where("productId", "==", snap.id)
        .limit(5) // a product should only have one inventory doc
        .get();

      if (invSnap.empty) return;

      const patch: Record<string, unknown> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (priceChanged && sellingPrice != null) {
        patch.sellingPrice = sellingPrice;
      }
      if (stockChanged) {
        if (stockQty != null) {
          patch.stockQuantity = stockQty;
        }
        // isActive=false overrides stock-based availability
        patch.isAvailable =
          d.isActive === false
            ? false
            : stockQty != null
            ? stockQty > 0
            : undefined;
        if (patch.isAvailable === undefined) delete patch.isAvailable;
      }
      if (discountChanged) {
        patch.discountEnabled = d.discountEnabled ?? false;
        patch.discountType = d.discountType ?? "percentage";
        patch.discountPct = d.discountPct ?? 0;
        patch.effectiveDiscountPct = effectivePct;
        patch.discountStartDate = d.discountStartDate ?? null;
        patch.discountEndDate = d.discountEndDate ?? null;
      }

      const batch = db.batch();
      invSnap.docs.forEach((doc) => batch.update(doc.ref, patch));
      await batch.commit();
    } catch (err) {
      console.error(
        `[syncSellerProductToCanonical] inventory sync failed for product=${snap.id}:`,
        err
      );
    }
  }
);

/**
 * decrementStockOnOrder
 *
 * Triggers when a new order doc is created. For each line item, decrements
 * stockQuantity on the seller's product copy and the corresponding inventory
 * doc. The existing syncSellerProductToCanonical trigger then propagates the
 * stock change to the canonical availability[] entry automatically.
 */
export const decrementStockOnOrder = onDocumentCreated(
  "orders/{orderId}",
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data) return;

    const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
    const sellerPhone = String(data.sellerPhone ?? data.sellerId ?? "");

    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.quantity ?? item.qty ?? 1)));
      const listingId = String(item.listingId ?? "");
      const catalogId = String(item.catalogId ?? item.productId ?? "");

      // Attempt direct product doc decrement (listingId == product copy doc ID)
      if (listingId && listingId.length > 10 && !listingId.match(/^\+?\d+$/)) {
        try {
          await db.collection("products").doc(listingId).update({
            stockQuantity: admin.firestore.FieldValue.increment(-qty),
            stock: admin.firestore.FieldValue.increment(-qty),
          });
        } catch { /* doc may not exist or not have numeric stock */ }
      }

      // Find seller's product copy via canonical product ID + seller phone
      if (catalogId && sellerPhone) {
        try {
          const copies = await db.collection("products")
            .where("manufacturerProductId", "==", catalogId)
            .where("retailerPhone", "==", sellerPhone)
            .limit(1)
            .get();
          if (copies.empty) {
            // Also try originalProductId
            const copies2 = await db.collection("products")
              .where("originalProductId", "==", catalogId)
              .where("retailerPhone", "==", sellerPhone)
              .limit(1)
              .get();
            if (!copies2.empty) {
              await copies2.docs[0].ref.update({
                stockQuantity: admin.firestore.FieldValue.increment(-qty),
              });
            }
          } else {
            await copies.docs[0].ref.update({
              stockQuantity: admin.firestore.FieldValue.increment(-qty),
            });
          }
        } catch { /* best-effort */ }
      }

      // Decrement inventory doc directly
      if (sellerPhone) {
        try {
          const invQuery = catalogId
            ? db.collection("inventory")
                .where("manufacturerProductId", "==", catalogId)
                .where("retailerPhone", "==", sellerPhone)
                .limit(1)
                .get()
            : null;
          if (invQuery) {
            const invSnap = await invQuery;
            if (!invSnap.empty) {
              await invSnap.docs[0].ref.update({
                stockQuantity: admin.firestore.FieldValue.increment(-qty),
                isAvailable: true, // let the stock number speak; don't flip to false here
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }
        } catch { /* best-effort */ }
      }
    }
  }
);

/**
 * expireSubscriptions
 *
 * Runs daily. Finds users whose subscription has expired (expiryDate < now)
 * and flips isPaid=false so canAccessDashboard correctly returns false.
 * Also marks the subscription doc as expired.
 */
export const expireSubscriptions = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Kolkata" },
  async () => {
    const now = admin.firestore.Timestamp.now();

    // Find active subscriptions that have passed their expiry date
    const expiredSnap = await db
      .collection("subscriptions")
      .where("subscriptionStatus", "==", "active")
      .where("expiryDate", "<", now)
      .get();

    if (expiredSnap.empty) return;

    const batch = db.batch();

    for (const subDoc of expiredSnap.docs) {
      const d = subDoc.data() as Record<string, unknown>;

      // Mark subscription as expired
      batch.update(subDoc.ref, {
        subscriptionStatus: "expired",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Check if this owner has any other active non-expired subscription
      const ownerPhone = String(d.ownerPhone ?? "");
      const ownerId    = String(d.ownerId    ?? "");

      const otherActiveSubs = await db
        .collection("subscriptions")
        .where("subscriptionStatus", "==", "active")
        .where(
          ownerPhone ? "ownerPhone" : "ownerId",
          "==",
          ownerPhone || ownerId,
        )
        .where("expiryDate", ">=", now)
        .limit(1)
        .get();

      if (otherActiveSubs.empty) {
        // No other valid sub — revoke dashboard access
        if (ownerPhone) {
          batch.update(db.collection("users").doc(ownerPhone), {
            isPaid: false,
            subscriptionStatus: "expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        if (ownerId) {
          // Legacy uid-keyed user doc
          batch.update(db.collection("users").doc(ownerId), {
            isPaid: false,
            subscriptionStatus: "expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    await batch.commit();
    console.log(`[expireSubscriptions] processed ${expiredSnap.size} expired subscriptions`);
  }
);

// ─── Notifications ────────────────────────────────────────────────────────────

/** Phone variants to try when looking up users/{phone}: as-is, +91-prefixed,
 *  and 10-digit stripped — doc IDs exist in both formats. */
function phoneVariants(phone: string): string[] {
  const v = new Set<string>();
  const p = phone.trim();
  if (!p) return [];
  v.add(p);
  if (p.startsWith("+91")) v.add(p.substring(3));
  else v.add(`+91${p}`);
  return Array.from(v);
}

/**
 * Writes a notifications/{id} doc for the recipient and sends an FCM push to
 * their saved token (users/{phone}.fcmToken). Never throws — notification
 * failures must not break the triggering write.
 */
/** True when [v] looks like an Indian phone (10–13 digits, optional +91). */
function looksLikePhone(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  const stripped = t.startsWith("+91") ? t.slice(3) : t;
  return /^\d{10,13}$/.test(stripped);
}

/**
 * Returns the first phone-like value from the candidates. Web and mobile
 * write phones into different fields (retailerPhone vs retailerId/ownerId,
 * some null) — and UID values must be skipped, so plain ?? chains don't work.
 */
function firstPhone(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (looksLikePhone(c)) return (c as string).trim();
  }
  return "";
}

async function notify(
  recipientPhone: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> {
  const phone = (recipientPhone ?? "").trim();
  if (!phone) {
    console.warn(`[notify] skipped ${type} "${title}" — no recipient phone`);
    return;
  }

  try {
    await db.collection("notifications").add({
      recipientPhone: phone,
      // Store the alternate format too so the client query matches whichever
      // format its user doc uses.
      recipientPhones: phoneVariants(phone),
      type,
      title,
      body,
      data,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`[notify] doc write failed for ${phone}:`, err);
  }

  try {
    let token: string | null = null;
    for (const variant of phoneVariants(phone)) {
      const snap = await db.collection("users").doc(variant).get();
      const t = snap.exists
        ? (snap.data()?.fcmToken as string | undefined)
        : undefined;
      if (t) {
        token = t;
        break;
      }
    }
    if (!token) return;

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: { type, ...data },
      android: { priority: "high" },
    });
  } catch (err) {
    console.error(`[notify] push failed for ${phone}:`, err);
  }
}

/** Resolves a seller's display name from manufacturers/users/retailers docs. */
async function displayName(phone: string, fallback: string): Promise<string> {
  for (const variant of phoneVariants(phone)) {
    for (const col of ["manufacturers", "users", "retailers"]) {
      try {
        const snap = await db.collection(col).doc(variant).get();
        if (!snap.exists) continue;
        const d = snap.data() ?? {};
        const name = String(
          d.businessName ?? d.shopName ?? d.name ?? d.ownerName ?? ""
        ).trim();
        if (name) return name;
      } catch {
        /* keep trying other variants */
      }
    }
  }
  return fallback;
}

/**
 * Resolves a manufacturer's display name by trying phone variants first, then
 * UID-keyed docs. Handles both phone-OTP accounts (phone is the doc key) and
 * legacy UID-keyed accounts.
 */
async function manufacturerDisplayName(phone: string, uid: string, fallback: string): Promise<string> {
  if (phone) {
    const name = await displayName(phone, "");
    if (name) return name;
  }
  if (uid) {
    for (const col of ["manufacturers", "users"]) {
      try {
        const snap = await db.collection(col).doc(uid).get();
        if (!snap.exists) continue;
        const d = snap.data() ?? {};
        const name = String(d.businessName ?? d.shopName ?? d.name ?? d.ownerName ?? "").trim();
        if (name) return name;
      } catch { /* keep trying */ }
    }
    // Also try resolving phone via uidIndex, then look up by phone
    try {
      const idxSnap = await db.collection("uidIndex").doc(uid).get();
      if (idxSnap.exists) {
        const resolvedPhone = String(idxSnap.data()?.phone ?? "").trim();
        if (resolvedPhone && resolvedPhone !== phone) {
          const name = await displayName(resolvedPhone, "");
          if (name) return name;
        }
      }
    } catch { /* ignore */ }
  }
  return fallback;
}

/** New order placed → notify the seller (store owner / manufacturer). */
export const notifySellerOnOrder = onDocumentCreated(
  "orders/{orderId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const orderId   = event.params.orderId;
    const sellerType = String(d.sellerType ?? "unknown");
    const sellerId   = String(d.sellerId   ?? "");

    logger.info("[notifySellerOnOrder] order created", {
      orderId,
      sellerType,
      sellerId,
      sellerPhoneInDoc: d.sellerPhone ?? null,
      storePhoneInDoc:  d.storePhone  ?? null,
    });

    // Fast path: phone stored on the order doc (written since the sellerPhone fix).
    // Fallback: UID → uidIndex → phone for legacy orders without sellerPhone.
    let sellerPhone = firstPhone(d.sellerPhone, d.sellerId, d.storePhone);

    if (!sellerPhone && sellerId) {
      logger.info("[notifySellerOnOrder] sellerPhone not in order doc, attempting UID→phone lookup", {
        orderId, sellerId,
      });
      try {
        const idxSnap = await db.collection("uidIndex").doc(sellerId).get();
        if (idxSnap.exists) {
          const resolved = String(idxSnap.data()?.phone ?? "").trim();
          if (looksLikePhone(resolved)) {
            sellerPhone = resolved;
            logger.info("[notifySellerOnOrder] resolved phone via uidIndex", {
              orderId, sellerId, sellerPhone,
            });
          }
        }

        // Also check manufacturers/{sellerId} and users/{sellerId} directly
        if (!sellerPhone) {
          for (const col of ["manufacturers", "users"]) {
            const snap = await db.collection(col).doc(sellerId).get();
            if (!snap.exists) continue;
            const phone = firstPhone(
              snap.data()?.phone,
              snap.data()?.ownerPhone,
              snap.data()?.whatsapp,
            );
            if (phone) {
              sellerPhone = phone;
              logger.info(`[notifySellerOnOrder] resolved phone from ${col}/${sellerId}`, {
                orderId, sellerPhone,
              });
              break;
            }
          }
        }
      } catch (lookupErr) {
        logger.error("[notifySellerOnOrder] UID→phone lookup threw", {
          orderId, sellerId, err: String(lookupErr),
        });
      }
    }

    logger.info("[notifySellerOnOrder] manufacturer identified", {
      orderId,
      sellerType,
      sellerId,
      sellerPhone: sellerPhone || "(not resolved)",
    });

    const customer = String(d.customerName ?? "A customer");
    const total = typeof d.total === "number" ? d.total : null;
    const items = Array.isArray(d.items)
      ? (d.items as Record<string, unknown>[])
      : [];
    const firstItem = items.length ? String(items[0].name ?? "") : "";
    const itemSummary = firstItem
      ? `${firstItem}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
      : "your products";

    await notify(
      sellerPhone,
      "order",
      "New order received 🛒",
      `${customer} ordered ${itemSummary}${total != null ? ` · ₹${total}` : ""}`,
      { orderId }
    );

    if (sellerPhone) {
      logger.info("[notifySellerOnOrder] notification enqueue started", {
        orderId, sellerType, sellerPhone,
      });
      const shopName = String(d.sellerName ?? "");
      await queueWaNotification(
        sellerPhone,
        `🛒 नवीन ऑनलाइन ऑर्डर प्राप्त झाली आहे.`,
        {
          template: "order_notification",
          type: "order",
          // order_notification body {{1}} = shopName → businessName → "Retailer"
          // Static Orders Dashboard URL button — no button component needed.
          payload: { shopName, businessName: "" },
          source: { event: "order_created", entityType: "order", entityId: orderId },
        }
      );
      logger.info("[notifySellerOnOrder] notification enqueue completed", {
        orderId, sellerType, sellerPhone,
      });
    } else {
      logger.warn("[notifySellerOnOrder] skipping WA — sellerPhone could not be resolved", {
        orderId, sellerType, sellerId,
      });
    }
  }
);

/**
 * Order status changed → notify the customer.
 * Fires on create too (before doesn't exist → status "placed" → confirmation).
 */
export const notifyCustomerOnOrderStatus = onDocumentWritten(
  "orders/{orderId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const d = after.data() as Record<string, unknown>;

    const status = String(d.status ?? "");
    const before = event.data?.before;
    if (before?.exists) {
      const prevStatus = String(
        (before.data() as Record<string, unknown>).status ?? ""
      );
      if (prevStatus === status) return; // not a status change (e.g. payment field update)
    }

    const customerPhone = firstPhone(d.customerPhone, d.customerId);
    if (!customerPhone) return;

    const items = Array.isArray(d.items)
      ? (d.items as Record<string, unknown>[])
      : [];
    const firstItem = items.length ? String(items[0].name ?? "") : "";
    const itemSummary = firstItem
      ? `${firstItem}${items.length > 1 ? ` +${items.length - 1} more` : ""}`
      : "your order";
    const store =
      String(d.sellerName ?? d.storeName ?? "").trim() || "the store";

    const messages: Record<string, [string, string]> = {
      placed: [
        "Order placed ✅",
        `Your order for ${itemSummary} was placed with ${store}`,
      ],
      accepted: [
        "Order accepted 👍",
        `${store} accepted your order for ${itemSummary}`,
      ],
      out_for_delivery: [
        "Out for delivery 🚚",
        `Your order for ${itemSummary} is on its way`,
      ],
      delivered: [
        "Order delivered 🎉",
        `Your order for ${itemSummary} was delivered`,
      ],
      rejected: [
        "Order declined ❌",
        `${store} couldn't fulfil your order for ${itemSummary}`,
      ],
    };
    const msg = messages[status];
    if (!msg) return;

    await notify(customerPhone, "order_update", msg[0], msg[1], {
      orderId: event.params.orderId,
      status,
    });

    // Send WhatsApp order confirmation when the order is first placed.
    // order_confirmation_customer: body {{1}} = customerName, button {{1}} = orderId.
    // Button resolves to: https://krishidukan.com/invoice/{orderId}
    if (status === "placed" && customerPhone) {
      const customerName = String(d.customerName ?? "");
      const orderId = event.params.orderId;
      await queueWaNotification(
        customerPhone,
        `✅ तुमची ऑर्डर यशस्वीरित्या दिली गेली आहे. ऑर्डर ID: ${orderId}`,
        {
          template: "order_confirmation_customer",
          type: "order",
          payload: { customerName, orderId },
          source: { event: "order_placed", entityType: "order", entityId: orderId },
        }
      );
    }
  }
);

// ─── AgriReels Notifications ─────────────────────────────────────────────────

/**
 * Someone liked a reel → notify the reel owner.
 * Doc ID = {reelId}_{userId}. We need to look up the reel to get shopOwnerId.
 */
export const notifyReelOwnerOnLike = onDocumentCreated(
  "reel_likes/{likeId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const reelId = String(d.reelId ?? "");
    const likerId = String(d.userId ?? "");
    if (!reelId || !likerId) return;

    const reelSnap = await db.collection("reels").doc(reelId).get();
    if (!reelSnap.exists) return;

    const reel = reelSnap.data() as Record<string, unknown>;
    const ownerPhone = String(reel.shopOwnerId ?? "");
    if (!ownerPhone || ownerPhone === likerId) return; // don't notify self-like

    const shopName = String(reel.shopName ?? "your reel");
    const likerName = await displayName(likerId, "Someone");

    await notify(
      ownerPhone,
      "reel_like",
      "New like on your reel ❤️",
      `${likerName} liked your reel "${shopName}"`,
      { reelId }
    );
  }
);

/**
 * Someone commented on a reel → notify the reel owner.
 */
export const notifyReelOwnerOnComment = onDocumentCreated(
  "reels/{reelId}/reel_comments/{commentId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const reelId = event.params.reelId;
    const commenterPhone = String(d.userId ?? "");
    const commenterName = String(d.userName ?? "Someone");
    const commentText = String(d.text ?? "");

    const reelSnap = await db.collection("reels").doc(reelId).get();
    if (!reelSnap.exists) return;

    const reel = reelSnap.data() as Record<string, unknown>;
    const ownerPhone = String(reel.shopOwnerId ?? "");
    if (!ownerPhone || ownerPhone === commenterPhone) return; // don't notify self-comment

    const preview = commentText.length > 50
      ? commentText.substring(0, 50) + "…"
      : commentText;

    await notify(
      ownerPhone,
      "reel_comment",
      `${commenterName} commented on your reel 💬`,
      preview || "Tap to view",
      { reelId }
    );
  }
);

/**
 * Someone followed a shop → notify the shop owner.
 * Doc ID = {followerId}_{shopId}.
 */
export const notifyShopOwnerOnFollow = onDocumentCreated(
  "follows/{followId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const shopPhone = String(d.followedShopId ?? "");
    const followerPhone = String(d.followerId ?? "");
    if (!shopPhone || !followerPhone) return;

    const followerName = await displayName(followerPhone, "Someone");

    await notify(
      shopPhone,
      "reel_follow",
      "New follower 🎉",
      `${followerName} started following your shop`,
      { followerPhone }
    );
  }
);

/** Manufacturer/admin assigned a product to a retailer → notify the retailer. */
export const notifyRetailerOnAssignment = onDocumentCreated(
  "products/{productId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;
    if (d.source !== "manufacturer_assigned" && d.source !== "admin_assigned")
      return;

    // Web writes null into retailerPhone/ownerPhone and puts the phone in
    // retailerId/retailerDocId/ownerId; mobile writes retailerPhone directly.
    const retailerPhone = firstPhone(
      d.retailerPhone,
      d.ownerPhone,
      d.retailerDocId,
      d.retailerId,
      d.ownerId
    );
    const productName = String(d.name ?? "a product");
    const mfrPhone = firstPhone(
      d.assignedByManufacturerPhone,
      d.manufacturerPhone,
      d.manufacturerId
    );
    const mfrId = String(d.manufacturerId ?? "").trim();
    const mfr = String(
      d.assignedByManufacturerName ?? d.manufacturerName ?? d.brand ?? ""
    ).trim() || (await manufacturerDisplayName(mfrPhone, mfrId, "A manufacturer"));

    await notify(
      retailerPhone,
      "assignment",
      "New product assigned 📦",
      `${mfr} assigned "${productName}" to your store`,
      { productId: event.params.productId }
    );

    logger.info("[notifyRetailerOnAssignment] resolved retailerPhone", { retailerPhone, productId: event.params.productId });
    if (retailerPhone) {
      const manufacturerIdForQuery = String(d.manufacturerId ?? "").trim();
      const retailerDocId = String(d.retailerDocId ?? "").trim();
      const productId = event.params.productId;

      let isOnboarded = true;
      let inviteCode = "";
      if (manufacturerIdForQuery && retailerDocId) {
        try {
          const inviteSnap = await db.collection("manufacturerRetailers")
            .where("manufacturerId", "==", manufacturerIdForQuery)
            .where("retailerDocId", "==", retailerDocId)
            .limit(1)
            .get();
          if (!inviteSnap.empty) {
            const inv = inviteSnap.docs[0].data() as Record<string, unknown>;
            isOnboarded = String(inv.status ?? "").trim() === "active";
            inviteCode = String(inv.inviteCode ?? "").trim();
          }
        } catch { /* non-critical — default to onboarded path */ }
      }

      const template = isOnboarded ? "product_assignment_onboarded" : "product_assignment_pending_signup";
      // Retailer name: prefer store name on the product copy, fall back to profile lookup
      const retailerName = String(d.store ?? d.shopName ?? "").trim() || await displayName(retailerPhone, retailerPhone);
      const payload: Record<string, string> = { retailerName, manufacturerName: mfr, productName, productId };
      if (!isOnboarded && inviteCode) payload.inviteCode = inviteCode;

      logger.info("[notifyRetailerOnAssignment] before queueWaNotification", { template, isOnboarded });
      await queueWaNotification(
        retailerPhone,
        `📦 नवीन प्रॉडक्ट असाइन करण्यात आला आहे.\n\nप्रॉडक्ट: ${productName}\nकंपनी: ${mfr}`,
        {
          template,
          type: "onboarding",
          payload,
          source: { event: "product_assigned", entityType: "product", entityId: productId },
        }
      );
      logger.info("[notifyRetailerOnAssignment] after queueWaNotification");
    } else {
      logger.warn("[notifyRetailerOnAssignment] skipping WA — retailerPhone is empty", { productId: event.params.productId });
    }
  }
);

/** Manufacturer added a retailer to their network → notify the retailer. */
export const notifyRetailerOnNetworkAdd = onDocumentCreated(
  "manufacturerRetailers/{docId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    // Manual single-add flow sets this flag because product assignment is
    // mandatory and product_assignment_pending_signup already serves as the
    // onboarding message. Skip here to avoid duplicate WhatsApp messages.
    if (d.skipOnboardingNotification === true) {
      logger.info("[notifyRetailerOnNetworkAdd] skipping — skipOnboardingNotification=true", { docId: event.params.docId });
      return;
    }

    const retailerPhone = firstPhone(
      d.retailerPhone,
      d.retailerDocId,
      d.retailerId
    );
    const mfrPhone = String(d.manufacturerPhone ?? "").trim();
    const mfrId = String(d.manufacturerId ?? "").trim();
    const mfr = String(d.manufacturerName ?? d.manufacturerBusinessName ?? "").trim() ||
      await manufacturerDisplayName(mfrPhone, mfrId, "A manufacturer");

    await notify(
      retailerPhone,
      "network",
      "Added to a retailer network 🤝",
      `${mfr} added you to their retailer network`,
      { inviteId: event.params.docId }
    );

    logger.info("[notifyRetailerOnNetworkAdd] resolved retailerPhone", { retailerPhone, docId: event.params.docId });
    if (retailerPhone) {
      const inviteCode = String(d.inviteCode ?? "").trim();
      // Retailer name: prefer shopName stored on the invite doc, fall back to profile lookup
      const retailerName = String(d.shopName ?? "").trim() || await displayName(retailerPhone, retailerPhone);
      logger.info("[notifyRetailerOnNetworkAdd] before queueWaNotification", { inviteCode: !!inviteCode });
      await queueWaNotification(
        retailerPhone,
        `🌱 Krishi Dukan परिवारात तुमचं मनःपूर्वक स्वागत आहे!\n\nतुम्हाला ${mfr} यांच्या Retailer Network मध्ये सहभागी करण्यात आलं आहे.`,
        {
          template: "retailer_onboarding",
          type: "onboarding",
          payload: { retailerName, manufacturerName: mfr, inviteCode },
          source: { event: "retailer_network_add", entityType: "manufacturerRetailer", entityId: event.params.docId },
        }
      );
      logger.info("[notifyRetailerOnNetworkAdd] after queueWaNotification");
    } else {
      logger.warn("[notifyRetailerOnNetworkAdd] skipping WA — retailerPhone is empty", { docId: event.params.docId });
    }
  }
);

/**
 * New active subscription created → send WhatsApp welcome message to the owner.
 * Fires on both admin-created and payment-created subscriptions.
 */
export const notifyOnSubscriptionCreated = onDocumentCreated(
  "subscriptions/{subscriptionId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    // Only welcome on active subscriptions; skip free/trial/expired docs
    if (String(d.subscriptionStatus ?? "") !== "active") return;

    const ownerPhone = firstPhone(d.ownerPhone, d.ownerId);
    if (!ownerPhone) return;

    const ownerName = await displayName(ownerPhone, "");

    await queueWaNotification(
      ownerPhone,
      `तुमची Krishi Dukan सदस्यता यशस्वीरित्या सक्रिय झाली आहे.`,
      {
        template: "subscription_welcome",
        type: "subscription",
        payload: { ownerName: ownerName || ownerPhone, businessName: "", shopName: "" },
        source: {
          event: "subscription_created",
          entityType: "subscription",
          entityId: event.params.subscriptionId,
        },
      }
    );
  }
);

/**
 * Runs daily. Finds subscriptions expiring within the next 1–3 days (i.e. ~2 days
 * away) and sends a subscription_expiry WhatsApp reminder. Marks each subscription
 * with reminderSent2d=true so subsequent daily runs do not re-send the message.
 */
export const remindExpiringSubscriptions = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Kolkata" },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    // 48-hour window centred on 2 days out — catches the subscription regardless of
    // the exact time of day the scheduler fires or the exact time stored in expiryDate.
    const windowStart = admin.firestore.Timestamp.fromMillis(now.toMillis() + 1 * msPerDay);
    const windowEnd   = admin.firestore.Timestamp.fromMillis(now.toMillis() + 3 * msPerDay);

    // Query active subs in the 2-day window; filter reminderSent2d in-memory
    // so we catch docs where the field doesn't exist yet (new subscriptions).
    const snap = await db
      .collection("subscriptions")
      .where("subscriptionStatus", "==", "active")
      .where("expiryDate", ">=", windowStart)
      .where("expiryDate", "<=", windowEnd)
      .get();

    const toProcess = snap.docs.filter((doc) => doc.data().reminderSent2d !== true);

    if (toProcess.length === 0) {
      console.log("[remindExpiringSubscriptions] No subscriptions expiring in ~2 days");
      return;
    }

    for (const subDoc of toProcess) {
      const d = subDoc.data() as Record<string, unknown>;
      const ownerPhone = firstPhone(d.ownerPhone, d.ownerId);
      if (!ownerPhone) continue;

      const expiryTs = d.expiryDate as admin.firestore.Timestamp | undefined;
      const formattedExpiryDate = expiryTs
        ? expiryTs.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : "soon";

      const ownerName = await displayName(ownerPhone, "");

      await queueWaNotification(
        ownerPhone,
        `तुमची Krishi Dukan सदस्यता ${formattedExpiryDate} रोजी संपणार आहे.`,
        {
          template: "subscription_expiry",
          type: "subscription",
          payload: { ownerName: ownerName || ownerPhone, businessName: "", shopName: "", formattedExpiryDate },
          source: {
            event: "subscription_expiry_reminder",
            entityType: "subscription",
            entityId: subDoc.id,
          },
        }
      );

      await subDoc.ref.update({
        reminderSent2d: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    logger.info(`[remindExpiringSubscriptions] Sent reminders for ${toProcess.length} subscription(s)`);
  }
);

/**
 * Temporary diagnostic endpoint — remove after confirming the pipeline works.
 *
 * Call:  GET https://<region>-<project>.cloudfunctions.net/waQueueDiagnostic?phone=+91XXXXXXXXXX
 *
 * It bypasses all trigger logic and calls queueWaNotification() directly.
 * If a waNotifications doc appears → queue helper works; bug is in a trigger.
 * If no doc appears → the problem is inside queueWaNotification() or Admin SDK init.
 */
export const waQueueDiagnostic = onRequest(async (req, res) => {
  const phone = String(req.query.phone ?? "").trim();
  if (!phone) {
    res.status(400).json({ error: "Pass ?phone=+91XXXXXXXXXX" });
    return;
  }

  logger.info("[waQueueDiagnostic] starting test write", { phone });

  // Verify Admin SDK is initialised by reading any doc
  try {
    await admin.firestore().collection("_diagnostics").doc("ping").set({
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info("[waQueueDiagnostic] Admin SDK Firestore write: OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[waQueueDiagnostic] Admin SDK Firestore write FAILED", { error: msg });
    res.status(500).json({ step: "admin_sdk_check", error: msg });
    return;
  }

  // Now attempt the actual waNotifications write
  const docId = await queueWaNotification(
    phone,
    "KrishiDukan WA pipeline diagnostic test 🔧",
    {
      template: "generic",
      type: "general",
      source: { event: "diagnostic_test", entityType: "diagnostic", entityId: "test" },
    }
  );

  if (docId) {
    logger.info("[waQueueDiagnostic] SUCCESS — waNotifications doc created", { docId });
    res.status(200).json({ success: true, docId, phone });
  } else {
    logger.error("[waQueueDiagnostic] FAILED — queueWaNotification returned null (check logs above for the Firestore error)");
    res.status(500).json({ success: false, phone, note: "queueWaNotification returned null — check Cloud Logging for [waQueue] FAILED entry" });
  }
});
