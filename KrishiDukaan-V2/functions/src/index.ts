import * as admin from "firebase-admin";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { queueWaNotification } from "./wa-notify";

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
    const before = event.data?.before?.exists
      ? (event.data.before.data() as Record<string, unknown>)
      : null;

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

/** New order placed → notify the seller (store owner). */
export const notifySellerOnOrder = onDocumentCreated(
  "orders/{orderId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const sellerPhone = firstPhone(d.sellerPhone, d.sellerId, d.storePhone);
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
      { orderId: event.params.orderId }
    );

    logger.info("[notifySellerOnOrder] resolved sellerPhone", { sellerPhone, orderId: event.params.orderId });
    if (sellerPhone) {
      const totalStr = total != null ? `\nएकूण रक्कम: ₹${total}` : "";
      logger.info("[notifySellerOnOrder] before queueWaNotification");
      await queueWaNotification(
        sellerPhone,
        `🛒 नवीन ऑनलाइन ऑर्डर प्राप्त झाली आहे.\n\nग्राहक: ${customer}\nप्रॉडक्ट: ${itemSummary}${totalStr}\n\nऑर्डरची संपूर्ण माहिती पाहण्यासाठी Krishi Dukan अॅप किंवा वेबसाइटला भेट द्या.\nhttps://krishidukan.com`,
        {
          template: "order_notification",
          type: "order",
          payload: { customerName: customer, itemSummary, total: total ?? 0 },
          source: { event: "order_created", entityType: "order", entityId: event.params.orderId },
        }
      );
      logger.info("[notifySellerOnOrder] after queueWaNotification");
    } else {
      logger.warn("[notifySellerOnOrder] skipping WA — sellerPhone is empty", { orderId: event.params.orderId });
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
      const payload = isOnboarded
        ? { manufacturerName: mfr, productName, productId }
        : { manufacturerName: mfr, productName, productId, inviteCode };

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
      logger.info("[notifyRetailerOnNetworkAdd] before queueWaNotification", { inviteCode: !!inviteCode });
      await queueWaNotification(
        retailerPhone,
        `🌱 Krishi Dukan परिवारात तुमचं मनःपूर्वक स्वागत आहे!\n\nतुम्हाला ${mfr} यांच्या Retailer Network मध्ये सहभागी करण्यात आलं आहे.`,
        {
          template: "retailer_onboarding",
          type: "onboarding",
          payload: { manufacturerName: mfr, inviteCode },
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

    const name = await displayName(ownerPhone, "");

    await queueWaNotification(
      ownerPhone,
      `🎉 अभिनंदन!\n\nतुमची Krishi Dukan सदस्यता यशस्वीरित्या सक्रिय झाली आहे.\n\nआता तुम्ही तुमचं दुकान व्यवस्थापित करू शकता, प्रॉडक्ट्स जोडू शकता आणि ऑनलाइन ऑर्डर्स स्वीकारू शकता.\n\nतुमच्या व्यवसायासाठी शुभेच्छा!\nhttps://krishidukan.com`,
      {
        template: "subscription_welcome",
        type: "subscription",
        payload: { name: name || ownerPhone },
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
 * Runs daily. Finds subscriptions expiring in exactly 7 days and sends a
 * WhatsApp reminder. Marks each reminded subscription with reminderSent7d=true
 * to prevent duplicate reminders.
 */
export const remindExpiringSubscriptions = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Kolkata" },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const windowStart = admin.firestore.Timestamp.fromMillis(now.toMillis() + 6 * msPerDay);
    const windowEnd   = admin.firestore.Timestamp.fromMillis(now.toMillis() + 8 * msPerDay);

    // Query all active subs in the 7-day window; filter reminderSent7d in-memory
    // so we catch docs where the field doesn't exist yet (new subscriptions).
    const snap = await db
      .collection("subscriptions")
      .where("subscriptionStatus", "==", "active")
      .where("expiryDate", ">=", windowStart)
      .where("expiryDate", "<=", windowEnd)
      .get();

    const toProcess = snap.docs.filter((doc) => doc.data().reminderSent7d !== true);

    if (toProcess.length === 0) {
      console.log("[remindExpiringSubscriptions] No subscriptions expiring in 7 days");
      return;
    }

    for (const subDoc of toProcess) {
      const d = subDoc.data() as Record<string, unknown>;
      const ownerPhone = firstPhone(d.ownerPhone, d.ownerId);
      if (!ownerPhone) continue;

      const expiryTs = d.expiryDate as admin.firestore.Timestamp | undefined;
      const expiryDate = expiryTs
        ? expiryTs.toDate().toLocaleDateString("mr-IN", { day: "numeric", month: "long", year: "numeric" })
        : "लवकरच";

      const name = await displayName(ownerPhone, "");

      await queueWaNotification(
        ownerPhone,
        `⏰ सदस्यता नूतनीकरणाची आठवण\n\nतुमची Krishi Dukan सदस्यता ${expiryDate} रोजी संपणार आहे.\n\nसेवा अखंड सुरू ठेवण्यासाठी कृपया वेळेत सदस्यता नूतनीकरण करा.\nhttps://krishidukan.com`,
        {
          template: "subscription_expiry",
          type: "subscription",
          payload: { name: name || ownerPhone, expiryDate },
          source: {
            event: "subscription_expiry_reminder",
            entityType: "subscription",
            entityId: subDoc.id,
          },
        }
      );

      await subDoc.ref.update({
        reminderSent7d: true,
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
