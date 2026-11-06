import 'package:intl/intl.dart';

import '../../../core/models/order_model.dart';

/// One order's money journey, step by step, for the seller:
///
///   Order placed → Customer paid → Held by KrishiDukan → Delivered
///     → Released to you → In your bank
///
/// Same rules as the website's app/lib/payout-timeline.ts; change them
/// together.

enum TimelineStatus { done, current, upcoming, failed, skipped }

enum TimelineTone { good, info, wait, warn, bad, muted }

class TimelineStep {
  final String key;
  final String label;
  final TimelineStatus status;
  final DateTime? at;
  final String? detail;
  const TimelineStep(this.key, this.label, this.status, {this.at, this.detail});
}

class PayoutTimeline {
  final List<TimelineStep> steps;

  /// One line for lists: where the money is now.
  final String headline;
  final TimelineTone tone;
  const PayoutTimeline(this.steps, this.headline, this.tone);
}

/// Days the payout run waits after delivery (kPayoutHoldDays).
const _runHoldDays = 7;

String fmtWhen(DateTime d) => DateFormat('d MMM, h:mm a').format(d.toLocal());

String _inr(double n) => n % 1 == 0
    ? '₹${NumberFormat.decimalPattern('en_IN').format(n.round())}'
    : '₹${NumberFormat('#,##,##0.00', 'en_IN').format(n)}';

DateTime? _lastStatusAt(OrderModel o, String status) {
  for (var i = o.statusHistory.length - 1; i >= 0; i--) {
    final e = o.statusHistory[i];
    if (e['status'] == status) return DateTime.tryParse(e['at'] ?? '');
  }
  return null;
}

/// [kycPending]: the seller's KYC isn't verified yet, so money not sent at
/// checkout waits for it (then pay-after-kyc sends it automatically).
PayoutTimeline payoutTimeline(OrderModel order, {DateTime? now, bool kycPending = false}) {
  final at = now ?? DateTime.now();
  final status = order.status.toLowerCase();
  final pay = order.payment;
  final payout = order.payout;
  final state = payout?.state ?? '';
  final online =
      (pay?.razorpayPaymentId ?? '').isNotEmpty ||
      (pay?.transferId ?? '').isNotEmpty;
  final placedAt = order.createdAt;
  final deliveredAt = _lastStatusAt(order, 'delivered');
  final isDelivered = status == 'delivered' || deliveredAt != null;
  final cancelled =
      status == 'cancelled' ||
      status == 'rejected' ||
      status == 'refunded' ||
      pay?.status == 'refunded';

  final steps = <TimelineStep>[
    TimelineStep('placed', 'Order placed', TimelineStatus.done, at: placedAt),
  ];

  if (!online) {
    steps.add(
      const TimelineStep(
        'paid',
        'Payment',
        TimelineStatus.skipped,
        detail:
            'Not paid online. The customer pays you directly (cash or UPI on delivery).',
      ),
    );
    steps.add(
      cancelled
          ? TimelineStep(
              'cancelled',
              status == 'rejected' ? 'Order rejected' : 'Order cancelled',
              TimelineStatus.failed,
              at: _lastStatusAt(order, status),
            )
          : TimelineStep(
              'delivered',
              'Delivered',
              isDelivered ? TimelineStatus.done : TimelineStatus.current,
              at: deliveredAt,
            ),
    );
    return PayoutTimeline(
      steps,
      cancelled ? 'Cancelled' : 'Paid directly by the customer',
      TimelineTone.muted,
    );
  }

  final paidAt = DateTime.tryParse(pay?.paidAt ?? '') ?? placedAt;
  final total = order.total > 0 ? order.total : (pay?.amount ?? 0);
  steps.add(
    TimelineStep(
      'paid',
      'Customer paid online',
      TimelineStatus.done,
      at: paidAt,
      detail: total > 0
          ? '${_inr(total)} received by KrishiDukan through Razorpay.'
          : null,
    ),
  );

  if (cancelled || state == 'reversed') {
    final refunded = pay?.refundedAmount ?? 0;
    steps.add(
      TimelineStep(
        'cancelled',
        status == 'rejected'
            ? 'Order rejected, money refunded'
            : 'Order cancelled, money refunded',
        TimelineStatus.failed,
        at: pay?.refundedAt ?? _lastStatusAt(order, status),
        detail: refunded > 0
            ? '${_inr(refunded)} returned to the customer. No payout for this order.'
            : 'No payout for this order.',
      ),
    );
    return PayoutTimeline(steps, 'Refunded to customer', TimelineTone.muted);
  }

  final routed =
      (payout?.transferId ?? '').isNotEmpty && payout?.via != 'balance';
  final amount = (payout?.amount ?? 0) > 0 ? payout!.amount! : null;
  steps.add(
    TimelineStep(
      'held',
      'Held safely by KrishiDukan',
      TimelineStatus.done,
      at: paidAt,
      detail: routed
          ? '${amount != null ? _inr(amount) : 'Your share'} is reserved for you in Razorpay (transfer ${payout!.transferId}) until delivery.'
          : 'Kept until the order is delivered, so the customer is protected.',
    ),
  );

  steps.add(
    TimelineStep(
      'delivered',
      'Marked delivered',
      isDelivered ? TimelineStatus.done : TimelineStatus.current,
      at: deliveredAt,
      detail: isDelivered
          ? null
          : 'Mark the order delivered to release your money.',
    ),
  );

  final releaseAt =
      (state == 'scheduled' ? payout?.onHoldUntil : null) ?? order.releaseAt;
  TimelineStep released;
  TimelineStep settled;
  String headline;
  TimelineTone tone;

  if ((pay?.transferId ?? '').isNotEmpty) {
    released = TimelineStep(
      'released',
      'Sent by KrishiDukan',
      TimelineStatus.done,
      at: DateTime.tryParse(pay?.transferredAt ?? ''),
      detail: 'Payout transfer ${pay!.transferId}.',
    );
  } else if (state == 'processing' || state == 'settled') {
    released = TimelineStep(
      'released',
      'Released to you',
      TimelineStatus.done,
      at: releaseAt ?? order.releaseRecordedAt,
    );
  } else if (state == 'failed') {
    released = const TimelineStep(
      'released',
      'Transfer failed',
      TimelineStatus.failed,
      detail: 'KrishiDukan support will contact you about this payment.',
    );
  } else if (!isDelivered) {
    released = const TimelineStep(
      'released',
      'Released to you',
      TimelineStatus.upcoming,
      detail: '24 hours after delivery.',
    );
  } else if (releaseAt != null && releaseAt.isAfter(at)) {
    released = TimelineStep(
      'released',
      'Release scheduled',
      TimelineStatus.current,
      at: releaseAt,
      detail:
          'Then Razorpay sends it to your bank, usually by the next working day.',
    );
  } else if (releaseAt != null) {
    released = TimelineStep(
      'released',
      'Releasing now',
      TimelineStatus.current,
      at: releaseAt,
      detail: 'Released at the scheduled time; Razorpay is confirming.',
    );
  } else if (routed || state == 'on_hold') {
    released = const TimelineStep(
      'released',
      'Waiting for release',
      TimelineStatus.current,
      detail:
          'Your money is ready to be released. KrishiDukan releases it shortly.',
    );
  } else if (kycPending) {
    released = const TimelineStep(
      'released',
      'Waiting for your KYC',
      TimelineStatus.current,
      detail: 'Your money is safe with KrishiDukan. Finish the 3 steps on the '
          'Payouts page and it is sent to your bank automatically.',
    );
  } else {
    final due = deliveredAt?.add(const Duration(days: _runHoldDays));
    released = TimelineStep(
      'released',
      'Waiting for payout',
      TimelineStatus.current,
      at: due,
      detail: due != null
          ? '${due.isAfter(at) ? 'Due' : 'Was due'} ${fmtWhen(due)}. KrishiDukan sends it to your registered bank account.'
          : 'KrishiDukan sends it to your registered bank account.',
    );
  }

  if (state == 'settled') {
    final s = payout?.settlementAt ?? payout?.settledAt;
    settled = TimelineStep(
      'settled',
      'In your bank',
      TimelineStatus.done,
      at: s,
      detail: (payout?.utr ?? '').isNotEmpty
          ? 'Bank reference (UTR) ${payout!.utr}. Use it to find the money in your bank statement.'
          : payout?.settlementId != null
              ? 'Razorpay settlement ${payout!.settlementId}. The bank reference (UTR) shows here once the bank confirms.'
              : null,
    );
    headline = s != null ? 'In your bank since ${fmtWhen(s)}' : 'In your bank';
    tone = TimelineTone.good;
  } else if (state == 'processing' ||
      ((pay?.transferId ?? '').isNotEmpty && state != 'failed')) {
    settled = const TimelineStep(
      'settled',
      'In your bank',
      TimelineStatus.current,
      detail:
          'Razorpay is sending it to your bank, usually by the next working day.',
    );
    headline = 'On the way to your bank';
    tone = TimelineTone.info;
  } else {
    settled = const TimelineStep(
      'settled',
      'In your bank',
      TimelineStatus.upcoming,
    );
    if (state == 'failed') {
      headline = 'Transfer failed';
      tone = TimelineTone.bad;
    } else if (!isDelivered) {
      headline = 'Waiting for delivery';
      tone = TimelineTone.wait;
    } else if (released.label == 'Release scheduled' && releaseAt != null) {
      headline = 'Releases ${fmtWhen(releaseAt)}';
      tone = TimelineTone.wait;
    } else if (released.label == 'Releasing now') {
      headline = 'Releasing now';
      tone = TimelineTone.info;
    } else if (kycPending && released.label == 'Waiting for your KYC') {
      headline = 'Finish KYC to get paid';
      tone = TimelineTone.warn;
    } else {
      headline = released.label;
      tone = TimelineTone.wait;
    }
  }
  steps
    ..add(released)
    ..add(settled);
  return PayoutTimeline(steps, headline, tone);
}
