import type { Timestamp } from "firebase/firestore";

/** Document in `products` — `id` is the Firestore document ID. */
export interface ProductDoc {
  id: string;
  name: string;
  category: string;
  description: string;
  image: string;
  unit: string;
  price: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  isActive: boolean;
  variants?: { unit: string; price: number; stock?: number }[];

  /** Ownership — primary query fields */
  ownerId?: string;
  ownerType?: "manufacturer" | "retailer";
  createdBy?: string;
  source?: string;

  /** Set on assigned copies — links back to original manufacturer product */
  manufacturerId?: string;
  manufacturerProductId?: string;
  retailerDocId?: string;

  /** Market display fields */
  retailerId?: string;
  store?: string;
  sellMode?: "online_delivery" | "offline_store_only";
  isOnline?: boolean;

  /** GST fields */
  gstApplicable?: boolean;
  gstRate?: 0 | 5 | 12 | 18 | 28;

  /** Category-specific structured information (new schema). */
  categoryInfo?: Record<string, string | string[]>;
  /** @deprecated Legacy fertilizer flat fields — backward compat only. */
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];
}

/**
 * Document in `inventory` collection.
 * New records are keyed by productId; legacy records may also carry `retailerId`.
 */
export interface InventoryDoc {
  id: string;
  /** Legacy field — present on older retailer inventory records. */
  retailerId?: string;
  productId: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
  isAvailable: boolean;
  updatedAt?: Timestamp | null;
  assignedByManufacturer?: boolean;
  manufacturerProductId?: string;
  retailerDocId?: string;

  // Discount fields
  discountEnabled?:   boolean;
  discountType?:      "percentage" | "fixed_amount";
  discountPct?:       number;        // 0–99 (used when type=percentage)
  discountFixedAmt?:  number;        // rupee amount (used when type=fixed_amount)
  discountStartDate?: Timestamp | null;
  discountEndDate?:   Timestamp | null;
  // Bulk/quantity-based discounts
  bulkDiscountEnabled?: boolean;
  bulkDiscountTiers?:   BulkDiscountTier[];
}

/** One tier in a bulk/quantity-based discount ladder. */
export type BulkDiscountTier = {
  minQty: number;    // minimum quantity to trigger this tier
  discountPct: number; // percentage off at this tier (0–99)
};

export type DiscountUpdateInput = {
  discountEnabled: boolean;
  discountType: "percentage" | "fixed_amount";
  discountPct: number;
  discountFixedAmt: number;       // used when discountType === "fixed_amount"
  discountStartDate: Date | null;
  discountEndDate: Date | null;
  bulkDiscountEnabled: boolean;
  bulkDiscountTiers: BulkDiscountTier[];
};

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";

export type ProductVariant = { unit: string; price: number; stock?: number };

/**
 * Unified inventory row used by BOTH the manufacturer catalogue and the retailer
 * inventory. It is a superset that carries everything the shared InventoryTable
 * and the shared EditProductModal need, regardless of role.
 *
 * Role/source differences are expressed via fields (source, assignedByManufacturer,
 * ownerId), never via separate row shapes.
 */
export interface InventoryRow {
  // ── Identity ──────────────────────────────────────────────────────────────
  productId: string;
  /** Joined inventory doc id. "" when no inventory record exists yet. */
  inventoryId: string;

  // ── Display ───────────────────────────────────────────────────────────────
  productName: string;
  category: string;
  unit: string;
  description: string;
  image: string;
  images: string[];
  variants: ProductVariant[];

  // ── Pricing & stock ───────────────────────────────────────────────────────
  /** Base/list price (manufacturer catalogue price; equals sellingPrice for retailers). */
  price: number;
  /** Effective selling price from the inventory record. */
  sellingPrice: number;
  stockQuantity: number;
  reorderThreshold: number;
  status: StockStatus;

  // ── Delivery mode ─────────────────────────────────────────────────────────
  sellMode: "online_delivery" | "offline_store_only";

  // ── GST ───────────────────────────────────────────────────────────────────
  gstApplicable: boolean;
  gstRate: 0 | 5 | 12 | 18 | 28;

  // ── Lifecycle / ownership ───────────────────────────────────────────────────
  isActive: boolean;
  assignedByManufacturer: boolean;
  /** 'manufacturer_inventory' | 'retailer_inventory' | 'manufacturer_assigned' | ... */
  source: string;
  /** Owner UID (or placeholder retailerDocId for pending assignments). */
  ownerId?: string;
  originalProductId?: string | null;
  updatedAt: Date | null;

  // ── Discount fields ─────────────────────────────────────────────────────────
  discountEnabled: boolean;
  discountType: "percentage" | "fixed_amount";
  discountPct: number;
  discountFixedAmt: number;
  discountStartDate: Date | null;
  discountEndDate: Date | null;
  effectiveDiscountPct: number;
  effectiveDiscountAmt: number;  // resolved rupee amount to deduct
  // Bulk discount fields
  bulkDiscountEnabled: boolean;
  bulkDiscountTiers: BulkDiscountTier[];

  // ── Category-specific info ────────────────────────────────────────────────────
  /** Structured category info (new schema). */
  categoryInfo?: Record<string, string | string[]>;
  /** @deprecated Legacy fertilizer flat fields. */
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];
}

/**
 * @deprecated Use {@link InventoryRow}. Kept as an alias so existing imports keep
 * working after the manufacturer/retailer inventory unification.
 */
export type ManufacturerProductRow = InventoryRow;

export function deriveStockStatus(
  stockQuantity: number,
  reorderThreshold: number,
): StockStatus {
  if (stockQuantity === 0) return "out_of_stock";
  if (stockQuantity <= reorderThreshold) return "low_stock";
  return "in_stock";
}

export function stockStatusLabel(status: StockStatus): string {
  switch (status) {
    case "out_of_stock":
      return "Out of stock";
    case "low_stock":
      return "Low stock";
    default:
      return "In stock";
  }
}
