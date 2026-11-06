import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_config.dart';
import '../../core/constants/app_text_styles.dart';
import '../../core/models/order_model.dart';

/// Where a customer's money is on a rejected / cancelled / refunded order.
/// Mirrors web's app/lib/refund-view.ts so both show the same thing.
enum RefundKind { findingSeller, arranging, initiated, processed, failed }

/// Banks usually show a normal Razorpay refund within 5–7 working days.
const kRefundWorkingDays = 7;
const _supportEmail = 'krishidukan.support@fiinny.com';

class RefundStage {
  final RefundKind kind;
  final double amount;
  final String? refundId;
  final DateTime? refundedAt;
  final DateTime? processedAt;
  final DateTime? expectedBy;
  final DateTime? until;
  final String? reference;

  const RefundStage(
    this.kind,
    this.amount, {
    this.refundId,
    this.refundedAt,
    this.processedAt,
    this.expectedBy,
    this.until,
    this.reference,
  });

  /// Only a refund still on its way can change if Razorpay is asked again.
  bool get mayChange => kind == RefundKind.initiated;

  static RefundStage? of(OrderModel order) {
    final p = order.payment;
    final paidOnline = (p?.razorpayPaymentId ?? '').isNotEmpty;
    final refunded = p?.refundedAmount ?? 0;
    final amount = refunded > 0 ? refunded : order.total;

    final refundId = p?.refundId;
    if (refundId != null && refundId.isNotEmpty) {
      if (p!.refundStatus == 'failed') {
        return RefundStage(RefundKind.failed, amount, refundId: refundId);
      }
      final expectedBy =
          p.refundedAt == null ? null : addWorkingDays(p.refundedAt!, kRefundWorkingDays);
      if (p.refundStatus == 'processed') {
        return RefundStage(RefundKind.processed, amount,
            refundId: refundId,
            refundedAt: p.refundedAt,
            processedAt: p.refundProcessedAt,
            expectedBy: expectedBy,
            reference: p.refundArn);
      }
      return RefundStage(RefundKind.initiated, amount,
          refundId: refundId, refundedAt: p.refundedAt, expectedBy: expectedBy);
    }
    // Cash on delivery: no money was taken, nothing to refund.
    if (!paidOnline) return null;
    if (order.status == 'reassigning') {
      return RefundStage(RefundKind.findingSeller, amount, until: order.reassignmentExpiresAt);
    }
    if (order.status == 'rejected' || order.status == 'cancelled') {
      return RefundStage(RefundKind.arranging, amount);
    }
    return null;
  }
}

DateTime addWorkingDays(DateTime from, int days) {
  var d = from;
  var left = days;
  while (left > 0) {
    d = d.add(const Duration(days: 1));
    if (d.weekday != DateTime.saturday && d.weekday != DateTime.sunday) left--;
  }
  return d;
}

/// Asks the server to re-read a pending refund from Razorpay (it rate-limits
/// per order). True when the stored status changed, so the caller re-reads
/// the order. Best-effort: any failure is just "no change".
Future<bool> refreshRefundStatus(OrderModel order) async {
  try {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) return false;
    final res = await http
        .post(
          Uri.parse('${AppConfig.apiBaseUrl}/api/orders/refund-status'),
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
          body: jsonEncode({'orderId': order.id}),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) return false;
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['refundStatus'] as String?) != order.payment?.refundStatus;
  } catch (_) {
    return false;
  }
}

String _money(double v) =>
    '₹${NumberFormat.decimalPatternDigits(locale: 'en_IN', decimalDigits: v % 1 == 0 ? 0 : 2).format(v)}';
String _day(DateTime d) => DateFormat('d MMM yyyy').format(d.toLocal());

/// One-line summary for the order list.
String refundSummary(RefundStage s) => switch (s.kind) {
      RefundKind.findingSeller => 'Finding another seller — else full refund',
      RefundKind.arranging => 'Refund of ${_money(s.amount)} being arranged',
      RefundKind.initiated => s.expectedBy == null
          ? 'Refund of ${_money(s.amount)} started'
          : 'Refund of ${_money(s.amount)} · expected by ${_day(s.expectedBy!)}',
      RefundKind.processed => 'Refund of ${_money(s.amount)} sent to your bank',
      RefundKind.failed => 'Refund problem — contact support',
    };

/// The refund card on the order details screen.
class RefundStatusCard extends StatelessWidget {
  final OrderModel order;
  final RefundStage stage;
  const RefundStatusCard({super.key, required this.order, required this.stage});

  @override
  Widget build(BuildContext context) {
    final orderNo = order.id.substring(0, order.id.length < 8 ? order.id.length : 8).toUpperCase();
    final reason = (order.rejectionReason?.isNotEmpty ?? false)
        ? order.rejectionReason
        : order.cancellationReason;

    if (stage.kind == RefundKind.findingSeller) {
      final until = stage.until == null
          ? ''
          : ' until ${DateFormat('d MMM, h:mm a').format(stage.until!.toLocal())}';
      return _box(
        color: AppColors.warning,
        icon: Icons.sync,
        children: [
          Text(
            'The seller couldn\'t fulfil this order, so we are offering it to '
            'other sellers$until. If no one accepts, your ${_money(stage.amount)} '
            'is refunded automatically. You can also cancel now for an '
            'immediate refund.',
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurface),
          ),
        ],
      );
    }

    if (stage.kind == RefundKind.failed) {
      return _box(
        color: AppColors.error,
        icon: Icons.error_outline,
        children: [
          Text('Refund', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            'There was a problem refunding ${_money(stage.amount)}. Please '
            'contact support with order #$orderNo and we will sort it out.',
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurface),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => launchUrl(Uri.parse(
                'mailto:$_supportEmail?subject=${Uri.encodeComponent('Refund for order #$orderNo')}')),
            icon: const Icon(Icons.mail_outline, size: 18),
            label: const Text('Contact support'),
          ),
        ],
      );
    }

    final step = switch (stage.kind) {
      RefundKind.arranging => 0,
      RefundKind.initiated => 1,
      _ => 2,
    };
    final expected = stage.expectedBy;
    final overdue = stage.kind == RefundKind.processed &&
        expected != null &&
        expected.isBefore(DateTime.now());
    final message = switch (stage.kind) {
      RefundKind.arranging =>
        'Your refund of ${_money(stage.amount)} is being arranged. It will go back to the account or card you paid with.',
      RefundKind.initiated =>
        'Refund of ${_money(stage.amount)} started on ${stage.refundedAt == null ? '—' : _day(stage.refundedAt!)}. It goes back to the account or card you paid with.',
      _ =>
        'Your ${_money(stage.amount)} refund was sent to your bank on ${_day(stage.processedAt ?? stage.refundedAt ?? DateTime.now())}.',
    };

    return _box(
      color: AppColors.success,
      icon: Icons.currency_rupee,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Refund',
                  style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
            ),
            Text(_money(stage.amount),
                style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w800, color: AppColors.success)),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (final (i, label) in const ['Refund started', 'Sent to bank', 'In your account'].indexed) ...[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 5,
                      decoration: BoxDecoration(
                        // Steps before the current one are done; "In your
                        // account" is the bank's step, never marked done.
                        color: i < step
                            ? AppColors.success
                            : AppColors.success.withValues(alpha: i == step ? 0.45 : 0.15),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(label,
                        style: AppTextStyles.caption.copyWith(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: i <= step ? AppColors.success : AppColors.onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 10),
        Text(message, style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurface)),
        if (expected != null) ...[
          const SizedBox(height: 6),
          Text(
            overdue
                ? 'It should be in your account by now. If not, share the bank reference below with your bank.'
                : 'Usually shows in your account within 5–7 working days — by ${_day(expected)}.',
            style: AppTextStyles.caption,
          ),
        ],
        if (stage.kind == RefundKind.processed && (stage.reference ?? '').isNotEmpty) ...[
          const SizedBox(height: 8),
          SelectableText('Bank reference: ${stage.reference}',
              style: AppTextStyles.bodySmall.copyWith(fontWeight: FontWeight.w700)),
          Text('Your bank can trace the refund with this reference.', style: AppTextStyles.caption),
        ],
        if (stage.refundId != null) ...[
          const SizedBox(height: 6),
          SelectableText('Refund ID: ${stage.refundId}',
              style: AppTextStyles.caption.copyWith(fontSize: 10.5)),
        ],
        if (reason != null && reason.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Reason: $reason', style: AppTextStyles.caption),
        ],
      ],
    );
  }

  Widget _box({required Color color, required IconData icon, required List<Widget> children}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
          ),
        ],
      ),
    );
  }
}
