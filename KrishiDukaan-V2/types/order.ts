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
  name: string;
  image: string;
  price: number;          // final price after discount
  originalPrice?: number; // pre-discount price (undefined when no discount)
  discountPct?: number;   // active discount % (0 or undefined = no discount)
  qty: number;
  sellMode: "online_delivery" | "offline_store_only" | "pending";
};

export type OrderItem = {
  productId: string;
  name: string;
  price: number;          // final price per unit (after discount)
  originalPrice?: number; // pre-discount price per unit
  discountPct?: number;   // discount % applied
  qty: number;
  lineTotal: number;      // price * qty (discounted)
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
  deliveryMode: "delivery";
  status: OrderStatus;
  statusHistory?: StatusHistoryEntry[];
  payment?: PaymentInfo;
  createdAt?: unknown;
  updatedAt?: unknown;
};
