export type SellerType = "retailer" | "manufacturer";

export type OrderStatus =
  | "placed"
  | "accepted"
  | "out_for_delivery"
  | "delivered"
  | "rejected";

export type StatusHistoryEntry = {
  status: OrderStatus;
  at: string; // ISO 8601 string
};

export type CartItem = {
  productId: string;
  sellerId: string;
  sellerType: SellerType;
  sellerName?: string;
  /** Seller's normalized phone (E164) — used directly for deliverySettings lookup */
  sellerPhone?: string;
  name: string;
  image: string;
  price: number;          // final price after discount
  originalPrice?: number; // pre-discount price (undefined when no discount)
  discountPct?: number;   // active discount % (0 or undefined = no discount)
  qty: number;
  sellMode: "online_delivery" | "offline_store_only" | "pending";
  /** Selected package variant (e.g. "500ml", "1kg") */
  variantUnit?: string;
};

/**
 * Stable identity for a single cart line. The SAME product + seller + sell mode
 * but a DIFFERENT package size (variantUnit) is a DISTINCT cart line, so the
 * variant is part of the key — otherwise quantity / remove / store-assign would
 * collapse every size of a product into one entry.
 *
 * This is the single source of truth for cart-item identity; both the cart UI
 * and the cart-state reducers in page.tsx must use it so they never drift.
 */
export function cartItemKey(
  item: Pick<CartItem, "productId" | "sellerId" | "sellMode" | "variantUnit">,
): string {
  return `${item.productId}_${item.sellerId}_${item.sellMode}_${item.variantUnit ?? ""}`;
}

export type OrderItem = {
  productId: string;
  name: string;
  price: number;          // final price per unit (after discount)
  originalPrice?: number; // pre-discount price per unit
  discountPct?: number;   // discount % applied
  qty: number;
  lineTotal: number;      // price * qty (discounted)
  /** Selected package size (e.g. "500ml", "1kg") — captured from CartItem.variantUnit */
  variantUnit?: string;
};

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type PaymentInfo = {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentStatus;
  amount: number; // in INR
  paidAt?: string; // ISO timestamp
};

export type OrderDoc = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  sellerId: string;
  sellerType: SellerType;
  sellerName?: string;
  items: OrderItem[];
  subtotal: number;
  /** Weight-based delivery charge from seller's delivery settings */
  deliveryCharge?: number;
  /** subtotal + deliveryCharge */
  grandTotal?: number;
  /** Estimated total weight of the order in kg (parsed from variant units) */
  totalWeightKg?: number;
  /** Seller's GST number at the time of order (for invoice) */
  sellerGstNumber?: string;
  /** Auto-generated invoice reference, e.g. INV-ORDID1234 */
  invoiceNumber?: string;
  deliveryMode: "delivery";
  status: OrderStatus;
  statusHistory?: StatusHistoryEntry[];
  payment?: PaymentInfo;
  createdAt?: unknown;
  updatedAt?: unknown;
};
