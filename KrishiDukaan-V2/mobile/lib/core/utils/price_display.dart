/// The price line a product card shows: what the buyer pays and, only for a
/// real discount, the same offer's pre-discount price struck out with "% off".
///
///   ₹86,999  ₹99,900  12% off
///
/// Mirrors web's app/lib/price-display.ts so both platforms agree.
class DisplayPrice {
  /// What the buyer pays.
  final double price;

  /// The pre-discount price of the same offer, or null without a discount.
  final double? mrp;

  /// Whole-number % off, rounded down; 0 without a discount.
  final int pct;

  const DisplayPrice._(this.price, this.mrp, this.pct);

  bool get hasOffer => mrp != null && pct > 0;

  double get savings => hasOffer ? mrp! - price : 0;

  /// [price] against [mrp]; under 1% off is rounding noise, not an offer.
  factory DisplayPrice.of(double price, double? mrp) {
    final p = mrp == null ? 0 : pctOff(mrp, price);
    return p >= 1 ? DisplayPrice._(price, mrp, p) : DisplayPrice._(price, null, 0);
  }

  /// One seller's price with its own discount %.
  factory DisplayPrice.seller(double base, double discountPct) =>
      DisplayPrice.of(applyPct(base, discountPct), base);

  static double applyPct(double base, double pct) {
    final p = pct.clamp(0, 99).toDouble();
    return (base * (1 - p / 100) * 100).roundToDouble() / 100;
  }

  /// % off rounded down so the badge never overstates the saving; the epsilon
  /// keeps an exact 10% from flooring to 9 on float error.
  static int pctOff(double mrp, double price) {
    if (mrp <= 0 || price >= mrp) return 0;
    return ((1 - price / mrp) * 100 + 1e-6).floor();
  }
}
