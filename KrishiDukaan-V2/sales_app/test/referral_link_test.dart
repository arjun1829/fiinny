import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_sales/features/referrals/data/plan_ladder.dart';
import 'package:krishidukaan_sales/features/referrals/data/referral_repository.dart';

void main() {
  SubscriptionPlan byKey(String k) =>
      defaultSubscriptionPlans.firstWhere((p) => p.key == k);

  test('plain referral link carries only the code', () {
    final uri = Uri.parse(referralLink('RAHUL'));
    expect(uri.path, '/subscribe');
    expect(uri.queryParameters, {'ref': 'RAHUL'});
  });

  test('Standard offer sends the plan key but never a seat count', () {
    final uri = Uri.parse(
        referralLink('RAHUL', plan: byKey('standard-yearly'), seats: 15));
    expect(uri.queryParameters, {'ref': 'RAHUL', 'plan': 'standard-yearly'});
  });

  test('Custom offer seats are snapped to the 10-block rule', () {
    // "We don't offer 15 seats" — a link can never ask for an unsold quantity.
    final uri = Uri.parse(referralLink('RAHUL', plan: byKey('12'), seats: 15));
    expect(uri.queryParameters, {'ref': 'RAHUL', 'plan': '12', 'seats': '20'});
    final min = Uri.parse(referralLink('RAHUL', plan: byKey('1'), seats: 3));
    expect(min.queryParameters['seats'], '10');
  });

  test('offer price shown to the rep matches checkout pricing', () {
    expect(byKey('standard-monthly').totalPrice(10), 2100);
    expect(byKey('standard-yearly').totalPrice(10), 11000);
    expect(byKey('3').totalPrice(normalizeSeatCount(15)), 54 * 20);
  });
}
