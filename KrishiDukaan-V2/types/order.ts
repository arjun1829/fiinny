export type SellerType = "retailer" | "manufacturer";

export type OrderStatus =
  | "placed"
  | "accepted"
  | "out_for_delivery"
  | "delivered"
  | "rejected";

export type CartItem = {
  productId: string;
  sellerId: string;
  sellerType: SellerType;
  name: string;
  image: string;
  price: number;
  qty: number;
  sellMode: "online_delivery" | "offline_store_only";
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
  items: OrderItem[];
  subtotal: number;
  deliveryMode: "delivery";
  status: OrderStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};

