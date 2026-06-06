import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { syncRetailerMirror, activateRetailerOnProductAssignment } from "./manufacturer-retailers-firestore";
import type { RetailerSeatListing } from "../_types/subscriptions";
import {
  addSeatListingToBatch,
  canAssignSeat,
  fetchSeatListingsForOwner,
  fetchSubscriptions,
  getSubscriptionExpiryDate,
  getAvailableSeats,
} from "./subscriptions-firestore";

const SEAT_LISTINGS = "retailerSeatListings";

export type AssignProductInput = {
  manufacturerId: string;
  retailerDocId: string;   // stable pre-signup identifier, always available
  retailerId?: string;     // Firebase Auth uid — empty until retailer signs up
  productId: string;       // manufacturer's product doc id
};

export type AssignProductResult = {
  seatListingId: string;
  retailerProductId: string;
};

/**
 * Assigns a manufacturer product to a retailer. Atomically:
 * 1. Validates the manufacturer has an available seat.
 * 2. Creates a product copy in `products` (retailer manages stock later).
 * 3. Creates an `inventory` record with zero initial stock.
 * 4. Creates a `retailerSeatListings` entry (listingType: "assigned") — consumes the seat.
 *
 * Does NOT require the retailer to have signed up (retailerId is optional).
 */
export async function assignProductToRetailer(
  input: AssignProductInput,
): Promise<AssignProductResult> {
  // Validate seat availability against the manufacturer's subscription
  const [subs, listings] = await Promise.all([
    fetchSubscriptions(input.manufacturerId),
    fetchSeatListingsForOwner(input.manufacturerId),
  ]);
  if (!canAssignSeat(subs, listings)) {
    throw new Error("No seats available. Purchase more seats to assign additional products.");
  }
  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  // Resolve phones for dual-field writes
  let manufacturerPhone: string | null = null;
  let retailerPhone: string | null = null;
  try {
    const [mIdxSnap, rIdxSnap] = await Promise.all([
      getDoc(doc(db, "uidIndex", input.manufacturerId)),
      input.retailerId ? getDoc(doc(db, "uidIndex", input.retailerId)) : Promise.resolve(null),
    ]);
    if (mIdxSnap.exists()) manufacturerPhone = String(mIdxSnap.data().phone ?? "") || null;
    if (rIdxSnap?.exists()) retailerPhone = String(rIdxSnap.data().phone ?? "") || null;
  } catch { /* ignore — phones are optional enrichment */ }

  // Fetch the manufacturer product and retailer profile in parallel
  const [productSnap, retailerSnap] = await Promise.all([
    getDoc(doc(db, "products", input.productId)),
    getDoc(doc(db, "retailers", input.retailerDocId)),
  ]);
  if (!productSnap.exists()) throw new Error("Product not found.");
  const src = productSnap.data() as Record<string, unknown>;
  const retailerData = retailerSnap.exists() ? (retailerSnap.data() as Record<string, unknown>) : null;
  const retailerStoreName = retailerData
    ? String(retailerData.shopName ?? retailerData.businessName ?? retailerData.ownerName ?? "")
    : "";
  if (!retailerPhone && retailerData?.phone) {
    retailerPhone = String(retailerData.phone);
  }

  // Guard against duplicate active assignment (keyed on retailerDocId — works pre-signup)
  const dupQ = query(
    collection(db, SEAT_LISTINGS),
    where("ownerId", "==", input.manufacturerId),
    where("retailerDocId", "==", input.retailerDocId),
    where("productId", "==", input.productId),
    where("status", "==", "active"),
  );
  if (!(await getDocs(dupQ)).empty) {
    throw new Error("This product is already assigned to this retailer.");
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);

  // 1. Product copy — retailer is the owner; manufacturer is the source reference
  const retailerProductRef = doc(collection(db, "products"));
  const retailerOwnerId = input.retailerId || input.retailerDocId;
  batch.set(retailerProductRef, {
    id: retailerProductRef.id,
    name: String(src.name ?? ""),
    category: String(src.category ?? ""),
    description: String(src.description ?? ""),
    image: String(src.image ?? ""),
    unit: String(src.unit ?? ""),
    price: typeof src.price === "number" ? src.price : 0,
    isActive: true,
    ownerId: retailerOwnerId,
    ownerPhone: retailerPhone ?? null,
    ownerType: "retailer",
    createdBy: input.manufacturerId,
    manufacturerId: input.manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    manufacturerProductId: input.productId,
    retailerDocId: input.retailerDocId,
    retailerId: input.retailerId ?? "",
    retailerPhone: retailerPhone ?? null,
    source: "manufacturer_assigned",

    // Market display fields
    store: retailerStoreName,
    stock: "In Stock",
    distance: "Nearby",
    sellMode: src.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only",
    isOnline: src.isOnline === true || src.sellMode === "online_delivery",

    createdAt: now,
    updatedAt: now,
  });

  // 2. Inventory record — retailer manages stock; linked by retailerDocId pre-signup
  const inventoryRef = doc(collection(db, "inventory"));
  batch.set(inventoryRef, {
    id: inventoryRef.id,
    ownerId: retailerOwnerId,
    ownerPhone: retailerPhone ?? null,
    ownerType: "retailer",
    manufacturerId: input.manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    retailerDocId: input.retailerDocId,
    retailerId: input.retailerId ?? "",
    retailerPhone: retailerPhone ?? null,
    productId: retailerProductRef.id,
    manufacturerProductId: input.productId,
    assignedByManufacturer: true,
    stockQuantity: 0,
    sellingPrice: typeof src.price === "number" ? src.price : 0,
    reorderThreshold: 5,
    isAvailable: false,
    updatedAt: now,
  });

  // 3. Seat listing — expires when subscription expires
  const seatListingId = addSeatListingToBatch(batch, {
    ownerId: input.manufacturerId,
    ownerPhone: manufacturerPhone ?? null,
    ownerType: "manufacturer",
    manufacturerId: input.manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    retailerDocId: input.retailerDocId,
    retailerId: input.retailerId ?? null,
    retailerPhone: retailerPhone ?? null,
    productId: retailerProductRef.id,
    manufacturerProductId: input.productId,
    listingType: "assigned",
    expiresAt: subExpiry,
  });

  // 4. Keep the invited retailer doc as the stable store identity in market availability.
  //    That doc exists before signup and remains the canonical public store record after claim.
  const availabilityStoreId = input.retailerDocId;
  batch.update(doc(db, "products", input.productId), {
    availability: arrayUnion({
      storeId: availabilityStoreId,
      storePhone: retailerPhone ?? null,
      storeName: retailerStoreName || null,
      stockLevel: "In Stock",
    }),
  });

  await batch.commit();

  // Phase 4B: Subcollection mirrors (fire-and-forget, non-critical)
  (async () => {
    try {
      if (retailerPhone) {
        setDoc(
          doc(db, `retailers/${retailerPhone}/products/${retailerProductRef.id}`),
          { retailerId: input.retailerId ?? input.retailerDocId, retailerPhone, manufacturerId: input.manufacturerId, manufacturerPhone, assignedAt: serverTimestamp() },
          { merge: true },
        ).catch(() => {});

        setDoc(
          doc(db, `retailers/${retailerPhone}/inventory/${inventoryRef.id}`),
          {
            id: inventoryRef.id,
            productId: retailerProductRef.id,
            stockQuantity: 0,
            sellingPrice: typeof src.price === "number" ? src.price : 0,
            reorderThreshold: 5,
            isAvailable: false,
            updatedAt: serverTimestamp(),
            assignedByManufacturer: true
          },
          { merge: true }
        ).catch(() => {});
      }
    } catch { /* non-critical */ }

    // Always attempt to repair/confirm the manufacturer→retailer mirror,
    // independent of whether the retailer subcollection batch above succeeded.
    if (manufacturerPhone && retailerPhone) {
      await syncRetailerMirror(manufacturerPhone, retailerPhone, {
        retailerDocId: input.retailerDocId,
        retailerPhone,
        manufacturerPhone,
        shopName: retailerStoreName,
      });
    }

    // Flip onboardingStatus → "active" on the invite link doc now that a product is assigned.
    await activateRetailerOnProductAssignment(
      input.manufacturerId,
      input.retailerDocId,
      manufacturerPhone,
      retailerPhone,
    );
  })();

  return { seatListingId, retailerProductId: retailerProductRef.id };
}

/**
 * Releases a product assignment.
 * Sets the seat listing to "released" and deactivates the retailer's product copy (if it
 * still exists — the retailer may have already deleted it, in which case we skip that step
 * so the batch doesn't fail with a NOT_FOUND error and leave the seat unreleased).
 */
export async function removeProductAssignment(seatListingId: string): Promise<void> {
  const listingSnap = await getDoc(doc(db, SEAT_LISTINGS, seatListingId));
  if (!listingSnap.exists()) throw new Error("Seat listing not found.");
  const data = listingSnap.data() as Record<string, unknown>;

  const now = serverTimestamp();
  const batch = writeBatch(db);
  // Release the seat — this MUST succeed regardless of product copy state.
  batch.update(doc(db, SEAT_LISTINGS, seatListingId), { status: "released", releasedAt: now });

  const retailerProductId = String(data.productId ?? "");
  const retailerDocId     = String(data.retailerDocId ?? "");

  // Deactivate the retailer's product copy only if it still exists.
  // If the retailer already removed it via their inventory, the doc is gone and
  // batch.update would throw NOT_FOUND, aborting the entire batch and leaving
  // the seat permanently locked.
  if (retailerProductId) {
    try {
      const copySnap = await getDoc(doc(db, "products", retailerProductId));
      if (copySnap.exists()) {
        batch.update(doc(db, "products", retailerProductId), { isActive: false, updatedAt: now });
      }
      // Also deactivate the inventory record for the copy when present.
      const invSnap = await getDocs(
        query(collection(db, "inventory"), where("productId", "==", retailerProductId))
      );
      invSnap.docs.forEach((d) => {
        batch.update(d.ref, { isAvailable: false, updatedAt: now });
      });
    } catch { /* product already gone — seat release still proceeds */ }
  }

  await batch.commit();

  // Remove the retailer's public store from the manufacturer product's availability array.
  // retailerDocId is the stable public store document used in availability[].
  const availabilityStoreId = retailerDocId;
  if (retailerProductId && availabilityStoreId) {
    try {
      const copySnap = await getDoc(doc(db, "products", retailerProductId));
      const mfgProductId = copySnap.exists() ? String(copySnap.data()?.manufacturerProductId ?? "") : "";
      if (mfgProductId) {
        const mfgSnap = await getDoc(doc(db, "products", mfgProductId));
        if (mfgSnap.exists()) {
          const mfgData = mfgSnap.data() as Record<string, unknown>;
          const avArr = Array.isArray(mfgData.availability) ? mfgData.availability : [];
          // Find the exact entry to remove (may be old shape without storePhone/storeName)
          const entryToRemove = avArr.find((e: Record<string, unknown>) => e.storeId === availabilityStoreId);
          if (entryToRemove) {
            await updateDoc(doc(db, "products", mfgProductId), {
              availability: arrayRemove(entryToRemove),
            });
          }
        }
      }
    } catch { /* non-critical — product may already be deleted */ }
  }
}

/** All assignments made by a manufacturer (all statuses). */
export async function fetchAssignmentsForManufacturer(
  manufacturerId: string,
): Promise<RetailerSeatListing[]> {
  return fetchSeatListingsForOwner(manufacturerId);
}

export type BulkAssignInput = {
  manufacturerId: string;
  retailerDocId: string;
  retailerId?: string;
  /** Array of manufacturer product IDs to assign. Already-assigned ones are skipped. */
  productIds: string[];
};

export type BulkAssignResult = {
  assigned: string[];   // product IDs successfully assigned
  skipped: string[];    // product IDs skipped (already assigned)
  failed: string[];     // product IDs that errored
};

/**
 * Assigns multiple manufacturer products to a retailer in a single batch.
 * Validates that enough seats are available for all new assignments before writing.
 * Already-assigned products (active listing exists) are silently skipped.
 */
export async function bulkAssignProductsToRetailer(
  input: BulkAssignInput,
): Promise<BulkAssignResult> {
  const { manufacturerId, retailerDocId, retailerId, productIds } = input;

  const [subs, existingListings] = await Promise.all([
    fetchSubscriptions(manufacturerId),
    fetchSeatListingsForOwner(manufacturerId),
  ]);

  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  // Determine which products are already actively assigned to this retailer
  const alreadyAssigned = new Set(
    existingListings
      .filter(
        (l) =>
          l.retailerDocId === retailerDocId &&
          l.status === "active" &&
          l.manufacturerProductId,
      )
      .map((l) => l.manufacturerProductId!),
  );

  const toAssign = productIds.filter((id) => !alreadyAssigned.has(id));
  const skipped = productIds.filter((id) => alreadyAssigned.has(id));

  if (toAssign.length === 0) {
    return { assigned: [], skipped, failed: [] };
  }

  const available = getAvailableSeats(subs, existingListings);
  if (available < toAssign.length) {
    throw new Error(
      `Not enough seats. Need ${toAssign.length} but only ${available} available.`,
    );
  }

  // Fetch all product docs and retailer profile in parallel
  const [productSnaps, retailerSnap] = await Promise.all([
    Promise.all(toAssign.map((id) => getDoc(doc(db, "products", id)))),
    getDoc(doc(db, "retailers", retailerDocId)),
  ]);
  const retailerData = retailerSnap.exists() ? (retailerSnap.data() as Record<string, unknown>) : null;
  const retailerStoreName = retailerData
    ? String(retailerData.shopName ?? retailerData.businessName ?? retailerData.ownerName ?? "")
    : "";

  // Resolve phones for dual-field writes and subcollection mirrors
  let manufacturerPhone: string | null = null;
  let retailerPhone: string | null = null;
  try {
    const [mIdxSnap, rIdxSnap] = await Promise.all([
      getDoc(doc(db, "uidIndex", manufacturerId)),
      retailerId ? getDoc(doc(db, "uidIndex", retailerId)) : Promise.resolve(null),
    ]);
    if (mIdxSnap.exists()) manufacturerPhone = String(mIdxSnap.data().phone ?? "") || null;
    if (rIdxSnap?.exists()) retailerPhone = String(rIdxSnap.data().phone ?? "") || null;
    // Fallback: phone may already be on the retailer doc
    if (!retailerPhone && retailerData?.phone) {
      retailerPhone = String(retailerData.phone);
    }
  } catch { /* phones are optional enrichment */ }

  const now = serverTimestamp();
  const batch = writeBatch(db);
  const assigned: string[] = [];
  const failed: string[] = [];
  const assignedDetails: { manufacturerProductId: string; retailerProductId: string; inventoryId: string; sellingPrice: number }[] = [];

  for (let i = 0; i < toAssign.length; i++) {
    const productId = toAssign[i];
    const snap = productSnaps[i];
    if (!snap.exists()) {
      failed.push(productId);
      continue;
    }
    const src = snap.data() as Record<string, unknown>;
    const retailerOwnerId = retailerId || retailerDocId;

    // 1. Product copy
    const retailerProductRef = doc(collection(db, "products"));
    batch.set(retailerProductRef, {
      id: retailerProductRef.id,
      name: String(src.name ?? ""),
      category: String(src.category ?? ""),
      description: String(src.description ?? ""),
      image: String(src.image ?? ""),
      unit: String(src.unit ?? ""),
      price: typeof src.price === "number" ? src.price : 0,
      isActive: true,
      ownerId: retailerOwnerId,
      ownerPhone: retailerPhone ?? null,
      ownerType: "retailer",
      createdBy: manufacturerId,
      manufacturerId,
      manufacturerPhone: manufacturerPhone ?? null,
      manufacturerProductId: productId,
      retailerDocId,
      retailerId: retailerId ?? "",
      retailerPhone: retailerPhone ?? null,
      source: "manufacturer_assigned",

      // Market display fields
      store: retailerStoreName,
      stock: "In Stock",
      distance: "Nearby",
      sellMode: src.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only",
      isOnline: src.isOnline === true || src.sellMode === "online_delivery",

      createdAt: now,
      updatedAt: now,
    });

    // 2. Inventory record
    const inventoryRef = doc(collection(db, "inventory"));
    batch.set(inventoryRef, {
      id: inventoryRef.id,
      ownerId: retailerOwnerId,
      ownerPhone: retailerPhone ?? null,
      ownerType: "retailer",
      manufacturerId,
      manufacturerPhone: manufacturerPhone ?? null,
      retailerDocId,
      retailerId: retailerId ?? "",
      retailerPhone: retailerPhone ?? null,
      productId: retailerProductRef.id,
      manufacturerProductId: productId,
      assignedByManufacturer: true,
      stockQuantity: 0,
      sellingPrice: typeof src.price === "number" ? src.price : 0,
      reorderThreshold: 5,
      isAvailable: false,
      updatedAt: now,
    });

    // 3. Seat listing
    addSeatListingToBatch(batch, {
      ownerId: manufacturerId,
      ownerPhone: manufacturerPhone ?? null,
      ownerType: "manufacturer",
      manufacturerId,
      manufacturerPhone: manufacturerPhone ?? null,
      retailerDocId,
      retailerId: retailerId ?? null,
      retailerPhone: retailerPhone ?? null,
      productId: retailerProductRef.id,
      manufacturerProductId: productId,
      listingType: "assigned",
      expiresAt: subExpiry,
    });

    // 4. Add the canonical invited retailer doc to the manufacturer product's availability array.
    const availabilityStoreId = retailerDocId;
    batch.update(doc(db, "products", productId), {
      availability: arrayUnion({
        storeId: availabilityStoreId,
        storePhone: retailerPhone ?? null,
        storeName: retailerStoreName || null,
        stockLevel: "In Stock",
      }),
    });

    assigned.push(productId);
    assignedDetails.push({
      manufacturerProductId: productId,
      retailerProductId: retailerProductRef.id,
      inventoryId: inventoryRef.id,
      sellingPrice: typeof src.price === "number" ? src.price : 0,
    });
  }

  await batch.commit();

  // ── Phase 4B: Subcollection mirrors (fire-and-forget) ─────────────────────
  // Write lightweight summary docs under phone-keyed subcollections for future
  // dashboard grouping and analytics. Failures are non-critical.
  if (assigned.length > 0) {
    (async () => {
      try {
        const { writeBatch: wb, doc: wDoc, collection: wCol, serverTimestamp: wTs } = await import("firebase/firestore");
        const { db: wDb } = await import("../../firebase");
        const mirrorBatch = wb(wDb);
        const mirrorNow = wTs();

        for (const item of assignedDetails) {
          // retailers/{retailerPhone}/products/{retailerProductId}
          if (retailerPhone) {
            mirrorBatch.set(
              wDoc(wDb, `retailers/${retailerPhone}/products/${item.retailerProductId}`),
              { retailerId: retailerId ?? retailerDocId, retailerPhone, manufacturerId, manufacturerPhone, assignedAt: mirrorNow },
              { merge: true },
            );

            mirrorBatch.set(
              wDoc(wDb, `retailers/${retailerPhone}/inventory/${item.inventoryId}`),
              {
                id: item.inventoryId,
                productId: item.retailerProductId,
                stockQuantity: 0,
                sellingPrice: item.sellingPrice,
                reorderThreshold: 5,
                isAvailable: false,
                updatedAt: mirrorNow,
                assignedByManufacturer: true
              },
              { merge: true },
            );
          }
        }
        await mirrorBatch.commit();
      } catch (e) {
        console.warn("[bulkAssign] Subcollection mirror write failed (non-critical):", e);
      }

      // Always attempt to repair/confirm the manufacturer→retailer mirror,
      // independent of whether the retailer subcollection batch above succeeded.
      if (manufacturerPhone && retailerPhone) {
        await syncRetailerMirror(manufacturerPhone, retailerPhone, {
          retailerDocId,
          retailerPhone,
          manufacturerPhone,
          shopName: retailerStoreName,
        });
      }

      // Flip onboardingStatus → "active" now that at least one product is assigned.
      await activateRetailerOnProductAssignment(
        manufacturerId,
        retailerDocId,
        manufacturerPhone,
        retailerPhone,
      );
    })();
  }

  return { assigned, skipped, failed };
}

/** All assignment listings received by a retailer (assigned to them by manufacturers). */
export async function fetchAssignmentsForRetailer(
  retailerId: string,
  retailerDocId?: string | null,
): Promise<RetailerSeatListing[]> {
  // Query by Auth UID (post-signup assignments) and optionally also by phone/docId
  // (pre-signup assignments where retailerId may be null or not yet backfilled).
  const queries: Promise<import("firebase/firestore").QuerySnapshot>[] = [
    getDocs(query(
      collection(db, SEAT_LISTINGS),
      where("retailerId", "==", retailerId),
      where("listingType", "==", "assigned"),
    )),
  ];

  if (retailerDocId && retailerDocId !== retailerId) {
    queries.push(getDocs(query(
      collection(db, SEAT_LISTINGS),
      where("retailerDocId", "==", retailerDocId),
      where("listingType", "==", "assigned"),
    )));
  }

  const snaps = await Promise.all(queries);
  const seen = new Set<string>();
  const results: RetailerSeatListing[] = [];

  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const raw = d.data() as Record<string, unknown>;
      const status = raw.status;
      results.push({
        id: d.id,
        ownerId: String(raw.ownerId ?? ""),
        ownerType: (raw.ownerType === "retailer" ? "retailer" : "manufacturer") as "manufacturer" | "retailer",
        manufacturerId: raw.manufacturerId ? String(raw.manufacturerId) : null,
        manufacturerPhone: raw.manufacturerPhone ? String(raw.manufacturerPhone) : null,
        ownerPhone: raw.ownerPhone ? String(raw.ownerPhone) : null,
        retailerDocId: raw.retailerDocId ? String(raw.retailerDocId) : null,
        retailerId: raw.retailerId ? String(raw.retailerId) : null,
        retailerPhone: raw.retailerPhone ? String(raw.retailerPhone) : null,
        productId: String(raw.productId ?? ""),
        manufacturerProductId: raw.manufacturerProductId ? String(raw.manufacturerProductId) : null,
        listingType: "assigned" as const,
        status: (status === "released" || status === "expired" ? status : "active") as RetailerSeatListing["status"],
        assignedAt: raw.assignedAt as RetailerSeatListing["assignedAt"],
        expiresAt: raw.expiresAt as RetailerSeatListing["expiresAt"],
        releasedAt: raw.releasedAt ? (raw.releasedAt as RetailerSeatListing["releasedAt"]) : null,
      });
    }
  }

  return results.sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
}
