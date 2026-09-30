import '../utils/gst_utils.dart';

/// A store's own GST + delivery settings for one product — the same fields the
/// website keeps on a seller's product copy, and that the server reads when it
/// prices a cart (`commercialOf` in app/lib/cart-pricing.ts).
class StoreCommercial {
  final bool gstApplicable;
  final double gstRate;

  /// Whether [gstRate] is already inside the price. Defaults to TRUE — only an
  /// explicit false is exclusive.
  final bool gstIncluded;
  final double extraDeliveryCharge;
  final bool freeDelivery;

  const StoreCommercial({
    this.gstApplicable = false,
    this.gstRate = 0,
    this.gstIncluded = true,
    this.extraDeliveryCharge = 0,
    this.freeDelivery = false,
  });

  static const none = StoreCommercial();

  /// Field names a document may carry. A document with none of them predates
  /// the feature and must not be read as "explicitly no GST".
  static const keys = [
    'gstApplicable',
    'gstRate',
    'gstIncluded',
    'extraDeliveryCharge',
    'freeDelivery',
  ];

  /// Whether [d] carries any commercial settings at all. Mirrors hasCommercial.
  static bool hasAny(Map<String, dynamic>? d) =>
      d != null && keys.any(d.containsKey);

  /// Reads settings from a product / copy / inventory / availability document.
  /// Mirrors commercialOf: rate clamped to 0–100, included by default.
  factory StoreCommercial.fromMap(Map<String, dynamic>? d) {
    if (d == null) return none;
    final rate = normalizeGstRate(d['gstRate']);
    final extra = (d['extraDeliveryCharge'] as num?)?.toDouble() ?? 0;
    return StoreCommercial(
      gstApplicable: d['gstApplicable'] == true,
      gstRate: rate,
      gstIncluded: d['gstIncluded'] != false,
      extraDeliveryCharge: extra > 0 ? extra : 0,
      freeDelivery: d['freeDelivery'] == true,
    );
  }

  /// The first document that carries any settings wins — copy, inventory,
  /// availability entry, canonical — exactly the server's order.
  static StoreCommercial firstOf(Iterable<Map<String, dynamic>?> docs) {
    for (final d in docs) {
      if (hasAny(d)) return StoreCommercial.fromMap(d);
    }
    return none;
  }
}
