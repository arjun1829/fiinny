import {
  arrayUnion,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";

import { db } from "../../firebase";
import type {
  InventoryDoc,
  InventoryRow,
  ManufacturerProductRow,
  ProductDoc,
} from "../_types/inventory";
import { deriveStockStatus } from "../_types/inventory";
import {
  addSeatListingToBatch,
  canAssignSeat,
  fetchSeatListingsForOwner,
  fetchSubscriptions,
  getSubscriptionExpiryDate,
} from "./subscriptions-firestore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timestampToDate(value: unknown): Date | null {
  if (value == null) return null;
  const t = value as Timestamp;
  if (typeof t?.toDate === "function") return t.toDate();
  return null;
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function resolveUserCounterDocId(uid: string): Promise<string | null> {
  const [idxSnap, legacyUserSnap] = await Promise.all([
    getDoc(doc(db, "uidIndex", uid)),
    getDoc(doc(db, "users", uid)),
  ]);

  if (idxSnap.exists()) {
    const phone = String(idxSnap.data().phone ?? "").trim();
    if (phone) return phone;
  }

  return legacyUserSnap.exists() ? uid : null;
}

function mapProduct(id: string, data: Record<string, unknown>): ProductDoc {
  return {
    id,
    name: String(data.name ?? ""),
    category: String(data.category ?? ""),
    description: String(data.description ?? ""),
    image: String(data.image ?? data.imageUrl ?? ""),
    unit: String(data.unit ?? ""),
    price: toNum(data.price ?? data.defaultPrice, 0),
    createdAt: (data.createdAt as Timestamp) ?? null,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
    isActive: data.isActive !== false,
    
    // Ownership — primary query fields
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
    ownerType:
      data.ownerType === "manufacturer"
        ? "manufacturer"
        : data.ownerType === "retailer"
          ? "retailer"
          : undefined,
    source: data.source ? String(data.source) : undefined,
    manufacturerId: data.manufacturerId ? String(data.manufacturerId) : undefined,
    manufacturerProductId: data.manufacturerProductId
      ? String(data.manufacturerProductId)
      : undefined,
    retailerDocId: data.retailerDocId ? String(data.retailerDocId) : undefined,

    // Market display fields
    retailerId: data.retailerId ? String(data.retailerId) : undefined,
    store: String(data.store ?? ""),
    sellMode:
      data.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only",
    isOnline: data.isOnline === true || data.sellMode === "online_delivery",
  };
}

function mapInventory(id: string, data: Record<string, unknown>): InventoryDoc {
  return {
    id,
    retailerId: data.retailerId ? String(data.retailerId) : undefined,
    productId: String(data.productId ?? ""),
    stockQuantity: toNum(data.stockQuantity ?? data.stock, 0),
    sellingPrice: toNum(data.sellingPrice ?? data.price, 0),
    reorderThreshold: toNum(data.reorderThreshold ?? data.reorderAt, 0),
    isAvailable: data.isAvailable !== false,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
    assignedByManufacturer: data.assignedByManufacturer === true,
    manufacturerProductId: data.manufacturerProductId
      ? String(data.manufacturerProductId)
      : undefined,
    retailerDocId: data.retailerDocId ? String(data.retailerDocId) : undefined,
  };
}

// ─── Internal queries ──────────────────────────────────────────────────────────

/**
 * Fetch all products owned by a user, keyed by ownerId + ownerType.
 * Returns BOTH active and inactive products for management UI.
 */
async function fetchProductsByOwner(
  ownerId: string,
  ownerType: "manufacturer" | "retailer",
): Promise<ProductDoc[]> {
  const q = query(
    collection(db, "products"),
    where("ownerId", "==", ownerId),
    where("ownerType", "==", ownerType),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapProduct(d.id, d.data() as Record<string, unknown>));
}

/**
 * Fetch inventory docs keyed by productId for a set of product IDs (chunked).
 * Keeps only the first matching inventory doc per productId.
 */
async function fetchInventoryByProductIds(
  productIds: string[],
  ownerId?: string,
  retailerDocId?: string,
): Promise<Map<string, InventoryDoc>> {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  const map = new Map<string, InventoryDoc>();
  const chunkSize = 10;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (!chunk.length) continue;

    const queries = [];

    if (ownerId) {
      queries.push(
        getDocs(
          query(
            collection(db, "inventory"),
            where("productId", "in", chunk),
            where("ownerId", "==", ownerId)
          )
        ),
        getDocs(
          query(
            collection(db, "inventory"),
            where("productId", "in", chunk),
            where("retailerId", "==", ownerId)
          )
        )
      );
    }

    if (retailerDocId) {
      queries.push(
        getDocs(
          query(
            collection(db, "inventory"),
            where("productId", "in", chunk),
            where("retailerDocId", "==", retailerDocId)
          )
        )
      );
    }

    // Fallback if no filters are available
    if (queries.length === 0) {
      queries.push(
        getDocs(
          query(
            collection(db, "inventory"),
            where("productId", "in", chunk)
          )
        )
      );
    }

    const snaps = await Promise.all(queries);
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const inv = mapInventory(d.id, d.data() as Record<string, unknown>);
        if (!map.has(inv.productId)) {
          map.set(inv.productId, inv);
        }
      });
    });
  }

  return map;
}

// ─── Public fetch functions ───────────────────────────────────────────────────

/** Batch-fetch product names by doc IDs. Returns a map of id → name. */
export async function fetchProductNames(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  const chunkSize = 10;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const q = query(collection(db, "products"), where(documentId(), "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      map.set(d.id, String(d.data().name ?? ""));
    });
  }
  return map;
}

/**
 * Fetch inventory rows for a RETAILER (active + inactive — management UI).
 *
 * Strategy:
 *   1. Query `products` where ownerId == uid AND ownerType == "retailer"
 *   2. ALSO Query `products` where retailerDocId == retailerDocId (for pending assignments)
 *   3. ALSO Query `products` where retailerPhone == phone (phone-keyed records pre-signup)
 *   4. Join and return InventoryRow[]
 */
export async function fetchRetailerInventoryRows(
  ownerId: string,
  retailerDocId?: string,
  retailerPhone?: string,
): Promise<InventoryRow[]> {
  // Query by UID
  const q1 = query(
    collection(db, "products"),
    where("ownerId", "==", ownerId),
    where("ownerType", "==", "retailer"),
  );

  // Query by retailerDocId if available (for products assigned but not yet backfilled/accepted)
  const queries = [getDocs(q1)];
  if (retailerDocId) {
    const q2 = query(
      collection(db, "products"),
      where("retailerDocId", "==", retailerDocId),
      where("ownerType", "==", "retailer"),
    );
    queries.push(getDocs(q2));
  }
  // Fallback: query by retailerPhone for phone-keyed docs
  if (retailerPhone) {
    const q3 = query(
      collection(db, "products"),
      where("retailerPhone", "==", retailerPhone),
      where("ownerType", "==", "retailer"),
    );
    queries.push(getDocs(q3));
  }

  const snaps = await Promise.all(queries);
  const productMap = new Map<string, ProductDoc>();
  
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const p = mapProduct(d.id, d.data() as Record<string, unknown>);
      productMap.set(p.id, p);
    });
  });

  const products = Array.from(productMap.values());
  if (!products.length) return [];

  const productIds = products.map((p) => p.id);
  const inventoryMap = await fetchInventoryByProductIds(productIds, ownerId, retailerDocId);

  const rows: InventoryRow[] = products.flatMap((p) => {
    const inv = inventoryMap.get(p.id);
    if (!inv) return [];
    const status = deriveStockStatus(inv.stockQuantity, inv.reorderThreshold);
    return [
      {
        inventoryId: inv.id,
        productId: p.id,
        productName: p.name,
        category: p.category,
        unit: p.unit,
        stockQuantity: inv.stockQuantity,
        sellingPrice: inv.sellingPrice,
        reorderThreshold: inv.reorderThreshold,
        status,
        isActive: p.isActive,
        assignedByManufacturer: inv.assignedByManufacturer === true,
        updatedAt: timestampToDate(inv.updatedAt),
        source: p.source,
        // Add ownerId to the row so we can detect if it's "Pending Acceptance"
        ownerId: p.ownerId,
      },
    ];
  });

  rows.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return rows;
}

/**
 * Manually accepts an assigned product: updates ownerId and retailerId to the current user's UID.
 * This is used when a retailer sees an assigned product that hasn't been backfilled yet.
 */
export async function acceptAssignedProduct(
  productId: string,
  inventoryId: string,
  uid: string,
): Promise<void> {
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(doc(db, "products", productId), {
    ownerId: uid,
    retailerId: uid,
    updatedAt: now,
  });

  batch.update(doc(db, "inventory", inventoryId), {
    retailerId: uid,
    ownerId: uid, // ensure inventory ownerId also matches
    isAvailable: true, // Auto-available upon acceptance
    updatedAt: now,
  });

  // Also try to update any associated seat listing
  // We can't easily find the listing ID here without another query, 
  // but backfillRetailerAfterInvite handles the listings.
  // For individual acceptance, updating the product/inventory is usually enough for the UI.

  await batch.commit();
}

/**
 * Fetch catalogue rows for a MANUFACTURER (active + inactive — management UI).
 *
 * Queries `products` where ownerId == uid AND ownerType == "manufacturer".
 * Returns ManufacturerProductRow[] (no stock/inventory data).
 */
export async function fetchManufacturerCatalogueRows(
  ownerId: string,
): Promise<ManufacturerProductRow[]> {
  // Include all products (active + inactive) for management UI
  const products = await fetchProductsByOwner(ownerId, "manufacturer");

  const rows: ManufacturerProductRow[] = products.map((p) => {
    const raw = p as any;
    return {
      productId: p.id,
      productName: p.name,
      category: p.category,
      unit: p.unit,
      price: p.price,
      description: p.description ?? "",
      image: p.image ?? "",
      images: Array.isArray(raw.images) ? raw.images : (p.image ? [p.image] : []),
      variants: Array.isArray(raw.variants) ? raw.variants : [{ unit: p.unit, price: p.price }],
      stockQuantity: typeof raw.stockQuantity === "number" ? raw.stockQuantity : 0,
      source: p.source ?? "manufacturer_inventory",
      isActive: p.isActive,
      updatedAt: timestampToDate(p.updatedAt),
    };
  });

  rows.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return rows;
}

// ─── Write operations ─────────────────────────────────────────────────────────

export type AddProductInventoryInput = {
  name: string;
  category: string;
  unit: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
  description: string;
  imageUrl?: string;
  storeName?: string;
  sellMode: "online_delivery" | "offline_store_only";
  existingProductId?: string;
};

export async function createProductAndInventory(
  ownerId: string,
  input: AddProductInventoryInput,
): Promise<void> {
  const [subs, listings, userCounterDocId] = await Promise.all([
    fetchSubscriptions(ownerId),
    fetchSeatListingsForOwner(ownerId),
    resolveUserCounterDocId(ownerId),
  ]);
  if (!canAssignSeat(subs, listings)) {
    throw new Error(
      "No seats available. Purchase a subscription to add products to your store.",
    );
  }
  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  // Resolve owner phone for dual-field writes
  let ownerPhone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", ownerId));
    if (idxSnap.exists()) ownerPhone = String(idxSnap.data().phone ?? "") || null;
  } catch { /* ignore */ }

  const now = serverTimestamp();
  const image = (input.imageUrl ?? "").trim();
  const batch = writeBatch(db);

  const sellMode =
    input.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only";

  const isCopy = !!input.existingProductId;
  const sourceVal = isCopy ? "retailer_inventory_copy" : "retailer_inventory";

  const productRef = doc(collection(db, "products"));
  batch.set(productRef, {
    id: productRef.id,
    name: input.name.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    image: image || "",
    unit: input.unit.trim(),
    price: input.sellingPrice,
    isActive: true,
    ownerId,
    ownerPhone: ownerPhone ?? null,
    ownerType: "retailer",
    createdBy: ownerId,
    source: sourceVal,
    createdAt: now,
    updatedAt: now,

    // Market display fields
    retailerId: ownerId,
    retailerPhone: ownerPhone ?? null,
    store: input.storeName || "Local Store",
    stock: "In Stock",
    distance: "Nearby",
    sellMode,
    isOnline: sellMode === "online_delivery",
    originalProductId: input.existingProductId || null,
  });

  if (isCopy && input.existingProductId) {
    // Append to original product's availability array
    const originalRef = doc(db, "products", input.existingProductId);
    batch.update(originalRef, {
      availability: arrayUnion({ storeId: ownerId, stockLevel: "In Stock" })
    });
  }

  const inventoryRef = doc(collection(db, "inventory"));
  batch.set(inventoryRef, {
    id: inventoryRef.id,
    ownerId,
    ownerPhone: ownerPhone ?? null,
    ownerType: "retailer",
    retailerId: ownerId,
    retailerPhone: ownerPhone ?? null,
    productId: productRef.id,
    stockQuantity: input.stockQuantity,
    sellingPrice: input.sellingPrice,
    reorderThreshold: input.reorderThreshold,
    isAvailable: input.stockQuantity > 0,
    updatedAt: now,
  });

  addSeatListingToBatch(batch, {
    ownerId,
    ownerType: "retailer",
    manufacturerId: null,
    retailerDocId: null,
    retailerId: ownerId,
    productId: productRef.id,
    manufacturerProductId: null,
    listingType: "own",
    expiresAt: subExpiry,
  });

  if (userCounterDocId) {
    batch.set(
      doc(db, "users", userCounterDocId),
      { productCount: increment(1), updatedAt: now },
      { merge: true },
    );
  }

  // Phone-keyed index for efficient "retailer profile" page queries.
  // Only written when we know the retailer's phone (new-schema accounts).
  if (ownerPhone) {
    // Lightweight product summary in the retailer's subcollection.
    batch.set(doc(db, "retailers", ownerPhone, "products", productRef.id), {
      productId: productRef.id,
      name: input.name.trim(),
      image: image || "",
      price: input.sellingPrice,
      category: input.category.trim(),
      isActive: true,
      createdAt: now,
    });

    // Upsert public retailer profile. Only write shopName when it's a real value
    // so we never overwrite a retailer's real name with the "My Store" placeholder.
    const profilePatch: Record<string, unknown> = {
      phone: ownerPhone,
      role: "retailer",
      updatedAt: now,
    };
    const storeName = (input.storeName ?? "").trim();
    if (storeName && storeName.toLowerCase() !== "my store") {
      profilePatch.shopName = storeName;
    }
    batch.set(doc(db, "profiles", ownerPhone), profilePatch, { merge: true });
  }

  await batch.commit();
}

export type InventoryUpdateInput = {
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
};

export async function updateInventoryRecord(
  inventoryId: string,
  patch: InventoryUpdateInput,
): Promise<void> {
  const ref = doc(db, "inventory", inventoryId);
  await updateDoc(ref, {
    stockQuantity: patch.stockQuantity,
    sellingPrice: patch.sellingPrice,
    reorderThreshold: patch.reorderThreshold,
    isAvailable: patch.stockQuantity > 0,
    updatedAt: serverTimestamp(),
  });
}

// ─── Product lifecycle operations ─────────────────────────────────────────────

/**
 * Deactivates a product: sets isActive=false, releases any active seat listing.
 * The product record stays in Firestore — it can be reactivated later.
 * Pass inventoryId to also set isAvailable=false on the inventory doc.
 */
export async function deactivateProduct(
  productId: string,
  ownerId: string,
  inventoryId?: string,
  ownerPhone?: string,
): Promise<void> {
  const allListings = await fetchSeatListingsForOwner(ownerId);
  const listing = allListings.find(
    (l) => l.productId === productId && l.status === "active",
  );
  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, "products", productId), { isActive: false, updatedAt: now });
  if (inventoryId) {
    batch.update(doc(db, "inventory", inventoryId), { isAvailable: false, updatedAt: now });
  }
  if (listing) {
    batch.update(doc(db, "retailerSeatListings", listing.id), {
      status: "released",
      releasedAt: now,
    });
  }
  if (ownerPhone) {
    batch.update(doc(db, "retailers", ownerPhone, "products", productId), {
      isActive: false,
    });
  }
  await batch.commit();
}

/**
 * Activates an inactive product: validates seat availability, creates a new
 * seat listing, and sets isActive=true.
 * Pass inventoryId to also set isAvailable=true on the inventory doc.
 */
export async function activateProduct(
  productId: string,
  ownerId: string,
  ownerType: "manufacturer" | "retailer",
  inventoryId?: string,
): Promise<void> {
  const [subs, listings] = await Promise.all([
    fetchSubscriptions(ownerId),
    fetchSeatListingsForOwner(ownerId),
  ]);
  if (!canAssignSeat(subs, listings)) {
    throw new Error("No seats available. Purchase more seats to reactivate this product.");
  }
  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, "products", productId), { isActive: true, updatedAt: now });
  if (inventoryId) {
    batch.update(doc(db, "inventory", inventoryId), { isAvailable: true, updatedAt: now });
  }
  addSeatListingToBatch(batch, {
    ownerId,
    ownerType,
    manufacturerId: ownerType === "manufacturer" ? ownerId : null,
    retailerDocId: null,
    retailerId: ownerType === "retailer" ? ownerId : null,
    productId,
    manufacturerProductId: null,
    listingType: "own",
    expiresAt: subExpiry,
  });
  await batch.commit();
}

/**
 * Hard-deletes a product and its inventory record (if given).
 * Also releases any active seat listing.
 */
export async function deleteProduct(
  productId: string,
  ownerId: string,
  inventoryId?: string,
  ownerPhone?: string,
): Promise<void> {
  const allListings = await fetchSeatListingsForOwner(ownerId);
  const listing = allListings.find(
    (l) => l.productId === productId && l.status === "active",
  );
  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.delete(doc(db, "products", productId));
  if (inventoryId) {
    batch.delete(doc(db, "inventory", inventoryId));
  }
  if (listing) {
    batch.update(doc(db, "retailerSeatListings", listing.id), {
      status: "released",
      releasedAt: now,
    });
  }
  if (ownerPhone) {
    batch.delete(doc(db, "retailers", ownerPhone, "products", productId));
  }
  await batch.commit();
}
