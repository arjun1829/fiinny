/// GST maths for a cart / order line — a Dart mirror of `app/utils/gst.ts`.
///
/// The website, the server (`/api/payment/create-cart-order`) and this app must
/// all turn a price + GST settings into the same payable numbers, or the screen
/// shows one total while Razorpay charges another. The calculation order the
/// whole platform follows:
///
///   Original Price → Discount → Discounted Price → GST → Delivery → Final
///
/// [unitPrice] below is the ALREADY-DISCOUNTED price, so GST is always computed
/// on the discounted price. Included GST is already inside the price (backed
/// out for display, never added); only EXCLUDED GST is added to the total.
/// test/gst_delivery_test.dart pins the same cases as the web's tests.
library;

/// Predefined GST slabs offered as quick-pick chips. Sellers may also enter a
/// custom rate.
const gstRates = [0, 5, 12, 18, 28];

/// `Number(x.toFixed(2))` — JavaScript rounds the exact double, ties up; Dart's
/// toStringAsFixed does the same for the positive amounts used here.
double round2(double x) => double.parse(x.toStringAsFixed(2));
double round3(double x) => double.parse(x.toStringAsFixed(3));

/// Any stored / entered value → a valid GST rate: non-negative, at most 100,
/// invalid → 0. Mirrors normalizeGstRate.
double normalizeGstRate(Object? raw) {
  final n = raw is num ? raw.toDouble() : double.tryParse('$raw');
  if (n == null || n.isNaN || n < 0) return 0;
  return n > 100 ? 100 : n;
}

/// GST for one unit at [price]. Inclusive backs the component out of the price
/// (`price - price / (1 + rate/100)`); exclusive is `price * rate / 100`.
double gstAmountPerUnit(double price, double rate, bool included) {
  if (rate <= 0 || price <= 0 || price.isNaN || price.isInfinite) return 0;
  final amount =
      included ? price - price / (1 + rate / 100) : (price * rate) / 100;
  return round2(amount);
}

class LinePricing {
  /// True only when GST really applies (applicable and rate > 0).
  final bool applicable;

  /// Resolved inclusive flag (false for non-applicable lines).
  final bool included;

  /// GST for a single unit.
  final double gstPerUnit;

  /// GST across the quantity (included or added).
  final double gstTotal;

  /// unitPrice × qty, before any GST is added.
  final double net;

  /// GST ADDED to the payable total. 0 when included.
  final double gstAdded;

  /// Payable line total = net + gstAdded.
  final double lineTotal;

  const LinePricing({
    required this.applicable,
    required this.included,
    required this.gstPerUnit,
    required this.gstTotal,
    required this.net,
    required this.gstAdded,
    required this.lineTotal,
  });
}

/// Mirrors computeLinePricing. [gstIncluded] defaults to TRUE — a line is only
/// exclusive when explicitly set to false.
LinePricing computeLinePricing({
  required double unitPrice,
  int qty = 1,
  bool gstApplicable = false,
  double gstRate = 0,
  bool gstIncluded = true,
}) {
  final price =
      (unitPrice.isFinite && unitPrice > 0) ? unitPrice : 0.0;
  final applicable = gstApplicable && gstRate.isFinite && gstRate > 0;
  final included = applicable ? gstIncluded : false;

  final gstPerUnit =
      applicable ? gstAmountPerUnit(price, gstRate, included) : 0.0;
  final gstTotal = round2(gstPerUnit * qty);
  final net = round2(price * qty);
  final gstAdded = included ? 0.0 : gstTotal;
  final lineTotal = round2(net + gstAdded);

  return LinePricing(
    applicable: applicable,
    included: included,
    gstPerUnit: gstPerUnit,
    gstTotal: gstTotal,
    net: net,
    gstAdded: gstAdded,
    lineTotal: lineTotal,
  );
}
