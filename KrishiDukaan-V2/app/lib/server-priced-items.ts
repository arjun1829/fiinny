import type { CartItem } from "../../types/order";
import { normalizeUnit } from "../utils/weight";

/** One line as priced by /api/payment/create-cart-order (its `items`). */
export type ServerPricedItem = {
  productId: string;
  unitPrice: number;
  variantUnit?: string;
  sellerId?: string;
  sellerPhone?: string | null;
};

const ten = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/**
 * The cart with each line's price set to what the server CHARGED for it, so
 * the order record (item price, line total, MRP/discount) matches the
 * payment. A line priced higher than its old MRP drops the struck price;
 * lines the server didn't return are left as they are.
 */
export function withServerPrices(items: CartItem[], server: ServerPricedItem[] | undefined | null): CartItem[] {
  if (!Array.isArray(server) || server.length === 0) return items;
  const used = new Set<number>();
  return items.map((item) => {
    const idx = server.findIndex(
      (s, i) =>
        !used.has(i) &&
        s.productId === item.productId &&
        normalizeUnit(s.variantUnit) === normalizeUnit(item.variantUnit) &&
        ((ten(s.sellerPhone) && ten(s.sellerPhone) === ten(item.sellerPhone)) ||
          (!!s.sellerId && s.sellerId === item.sellerId)),
    );
    if (idx < 0) return item;
    used.add(idx);
    const price = Number(server[idx].unitPrice);
    if (!(price > 0) || Math.abs(price - item.price) < 0.005) return item;
    const mrp = item.originalPrice && item.originalPrice > price ? item.originalPrice : undefined;
    return {
      ...item,
      price,
      originalPrice: mrp,
      discountPct: mrp ? Math.round((1 - price / mrp) * 100) : 0,
    };
  });
}
