import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
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
  isListingActive,
} from "./subscriptions-firestore";

export type ManufacturerProductInput = {
  name: string;
  category: string;
  unit: string;
  price: number;
  description: string;
  image?: string;
};

/**
 * Creates a manufacturer's own product.
 * Validates seat availability then atomically creates the product + seat listing.
 * 1 product = 1 seat consumed (listingType: "own").
 */
export async function createManufacturerProduct(
  manufacturerId: string,
  input: ManufacturerProductInput,
): Promise<{ productId: string; seatListingId: string }> {
  const [subs, listings] = await Promise.all([
    fetchSubscriptions(manufacturerId),
    fetchSeatListingsForOwner(manufacturerId),
  ]);
  if (!canAssignSeat(subs, listings)) {
    throw new Error(
      "No seats available. Purchase a subscription to add products to your catalogue.",
    );
  }
  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  const now = serverTimestamp();
  const batch = writeBatch(db);

  const productRef = doc(collection(db, "products"));
  batch.set(productRef, {
    id: productRef.id,
    name: input.name.trim(),
    category: input.category.trim(),
    unit: input.unit.trim(),
    price: input.price,
    description: input.description.trim(),
    image: (input.image ?? "").trim(),
    isActive: true,
    ownerId: manufacturerId,
    ownerType: "manufacturer",
    createdBy: manufacturerId,
    manufacturerId,
    source: "manufacturer_inventory",
    createdAt: now,
    updatedAt: now,
  });

  const seatListingId = addSeatListingToBatch(batch, {
    ownerId: manufacturerId,
    ownerType: "manufacturer",
    manufacturerId,
    retailerDocId: null,
    retailerId: null,
    productId: productRef.id,
    manufacturerProductId: null,
    listingType: "own",
    expiresAt: subExpiry,
  });

  batch.set(
    doc(db, "users", manufacturerId),
    { productCount: increment(1), updatedAt: now },
    { merge: true },
  );

  await batch.commit();
  return { productId: productRef.id, seatListingId };
}

/** Fetches all seat listings belonging to this manufacturer (own + assigned). */
export async function fetchManufacturerSeatListings(
  manufacturerId: string,
): Promise<RetailerSeatListing[]> {
  return fetchSeatListingsForOwner(manufacturerId);
}

/** Fetches only own-product listings (listingType: "own"). */
export async function fetchOwnProductListings(
  ownerId: string,
): Promise<RetailerSeatListing[]> {
  const q = query(
    collection(db, "retailerSeatListings"),
    where("ownerId", "==", ownerId),
    where("listingType", "==", "own"),
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
        manufacturerProductId: null,
        listingType: "own" as const,
        status: (status === "released" || status === "expired" ? status : "active") as RetailerSeatListing["status"],
        assignedAt: raw.assignedAt as RetailerSeatListing["assignedAt"],
        expiresAt: raw.expiresAt as RetailerSeatListing["expiresAt"],
        releasedAt: raw.releasedAt ? (raw.releasedAt as RetailerSeatListing["releasedAt"]) : null,
      } satisfies RetailerSeatListing;
    })
    .filter(isListingActive)
    .sort((a, b) => (b.assignedAt?.toMillis?.() ?? 0) - (a.assignedAt?.toMillis?.() ?? 0));
}
