import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { CARDS_COLLECTION, cardToProduct } from "../../../lib/marketplace-cards";
import type { MarketplaceProduct } from "../../../../types/product";

// Admin SDK needs the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/home/top-picks
 *
 * The Home "Top Picks" rail. Merchandising, NOT "trending" — it deliberately
 * ranks by what a shopper cares about at a glance:
 *   1. products with a LIVE discount first,
 *   2. by biggest discount %,
 *   3. newest as the fallback for everything without a discount.
 *
 * Reads at most 2 × RAIL_SIZE marketplace cards. Each card's liveDiscountPct is
 * the same "lowest final price below lowest price" derivation HomeView's ribbon
 * uses, and is recomputed when a discount window opens or closes, so the
 * response can be cached briefly.
 */

const RAIL_SIZE = 10;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET() {
  try {
    const cards = getAdminDb().collection(CARDS_COLLECTION);
    const [discounted, newest] = await Promise.all([
      cards.where("liveDiscountPct", ">", 0).orderBy("liveDiscountPct", "desc").limit(RAIL_SIZE).get(),
      cards.orderBy("createdAtMs", "desc").limit(RAIL_SIZE).get(),
    ]);

    const seen = new Set<string>();
    const ranked = [
      ...discounted.docs.sort(
        (a, b) =>
          Number(b.get("liveDiscountPct") ?? 0) - Number(a.get("liveDiscountPct") ?? 0) ||
          Number(b.get("createdAtMs") ?? 0) - Number(a.get("createdAtMs") ?? 0),
      ),
      ...newest.docs,
    ].filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      // Same junk guard as before: a card needs a real price.
      return Number(d.get("price")) > 0;
    });

    const products: MarketplaceProduct[] = ranked.slice(0, RAIL_SIZE).map((d) => cardToProduct(d.data()));
    return NextResponse.json({ products }, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("[api/home/top-picks] failed:", err);
    return NextResponse.json({ error: "Failed to load top picks" }, { status: 500 });
  }
}
