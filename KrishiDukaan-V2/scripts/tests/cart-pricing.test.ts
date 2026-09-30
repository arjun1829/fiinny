import assert from "node:assert/strict";
import * as C from "../../app/lib/cart-pricing";
import { computeLinePricing } from "../../app/utils/gst";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

const slabs = (x: [number, number, number][]) => x.map(([minKg, maxKg, charge]) => ({ minKg, maxKg, charge }));
const IN = slabs([[0, 1, 40], [1, 5, 60], [5, 1000, 100]]);
const OUT = slabs([[0, 1, 90], [1, 5, 140], [5, 1000, 220]]);
const panIndia = { coverageType: "pan_india", sellerState: "Maharashtra", weightSlabs: IN, inStateSlabs: IN, outStateSlabs: OUT };
const line = (o: Partial<C.CartPricingLine> = {}): C.CartPricingLine => ({ sellerKey: "S1", unitPrice: 100, qty: 1, weightKg: 2, ...o });

// ── GST ────────────────────────────────────────────────────────────────────
t("inclusive GST: backed out, never added (₹118 @18% = ₹18 inside)", () => {
  const p = computeLinePricing({ unitPrice: 118, qty: 1, gstApplicable: true, gstRate: 18, gstIncluded: true });
  assert.equal(p.gstPerUnit, 18); assert.equal(p.gstAdded, 0); assert.equal(p.lineTotal, 118);
});
t("default is INCLUDED when gstIncluded is absent", () => {
  const p = computeLinePricing({ unitPrice: 118, gstApplicable: true, gstRate: 18 });
  assert.equal(p.included, true); assert.equal(p.gstAdded, 0);
});
t("exclusive GST is added on top: ₹100 @18% -> ₹118", () => {
  const p = computeLinePricing({ unitPrice: 100, qty: 2, gstApplicable: true, gstRate: 18, gstIncluded: false });
  assert.equal(p.gstAdded, 36); assert.equal(p.lineTotal, 236);
});
t("seller pricing: mixed lines - only exclusive GST reaches the total", () => {
  const sp = C.computeSellerPricing("S1", [
    line({ unitPrice: 118, qty: 1, weightKg: 0, gstApplicable: true, gstRate: 18, gstIncluded: true }),
    line({ unitPrice: 100, qty: 1, weightKg: 0, gstApplicable: true, gstRate: 5, gstIncluded: false }),
  ], null, "");
  assert.equal(sp.subtotal, 218);
  assert.equal(sp.gstTotal, 23);      // 18 inside + 5 on top
  assert.equal(sp.gstAdded, 5);
  assert.equal(sp.total, 223);
});

// ── Delivery slabs by customer state ───────────────────────────────────────
t("pan-India: same state uses in-state slab", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 2 })], panIndia, "Maharashtra");
  assert.deepEqual([d.slab, d.deliveryType], [60, "in_state"]);
});
t("pan-India: other state uses out-of-state slab", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 2 })], panIndia, "Gujarat");
  assert.deepEqual([d.slab, d.deliveryType], [140, "out_state"]);
});
t("state compare ignores case and spaces", () => {
  assert.equal(C.computeSellerDelivery([line()], panIndia, "  maharashtra ").deliveryType, "in_state");
});
t("unknown customer state falls back to the legacy single slab set", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 2 })], panIndia, "");
  assert.deepEqual([d.slab, d.deliveryType], [60, "default"]);
});
t("legacy seller (no in/out slabs) keeps working", () => {
  const legacy = { coverageType: "pan_india", weightSlabs: IN };
  const d = C.computeSellerDelivery([line({ weightKg: 2 })], legacy, "Gujarat");
  assert.equal(d.slab, 60);
});
t("states coverage uses the single slab set", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 6 })], { coverageType: "states", weightSlabs: IN }, "Gujarat");
  assert.deepEqual([d.slab, d.deliveryType], [100, "default"]);
});
t("weight above every slab resolves to the top slab", () => {
  assert.equal(C.computeSellerDelivery([line({ weightKg: 5000 })], panIndia, "Gujarat").slab, 220);
});

// ── Extra + free delivery ──────────────────────────────────────────────────
t("extra delivery is added on top of the slab", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 2, extraDeliveryCharge: 25 })], panIndia, "Maharashtra");
  assert.deepEqual([d.slab, d.extra], [60, 25]);
});
t("a free item contributes no weight and no extra", () => {
  const d = C.computeSellerDelivery([
    line({ weightKg: 0.5 }),
    line({ weightKg: 10, freeDelivery: true, extraDeliveryCharge: 99 }),
  ], panIndia, "Maharashtra");
  assert.deepEqual([d.slab, d.extra, d.free], [40, 0, false]);   // only the 0.5kg item is chargeable
});
t("all items free -> ships free; waived keeps what it would have cost", () => {
  const d = C.computeSellerDelivery([
    line({ weightKg: 2, freeDelivery: true, extraDeliveryCharge: 10 }),
    line({ weightKg: 1, freeDelivery: true }),
  ], panIndia, "Maharashtra");
  assert.equal(d.free, true); assert.equal(d.slab, 0); assert.equal(d.extra, 0);
  assert.equal(d.waived, 70);   // 3kg -> 60 slab + 10 extra
  const sp = C.computeSellerPricing("S1", [line({ weightKg: 2, freeDelivery: true })], panIndia, "Maharashtra");
  assert.equal(sp.deliveryCharge, 0); assert.equal(sp.total, 100);
});

// ── Zero weight must not pick up the lowest slab (the cart/server drift) ───
t("zero chargeable weight -> only the per-product extra", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 0, extraDeliveryCharge: 15 })], panIndia, "Maharashtra");
  assert.deepEqual([d.slab, d.extra], [0, 15]);
});
t("no readable settings -> only extra, never a slab", () => {
  const d = C.computeSellerDelivery([line({ weightKg: 2, extraDeliveryCharge: 15 })], null, "Maharashtra");
  assert.deepEqual([d.slab, d.extra], [0, 15]);
});

// ── Full seller total ──────────────────────────────────────────────────────
t("seller total = items + added GST + delivery", () => {
  const sp = C.computeSellerPricing("S1", [
    line({ unitPrice: 100, qty: 2, weightKg: 2, gstApplicable: true, gstRate: 18, gstIncluded: false, extraDeliveryCharge: 10 }),
  ], panIndia, "Gujarat");
  assert.equal(sp.subtotal, 200); assert.equal(sp.gstAdded, 36);
  assert.equal(sp.deliveryCharge, 150);  // 140 out-of-state slab (2kg) + 10 extra
  assert.equal(sp.total, 386);
});

// ── Pack-size price + store settings readers ───────────────────────────────
t("variantPriceFor: matches the chosen size, tolerant of spelling", () => {
  const v = [{ unit: "1L", price: 1100 }, { unit: "500ml", price: 600 }, { unit: "250ml", price: 350 }];
  assert.equal(C.variantPriceFor(v, "500ml"), 600);
  assert.equal(C.variantPriceFor(v, "500 ML"), 600);
  assert.equal(C.variantPriceFor(v, "1 litre"), 1100);
});
t("variantPriceFor: unknown size / no size / bad price -> null (base price used)", () => {
  const v = [{ unit: "1L", price: 1100 }, { unit: "2L", price: 0 }];
  assert.equal(C.variantPriceFor(v, "5L"), null);
  assert.equal(C.variantPriceFor(v, ""), null);
  assert.equal(C.variantPriceFor(v, undefined), null);
  assert.equal(C.variantPriceFor(undefined, "1L"), null);
  assert.equal(C.variantPriceFor(v, "2L"), null);
});
t("commercialOf: defaults and clamping", () => {
  assert.deepEqual(C.commercialOf(null), { gstApplicable: false, gstRate: 0, gstIncluded: true, extraDeliveryCharge: 0, freeDelivery: false });
  const c = C.commercialOf({ gstApplicable: true, gstRate: 12.5, gstIncluded: false, extraDeliveryCharge: 30, freeDelivery: true });
  assert.deepEqual(c, { gstApplicable: true, gstRate: 12.5, gstIncluded: false, extraDeliveryCharge: 30, freeDelivery: true });
  assert.equal(C.commercialOf({ gstRate: 500 }).gstRate, 100);
});
t("hasCommercial: an old doc with none of the fields does not count", () => {
  assert.equal(C.hasCommercial({ price: 100 }), false);
  assert.equal(C.hasCommercial({ gstApplicable: false }), true);
  assert.equal(C.hasCommercial(null), false);
});
console.log(`\n${n} passed`);
