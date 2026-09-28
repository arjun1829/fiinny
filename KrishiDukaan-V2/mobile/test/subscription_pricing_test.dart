import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/dashboard/data/subscription_pricing.dart';

/// Same cases as the web's pricing tests (app/lib/pricing.ts): the app must
/// show exactly what /api/payment/create-order charges.
Map<String, dynamic> _row(SubscriptionPlan p) => {
      if (p.id != null) 'id': p.id,
      if (p.isStandard) 'tier': 'standard',
      'months': p.months,
      'pricePerSeat': p.pricePerSeat,
      if (p.flatPrice != null) 'flatPrice': p.flatPrice,
      if (p.includedListings != null) 'includedListings': p.includedListings,
      if (p.compareAtPrice != null) 'compareAtPrice': p.compareAtPrice,
      if (p.badge != null) 'badge': p.badge,
    };

void main() {
  final ladder = parseSubscriptionPlans({
    'durations': defaultSubscriptionPlans.map(_row).toList(),
  })!;
  SubscriptionPlan byKey(String k) => ladder.firstWhere((p) => p.key == k);

  test('defaults survive a save/parse round trip', () {
    expect(ladder.length, 6);
    final sy = byKey('standard-yearly');
    expect(sy.isStandard, isTrue);
    expect(sy.compareAtPrice, 14400);
    expect(sy.flatPrice, 11000);
    expect(sy.label, 'Yearly');
  });

  test('tiers split 2 standard / 4 custom', () {
    expect(ladder.where((p) => p.isStandard).length, 2);
    expect(ladder.where((p) => !p.isStandard).length, 4);
  });

  test('Standard grants its full 100 and charges the flat price, whatever seats', () {
    final sm = byKey('standard-monthly');
    for (final seats in [1, 10, 100, 5000]) {
      expect(sm.totalPrice(seats), 2100);
      expect(sm.billableSeats(seats), 100);
    }
    expect(byKey('standard-yearly').totalPrice(100), 11000);
  });

  test('Custom stays per listing', () {
    expect(byKey('12').totalPrice(100), 14400);
    expect(byKey('1').totalPrice(30), 630);
  });

  test('rejects a Standard row without a flat price, and an unknown tier', () {
    expect(
        parseSubscriptionPlans({
          'durations': [
            {'id': 's', 'tier': 'standard', 'months': 1, 'pricePerSeat': 21}
          ]
        }),
        isNull);
    expect(
        parseSubscriptionPlans({
          'durations': [
            {'months': 1, 'pricePerSeat': 21, 'tier': 'gold'}
          ]
        }),
        isNull);
  });

  test('a legacy ladder without tiers parses as all Custom', () {
    final legacy = parseSubscriptionPlans({
      'durations': [
        {'months': 1, 'pricePerSeat': 21},
        {'months': 12, 'pricePerSeat': 144},
      ]
    })!;
    expect(legacy.every((p) => !p.isStandard), isTrue);
  });

  test('seat rule matches normalizeSeatCount', () {
    expect(normalizeSeatCount(0), 10);
    expect(normalizeSeatCount(10), 10);
    expect(normalizeSeatCount(15), 20);
    expect(normalizeSeatCount(101), 110);
  });

  group('promo evaluation mirrors the server', () {
    final day = DateTime.utc(2026, 9, 28);

    test('applies to Standard yearly against its granted 100 seats', () {
      final e = evaluatePromo(
        {'code': 'x10', 'discountPercent': 10, 'applicablePlans': [12], 'minSeats': 50},
        months: 12,
        seatCount: byKey('standard-yearly').billableSeats(10),
        now: day,
      );
      expect(e.applies, isTrue);
      expect(e.code, 'X10');
      expect(applyDiscount(11000, e.discountPercent), 9900);
    });

    test('same messages as the web for each failed rule', () {
      expect(
          evaluatePromo({'code': 'A', 'discountPercent': 10, 'active': false},
                  months: 1, seatCount: 10, now: day)
              .error,
          'This promo code has been deactivated.');
      expect(
          evaluatePromo(
                  {'code': 'A', 'discountPercent': 10, 'endDate': '2026-09-27'},
                  months: 1, seatCount: 10, now: day)
              .error,
          'This promo code has expired.');
      expect(
          evaluatePromo(
                  {'code': 'A', 'discountPercent': 10, 'startDate': '2026-10-01'},
                  months: 1, seatCount: 10, now: day)
              .error,
          'This promo code is not yet active.');
      expect(
          evaluatePromo(
                  {'code': 'A', 'discountPercent': 10, 'applicablePlans': [12]},
                  months: 1, seatCount: 10, now: day)
              .error,
          'This promo code is only valid for: Yearly.');
      expect(
          evaluatePromo({'code': 'A', 'discountPercent': 10, 'maxSeats': 50},
                  months: 1, seatCount: 100, now: day)
              .error,
          'This promo code is only valid for up to 50 seats.');
      expect(
          evaluatePromo({'code': 'A', 'discountPercent': 150},
                  months: 1, seatCount: 10, now: day)
              .error,
          'Invalid or expired promo code.');
    });

    test('fractional percentages round like the server', () {
      // JS: Math.ceil(2100 * (1 - 12.5 / 100)) = 1838
      expect(applyDiscount(2100, 12.5), 1838);
      expect(formatPercent(12.5), '12.5%');
      expect(formatPercent(10), '10%');
    });
  });
}
