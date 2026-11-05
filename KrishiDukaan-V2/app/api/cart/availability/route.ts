import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { checkCartSellArea } from "../../../lib/sell-area-server";
import { sellAreaMessage } from "../../../lib/sell-area";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cart/availability
 * Body: { state: string, items: [{ productId, sellerId?, sellerPhone? }] }
 *
 * Which cart lines can't be delivered to this state — a manufacturer's
 * licence, a retailer's delivery coverage, or a manufacturer's in-store-only
 * lock (lib/sell-area.ts). Web cart and app checkout call it when the
 * delivery state is chosen, so the buyer sees "not available for your
 * address" before paying; checkout enforces the same rules regardless.
 * Read-only and reveals nothing private, so no login is needed.
 */

const MAX_ITEMS = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits = new Map<string, { n: number; at: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > RATE_WINDOW_MS) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n += 1;
  return h.n > RATE_MAX;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { state?: unknown; items?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const state = String(body.state ?? "").trim().slice(0, 60);
  const raw = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  const items = raw.slice(0, MAX_ITEMS).map((i) => ({
    productId: String(i?.productId ?? "").slice(0, 128),
    sellerId: String(i?.sellerId ?? "").slice(0, 128),
    sellerPhone: String(i?.sellerPhone ?? "").slice(0, 20),
  })).filter((i) => /^[A-Za-z0-9_-]+$/.test(i.productId));

  if (!state || items.length === 0) return NextResponse.json({ ok: true, items: [] });

  try {
    const results = await checkCartSellArea(getAdminDb(), items, state);
    return NextResponse.json({
      ok: true,
      items: results.map((r) => ({
        productId: r.productId,
        sellerId: r.sellerId,
        available: !r.block,
        ...(r.block
          ? {
              code: r.block.code,
              message: sellAreaMessage(r.block),
              ...("states" in r.block ? { states: r.block.states } : {}),
            }
          : {}),
      })),
    });
  } catch (err) {
    console.error("[cart/availability] failed", err);
    // Checkout still enforces; the cart just can't warn early this time.
    return NextResponse.json({ ok: false, items: [] }, { status: 200 });
  }
}
