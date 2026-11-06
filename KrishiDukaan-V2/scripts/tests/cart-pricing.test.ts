import assert from "node:assert/strict";
import * as C from "../../app/lib/cart-pricing";
import { computeLinePricing } from "../../app/utils/gst";
import { parseVariantWeightKg } from "../../app/utils/weight";
import { DEFAULT_IN_STATE_SLABS, DEFAULT_OUT_STATE_SLABS } from "../../app/dashboard/_types/delivery-settings";
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
// ── State names: spelling must not decide which slab a customer pays ───────
import { canonicalState, isSameState } from "../../app/utils/delivery";
t("state aliases: '&' vs 'and', Delhi forms, Orissa, case and spacing", () => {
  assert.ok(isSameState("Jammu & Kashmir", "Jammu and Kashmir"));
  assert.ok(isSameState("Delhi", "NCT of Delhi"));
  assert.ok(isSameState("Delhi", "New Delhi"));
  assert.ok(isSameState("Odisha", "Orissa"));
  assert.ok(isSameState("Andaman & Nicobar Islands", "Andaman and Nicobar Islands"));
  assert.ok(isSameState("Dadra & Nagar Haveli and Daman & Diu", "Dadra and Nagar Haveli and Daman and Diu"));
  assert.ok(isSameState("Daman and Diu", "Dadra & Nagar Haveli and Daman & Diu"));
  assert.ok(isSameState("  TAMIL   NADU ", "tamil nadu"));
  assert.ok(isSameState("Puducherry", "Pondicherry"));
});
t("state aliases never merge different states, and empty never matches", () => {
  assert.ok(!isSameState("Maharashtra", "Gujarat"));
  assert.ok(!isSameState("Uttar Pradesh", "Uttarakhand"));
  assert.ok(!isSameState("Madhya Pradesh", "Maharashtra"));
  assert.ok(!isSameState("", ""));
  assert.ok(!isSameState("Goa", ""));
  assert.equal(canonicalState(undefined), "");
});
t("an in-state customer spelled differently still gets the in-state slab", () => {
  const seller = { ...panIndia, sellerState: "Jammu & Kashmir" };
  const d = C.computeSellerDelivery([line({ weightKg: 2 })], seller, "Jammu and Kashmir");
  assert.deepEqual([d.slab, d.deliveryType], [60, "in_state"]);
});

// ── resolveVariant: pricing precedence, no silent base fallback, stock ───────
const CANON = [{ unit: "1L", price: 1000 }, { unit: "5L", price: 4500 }];

t("E: retailer with its own ladder is authoritative for the selected size", () => {
  const r = C.resolveVariant({
    variantUnit: "5L",
    sellerVariants: [{ unit: "1L", price: 900 }, { unit: "5L", price: 4200 }],
    sellerBasePrice: 900,
    hasSellerSource: true,
    canonicalVariants: CANON,
    canonicalBasePrice: 1000,
  });
  assert.deepEqual(r, { ok: true, price: 4200, stock: null });
});
t("E: normalized unit match ('5 ltr' == '5L')", () => {
  const r = C.resolveVariant({
    variantUnit: "5 ltr",
    sellerVariants: [{ unit: "5L", price: 4200 }],
    sellerBasePrice: 0, hasSellerSource: true, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual([r.ok, (r as any).price], [true, 4200]);
});
t("F: retailer stocks a ladder but NOT the selected size -> not_stocked (no base fallback)", () => {
  const r = C.resolveVariant({
    variantUnit: "5L",
    sellerVariants: [{ unit: "1L", price: 900 }],
    sellerBasePrice: 900, hasSellerSource: true, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(r, { ok: false, code: "not_stocked" });
});
t("F: selected size present but priced 0 -> invalid_price (never charged as base)", () => {
  const r = C.resolveVariant({
    variantUnit: "5L",
    sellerVariants: [{ unit: "5L", price: 0 }],
    sellerBasePrice: 900, hasSellerSource: true, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(r, { ok: false, code: "invalid_price" });
});
t("legacy single-price retailer (no ladder) serves only the BASE size", () => {
  const base = C.resolveVariant({
    variantUnit: "1L", sellerVariants: undefined, sellerBasePrice: 950,
    hasSellerSource: true, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(base, { ok: true, price: 950, stock: null });
  const other = C.resolveVariant({
    variantUnit: "5L", sellerVariants: undefined, sellerBasePrice: 950,
    hasSellerSource: true, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(other, { ok: false, code: "not_stocked" });
});
t("manufacturer-direct (no seller source) uses the canonical ladder", () => {
  const ok = C.resolveVariant({
    variantUnit: "5L", hasSellerSource: false, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(ok, { ok: true, price: 4500, stock: null });
  const miss = C.resolveVariant({
    variantUnit: "10L", hasSellerSource: false, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(miss, { ok: false, code: "not_stocked" });
});
t("manufacturer-direct with a bare base-price inventory row still uses the canonical ladder (regression: Karate 500ml)", () => {
  // Owner has an inventory doc carrying only sellingPrice=100 and NO ladder, but
  // there is no retailer availability entry → hasSellerSource:false. The full
  // canonical ladder must apply, so 500ml resolves to 420 (not "not_stocked").
  const r = C.resolveVariant({
    variantUnit: "500ml",
    sellerVariants: undefined,          // bare inventory row, no ladder
    sellerBasePrice: 100,               // its base sellingPrice
    hasSellerSource: false,             // no availability/retailer listing
    canonicalVariants: [{ unit: "100ml", price: 100 }, { unit: "250ml", price: 220 }, { unit: "500ml", price: 420 }],
    canonicalBasePrice: 100,
  });
  assert.deepEqual(r, { ok: true, price: 420, stock: null });
});
t("single-size product (no variants, no unit) uses base price", () => {
  const r = C.resolveVariant({
    variantUnit: "", hasSellerSource: false, canonicalVariants: undefined, canonicalBasePrice: 500,
  });
  assert.deepEqual(r, { ok: true, price: 500, stock: null });
});
t("G: variant stock is returned and respected", () => {
  const inStock = C.resolveVariant({
    variantUnit: "5L", sellerVariants: [{ unit: "5L", price: 4200, stock: 3 }],
    sellerBasePrice: 0, hasSellerSource: true, canonicalVariants: CANON, canonicalBasePrice: 1000,
  });
  assert.deepEqual(inStock, { ok: true, price: 4200, stock: 3 });
});
t("baseVariantUnit: the size whose price equals the base, else the first", () => {
  assert.equal(C.baseVariantUnit(CANON, 1000), "1l");
  assert.equal(C.baseVariantUnit([{ unit: "250g", price: 50 }, { unit: "1kg", price: 180 }], 180), "1kg");
  assert.equal(C.baseVariantUnit([{ unit: "250g", price: 50 }], 999), "250g"); // no price match -> first
  assert.equal(C.baseVariantUnit(undefined, 100), "");
});

// ── Seller identity matching (schema-agnostic) ──────────────────────────────
t("phoneTail: last 10 digits; '' when not phone-shaped", () => {
  assert.equal(C.phoneTail("+919370505272"), "9370505272");
  assert.equal(C.phoneTail("9370505272"), "9370505272");
  assert.equal(C.phoneTail("0919370505272"), "9370505272");
  assert.equal(C.phoneTail("abc"), "");
  assert.equal(C.phoneTail(undefined), "");
});
t("makeSellerMatcher: matches a copy keyed by ownerPhone/manufacturerPhone (the Bayer pattern)", () => {
  const m = C.makeSellerMatcher(["+919370505272"]);
  // retailerPhone is null; the seller's phone lives in ownerPhone/manufacturerPhone.
  assert.ok(m({ ownerPhone: "+919370505272", manufacturerPhone: "+919370505272", retailerPhone: null }));
});
t("makeSellerMatcher: E164 key matches a 10-digit stored value and vice-versa", () => {
  assert.ok(C.makeSellerMatcher(["+919370505272"])({ retailerPhone: "9370505272" }));
  assert.ok(C.makeSellerMatcher(["9370505272"])({ ownerPhone: "+919370505272" }));
});
t("makeSellerMatcher: matches by UID (ownerId / retailerId / storeId)", () => {
  const m = C.makeSellerMatcher(["UID_abc"]);
  assert.ok(m({ ownerId: "UID_abc" }));
  assert.ok(m({ retailerId: "UID_abc" }));
  assert.ok(m({ storeId: "UID_abc" }));
});
t("makeSellerMatcher: different sellers never collide; empty identifiers ignored", () => {
  const m = C.makeSellerMatcher(["+919370505272", "UID_abc"]);
  assert.ok(!m({ ownerPhone: "+918888888888", retailerId: "UID_xyz" }));
  assert.ok(!m({ ownerPhone: "", retailerPhone: null }));
  assert.ok(!m(null));
  assert.ok(!C.makeSellerMatcher([null, "", undefined])({ ownerPhone: "+919370505272" }));
});
t("pickSellerLadder: first non-empty ladder wins; undefined when none", () => {
  const inv = [{ unit: "1L", price: 1 }];
  const av = [{ unit: "5kg", price: 2 }];
  assert.deepEqual(C.pickSellerLadder([undefined, inv, av]), inv);
  assert.deepEqual(C.pickSellerLadder([[], [], av]), av);
  assert.equal(C.pickSellerLadder([undefined, [], null]), undefined);
});

// ── Variant resolution: more catalog schema patterns ────────────────────────
t("copy carries a SUPERSET of the canonical ladder (Bayer 5 KG) -> resolves from the copy", () => {
  // Canonical lists only 1L; the seller copy adds 5 KG. No availability entry
  // (hasSellerSource:false), but the seller ladder comes from the copy.
  const r = C.resolveVariant({
    variantUnit: "5 KG",
    sellerVariants: [{ unit: "1L", price: 530, stock: 300 }, { unit: "5 KG", price: 2450, stock: 1 }],
    sellerBasePrice: 530,
    hasSellerSource: false,
    canonicalVariants: [{ unit: "1L", price: 530 }],
    canonicalBasePrice: 530,
  });
  assert.deepEqual(r, { ok: true, price: 2450, stock: 1 });
});
t("duplicate units in a ladder: first positive price wins, never 0", () => {
  const r = C.resolveVariant({
    variantUnit: "1kg",
    sellerVariants: [{ unit: "1 KG", price: 0 }, { unit: "1kg", price: 180 }],
    sellerBasePrice: 0, hasSellerSource: false, canonicalVariants: undefined, canonicalBasePrice: 0,
  });
  // "1 KG" (price 0) is skipped by variantPriceFor; the valid "1kg"=180 is used.
  assert.deepEqual([r.ok, (r as any).price], [true, 180]);
});
t("malformed ladder (non-array / junk) is handled safely", () => {
  const r = C.resolveVariant({
    variantUnit: "1kg", sellerVariants: "oops" as any, sellerBasePrice: 0,
    hasSellerSource: false, canonicalVariants: [{ unit: "1kg", price: 50 }], canonicalBasePrice: 50,
  });
  assert.deepEqual(r, { ok: true, price: 50, stock: null }); // falls through to canonical ladder
});
t("genuinely different units are NOT treated as equal (5kg != 500g, 1L != 1kg)", () => {
  const ladder = [{ unit: "500g", price: 60 }, { unit: "1L", price: 120 }];
  assert.deepEqual(C.resolveVariant({ variantUnit: "5kg", sellerVariants: ladder, hasSellerSource: false, canonicalBasePrice: 0 }), { ok: false, code: "not_stocked" });
  assert.deepEqual(C.resolveVariant({ variantUnit: "1kg", sellerVariants: ladder, hasSellerSource: false, canonicalBasePrice: 0 }), { ok: false, code: "not_stocked" });
});

// ── First-time default delivery slabs: boundary behavior at checkout ────────
// Guards the auto-applied defaults against drift and proves the half-open
// [min, max) matching resolves 1 / 5 / 6 kg to the UPPER slab (no overlap/gap).
{
  const def = {
    coverageType: "pan_india",
    sellerState: "Maharashtra",
    weightSlabs: DEFAULT_IN_STATE_SLABS,
    inStateSlabs: DEFAULT_IN_STATE_SLABS,
    outStateSlabs: DEFAULT_OUT_STATE_SLABS,
  };
  const inCharge = (kg: number) => C.computeSellerDelivery([line({ weightKg: kg })], def, "Maharashtra").slab;
  const outCharge = (kg: number) => C.computeSellerDelivery([line({ weightKg: kg })], def, "Gujarat").slab;

  t("default in-state: within first slab (0.5kg) -> 70", () => assert.equal(inCharge(0.5), 70));
  t("default in-state: boundary 1kg -> upper slab 150 (not 70)", () => assert.equal(inCharge(1), 150));
  t("default in-state: 4.9kg -> 150", () => assert.equal(inCharge(4.9), 150));
  t("default in-state: boundary 5kg -> upper slab 250 (not 150)", () => assert.equal(inCharge(5), 250));
  t("default in-state: 5kg and above -> top slab 250 (open-ended)", () => {
    assert.equal(inCharge(9), 250); assert.equal(inCharge(50), 250); assert.equal(inCharge(2000), 250);
  });

  t("default out-state: 0.5kg -> 70", () => assert.equal(outCharge(0.5), 70));
  t("default out-state: boundary 1kg -> 150", () => assert.equal(outCharge(1), 150));
  t("default out-state: boundary 5kg -> upper slab 300 (not 150)", () => assert.equal(outCharge(5), 300));
  t("default out-state: 10kg and above -> top slab 300 (open-ended)", () => {
    assert.equal(outCharge(10), 300); assert.equal(outCharge(100), 300);
  });
}

// ── Pack size for weight when the cart line carries none ────────────────────
// The quick "+ Add" button sent no size, so the line weighed 0 kg and went out
// with free delivery (Crystal Gramoxone 1L x2, Telangana, 31 Oct 2026: ₹0
// delivery where the same order with "1L" was charged ₹150).
{
  const W = (o: Partial<Parameters<typeof C.packUnitForWeight>[0]>) =>
    C.packUnitForWeight({ variantUnit: "", hasSellerSource: false, canonicalBasePrice: 450, ...o });
  const oneL = [{ unit: "1L", price: 450 }];
  const twoSizes = [{ unit: "1L", price: 450 }, { unit: "5L", price: 2000 }];

  t("pack: a chosen size is kept as sent", () => {
    assert.deepEqual(W({ variantUnit: "5L", canonicalVariants: twoSizes }), { ok: true, unit: "5L" });
  });
  t("pack: one-size product with no size sent weighs its only size", () => {
    assert.deepEqual(W({ canonicalVariants: oneL }), { ok: true, unit: "1L" });
  });
  t("pack: multi-size product with no size sent must be chosen", () => {
    assert.deepEqual(W({ canonicalVariants: twoSizes }), { ok: false });
  });
  t("pack: the seller's own ladder wins over the product's", () => {
    assert.deepEqual(W({ sellerVariants: [{ unit: "5L", price: 1900 }], canonicalVariants: twoSizes }), { ok: true, unit: "5L" });
    assert.deepEqual(W({ sellerVariants: twoSizes, canonicalVariants: oneL }), { ok: false });
  });
  t("pack: duplicate spellings of one size count as one size", () => {
    assert.deepEqual(W({ canonicalVariants: [{ unit: "1L" }, { unit: "1 Ltr" }] }), { ok: true, unit: "1L" });
  });
  t("pack: retailer listing with no ladder weighs the base size", () => {
    assert.deepEqual(W({ hasSellerSource: true, canonicalVariants: twoSizes }), { ok: true, unit: "1L" });
  });
  t("pack: product with no sizes falls back to its base unit", () => {
    assert.deepEqual(W({ canonicalUnit: "500 gm" }), { ok: true, unit: "500 gm" });
    assert.deepEqual(W({}), { ok: true, unit: "" });
  });
  t("Gramoxone 1L x2 to Telangana from a Maharashtra seller: ₹150, not ₹0", () => {
    const def = {
      coverageType: "pan_india", sellerState: "Maharashtra",
      weightSlabs: DEFAULT_IN_STATE_SLABS, inStateSlabs: DEFAULT_IN_STATE_SLABS, outStateSlabs: DEFAULT_OUT_STATE_SLABS,
    };
    const pack = W({ canonicalVariants: oneL });
    assert.ok(pack.ok);
    const kg = 2 * parseVariantWeightKg(pack.ok ? pack.unit : "");
    assert.equal(kg, 2);
    assert.equal(C.computeSellerDelivery([line({ unitPrice: 450, qty: 2, weightKg: kg })], def, "Telangana").slab, 150);
  });
}

console.log(`\n${n} passed`);
