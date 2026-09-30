import assert from "node:assert/strict";
import * as P from "../../app/lib/pricing";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

const ladder = P.parseDurations({ durations: P.DEFAULT_DURATIONS })!;
t("defaults survive a save/parse round trip", () => {
  assert.ok(ladder); assert.equal(ladder.length, 6);
  const sy = ladder.find(d => d.id === "standard-yearly")!;
  assert.equal(sy.tier, "standard"); assert.equal(sy.compareAtPrice, 14400); assert.equal(sy.flatPrice, 11000);
});
t("tiers split 2 standard / 4 custom", () => {
  assert.equal(P.plansForTier(ladder, "standard").length, 2);
  assert.equal(P.plansForTier(ladder, "custom").length, 4);
});
t("standard monthly charges 2100 and grants 100 whatever seats are sent", () => {
  const sm = P.planFor(ladder, "standard-monthly")!;
  for (const seats of [1, 10, 100, 5000]) {
    assert.equal(P.computeAmount(sm, seats), 2100);
    assert.equal(P.billableSeats(sm, seats), 100);
  }
});
t("standard yearly charges 11000 (not the struck 14400)", () => {
  assert.equal(P.computeAmount(P.planFor(ladder, "standard-yearly")!, 100), 11000);
});
t("custom stays per listing", () => {
  assert.equal(P.computeAmount(P.planFor(ladder, "12")!, 100), 14400);
  assert.equal(P.computeAmount(P.planFor(ladder, "1")!, 30), 630);
});
t("old clients sending only months never land on a Standard plan", () => {
  assert.equal(P.tierOf(P.planFor(ladder, 1)!), "custom");
  assert.equal(P.tierOf(P.planFor(ladder, 12)!), "custom");
  assert.equal(P.priceFor(ladder, 12), 144);
});
t("unknown plan id resolves to nothing (create-order then refuses)", () => {
  assert.equal(P.planFor(ladder, "standard-deleted"), null);
});
t("a standard row without a flat price is rejected", () => {
  assert.equal(P.parseDurations([{ id: "s", tier: "standard", months: 1, pricePerSeat: 21 }]), null);
});
t("an unknown tier is rejected, not silently custom", () => {
  assert.equal(P.parseDurations([{ months: 1, pricePerSeat: 21, tier: "gold" }]), null);
});
t("legacy ladder without tiers still parses as all custom", () => {
  const legacy = P.parseDurations([{ months: 1, pricePerSeat: 21 }, { months: 12, pricePerSeat: 144 }])!;
  assert.ok(legacy.every(d => P.tierOf(d) === "custom"));
});
t("promo evaluated against granted seats applies to standard", () => {
  const promo = { code: "X10", discountPercent: 10, active: true, applicablePlans: [12], minSeats: 50 };
  const e = P.evaluatePromo(promo, { months: 12, seatCount: 100 });
  assert.equal(e.discountPercent, 10);
  assert.equal(P.applyDiscount(11000, 10), 9900);
});
t("plan labels: legacy 'Standard' without tier shows Custom; new records honest", () => {
  assert.equal(P.subscriptionPlanLabel({ planName: "Standard" }), "Custom");
  assert.equal(P.subscriptionPlanLabel({ planName: "Standard", planTier: "standard" }), "Standard");
  assert.equal(P.subscriptionPlanLabel({ planName: "Custom", planTier: "custom" }), "Custom");
  assert.equal(P.subscriptionPlanLabel({ planName: "Admin Assigned" }), "Admin Assigned");
  assert.equal(P.subscriptionPlanLabel({ planName: "Gold 500", isCustom: true }), "Gold 500");
});
console.log(`\n${n} passed`);
