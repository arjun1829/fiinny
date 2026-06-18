import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
  stock?: number;
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
  /** Category-specific structured info (new schema). */
  categoryInfo?: Record<string, string | string[]>;
  /** GST configuration for this product. */
  gstApplicable?: boolean;
  gstRate?: 0 | 5 | 12 | 18 | 28;
  /** Whether this product is available for online home delivery. Defaults to online_delivery. */
  sellMode?: "online_delivery" | "offline_store_only";
  /** @deprecated Legacy fertilizer fields — still accepted for backward compat. */
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];
};

/**
 * Creates a manufacturer's own product.
 * Validates seat availability then atomically creates the product + seat listing.
 * 1 product = 1 seat consumed (listingType: "own").
 */
export async function createManufacturerProduct(
  manufacturerId: string,
  input: ManufacturerProductInput,
): Promise<{ productId: string; inventoryId: string; seatListingId: string }> {
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

  // Resolve phone first, then read profile from the phone-keyed doc (new schema)
  const idxSnap = await getDoc(doc(db, "uidIndex", manufacturerId));
  const manufacturerPhone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;

  // Read manufacturer profile using phone as doc ID; fall back to uid for legacy accounts
  const mfgSnap = await getDoc(
    doc(db, "manufacturers", manufacturerPhone || manufacturerId),
  );
  const storeName = mfgSnap.exists()
    ? String(mfgSnap.data().businessName ?? mfgSnap.data().ownerName ?? "")
    : "";

  const now = serverTimestamp();
  const stockQty = input.stockQuantity ?? 0;
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
    sellMode: input.sellMode ?? "online_delivery",
    isOnline: (input.sellMode ?? "online_delivery") === "online_delivery",
    ownerId: manufacturerId,
    ownerPhone: manufacturerPhone ?? null,
    ownerType: "manufacturer",
    createdBy: manufacturerId,
    manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    store: storeName,
    source: "manufacturer_inventory",
    createdAt: now,
    updatedAt: now,
    categoryInfo: input.categoryInfo ?? null,
    // GST fields
    gstApplicable: input.gstApplicable ?? false,
    gstRate: input.gstApplicable ? (input.gstRate ?? 0) : 0,
    // Note: legacy fertilizer flat fields (nitrogen, phosphorus, etc.) are no longer
    // written here — category-specific data lives in categoryInfo only.
  });

  // Inventory record for the manufacturer's own stock
  const inventoryRef = doc(collection(db, "inventory"));
  batch.set(inventoryRef, {
    id: inventoryRef.id,
    ownerId: manufacturerId,
    ownerPhone: manufacturerPhone ?? null,
    ownerType: "manufacturer",
    manufacturerId,
    manufacturerPhone: manufacturerPhone ?? null,
    productId: productRef.id,
    stockQuantity: stockQty,
    sellingPrice: input.price,
    reorderThreshold: 0,
    isAvailable: stockQty > 0,
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

  // Subcollection mirrors (fire-and-forget)
  if (manufacturerPhone) {
    setDoc(
      doc(db, `manufacturers/${manufacturerPhone}/products/${productRef.id}`),
      {
        productId: productRef.id,
        name: input.name.trim(),
        category: input.category.trim(),
        isActive: true,
        addedAt: now
      },
      { merge: true }
    ).catch(() => {});

    setDoc(
      doc(db, `manufacturers/${manufacturerPhone}/inventory/${inventoryRef.id}`),
      {
        id: inventoryRef.id,
        productId: productRef.id,
        stockQuantity: stockQty,
        sellingPrice: input.price,
        reorderThreshold: 0,
        isAvailable: stockQty > 0,
        updatedAt: now,
      },
      { merge: true }
    ).catch(() => {});
  }

  return { productId: productRef.id, inventoryId: inventoryRef.id, seatListingId };
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
  // ── OWNERSHIP AUDIT ──────────────────────────────────────────────────────
  console.log("[updateManufacturerProduct] Saving to products/" + productId, {
    fields: Object.keys(input).filter(k => (input as any)[k] !== undefined),
    price: input.price,
    name: input.name,
  });
  // ────────────────────────────────────────────────────────────────────────
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
  if (input.categoryInfo !== undefined)    patch.categoryInfo    = input.categoryInfo ?? null;
  if (input.gstApplicable !== undefined) {
    patch.gstApplicable = input.gstApplicable;
    patch.gstRate = input.gstApplicable ? (input.gstRate ?? 0) : 0;
  }
  // Legacy fertilizer flat fields omitted — categoryInfo is the source of truth.
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
  nitrogen?: string; phosphorus?: string; potassium?: string; applicationDesc?: string; dosage?: string; bestForCrops?: string[];
}>> {
  if (!term.trim()) return [];
  const snap = await getDocs(query(collection(db, "products"), orderBy("name")));
  const lower = term.toLowerCase();
  const rankProduct = (raw: Record<string, unknown>) => {
    const source = String(raw.source ?? "");
    if (source === "manufacturer_inventory") return 5;
    if (source === "retailer_inventory") return 4;
    if (!source) return 3;
    if (source === "retailer_inventory_copy") return 2;
    if (source === "manufacturer_assigned") return 1;
    return 0;
  };

  const products = snap.docs
    .map((d) => {
      const r = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: String(r.name ?? ""),
        category: String(r.category ?? ""),
        unit: String(r.unit ?? ""),
        price: Number(r.price ?? 0),
        description: String(r.description ?? ""),
        image: String(r.image ?? ""),
        images: Array.isArray(r.images) ? r.images.filter((v): v is string => typeof v === "string") : [],
        variants: Array.isArray(r.variants) ? r.variants : [],
        source: String(r.source ?? ""),
        manufacturerProductId: String(r.manufacturerProductId ?? ""),
        originalProductId: String(r.originalProductId ?? ""),
        score: rankProduct(r),
        categoryInfo: (r.categoryInfo && typeof r.categoryInfo === "object" && !Array.isArray(r.categoryInfo))
          ? r.categoryInfo as Record<string, string | string[]>
          : undefined,
        nitrogen: r.nitrogen ? String(r.nitrogen) : "",
        phosphorus: r.phosphorus ? String(r.phosphorus) : "",
        potassium: r.potassium ? String(r.potassium) : "",
        applicationDesc: r.applicationDesc ? String(r.applicationDesc) : "",
        dosage: r.dosage ? String(r.dosage) : "",
        bestForCrops: Array.isArray(r.bestForCrops) ? r.bestForCrops : [],
      };
    })
    .filter((p) => p.name.toLowerCase().includes(lower))
    .filter((p) => p.source !== "manufacturer_assigned");

  const deduped = new Map<string, typeof products[number]>();
  for (const product of products) {
    const key = (
      product.originalProductId ||
      product.manufacturerProductId ||
      `${product.name.trim().toLowerCase()}|${product.category.trim().toLowerCase()}|${product.unit.trim().toLowerCase()}`
    );
    const existing = deduped.get(key);
    if (!existing || product.score > existing.score) {
      deduped.set(key, product);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 10)
    .map(({ source: _source, manufacturerProductId: _manufacturerProductId, originalProductId: _originalProductId, score: _score, ...product }) => product);
}
