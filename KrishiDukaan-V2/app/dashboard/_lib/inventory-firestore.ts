import {
  collection,
  doc,
  documentId,
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
 * This is the primary ownership query — no retailerId or source dependency.
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
): Promise<Map<string, InventoryDoc>> {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  const map = new Map<string, InventoryDoc>();
  const chunkSize = 10;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const q = query(collection(db, "inventory"), where("productId", "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const inv = mapInventory(d.id, d.data() as Record<string, unknown>);
      if (!map.has(inv.productId)) map.set(inv.productId, inv);
    });
  }

  return map;
}

/** @deprecated Use fetchProductsByOwner + fetchInventoryByProductIds instead. */
async function fetchProductsByIds(ids: string[]): Promise<Map<string, ProductDoc>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, ProductDoc>();
  const chunkSize = 10;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const q = query(collection(db, "products"), where(documentId(), "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      map.set(d.id, mapProduct(d.id, d.data() as Record<string, unknown>));
    });
  }

  return map;
}

// ─── Public fetch functions ───────────────────────────────────────────────────

/**
 * Fetch inventory rows for a RETAILER.
 *
 * Strategy (ownerId-first — no retailerId / source dependency):
 *   1. Query `products` where ownerId == uid AND ownerType == "retailer"
 *      → covers both retailer_inventory and manufacturer_assigned sources
 *   2. For those productIds, query `inventory` where productId in [...]
 *   3. Join and return InventoryRow[]
 */
export async function fetchRetailerInventoryRows(ownerId: string): Promise<InventoryRow[]> {
  const products = await fetchProductsByOwner(ownerId, "retailer");
  if (!products.length) return [];

  const productIds = products.map((p) => p.id);
  const inventoryMap = await fetchInventoryByProductIds(productIds);

  const rows: InventoryRow[] = products.flatMap((p) => {
    const inv = inventoryMap.get(p.id);
    if (!inv) return []; // skip products that have no inventory record yet
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
        updatedAt: timestampToDate(inv.updatedAt),
        source: p.source,
      },
    ];
  });

  rows.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return rows;
}

/**
 * Fetch catalogue rows for a MANUFACTURER.
 *
 * Queries `products` where ownerId == uid AND ownerType == "manufacturer".
 * Returns ManufacturerProductRow[] (no stock/inventory data).
 */
export async function fetchManufacturerCatalogueRows(
  ownerId: string,
): Promise<ManufacturerProductRow[]> {
  const products = await fetchProductsByOwner(ownerId, "manufacturer");

  const rows: ManufacturerProductRow[] = products.map((p) => ({
    productId: p.id,
    productName: p.name,
    category: p.category,
    unit: p.unit,
    price: p.price,
    source: p.source ?? "manufacturer_inventory",
    isActive: p.isActive,
    updatedAt: timestampToDate(p.updatedAt),
  }));

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
};

export async function createProductAndInventory(
  ownerId: string,
  input: AddProductInventoryInput,
): Promise<void> {
  const [subs, listings] = await Promise.all([
    fetchSubscriptions(ownerId),
    fetchSeatListingsForOwner(ownerId),
  ]);
  if (!canAssignSeat(subs, listings)) {
    throw new Error(
      "No seats available. Purchase a subscription to add products to your store.",
    );
  }
  const subExpiry = getSubscriptionExpiryDate(subs);
  if (!subExpiry) throw new Error("No active subscription found.");

  const now = serverTimestamp();
  const image = (input.imageUrl ?? "").trim();
  const batch = writeBatch(db);

  const sellMode =
    input.sellMode === "online_delivery" ? "online_delivery" : "offline_store_only";

  // 1. Product
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
    ownerType: "retailer",
    createdBy: ownerId,
    source: "retailer_inventory",
    createdAt: now,
    updatedAt: now,
    
    // Market display fields
    retailerId: ownerId,
    store: input.storeName || "Local Store",
    stock: "In Stock",
    distance: "Nearby",
    sellMode,
    isOnline: sellMode === "online_delivery",
  });

  // 2. Inventory — linked by productId (ownerId-first approach)
  const inventoryRef = doc(collection(db, "inventory"));
  batch.set(inventoryRef, {
    id: inventoryRef.id,
    ownerId,
    ownerType: "retailer",
    // keep retailerId for backwards compatibility with legacy queries
    retailerId: ownerId,
    productId: productRef.id,
    stockQuantity: input.stockQuantity,
    sellingPrice: input.sellingPrice,
    reorderThreshold: input.reorderThreshold,
    isAvailable: input.stockQuantity > 0,
    updatedAt: now,
  });

  // 3. Seat listing
  addSeatListingToBatch(batch, {
    ownerId,
    ownerType: "retailer",
    manufacturerId: null,
    retailerDocId: null,
    retailerId: ownerId,
    productId: productRef.id,
    listingType: "own",
    expiresAt: subExpiry,
  });

  // 4. Increment productCount
  batch.set(
    doc(db, "users", ownerId),
    { productCount: increment(1), updatedAt: now },
    { merge: true },
  );

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
