import { NextRequest, NextResponse } from "next/server";
import { fetchBrandProductsPage } from "../../../lib/brand-products";

export const dynamic = "force-dynamic";

/**
 * GET /api/brand/products?phone=+91…&after=<last doc id>
 * The next page of a brand's own products (and their marketplace cards) for
 * the "Load more" button on /brand/[slug]. Public data, same as the page.
 */
export async function GET(req: NextRequest) {
  const phone = (req.nextUrl.searchParams.get("phone") ?? "").trim();
  const after = (req.nextUrl.searchParams.get("after") ?? "").trim();
  if (!/^\+?\d{10,15}$/.test(phone)) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }
  try {
    const page = await fetchBrandProductsPage(phone.startsWith("+") ? phone : `+${phone}`, after || null);
    return NextResponse.json(page);
  } catch (e) {
    console.error("[api/brand/products]", e);
    return NextResponse.json({ error: "Could not load products" }, { status: 500 });
  }
}
