// COPY of mobile/lib/features/dashboard/data/subscription_pricing.dart — the
// customer app's tested mirror of app/lib/pricing.ts. The sales app uses it to
// let a rep build offer links from ONLY the plans admin currently offers
// (settings/pricing). Keep the three in step; the server prices every order
// from the ladder regardless, so a stale copy can mis-display but never
// mis-charge.
/// Subscription pricing for the app — a Dart mirror of `app/lib/pricing.ts`.
///
/// The server (`/api/payment/create-order`) is the only thing that decides what
/// a seller is charged; everything here decides what the seller is SHOWN. Each
/// function names the TypeScript function it mirrors, and the two must agree
/// or the screen shows one price while Razorpay charges another. The unit
/// tests in test/subscription_pricing_test.dart pin the same cases as the web.
library;

/// Seats are sold in blocks of this size, and this is also the minimum buy.
/// Mirrors SEAT_STEP.
const seatStep = 10;

/// One-tap seat quantities offered under the input (Custom tab).
const seatPresets = [10, 100, 500];

/// Snaps a requested seat count to the sale rule: at least [seatStep], always a
/// whole multiple of it, rounding UP. Mirrors normalizeSeatCount.
int normalizeSeatCount(int raw) {
  if (raw <= seatStep) return seatStep;
  return ((raw + seatStep - 1) ~/ seatStep) * seatStep;
}

/// The two plan families on the subscription screen (Standard / Custom
/// toggle). Mirrors PlanTier.
enum PlanTier { standard, custom }

String durationLabel(int months) {
  if (months == 12) return '1 Year';
  if (months % 12 == 0) return '${months ~/ 12} Years';
  return months == 1 ? '1 Month' : '$months Months';
}

/// One row of the pricing ladder (settings/pricing `durations[]`).
class SubscriptionPlan {
  /// Ladder-unique key sent to create-order as `planId`. Rows without one are
  /// keyed by their period (see [key]).
  final String? id;
  final int months;
  final String label;
  final String? badge;
  final int pricePerSeat;

  /// Flat price for the whole period, overriding [pricePerSeat] when set.
  final int? flatPrice;

  /// Listings a flat plan includes.
  final int? includedListings;

  /// Account roles allowed to buy this plan. Empty means everyone.
  final List<String> roles;

  /// Standard (fixed pack, pick a period) or Custom (per listing).
  final PlanTier tier;

  /// Struck-through "was" price. Display only — never charged.
  final int? compareAtPrice;

  const SubscriptionPlan({
    required this.months,
    required this.label,
    required this.pricePerSeat,
    this.id,
    this.badge,
    this.flatPrice,
    this.includedListings,
    this.roles = const [],
    this.tier = PlanTier.custom,
    this.compareAtPrice,
  });

  String get key => id ?? '$months';
  bool get isFlat => flatPrice != null;
  bool get isStandard => tier == PlanTier.standard;

  /// "Standard" / "Custom". Mirrors planNameFor.
  String get planName => isStandard ? 'Standard' : 'Custom';

  /// Mirror of isPlanAllowed. The binding check is server-side; this only
  /// decides what to display.
  bool allowsRole(String? role) {
    if (roles.isEmpty) return true;
    final r = (role ?? '').trim().toLowerCase();
    return r.isNotEmpty && roles.contains(r);
  }

  /// Seats actually granted. Mirrors billableSeats: a Standard plan is one
  /// fixed pack and always grants its full listing count; other flat plans cap
  /// at their included listings; per-listing plans grant what was asked for.
  int billableSeats(int seats) {
    final n = seats < 1 ? 1 : seats;
    if (isStandard && includedListings != null) return includedListings!;
    if (flatPrice != null && includedListings != null) {
      return n < includedListings! ? n : includedListings!;
    }
    return n;
  }

  /// Mirrors computeAmount. Display only — the amount recorded after payment
  /// comes back from verify/.
  int totalPrice(int seats) => flatPrice ?? billableSeats(seats) * pricePerSeat;
}

/// Built-in ladder, used only when settings/pricing is missing or unreadable.
/// Mirrors DEFAULT_DURATIONS — keep the two identical.
const defaultSubscriptionPlans = [
  SubscriptionPlan(
    id: 'standard-monthly',
    tier: PlanTier.standard,
    months: 1,
    label: 'Monthly',
    pricePerSeat: 21,
    flatPrice: 2100,
    includedListings: 100,
  ),
  SubscriptionPlan(
    id: 'standard-yearly',
    tier: PlanTier.standard,
    months: 12,
    label: 'Yearly',
    pricePerSeat: 110,
    flatPrice: 11000,
    includedListings: 100,
    compareAtPrice: 14400,
    badge: 'Save 24%',
  ),
  SubscriptionPlan(months: 1, label: '1 Month', pricePerSeat: 21),
  SubscriptionPlan(
    months: 3,
    label: '3 Months',
    pricePerSeat: 54,
    badge: 'Save 14%',
  ),
  SubscriptionPlan(
    months: 6,
    label: '6 Months',
    pricePerSeat: 90,
    badge: 'Save 29%',
  ),
  SubscriptionPlan(
    months: 12,
    label: '1 Year',
    pricePerSeat: 144,
    badge: 'Best Value',
  ),
];

/// Parse the settings/pricing document. Returns null — never a partial ladder
/// — so callers fall back cleanly to [defaultSubscriptionPlans]. Mirrors
/// parseDurations, including its rejections.
List<SubscriptionPlan>? parseSubscriptionPlans(Map<String, dynamic>? data) {
  final raw = data?['durations'];
  if (raw is! List || raw.isEmpty) return null;

  final out = <SubscriptionPlan>[];
  final seen = <String>{};
  for (final item in raw) {
    if (item is! Map) return null;
    final months = (item['months'] as num?)?.toInt();
    final price = (item['pricePerSeat'] as num?)?.toInt();
    if (months == null || months <= 0) return null;
    if (price == null || price < 0) return null;

    final flat = (item['flatPrice'] as num?)?.toInt();
    final incl = (item['includedListings'] as num?)?.toInt();
    // A flat price with no listing cap would sell unlimited listings for a flat
    // fee. Reject the ladder rather than guess a cap.
    if ((flat == null) != (incl == null)) return null;
    if (flat != null && flat < 0) return null;
    if (incl != null && incl <= 0) return null;

    final rawTier = item['tier'];
    PlanTier tier = PlanTier.custom;
    if (rawTier != null && rawTier != '') {
      if (rawTier == 'standard') {
        tier = PlanTier.standard;
      } else if (rawTier != 'custom') {
        return null; // unknown tier — a data error, not "custom"
      }
    }
    if (tier == PlanTier.standard && flat == null) return null;

    final rawCompare = item['compareAtPrice'];
    int? compareAt;
    if (rawCompare != null && rawCompare != '') {
      compareAt = (rawCompare as num?)?.toInt();
      if (compareAt == null || compareAt <= 0) return null;
    }

    final rawId = item['id'];
    final id = rawId is String && rawId.trim().isNotEmpty ? rawId.trim() : null;
    final rawRoles = item['roles'];
    var roles = const <String>[];
    if (rawRoles != null) {
      if (rawRoles is! List) return null;
      roles = rawRoles
          .map((r) => (r ?? '').toString().trim().toLowerCase())
          .where((r) => r.isNotEmpty)
          .toSet()
          .toList();
    }

    final rawBadge = item['badge'];
    final badge = rawBadge is String && rawBadge.trim().isNotEmpty
        ? rawBadge.trim()
        : null;

    final plan = SubscriptionPlan(
      id: id,
      months: months,
      label: tier == PlanTier.standard && (months == 1 || months == 12)
          ? (months == 1 ? 'Monthly' : 'Yearly')
          : durationLabel(months),
      pricePerSeat: price,
      badge: badge,
      flatPrice: flat,
      includedListings: incl,
      roles: roles,
      tier: tier,
      compareAtPrice: compareAt,
    );
    if (!seen.add(plan.key)) return null;
    out.add(plan);
  }

  out.sort((a, b) => a.months.compareTo(b.months));
  return out;
}

// ─── Promo codes ────────────────────────────────────────────────────────────

/// Result of checking a promo against a purchase. [error] set = does not apply.
class PromoEvaluation {
  /// Percentage off (may be fractional, e.g. 12.5), 0 when not applicable.
  final double discountPercent;
  final String? code;
  final String? error;
  const PromoEvaluation({required this.discountPercent, this.code, this.error});
  bool get applies => error == null;
}

String _planLabel(int months) => months == 12
    ? 'Yearly'
    : months == 1
    ? 'Monthly'
    : '$months Month';

/// Whether a promoCodes/ document applies to a purchase — mirrors
/// evaluatePromo in app/lib/pricing.ts rule for rule and message for message,
/// so the app, the website and the server always agree on a code.
/// [seatCount] is the seats actually granted (a Standard plan's full pack).
PromoEvaluation evaluatePromo(
  Map<String, dynamic>? raw, {
  required int months,
  required int seatCount,
  DateTime? now,
}) {
  const invalid = PromoEvaluation(
    discountPercent: 0,
    error: 'Invalid or expired promo code.',
  );
  if (raw == null) return invalid;
  final code = (raw['code'] ?? '').toString().trim().toUpperCase();
  final pct = (raw['discountPercent'] as num?)?.toDouble();
  if (code.isEmpty || pct == null || pct <= 0 || pct > 100) return invalid;

  if (raw['active'] == false) {
    return const PromoEvaluation(
      discountPercent: 0,
      error: 'This promo code has been deactivated.',
    );
  }

  final today = (now ?? DateTime.now()).toUtc().toIso8601String().substring(
    0,
    10,
  );
  bool isIso(dynamic v) =>
      v is String && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v);
  final start = raw['startDate'];
  final end = raw['endDate'];
  if (isIso(start) && today.compareTo(start as String) < 0) {
    return const PromoEvaluation(
      discountPercent: 0,
      error: 'This promo code is not yet active.',
    );
  }
  if (isIso(end) && today.compareTo(end as String) > 0) {
    return const PromoEvaluation(
      discountPercent: 0,
      error: 'This promo code has expired.',
    );
  }

  final plans = raw['applicablePlans'];
  if (plans is List && plans.isNotEmpty) {
    final allowed = plans
        .map((p) => (p as num?)?.toInt())
        .whereType<int>()
        .where((n) => n > 0)
        .toList();
    if (allowed.isNotEmpty && !allowed.contains(months)) {
      return PromoEvaluation(
        discountPercent: 0,
        error:
            'This promo code is only valid for: ${allowed.map(_planLabel).join(', ')}.',
      );
    }
  }

  int? positiveInt(dynamic v) {
    final n = (v as num?)?.toDouble();
    if (n == null || n != n.roundToDouble() || n <= 0) return null;
    return n.toInt();
  }

  final minSeats = positiveInt(raw['minSeats']);
  if (minSeats != null && seatCount < minSeats) {
    return PromoEvaluation(
      discountPercent: 0,
      error: 'This promo code requires a minimum of $minSeats seats.',
    );
  }
  final maxSeats = positiveInt(raw['maxSeats']);
  if (maxSeats != null && seatCount > maxSeats) {
    return PromoEvaluation(
      discountPercent: 0,
      error: 'This promo code is only valid for up to $maxSeats seats.',
    );
  }

  return PromoEvaluation(discountPercent: pct, code: code);
}

/// Discounted amount. Mirrors applyDiscount EXACTLY — same expression, same
/// order of floating-point operations — so a fractional percentage rounds to
/// the same rupee here as on the server that charges it.
int applyDiscount(int subtotal, double discountPercent) {
  final discounted = (subtotal * (1 - discountPercent / 100)).ceil();
  return discounted < 0 ? 0 : discounted;
}

/// "12.5%" / "10%" — a percentage without a pointless ".0".
String formatPercent(double pct) =>
    pct == pct.roundToDouble() ? '${pct.toInt()}%' : '$pct%';
