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
  price: number;
  qty: number;
  sellMode: "online_delivery" | "offline_store_only" | "pending";
};

export type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  lineTotal: number;
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
  createdAt?: unknown;
  updatedAt?: unknown;
};
