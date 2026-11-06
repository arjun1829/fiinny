import { NextResponse } from "next/server";
import { fetchBrandRetailers } from "../../../lib/brand-retailers";

// Reads the lite (HTTP REST) Firestore client and depends on the requested
// manufacturer, so it is always dynamic. Node runtime for the firebase SDK.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/brand/retailers?phone=+919876543210&cursor=<lastId>&limit=20
 *
 * Returns ONE bounded page of the active retailer network for a brand page's
 * "Where to Find Us" panel. Split out of the brand page's server render so the
 * product catalogue paints immediately — retailers load only when the visitor
 * opens the panel, and only a page at a time as they scroll ("Show more"). A
 * visitor who never opens it, or only views the first page, never reads the
 * whole subcollection. Public data, same access path as /brand/[slug].
 *
 * Response: { retailers: BrandRetailerSummary[], nextCursor: string | null }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") ?? "").trim();
  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const cursor = searchParams.get("cursor") || null;
  const limitRaw = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  try {
    const { retailers, nextCursor } = await fetchBrandRetailers(phone, { cursor, limit });
    return NextResponse.json(
      { retailers, nextCursor },
      // Brand networks change rarely; let the CDN serve repeat opens briefly.
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch (e) {
    console.error("[GET /api/brand/retailers] failed:", e);
    return NextResponse.json({ error: "Failed to load retailers" }, { status: 500 });
  }
}
