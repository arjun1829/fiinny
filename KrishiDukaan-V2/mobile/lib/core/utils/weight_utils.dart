/// Utility for parsing variant labels into estimated weights.
///
/// Mirrors the web app's `parseVariantWeightKg()` from `app/utils/weight.ts`
/// so that delivery‐charge calculations stay consistent across platforms.

/// Parse a variant unit string into an estimated weight in kilograms.
/// Returns 0 for unknown or unitless variants (bottle, pcs, pkt, can).
///
/// Examples: "1kg"→1, "500g"→0.5, "250ml"→0.25, "2L"→2, "1.5kg"→1.5, "800ml"→0.8
double parseVariantWeightKg(String? variantUnit) {
  if (variantUnit == null || variantUnit.trim().isEmpty) return 0;
  final s = variantUnit.trim();

  // kg
  final kgMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*kg$', caseSensitive: false).firstMatch(s);
  if (kgMatch != null) return double.parse(kgMatch.group(1)!);

  // g / gm
  final gMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*g(?:m)?$', caseSensitive: false).firstMatch(s);
  if (gMatch != null) return double.parse(gMatch.group(1)!) / 1000;

  // L / litre
  final lMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*l(?:itre)?$', caseSensitive: false).firstMatch(s);
  if (lMatch != null) return double.parse(lMatch.group(1)!);

  // ml
  final mlMatch = RegExp(r'^(\d+(?:\.\d+)?)\s*ml$', caseSensitive: false).firstMatch(s);
  if (mlMatch != null) return double.parse(mlMatch.group(1)!) / 1000;

  return 0;
}
