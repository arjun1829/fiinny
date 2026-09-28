export type SellerType = "retailer" | "manufacturer";

/**
 * Canonical order lifecycle, in progression order:
 *   placed → accepted → dispatched → out_for_delivery → delivered
 * with two terminal off-ramps from any pre-dispatch state: `rejected` (the
 * seller or admin declines — see /api/orders/reject) and `cancelled` (the
 * customer backs out themselves — see /api/orders/cancel). Kept as separate
 * values on purpose: a seller reading "rejected" should mean their own
 * decision, not "the customer changed their mind" showing up as if it were
 * one. Both auto-refund online payments via app/lib/order-refund.ts.
 *
 * `dispatched` means the seller has handed the parcel off / packed it out of
 * their stock; `out_for_delivery` means it is physically on its way to the
 * customer's door. They are deliberately distinct because a seller who ships
 * via a transporter can sit in `dispatched` for a day or more, and a customer
 * seeing "out for delivery" for that long assumes something is wrong.
 */
export type OrderStatus =
  | "placed"
  | "accepted"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "rejected"
  | "cancelled"
  /** The original seller rejected; the order is offered to other sellers for
   *  24h before the customer is refunded (app/lib/order-reassignment.ts). */
  | "reassigning";

/** Progression order, shared by every timeline and "can advance to" check. */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "placed",
  "accepted",
  "dispatched",
  "out_for_delivery",
  "delivered",
];

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
  price: number;          // final price after discount (per unit)
  originalPrice?: number; // pre-discount price per unit (undefined when no discount)
  discountPct?: number;   // active discount % (0 or undefined = no discount)
  qty: number;
  sellMode: "online_delivery" | "offline_store_only" | "pending";
  /** Selected package variant (e.g. "500ml", "1kg") */
  variantUnit?: string;
  /** GST — copied from the product at add-to-cart time */
  gstApplicable?: boolean;
  gstRate?: 0 | 5 | 12 | 18 | 28;
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

/**
 * Structured delivery address as written by the Flutter app
 * (mobile/lib/features/cart/screens/checkout_screen.dart).
 */
export type CustomerAddressObject = {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
};

/**
 * `customerAddress` has TWO shapes in Firestore and both are live:
 *   - web checkout (app/page.tsx) writes a pre-joined string
 *   - mobile checkout writes a {name, phone, address, city, pincode} map
 * Anything rendering it must go through formatCustomerAddress(), or React
 * throws "Objects are not valid as a React child" on mobile-placed orders.
 */
export type CustomerAddress = string | CustomerAddressObject;

/** Collapses either address shape into one display string. */
export function formatCustomerAddress(addr: CustomerAddress | undefined | null): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr.trim();
  if (typeof addr !== "object") return String(addr);
  return [addr.address, addr.city, addr.pincode].filter(Boolean).join(", ").trim();
}

export type OrderItem = {
  productId: string;
  name: string;
  price: number;          // final price per unit (after discount)
  originalPrice?: number; // pre-discount price per unit
  discountPct?: number;   // discount % applied
  qty: number;
  lineTotal: number;      // price * qty (discounted, excl. GST)
  /** Selected package size (e.g. "500ml", "1kg") — captured from CartItem.variantUnit */
  variantUnit?: string;
  /** GST per unit — persisted for invoice generation */
  gstApplicable?: boolean;
  gstRate?: 0 | 5 | 12 | 18 | 28;
  gstAmount?: number; // GST per unit = price * gstRate / 100
};

/**
 * Order items also have TWO shapes, because the Flutter checkout
 * (mobile/lib/features/orders/data/order_repository.dart) writes different
 * field names than the web one and computes no lineTotal:
 *
 *   web        mobile
 *   ────────── ──────────
 *   productId  catalogId
 *   qty        quantity
 *   variantUnit variantLabel
 *   lineTotal  (absent — derive price * qty)
 *
 * Reading the web names off a mobile order yields `undefined`, which is where
 * "NaN units" and "₹0.00" line totals come from. Always read items through
 * normalizeOrderItem().
 */
export type RawOrderItem = Partial<OrderItem> & {
  quantity?: number;
  catalogId?: string;
  variantLabel?: string;
};

export function normalizeOrderItem(raw: RawOrderItem): OrderItem {
  const qty = raw.qty ?? raw.quantity ?? 0;
  const price = raw.price ?? 0;
  return {
    ...raw,
    productId: raw.productId ?? raw.catalogId ?? "",
    name: raw.name ?? "",
    price,
    qty,
    variantUnit: raw.variantUnit ?? raw.variantLabel,
    lineTotal: raw.lineTotal ?? price * qty,
  };
}

export function normalizeOrderItems(raw: RawOrderItem[] | undefined | null): OrderItem[] {
  return (raw ?? []).map(normalizeOrderItem);
}

/** Mobile writes `total`; web writes `grandTotal`. Neither is guaranteed. */
export function orderGrandTotal(order: {
  grandTotal?: number; total?: number; subtotal?: number;
  deliveryCharge?: number; totalGst?: number;
}): number {
  return order.grandTotal
    ?? order.total
    ?? (order.subtotal ?? 0) + (order.deliveryCharge ?? 0) + (order.totalGst ?? 0);
}

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type PaymentInfo = {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentStatus;
  amount: number; // in INR
  paidAt?: string; // ISO timestamp

  // ── Payout accounting (rupees) ──────────────────────────────────────────
  /** Razorpay's own charge, fetched from the payment entity after capture. */
  gatewayFee?: number;
  gatewayTax?: number;
  /** KrishiDukan's cut on this order. Stored per order, not derived from a
   *  rate, so a historical payout keeps the fee actually applied to it. */
  platformFee?: number;
  /** Set once money has moved (or a manual payout was recorded). Doubles as the
   *  idempotency guard that stops an order being paid out twice. */
  transferId?: string;
  transferredAt?: string;
  /** 'processing' while a manual bank transfer is in flight, 'paid' once done. */
  payoutStatus?: "processing" | "paid";
  payoutMethod?: string;
  payoutAmount?: number;
  payoutInitiatedAt?: string;
  payoutBankRef?: string;
  payoutNote?: string;
  /** Rupees refunded to the customer on this order. */
  refundedAmount?: number;
  refundId?: string;
};

export type InvoiceMetadata = {
  invoiceNumber: string;
  storagePath: string;
  generatedAt: unknown; // Firestore Timestamp
  version: number;
};

export type OrderDoc = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: CustomerAddress;
  sellerId: string;
  sellerType: SellerType;
  sellerName?: string;
  /** Seller's normalized phone (E164), copied from the cart at order time. */
  sellerPhone?: string;
  items: OrderItem[];
  /** Sum of originalPrice * qty across all items (MRP before discounts) */
  mrpSubtotal?: number;
  /** Sum of price * qty across all items (after discounts, excl. GST) */
  subtotal: number;
  /** Sum of all per-line GST amounts */
  totalGst?: number;
  /** Weight-based delivery charge from seller's delivery settings */
  deliveryCharge?: number;
  /** subtotal + deliveryCharge + totalGst */
  grandTotal?: number;
  /** Same value under the name the Flutter checkout writes. Read via orderGrandTotal(). */
  total?: number;
  /** Estimated total weight of the order in kg (parsed from variant units) */
  totalWeightKg?: number;
  /** Seller's GST number at the time of order (for invoice) */
  sellerGstNumber?: string;
  /** Auto-generated invoice reference, e.g. INV-ORDID1234 */
  invoiceNumber?: string;
  /** Invoice metadata written once after the PDF is uploaded to Firebase Storage */
  invoice?: InvoiceMetadata;
  deliveryMode: "delivery";
  status: OrderStatus;
  statusHistory?: StatusHistoryEntry[];
  payment?: PaymentInfo;
  /**
   * Razorpay Route payout state, written by the releaseTransferOnDelivery
   * function when the order is marked delivered. Absent on orders with no
   * transfer — cash on delivery, orders predating Route, and any seller who has
   * not onboarded a linked account yet.
   */
  routeRelease?: RouteReleaseInfo;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type RouteReleaseInfo = {
  /** Razorpay transfer id this order's payout belongs to. */
  transferId: string;
  /** Transfer amount in paise, as Razorpay reports it. */
  amount?: number;
  /**
   * `scheduled` - a release time is set and Razorpay will settle then.
   * `already_released` - the transfer was no longer on hold when we looked.
   */
  status: "scheduled" | "already_released";
  /** When the money settles to the seller. Delivery + 24h. */
  releaseAt?: unknown;
  scheduledAt?: unknown;
  recordedAt?: unknown;
};
