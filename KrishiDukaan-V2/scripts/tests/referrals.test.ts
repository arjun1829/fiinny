import assert from "node:assert/strict";
import { computeReferralStats, normalizeReferralCode, isValidReferralCodeFormat, istDay, ABANDON_AFTER_MS, type AttemptLike, type EventLike } from "../../app/lib/referrals";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

const NOW = Date.UTC(2026, 8, 29, 6, 0, 0); // 29 Sep 2026 11:30 IST
const H = 3600_000;
const att = (p: Partial<AttemptLike>): AttemptLike => ({
  id: Math.random().toString(36), status: "created", amount: 2100, userId: "u", userName: null, userPhone: null,
  seatCount: 100, durationMonths: 1, createdAtMs: NOW - H, ...p,
});

t("code normalisation and format", () => {
  assert.equal(normalizeReferralCode(" rahul-01 "), "RAHUL01");
  assert.ok(isValidReferralCodeFormat("RAHUL"));
  assert.ok(!isValidReferralCodeFormat("AB"));
  assert.ok(!isValidReferralCodeFormat("A".repeat(21)));
});

t("funnel counts people, not orders; revenue only from paid", () => {
  const attempts = [
    att({ userId: "a", status: "paid", amount: 11000 }),
    att({ userId: "a", status: "paid", amount: 2100 }),          // same buyer, second purchase
    att({ userId: "b", status: "failed" }),
    att({ userId: "c", status: "created", createdAtMs: NOW - 2 * H }), // abandoned
    att({ userId: "d", status: "created", createdAtMs: NOW - 5 * 60_000 }), // still paying
  ];
  const events: EventLike[] = [
    { type: "open", uid: null, atMs: NOW - 3 * H },
    { type: "open", uid: null, atMs: NOW - 3 * H },
    { type: "checkout_view", uid: "a", atMs: NOW - 2 * H },
    { type: "checkout_view", uid: "e", atMs: NOW - 2 * H }, // viewed, never started
  ];
  const s = computeReferralStats(attempts, events, NOW);
  assert.equal(s.opens, 2);
  assert.equal(s.reachedCheckout, 5); // a,b,c,d,e
  assert.equal(s.startedBuyers, 4);
  assert.equal(s.paidBuyers, 1);
  assert.equal(s.paidOrders, 2);
  assert.equal(s.revenue, 13100);
  assert.equal(s.failedOrders, 1);
  assert.equal(s.abandonedOrders, 1);
  assert.equal(s.pendingOrders, 1);
  assert.equal(s.conversionPct, 20);
  const byUser = Object.fromEntries(s.leads.map((l) => [l.userId, l.status]));
  assert.deepEqual(byUser, { b: "failed", c: "abandoned", d: "pending", e: "viewed" });
  assert.ok(!("a" in byUser), "a paid, so not a lead");
});

t("a buyer who failed then paid is not a lead", () => {
  const s = computeReferralStats([att({ userId: "x", status: "failed", createdAtMs: NOW - 2 * H }), att({ userId: "x", status: "paid" })], [], NOW);
  assert.equal(s.leads.length, 0);
  assert.equal(s.paidBuyers, 1);
});

t("abandon threshold is 30 minutes", () => {
  const edge = computeReferralStats([att({ createdAtMs: NOW - ABANDON_AFTER_MS + 1000 })], [], NOW);
  assert.equal(edge.pendingOrders, 1);
  const past = computeReferralStats([att({ createdAtMs: NOW - ABANDON_AFTER_MS - 1000 })], [], NOW);
  assert.equal(past.abandonedOrders, 1);
});

t("daily series: 30 IST days ending today, events bucketed", () => {
  const s = computeReferralStats(
    [att({ status: "paid", createdAtMs: NOW }), att({ userId: "z", createdAtMs: NOW - 40 * 24 * H })],
    [{ type: "open", uid: null, atMs: NOW }],
    NOW,
  );
  assert.equal(s.daily.length, 30);
  assert.equal(s.daily[29]!.date, istDay(NOW));
  assert.deepEqual(s.daily[29], { date: istDay(NOW), opens: 1, started: 1, paid: 1 });
  assert.equal(s.daily.reduce((a, d) => a + d.started, 0), 1, "40-day-old attempt outside the window");
});

t("IST day boundary", () => {
  assert.equal(istDay(Date.UTC(2026, 8, 28, 18, 29)), "2026-09-28");
  assert.equal(istDay(Date.UTC(2026, 8, 28, 18, 31)), "2026-09-29");
});
console.log(`\n${n} passed`);
