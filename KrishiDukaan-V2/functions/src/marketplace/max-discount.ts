import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

/**
 * Keeps maxDiscountPct on a root (manufacturer or admin) product equal to the
 * highest effectiveDiscountPct among the root itself, when active, and its
 * active seller copies: the "Up to N% OFF" badge the storefront, app and
 * marketplace cards show.
 *
 * The website used to recompute this in the seller's browser and write it to
 * the root product, which firestore.rules had to allow for anyone signed in,
 * so anyone could set a fake badge on any product; the app never recomputed
 * it at all. Here it follows every discount change from either client, and
 * the rule no longer lets non-owners write the field.
 */

const REGION = "asia-south1";
const PRODUCTS = "products";
const MAX_EVENT_AGE_MS = 60 * 60 * 1000;
const TRANSIENT_GRPC_CODES = new Set([4, 8, 10, 13, 14]);

/** Fields that can change a root's maxDiscountPct. */
const WATCHED_FIELDS = ["effectiveDiscountPct", "isActive", "originalProductId", "manufacturerProductId"];

const db = (): admin.firestore.Firestore => admin.firestore();

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The root product a doc rolls up to: its manufacturer/original product, or itself. */
export function rootIdOf(productId: string, data: admin.firestore.DocumentData | null): string {
  const parent = String(data?.manufacturerProductId || data?.originalProductId || "");
  return parent || productId;
}

/**
 * Recomputes and stores the root's maxDiscountPct, writing only when it
 * changed. Same rule the website used: the root's own discount (if active)
 * and every active copy linked by originalProductId or manufacturerProductId.
 */
export async function recomputeMaxDiscount(rootId: string): Promise<number | null> {
  const products = db().collection(PRODUCTS);
  const [rootSnap, byOriginal, byManufacturer] = await Promise.all([
    products.doc(rootId).get(),
    products.where("originalProductId", "==", rootId).where("isActive", "==", true).get(),
    products.where("manufacturerProductId", "==", rootId).where("isActive", "==", true).get(),
  ]);
  if (!rootSnap.exists) return null;

  const root = rootSnap.data() ?? {};
  const pcts = [root.isActive !== false ? num(root.effectiveDiscountPct) : 0];
  for (const copy of [...byOriginal.docs, ...byManufacturer.docs]) {
    pcts.push(num(copy.get("effectiveDiscountPct")));
  }
  const max = Math.max(0, ...pcts);
  if (num(root.maxDiscountPct) !== max || typeof root.maxDiscountPct !== "number") {
    await rootSnap.ref.update({ maxDiscountPct: max });
  }
  return max;
}

export const syncMaxDiscountOnProductWrite = onDocumentWritten(
  { document: `${PRODUCTS}/{productId}`, region: REGION, retry: true, timeoutSeconds: 60 },
  async (event) => {
    if (Date.now() - Date.parse(event.time) > MAX_EVENT_AGE_MS) return;
    const productId = event.params.productId;
    const before = event.data?.before?.exists ? event.data.before.data() ?? {} : null;
    const after = event.data?.after?.exists ? event.data.after.data() ?? {} : null;

    // Most writes (view counters, prices, stock) cannot change the badge.
    if (before && after && WATCHED_FIELDS.every((f) => before[f] === after[f])) return;

    for (const rootId of Array.from(new Set([rootIdOf(productId, before), rootIdOf(productId, after)]))) {
      try {
        await recomputeMaxDiscount(rootId);
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (typeof code === "number" && TRANSIENT_GRPC_CODES.has(code)) throw err;
        logger.error("[maxDiscount] recompute failed", { productId, rootId, err: String(err) });
      }
    }
  },
);
