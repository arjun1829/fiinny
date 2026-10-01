import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { requireAdmin } from "../../../lib/admin-auth";
import { recordFailureFromRazorpay } from "../../../lib/payment-attempts";

/**
 * POST /api/admin/sync-razorpay-failures
 *
 * One-time (and re-runnable) backfill: pulls failed payments straight from
 * Razorpay's own records and writes the ones Admin -> Payments doesn't
 * already have. This is the retroactive half of closing the reporting gap —
 * the webhook (app/api/webhooks/razorpay/route.ts) is the ongoing half.
 *
 * Razorpay's List Payments API has no status filter, so this pages through
 * EVERY payment in the window (captured included) and keeps only the failed
 * ones — bounded per call (MAX_PAGES) so one request can't run indefinitely.
 * Returns `nextSkip`/`hasMore` so the caller (the "Sync from Razorpay" button
 * on Admin -> Payments) can keep calling forward until the whole window is
 * covered, instead of this route trying to do it all in one HTTP round trip.
 *
 * Idempotent: recordFailureFromRazorpay writes by razorpayOrderId with merge,
 * so re-running this (or overlapping windows) never creates duplicates.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const PAGE_SIZE = 100;
const MAX_PAGES = 10; // 1000 payments per call — keeps this inside a normal request timeout

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await requireAdmin(req);
  if (caller instanceof NextResponse) return caller;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      from?: number; // unix seconds
      to?: number;
      skip?: number;
    };
    const from = body.from;
    const to = body.to;
    let skip = body.skip ?? 0;

    let scanned = 0;
    let written = 0;
    let pages = 0;
    let hasMore = true;

    while (pages < MAX_PAGES) {
      const page = await razorpay.payments.all({
        count: PAGE_SIZE,
        skip,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });

      const items = page.items ?? [];
      pages++;
      scanned += items.length;

      for (const p of items as unknown as Record<string, unknown>[]) {
        if (p.status !== "failed") continue;
        const orderId = p.order_id as string | undefined;
        if (!orderId) continue;

        try {
          await recordFailureFromRazorpay(
            {
              id: String(p.id ?? ""),
              order_id: orderId,
              amount: Number(p.amount ?? 0),
              method: (p.method as string | undefined) ?? null,
              contact: (p.contact as string | undefined) ?? null,
              email: (p.email as string | undefined) ?? null,
              error_code: (p.error_code as string | undefined) ?? null,
              error_description: (p.error_description as string | undefined) ?? null,
              error_reason: (p.error_reason as string | undefined) ?? null,
              error_source: (p.error_source as string | undefined) ?? null,
              error_step: (p.error_step as string | undefined) ?? null,
              created_at: p.created_at as number | undefined,
            },
            // Razorpay copies order notes onto the payment at creation, so
            // this needs no separate order fetch per payment — a real saving
            // when backfilling hundreds of rows.
            { id: orderId, notes: (p.notes as Record<string, unknown> | null) ?? null },
            "razorpay_backfill",
          );
          written++;
        } catch {
          // Logged inside recordFailureFromRazorpay; one bad row must not
          // stop the rest of the page from being processed.
        }
      }

      skip += items.length;
      if (items.length < PAGE_SIZE) {
        hasMore = false;
        break;
      }
    }

    return NextResponse.json({ ok: true, scanned, written, nextSkip: skip, hasMore });
  } catch (error) {
    console.error("[sync-razorpay-failures] failed:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
