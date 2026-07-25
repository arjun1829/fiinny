import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";

/**
 * POST /api/account/delete
 *
 * Self-service "delete my account" for consumer/retailer/manufacturer users
 * on web, iOS, and Android — the single backend all three clients call.
 *
 * Auth: the caller's own Firebase ID token (Authorization: Bearer <token>).
 * There is no separate "target user" — verifyIdToken's uid IS the account
 * being deleted, so there is no way for one user to delete another's data.
 *
 * Cleanup mirrors adminDeleteUser() in app/firebase.ts (used by the admin
 * panel) but runs with the Admin SDK so it isn't blocked by Firestore rules,
 * and is extended to cover collections that function doesn't touch yet
 * (reels/likes/follows/comments, reviews, notifications, listings, stores,
 * usernames). Firebase Auth deletion happens last, only after the Firestore
 * cleanup has completed, so a mid-way failure never leaves an orphaned Auth
 * account with no way back into the app to retry.
 *
 * Deliberately retained (not deleted): `orders` and `payments` (financial /
 * tax audit trail — same call already made for `products`, which are
 * deactivated rather than removed), and `contactMessages`/`waNotifications`
 * (support + delivery audit logs). `products` themselves are deactivated,
 * not deleted, exactly as adminDeleteUser() already does — this preserves
 * order history for buyers who purchased from this seller.
 */

type Db = FirebaseFirestore.Firestore;
type DocRef = FirebaseFirestore.DocumentReference;

const BATCH_CHUNK = 400;

async function deleteRefs(db: Db, refs: DocRef[]): Promise<number> {
  const unique = new Map<string, DocRef>();
  for (const r of refs) unique.set(r.path, r);
  const list = Array.from(unique.values());
  for (let i = 0; i < list.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    list.slice(i, i + BATCH_CHUNK).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  return list.length;
}

async function refsWhere(
  db: Db,
  collection: string,
  field: string,
  value: string | null | undefined,
): Promise<DocRef[]> {
  if (!value) return [];
  const snap = await db.collection(collection).where(field, "==", value).get();
  return snap.docs.map((d) => d.ref);
}

async function refsWhereArrayContains(
  db: Db,
  collection: string,
  field: string,
  value: string | null | undefined,
): Promise<DocRef[]> {
  if (!value) return [];
  const snap = await db.collection(collection).where(field, "array-contains", value).get();
  return snap.docs.map((d) => d.ref);
}

async function deleteSubcollection(db: Db, path: string): Promise<number> {
  const snap = await db.collection(path).get().catch(() => null);
  if (!snap) return 0;
  return deleteRefs(db, snap.docs.map((d) => d.ref));
}

async function deleteAllUserData(db: Db, phone: string | null, uid: string) {
  const now = new Date();
  const result = {
    productsDeactivated: 0,
    listingsDeleted: 0,
    inventoryDeleted: 0,
    seatListingsDeleted: 0,
    subscriptionsDeleted: 0,
    networkRelationshipsDeleted: 0,
    reelsDeleted: 0,
    reelReactionsDeleted: 0,
    reviewsDeleted: 0,
    notificationsDeleted: 0,
    miscDeleted: 0,
  };

  // ── 1. Deactivate products (preserves order history) ──────────────────────
  // Every seller-identity field per CLAUDE.md's dual-field-write contract:
  // ownerPhone/ownerId (legacy uid-keyed), retailerPhone/retailerId (current).
  const productSnaps = await Promise.all([
    phone ? db.collection("products").where("ownerPhone", "==", phone).get() : null,
    uid ? db.collection("products").where("ownerId", "==", uid).get() : null,
    phone ? db.collection("products").where("retailerPhone", "==", phone).get() : null,
    uid ? db.collection("products").where("retailerId", "==", uid).get() : null,
  ]);
  const seenProductIds = new Set<string>();
  let productBatch = db.batch();
  let productBatchSize = 0;
  for (const snap of productSnaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (seenProductIds.has(d.id)) continue;
      seenProductIds.add(d.id);
      if (d.data().isActive === false) continue;
      productBatch.update(d.ref, { isActive: false, updatedAt: now });
      result.productsDeactivated++;
      productBatchSize++;
      if (productBatchSize >= BATCH_CHUNK) {
        await productBatch.commit();
        productBatch = db.batch();
        productBatchSize = 0;
      }
    }
  }
  if (productBatchSize > 0) await productBatch.commit();

  // ── 2. Legacy `listings` collection (CLAUDE.md: superseded by `products`,
  // kept around only as a legacy reference — safe to hard-delete) ───────────
  const listingRefs = [
    ...(await refsWhere(db, "listings", "sellerPhone", phone)),
    ...(await refsWhere(db, "listings", "retailerPhone", phone)),
    ...(await refsWhere(db, "listings", "manufacturerPhone", phone)),
  ];
  result.listingsDeleted = await deleteRefs(db, listingRefs);

  // ── 3. Inventory ────────────────────────────────────────────────────────
  const inventoryRefs = [
    ...(await refsWhere(db, "inventory", "ownerPhone", phone)),
    ...(await refsWhere(db, "inventory", "ownerId", uid)),
  ];
  result.inventoryDeleted = await deleteRefs(db, inventoryRefs);

  // ── 4. Seat listings (any status) ──────────────────────────────────────
  const seatRefs = [
    ...(await refsWhere(db, "retailerSeatListings", "ownerPhone", phone)),
    ...(await refsWhere(db, "retailerSeatListings", "retailerPhone", phone)),
    ...(await refsWhere(db, "retailerSeatListings", "ownerId", uid)),
  ];
  result.seatListingsDeleted = await deleteRefs(db, seatRefs);

  // ── 5. Subscriptions (any status) ──────────────────────────────────────
  const subRefs = [
    ...(await refsWhere(db, "subscriptions", "ownerPhone", phone)),
    ...(await refsWhere(db, "subscriptions", "ownerId", uid)),
  ];
  result.subscriptionsDeleted = await deleteRefs(db, subRefs);

  // ── 6. Manufacturer↔retailer network relationships ─────────────────────
  const mrRefs = [
    ...(await refsWhere(db, "manufacturerRetailers", "manufacturerPhone", phone)),
    ...(await refsWhere(db, "manufacturerRetailers", "retailerDocId", phone)),
    ...(await refsWhere(db, "manufacturerRetailers", "retailerPhone", phone)),
    ...(await refsWhere(db, "manufacturerRetailers", "manufacturerId", uid)),
  ];
  result.networkRelationshipsDeleted = await deleteRefs(db, mrRefs);

  // ── 7. Reels: own reels (+ their comments/likes subcollections & refs),
  // plus this user's likes/follows/comment-authorship elsewhere ─────────────
  const ownReelsSnap = uid
    ? await db.collection("reels").where("shopOwnerId", "==", uid).get()
    : null;
  const ownReelRefs = ownReelsSnap ? ownReelsSnap.docs.map((d) => d.ref) : [];
  for (const reelRef of ownReelRefs) {
    await deleteSubcollection(db, `${reelRef.path}/reel_comments`);
    const likesForReel = await refsWhere(db, "reel_likes", "reelId", reelRef.id);
    await deleteRefs(db, likesForReel);
  }
  result.reelsDeleted = await deleteRefs(db, ownReelRefs);

  const reactionRefs = [
    ...(await refsWhere(db, "reel_likes", "userId", uid)),
    ...(await refsWhere(db, "follows", "followerId", uid)),
    ...(await refsWhere(db, "follows", "followedShopId", uid)),
  ];
  result.reelReactionsDeleted = await deleteRefs(db, reactionRefs);

  // ── 8. Reviews the user wrote, and reviews of their (now-gone) store ──────
  const reviewRefs = [
    ...(await refsWhere(db, "productReviews", "reviewerPhone", phone)),
    ...(await refsWhere(db, "storeReviews", "reviewerPhone", phone)),
    ...(await refsWhere(db, "storeReviews", "storePhone", phone)),
  ];
  result.reviewsDeleted = await deleteRefs(db, reviewRefs);

  // ── 9. Notifications addressed to this user ────────────────────────────
  const notifRefs = await refsWhereArrayContains(db, "notifications", "recipientPhones", phone);
  result.notificationsDeleted = await deleteRefs(db, notifRefs);

  // ── 10. Username reservation, profile pages, settings, carts, contacts ──
  const miscSingleDocDeletes: Promise<unknown>[] = [];
  if (phone) {
    miscSingleDocDeletes.push(
      db.collection("brandPages").doc(phone).delete().catch(() => {}),
      db.collection("companyPages").doc(phone).delete().catch(() => {}),
      db.collection("deliverySettings").doc(phone).delete().catch(() => {}),
      db.collection("carts").doc(phone).delete().catch(() => {}),
      db.collection("stores").doc(phone).delete().catch(() => {}),
    );
  }
  if (uid) {
    miscSingleDocDeletes.push(
      db.collection("brandPages").doc(uid).delete().catch(() => {}),
      db.collection("companyPages").doc(uid).delete().catch(() => {}),
    );
  }
  await Promise.all(miscSingleDocDeletes);

  const [bpSnap, cpSnap, mcSnap, usernameSnap] = await Promise.all([
    phone ? db.collection("brandPages").where("ownerPhone", "==", phone).get().catch(() => null) : null,
    phone ? db.collection("companyPages").where("ownerPhone", "==", phone).get().catch(() => null) : null,
    uid ? db.collection("manufacturer_contacts").where("manufacturerId", "==", uid).get().catch(() => null) : null,
    phone ? db.collection("usernames").where("phone", "==", phone).get().catch(() => null) : null,
  ]);
  const miscRefs: DocRef[] = [];
  for (const snap of [bpSnap, cpSnap, mcSnap, usernameSnap]) {
    if (!snap) continue;
    for (const d of snap.docs) miscRefs.push(d.ref);
  }
  result.miscDeleted = await deleteRefs(db, miscRefs);

  // ── 11. Subcollection mirrors ────────────────────────────────────────────
  const subcollectionPaths: string[] = [];
  if (phone) {
    subcollectionPaths.push(
      `manufacturers/${phone}/retailers`,
      `manufacturers/${phone}/products`,
      `manufacturers/${phone}/inventory`,
      `retailers/${phone}/products`,
      `retailers/${phone}/inventory`,
    );
  }
  if (uid) {
    subcollectionPaths.push(
      `manufacturers/${uid}/retailers`,
      `manufacturers/${uid}/products`,
      `manufacturers/${uid}/inventory`,
      `retailers/${uid}/products`,
      `retailers/${uid}/inventory`,
    );
  }
  for (const p of subcollectionPaths) {
    result.miscDeleted += await deleteSubcollection(db, p);
  }

  // ── 12. Root identity documents ──────────────────────────────────────────
  const rootDeletes: Promise<unknown>[] = [];
  if (phone) {
    rootDeletes.push(
      db.collection("users").doc(phone).delete().catch(() => {}),
      db.collection("profiles").doc(phone).delete().catch(() => {}),
      db.collection("retailers").doc(phone).delete().catch(() => {}),
      db.collection("manufacturers").doc(phone).delete().catch(() => {}),
    );
  }
  if (uid) {
    rootDeletes.push(
      db.collection("uidIndex").doc(uid).delete().catch(() => {}),
      db.collection("users").doc(uid).delete().catch(() => {}),
      db.collection("retailers").doc(uid).delete().catch(() => {}),
      db.collection("manufacturers").doc(uid).delete().catch(() => {}),
    );
  }
  await Promise.all(rootDeletes);

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired session — please log in again." }, { status: 401 });
    }

    const uid = decoded.uid;

    // Resolve the canonical phone for this account (dual-keyed schema:
    // users/{phone} new, users/{uid} legacy, per CLAUDE.md).
    const [uidIndexDoc, legacyUserDoc] = await Promise.all([
      adminDb.collection("uidIndex").doc(uid).get(),
      adminDb.collection("users").doc(uid).get(),
    ]);
    const phone: string | null =
      uidIndexDoc.data()?.phone ?? legacyUserDoc.data()?.phone ?? decoded.phone_number ?? null;

    const result = await deleteAllUserData(adminDb, phone, uid);

    // Delete the Auth account last — only after Firestore cleanup succeeds,
    // so a failure above never leaves the account inaccessible with orphaned
    // data still on the platform.
    try {
      await adminAuth.deleteUser(uid);
    } catch (e: unknown) {
      const code = (e as { code?: string } | null)?.code;
      if (code !== "auth/user-not-found") throw e;
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    console.error("[account/delete]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete account." },
      { status: 500 },
    );
  }
}
