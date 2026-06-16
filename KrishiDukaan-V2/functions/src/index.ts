import * as admin from "firebase-admin";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

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
    const mfr = String(
      d.assignedByManufacturerName ?? d.manufacturerName ?? d.brand ?? ""
    ).trim() || (await displayName(mfrPhone, "A manufacturer"));

    await notify(
      retailerPhone,
      "assignment",
      "New product assigned 📦",
      `${mfr} assigned "${productName}" to your store`,
      { productId: event.params.productId }
    );
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
    const mfr = String(
      d.manufacturerName ?? d.manufacturerBusinessName ?? ""
    ).trim() ||
      (await displayName(
        String(d.manufacturerPhone ?? ""),
        "A manufacturer"
      ));

    await notify(
      retailerPhone,
      "network",
      "Added to a retailer network 🤝",
      `${mfr} added you to their retailer network`,
      { inviteId: event.params.docId }
    );
  }
);
