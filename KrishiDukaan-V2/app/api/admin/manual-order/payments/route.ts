import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { requireSection } from '../../../../lib/admin-auth';
import { findOrdersForRazorpayOrder } from '../../../../lib/order-recovery';
import { findPaymentAttemptByPaymentId } from '../../../../lib/manual-order';

/**
 * GET /api/admin/manual-order/payments
 *   ?paymentId=pay_...                 → single lookup (fetch + annotate)
 *   ?from=<unixSec>&to=<unixSec>&skip= → paged list of CAPTURED payments
 *
 * Lists successful (captured) Razorpay payments so an admin can pick the one to
 * back a manual order, mirroring the paging approach of
 * /api/admin/sync-razorpay-failures. Each payment is annotated with:
 *   - alreadyLinked  : an order already exists for its Razorpay order id
 *   - isSubscription : its order notes mark it a plan purchase (not a cart)
 *   - buyerUserId    : the Razorpay order's notes.userId (payment copies notes)
 * so the UI can grey out / exclude payments that cannot (or should not) be used.
 *
 * Razorpay's List Payments API has no status filter, so this pages through the
 * window and keeps only captured ones, bounded by MAX_PAGES per request.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const PAGE_SIZE = 100;
const MAX_PAGES = 5; // up to 500 scanned per call; keeps inside a request timeout

type AnnotatedPayment = {
  id: string;
  razorpayOrderId: string | null;
  amount: number; // rupees
  amountPaise: number;
  status: string;
  method: string | null;
  contact: string | null;
  email: string | null;
  createdAt: number | null;
  buyerUserId: string | null;
  isSubscription: boolean;
  alreadyLinked: boolean;
  linkedOrderIds: string[];
  note: string | null;
  /** True when this row came from the internal ledger because Razorpay could not
   *  see the payment from this environment. */
  fromInternal?: boolean;
};

function isSubscriptionNotes(notes: Record<string, unknown> | null | undefined): boolean {
  return !!notes && ('seatCount' in notes || 'durationMonths' in notes || 'planId' in notes);
}

async function annotate(p: Record<string, unknown>): Promise<AnnotatedPayment> {
  const razorpayOrderId = p.order_id ? String(p.order_id) : null;
  const notes = (p.notes as Record<string, unknown> | null | undefined) ?? null;
  const linkedOrderIds = razorpayOrderId ? await findOrdersForRazorpayOrder(razorpayOrderId) : [];
  return {
    id: String(p.id ?? ''),
    razorpayOrderId,
    amount: Number(p.amount ?? 0) / 100,
    amountPaise: Number(p.amount ?? 0),
    status: String(p.status ?? ''),
    method: (p.method as string | undefined) ?? null,
    contact: (p.contact as string | undefined) ?? null,
    email: (p.email as string | undefined) ?? null,
    createdAt: (p.created_at as number | undefined) ?? null,
    buyerUserId: notes?.userId ? String(notes.userId) : null,
    isSubscription: isSubscriptionNotes(notes),
    alreadyLinked: linkedOrderIds.length > 0,
    linkedOrderIds,
    note: notes?.note ? String(notes.note) : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = await requireSection(req, 'orders');
  if (caller instanceof NextResponse) return caller;

  const { searchParams } = new URL(req.url);
  const paymentId = (searchParams.get('paymentId') ?? '').trim();

  try {
    // ── Single lookup ─────────────────────────────────────────────────────
    if (paymentId) {
      let payment: Record<string, unknown> | null = null;
      try {
        payment = (await razorpay.payments.fetch(paymentId)) as unknown as Record<string, unknown>;
      } catch {
        payment = null; // fall back to the internal ledger below
      }

      if (payment) {
        // The payment entity sometimes omits notes; fall back to the order's.
        if ((!payment.notes || Object.keys(payment.notes).length === 0) && payment.order_id) {
          try {
            const order = await razorpay.orders.fetch(String(payment.order_id));
            payment.notes = order.notes ?? null;
          } catch {
            /* best effort */
          }
        }
        const annotated = await annotate(payment);
        return NextResponse.json({ payment: annotated });
      }

      // Razorpay could not see it from this environment — surface the internal
      // ledger row (server-written, same source as Admin → Payments) so the admin
      // can still act on it. Returns 404 only when there is no record at all.
      const attempt = await findPaymentAttemptByPaymentId(paymentId);
      if (!attempt) {
        return NextResponse.json(
          { error: `Payment ${paymentId} not found on Razorpay (wrong environment/key?) and no internal record exists.` },
          { status: 404 },
        );
      }
      const a = attempt.data;
      const linkedOrderIds = await findOrdersForRazorpayOrder(attempt.razorpayOrderId);
      const annotated: AnnotatedPayment = {
        id: paymentId,
        razorpayOrderId: attempt.razorpayOrderId,
        amount: a.amount != null ? Number(a.amount) : 0,
        amountPaise: a.amount != null ? Math.round(Number(a.amount) * 100) : 0,
        status: String(a.status ?? '') === 'paid' ? 'captured' : String(a.status ?? ''),
        method: (a.method as string | undefined) ?? null,
        contact: (a.customerPhone ?? a.userPhone ?? a.razorpayContact ?? null) as string | null,
        email: (a.razorpayEmail ?? null) as string | null,
        createdAt: (a.createdAt as { toMillis?(): number } | null)?.toMillis?.() != null
          ? Math.floor((a.createdAt as { toMillis(): number }).toMillis() / 1000)
          : null,
        buyerUserId: a.userId ? String(a.userId) : null,
        isSubscription: a.kind === 'subscription',
        alreadyLinked: linkedOrderIds.length > 0,
        linkedOrderIds,
        note: a.note ? String(a.note) : null,
        fromInternal: true,
      };
      return NextResponse.json({ payment: annotated });
    }

    // ── Paged list of captured payments ───────────────────────────────────
    const from = searchParams.get('from') ? Number(searchParams.get('from')) : undefined;
    const to = searchParams.get('to') ? Number(searchParams.get('to')) : undefined;
    let skip = searchParams.get('skip') ? Number(searchParams.get('skip')) : 0;

    const captured: Record<string, unknown>[] = [];
    let scanned = 0;
    let pages = 0;
    let hasMore = true;

    while (pages < MAX_PAGES) {
      const page = await razorpay.payments.all({
        count: PAGE_SIZE,
        skip,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      const items = (page.items ?? []) as unknown as Record<string, unknown>[];
      pages++;
      scanned += items.length;
      for (const p of items) {
        if (p.status === 'captured') captured.push(p);
      }
      skip += items.length;
      if (items.length < PAGE_SIZE) {
        hasMore = false;
        break;
      }
    }

    const payments = await Promise.all(captured.map(annotate));
    return NextResponse.json({ payments, scanned, nextSkip: skip, hasMore });
  } catch (e) {
    console.error('[manual-order/payments] failed:', e);
    return NextResponse.json({ error: 'Failed to list payments.' }, { status: 500 });
  }
}
