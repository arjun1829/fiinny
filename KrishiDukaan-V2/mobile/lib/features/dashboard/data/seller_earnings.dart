import '../../../core/models/order_model.dart';

/// Seller earnings — what a seller is owed, what is still on hold, and what
/// has already been paid out.
///
/// A DELIBERATE MIRROR of app/dashboard/_lib/seller-earnings.ts on the web.
/// Both platforms derive this from the seller's own order documents rather
/// than a separate ledger, so the two can never disagree about what a seller
/// is owed — a mismatch there erodes trust faster than almost any other bug.
/// Every rule below exists on the web side too; change them together.

/// Days after an order is marked delivered before its money is released.
///
/// Matches the refund window the support FAQ already promises customers
/// ("5-7 business days"): releasing sooner would push money to a seller
/// before the customer's own refund window has closed, and a Route transfer
/// then has to be reversed to claw it back.
const int kPayoutHoldDays = 7;

enum PayoutState {
  /// Order not delivered yet — nothing is owed until it is.
  awaitingDelivery,

  /// Delivered, inside the hold window.
  onHold,

  /// Hold elapsed — due to be transferred.
  due,

  /// A Razorpay transfer has paid this order out.
  transferred,

  /// Cancelled / rejected / refunded — never payable.
  notPayable,
}

class SellerEarningsRow {
  final String orderId;
  final double gross;
  final double gatewayFee;
  final double net;
  final PayoutState state;
  final DateTime? deliveredAt;
  final DateTime? releaseOn;

  const SellerEarningsRow({
    required this.orderId,
    required this.gross,
    required this.gatewayFee,
    required this.net,
    required this.state,
    this.deliveredAt,
    this.releaseOn,
  });
}

class SellerEarnings {
  /// Delivered, hold elapsed, not yet transferred — the headline figure.
  final double due;

  /// Delivered but still inside the hold window.
  final double onHold;

  /// Placed but not delivered yet.
  final double awaitingDelivery;

  /// Already transferred out.
  final double paidOut;

  /// Gateway fees deducted across counted orders, shown for transparency.
  final double gatewayFees;

  /// Earliest date any on-hold money becomes due.
  final DateTime? nextReleaseOn;

  final List<SellerEarningsRow> rows;

  const SellerEarnings({
    this.due = 0,
    this.onHold = 0,
    this.awaitingDelivery = 0,
    this.paidOut = 0,
    this.gatewayFees = 0,
    this.nextReleaseOn,
    this.rows = const [],
  });

  bool get isEmpty => rows.isEmpty;
}

/// The seller's share of an order, BEFORE refunds.
///
/// OrderModel.total already falls back to `grandTotal` then `subtotal`, which
/// covers the mobile/web field split (mobile writes `total`, web writes
/// `grandTotal`).
double _grossFor(OrderModel order) => order.total;

/// What the seller is actually owed: their share less anything refunded. A
/// fully refunded order is caught earlier by its status; this handles the
/// partial case, which leaves the status untouched.
double payableGrossFor(OrderModel order) {
  final refunded = order.payment?.refundedAmount ?? 0;
  final value = _grossFor(order) - refunded;
  return value > 0 ? value : 0;
}

/// When the order was marked delivered, from its own status history.
DateTime? deliveredAtFor(OrderModel order) {
  // Iterate backwards: the LAST delivered entry wins, so an order re-marked
  // delivered after a correction holds from the corrected date.
  for (var i = order.statusHistory.length - 1; i >= 0; i--) {
    final entry = order.statusHistory[i];
    if (entry['status'] == 'delivered') {
      final at = entry['at'];
      if (at == null || at.isEmpty) return null;
      return DateTime.tryParse(at);
    }
  }
  return null;
}

({PayoutState state, DateTime? deliveredAt, DateTime? releaseOn}) payoutStateFor(
  OrderModel order, {
  DateTime? now,
}) {
  final at = now ?? DateTime.now();

  // A recorded transfer is authoritative — money actually moved, whatever the
  // derived rules would say.
  if ((order.payment?.transferId ?? '').isNotEmpty) {
    return (
      state: PayoutState.transferred,
      deliveredAt: deliveredAtFor(order),
      releaseOn: null,
    );
  }

  final status = order.status.toLowerCase();
  if (status == 'cancelled' || status == 'rejected' || status == 'refunded') {
    return (state: PayoutState.notPayable, deliveredAt: null, releaseOn: null);
  }

  final deliveredAt = deliveredAtFor(order);
  // Trust the explicit status even when statusHistory lacks the entry — older
  // orders predate statusHistory being written.
  final isDelivered = status == 'delivered' || deliveredAt != null;
  if (!isDelivered) {
    return (
      state: PayoutState.awaitingDelivery,
      deliveredAt: null,
      releaseOn: null,
    );
  }

  // Delivered but no timestamp to hold from: treat as due rather than
  // trapping the money in a hold that can never elapse.
  if (deliveredAt == null) {
    return (state: PayoutState.due, deliveredAt: null, releaseOn: null);
  }

  final releaseOn = deliveredAt.add(const Duration(days: kPayoutHoldDays));
  return (
    state: releaseOn.isAfter(at) ? PayoutState.onHold : PayoutState.due,
    deliveredAt: deliveredAt,
    releaseOn: releaseOn,
  );
}

SellerEarnings computeSellerEarnings(
  List<OrderModel> orders, {
  DateTime? now,
}) {
  final at = now ?? DateTime.now();
  final rows = <SellerEarningsRow>[];
  double due = 0, onHold = 0, awaiting = 0, paidOut = 0, fees = 0;
  DateTime? nextRelease;

  for (final order in orders) {
    final result = payoutStateFor(order, now: at);
    if (result.state == PayoutState.notPayable) continue;

    final gross = payableGrossFor(order);
    // Gateway fee is only known once it has been fetched from Razorpay;
    // unknown counts as 0 rather than guessing a rate, so the seller is never
    // shown a fabricated deduction.
    final gatewayFee =
        (order.payment?.gatewayFee ?? 0) + (order.payment?.gatewayTax ?? 0);
    final net = (gross - gatewayFee) > 0 ? gross - gatewayFee : 0.0;

    rows.add(SellerEarningsRow(
      orderId: order.id,
      gross: gross,
      gatewayFee: gatewayFee,
      net: net,
      state: result.state,
      deliveredAt: result.deliveredAt,
      releaseOn: result.releaseOn,
    ));
    fees += gatewayFee;

    switch (result.state) {
      case PayoutState.due:
        due += net;
      case PayoutState.onHold:
        onHold += net;
        final release = result.releaseOn;
        if (release != null &&
            (nextRelease == null || release.isBefore(nextRelease))) {
          nextRelease = release;
        }
      case PayoutState.awaitingDelivery:
        awaiting += net;
      case PayoutState.transferred:
        paidOut += net;
      case PayoutState.notPayable:
        break; // unreachable — filtered above
    }
  }

  // Newest activity first.
  rows.sort((a, b) {
    final av = a.deliveredAt;
    final bv = b.deliveredAt;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv.compareTo(av);
  });

  return SellerEarnings(
    due: due,
    onHold: onHold,
    awaitingDelivery: awaiting,
    paidOut: paidOut,
    gatewayFees: fees,
    nextReleaseOn: nextRelease,
    rows: rows,
  );
}
