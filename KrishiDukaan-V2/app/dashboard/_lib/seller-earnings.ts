/**
 * Seller earnings — what a seller is owed, what is still on hold, and what has
 * already been paid out.
 *
 * Derived from the seller's own `orders` documents rather than a separate
 * ledger, so it can never drift from the orders the seller already sees. Once
 * Razorpay Route transfers go live, an order's recorded transfer takes
 * precedence over the derived state (see `payoutStateFor`).
 */

/** Days after an order is marked delivered before its money is released.
 *
 * Matches the refund window the support FAQ already promises customers
 * ("5-7 business days"): releasing sooner would push money to a seller before
 * the customer's own refund window has closed, and Route transfers must be
 * reversed to claw that back. */
export const PAYOUT_HOLD_DAYS = 7;

/** Default KrishiDukan commission applied to NEW orders.
 *
 *  Still 0: no order-creation path charges a commission, and /sell publicly
 *  promises "0% commission, always". Changing this number alone does NOT start
 *  charging sellers — nothing reads it at checkout — and it must not be raised
 *  without also updating that public copy and the seller terms.
 *
 *  Individual orders may still carry a `payment.platformFee` set by an admin
 *  (see the payouts flow); that stored per-order value is what is actually
 *  deducted, so a one-off charge is always visible on the order itself rather
 *  than implied by a global rate. */
export const PLATFORM_COMMISSION_RATE = 0;

export type PayoutState =
  /** Order not delivered yet — nothing is owed until it is. */
  | "awaiting_delivery"
  /** Delivered, inside the hold window. */
  | "on_hold"
  /** Hold elapsed — due to be transferred. */
  | "due"
  /** Razorpay transfer created for this order. */
  | "transferred"
  /** Order cancelled/rejected — never payable. */
  | "not_payable";

export type OrderLike = {
  id: string;
  status?: string;
  /** Mobile writes `total`; web writes `grandTotal`. Same meaning, and both
   *  appear in production, so both must be read. */
  total?: number;
  grandTotal?: number;
  subtotal?: number;
  deliveryCharge?: number;
  totalGst?: number;
  createdAt?: unknown;
  statusHistory?: { status?: string; at?: string }[];
  payment?: {
    gatewayFee?: number;
    gatewayTax?: number;
    /** KrishiDukan's own cut on this order, in rupees. Stored PER ORDER rather
     *  than derived from a rate, so historical payouts keep the fee that was
     *  actually applied even if the rate later changes. */
    platformFee?: number;
    razorpayPaymentId?: string;
    /** Set once a Route transfer exists for this order. */
    transferId?: string;
    transferredAt?: string;
    /** What a payout transfer actually sent for this order (rupees). */
    transferredNet?: number;
    /** Rupees already refunded to the customer for this order. A PARTIAL
     *  refund leaves the order's status unchanged, so without subtracting
     *  this the seller would be paid the full original amount for goods that
     *  were partly refunded — the platform absorbing the difference. */
    refundedAmount?: number;
    refundId?: string;
  };
  /** Razorpay's view of this order's transfer (functions/src/payouts/payout-status.ts). */
  payout?: OrderPayout;
};

/** One order's transfer as Razorpay last reported it. */
export type OrderPayout = {
  /** on_hold | scheduled | processing | settled | failed | reversed | not_routed */
  state?: string;
  via?: "route" | "balance";
  transferId?: string | null;
  /** Rupees with the seller after any reversal. */
  amount?: number;
  /** Release time of a held transfer, ms. */
  onHoldUntil?: number | null;
  settlementId?: string | null;
  settledAt?: unknown;
  /** Razorpay's settlement time (ms) and the bank reference (UTR). */
  settlementAt?: number | null;
  utr?: string | null;
  processedAt?: number | null;
};

export type SellerEarningsRow = {
  orderId: string;
  gross: number;
  gatewayFee: number;
  /** KrishiDukan's cut on this order. 0 for every order unless an admin set one. */
  platformFee: number;
  net: number;
  state: PayoutState;
  deliveredAt: Date | null;
  releaseOn: Date | null;
  /** Razorpay's transfer for this order, when there is one. */
  payout: OrderPayout | null;
  /** The order itself, for its payment timeline. */
  order: OrderLike;
};

export type SellerEarningsSummary = {
  /** Delivered, hold elapsed, not yet transferred — the headline "ready" number. */
  due: number;
  /** Delivered but still inside the hold window. */
  onHold: number;
  /** Orders placed but not yet delivered. */
  awaitingDelivery: number;
  /** Already transferred out. */
  paidOut: number;
  /** Of paidOut, what Razorpay has settled to the seller's bank. */
  settled: number;
  /** Gateway fees deducted across all counted orders, for transparency. */
  gatewayFees: number;
  /** KrishiDukan commission deducted across all counted orders. */
  platformFees: number;
  /** Earliest date on which any on-hold money becomes due. */
  nextReleaseOn: Date | null;
  rows: SellerEarningsRow[];
};

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Firestore Timestamp
  const ts = v as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** The seller's share of an order, BEFORE refunds. Mobile and web disagree on
 *  the field name. */
export function grossFor(order: OrderLike): number {
  const value = order.total ?? order.grandTotal;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Fall back to the parts when neither total field is present.
  return (
    (order.subtotal ?? 0) + (order.deliveryCharge ?? 0) + (order.totalGst ?? 0)
  );
}

/** What the seller is actually owed: their share less anything refunded to the
 *  customer. A fully refunded order is caught earlier by its 'refunded'
 *  status; this handles the partial case, which leaves the status untouched. */
export function payableGrossFor(order: OrderLike): number {
  const refunded = order.payment?.refundedAmount ?? 0;
  return Math.max(0, grossFor(order) - refunded);
}

/** Fees deducted before the seller is paid. The gateway fee is only known
 *  once /api/payment/fee has fetched it from Razorpay; unknown is treated as 0
 *  rather than guessing a rate, so the figure is never a fabricated deduction. */
export function feesFor(order: OrderLike): { gatewayFee: number; platformFee: number } {
  return {
    gatewayFee: (order.payment?.gatewayFee ?? 0) + (order.payment?.gatewayTax ?? 0),
    platformFee: order.payment?.platformFee ?? 0,
  };
}

/** What actually reaches the seller for this one order. This is the amount a
 *  Route payout transfers, and therefore the amount a refund has to reverse —
 *  exported so the payout run and the reversal cannot drift apart. */
export function netFor(order: OrderLike): number {
  // Once a payout transfer has paid the order, what it sent is the answer.
  const sent = order.payment?.transferredNet;
  if (order.payment?.transferId && typeof sent === "number" && sent > 0) return sent;
  const { gatewayFee, platformFee } = feesFor(order);
  return Math.max(0, payableGrossFor(order) - gatewayFee - platformFee);
}

/** When the order was marked delivered, from its own status history. */
export function deliveredAtFor(order: OrderLike): Date | null {
  if (!Array.isArray(order.statusHistory)) return null;
  // Last delivered entry wins — an order re-marked delivered after a
  // correction should hold from the corrected date, not the first attempt.
  for (let i = order.statusHistory.length - 1; i >= 0; i -= 1) {
    const entry = order.statusHistory[i];
    if (entry?.status === "delivered") return toDate(entry.at);
  }
  return null;
}

export function payoutStateFor(order: OrderLike, now = new Date()): {
  state: PayoutState;
  deliveredAt: Date | null;
  releaseOn: Date | null;
} {
  // A recorded transfer is authoritative — it means money actually moved,
  // regardless of what the derived rules would say.
  if (order.payment?.transferId) {
    return { state: "transferred", deliveredAt: deliveredAtFor(order), releaseOn: null };
  }
  // So is a Route transfer Razorpay has released or settled.
  const payout = order.payout?.state;
  if (payout === "processing" || payout === "settled") {
    return { state: "transferred", deliveredAt: deliveredAtFor(order), releaseOn: null };
  }

  const status = (order.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "rejected" || status === "refunded") {
    return { state: "not_payable", deliveredAt: null, releaseOn: null };
  }

  const deliveredAt = deliveredAtFor(order);
  // Trust the explicit status even if statusHistory is missing the entry —
  // web seeds statusHistory but older orders may predate it.
  const isDelivered = status === "delivered" || deliveredAt !== null;
  if (!isDelivered) {
    return { state: "awaiting_delivery", deliveredAt: null, releaseOn: null };
  }

  // No delivered timestamp to hold from: treat as due rather than trapping the
  // money in a hold that can never elapse.
  if (!deliveredAt) {
    return { state: "due", deliveredAt: null, releaseOn: null };
  }

  // A Route transfer set to release (24h after delivery) has its own time.
  const scheduled = payout === "scheduled" ? Number(order.payout?.onHoldUntil ?? 0) : 0;
  const releaseOn = scheduled > 0 ? new Date(scheduled) : new Date(deliveredAt.getTime());
  if (!(scheduled > 0)) releaseOn.setDate(releaseOn.getDate() + PAYOUT_HOLD_DAYS);

  return {
    state: releaseOn.getTime() <= now.getTime() ? "due" : "on_hold",
    deliveredAt,
    releaseOn,
  };
}

export function computeSellerEarnings(
  orders: OrderLike[],
  now = new Date(),
): SellerEarningsSummary {
  const rows: SellerEarningsRow[] = [];
  let due = 0;
  let onHold = 0;
  let awaitingDelivery = 0;
  let paidOut = 0;
  let settled = 0;
  let gatewayFees = 0;
  let platformFees = 0;
  let nextReleaseOn: Date | null = null;

  for (const order of orders) {
    const { state, deliveredAt, releaseOn } = payoutStateFor(order, now);
    if (state === "not_payable") continue;

    const gross = payableGrossFor(order);
    // Deducted here as well as displayed: if "You receive" did not subtract it,
    // the seller would be shown a figure larger than what reaches their bank.
    const { gatewayFee, platformFee } = feesFor(order);
    const net = netFor(order);

    rows.push({ orderId: order.id, gross, gatewayFee, platformFee, net, state, deliveredAt, releaseOn, payout: order.payout ?? null, order });
    gatewayFees += gatewayFee;
    platformFees += platformFee;

    if (state === "due") due += net;
    else if (state === "on_hold") {
      onHold += net;
      if (releaseOn && (!nextReleaseOn || releaseOn < nextReleaseOn)) {
        nextReleaseOn = releaseOn;
      }
    } else if (state === "awaiting_delivery") awaitingDelivery += net;
    else if (state === "transferred") {
      paidOut += net;
      if (order.payout?.state === "settled") settled += net;
    }
  }

  // Newest activity first.
  rows.sort((a, b) => {
    const av = a.deliveredAt?.getTime() ?? 0;
    const bv = b.deliveredAt?.getTime() ?? 0;
    return bv - av;
  });

  return { due, onHold, awaitingDelivery, paidOut, settled, gatewayFees, platformFees, nextReleaseOn, rows };
}

/** One state's totals in sellerStats.earnings (functions/src/stats/seller-stats.ts). */
type EarningsBucket = { net?: number; webNet?: number; platformFee?: number };

/** sellerStats/{key}.earnings, summed over the seller's keys. */
export type EarningsStats = {
  orders?: number;
  gatewayFees?: number;
  platformFees?: number;
  awaiting?: EarningsBucket;
  delivered?: EarningsBucket;
  transferred?: EarningsBucket;
  /** Part of transferred: settled to the seller's bank. */
  settled?: EarningsBucket;
};

/** A delivered, not yet transferred order from a sellerDailyStats hold entry.
 *  releaseAtMs: the Route transfer's own release time, when it has one. */
export type EarningsHold = { net: number; webNet: number; deliveredAtMs: number; releaseAtMs?: number };

/**
 * The summary computeSellerEarnings gives, from the server-kept totals
 * instead of every order: lifetime totals per state, and the holds of the
 * last few days (anything delivered earlier is past its hold and due). Rows
 * are not included; take them from the newest orders.
 */
export function summaryFromStats(
  stats: EarningsStats,
  holds: EarningsHold[],
  now = new Date(),
): Omit<SellerEarningsSummary, "rows"> & { counted: number } {
  const webNet = (b?: EarningsBucket) => Number(b?.webNet ?? 0) || 0;
  let onHold = 0;
  let nextReleaseOn: Date | null = null;
  for (const h of holds) {
    if (!(h.webNet > 0) || !(h.deliveredAtMs > 0)) continue;
    const releaseOn = new Date(
      (h.releaseAtMs ?? 0) > 0 ? h.releaseAtMs! : h.deliveredAtMs + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000,
    );
    if (releaseOn > now) {
      onHold += h.webNet;
      if (!nextReleaseOn || releaseOn < nextReleaseOn) nextReleaseOn = releaseOn;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    due: round(Math.max(0, webNet(stats.delivered) - onHold)),
    onHold: round(onHold),
    awaitingDelivery: round(webNet(stats.awaiting)),
    paidOut: round(webNet(stats.transferred)),
    settled: round(Math.min(webNet(stats.settled), webNet(stats.transferred))),
    gatewayFees: round(Number(stats.gatewayFees ?? 0) || 0),
    platformFees: round(Number(stats.platformFees ?? 0) || 0),
    nextReleaseOn,
    counted: Number(stats.orders ?? 0) || 0,
  };
}
