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
