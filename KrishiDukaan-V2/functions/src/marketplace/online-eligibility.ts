import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

/**
 * ONE answer to "can this store take an online order for this product?",
 * written where every app version and the website already look:
 * products/{canonical}.availability[].isOnline.
 *
 * Checkout (app/api/payment/create-cart-order) refuses a store unless BOTH
 *   - the store's own copy of the product is online, and
 *   - the store's account-level Online Delivery switch is ON.
 * The marketplace used to decide from availability[].isOnline alone, which
 * only ever reflected the copy (and, for 1,740 entries on 13 products, was
 * stale even for that). So customers were offered stores checkout refuses:
 * 107 refused checkouts in 30 days before 2026-11-11, almost all one product.
 *
 * Now isOnline = copy online && account switch on, kept true by:
 *   - syncSellerProductToCanonical (index.ts) on every copy write,
 *   - syncOnlineDeliverySwitch below when a seller flips the switch,
 *   - reconcileOnlineAvailability daily, as a safety net.
 * The canonical product also carries ownerOnline: whether its OWNER passes the
 * account half of the rule, so the app can offer the owner's own listing.
 */

const db = () => admin.firestore();
const PHONE_RE = /^(\+91)?[6-9]\d{9}$/;
const k10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
const e164 = (v: unknown) => (k10(v).length === 10 ? `+91${k10(v)}` : "");

/**
 * The account switch, read EXACTLY as checkout reads it
 * (fetchStoreOnlineDeliveryAdmin in create-cart-order): profiles → users →
 * retailers → manufacturers → legacy retailers by phone field; missing = off.
 * Keep the two in step.
 */
export async function accountOnline(phone: string): Promise<boolean> {
  if (!phone || !PHONE_RE.test(phone)) return false;
  const [profileSnap, userSnap] = await Promise.all([
    db().collection("profiles").doc(phone).get(),
    db().collection("users").doc(phone).get(),
  ]);
  if (profileSnap.exists && typeof profileSnap.data()?.onlineDelivery === "boolean") {
    return !!profileSnap.data()!.onlineDelivery;
  }
  if (userSnap.exists && typeof userSnap.data()?.onlineDelivery === "boolean") {
    return !!userSnap.data()!.onlineDelivery;
  }
  const [retailerSnap, mfrSnap] = await Promise.all([
    db().collection("retailers").doc(phone).get(),
    db().collection("manufacturers").doc(phone).get(),
  ]);
  if (retailerSnap.exists) return !!retailerSnap.data()?.onlineDelivery;
  if (mfrSnap.exists) return !!mfrSnap.data()?.onlineDelivery;
  const digits = phone.replace(/^\+91/, "");
  const [byE164, byDigits] = await Promise.all([
    db().collection("retailers").where("phone", "==", phone).limit(1).get(),
    db().collection("retailers").where("phone", "==", digits).limit(1).get(),
  ]);
  const legacy = byE164.docs[0] ?? byDigits.docs[0];
  return legacy ? !!legacy.data()?.onlineDelivery : false;
}

/** Per-run cache: one product can list hundreds of the same stores. */
export function accountOnlineCache(): (phone: string) => Promise<boolean> {
  const seen = new Map<string, Promise<boolean>>();
  return (phone) => {
    const p = e164(phone);
    if (!p) return Promise.resolve(false);
    if (!seen.has(p)) seen.set(p, accountOnline(p).catch(() => false));
    return seen.get(p)!;
  };
}

/** A copy sells online only when it says so explicitly and is active. */
export function copyOnline(d: Record<string, unknown>): boolean {
  if (d.isActive === false) return false;
  return typeof d.isOnline === "boolean" ? d.isOnline : d.sellMode === "online_delivery";
}

/** Whether a product is sold online at all (the owner's listing). */
function productOnline(d: Record<string, unknown>): boolean {
  return d.isActive !== false && d.sellMode !== "offline_store_only" && d.isOnline !== false;
}

/**
 * Recomputes isOnline on every availability entry of one canonical product, and
 * its ownerOnline. Pure decision + one transaction; returns how many entries
 * changed. `dryRun` reports without writing.
 */
export async function reconcileProduct(
  rootId: string,
  isAccountOnline: (phone: string) => Promise<boolean>,
  dryRun = false,
): Promise<{ changed: number; toOff: number; toOn: number; ownerOnline: boolean | null }> {
  const rootRef = db().collection("products").doc(rootId);
  const root = (await rootRef.get()).data();
  if (!root) return { changed: 0, toOff: 0, toOn: 0, ownerOnline: null };

  // The store's own copies of this product, newest active one wins.
  const [byMfr, byOrig] = await Promise.all([
    db().collection("products").where("manufacturerProductId", "==", rootId).get(),
    db().collection("products").where("originalProductId", "==", rootId).get(),
  ]);
  const copyByStore = new Map<string, Record<string, unknown>>();
  for (const doc of [...byMfr.docs, ...byOrig.docs]) {
    if (doc.id === rootId) continue;
    const c = doc.data();
    const key = k10(c.retailerPhone ?? c.ownerPhone ?? c.retailerDocId);
    if (!key) continue;
    const prev = copyByStore.get(key);
    // An active copy beats an inactive one: a store re-assigned after removal
    // has both, and only the live one says what it sells.
    if (!prev || (prev.isActive === false && c.isActive !== false) || (copyOnline(c) && !copyOnline(prev))) {
      copyByStore.set(key, c);
    }
  }

  const av = Array.isArray(root.availability) ? (root.availability as Record<string, unknown>[]) : [];
  const decided = await Promise.all(av.map(async (entry) => {
    const key = k10(entry.storePhone ?? entry.storeId);
    const copy = key ? copyByStore.get(key) : undefined;
    // No copy found (an availability-only listing): keep its own flag, but it
    // still needs the account switch, as checkout does.
    const listed = copy ? copyOnline(copy) : entry.isOnline === true;
    const online = listed && key.length === 10 && (await isAccountOnline(`+91${key}`));
    return online;
  }));
  let toOff = 0;
  let toOn = 0;
  const next = av.map((entry, i) => {
    const want = decided[i]!;
    if ((entry.isOnline === true) === want && typeof entry.isOnline === "boolean") return entry;
    if (want) toOn++; else toOff++;
    return { ...entry, isOnline: want };
  });

  const ownerPhone = e164(root.ownerPhone ?? root.manufacturerPhone ?? root.retailerPhone);
  const ownerOnline = ownerPhone ? productOnline(root) && (await isAccountOnline(ownerPhone)) : null;
  const ownerChanged = ownerOnline !== null && root.ownerOnline !== ownerOnline;

  if (!dryRun && (toOff + toOn > 0 || ownerChanged)) {
    await db().runTransaction(async (tx) => {
      const fresh = (await tx.get(rootRef)).data();
      if (!fresh) return;
      // Only rewrite if the list is still the one we decided on.
      const same = JSON.stringify((fresh.availability ?? []).map((e: Record<string, unknown>) => [e.storePhone, e.storeId]))
        === JSON.stringify(av.map((e) => [e.storePhone, e.storeId]));
      const patch: Record<string, unknown> = {};
      if (toOff + toOn > 0 && same) {
        patch.availability = (fresh.availability as Record<string, unknown>[]).map((e, i) =>
          e.isOnline === next[i]!.isOnline ? e : { ...e, isOnline: next[i]!.isOnline });
      }
      if (ownerChanged) patch.ownerOnline = ownerOnline;
      if (Object.keys(patch).length) tx.update(rootRef, patch);
    });
  }
  return { changed: toOff + toOn, toOff, toOn, ownerOnline };
}

/** Every canonical product that lists this seller, or that this seller owns. */
async function productsTouching(phone: string): Promise<string[]> {
  const variants = [phone, k10(phone)];
  const ids = new Set<string>();
  const copies = await Promise.all(
    ["retailerPhone", "ownerPhone"].map((f) => db().collection("products").where(f, "in", variants).get()),
  );
  for (const snap of copies) {
    for (const d of snap.docs) {
      const root = String(d.get("manufacturerProductId") ?? d.get("originalProductId") ?? "");
      ids.add(root && root !== d.id ? root : d.id); // a canonical it owns counts too
    }
  }
  const mfr = await db().collection("products").where("manufacturerPhone", "==", phone).get();
  for (const d of mfr.docs) {
    if (!d.get("manufacturerProductId") && !d.get("originalProductId")) ids.add(d.id);
  }
  return [...ids];
}

/**
 * A seller flipping Online Delivery. The switch lives on up to four docs
 * (profiles, users, retailers|manufacturers) and checkout reads them in a fixed
 * order, so a write to one left the others disagreeing — one seller had it ON
 * in users and OFF in profiles, and checkout went by profiles. The newest write
 * is copied to the others that exist, then this seller's listings are redone.
 */
async function onSwitchWritten(collection: string, id: string, before: unknown, after: unknown) {
  if (typeof after !== "boolean" || before === after) return;
  const phone = e164(id);
  if (!phone || !PHONE_RE.test(phone)) return;
  for (const col of ["profiles", "users", "retailers", "manufacturers"]) {
    if (col === collection) continue;
    const ref = db().collection(col).doc(phone);
    const snap = await ref.get();
    if (snap.exists && snap.get("onlineDelivery") !== after) {
      await ref.update({ onlineDelivery: after });
    }
  }
  const cache = accountOnlineCache();
  const roots = await productsTouching(phone);
  let changed = 0;
  for (const root of roots) changed += (await reconcileProduct(root, cache)).changed;
  logger.info("[online-eligibility] switch changed", { seller: phone.slice(-4), to: after, products: roots.length, changed });
}

const REGION = "asia-south1";
const watch = (collection: string) =>
  onDocumentWritten({ region: REGION, document: `${collection}/{id}` }, async (event) => {
    const before = event.data?.before?.data()?.onlineDelivery;
    const after = event.data?.after?.data()?.onlineDelivery;
    await onSwitchWritten(collection, event.params.id, before, after);
  });

export const syncOnlineDeliverySwitchOnUser = watch("users");
export const syncOnlineDeliverySwitchOnProfile = watch("profiles");
export const syncOnlineDeliverySwitchOnRetailer = watch("retailers");
export const syncOnlineDeliverySwitchOnManufacturer = watch("manufacturers");

/** Every canonical product with stores, re-decided. Safe to run any time. */
export async function reconcileAllOnlineAvailability(opts: { dryRun?: boolean } = {}) {
  const cache = accountOnlineCache();
  const snap = await db().collection("products").select("availability", "manufacturerProductId", "originalProductId", "ownerPhone", "manufacturerPhone").get();
  const roots = snap.docs.filter((d) =>
    !d.get("manufacturerProductId") && !d.get("originalProductId") &&
    ((Array.isArray(d.get("availability")) && d.get("availability").length > 0) || d.get("ownerPhone") || d.get("manufacturerPhone")));
  let products = 0, toOff = 0, toOn = 0;
  const top: Array<[string, number]> = [];
  for (const d of roots) {
    const r = await reconcileProduct(d.id, cache, opts.dryRun);
    if (r.changed) { products++; toOff += r.toOff; toOn += r.toOn; top.push([d.id, r.changed]); }
  }
  top.sort((a, b) => b[1] - a[1]);
  return { checked: roots.length, products, toOff, toOn, top: top.slice(0, 15) };
}

export const reconcileOnlineAvailability = onSchedule(
  { region: REGION, schedule: "every day 04:30", timeZone: "Asia/Kolkata", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const r = await reconcileAllOnlineAvailability();
    logger.info("[online-eligibility] daily reconcile", r);
  },
);
