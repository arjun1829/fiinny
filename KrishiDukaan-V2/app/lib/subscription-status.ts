/**
 * What a seller's subscriptions add up to RIGHT NOW. One rule for every
 * screen that shows seats: a subscription counts only while its status is
 * active, it has started, and its expiry date is still in the future — the
 * same test as the seller dashboard (isSubscriptionActive in
 * app/dashboard/_lib/subscriptions-firestore.ts).
 *
 * Never read users.totalSeats / users.isPaid for this: they are snapshots
 * written when a plan is bought or expires, and lag (or, for older data,
 * never dropped expired seats at all).
 */

type TimestampLike = { toMillis?: () => number; toDate?: () => Date } | Date | string | number | null | undefined;

export type SubscriptionLike = {
  subscriptionStatus?: string;
  seatsPurchased?: number | string;
  startDate?: TimestampLike;
  expiryDate?: TimestampLike;
};

export type OwnerSubscriptionSummary = {
  /** active = a plan is running · scheduled = one starts later · expired = had plans, none running · none = never had one */
  state: "active" | "scheduled" | "expired" | "none";
  /** Seats across every running plan. */
  seats: number;
  /** How many plans are running. */
  running: number;
  /** When the last running plan ends (active), or when the next one starts (scheduled). */
  until: Date | null;
};

export function millisOfTs(v: TimestampLike): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  return 0;
}

export function isRunning(sub: SubscriptionLike, now = Date.now()): boolean {
  if ((sub.subscriptionStatus ?? "active") !== "active") return false;
  const expiry = millisOfTs(sub.expiryDate);
  if (!expiry || expiry <= now) return false;
  const start = millisOfTs(sub.startDate);
  return !start || start <= now;
}

export function summarizeSubscriptions(subs: SubscriptionLike[], now = Date.now()): OwnerSubscriptionSummary {
  if (subs.length === 0) return { state: "none", seats: 0, running: 0, until: null };
  const running = subs.filter((s) => isRunning(s, now));
  if (running.length > 0) {
    return {
      state: "active",
      seats: running.reduce((n, s) => n + (Number(s.seatsPurchased) || 0), 0),
      running: running.length,
      until: new Date(Math.max(...running.map((s) => millisOfTs(s.expiryDate)))),
    };
  }
  const upcoming = subs
    .filter((s) => {
      const status = s.subscriptionStatus ?? "active";
      return (status === "scheduled" || status === "active") && millisOfTs(s.startDate) > now && millisOfTs(s.expiryDate) > now;
    })
    .map((s) => millisOfTs(s.startDate));
  if (upcoming.length > 0) {
    return { state: "scheduled", seats: 0, running: 0, until: new Date(Math.min(...upcoming)) };
  }
  return { state: "expired", seats: 0, running: 0, until: null };
}

/** Last 10 digits, so "+91 98765 43210", "919876543210" and "9876543210" match. */
export function phoneKey(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}
