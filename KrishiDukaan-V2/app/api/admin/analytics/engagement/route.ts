import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";
import {
  getEngagementReport,
  isGa4Configured,
  Ga4NotConfiguredError,
  ga4DayKey,
  type EngagementReport,
} from "../../../../lib/ga4";

// The GA4 Data API needs a Node runtime (service-account credentials + gRPC),
// and each response is admin-specific, so this route is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/engagement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Authoritative GA4-backed engagement metrics for the Admin Analytics →
 * Engagement tab. Admin-only. GA4 credentials stay server-side; the browser
 * only ever sees the aggregated numbers.
 *
 * Response shape:
 *   { configured: false }                      → GA4 not configured for this env
 *   { configured: true, data: EngagementReport, cachedAt: number }
 *
 * A GA4 API failure returns HTTP 502 with a generic error message (the detailed
 * error is logged server-side only) so the UI can show an "unavailable" state
 * rather than silently rendering zeros.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Simple in-process TTL cache. GA4 reporting data has processing latency (often
// 15 min – a few hours for the current day), so serving a few-minutes-stale
// aggregate is both cheaper and no less accurate. Keyed by the concrete window.
type CacheEntry = { at: number; data: EngagementReport };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;

  if (!isGa4Configured()) {
    // Not an error — a legible "not configured" signal the UI renders as the
    // required message. 200 so the client doesn't treat it as a fetch failure.
    return NextResponse.json({ configured: false });
  }

  const url = new URL(request.url);
  const today = ga4DayKey(new Date());
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? today;

  if (!DAY_RE.test(from) || !DAY_RE.test(to)) {
    return NextResponse.json(
      { error: "Query params 'from' and 'to' must be YYYY-MM-DD dates." },
      { status: 400 },
    );
  }
  if (from > to) {
    return NextResponse.json({ error: "'from' must not be after 'to'." }, { status: 400 });
  }

  const cacheKey = `${from}|${to}`;
  const now = Date.now();
  const hit = CACHE.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ configured: true, data: hit.data, cachedAt: hit.at });
  }

  try {
    const data = await getEngagementReport(from, to);
    CACHE.set(cacheKey, { at: now, data });
    return NextResponse.json({ configured: true, data, cachedAt: now });
  } catch (e) {
    if (e instanceof Ga4NotConfiguredError) {
      return NextResponse.json({ configured: false });
    }
    // Log the real error server-side only; never leak it (may contain project /
    // credential detail) to the client.
    console.error("[analytics/engagement] GA4 runReport failed:", e);
    return NextResponse.json(
      { error: "Analytics is temporarily unavailable. Please try again shortly." },
      { status: 502 },
    );
  }
}
