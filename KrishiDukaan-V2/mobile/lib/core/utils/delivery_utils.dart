/// Delivery + per-seller cart pricing — a Dart mirror of `app/utils/delivery.ts`
/// and `app/lib/cart-pricing.ts`.
///
/// One rule set, three implementations (website, server, this app). The server
/// is the authority for what is charged; this code produces the estimate the
/// customer sees before paying and must land on the same figure:
///
///  * The weight slab is chosen by the CUSTOMER'S delivery state. A pan-India
///    seller keeps separate in-state and out-of-state slabs.
///  * Free-delivery products add no weight and no charge. A shipment where
///    every item is free ships free; what it would have cost is kept as
///    `waived` so the invoice can show it struck through.
///  * Zero chargeable weight → only the per-product extra applies. An item with
///    no parseable pack size must not pick up the lowest slab.
///  * Missing / unreadable settings → only the per-product extra.
library;

import 'gst_utils.dart';

/// One weight band of a seller's delivery charge.
class WeightSlab {
  final double minKg;
  final double maxKg;
  final double charge;
  const WeightSlab({
    required this.minKg,
    required this.maxKg,
    required this.charge,
  });

  factory WeightSlab.fromMap(Map<dynamic, dynamic> m) => WeightSlab(
        minKg: (m['minKg'] as num).toDouble(),
        maxKg: (m['maxKg'] as num).toDouble(),
        charge: (m['charge'] as num).toDouble(),
      );

  Map<String, dynamic> toMap() =>
      {'minKg': minKg, 'maxKg': maxKg, 'charge': charge};
}

/// Which slab set applied. Serialised as in_state / out_state / default — the
/// values the web and the order record use.
enum DeliveryType {
  inState('in_state'),
  outState('out_state'),
  defaultSlabs('default');

  final String value;
  const DeliveryType(this.value);

  static DeliveryType parse(Object? v) => DeliveryType.values.firstWhere(
        (t) => t.value == v,
        orElse: () => DeliveryType.defaultSlabs,
      );
}

/// Alternative spellings of the same state / UT → the canonical (lower-case,
/// "and" not "&") form. Mirrors STATE_ALIASES in app/utils/delivery.ts.
/// Google returns "Jammu and Kashmir" or "NCT of Delhi" where a seller's own
/// list says "Jammu & Kashmir" or "Delhi", and older names such as "Orissa" are
/// still typed by hand. A miss here is not harmless: an in-state customer would
/// be charged the OUTSIDE-state rate.
const _stateAliases = {
  'orissa': 'odisha',
  'uttaranchal': 'uttarakhand',
  'pondicherry': 'puducherry',
  'nct of delhi': 'delhi',
  'new delhi': 'delhi',
  'delhi ncr': 'delhi',
  'telengana': 'telangana',
  'chattisgarh': 'chhattisgarh',
  'andaman and nicobar': 'andaman and nicobar islands',
  'andaman nicobar islands': 'andaman and nicobar islands',
  // One UT since 2020; the two old halves both mean it.
  'dadra and nagar haveli': 'dadra and nagar haveli and daman and diu',
  'daman and diu': 'dadra and nagar haveli and daman and diu',
  'daman diu': 'dadra and nagar haveli and daman and diu',
};

/// Canonical form of a state name for comparison; '' when there is none.
String canonicalState(String? v) {
  final s = (v ?? '')
      .trim()
      .toLowerCase()
      .replaceAll('&', ' and ')
      .replaceAll(RegExp(r'[.,\-]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return _stateAliases[s] ?? s;
}

/// Same-state check over canonical names. Empty on either side → false.
bool isSameState(String? a, String? b) {
  final na = canonicalState(a);
  final nb = canonicalState(b);
  if (na.isEmpty || nb.isEmpty) return false;
  return na == nb;
}

List<WeightSlab> _slabList(Object? v) {
  if (v is! List) return const [];
  final out = <WeightSlab>[];
  for (final s in v) {
    if (s is Map &&
        s['minKg'] is num &&
        s['maxKg'] is num &&
        s['charge'] is num) {
      out.add(WeightSlab.fromMap(s));
    }
  }
  return out;
}

class ResolvedSlabs {
  final List<WeightSlab> slabs;
  final DeliveryType type;
  const ResolvedSlabs(this.slabs, this.type);
}

/// Picks the slab set for a customer's delivery state. Mirrors
/// resolveDeliverySlabs, including its fallbacks:
///  * `states` coverage → the single `weightSlabs` set.
///  * pan-India, same state → `inStateSlabs`; other state → `outStateSlabs`
///    (each falls back to `weightSlabs` if unset).
///  * seller or customer state unknown → `weightSlabs`, type `default` — how
///    every pan-India seller behaved before the two-slab feature.
ResolvedSlabs resolveDeliverySlabs(
  Map<String, dynamic> data,
  String? customerState,
) {
  final coverage = data['coverageType'] == 'states' ? 'states' : 'pan_india';
  final legacy = _slabList(data['weightSlabs']);

  if (coverage == 'states') {
    return ResolvedSlabs(legacy, DeliveryType.defaultSlabs);
  }

  final sellerState = data['sellerState'];
  // "Empty" matches JS falsiness: null / '' only (a whitespace-only string is
  // truthy there and is then compared, and does not match).
  if (sellerState is! String ||
      sellerState.isEmpty ||
      customerState == null ||
      customerState.isEmpty) {
    return ResolvedSlabs(legacy, DeliveryType.defaultSlabs);
  }

  final inSlabs = _slabList(data['inStateSlabs']);
  final outSlabs = _slabList(data['outStateSlabs']);
  if (isSameState(sellerState, customerState)) {
    return ResolvedSlabs(
        inSlabs.isNotEmpty ? inSlabs : legacy, DeliveryType.inState);
  }
  return ResolvedSlabs(
      outSlabs.isNotEmpty ? outSlabs : legacy, DeliveryType.outState);
}

/// Resolves a chargeable weight to a slab charge; 0 when nothing matches. The
/// last slab is open-ended. Mirrors chargeFromSlabs.
double chargeFromSlabs(double weightKg, List<WeightSlab> slabs) {
  final sorted = [...slabs]..sort((a, b) => a.minKg.compareTo(b.minKg));
  for (final s in sorted) {
    if (weightKg >= s.minKg && weightKg < s.maxKg) return s.charge;
  }
  if (sorted.isNotEmpty && weightKg >= sorted.last.minKg) {
    return sorted.last.charge;
  }
  return 0;
}

/// One cart line as the pricing rules see it.
class CartPricingLine {
  final String sellerKey;

  /// Post-discount unit price — GST is computed on this.
  final double unitPrice;
  final int qty;

  /// qty × per-unit pack weight, in kg.
  final double weightKg;
  final bool gstApplicable;
  final double gstRate;
  final bool gstIncluded;
  final double extraDeliveryCharge;
  final bool freeDelivery;

  const CartPricingLine({
    required this.sellerKey,
    required this.unitPrice,
    required this.qty,
    required this.weightKg,
    this.gstApplicable = false,
    this.gstRate = 0,
    this.gstIncluded = true,
    this.extraDeliveryCharge = 0,
    this.freeDelivery = false,
  });
}

class DeliveryBreakdown {
  /// Weight-slab component actually charged (0 if free).
  final double slab;

  /// Per-product extra actually charged (0 if free).
  final double extra;
  final bool free;

  /// What would have been charged when Free Delivery overrode it.
  final double waived;
  final DeliveryType type;

  const DeliveryBreakdown({
    required this.slab,
    required this.extra,
    required this.free,
    required this.waived,
    required this.type,
  });

  double get charge => free ? 0 : round2(slab + extra);

  /// The shape written to `orders/{id}.deliveryBreakdown`.
  Map<String, dynamic> toMap() => {
        'slab': slab,
        'extra': extra,
        'free': free,
        'waived': waived,
        'deliveryType': type.value,
      };

  factory DeliveryBreakdown.fromMap(Map<dynamic, dynamic> m) =>
      DeliveryBreakdown(
        slab: (m['slab'] as num?)?.toDouble() ?? 0,
        extra: (m['extra'] as num?)?.toDouble() ?? 0,
        free: m['free'] == true,
        waived: (m['waived'] as num?)?.toDouble() ?? 0,
        type: DeliveryType.parse(m['deliveryType']),
      );
}

/// Delivery for ONE seller's lines. [settings] null = no readable settings.
/// Mirrors computeSellerDelivery.
DeliveryBreakdown computeSellerDelivery(
  List<CartPricingLine> lines,
  Map<String, dynamic>? settings,
  String? customerState,
) {
  final chargeable = lines.where((l) => !l.freeDelivery).toList();
  final isFree = lines.isNotEmpty && chargeable.isEmpty;

  double extraOf(List<CartPricingLine> ls) => round2(ls.fold(
      0.0, (s, l) => s + (l.extraDeliveryCharge > 0 ? l.extraDeliveryCharge : 0)));
  double weightOf(List<CartPricingLine> ls) =>
      round3(ls.fold(0.0, (s, l) => s + l.weightKg));

  var type = DeliveryType.defaultSlabs;
  double slabFor(double weightKg) {
    if (settings == null || weightKg <= 0) return 0;
    final resolved = resolveDeliverySlabs(settings, customerState);
    type = resolved.type;
    return resolved.slabs.isNotEmpty
        ? chargeFromSlabs(weightKg, resolved.slabs)
        : 0;
  }

  if (isFree) {
    final waived = round2(slabFor(weightOf(lines)) + extraOf(lines));
    return DeliveryBreakdown(
        slab: 0, extra: 0, free: true, waived: waived, type: type);
  }

  final slab = slabFor(weightOf(chargeable));
  return DeliveryBreakdown(
      slab: slab,
      extra: extraOf(chargeable),
      free: false,
      waived: 0,
      type: type);
}

class SellerPricing {
  final String sellerKey;

  /// Sum of post-discount line prices, before any added GST.
  final double subtotal;

  /// All GST in the order (included + excluded) — for the invoice.
  final double gstTotal;

  /// GST ADDED to the payable total (excluded lines only).
  final double gstAdded;
  final double deliveryCharge;
  final DeliveryBreakdown delivery;

  /// subtotal + gstAdded + deliveryCharge.
  final double total;

  const SellerPricing({
    required this.sellerKey,
    required this.subtotal,
    required this.gstTotal,
    required this.gstAdded,
    required this.deliveryCharge,
    required this.delivery,
    required this.total,
  });

  /// Parses one entry of create-cart-order's `sellerBreakdown`.
  factory SellerPricing.fromMap(Map<dynamic, dynamic> m) => SellerPricing(
        sellerKey: '${m['sellerKey'] ?? ''}',
        subtotal: (m['subtotal'] as num?)?.toDouble() ?? 0,
        gstTotal: (m['gstTotal'] as num?)?.toDouble() ?? 0,
        gstAdded: (m['gstAdded'] as num?)?.toDouble() ?? 0,
        deliveryCharge: (m['deliveryCharge'] as num?)?.toDouble() ?? 0,
        delivery: DeliveryBreakdown.fromMap(
            (m['delivery'] as Map?) ?? const <String, dynamic>{}),
        total: (m['total'] as num?)?.toDouble() ?? 0,
      );
}

/// Full per-seller pricing: subtotal, GST and delivery. Mirrors
/// computeSellerPricing.
SellerPricing computeSellerPricing(
  String sellerKey,
  List<CartPricingLine> lines,
  Map<String, dynamic>? settings,
  String? customerState,
) {
  var subtotal = 0.0, gstTotal = 0.0, gstAdded = 0.0;
  for (final l in lines) {
    final p = computeLinePricing(
      unitPrice: l.unitPrice,
      qty: l.qty,
      gstApplicable: l.gstApplicable,
      gstRate: l.gstRate,
      gstIncluded: l.gstIncluded,
    );
    subtotal += p.net;
    gstTotal += p.gstTotal;
    gstAdded += p.gstAdded;
  }
  final delivery = computeSellerDelivery(lines, settings, customerState);
  final deliveryCharge = delivery.charge;
  return SellerPricing(
    sellerKey: sellerKey,
    subtotal: round2(subtotal),
    gstTotal: round2(gstTotal),
    gstAdded: round2(gstAdded),
    deliveryCharge: deliveryCharge,
    delivery: delivery,
    total: round2(subtotal + gstAdded + deliveryCharge),
  );
}
