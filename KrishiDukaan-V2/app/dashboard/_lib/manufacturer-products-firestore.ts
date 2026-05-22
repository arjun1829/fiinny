import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
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
  isListingActive,
} from "./subscriptions-firestore";

export type ProductVariant = {
  unit: string;
  price: number;
};

export type ManufacturerProductInput = {
  name: string;
  category: string;
  unit: string;
  price: number;
  variants: ProductVariant[];
  stockQuantity?: number;
  description: string;
  image?: string;
  images?: string[];
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

  // Resolve phone (for users/{phone} update) and business name (for store field) in parallel
  const [idxSnap, mfgSnap] = await Promise.all([
    getDoc(doc(db, "uidIndex", manufacturerId)),
    getDoc(doc(db, "manufacturers", manufacturerId)),
  ]);
  const manufacturerPhone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;
  const storeName = mfgSnap.exists()
    ? String(mfgSnap.data().businessName ?? mfgSnap.data().ownerName ?? "")
    : "";

  const now = serverTimestamp();
  const batch = writeBatch(db);

  const productRef = doc(collection(db, "products"));
  batch.set(productRef, {
    id: productRef.id,
    name: input.name.trim(),
    category: input.category.trim(),
    unit: input.unit.trim(),
    price: input.price,
    variants: input.variants,
    description: input.description.trim(),
    image: (input.image ?? "").trim(),
    images: input.images ?? [],
    isActive: true,
    ownerId: manufacturerId,
    ownerType: "manufacturer",
    createdBy: manufacturerId,
    manufacturerId,
    store: storeName,
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

  if (manufacturerPhone) {
    batch.set(
      doc(db, "users", manufacturerPhone),
      { productCount: increment(1), updatedAt: now },
      { merge: true },
    );
  }

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

/** Update editable fields of a manufacturer's own product. */
export async function updateManufacturerProduct(
  productId: string,
  input: Partial<ManufacturerProductInput>,
): Promise<void> {
  const ref = doc(db, "products", productId);
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.name !== undefined)        patch.name        = input.name.trim();
  if (input.category !== undefined)    patch.category    = input.category.trim();
  if (input.unit !== undefined)        patch.unit        = input.unit.trim();
  if (input.price !== undefined)       patch.price       = input.price;
  if (input.variants !== undefined)       patch.variants       = input.variants;
  if (input.stockQuantity !== undefined)  patch.stockQuantity  = input.stockQuantity;
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.image !== undefined)       patch.image       = (input.image ?? "").trim();
  if (input.images !== undefined)      patch.images      = input.images;
  await updateDoc(ref, patch);
}

/** Toggle a product's isActive flag. */
export async function toggleProductActive(productId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, "products", productId), { isActive, updatedAt: serverTimestamp() });
}

/**
 * Search all products in the catalogue by name (prefix/contains match, client-side).
 * Returns up to 10 results sorted by name.
 */
export async function searchProductsByName(term: string): Promise<Array<{
  id: string; name: string; category: string; unit: string; price: number;
  description: string; image: string; images: string[]; variants: { unit: string; price: number }[];
}>> {
  if (!term.trim()) return [];
  const snap = await getDocs(query(collection(db, "products"), orderBy("name")));
  const lower = term.toLowerCase();
  return snap.docs
    .map((d) => { const r = d.data() as any; return { id: d.id, name: String(r.name ?? ""), category: String(r.category ?? ""), unit: String(r.unit ?? ""), price: Number(r.price ?? 0), description: String(r.description ?? ""), image: String(r.image ?? ""), images: Array.isArray(r.images) ? r.images : [], variants: Array.isArray(r.variants) ? r.variants : [] }; })
    .filter((p) => p.name.toLowerCase().includes(lower))
    .slice(0, 10);
}
