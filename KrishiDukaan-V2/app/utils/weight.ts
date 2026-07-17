/**
 * Parse a variant unit string into an estimated weight in kilograms.
 * Returns 0 for unknown or unitless variants (bottle, pcs, pkt, can).
 *
 * Examples: "1kg"→1, "500g"→0.5, "250ml"→0.25, "2L"→2, "1.5kg"→1.5
 */
export function parseVariantWeightKg(variantUnit: string | undefined): number {
  if (!variantUnit) return 0;
  const s = variantUnit.trim();
  const kg = s.match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (kg) return parseFloat(kg[1]);
  const g = s.match(/^(\d+(?:\.\d+)?)\s*g(?:m)?$/i);
  if (g) return parseFloat(g[1]) / 1000;
  const l = s.match(/^(\d+(?:\.\d+)?)\s*l(?:itre)?$/i);
  if (l) return parseFloat(l[1]);
  const ml = s.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]) / 1000;
  return 0;
}

/**
 * Canonicalize a variant unit string so equivalent values compare equal.
 *
 * The same package size can be entered/stored in many surface forms across the
 * product catalogue and per-store inventory copies. This collapses them to one
 * stable token so variant matching never fails on cosmetic differences.
 *
 * Volume / weight units are normalized to `<number><canonical-unit>`:
 *   "2L" | "2 l" | "2l" | "2ltr" | "2 Liter" | "2 litres"   → "2l"
 *   "500ml" | "500 ML" | "500 millilitre"                   → "500ml"
 *   "1kg" | "1 KG" | "1 kilogram"                            → "1kg"
 *   "250g" | "250 gm" | "250 grams"                          → "250g"
 * Trailing ".0" is dropped so "2.0L" matches "2L".
 *
 * Unrecognized units (bottle, pcs, pkt, can, …) fall back to a lowercased,
 * whitespace-collapsed form so "5 Bottle" still equals "5bottle" without
 * forcing them into a measured-unit bucket.
 */
export function normalizeUnit(unit: string | undefined | null): string {
  if (unit == null) return '';
  const s = String(unit).trim().toLowerCase();
  if (!s) return '';

  const measured = s.match(
    /^(\d+(?:\.\d+)?)\s*(kilograms?|kilogram|kgs?|kg|grams?|gms?|gm|g|millilitres?|milliliters?|mls?|ml|litres?|liters?|ltrs?|ltr|ls?|l)$/,
  );
  if (measured) {
    let num = measured[1];
    if (num.includes('.')) num = num.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    const raw = measured[2];
    let canon: string;
    if (/^(kilograms?|kilogram|kgs?|kg)$/.test(raw)) canon = 'kg';
    else if (/^(millilitres?|milliliters?|mls?|ml)$/.test(raw)) canon = 'ml';
    else if (/^(grams?|gms?|gm|g)$/.test(raw)) canon = 'g';
    else canon = 'l'; // litres
    return `${num}${canon}`;
  }

  // Non-measured unit: strip all internal whitespace so spacing differences match.
  return s.replace(/\s+/g, '');
}
