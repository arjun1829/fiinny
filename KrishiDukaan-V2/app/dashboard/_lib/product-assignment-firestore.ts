import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { RetailerSeatListing } from "../_types/subscriptions";
import {
  addSeatListingToBatch,
  canAssignSeat,
  fetchSeatListingsForOwner,
  fetchSubscriptions,
  getSubscriptionExpiryDate,
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

  // Fetch the manufacturer product to copy its data
  const productSnap = await getDoc(doc(db, "products", input.productId));
  if (!productSnap.exists()) throw new Error("Product not found.");
  const src = productSnap.data() as Record<string, unknown>;

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
    name: String(src.name ?? ""),
    category: String(src.category ?? ""),
    description: String(src.description ?? ""),
    image: String(src.image ?? ""),
    unit: String(src.unit ?? ""),
    price: typeof src.price === "number" ? src.price : 0,
    isActive: true,
    ownerId: retailerOwnerId,
    ownerType: "retailer",
    createdBy: input.manufacturerId,
    manufacturerId: input.manufacturerId,
    manufacturerProductId: input.productId,
    retailerDocId: input.retailerDocId,
    retailerId: input.retailerId ?? "",
    source: "manufacturer_assigned",
    createdAt: now,
    updatedAt: now,
  });

  // 2. Inventory record — retailer manages stock; linked by retailerDocId pre-signup
  const inventoryRef = doc(collection(db, "inventory"));
  batch.set(inventoryRef, {
    retailerDocId: input.retailerDocId,
    retailerId: input.retailerId ?? "",
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
    ownerType: "manufacturer",
    manufacturerId: input.manufacturerId,
    retailerDocId: input.retailerDocId,
    retailerId: input.retailerId ?? null,
    productId: retailerProductRef.id,
    listingType: "assigned",
    expiresAt: subExpiry,
  });

  // 4. Update manufacturer product's availability so the retailer's store appears
  //    in the marketplace product detail page.
  batch.update(doc(db, "products", input.productId), {
    availability: arrayUnion({ storeId: input.retailerDocId, stockLevel: "In Stock" }),
  });

  await batch.commit();
  return { seatListingId, retailerProductId: retailerProductRef.id };
}

/**
 * Releases a product assignment.
 * Sets the seat listing to "released" and deactivates the retailer's product copy.
 */
export async function removeProductAssignment(seatListingId: string): Promise<void> {
  const listingSnap = await getDoc(doc(db, SEAT_LISTINGS, seatListingId));
  if (!listingSnap.exists()) throw new Error("Seat listing not found.");
  const data = listingSnap.data() as Record<string, unknown>;

  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, SEAT_LISTINGS, seatListingId), { status: "released", releasedAt: now });

  const retailerProductId = String(data.productId ?? "");
  const retailerDocId     = String(data.retailerDocId ?? "");
  if (retailerProductId) {
    batch.update(doc(db, "products", retailerProductId), { isActive: false, updatedAt: now });
  }

  await batch.commit();

  // Remove the retailer's store from the manufacturer product's availability array.
  // We look up the retailer product copy to find the manufacturer's original product ID.
  if (retailerProductId && retailerDocId) {
    try {
      const copySnap = await getDoc(doc(db, "products", retailerProductId));
      const mfgProductId = copySnap.exists() ? String(copySnap.data()?.manufacturerProductId ?? "") : "";
      if (mfgProductId) {
        await updateDoc(doc(db, "products", mfgProductId), {
          availability: arrayRemove({ storeId: retailerDocId, stockLevel: "In Stock" }),
        });
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

/** All assignment listings received by a retailer (assigned to them by manufacturers). */
export async function fetchAssignmentsForRetailer(
  retailerId: string,
): Promise<RetailerSeatListing[]> {
  const q = query(
    collection(db, SEAT_LISTINGS),
    where("retailerId", "==", retailerId),
    where("listingType", "==", "assigned"),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const status = raw.status;
      return {
        id: d.id,
        ownerId: String(raw.ownerId ?? ""),
        ownerType: (raw.ownerType === "retailer" ? "retailer" : "manufacturer") as "manufacturer" | "retailer",
        manufacturerId: raw.manufacturerId ? String(raw.manufacturerId) : null,
        retailerDocId: raw.retailerDocId ? String(raw.retailerDocId) : null,
        retailerId: raw.retailerId ? String(raw.retailerId) : null,
        productId: String(raw.productId ?? ""),
        listingType: "assigned" as const,
        status: (status === "released" || status === "expired" ? status : "active") as RetailerSeatListing["status"],
        assignedAt: raw.assignedAt as RetailerSeatListing["assignedAt"],
        expiresAt: raw.expiresAt as RetailerSeatListing["expiresAt"],
        releasedAt: raw.releasedAt ? (raw.releasedAt as RetailerSeatListing["releasedAt"]) : null,
      } satisfies RetailerSeatListing;
    })
    .sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
}
