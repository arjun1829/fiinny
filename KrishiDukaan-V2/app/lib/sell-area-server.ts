import type { DeliverySettingsLike } from "../utils/delivery";
import { makeSellerMatcher } from "./cart-pricing";
import { checkSellArea, licensedStatesOf, type SellAreaBlock } from "./sell-area";

/**
 * Server side of lib/sell-area.ts: works out, from the documents a cart line
 * was priced from, which licence and network lock apply to it.
 *
 *  - A network retailer's assigned copy (source "manufacturer_assigned")
 *    points at the manufacturer product (manufacturerProductId) whose
 *    licence it sells under. Whether the manufacturer lets that retailer
 *    sell online lives on their manufacturerRetailers link
 *    (onlineSalesBlocked) — the retailer can't edit that doc, unlike their
 *    own copy, where the same flag is only mirrored for display.
 *  - The manufacturer selling their own product: the product doc itself.
 *  - Anything else (independent retailers, including ones who copied a
 *    manufacturer's product into their own shop) has no licence limit.
 */

type Doc = Record<string, unknown>;
type Db = FirebaseFirestore.Firestore;

export type SellAreaContext = {
  licensedStates: string[] | null;
  /** The manufacturer's own listing — their area comes from the licence, not coverage. */
  manufacturerLine: boolean;
  onlineLocked: boolean;
};

/** Is this network retailer locked to in-store sales? One read per pair, per request. */
export function networkLockLoader(db: Db) {
  const cache = new Map<string, Promise<boolean>>();
  return (manufacturerId: string, retailerDocId: string): Promise<boolean> => {
    if (!manufacturerId || !retailerDocId) return Promise.resolve(false);
    const key = `${manufacturerId}|${retailerDocId}`;
    let p = cache.get(key);
    if (!p) {
      p = db.collection("manufacturerRetailers")
        .where("manufacturerId", "==", manufacturerId)
        .where("retailerDocId", "==", retailerDocId)
        .limit(1)
        .get()
        .then((q) => !q.empty && q.docs[0].get("onlineSalesBlocked") === true)
        .catch(() => false);
      cache.set(key, p);
    }
    return p;
  };
}

/** Licence states per manufacturer product id, read once per request. */
export function licenceLoader(db: Db, known: Map<string, Doc | null> = new Map()) {
  const cache = new Map<string, Promise<string[]>>();
  return (productId: string): Promise<string[]> => {
    if (!productId) return Promise.resolve([]);
    if (known.has(productId)) return Promise.resolve(licensedStatesOf(known.get(productId)));
    let p = cache.get(productId);
    if (!p) {
      p = db.collection("products").doc(productId).get()
        .then((s) => licensedStatesOf(s.data() as Doc | undefined))
        .catch(() => []);
      cache.set(productId, p);
    }
    return p;
  };
}

export async function sellAreaContext(params: {
  productId: string;
  prodData: Doc | null;
  copyData: Doc | null;
  /** Does a doc belong to this line's seller? (cart-pricing makeSellerMatcher) */
  matchesSeller: (doc: Doc | null | undefined) => boolean;
  licence: (productId: string) => Promise<string[]>;
  networkLock: (manufacturerId: string, retailerDocId: string) => Promise<boolean>;
}): Promise<SellAreaContext> {
  const { productId, prodData, copyData, matchesSeller, licence, networkLock } = params;
  if (copyData && copyData.source === "manufacturer_assigned") {
    const mfrProductId = String(copyData.manufacturerProductId ?? "") || productId;
    const [licensedStates, locked] = await Promise.all([
      licence(mfrProductId),
      networkLock(String(copyData.manufacturerId ?? ""), String(copyData.retailerDocId ?? "")),
    ]);
    return {
      licensedStates,
      manufacturerLine: false,
      onlineLocked: locked || copyData.onlineLockedByManufacturer === true,
    };
  }
  if (prodData && prodData.source === "manufacturer_inventory" && matchesSeller(prodData)) {
    return { licensedStates: licensedStatesOf(prodData), manufacturerLine: true, onlineLocked: false };
  }
  return { licensedStates: null, manufacturerLine: false, onlineLocked: false };
}

/** The rule check for one line, given its context and the seller's delivery settings. */
export function sellAreaBlockFor(
  ctx: SellAreaContext,
  settings: DeliverySettingsLike | (DeliverySettingsLike & { states?: unknown }) | null,
  customerState: string | null | undefined,
): SellAreaBlock | null {
  return checkSellArea({
    customerState,
    licensedStates: ctx.licensedStates,
    // Manufacturers sell where their licences allow; their coverage setting is not used.
    coverage: ctx.manufacturerLine ? null : (settings as { coverageType?: unknown; states?: unknown } | null),
    onlineLocked: ctx.onlineLocked,
  });
}

const PHONE_RE = /^(\+91)?[6-9]\d{9}$/;

/**
 * The whole-cart check behind /api/cart/availability: for each line, which
 * rule (if any) stops it reaching `customerState`. Reads per line: the
 * product, its copies (two indexed queries) — the same documents checkout
 * prices from — plus one deliverySettings doc per seller.
 */
export async function checkCartSellArea(
  db: Db,
  items: { productId: string; sellerId?: string; sellerPhone?: string }[],
  customerState: string,
): Promise<{ productId: string; sellerId: string; block: SellAreaBlock | null }[]> {
  const prodCache = new Map<string, Promise<Doc | null>>();
  const getProd = (id: string) => {
    let p = prodCache.get(id);
    if (!p) {
      p = db.collection("products").doc(id).get().then((s) => (s.exists ? (s.data() as Doc) : null));
      prodCache.set(id, p);
    }
    return p;
  };
  const settingsCache = new Map<string, Promise<Doc | null>>();
  const getSettings = (phone: string) => {
    let p = settingsCache.get(phone);
    if (!p) {
      p = db.collection("deliverySettings").doc(phone).get()
        .then((s) => (s.exists ? (s.data() as Doc) : null))
        .catch(() => null);
      settingsCache.set(phone, p);
    }
    return p;
  };
  const licence = licenceLoader(db);
  const networkLock = networkLockLoader(db);

  return Promise.all(items.map(async (item) => {
    const productId = String(item.productId ?? "");
    const sellerId = String(item.sellerId ?? "");
    const sellerPhone = String(item.sellerPhone ?? "").trim();
    if (!productId) return { productId, sellerId, block: null };
    const [prodData, origCopies, mfrCopies] = await Promise.all([
      getProd(productId),
      db.collection("products").where("originalProductId", "==", productId).limit(50).get(),
      db.collection("products").where("manufacturerProductId", "==", productId).limit(50).get(),
    ]);
    // A cart line for the manufacturer's own listing may carry no seller at all.
    const ownerKey = !sellerPhone && !sellerId && prodData
      ? String(prodData.ownerPhone ?? prodData.manufacturerPhone ?? "")
      : "";
    const matchesSeller = makeSellerMatcher([sellerPhone, sellerId, ownerKey]);
    const copyData = [...origCopies.docs, ...mfrCopies.docs]
      .map((d) => d.data() as Doc)
      .find((d) => d.isActive !== false && matchesSeller(d)) ?? null;

    const ctx = await sellAreaContext({ productId, prodData, copyData, matchesSeller, licence, networkLock });
    const phone = sellerPhone || ownerKey || (PHONE_RE.test(sellerId) ? sellerId : "");
    const settings = !ctx.manufacturerLine && phone ? await getSettings(phone) : null;
    return { productId, sellerId, block: sellAreaBlockFor(ctx, settings as DeliverySettingsLike | null, customerState) };
  }));
}
