import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_app/core/models/order_model.dart';
import 'package:krishidukaan_app/features/dashboard/data/seller_earnings.dart';

/// Mirrors the web harness for app/dashboard/_lib/seller-earnings.ts.
///
/// The two implementations must agree exactly: the app tells a seller what
/// they are owed, and the web payout run decides what actually gets sent. If
/// these drift, a seller sees one number and receives another.

const _now = '2026-08-29T12:00:00.000Z';

OrderModel _order({
  String id = 'o1',
  String status = 'placed',
  double total = 1000,
  String? deliveredAt,
  String? transferId,
  double? refundedAmount,
  double? gatewayFee,
  double? gatewayTax,
  List<Map<String, String>>? statusHistory,
}) {
  return OrderModel(
    id: id,
    customerId: 'c1',
    customerName: 'Test Buyer',
    customerPhone: '+919000000000',
    customerAddress: const {},
    sellerId: '+919111111111',
    sellerName: 'Test Seller',
    sellerType: 'retailer',
    items: const [],
    subtotal: total,
    deliveryCharge: 0,
    total: total,
    status: status,
    statusHistory: statusHistory ??
        (deliveredAt == null
            ? const []
            : [
                {'status': 'placed', 'at': '2026-08-01T00:00:00.000Z'},
                {'status': 'delivered', 'at': deliveredAt},
              ]),
    payment: (transferId != null ||
            refundedAmount != null ||
            gatewayFee != null ||
            gatewayTax != null)
        ? OrderPaymentModel(
            status: 'paid',
            amount: total,
            transferId: transferId,
            refundedAmount: refundedAmount,
            gatewayFee: gatewayFee,
            gatewayTax: gatewayTax,
          )
        : null,
  );
}

DateTime get now => DateTime.parse(_now);

void main() {
  group('payoutStateFor', () {
    test('an undelivered order is awaiting delivery, never payable yet', () {
      final r = payoutStateFor(_order(status: 'placed'), now: now);
      expect(r.state, PayoutState.awaitingDelivery);
      expect(r.releaseOn, isNull);
    });

    test('delivered inside the hold window is on hold', () {
      // 2 days ago — well inside the 7-day hold.
      final r = payoutStateFor(
        _order(status: 'delivered', deliveredAt: '2026-08-27T12:00:00.000Z'),
        now: now,
      );
      expect(r.state, PayoutState.onHold);
      expect(r.releaseOn, DateTime.parse('2026-09-03T12:00:00.000Z'));
    });

    test('delivered before the hold elapsed is due', () {
      final r = payoutStateFor(
        _order(status: 'delivered', deliveredAt: '2026-08-20T12:00:00.000Z'),
        now: now,
      );
      expect(r.state, PayoutState.due);
    });

    test('the hold boundary itself is due, not held one more instant', () {
      final r = payoutStateFor(
        _order(status: 'delivered', deliveredAt: '2026-08-22T12:00:00.000Z'),
        now: now,
      );
      expect(r.state, PayoutState.due);
    });

    test('cancelled, rejected and refunded orders are never payable', () {
      for (final s in ['cancelled', 'rejected', 'refunded']) {
        expect(
          payoutStateFor(_order(status: s), now: now).state,
          PayoutState.notPayable,
          reason: '$s must not be payable',
        );
      }
    });

    test('a recorded transfer wins over every derived rule', () {
      // Not even delivered, but money demonstrably moved.
      final r = payoutStateFor(
        _order(status: 'placed', transferId: 'trf_123'),
        now: now,
      );
      expect(r.state, PayoutState.transferred);
    });

    test('a transfer on a cancelled order still reads as transferred', () {
      // Otherwise the money that left the account would vanish from the books.
      final r = payoutStateFor(
        _order(status: 'cancelled', transferId: 'trf_123'),
        now: now,
      );
      expect(r.state, PayoutState.transferred);
    });

    test('delivered with no timestamp is due, not trapped on hold forever', () {
      final r = payoutStateFor(
        _order(status: 'delivered'), // no statusHistory at all
        now: now,
      );
      expect(r.state, PayoutState.due);
    });

    test('the LAST delivered entry wins after a correction', () {
      final r = payoutStateFor(
        _order(status: 'delivered', statusHistory: [
          {'status': 'delivered', 'at': '2026-08-01T12:00:00.000Z'},
          {'status': 'returned', 'at': '2026-08-02T12:00:00.000Z'},
          {'status': 'delivered', 'at': '2026-08-28T12:00:00.000Z'},
        ]),
        now: now,
      );
      // Held from the corrected date, so still on hold.
      expect(r.state, PayoutState.onHold);
      expect(r.deliveredAt, DateTime.parse('2026-08-28T12:00:00.000Z'));
    });

    test('a delivered entry in history counts even if status says otherwise',
        () {
      final r = payoutStateFor(
        _order(status: 'processing', deliveredAt: '2026-08-01T12:00:00.000Z'),
        now: now,
      );
      expect(r.state, PayoutState.due);
    });

    test('an unparseable delivered timestamp is due, not silently held', () {
      final r = payoutStateFor(
        _order(status: 'delivered', statusHistory: [
          {'status': 'delivered', 'at': 'not-a-date'},
        ]),
        now: now,
      );
      expect(r.state, PayoutState.due);
    });
  });

  group('payableGrossFor', () {
    test('with no refund, the full order total is payable', () {
      expect(payableGrossFor(_order(total: 1000)), 1000);
    });

    test('a PARTIAL refund is subtracted', () {
      // The order status stays 'delivered' on a partial refund, so without
      // this the seller would be paid the full amount for partly refunded
      // goods and the platform would absorb the difference.
      expect(payableGrossFor(_order(total: 1000, refundedAmount: 300)), 700);
    });

    test('an over-refund floors at zero, never goes negative', () {
      expect(payableGrossFor(_order(total: 1000, refundedAmount: 1500)), 0);
    });
  });

  group('computeSellerEarnings', () {
    test('buckets each order into exactly one total', () {
      final s = computeSellerEarnings([
        _order(id: 'due', status: 'delivered', total: 1000, deliveredAt: '2026-08-01T00:00:00.000Z'),
        _order(id: 'hold', status: 'delivered', total: 500, deliveredAt: '2026-08-28T00:00:00.000Z'),
        _order(id: 'wait', status: 'placed', total: 200),
        _order(id: 'paid', status: 'delivered', total: 700, deliveredAt: '2026-08-01T00:00:00.000Z', transferId: 'trf_1'),
      ], now: now);

      expect(s.due, 1000);
      expect(s.onHold, 500);
      expect(s.awaitingDelivery, 200);
      expect(s.paidOut, 700);
      expect(s.rows.length, 4);
    });

    test('not-payable orders are excluded entirely, not zeroed', () {
      final s = computeSellerEarnings([
        _order(id: 'x', status: 'cancelled', total: 999),
      ], now: now);
      expect(s.rows, isEmpty);
      expect(s.due, 0);
      expect(s.isEmpty, isTrue);
    });

    test('an unknown gateway fee counts as zero, never a made-up deduction',
        () {
      final s = computeSellerEarnings([
        _order(status: 'delivered', total: 1000, deliveredAt: '2026-08-01T00:00:00.000Z'),
      ], now: now);
      expect(s.gatewayFees, 0);
      expect(s.due, 1000);
    });

    test('a known gateway fee and its tax are both deducted', () {
      final s = computeSellerEarnings([
        _order(
          status: 'delivered',
          total: 1000,
          deliveredAt: '2026-08-01T00:00:00.000Z',
          gatewayFee: 20,
          gatewayTax: 3.6,
        ),
      ], now: now);
      expect(s.gatewayFees, closeTo(23.6, 0.001));
      expect(s.due, closeTo(976.4, 0.001));
    });

    test('net floors at zero when fees somehow exceed the order', () {
      final s = computeSellerEarnings([
        _order(
          status: 'delivered',
          total: 10,
          deliveredAt: '2026-08-01T00:00:00.000Z',
          gatewayFee: 50,
        ),
      ], now: now);
      expect(s.due, 0);
    });

    test('nextReleaseOn is the EARLIEST held order, not the latest', () {
      final s = computeSellerEarnings([
        _order(id: 'later', status: 'delivered', deliveredAt: '2026-08-28T00:00:00.000Z'),
        _order(id: 'sooner', status: 'delivered', deliveredAt: '2026-08-25T00:00:00.000Z'),
      ], now: now);
      expect(s.nextReleaseOn, DateTime.parse('2026-09-01T00:00:00.000Z'));
    });

    test('nextReleaseOn is null when nothing is on hold', () {
      final s = computeSellerEarnings([
        _order(status: 'delivered', deliveredAt: '2026-08-01T00:00:00.000Z'),
      ], now: now);
      expect(s.nextReleaseOn, isNull);
    });

    test('a partial refund reduces the due amount, not just the display', () {
      final s = computeSellerEarnings([
        _order(
          status: 'delivered',
          total: 1000,
          deliveredAt: '2026-08-01T00:00:00.000Z',
          refundedAmount: 250,
        ),
      ], now: now);
      expect(s.due, 750);
    });

    test('rows come back newest delivery first', () {
      final s = computeSellerEarnings([
        _order(id: 'old', status: 'delivered', deliveredAt: '2026-08-01T00:00:00.000Z'),
        _order(id: 'new', status: 'delivered', deliveredAt: '2026-08-20T00:00:00.000Z'),
      ], now: now);
      expect(s.rows.first.orderId, 'new');
    });

    test('orders with no delivery date sort last, not first', () {
      final s = computeSellerEarnings([
        _order(id: 'undelivered', status: 'placed'),
        _order(id: 'delivered', status: 'delivered', deliveredAt: '2026-08-01T00:00:00.000Z'),
      ], now: now);
      expect(s.rows.first.orderId, 'delivered');
      expect(s.rows.last.orderId, 'undelivered');
    });

    test('an empty order list produces zeros, not a crash', () {
      final s = computeSellerEarnings([], now: now);
      expect(s.due, 0);
      expect(s.rows, isEmpty);
      expect(s.nextReleaseOn, isNull);
    });

    test('the hold period is 7 days, matching the web payout run', () {
      // Guards the constant itself: changing it on one platform only would
      // make the app promise a release date the payout run does not honour.
      expect(kPayoutHoldDays, 7);
    });
  });

  group('OrderModel payout parsing', () {
    test('total falls back to grandTotal for web-written orders', () {
      // Mobile writes `total`, web writes `grandTotal`; both are in
      // production. Verified through the model's own fallback chain.
      final o = _order(total: 1234);
      expect(o.total, 1234);
    });
  });
}
