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
}

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";

/** Joined row for the retailer inventory table. */
export interface InventoryRow {
  inventoryId: string;
  productId: string;
  productName: string;
  category: string;
  unit: string;
  stockQuantity: number;
  sellingPrice: number;
  reorderThreshold: number;
  status: StockStatus;
  updatedAt: Date | null;
  /** 'retailer_inventory' | 'manufacturer_assigned' */
  source?: string;
}

/** Row for the manufacturer's catalogue table (no stock/inventory data). */
export interface ManufacturerProductRow {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  price: number;
  source: string;
  isActive: boolean;
  updatedAt: Date | null;
}

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
