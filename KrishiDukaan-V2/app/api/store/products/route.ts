import { NextRequest, NextResponse } from "next/server";
import { getStoreProductsPage } from "../../../lib/seo/stores-server";
import { fetchCardsForNames } from "../../../lib/brand-products";

export const dynamic = "force-dynamic";

/**
 * GET /api/store/products?phone=+91…&after=<last doc id>
 * The next page of a shop's products (and their marketplace cards, for
 * cross-seller price and discount) for "Load more" on /stores/…/[store].
 * Public data, same as the page.
 */
export async function GET(req: NextRequest) {
  const phone = (req.nextUrl.searchParams.get("phone") ?? "").trim();
  const after = (req.nextUrl.searchParams.get("after") ?? "").trim();
  if (!phone || phone.length > 20) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }
  try {
    const page = await getStoreProductsPage({ phone, id: phone }, after || null);
    const marketProducts = await fetchCardsForNames(page.products.map((p) => p.name));
    return NextResponse.json({ ...page, marketProducts });
  } catch (e) {
    console.error("[api/store/products]", e);
    return NextResponse.json({ error: "Could not load products" }, { status: 500 });
  }
}
