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
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "../../firebase";
import type {
  DiscountUpdateInput,
  InventoryDoc,
  InventoryRow,
  ManufacturerProductRow,
  ProductDoc,
} from "../_types/inventory";
import { deriveStockStatus } from "../_types/inventory";
import { calcDiscount, getActiveDiscountPct } from "../../utils/discount";
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

    // Optional Product Insights fields
    nitrogen: data.nitrogen ? String(data.nitrogen) : undefined,
    phosphorus: data.phosphorus ? String(data.phosphorus) : undefined,
    potassium: data.potassium ? String(data.potassium) : undefined,
    applicationDesc: data.applicationDesc ? String(data.applicationDesc) : undefined,
    dosage: data.dosage ? String(data.dosage) : undefined,
    bestForCrops: Array.isArray(data.bestForCrops) ? data.bestForCrops : undefined,
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
    discountEnabled:   data.discountEnabled === true,
    discountPct:       toNum(data.discountPct, 0),
    discountStartDate: (data.discountStartDate as Timestamp) ?? null,
    discountEndDate:   (data.discountEndDate as Timestamp) ?? null,
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
 * Fetch all inventory docs owned by / assigned to a RETAILER, keyed by productId.
 *
 * Uses ONLY ownership-scoped queries so every individual query is covered by the
 * `inventory` Firestore rule without the "productId-in" anti-pattern that causes
 * "Missing or insufficient permissions" errors when any returned doc fails the rule.
 *
 * Three query axes cover all lifecycle states:
 *   1. ownerId == uid            — self-created products and post-backfill assigned ones
 *   2. retailerId == uid         — post-backfill assigned products (backfill sets retailerId)
 *   3. retailerDocId == phone    — pre-signup / pre-backfill assigned products
 */
async function fetchInventoryForRetailer(
  uid: string,
  retailerDocId?: string | null,
  retailerPhone?: string | null,
): Promise<Map<string, InventoryDoc>> {
  const map = new Map<string, InventoryDoc>();

  const queries: Promise<Awaited<ReturnType<typeof getDocs>>>[] = [
    getDocs(query(collection(db, "inventory"), where("ownerId", "==", uid))),
    getDocs(query(collection(db, "inventory"), where("retailerId", "==", uid))),
  ];

  // Deduplicate phone keys: retailerDocId is the canonical phone; retailerPhone is a fallback
  const phoneKeys = new Set<string>();
  if (retailerDocId) phoneKeys.add(retailerDocId);
  if (retailerPhone && retailerPhone !== retailerDocId) phoneKeys.add(retailerPhone);
  Array.from(phoneKeys).forEach((phone) => {
    queries.push(getDocs(query(collection(db, "inventory"), where("retailerDocId", "==", phone))));
  });

  const snaps = await Promise.all(queries);
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const inv = mapInventory(d.id, d.data() as Record<string, unknown>);
      if (!map.has(inv.productId)) map.set(inv.productId, inv);
    });
  });

  return map;
}

/**
 * Fetch all inventory docs owned by a MANUFACTURER, keyed by productId.
 *
 * Queries by ownerId and manufacturerId separately so both self-created inventory
 * and legacy docs where only manufacturerId was set are captured. Each query is
 * individually validated by the `inventory` Firestore rule.
 */
async function fetchInventoryForManufacturer(uid: string): Promise<Map<string, InventoryDoc>> {
  const map = new Map<string, InventoryDoc>();

  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, "inventory"), where("ownerId", "==", uid))),
    getDocs(query(collection(db, "inventory"), where("manufacturerId", "==", uid))),
  ]);

  [...snap1.docs, ...snap2.docs].forEach((d) => {
    const inv = mapInventory(d.id, d.data() as Record<string, unknown>);
    if (!map.has(inv.productId)) map.set(inv.productId, inv);
  });

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

  const inventoryMap = await fetchInventoryForRetailer(ownerId, retailerDocId, retailerPhone);

  const rows: InventoryRow[] = products.flatMap((p) => {
    const inv = inventoryMap.get(p.id);
    if (!inv) return [];
    const status = deriveStockStatus(inv.stockQuantity, inv.reorderThreshold);
    const raw = p as unknown as Record<string, unknown>;
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
        ownerId: p.ownerId,
        originalProductId: raw.originalProductId ? String(raw.originalProductId) : null,
        discountEnabled:   inv.discountEnabled ?? false,
        discountPct:       inv.discountPct ?? 0,
        discountStartDate: timestampToDate(inv.discountStartDate),
        discountEndDate:   timestampToDate(inv.discountEndDate),
        effectiveDiscountPct: getActiveDiscountPct(inv),
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
  const products = await fetchProductsByOwner(ownerId, "manufacturer");
  if (!products.length) return [];

  // Join inventory to get inventoryId (and up-to-date stockQuantity)
  const inventoryMap = await fetchInventoryForManufacturer(ownerId);

  const rows: ManufacturerProductRow[] = products.map((p) => {
    const raw = p as any;
    const inv = inventoryMap.get(p.id);
    return {
      productId: p.id,
      inventoryId: inv?.id,
      productName: p.name,
      category: p.category,
      unit: p.unit,
      price: p.price,
      description: p.description ?? "",
      image: p.image ?? "",
      images: Array.isArray(raw.images) ? raw.images : (p.image ? [p.image] : []),
      variants: Array.isArray(raw.variants) ? raw.variants : [{ unit: p.unit, price: p.price }],
      stockQuantity: inv?.stockQuantity ?? (typeof raw.stockQuantity === "number" ? raw.stockQuantity : 0),
      source: p.source ?? "manufacturer_inventory",
      isActive: p.isActive,
      updatedAt: timestampToDate(p.updatedAt),
      originalProductId: raw.originalProductId ? String(raw.originalProductId) : null,
      nitrogen: p.nitrogen ?? "",
      phosphorus: p.phosphorus ?? "",
      potassium: p.potassium ?? "",
      applicationDesc: p.applicationDesc ?? "",
      dosage: p.dosage ?? "",
      bestForCrops: p.bestForCrops ?? [],
      discountEnabled:   inv?.discountEnabled ?? false,
      discountPct:       inv?.discountPct ?? 0,
      discountStartDate: timestampToDate(inv?.discountStartDate),
      discountEndDate:   timestampToDate(inv?.discountEndDate),
      effectiveDiscountPct: inv ? getActiveDiscountPct(inv) : 0,
    };
  });

  rows.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return rows;
}

// ─── Write operations ─────────────────────────────────────────────────────────

/**
 * Returns true if this retailer already has an active product listing that
 * matches by originalProductId (autofill path) OR by name + unit (manual path).
 *
 * Uses only the indexed ownerId+ownerType query to avoid requiring new composite
 * indexes. Client-side filtering is acceptable because retailers have few products.
 */
export async function retailerHasProduct(
  ownerId: string,
  opts: { originalProductId?: string | null; name: string; unit: string },
): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(db, "products"),
      where("ownerId", "==", ownerId),
      where("ownerType", "==", "retailer"),
    ),
  );
  const nameLower = opts.name.trim().toLowerCase();
  const unitLower = opts.unit.trim().toLowerCase();

  return snap.docs.some((d) => {
    const data = d.data() as Record<string, unknown>;
    if (data.isActive === false) return false;
    if (opts.originalProductId && data.originalProductId === opts.originalProductId) return true;
    return (
      String(data.name ?? "").toLowerCase() === nameLower &&
      String(data.unit ?? "").toLowerCase() === unitLower
    );
  });
}

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
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];
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

  // Duplicate guard — prevent the same product being listed more than once
  const isDuplicate = await retailerHasProduct(ownerId, {
    originalProductId: input.existingProductId,
    name: input.name,
    unit: input.unit,
  });
  if (isDuplicate) {
    throw new Error(
      `"${input.name.trim()}" is already in your inventory. Edit the existing listing instead of adding it again.`,
    );
  }

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

    // Optional Product Insights fields
    nitrogen: input.nitrogen?.trim() || null,
    phosphorus: input.phosphorus?.trim() || null,
    potassium: input.potassium?.trim() || null,
    applicationDesc: input.applicationDesc?.trim() || null,
    dosage: input.dosage?.trim() || null,
    bestForCrops: input.bestForCrops || null,
  });

  if (isCopy && input.existingProductId) {
    const originalRef = doc(db, "products", input.existingProductId);
    batch.update(originalRef, {
      availability: arrayUnion({
        storeId: ownerId,
        storePhone: ownerPhone ?? null,
        storeName: (input.storeName ?? "").trim() || null,
        stockLevel: "In Stock",
        sellingPrice: input.sellingPrice,
      }),
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

  // Subcollection mirrors for self-created product and inventory (fire-and-forget)
  if (ownerPhone) {
    import("firebase/firestore").then(({ setDoc: sDoc, doc: wDoc }) => {
      sDoc(
        wDoc(db, `retailers/${ownerPhone}/products/${productRef.id}`),
        {
          productId: productRef.id,
          name: input.name.trim(),
          category: input.category.trim(),
          unit: input.unit.trim(),
          isActive: true,
          addedAt: now
        },
        { merge: true }
      ).catch(() => {});

      sDoc(
        wDoc(db, `retailers/${ownerPhone}/inventory/${inventoryRef.id}`),
        {
          id: inventoryRef.id,
          productId: productRef.id,
          stockQuantity: input.stockQuantity,
          sellingPrice: input.sellingPrice,
          reorderThreshold: input.reorderThreshold,
          isAvailable: input.stockQuantity > 0,
          updatedAt: now
        },
        { merge: true }
      ).catch(() => {});
    }).catch(() => {});
  }
}

export type AddManufacturerInventoryInput = {
  productId: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
};

/**
 * Creates a manufacturer-owned inventory record in global and subcollections.
 * Used when a manufacturer acts as a direct seller with their own stock.
 */
export async function createManufacturerInventoryRecord(
  manufacturerId: string,
  input: AddManufacturerInventoryInput
): Promise<void> {
  // Resolve owner phone
  let ownerPhone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", manufacturerId));
    if (idxSnap.exists()) ownerPhone = String(idxSnap.data().phone ?? "") || null;
  } catch { /* ignore */ }

  const now = serverTimestamp();
  const inventoryRef = doc(collection(db, "inventory"));

  // 1. Create global inventory doc
  await setDoc(inventoryRef, {
    id: inventoryRef.id,
    ownerId: manufacturerId,
    ownerPhone: ownerPhone ?? null,
    ownerType: "manufacturer",
    manufacturerId,
    manufacturerPhone: ownerPhone ?? null,
    productId: input.productId,
    stockQuantity: input.stockQuantity,
    sellingPrice: input.sellingPrice,
    reorderThreshold: input.reorderThreshold,
    isAvailable: input.stockQuantity > 0,
    updatedAt: now,
  });

  // 2. Fire-and-forget mirror to manufacturers/{manufacturerPhone}/inventory/{inventoryId}
  if (ownerPhone) {
    setDoc(
      doc(db, `manufacturers/${ownerPhone}/inventory/${inventoryRef.id}`),
      {
        id: inventoryRef.id,
        productId: input.productId,
        stockQuantity: input.stockQuantity,
        sellingPrice: input.sellingPrice,
        reorderThreshold: input.reorderThreshold,
        isAvailable: input.stockQuantity > 0,
        updatedAt: now,
      },
      { merge: true }
    ).catch(() => {});
  }
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

  // Background sync to subcollection mirror (fire-and-forget)
  (async () => {
    try {
      const { getDoc: sGet, doc: wDoc, setDoc: sSet, serverTimestamp: sTs } = await import("firebase/firestore");
      const invSnap = await sGet(wDoc(db, "inventory", inventoryId));
      if (!invSnap.exists()) return;
      const data = invSnap.data();
      let phone: string | null = (data.ownerPhone || data.retailerPhone || data.manufacturerPhone) ?? null;
      const ownerType: string = data.ownerType || "retailer";
      // Fallback: resolve phone via uidIndex using ownerId (handles docs created before ownerPhone was set)
      if (!phone && data.ownerId) {
        const idxSnap = await sGet(wDoc(db, "uidIndex", data.ownerId));
        if (idxSnap.exists()) phone = String(idxSnap.data().phone ?? "") || null;
      }
      if (!phone) return;
      const col = ownerType === "manufacturer" ? "manufacturers" : "retailers";
      await sSet(
        wDoc(db, `${col}/${phone}/inventory/${inventoryId}`),
        {
          stockQuantity: patch.stockQuantity,
          sellingPrice: patch.sellingPrice,
          reorderThreshold: patch.reorderThreshold,
          isAvailable: patch.stockQuantity > 0,
          updatedAt: sTs(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[updateInventoryRecord] Mirror sync failed:", e);
    }
  })();
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

  // Sync isAvailable=false to subcollection mirror (fire-and-forget)
  if (inventoryId) {
    (async () => {
      try {
        const { getDoc: sGet, doc: wDoc, setDoc: sSet, serverTimestamp: sTs } = await import("firebase/firestore");
        const [idxSnap, invSnap] = await Promise.all([
          sGet(wDoc(db, "uidIndex", ownerId)),
          sGet(wDoc(db, "inventory", inventoryId)),
        ]);
        let phone: string | null = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
        const ownerType: string = invSnap.exists() ? (invSnap.data().ownerType || "retailer") : "retailer";
        // Fallback: phone stored on the inventory doc
        if (!phone && invSnap.exists()) {
          const d = invSnap.data();
          phone = d.ownerPhone || d.retailerPhone || d.manufacturerPhone || null;
        }
        if (!phone) return;
        const col = ownerType === "manufacturer" ? "manufacturers" : "retailers";
        await sSet(
          wDoc(db, `${col}/${phone}/inventory/${inventoryId}`),
          { isAvailable: false, updatedAt: sTs() },
          { merge: true }
        );
      } catch {}
    })();
  }
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

  // Sync isAvailable=true to subcollection mirror (fire-and-forget)
  if (inventoryId) {
    (async () => {
      try {
        const { getDoc: sGet, doc: wDoc, setDoc: sSet, serverTimestamp: sTs } = await import("firebase/firestore");
        const idxSnap = await sGet(wDoc(db, "uidIndex", ownerId));
        let phone: string | null = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
        // Fallback: read phone from inventory doc
        if (!phone) {
          const invSnap = await sGet(wDoc(db, "inventory", inventoryId));
          if (invSnap.exists()) {
            const d = invSnap.data();
            phone = d.ownerPhone || d.retailerPhone || d.manufacturerPhone || null;
          }
        }
        if (!phone) return;
        const col = ownerType === "manufacturer" ? "manufacturers" : "retailers";
        await sSet(
          wDoc(db, `${col}/${phone}/inventory/${inventoryId}`),
          { isAvailable: true, updatedAt: sTs() },
          { merge: true }
        );
      } catch {}
    })();
  }
}

// ─── Discount operations ──────────────────────────────────────────────────────

/**
 * Saves discount settings for a seller's inventory record and mirrors the
 * computed effectiveDiscountPct to the product doc. Also triggers a
 * recompute of maxDiscountPct on the original product (fire-and-forget).
 */
export async function updateDiscountRecord(
  inventoryId: string,
  productId: string,
  patch: DiscountUpdateInput,
  originalProductId?: string | null,
): Promise<void> {
  if (patch.discountPct < 0 || patch.discountPct > 99) {
    throw new Error("Discount percentage must be between 0 and 99.");
  }
  if (
    patch.discountStartDate &&
    patch.discountEndDate &&
    patch.discountEndDate <= patch.discountStartDate
  ) {
    throw new Error("End date must be after start date.");
  }

  const startTs = patch.discountStartDate ? Timestamp.fromDate(patch.discountStartDate) : null;
  const endTs   = patch.discountEndDate   ? Timestamp.fromDate(patch.discountEndDate)   : null;

  const effectivePct = getActiveDiscountPct({
    discountEnabled:   patch.discountEnabled,
    discountPct:       patch.discountPct,
    discountStartDate: startTs,
    discountEndDate:   endTs,
  });

  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(doc(db, "inventory", inventoryId), {
    discountEnabled:   patch.discountEnabled,
    discountPct:       patch.discountPct,
    discountStartDate: startTs,
    discountEndDate:   endTs,
    updatedAt: now,
  });

  batch.update(doc(db, "products", productId), {
    effectiveDiscountPct: effectivePct,
    updatedAt: now,
  });

  await batch.commit();

  // Sync discountPct into the availability[] entry on the root product (fire-and-forget).
  // This is how the product detail page reads per-seller discounts.
  if (originalProductId) {
    syncAvailabilityDiscount(originalProductId, productId, effectivePct).catch(() => {});
  }

  // Recompute maxDiscountPct on the root/original product (fire-and-forget).
  const rootId = originalProductId ?? productId;
  recomputeMaxDiscount(rootId).catch(() => {});
}

/**
 * Updates the `discountPct` field on the matching entry in the original product's
 * `availability[]` array. Uses a transaction to safely replace the array element.
 */
async function syncAvailabilityDiscount(
  rootProductId: string,
  sellerProductId: string,
  effectivePct: number,
): Promise<void> {
  const rootRef = doc(db, "products", rootProductId);
  const snap = await getDoc(rootRef);
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  const availability = Array.isArray(data.availability) ? [...(data.availability as Record<string, unknown>[])] : [];
  if (!availability.length) return;

  // Fetch the seller product to get its ownerId / retailerId for matching
  const sellerSnap = await getDoc(doc(db, "products", sellerProductId));
  if (!sellerSnap.exists()) return;
  const seller = sellerSnap.data() as Record<string, unknown>;
  const sellerOwnerId  = String(seller.ownerId  ?? "");
  const sellerPhone    = String(seller.retailerPhone ?? seller.ownerPhone ?? "");

  const updated = availability.map((entry) => {
    const storeId    = String(entry.storeId    ?? "");
    const storePhone = String(entry.storePhone ?? "");
    const matches =
      (sellerOwnerId && storeId === sellerOwnerId) ||
      (sellerPhone   && (storePhone === sellerPhone || storeId === sellerPhone));
    return matches ? { ...entry, discountPct: effectivePct } : entry;
  });

  await updateDoc(rootRef, { availability: updated });
}

/**
 * Finds all active seller copies of a product (via originalProductId) and
 * updates maxDiscountPct on the root doc with the highest active discount.
 */
async function recomputeMaxDiscount(rootProductId: string): Promise<void> {
  const [rootSnap, copiesSnap] = await Promise.all([
    getDoc(doc(db, "products", rootProductId)),
    getDocs(
      query(
        collection(db, "products"),
        where("originalProductId", "==", rootProductId),
        where("isActive", "==", true),
      ),
    ),
  ]);

  const pcts: number[] = [];
  if (rootSnap.exists()) {
    const d = rootSnap.data() as Record<string, unknown>;
    if (d.isActive !== false) pcts.push(toNum(d.effectiveDiscountPct, 0));
  }
  copiesSnap.docs.forEach((d) =>
    pcts.push(toNum((d.data() as Record<string, unknown>).effectiveDiscountPct, 0)),
  );

  const maxPct = Math.max(0, ...pcts);
  await updateDoc(doc(db, "products", rootProductId), { maxDiscountPct: maxPct });
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

  // Delete subcollection mirror (fire-and-forget)
  if (inventoryId) {
    (async () => {
      try {
        const { getDoc: sGet, doc: wDoc, deleteDoc: sDelete } = await import("firebase/firestore");
        const [idxSnap, invSnap] = await Promise.all([
          sGet(wDoc(db, "uidIndex", ownerId)),
          sGet(wDoc(db, "inventory", inventoryId)),
        ]);
        let phone: string | null = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
        const ownerType: string = invSnap.exists() ? (invSnap.data().ownerType || "retailer") : "retailer";
        if (!phone && invSnap.exists()) {
          const d = invSnap.data();
          phone = d.ownerPhone || d.retailerPhone || d.manufacturerPhone || null;
        }
        if (!phone) return;
        const col = ownerType === "manufacturer" ? "manufacturers" : "retailers";
        await sDelete(wDoc(db, `${col}/${phone}/inventory/${inventoryId}`));
      } catch {}
    })();
  }
}
