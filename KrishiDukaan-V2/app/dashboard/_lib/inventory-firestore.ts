import {
  arrayUnion,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  orderBy,
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
  BulkDiscountTier,
  DiscountUpdateInput,
  InventoryDoc,
  InventoryRow,
  ProductDoc,
} from "../_types/inventory";
import { deriveStockStatus } from "../_types/inventory";
import { calcDiscount, getActiveDiscountPct, getActiveDiscountAmt } from "../../utils/discount";
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
    // Carry the full gallery so the edit form can rehydrate every slot.
    // Falls back to the single `image` for legacy products with no `images[]`.
    images: (() => {
      const main = String(data.image ?? data.imageUrl ?? "");
      const arr = Array.isArray(data.images)
        ? data.images.filter((u): u is string => typeof u === "string" && u.trim() !== "")
        : [];
      return arr.length ? arr : (main ? [main] : []);
    })(),
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
      data.sellMode === "offline_store_only" ? "offline_store_only" : "online_delivery",
    isOnline: data.sellMode !== "offline_store_only",

    categoryInfo: (data.categoryInfo && typeof data.categoryInfo === "object" && !Array.isArray(data.categoryInfo))
      ? data.categoryInfo as Record<string, string | string[]>
      : undefined,
    videoUrl: data.videoUrl ? String(data.videoUrl) : undefined,
    composition: Array.isArray(data.composition)
      ? (data.composition as { name: string; value: string }[]).filter(
          (c) => c && typeof c === "object" && c.name
        )
      : undefined,
    customFields: Array.isArray(data.customFields)
      ? (data.customFields as { title: string; value: string }[]).filter(
          (f) => f && typeof f === "object" && f.title
        )
      : undefined,
    // Legacy fertilizer flat fields — kept for backward compat
    nitrogen: data.nitrogen ? String(data.nitrogen) : undefined,
    phosphorus: data.phosphorus ? String(data.phosphorus) : undefined,
    potassium: data.potassium ? String(data.potassium) : undefined,
    applicationDesc: data.applicationDesc ? String(data.applicationDesc) : undefined,
    dosage: data.dosage ? String(data.dosage) : undefined,
    bestForCrops: Array.isArray(data.bestForCrops) ? data.bestForCrops : undefined,
    variants: Array.isArray(data.variants) ? data.variants as { unit: string; price: number; stock?: number }[] : undefined,
    // GST fields
    gstApplicable: data.gstApplicable === true,
    gstRate: ([0, 5, 12, 18, 28] as const).includes(data.gstRate as 0 | 5 | 12 | 18 | 28)
      ? (data.gstRate as 0 | 5 | 12 | 18 | 28)
      : 0,
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
    discountType:      data.discountType === "fixed_amount" ? "fixed_amount" : "percentage",
    discountPct:       toNum(data.discountPct, 0),
    discountFixedAmt:  toNum(data.discountFixedAmt, 0),
    discountStartDate: (data.discountStartDate as Timestamp) ?? null,
    discountEndDate:   (data.discountEndDate as Timestamp) ?? null,
    bulkDiscountEnabled: data.bulkDiscountEnabled === true,
    bulkDiscountTiers: Array.isArray(data.bulkDiscountTiers)
      ? (data.bulkDiscountTiers as { minQty: number; discountPct: number }[])
          .filter(t => typeof t.minQty === "number" && typeof t.discountPct === "number")
      : [],
  };
}

// ─── Internal queries ──────────────────────────────────────────────────────────

/**
 * Fetch all products owned by a user, keyed by ownerId + ownerType.
 * Returns BOTH active and inactive products for management UI.
 *
 * Admin-assigned products (source: "admin_assigned") key ownership by PHONE
 * (ownerId/ownerPhone == phone), not the Auth UID, so when a phone is known we
 * also query by phone — otherwise those copies never surface in Inventory even
 * though they appear in the marketplace (which matches by phone). Each query is
 * individually ownership-scoped so the Firestore `products` rule still covers it.
 */
async function fetchProductsByOwner(
  ownerId: string,
  ownerType: "manufacturer" | "retailer",
  ownerPhone?: string | null,
): Promise<ProductDoc[]> {
  const queries: Promise<Awaited<ReturnType<typeof getDocs>>>[] = [
    getDocs(query(
      collection(db, "products"),
      where("ownerId", "==", ownerId),
      where("ownerType", "==", ownerType),
    )),
  ];

  // Phone-keyed admin-assigned copies: ownerId == phone.
  if (ownerPhone && ownerPhone !== ownerId) {
    queries.push(getDocs(query(
      collection(db, "products"),
      where("ownerId", "==", ownerPhone),
      where("ownerType", "==", ownerType),
    )));
  }

  const snaps = await Promise.all(queries);
  const map = new Map<string, ProductDoc>();
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const p = mapProduct(d.id, d.data() as Record<string, unknown>);
      if (!map.has(p.id)) map.set(p.id, p);
    });
  });
  return Array.from(map.values());
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
    // Admin-assigned inventory keys ownership by phone via ownerId (== phone) and
    // carries NO retailerDocId, so match that axis too — otherwise the product is
    // found but its inventory join misses and the row is dropped. Matched on
    // ownerId (not ownerPhone) so every returned doc passes the inventory read
    // rule's phoneMatches(ownerId) clause.
    queries.push(getDocs(query(collection(db, "inventory"), where("ownerId", "==", phone))));
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
async function fetchInventoryForManufacturer(
  uid: string,
  ownerPhone?: string | null,
): Promise<Map<string, InventoryDoc>> {
  const map = new Map<string, InventoryDoc>();

  const queries: Promise<Awaited<ReturnType<typeof getDocs>>>[] = [
    getDocs(query(collection(db, "inventory"), where("ownerId", "==", uid))),
    getDocs(query(collection(db, "inventory"), where("manufacturerId", "==", uid))),
  ];

  // Admin-assigned inventory keys ownership by phone (ownerId == phone), never the
  // UID — query that axis too so the join below finds them. Matched on ownerId so
  // every returned doc passes the inventory read rule's phoneMatches(ownerId) clause.
  // Also covers the admin-view case where uid is already the phone (phone == ownerPhone).
  if (ownerPhone && ownerPhone !== uid) {
    queries.push(getDocs(query(collection(db, "inventory"), where("ownerId", "==", ownerPhone))));
  }
  // When uid IS the phone (admin-created user, uid:null), the first two queries already
  // cover it — no extra query needed since ownerPhone === uid in that case.

  const snaps = await Promise.all(queries);
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const inv = mapInventory(d.id, d.data() as Record<string, unknown>);
      if (!map.has(inv.productId)) map.set(inv.productId, inv);
    });
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
    // Admin-assigned copies key ownership by phone via ownerId — match that axis
    // too so they surface alongside retailerPhone-keyed docs.
    queries.push(getDocs(query(
      collection(db, "products"),
      where("ownerId", "==", retailerPhone),
      where("ownerType", "==", "retailer"),
    )));
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
        description: p.description ?? "",
        image: p.image ?? "",
        images: p.images?.length ? p.images : (p.image ? [p.image] : []),
        variants: p.variants ?? [{ unit: p.unit, price: inv.sellingPrice }],
        price: p.price ?? inv.sellingPrice,
        stockQuantity: inv.stockQuantity,
        sellingPrice: inv.sellingPrice,
        reorderThreshold: inv.reorderThreshold,
        status,
        isActive: p.isActive,
        sellMode: p.sellMode ?? "online_delivery",
        gstApplicable: p.gstApplicable ?? false,
        gstRate: p.gstRate ?? 0,
        assignedByManufacturer: inv.assignedByManufacturer === true,
        source: p.source ?? "retailer_inventory",
        ownerId: p.ownerId,
        // manufacturer_assigned copies use manufacturerProductId instead of originalProductId —
        // fall back to it so syncAvailabilityDiscount + recomputeMaxDiscount find the root.
        originalProductId: (raw.originalProductId || raw.manufacturerProductId)
          ? String(raw.originalProductId || raw.manufacturerProductId)
          : null,
        updatedAt: timestampToDate(inv.updatedAt),
        discountEnabled:   inv.discountEnabled ?? false,
        discountType:      inv.discountType ?? "percentage",
        discountPct:       inv.discountPct ?? 0,
        discountFixedAmt:  inv.discountFixedAmt ?? 0,
        discountStartDate: timestampToDate(inv.discountStartDate),
        discountEndDate:   timestampToDate(inv.discountEndDate),
        effectiveDiscountPct: getActiveDiscountPct(inv),
        effectiveDiscountAmt: (inv.discountType === "fixed_amount" && inv.discountEnabled)
          ? (inv.discountFixedAmt ?? 0) : 0,
        bulkDiscountEnabled: inv.bulkDiscountEnabled ?? false,
        bulkDiscountTiers: inv.bulkDiscountTiers ?? [],
        categoryInfo: p.categoryInfo,
        videoUrl: p.videoUrl ?? undefined,
        composition: p.composition ?? undefined,
        customFields: p.customFields ?? undefined,
        nitrogen: p.nitrogen ?? "",
        phosphorus: p.phosphorus ?? "",
        potassium: p.potassium ?? "",
        applicationDesc: p.applicationDesc ?? "",
        dosage: p.dosage ?? "",
        bestForCrops: p.bestForCrops ?? [],
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
 * Returns the unified InventoryRow[] (joined with inventory for stock/discount).
 */
export async function fetchManufacturerCatalogueRows(
  ownerId: string,
  ownerPhone?: string,
): Promise<InventoryRow[]> {
  const products = await fetchProductsByOwner(ownerId, "manufacturer", ownerPhone);
  if (!products.length) return [];

  // Join inventory to get inventoryId (and up-to-date stockQuantity)
  const inventoryMap = await fetchInventoryForManufacturer(ownerId, ownerPhone);

  const rows: InventoryRow[] = products.map((p) => {
    const raw = p as any;
    const inv = inventoryMap.get(p.id);
    const stockQuantity = inv?.stockQuantity ?? (typeof raw.stockQuantity === "number" ? raw.stockQuantity : 0);
    const reorderThreshold = inv?.reorderThreshold ?? 0;
    return {
      productId: p.id,
      inventoryId: inv?.id ?? "",
      productName: p.name,
      category: p.category,
      unit: p.unit,
      description: p.description ?? "",
      image: p.image ?? "",
      images: p.images?.length ? p.images : (p.image ? [p.image] : []),
      variants: Array.isArray(raw.variants) ? raw.variants : [{ unit: p.unit, price: p.price }],
      price: p.price,
      sellingPrice: inv?.sellingPrice ?? p.price,
      stockQuantity,
      reorderThreshold,
      status: deriveStockStatus(stockQuantity, reorderThreshold),
      isActive: p.isActive,
      sellMode: p.sellMode ?? "online_delivery",
      gstApplicable: p.gstApplicable ?? false,
      gstRate: p.gstRate ?? 0,
      assignedByManufacturer: false,
      source: p.source ?? "manufacturer_inventory",
      ownerId: p.ownerId,
      originalProductId: raw.originalProductId ? String(raw.originalProductId) : null,
      updatedAt: timestampToDate(p.updatedAt),
      categoryInfo: p.categoryInfo,
      videoUrl: p.videoUrl ?? undefined,
      composition: p.composition ?? undefined,
      customFields: p.customFields ?? undefined,
      nitrogen: p.nitrogen ?? "",
      phosphorus: p.phosphorus ?? "",
      potassium: p.potassium ?? "",
      applicationDesc: p.applicationDesc ?? "",
      dosage: p.dosage ?? "",
      bestForCrops: p.bestForCrops ?? [],
      discountEnabled:   inv?.discountEnabled ?? false,
      discountType:      inv?.discountType ?? "percentage",
      discountPct:       inv?.discountPct ?? 0,
      discountFixedAmt:  inv?.discountFixedAmt ?? 0,
      discountStartDate: timestampToDate(inv?.discountStartDate),
      discountEndDate:   timestampToDate(inv?.discountEndDate),
      effectiveDiscountPct: inv ? getActiveDiscountPct(inv) : 0,
      effectiveDiscountAmt: (inv?.discountType === "fixed_amount" && inv?.discountEnabled)
        ? (inv?.discountFixedAmt ?? 0) : 0,
      bulkDiscountEnabled: inv?.bulkDiscountEnabled ?? false,
      bulkDiscountTiers: inv?.bulkDiscountTiers ?? [],
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
  /** Category-specific structured info (new schema). */
  categoryInfo?: Record<string, string | string[]>;
  /** Free-form additional fields entered by the seller. */
  customFields?: { title: string; value: string }[];
  /** GST configuration for this product. */
  gstApplicable?: boolean;
  gstRate?: 0 | 5 | 12 | 18 | 28;
  /** @deprecated Legacy fertilizer flat fields. */
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

    categoryInfo: input.categoryInfo ?? null,
    customFields: input.customFields?.length ? input.customFields : null,
    // GST fields
    gstApplicable: input.gstApplicable ?? false,
    gstRate: input.gstApplicable ? (input.gstRate ?? 0) : 0,
    // Legacy fertilizer flat fields omitted — categoryInfo is the source of truth.
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
        isOnline: sellMode === "online_delivery",
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
  // ── OWNERSHIP AUDIT ──────────────────────────────────────────────────────
  console.log("[updateInventoryRecord] Saving to inventory/" + inventoryId, {
    stockQuantity: patch.stockQuantity,
    sellingPrice: patch.sellingPrice,
    reorderThreshold: patch.reorderThreshold,
  });
  // ────────────────────────────────────────────────────────────────────────
  const ref = doc(db, "inventory", inventoryId);
  await updateDoc(ref, {
    stockQuantity: patch.stockQuantity,
    sellingPrice: patch.sellingPrice,
    reorderThreshold: patch.reorderThreshold,
    isAvailable: patch.stockQuantity > 0,
    updatedAt: serverTimestamp(),
  });

  // Mirror price/stock into the CANONICAL product's availability[] entry AND keep
  // the retailer's product copy price in sync so fetchMarketplaceProducts always
  // has an up-to-date copy.price to fall back on (fire-and-forget).
  (async () => {
    try {
      const invSnap = await getDoc(doc(db, "inventory", inventoryId));
      if (!invSnap.exists()) return;
      const inv = invSnap.data();
      // For assigned products the inventory doc links to the root via
      // manufacturerProductId. For retailer copies, resolve originalProductId
      // from the product copy doc.
      let rootId = (inv.manufacturerProductId as string | undefined) ?? undefined;
      const copyId = inv.productId as string | undefined;
      if (!rootId && copyId) {
        const copySnap = await getDoc(doc(db, "products", copyId));
        if (copySnap.exists()) {
          const cd = copySnap.data();
          rootId = (cd.manufacturerProductId ?? cd.originalProductId) as string | undefined;
        }
      }

      // Keep the retailer's product copy price field in sync. fetchMarketplaceProducts
      // uses copy.price as a fallback when no sellingPrice has been synced to the
      // canonical product's availability[] yet (e.g. initial assignment state).
      if (copyId) {
        console.log("[updateInventoryRecord] price sync → products/" + copyId, { price: patch.sellingPrice });
        updateDoc(doc(db, "products", copyId), {
          price: patch.sellingPrice,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      if (rootId && rootId !== copyId) {
        console.log("[updateInventoryRecord] availability sync → products/" + rootId + ".availability[]", {
          sellingPrice: patch.sellingPrice,
          stockLevel: patch.stockQuantity > 0 ? "In Stock" : "Out of Stock",
          matchOwnerId: String(inv.ownerId ?? inv.retailerId ?? inv.retailerDocId ?? ""),
          matchPhone: String(inv.retailerPhone ?? inv.ownerPhone ?? ""),
        });
        await syncAvailabilityPriceStock(
          rootId,
          {
            ownerId: String(inv.ownerId ?? inv.retailerId ?? inv.retailerDocId ?? ""),
            phone: String(inv.retailerPhone ?? inv.ownerPhone ?? ""),
          },
          patch.sellingPrice,
          patch.stockQuantity > 0 ? "In Stock" : "Out of Stock",
        );
      }
    } catch (e) {
      console.warn("[updateInventoryRecord] availability sync failed:", e);
    }
  })();

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

export async function updateProductSellMode(
  productId: string,
  sellMode: "online_delivery" | "offline_store_only",
): Promise<void> {
  const isOnline = sellMode === "online_delivery";
  const patch = { sellMode, isOnline, updatedAt: serverTimestamp() };

  console.log("[updateProductSellMode]", { productId, sellMode, isOnline });

  // Update the primary product document
  await updateDoc(doc(db, "products", productId), patch);

  // Cascade to manufacturer-assigned copies: when a manufacturer toggles delivery,
  // their assigned retailer copies must reflect the same state. Retailers cannot
  // toggle assigned products themselves, so this is the only update path.
  const copiesSnap = await getDocs(
    query(
      collection(db, "products"),
      where("manufacturerProductId", "==", productId),
      where("source", "==", "manufacturer_assigned"),
    ),
  );
  if (copiesSnap.docs.length > 0) {
    console.log("[updateProductSellMode] cascading to", copiesSnap.docs.length, "manufacturer_assigned copies");
    const batch = writeBatch(db);
    copiesSnap.docs.forEach((d) => batch.update(d.ref, patch));
    await batch.commit();
  }
}

// ─── Product lifecycle operations ─────────────────────────────────────────────

/**
 * Toggles isActive for a manufacturer-assigned product without touching seat listings.
 * Retailers don't own subscriptions for assigned products, so the normal
 * activate/deactivate seat-check flow must be bypassed.
 */
export async function toggleAssignedProductActive(
  productId: string,
  inventoryId: string | undefined,
  isActive: boolean,
): Promise<void> {
  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, "products", productId), { isActive, updatedAt: now });
  if (inventoryId) {
    batch.update(doc(db, "inventory", inventoryId), { isAvailable: isActive, updatedAt: now });
  }
  await batch.commit();
}

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
  // Validate base discount
  if (patch.discountType === "percentage" && (patch.discountPct < 0 || patch.discountPct > 99)) {
    throw new Error("Discount percentage must be between 0 and 99.");
  }
  if (patch.discountType === "fixed_amount" && patch.discountFixedAmt < 0) {
    throw new Error("Fixed discount amount cannot be negative.");
  }
  if (
    patch.discountStartDate &&
    patch.discountEndDate &&
    patch.discountEndDate <= patch.discountStartDate
  ) {
    throw new Error("End date must be after start date.");
  }

  // Validate bulk tiers
  if (patch.bulkDiscountEnabled && patch.bulkDiscountTiers.length > 0) {
    const sortedTiers = [...patch.bulkDiscountTiers].sort((a, b) => a.minQty - b.minQty);
    for (const tier of sortedTiers) {
      if (tier.minQty < 1) throw new Error("Bulk tier minimum quantity must be at least 1.");
      if (tier.discountPct <= 0 || tier.discountPct > 99) {
        throw new Error("Bulk tier discount must be between 1% and 99%.");
      }
    }
    // No overlapping (duplicate minQty values)
    const qtys = sortedTiers.map(t => t.minQty);
    if (new Set(qtys).size !== qtys.length) {
      throw new Error("Bulk discount tiers cannot have duplicate minimum quantities.");
    }
  }

  const startTs = patch.discountStartDate ? Timestamp.fromDate(patch.discountStartDate) : null;
  const endTs   = patch.discountEndDate   ? Timestamp.fromDate(patch.discountEndDate)   : null;

  const effectivePct = getActiveDiscountPct({
    discountEnabled:   patch.discountEnabled,
    discountType:      patch.discountType,
    discountPct:       patch.discountPct,
    discountStartDate: startTs,
    discountEndDate:   endTs,
  });

  const now = serverTimestamp();
  const batch = writeBatch(db);

  // Sanitize bulk tiers for Firestore (plain objects only)
  const sanitizedTiers = patch.bulkDiscountEnabled
    ? patch.bulkDiscountTiers.map(t => ({ minQty: t.minQty, discountPct: t.discountPct }))
    : [];

  batch.update(doc(db, "inventory", inventoryId), {
    discountEnabled:       patch.discountEnabled,
    discountType:          patch.discountType,
    discountPct:           patch.discountType === "percentage" ? patch.discountPct : 0,
    discountFixedAmt:      patch.discountType === "fixed_amount" ? patch.discountFixedAmt : 0,
    discountStartDate:     startTs,
    discountEndDate:       endTs,
    bulkDiscountEnabled:   patch.bulkDiscountEnabled,
    bulkDiscountTiers:     sanitizedTiers,
    updatedAt: now,
  });

  batch.update(doc(db, "products", productId), {
    effectiveDiscountPct: effectivePct,
    updatedAt: now,
  });

  await batch.commit();

  // Sync discountPct into the availability[] entry on the root product (fire-and-forget).
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
 * Updates the matching seller's `sellingPrice`/`stockLevel` in a canonical
 * product's `availability[]` array. Keeps the marketplace product page in sync
 * when a retailer changes price/stock on their own copy. Matches by
 * storeId/storePhone. Best-effort.
 */
async function syncAvailabilityPriceStock(
  rootProductId: string,
  match: { ownerId: string; phone: string },
  sellingPrice: number,
  stockLevel: string,
): Promise<void> {
  const rootRef = doc(db, "products", rootProductId);
  const snap = await getDoc(rootRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const availability = Array.isArray(data.availability)
    ? [...(data.availability as Record<string, unknown>[])]
    : [];
  if (!availability.length) return;

  let changed = false;
  const updated = availability.map((entry) => {
    const storeId = String(entry.storeId ?? "");
    const storePhone = String(entry.storePhone ?? "");
    const matches =
      (match.ownerId && (storeId === match.ownerId || storePhone === match.ownerId)) ||
      (match.phone && (storePhone === match.phone || storeId === match.phone));
    if (!matches) return entry;
    changed = true;
    return { ...entry, sellingPrice, stockLevel };
  });

  if (changed) await updateDoc(rootRef, { availability: updated });
}

/**
 * Finds all active seller copies of a product (via originalProductId) and
 * updates maxDiscountPct on the root doc with the highest active discount.
 */
async function recomputeMaxDiscount(rootProductId: string): Promise<void> {
  // Query both link fields: admin_assigned copies use originalProductId,
  // manufacturer_assigned copies use manufacturerProductId.
  const [rootSnap, byOriginalSnap, byMfgSnap] = await Promise.all([
    getDoc(doc(db, "products", rootProductId)),
    getDocs(
      query(
        collection(db, "products"),
        where("originalProductId", "==", rootProductId),
        where("isActive", "==", true),
      ),
    ),
    getDocs(
      query(
        collection(db, "products"),
        where("manufacturerProductId", "==", rootProductId),
        where("isActive", "==", true),
      ),
    ),
  ]);

  const pcts: number[] = [];
  if (rootSnap.exists()) {
    const d = rootSnap.data() as Record<string, unknown>;
    if (d.isActive !== false) pcts.push(toNum(d.effectiveDiscountPct, 0));
  }
  const allCopies = [...byOriginalSnap.docs, ...byMfgSnap.docs];
  allCopies.forEach((d) =>
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
  // First look for a seat listing owned by this user (own products).
  const allListings = await fetchSeatListingsForOwner(ownerId);
  let listing = allListings.find(
    (l) => l.productId === productId && l.status === "active",
  );

  // For manufacturer-assigned products the seat listing is owned by the
  // manufacturer, not the retailer. If we found nothing above, check whether
  // this product is a manufacturer-assigned copy and, if so, locate the
  // listing under the manufacturer's ownerId so we can release it.
  if (!listing) {
    try {
      const productSnap = await getDoc(doc(db, "products", productId));
      if (productSnap.exists()) {
        const pData = productSnap.data() as Record<string, unknown>;
        const mfgId = pData.source === "manufacturer_assigned"
          ? String(pData.manufacturerId ?? "")
          : "";
        if (mfgId) {
          const mfgListings = await fetchSeatListingsForOwner(mfgId);
          listing = mfgListings.find(
            (l) => l.productId === productId && l.status === "active",
          );
        }
      }
    } catch { /* non-critical; seat release is best-effort */ }
  }
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

// ─── Admin discount management ────────────────────────────────────────────────

export type AdminDiscountRow = {
  inventoryId: string;
  productId: string;
  productName: string;
  ownerPhone: string;
  ownerType: string;
  sellingPrice: number;
  discountEnabled: boolean;
  discountType: "percentage" | "fixed_amount";
  discountPct: number;
  discountFixedAmt: number;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
  effectiveDiscountPct: number;
  bulkDiscountEnabled: boolean;
  bulkDiscountTiers: BulkDiscountTier[];
  updatedAt: Date | null;
};

/**
 * Fetches all inventory docs that have a discount configured.
 * Admin-only — requires isAdmin() read permission on inventory collection.
 */
export async function fetchAllDiscounts(): Promise<AdminDiscountRow[]> {
  const snap = await getDocs(
    query(collection(db, "inventory"), where("discountPct", ">", 0), orderBy("discountPct", "desc")),
  );
  if (snap.empty) return [];

  const productIds = Array.from(new Set(snap.docs.map((d) => String(d.data().productId ?? "")))).filter(Boolean);
  const productNameMap = await fetchProductNames(productIds);

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const inv = mapInventory(d.id, data);
    return {
      inventoryId: d.id,
      productId: inv.productId,
      productName: productNameMap.get(inv.productId) ?? "—",
      ownerPhone: String(data.ownerPhone ?? data.retailerPhone ?? data.manufacturerPhone ?? "—"),
      ownerType: String(data.ownerType ?? "retailer"),
      sellingPrice: inv.sellingPrice,
      discountEnabled: inv.discountEnabled ?? false,
      discountType: inv.discountType ?? "percentage",
      discountPct: inv.discountPct ?? 0,
      discountFixedAmt: inv.discountFixedAmt ?? 0,
      discountStartDate: timestampToDate(inv.discountStartDate),
      discountEndDate: timestampToDate(inv.discountEndDate),
      effectiveDiscountPct: getActiveDiscountPct(inv),
      bulkDiscountEnabled: inv.bulkDiscountEnabled ?? false,
      bulkDiscountTiers: inv.bulkDiscountTiers ?? [],
      updatedAt: timestampToDate(inv.updatedAt),
    };
  });
}
