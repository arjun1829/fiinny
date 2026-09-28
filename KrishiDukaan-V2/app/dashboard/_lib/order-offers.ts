import { collection, getDocs, type Timestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";

/**
 * Reassignment offers for the signed-in seller — orders another seller
 * rejected, offered to this one for 24h (app/lib/order-reassignment.ts).
 *
 * Stored at sellerOffers/{10-digit phone}/offers/{orderId}: the seller is in
 * the path so firestore.rules can prove a seller only ever lists their own.
 */

export interface OrderOffer {
  orderId: string;
  status: "open" | "accepted" | "taken" | "declined" | "expired";
  items: { name: string; qty: number; variantLabel: string; price: number }[];
  itemSummary: string;
  orderValue: number;
  /** What this seller would net after commission and gateway fees. */
  sellerEarning: number | null;
  deliveryCity: string;
  deliveryPincode: string;
  expiresAt: Date | null;
}

export function sellerOfferKey(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "").slice(-10);
}

/** Offers this seller can still act on: open and not yet past the window. */
export async function fetchOpenOffers(phone: string): Promise<OrderOffer[]> {
  const key = sellerOfferKey(phone);
  if (key.length !== 10) return [];
  const snap = await getDocs(collection(db, "sellerOffers", key, "offers"));
  const now = Date.now();
  return snap.docs
    .map((d) => {
      const r = d.data() as Record<string, unknown>;
      const exp = (r.expiresAt as Timestamp | undefined)?.toDate?.() ?? null;
      return {
        orderId: d.id,
        status: (r.status as OrderOffer["status"]) ?? "open",
        items: Array.isArray(r.items) ? (r.items as OrderOffer["items"]) : [],
        itemSummary: String(r.itemSummary ?? ""),
        orderValue: Number(r.orderValue ?? 0),
        sellerEarning: typeof r.sellerEarning === "number" ? r.sellerEarning : null,
        deliveryCity: String(r.deliveryCity ?? ""),
        deliveryPincode: String(r.deliveryPincode ?? ""),
        expiresAt: exp,
      };
    })
    .filter((o) => o.status === "open" && (!o.expiresAt || o.expiresAt.getTime() > now))
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0));
}

/** Accept or decline through the server — first accept wins there, inside a
 *  transaction; the client never writes the order or the offer itself. */
export async function respondToOffer(
  orderId: string,
  action: "accept" | "decline",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/orders/reassignment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify({ orderId, action }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: json.error ?? "Could not update the request." };
  return { ok: true };
}
