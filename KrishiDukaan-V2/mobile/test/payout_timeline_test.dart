import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/features/dashboard/widgets/payout_timeline_view.dart';
import 'package:krishidukaan_app/core/models/order_model.dart';
import 'package:krishidukaan_app/features/dashboard/data/payout_timeline.dart';
import 'package:krishidukaan_app/features/dashboard/providers/dashboard_provider.dart';

/// Mirrors the website's timeline cases (app/lib/payout-timeline.ts).
final now = DateTime.parse('2026-10-08T06:30:00.000Z');
const h = Duration(hours: 1);

OrderModel order({
  String status = 'accepted',
  bool online = true,
  DateTime? deliveredAt,
  OrderPayoutModel? payout,
  String? transferId,
  double? refundedAmount,
  DateTime? releaseAt,
}) =>
    OrderModel(
      id: 'o1',
      customerId: 'c',
      customerName: 'C',
      customerPhone: '+919000000000',
      customerAddress: const {},
      sellerId: 's',
      sellerName: 'S',
      sellerType: 'retailer',
      items: const [],
      subtotal: 1000,
      deliveryCharge: 0,
      total: 1000,
      status: status,
      createdAt: now.subtract(const Duration(hours: 72)),
      statusHistory: [
        if (deliveredAt != null) {'status': 'delivered', 'at': deliveredAt.toIso8601String()},
        if (status == 'rejected') {'status': 'rejected', 'at': now.subtract(h).toIso8601String()},
      ],
      payment: online
          ? OrderPaymentModel(
              razorpayPaymentId: 'pay_1',
              status: 'paid',
              amount: 1000,
              transferId: transferId,
              refundedAmount: refundedAmount,
            )
          : null,
      payout: payout,
      releaseAt: releaseAt,
    );

String keys(PayoutTimeline t) => t.steps.map((s) => '${s.key}:${s.status.name}').join(' ');

void main() {
  final delivered = now.subtract(const Duration(hours: 2));

  test('not delivered: waiting, next step is delivery', () {
    final t = payoutTimeline(order(payout: const OrderPayoutModel(state: 'on_hold', transferId: 'trf_1', amount: 970)), now: now);
    expect(t.headline, 'Waiting for delivery');
    expect(keys(t), 'placed:done paid:done held:done delivered:current released:upcoming settled:upcoming');
    expect(t.steps[2].detail, contains('trf_1'));
  });

  test('release scheduled shows the time', () {
    final t = payoutTimeline(
        order(status: 'delivered', deliveredAt: delivered, payout: OrderPayoutModel(state: 'scheduled', transferId: 'trf_1', onHoldUntil: now.add(const Duration(hours: 22)))),
        now: now);
    expect(t.headline, startsWith('Releases '));
    expect(t.steps[4].status, TimelineStatus.current);
  });

  test('released: on the way; settled: in your bank', () {
    var t = payoutTimeline(order(status: 'delivered', deliveredAt: delivered, payout: const OrderPayoutModel(state: 'processing', transferId: 'trf_1')), now: now);
    expect(t.headline, 'On the way to your bank');
    expect(keys(t), endsWith('released:done settled:current'));
    t = payoutTimeline(
        order(status: 'delivered', deliveredAt: delivered, payout: OrderPayoutModel(state: 'settled', transferId: 'trf_1', settlementId: 'setl_9', settledAt: now.subtract(h))),
        now: now);
    expect(t.headline, startsWith('In your bank since'));
    expect(t.tone, TimelineTone.good);
    expect(t.steps.last.detail, contains('setl_9'));
  });

  test('settled with UTR: Razorpay settlement time and bank reference', () {
    final setl = now.subtract(const Duration(hours: 5));
    final t = payoutTimeline(
        order(status: 'delivered', deliveredAt: delivered, payout: OrderPayoutModel(state: 'settled', transferId: 'trf_1', settlementId: 'setl_9', settledAt: now, settlementAt: setl, utr: 'UTIB0001234')),
        now: now);
    expect(t.steps.last.at, setl);
    expect(t.steps.last.detail, contains('UTIB0001234'));
    expect(t.headline, contains(fmtWhen(setl)));
  });

  test('delivered but held: reassuring for the seller', () {
    final t = payoutTimeline(order(status: 'delivered', deliveredAt: delivered, payout: const OrderPayoutModel(state: 'on_hold', transferId: 'trf_1')), now: now);
    expect(t.steps[4].detail, contains('KrishiDukan releases it shortly'));
  });

  test('not on Route: payout run due date', () {
    final t = payoutTimeline(order(status: 'delivered', deliveredAt: delivered, payout: const OrderPayoutModel(state: 'not_routed')), now: now);
    expect(t.headline, 'Waiting for payout');
    expect(t.steps[4].detail, startsWith('Due '));
  });

  test('payout run transfer: sent, on the way', () {
    final t = payoutTimeline(order(status: 'delivered', deliveredAt: delivered, transferId: 'trf_B', payout: const OrderPayoutModel(state: 'processing', via: 'balance', transferId: 'trf_B')), now: now);
    expect(t.steps[4].label, 'Sent by KrishiDukan');
    expect(t.headline, 'On the way to your bank');
  });

  test('rejected and refunded: stops and explains', () {
    final t = payoutTimeline(order(status: 'rejected', refundedAmount: 1000), now: now);
    expect(t.headline, 'Refunded to customer');
    expect(t.steps.length, 3);
    expect(t.steps.last.detail, contains('1,000'));
  });

  test('failed transfer and cash orders', () {
    expect(payoutTimeline(order(status: 'delivered', deliveredAt: delivered, payout: const OrderPayoutModel(state: 'failed', transferId: 'trf_1')), now: now).tone,
        TimelineTone.bad);
    final cash = payoutTimeline(order(status: 'delivered', online: false, deliveredAt: delivered), now: now);
    expect(cash.headline, 'Paid directly by the customer');
    expect(cash.steps.length, 3);
  });

  test('release time passed, not confirmed yet: releasing now', () {
    final t = payoutTimeline(order(status: 'delivered', deliveredAt: delivered, releaseAt: now.subtract(h), payout: const OrderPayoutModel(state: 'on_hold', transferId: 'trf_1')), now: now);
    expect(t.headline, 'Releasing now');
  });

  test('not on Route and KYC not done: money waits for KYC, safely', () {
    final o = order(status: 'delivered', deliveredAt: delivered, payout: const OrderPayoutModel(state: 'not_routed'));
    final t = payoutTimeline(o, now: now, kycPending: true);
    expect(t.headline, 'Finish KYC to get paid');
    expect(t.tone, TimelineTone.warn);
    expect(t.steps[t.steps.length - 2].label, 'Waiting for your KYC');
    expect(t.steps[t.steps.length - 2].detail, contains('safe'));
    // Routed money is unaffected by KYC wording.
    final routed = order(status: 'delivered', deliveredAt: delivered, payout: const OrderPayoutModel(state: 'on_hold', transferId: 'trf_1'));
    expect(payoutTimeline(routed, now: now, kycPending: true).headline, isNot('Finish KYC to get paid'));
    expect(payoutTimeline(o, now: now).headline, 'Waiting for payout');
  });

  testWidgets('timeline and chip lay out on a small phone', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final orders = [
      order(payout: const OrderPayoutModel(state: 'on_hold', transferId: 'trf_TkaNOUNOtAlEEv', amount: 1912.8)),
      order(status: 'delivered', deliveredAt: delivered, payout: OrderPayoutModel(state: 'settled', transferId: 'trf_1', settlementId: 'setl_9', settledAt: now)),
      order(status: 'rejected', refundedAmount: 1000),
    ];
    for (final o in orders) {
      await tester.pumpWidget(ProviderScope(
        overrides: [kycPendingProvider.overrideWithValue(true)],
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Column(children: [PayoutHeadlineChip(order: o), PayoutTimelineView(order: o)]),
            ),
          ),
        ),
      ));
      expect(tester.takeException(), isNull);
    }
  });
}
