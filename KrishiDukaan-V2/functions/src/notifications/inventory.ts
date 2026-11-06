import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { firstPhone, notify } from "../notify";

const db = (): admin.firestore.Firestore => admin.firestore();

/** Used when a product carries no `lowStockThreshold` of its own. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/** Sources handled by notifyRetailerOnAssignment — notifying again would duplicate. */
const ASSIGNED_SOURCES = new Set(["manufacturer_assigned", "admin_assigned"]);

/** The seller who owns a product copy, across the schema's five owner fields. */
function ownerPhoneOf(d: Record<string, unknown>): string {
  return firstPhone(
    d.retailerPhone,
    d.ownerPhone,
    d.retailerDocId,
    d.retailerId,
    d.ownerId
  );
}

/** Stock quantity as a number, tolerating the string `stock` label field. */
function stockQtyOf(d: Record<string, unknown>): number | null {
  if (typeof d.stockQuantity === "number") return d.stockQuantity;
  if (typeof d.stock === "number") return d.stock;
  return null;
}

/**
 * A seller added a product to their own inventory → confirm it landed.
 *
 * Only self-service adds reach here: manufacturer/admin assignments are
 * announced by notifyRetailerOnAssignment in index.ts, and canonical
 * manufacturer products are not inventory at all.
 */
export const notifySellerOnInventoryAdd = onDocumentCreated(
  { document: "products/{productId}", region: "asia-south1" },
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;

    const source = String(d.source ?? "").trim();
    if (ASSIGNED_SOURCES.has(source)) return;

    // A seller copy always links back to a root product, or is explicitly
    // tagged as inventory. Anything else is a manufacturer's own catalogue doc.
    const isInventoryCopy =
      source === "retailer_inventory_copy" ||
      !!d.manufacturerProductId ||
      !!d.originalProductId;
    if (!isInventoryCopy) return;

    const ownerPhone = ownerPhoneOf(d);
    if (!ownerPhone) {
      logger.warn("[notifySellerOnInventoryAdd] no owner phone", {
        productId: event.params.productId,
      });
      return;
    }

    const productName = String(d.name ?? "A product").trim() || "A product";
    const qty = stockQtyOf(d);

    await notify(
      ownerPhone,
      "inventory_added",
      "Product added to your inventory ✅",
      qty != null
        ? `"${productName}" is now live with ${qty} in stock.`
        : `"${productName}" is now live in your store.`,
      { productId: event.params.productId }
    );
  }
);

/**
 * Stock fell to or below the product's low-stock threshold → tell the seller.
 *
 * Fires only on the crossing (was above, is now at/below), so restocking and
 * then selling down again re-notifies, while repeated writes at an already-low
 * level stay quiet. That edge condition is also what keeps this from looping:
 * the trigger writes nothing back to the product doc.
 */
export const notifyLowStock = onDocumentWritten(
  { document: "products/{productId}", region: "asia-south1" },
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;

    const d = after.data() as Record<string, unknown>;
    const ownerPhone = ownerPhoneOf(d);
    if (!ownerPhone) return;

    const threshold =
      typeof d.lowStockThreshold === "number" && d.lowStockThreshold > 0
        ? d.lowStockThreshold
        : DEFAULT_LOW_STOCK_THRESHOLD;

    const nowQty = stockQtyOf(d);
    if (nowQty == null || nowQty > threshold) return;

    const before = event.data?.before?.exists
      ? (event.data.before.data() as Record<string, unknown>)
      : null;
    const prevQty = before ? stockQtyOf(before) : null;

    // Already low before this write → not a crossing, stay quiet.
    if (prevQty != null && prevQty <= threshold) return;
    // Created already low is worth one notification; created empty is not
    // (sellers routinely save a draft with 0 before stocking it).
    if (before == null && nowQty <= 0) return;

    const productName = String(d.name ?? "A product").trim() || "A product";
    const title = nowQty <= 0 ? "Out of stock ⛔" : "Low stock alert ⚠️";
    const body =
      nowQty <= 0
        ? `"${productName}" is out of stock. Tap to restock.`
        : `"${productName}" is down to ${nowQty} left (threshold ${threshold}). Tap to restock.`;

    await notify(ownerPhone, "low_stock", title, body, {
      productId: event.params.productId,
      productName,
      stock: String(nowQty),
      threshold: String(threshold),
    });

    logger.info("[notifyLowStock] notified", {
      productId: event.params.productId,
      nowQty,
      threshold,
    });
  }
);

/** Exposed for the digest, which counts a seller's low-stock products. */
export async function countLowStock(ownerPhone: string): Promise<number> {
  const seen = new Set<string>();
  let low = 0;
  for (const field of ["retailerPhone", "ownerPhone"]) {
    const snap = await db()
      .collection("products")
      .where(field, "==", ownerPhone)
      .get();
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const d = doc.data();
      const qty = stockQtyOf(d);
      const threshold =
        typeof d.lowStockThreshold === "number" && d.lowStockThreshold > 0
          ? d.lowStockThreshold
          : DEFAULT_LOW_STOCK_THRESHOLD;
      if (qty != null && qty <= threshold) low++;
    }
  }
  return low;
}
