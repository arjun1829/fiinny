import * as admin from "firebase-admin";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { queueWaNotification } from "./wa-notify";
import { looksLikePhone, firstPhone, notify, displayName } from "./notify";
import { recordEngagement } from "./notifications/engagement";

export { sendWaNotification, retryWaNotifications, webhookReceiver } from "./wa-dispatch";
export { transcodeReel } from "./reels/media/transcodeReel";
export { backfillReelTranscodes } from "./reels/media/backfillReelTranscodes";
export { backfillReelThumbnails } from "./reels/media/backfillReelThumbnails";
export { releaseTransferOnDelivery } from "./route-release";
export {
  notifyOwnerOnReelRepost,
  flushEngagementNotifications,
  pruneEngagementBuffer,
} from "./notifications/engagement";
export {
  notifySellerOnInventoryAdd,
  notifyLowStock,
} from "./notifications/inventory";
export { sendStoreAnalyticsDigest } from "./notifications/digest";
export { raiseAbandonedCheckoutEnquiries } from "./notifications/enquiries";
export { notifySellerOfOrderOffer, expireOrderReassignments } from "./notifications/reassignment";
export {
  remindIncompleteProfiles,
  remindIncompletePayoutDetails,
  remindSubscriptionRenewal,
} from "./notifications/reminders";
export {
  remindPendingOrderAcceptance,
  testOrderAcceptPendingReminder,
} from "./notifications/order-accept-reminder";
export {
  provisionErpTenantOnSubscription,
  provisionErpTenantByAdmin,
  createErpHandoffCode,
  redeemErpHandoffCode,
} from "./erp-bridge";
export { onActiveUserPresence } from "./analytics/activity";

admin.initializeApp();
const db = admin.firestore();

/**
 * syncSellerProductToCanonical
 *
 * Triggers on every write to products/{productId}.
 * If the doc is a seller copy (has manufacturerProductId or originalProductId),
 * it fans out the changed price / stock / discount / online-delivery status to:
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
      // A seller flipping their own Inventory → Online Delivery toggle must
      // reach the canonical availability[] entry too — without this, a
      // retailer who legitimately turns delivery on for an assigned product
      // never shows up as orderable, since availability[].isOnline (what the
      // marketplace store picker reads) was never being kept in sync with
      // this doc's own isOnline/sellMode.
      const onlineChanged =
        before.isOnline !== d.isOnline || before.sellMode !== d.sellMode;
      // A seller adding or repricing a package size must reach the canonical
      // availability entry. Without this the trigger returned immediately on a
      // variants-only edit, so a retailer who stocked a new size (5L on a
      // catalogue product listing only 1L) never surfaced it anywhere.
      const variantsChanged =
        JSON.stringify(before.variants ?? null) !== JSON.stringify(d.variants ?? null);
      if (
        !priceChanged && !stockChanged && !discountChanged &&
        !identityChanged && !onlineChanged && !variantsChanged
      ) return;
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

    // A seller's copy is the source of truth for whether THEY personally sell
    // this online — explicit isOnline wins; otherwise derive from sellMode.
    // Missing/unset entirely defaults to false (never advertise online
    // delivery a seller never explicitly turned on).
    const isOnline =
      typeof d.isOnline === "boolean"
        ? d.isOnline
        : d.sellMode === "online_delivery";

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

        // The seller's own package sizes. The marketplace resolves per-store
        // pricing from the entry's variants, so a size missing here is a size
        // that store cannot sell even when the chip is visible.
        const sellerVariants = Array.isArray(d.variants) ? d.variants : null;

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
          patch.isOnline = isOnline;
          if (sellerVariants) patch.variants = sellerVariants;
          // P6: Enrich storePhone when it is missing in the availability entry.
          // This replaces the per-product arrayRemove+arrayUnion loop that backfill
          // used to run after the batch commit (which generated N extra HTTP requests).
          if (!entry.storePhone && ownerPhone) patch.storePhone = ownerPhone;
          return patch;
        });

        // No entry for this seller yet — create one rather than dropping the
        // update. Canonical docs assigned by admin often have no availability[]
        // at all, so the map above matched nothing and every price, stock, and
        // variant change this seller made was silently discarded.
        if (!changed && (ownerId || ownerPhone)) {
          updated.push({
            storeId: ownerId || ownerPhone,
            storePhone: ownerPhone || undefined,
            storeName: d.store ?? d.storeName ?? undefined,
            stockLevel: stockLabel ?? "In Stock",
            sellingPrice: sellingPrice ?? undefined,
            isOnline,
            discountPct: effectivePct,
            ...(sellerVariants ? { variants: sellerVariants } : {}),
          });
          changed = true;
        }

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
 *
 * Also promotes future-dated admin-assigned subscriptions (subscriptionStatus
 * "scheduled", written by /api/admin/subscriptions/assign when the admin
 * picks a future start date) to "active" once startDate has arrived, and
 * flips isPaid=true at that point — access is intentionally NOT granted at
 * creation time for a scheduled subscription, only once it actually starts.
 */
export const expireSubscriptions = onSchedule(
  { schedule: "every 24 hours", timeZone: "Asia/Kolkata" },
  async () => {
    const now = admin.firestore.Timestamp.now();

    // ── Promote scheduled subscriptions whose start date has arrived ───────
    // Single-field equality query (no composite index needed — scheduled
    // subscriptions are rare, admin-assigned only, so filtering startDate
    // in code instead of a second range clause is cheap and avoids needing
    // a new Firestore composite index deploy for this one query).
    const scheduledSnap = await db
      .collection("subscriptions")
      .where("subscriptionStatus", "==", "scheduled")
      .get();
    const dueDocs = scheduledSnap.docs.filter((d) => {
      const startDate = d.data().startDate as FirebaseFirestore.Timestamp | undefined;
      return !!startDate && startDate.toMillis() <= now.toMillis();
    });

    if (dueDocs.length > 0) {
      const promoteBatch = db.batch();
      for (const subDoc of dueDocs) {
        const d = subDoc.data() as Record<string, unknown>;
        promoteBatch.update(subDoc.ref, {
          subscriptionStatus: "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const ownerPhone = String(d.ownerPhone ?? "");
        const seats = Number(d.seatsPurchased) || 0;
        if (ownerPhone) {
          const userRef = db.collection("users").doc(ownerPhone);
          const userSnap = await userRef.get();
          const currentSeats = Number(userSnap.data()?.totalSeats) || 0;
          promoteBatch.update(userRef, {
            isPaid: true,
            subscriptionStatus: "paid",
            totalSeats: currentSeats + seats,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      await promoteBatch.commit();
      console.log(`[expireSubscriptions] promoted ${dueDocs.length} scheduled subscriptions to active`);
    }

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
/** Product-doc fields that can carry a seller identity, phone-first. */
const OWNER_FIELDS = ["retailerPhone", "ownerPhone", "retailerId", "ownerId"] as const;

/**
 * Sources marking a doc as a seller's copy of a canonical catalog product.
 * Kept in sync with CatalogRepository.fetchAllMergedProducts (mobile) and the
 * merge in app/firebase.ts — the marketplace joins these to the canonical doc
 * by product name, which is why the name lookup below is the right join key.
 */
const COPY_SOURCES = new Set([
  "admin_assigned",
  "manufacturer_assigned",
  "retailer_inventory_copy",
]);

/** First non-empty OWNER_FIELDS value on a product doc, or "". */
function ownerOf(d: Record<string, unknown> | undefined): string {
  for (const f of OWNER_FIELDS) {
    const v = String(d?.[f] ?? "").trim();
    if (v) return v;
  }
  return "";
}

type ResolvedSeller = {
  sellerId: string;
  sellerPhone: string;
  sellerName: string;
  via: string;
};

/**
 * Recovers the seller for an order whose client wrote none.
 *
 * Two shapes produce an unkeyed order:
 *   1. The ordered product owns itself (ownerPhone / retailerId / …).
 *   2. The ordered product is a CANONICAL catalog doc (source: "admin") with
 *      no ownership fields at all but flagged online_delivery. The real seller
 *      lives on a separate copy doc that the marketplace merges in by name.
 *
 * Case 2 is only resolved when it is UNAMBIGUOUS — if two retailers stock the
 * same catalog product the order genuinely cannot be attributed automatically,
 * and guessing would hand one seller another's money. Those return null and
 * are left for `scripts/repair-orphan-order-sellers.js` to report.
 */
async function resolveSellerForOrder(
  items: Record<string, unknown>[]
): Promise<ResolvedSeller | null> {
  const productId = String(
    items[0]?.catalogId ?? items[0]?.listingId ?? items[0]?.productId ?? ""
  ).trim();
  if (!productId) return null;

  const prodSnap = await db.collection("products").doc(productId).get();
  if (!prodSnap.exists) return null;
  const prod = prodSnap.data() as Record<string, unknown>;

  // 1. The ordered doc owns itself.
  const direct = ownerOf(prod);
  if (direct) {
    return {
      sellerId: direct,
      sellerPhone: firstPhone(...OWNER_FIELDS.map((f) => prod[f])),
      sellerName: String(prod.store ?? prod.storeName ?? "").trim(),
      via: `products/${productId}`,
    };
  }

  // 2. Ownerless canonical doc — join to its seller copies by name.
  const name = String(prod.name ?? "").trim();
  if (!name) return null;

  const siblings = await db.collection("products").where("name", "==", name).get();
  const copies = siblings.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    .filter((c) => COPY_SOURCES.has(String(c.data.source ?? "")) && ownerOf(c.data));

  const distinctOwners = Array.from(new Set(copies.map((c) => ownerOf(c.data))));
  if (distinctOwners.length !== 1) return null;

  const copy = copies.find((c) => ownerOf(c.data))!;
  return {
    sellerId: distinctOwners[0],
    sellerPhone: firstPhone(...OWNER_FIELDS.map((f) => copy.data[f])),
    sellerName: String(copy.data.store ?? copy.data.storeName ?? "").trim(),
    via: `products/${copy.id} (source: ${copy.data.source}, matched by name)`,
  };
}

/**
 * backfillOrderSeller
 *
 * Server-side backstop for orders written with no seller key at all. A paid
 * order with `sellerId: ""` matches no seller-dashboard query on web or
 * mobile, so the retailer never sees it and never fulfils it — the money
 * lands and the order silently vanishes.
 *
 * The client-side guards live in the Flutter checkout, but old installs stay
 * in the field for months after a release, so the fix cannot be client-only.
 * This runs regardless of which client wrote the order, or how old it is.
 *
 * Updating the doc does not re-fire this trigger (onDocumentCreated only fires
 * on create), so there is no write loop.
 */
export const backfillOrderSeller = onDocumentCreated(
  "orders/{orderId}",
  async (event) => {
    const snap = event.data;
    const d = snap?.data() as Record<string, unknown> | undefined;
    if (!snap || !d) return;

    if (String(d.sellerId ?? "").trim()) return; // already keyed — nothing to do

    const orderId = event.params.orderId;
    const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];

    logger.warn("[backfillOrderSeller] order written with no seller key", {
      orderId,
      customerPhone: d.customerPhone ?? null,
      itemCount: items.length,
    });

    let resolved: ResolvedSeller | null = null;
    try {
      resolved = await resolveSellerForOrder(items);
    } catch (err) {
      logger.error("[backfillOrderSeller] resolution threw", { orderId, err: String(err) });
      return;
    }

    if (!resolved) {
      logger.error("[backfillOrderSeller] could not attribute order — needs manual repair", {
        orderId,
        productId: items[0]?.catalogId ?? items[0]?.listingId ?? null,
      });
      return;
    }

    const update: Record<string, string> = {
      sellerId: resolved.sellerId,
      sellerPhone: resolved.sellerPhone,
    };
    // Only fill a blank name — never overwrite one the client already wrote.
    if (resolved.sellerName && !String(d.sellerName ?? "").trim()) {
      update.sellerName = resolved.sellerName;
    }

    await snap.ref.update(update);
    logger.info("[backfillOrderSeller] repaired", { orderId, ...update, via: resolved.via });
  }
);

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

    // Last resort: the order carries no seller key at all, so the lookups above
    // were skipped entirely (they need a sellerId to start from). Recover the
    // owner from the ordered product the same way backfillOrderSeller does —
    // that trigger repairs the doc, but it races this one, so resolving here
    // too is what actually gets the alert out on an orphaned order.
    if (!sellerPhone) {
      try {
        const resolved = await resolveSellerForOrder(
          Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
        );
        if (resolved?.sellerPhone) {
          sellerPhone = resolved.sellerPhone;
          logger.info("[notifySellerOnOrder] resolved phone from the ordered product", {
            orderId, sellerPhone, via: resolved.via,
          });
        }
      } catch (err) {
        logger.error("[notifySellerOnOrder] product-based resolution threw", {
          orderId, err: String(err),
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
    // Canonical final total is `grandTotal` (web) / `total` (mobile) — read both
    // so the notification shows an amount regardless of which flow placed the order.
    const totalRaw = d.grandTotal ?? d.total;
    const total = typeof totalRaw === "number" ? totalRaw : null;
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
      dispatched: [
        "Order dispatched 📦",
        `${store} has dispatched your order for ${itemSummary}`,
      ],
      out_for_delivery: [
        "Out for delivery 🚚",
        `Your order for ${itemSummary} is on its way`,
      ],
      delivered: [
        "Order delivered 🎉",
        `Your order for ${itemSummary} was delivered`,
      ],
      reassigning: [
        "Finding another seller 🔄",
        `${store} couldn't fulfil your order for ${itemSummary}. We're asking other sellers now — if nobody takes it within 24 hours, you'll be refunded automatically.`,
      ],
      rejected: [
        "Order declined ❌",
        `${store} couldn't fulfil your order for ${itemSummary}. If you paid online, it's been refunded automatically.`,
      ],
      cancelled: [
        "Order cancelled",
        `Your order for ${itemSummary} was cancelled. If you paid online, it's been refunded automatically.`,
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

    const likerName = await displayName(likerId, "Someone");

    // Buffered, not pushed: a reel that takes off would otherwise fire one
    // notification per like. flushEngagementNotifications groups them hourly.
    await recordEngagement({
      ownerPhone,
      actorPhone: likerId,
      actorName: likerName,
      kind: "like",
      reelId,
    });
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

    // Also buffered — with instantSent so the hourly flush never re-sends it,
    // but a grouped summary can still read "…liked and commented on your
    // content". Comments stay instant because they expect a reply.
    await recordEngagement({
      ownerPhone,
      actorPhone: commenterPhone,
      actorName: commenterName,
      kind: "comment",
      reelId,
      instantSent: true,
    });

    const taggedUserId = d.taggedUserId as string | undefined;
    if (taggedUserId && taggedUserId !== commenterPhone) {
      await notify(
        taggedUserId,
        "reel_comment_tag",
        `${commenterName} tagged you in a comment 🏷️`,
        preview || "Tap to view",
        { reelId }
      );
    }
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

    await recordEngagement({
      ownerPhone: shopPhone,
      actorPhone: followerPhone,
      actorName: followerName,
      kind: "follow",
    });
  }
);

/**
 * Someone reported a reel → tally reports on the reel doc, and once the
 * count crosses REPORT_FLAG_THRESHOLD, flip moderationStatus to 'flagged' so
 * it drops out of every feed/profile/product-page query (see
 * ReelsRepository in the mobile app, and getAllReels in
 * app/lib/seo/reels-server.ts on web).
 *
 * Runs with the admin SDK, which is not subject to firestore.rules — that's
 * deliberate: no client, including the reel's own owner, may set
 * moderationStatus directly (see the `reels` match block in
 * firestore.rules). Per docs/reels-ranking-architecture.md §7, a human
 * reviewing nothing on day one is fine — the field and the filter existing
 * at all is the actual requirement this closes.
 */
const REPORT_FLAG_THRESHOLD = 3;

export const flagReelOnReports = onDocumentCreated(
  "reel_reports/{reportId}",
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const reelId = String(d.reelId ?? "");
    if (!reelId) return;

    const reelRef = db.collection("reels").doc(reelId);

    // Transaction so two reports landing back-to-back can't both read the
    // same pre-increment count and only one of them actually cross the
    // threshold.
    const justFlagged = await db.runTransaction(async (txn) => {
      const reelSnap = await txn.get(reelRef);
      if (!reelSnap.exists) return false;

      const reel = reelSnap.data() as Record<string, unknown>;
      const reportCount = (Number(reel.reportCount) || 0) + 1;
      const wasFlagged = reel.moderationStatus === "flagged";
      const nowFlagged = reportCount >= REPORT_FLAG_THRESHOLD;

      txn.update(reelRef, {
        reportCount,
        ...(nowFlagged ? { moderationStatus: "flagged" } : {}),
      });

      return nowFlagged && !wasFlagged;
    });

    if (!justFlagged) return;

    const reelSnap = await reelRef.get();
    const reel = reelSnap.data() as Record<string, unknown> | undefined;
    const ownerPhone = String(reel?.shopOwnerId ?? "");
    if (!ownerPhone) return;

    await notify(
      ownerPhone,
      "reel_flagged",
      "Your reel was flagged for review",
      "Multiple viewers reported one of your reels, so it's hidden from the feed pending review.",
      { reelId }
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
