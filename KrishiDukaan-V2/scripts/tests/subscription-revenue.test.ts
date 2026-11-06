/**
 * Unit coverage for the subscription-revenue rollup classification
 * (functions/src/stats/platform-daily.ts). Pure functions, no Firestore.
 *
 *   npx tsx scripts/tests/subscription-revenue.test.ts
 */
import assert from "node:assert/strict";
import {
  paymentRevenueBucket,
  paymentRevenueContribution,
  subscriptionContribution,
  isPromotionalSub,
} from "../../functions/src/stats/platform-daily";
import { istDayKey, type Contribution } from "../../functions/src/stats/increments";

let n = 0;
const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

// A fake Firestore Timestamp (millisOf only needs toMillis()).
const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });
// Field value for a given createdAt/timestamp's IST day bucket.
const field = (c: Contribution, iso: string, key: string): number => {
  const path = `platformDailyStats/${istDayKey(new Date(iso).getTime())}`;
  return c.get(path)?.[key] ?? 0;
};

const DAY = "2026-10-15T08:00:00.000Z";

// ── Payment-ledger revenue classification ──────────────────────────────────
t("gateway payment (success) → gateway revenue", () => {
  assert.equal(paymentRevenueBucket("success"), "paid");
  const c = paymentRevenueContribution({ status: "success", amount: 2100, timestamp: ts(DAY) });
  assert.equal(field(c, DAY, "subs.revenuePaid"), 2100);
  assert.equal(field(c, DAY, "subs.revenueManual"), 0);
});

t("genuine manual/admin activation (manual_admin) → manual revenue", () => {
  assert.equal(paymentRevenueBucket("manual_admin"), "manual");
  const c = paymentRevenueContribution({ status: "manual_admin", amount: 8700, timestamp: ts(DAY) });
  assert.equal(field(c, DAY, "subs.revenueManual"), 8700);
  assert.equal(field(c, DAY, "subs.revenuePaid"), 0);
});

t("custom-assign grant (admin_granted) → manual revenue", () => {
  assert.equal(paymentRevenueBucket("admin_granted"), "manual");
  const c = paymentRevenueContribution({ status: "admin_granted", amount: 500, timestamp: ts(DAY) });
  assert.equal(field(c, DAY, "subs.revenueManual"), 500);
});

t("promotional activation records NO payment → contributes zero revenue", () => {
  // Promotions write no payments doc; an unknown/failed status also yields nothing.
  assert.equal(paymentRevenueBucket("failed"), null);
  assert.equal(paymentRevenueBucket(undefined), null);
  const c = paymentRevenueContribution({ status: "failed", amount: 999, timestamp: ts(DAY) });
  assert.equal(c.size, 0);
});

t("multiple transactions on one subscription each count once (no dedup, no double-count)", () => {
  const first = paymentRevenueContribution({ status: "success", amount: 2100, timestamp: ts(DAY) });
  const renewalPay = paymentRevenueContribution({ status: "success", amount: 2100, timestamp: ts("2026-11-15T08:00:00.000Z") });
  // Two separate transactions on two days → each bucketed to its own day.
  assert.equal(field(first, DAY, "subs.revenuePaid"), 2100);
  assert.equal(field(renewalPay, "2026-11-15T08:00:00.000Z", "subs.revenuePaid"), 2100);
});

// ── Subscription COUNT classification (revenue is NOT derived here) ─────────
t("paid subscription → counted as a genuine new subscription, no revenue here", () => {
  const c = subscriptionContribution({ seatsPurchased: 100, createdAt: ts(DAY) }, false);
  assert.equal(field(c, DAY, "subs.count"), 1);
  assert.equal(field(c, DAY, "subs.seats"), 100);
  assert.equal(field(c, DAY, "subs.revenuePaid"), 0, "revenue must come from the payments ledger, not sub docs");
  assert.equal(field(c, DAY, "subs.revenueManual"), 0);
});

t("genuine manual activation (activatedByAdmin, not promotional) → genuine count", () => {
  const c = subscriptionContribution({ activatedByAdmin: true, seatsPurchased: 50, createdAt: ts(DAY) }, false);
  assert.equal(field(c, DAY, "subs.count"), 1);
  assert.equal(field(c, DAY, "subs.seats"), 50);
  assert.equal(field(c, DAY, "subs.promoCount"), 0);
});

t("promotional grant → promo bucket only, excluded from count/seats", () => {
  assert.equal(isPromotionalSub({ isPromotional: true }), true);
  assert.equal(isPromotionalSub({ promotionId: "promo_123" }), true);
  const c = subscriptionContribution(
    { isPromotional: true, promotionId: "promo_123", seatsPurchased: 10, createdAt: ts(DAY) }, false);
  assert.equal(field(c, DAY, "subs.promoCount"), 1);
  assert.equal(field(c, DAY, "subs.promoSeats"), 10);
  assert.equal(field(c, DAY, "subs.count"), 0);
  assert.equal(field(c, DAY, "subs.seats"), 0);
});

t("promotional done manually by an admin (isPromotional + activatedByAdmin) stays promotional", () => {
  const c = subscriptionContribution(
    { isPromotional: true, activatedByAdmin: true, seatsPurchased: 10, amountPaid: 2100, createdAt: ts(DAY) }, false);
  // Promotional wins: not counted as a genuine/manual subscription, no revenue.
  assert.equal(field(c, DAY, "subs.promoCount"), 1);
  assert.equal(field(c, DAY, "subs.count"), 0);
});

t("paid renewal within range → renewal + genuine count", () => {
  const c = subscriptionContribution({ seatsPurchased: 100, createdAt: ts(DAY) }, true);
  assert.equal(field(c, DAY, "subs.count"), 1);
  assert.equal(field(c, DAY, "subs.renewals"), 1);
});

t("promotional renewal is never a counted renewal", () => {
  const c = subscriptionContribution({ isPromotional: true, seatsPurchased: 5, createdAt: ts(DAY) }, true);
  assert.equal(field(c, DAY, "subs.renewals"), 0);
  assert.equal(field(c, DAY, "subs.promoCount"), 1);
});

t("revoked subscription still has revenue if a payment was taken (status-independent)", () => {
  // Revenue is keyed off the payment, not the subscription's lifecycle status.
  const c = paymentRevenueContribution({ status: "success", amount: 2100, timestamp: ts(DAY) });
  assert.equal(field(c, DAY, "subs.revenuePaid"), 2100);
});

t("date-range boundary: a payment buckets into its own IST day", () => {
  // 2026-10-15T18:45Z = 2026-10-16 00:15 IST → next day's bucket.
  const lateNight = paymentRevenueContribution({ status: "success", amount: 100, timestamp: ts("2026-10-15T18:45:00.000Z") });
  assert.equal(field(lateNight, "2026-10-16T00:00:00.000Z", "subs.revenuePaid"), 100);
  assert.equal(field(lateNight, "2026-10-15T00:00:00.000Z", "subs.revenuePaid"), 0);
});

t("a doc with no timestamp/createdAt is not counted", () => {
  assert.equal(paymentRevenueContribution({ status: "success", amount: 100 }).size, 0);
  assert.equal(subscriptionContribution({ seatsPurchased: 1 }, false).size, 0);
});

console.log(`\n${n} passed`);
