import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * "N people bought this in the last …" for a product — precomputed every
 * 6 hours by the rebuildProductBuyStats function (functions/src/stats/
 * product-buy-stats.ts), so the product page reads one small doc and never
 * touches orders.
 */
export type BuyStats = {
  show: { count: number; label: string; days: number } | null;
  /** Recent buyers as an initial + colour index — no names or photos. */
  recent: { i: string; c: number }[];
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<BuyStats | null> }>();

function parse(d: Record<string, unknown> | undefined): BuyStats | null {
  const show = d?.show as BuyStats["show"] | undefined;
  if (!show || typeof show.count !== "number" || !show.label || !show.days) return null;
  const recent = Array.isArray(d?.recent)
    ? (d!.recent as { i?: unknown; c?: unknown }[])
        .slice(0, 4)
        .map((r) => ({ i: typeof r.i === "string" ? r.i : "", c: typeof r.c === "number" ? r.c : 0 }))
    : [];
  return { show, recent };
}

/** Cached per product for 10 minutes: going back and forth between products costs nothing. */
export function fetchBuyStats(productId: string): Promise<BuyStats | null> {
  const hit = cache.get(productId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = getDoc(doc(db, "productBuyStats", productId))
    .then((snap) => parse(snap.data()))
    .catch(() => null);
  cache.set(productId, { at: Date.now(), value });
  return value;
}
