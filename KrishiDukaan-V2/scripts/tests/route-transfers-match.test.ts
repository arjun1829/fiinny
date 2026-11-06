/**
 * Unit tests for matchSellerTransfer / outstandingPaise (app/lib/route-transfers).
 *
 * This is the money-safety core of reassignment: it decides WHICH Razorpay
 * transfer on a payment belongs to a given seller — i.e. which one is reversed
 * off the previous retailer and which one releases to the new retailer. A wrong
 * match here pays the wrong shop, so the reassignment cases are pinned down.
 *
 *   npx tsx scripts/tests/route-transfers-match.test.ts
 */
import assert from "node:assert/strict";

// route-transfers imports route-server, which constructs a Razorpay client at
// module load. These tests exercise only the pure matching maths and move no
// money, so dummy creds satisfy the constructor. Set BEFORE the dynamic import.
process.env.RAZORPAY_KEY_ID ||= "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET ||= "dummy";

type RouteTransferRow = import("../../app/lib/route-transfers").RouteTransferRow;

let n = 0;

const row = (over: Partial<RouteTransferRow>): RouteTransferRow => ({
  id: "trf_x", amount: 10000, amount_reversed: 0, on_hold: true, on_hold_until: null,
  status: "created", settlement_status: null, recipient: "acc_1", notes: {}, ...over,
});

async function main() {
const { matchSellerTransfer, outstandingPaise, classifyExistingTransfer } = await import("../../app/lib/route-transfers");
const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

t("picks the transfer tagged for this seller, never another seller's", () => {
  const transfers = [
    row({ id: "trf_old", notes: { sellerKey: "+919999900000" } }),
    row({ id: "trf_new", notes: { sellerKey: "+918888800000" } }),
  ];
  // Reassigned to the new seller: must match the NEW transfer, not the old one.
  const m = matchSellerTransfer(transfers, ["+918888800000", "8888800000"]);
  assert.equal(m?.id, "trf_new");
});

t("never matches a transfer whose note names a DIFFERENT seller", () => {
  const transfers = [row({ id: "trf_old", notes: { sellerKey: "+919999900000" } })];
  // The new seller has no transfer yet → no match (they're paid by the payout run),
  // and crucially the OLD seller's transfer is NOT returned for them.
  assert.equal(matchSellerTransfer(transfers, ["+918888800000"]), null);
});

t("matches by 10-digit phone across +91 / bare forms", () => {
  const transfers = [row({ id: "trf", notes: { sellerKey: "9370505272" } })];
  assert.equal(matchSellerTransfer(transfers, ["+919370505272"])?.id, "trf");
});

t("preferredId (order.routeTransfer.id) wins outright", () => {
  const transfers = [
    row({ id: "trf_a", notes: { sellerKey: "+919999900000" } }),
    row({ id: "trf_b", notes: { sellerKey: "+918888800000" } }),
  ];
  assert.equal(matchSellerTransfer(transfers, ["+919999900000"], "trf_b")?.id, "trf_b");
});

t("single untagged transfer matches (pre-note legacy orders)", () => {
  const transfers = [row({ id: "trf_legacy", notes: {} })];
  assert.equal(matchSellerTransfer(transfers, ["+919999900000"])?.id, "trf_legacy");
});

t("single transfer that IS tagged for another seller does NOT fall back", () => {
  // The reassignment hazard: one transfer on the payment, tagged for the seller
  // who rejected. The new seller must not inherit it via a "only one" fallback.
  const transfers = [row({ id: "trf_rejecter", notes: { sellerKey: "+919999900000" } })];
  assert.equal(matchSellerTransfer(transfers, ["+918888800000"]), null);
});

t("outstandingPaise nets off a partial reversal and never goes negative", () => {
  assert.equal(outstandingPaise(row({ amount: 10000, amount_reversed: 3000 })), 7000);
  assert.equal(outstandingPaise(row({ amount: 10000, amount_reversed: 10000 })), 0);
  assert.equal(outstandingPaise(row({ amount: 10000, amount_reversed: 12000 })), 0);
});

// classifyExistingTransfer decides whether an OWNERSHIP-ONLY reassignment is
// safe given the original retailer's transfer. "held"/"none" = reassign freely;
// "blocking" = money is on its way to the old retailer, stop and report.
const now = Date.UTC(2026, 0, 1);

t("no transfer → none (safe)", () => {
  assert.equal(classifyExistingTransfer(null).kind, "none");
});

t("fully reversed → none (money already back with platform)", () => {
  assert.equal(classifyExistingTransfer(row({ amount: 10000, amount_reversed: 10000 }), now).kind, "none");
});

t("indefinite on-hold → held (safe to leave as-is)", () => {
  const c = classifyExistingTransfer(row({ on_hold: true, on_hold_until: null }), now);
  assert.equal(c.kind, "held");
  if (c.kind === "held") assert.equal(c.paise, 10000);
});

t("released (not on hold) → blocking", () => {
  assert.equal(classifyExistingTransfer(row({ on_hold: false, status: "processed" }), now).kind, "blocking");
});

t("scheduled to release in the future → blocking", () => {
  const c = classifyExistingTransfer(row({ on_hold: true, on_hold_until: Math.floor(now / 1000) + 86400 }), now);
  assert.equal(c.kind, "blocking");
});

t("a past on_hold_until is no longer a live schedule → held", () => {
  // Razorpay would already have released it if it were going to; outstanding
  // money still on hold means it is effectively parked.
  const c = classifyExistingTransfer(row({ on_hold: true, on_hold_until: Math.floor(now / 1000) - 86400 }), now);
  assert.equal(c.kind, "held");
});

t("settled → blocking (already in the old retailer's bank)", () => {
  assert.equal(classifyExistingTransfer(row({ on_hold: false, settlement_status: "settled" }), now).kind, "blocking");
});

}

main().then(() => console.log(`\n${n} passed`)).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
