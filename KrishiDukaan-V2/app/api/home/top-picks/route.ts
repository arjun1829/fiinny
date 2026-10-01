import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import {
  buildRatingAgg,
  mapMarketplaceDoc,
  mergeMarketplaceProducts,
} from "../../../lib/marketplace-merge";
import type { MarketplaceProduct } from "../../../../types/product";

// Admin SDK needs the Node runtime; the ranking is time-sensitive (discount
// windows), so never cache the response.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/home/top-picks
 *
 * The Home "Top Picks" rail. Merchandising, NOT "trending" — it deliberately
 * ranks by what a shopper cares about at a glance:
 *   1. products with a LIVE discount first,
 *   2. by biggest discount %,
 *   3. newest (createdAt desc) as the fallback for everything without a discount.
 *
 * It is intentionally BOUNDED and store-free: two small `products` queries (a
 * discount-enabled pool + a newest pool) feed the SAME merge the Market grid
 * uses, so the cards are pixel-identical, but Home never pulls the whole
 * `products`/`productReviews` collections or the expensive stores/retailers read
 * (no distance ranking here — that would require the full store list).
 */

const RAIL_SIZE = 10;
// Bounded candidate pools. A discount-enabled equality query surfaces genuine
// offers across the catalogue; a createdAt-ordered query supplies the newest
// fallback. Both capped so a Home load never scans the whole collection.
const DISCOUNT_POOL = 40;
const NEWEST_POOL = 40;
// Firestore `in` supports up to 30 values per query.
const IN_CHUNK = 30;

export async function GET() {
  try {
    const db = getAdminDb();

    // Two independent bounded reads, in parallel. discountEnabled is the
    // reliable "a discount was configured" flag (mapMarketplaceDoc re-checks the
    // date window live, so an expired one still correctly ranks as no-discount).
    const [discSnap, newSnap] = await Promise.all([
      db.collection("products").where("discountEnabled", "==", true).limit(DISCOUNT_POOL).get().catch(() => null),
      db.collection("products").orderBy("createdAt", "desc").limit(NEWEST_POOL).get().catch(() => null),
    ]);

    // Dedup raw docs by id across the two pools, and remember each doc's
    // createdAt so the merged cards can be ranked/tie-broken by recency.
    const rawById = new Map<string, Record<string, any>>();
    const createdAtById = new Map<string, number>();
    for (const snap of [discSnap, newSnap]) {
      for (const doc of snap?.docs ?? []) {
        const data = doc.data();
        rawById.set(doc.id, data);
        const ms = typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : 0;
        createdAtById.set(doc.id, ms);
      }
    }

    // Same pre-merge filter the Market route uses (active only), plus a cheap
    // guard against junk cards (needs a name + a real price). Image is left to
    // the card: legacy docs carry `image`, new-schema ones only `images[]`, so
    // filtering on `image` here would wrongly drop new-schema products.
    const mapped = Array.from(rawById.entries())
      .filter(([, data]) => data.isActive !== false)
      .map(([id, data]) => mapMarketplaceDoc(id, data))
      .filter((p) => p.name.length > 0 && Number.isFinite(p.price) && p.price > 0);

    if (mapped.length === 0) {
      return NextResponse.json({ products: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    // Ratings for exactly the candidate ids (chunked `in` queries), so the cards
    // show the same star rating Market/Detail do — bounded to the pool, never a
    // full productReviews scan.
    const reviewRows: { catalogId: string; rating: number }[] = [];
    const ids = mapped.map((p) => p.id);
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      if (chunk.length === 0) continue;
      const rSnap = await db.collection("productReviews").where("catalogId", "in", chunk).get().catch(() => null);
      for (const rd of rSnap?.docs ?? []) {
        reviewRows.push({
          catalogId: String(rd.data().catalogId || ""),
          rating: Number(rd.data().rating || 0),
        });
      }
    }
    const ratingAgg = buildRatingAgg(reviewRows);

    // Same dedup-by-name merge the Market grid uses, so discount/price fields are
    // computed identically. (Cross-seller merge is best-effort here since the
    // pools aren't complete name-groups — acceptable for a preview rail, exactly
    // as the mobile home rails do.)
    const merged = mergeMarketplaceProducts(mapped, ratingAgg);

    // Rank by what the CARD actually shows: an offer exists when the cheapest
    // post-discount price is below the plain price — the same derivation
    // HomeView's ribbon uses — so ranking and display can never disagree.
    const scored = merged.map((p) => {
      const base = p.lowestPrice ?? p.price ?? 0;
      const final = p.lowestFinalPrice ?? base;
      const discountPct = base > 0 && final < base ? (1 - final / base) * 100 : 0;
      const createdAt = Math.max(
        0,
        ...(p.mergedProductIds ?? [p.id]).map((id) => createdAtById.get(id) ?? 0),
      );
      return { product: p, discountPct, createdAt };
    });

    scored.sort((a, b) => {
      // 1. live discount first
      const aHas = a.discountPct > 0 ? 1 : 0;
      const bHas = b.discountPct > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      // 2. bigger discount first (only meaningful when both discounted)
      if (b.discountPct !== a.discountPct) return b.discountPct - a.discountPct;
      // 3. newest first
      return b.createdAt - a.createdAt;
    });

    const products: MarketplaceProduct[] = scored.slice(0, RAIL_SIZE).map((s) => s.product);
    return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/home/top-picks] failed:", err);
    return NextResponse.json({ error: "Failed to load top picks" }, { status: 500 });
  }
}
