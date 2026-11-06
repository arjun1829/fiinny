import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../data/payout_timeline.dart';
import '../providers/dashboard_provider.dart';

/// Colours for a timeline headline.
({Color fg, Color bg}) _tone(TimelineTone t) => switch (t) {
      TimelineTone.good => (fg: Colors.green.shade800, bg: Colors.green.shade50),
      TimelineTone.info => (fg: Colors.blue.shade800, bg: Colors.blue.shade50),
      TimelineTone.wait => (fg: Colors.orange.shade900, bg: Colors.orange.shade50),
      TimelineTone.warn => (fg: Colors.deepOrange.shade900, bg: Colors.deepOrange.shade50),
      TimelineTone.bad => (fg: AppColors.error, bg: Colors.red.shade50),
      TimelineTone.muted => (fg: AppColors.onSurfaceVariant, bg: Colors.grey.shade100),
    };

/// A small chip with where this order's money is now. Tapping it opens the
/// full step-by-step timeline.
class PayoutHeadlineChip extends ConsumerWidget {
  final OrderModel order;
  const PayoutHeadlineChip({super.key, required this.order});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = payoutTimeline(order, kycPending: ref.watch(kycPendingProvider));
    final c = _tone(t.tone);
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => showPayoutTimelineSheet(context, order),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.account_balance_wallet_outlined, size: 13, color: c.fg),
          const SizedBox(width: 5),
          Flexible(
            child: Text(t.headline,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.caption.copyWith(color: c.fg, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 2),
          Icon(Icons.chevron_right, size: 14, color: c.fg),
        ]),
      ),
    );
  }
}

Future<void> showPayoutTimelineSheet(BuildContext context, OrderModel order) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            Text('Where is my money?', style: AppTextStyles.heading3),
            Text('Order #${order.id.length > 8 ? order.id.substring(0, 8).toUpperCase() : order.id}',
                style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 14),
            PayoutTimelineView(order: order),
          ],
        ),
      ),
    ),
  );
}

/// The order's money journey, step by step: placed → paid → held →
/// delivered → released → in your bank, with dates and what's next.
class PayoutTimelineView extends ConsumerWidget {
  final OrderModel order;
  final bool showHeadline;
  const PayoutTimelineView({super.key, required this.order, this.showHeadline = true});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = payoutTimeline(order, kycPending: ref.watch(kycPendingProvider));
    final c = _tone(t.tone);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showHeadline) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(20)),
            child: Text(t.headline, style: AppTextStyles.bodySmall.copyWith(color: c.fg, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 14),
        ],
        for (var i = 0; i < t.steps.length; i++) _StepRow(step: t.steps[i], last: i == t.steps.length - 1),
      ],
    );
  }
}

class _StepRow extends StatelessWidget {
  final TimelineStep step;
  final bool last;
  const _StepRow({required this.step, required this.last});

  @override
  Widget build(BuildContext context) {
    final (Color dot, IconData icon) = switch (step.status) {
      TimelineStatus.done => (Colors.green.shade600, Icons.check),
      TimelineStatus.current => (Colors.orange.shade600, Icons.schedule),
      TimelineStatus.failed => (AppColors.error, Icons.close),
      TimelineStatus.skipped => (Colors.grey.shade400, Icons.remove),
      TimelineStatus.upcoming => (Colors.grey.shade300, Icons.schedule),
    };
    final muted = step.status == TimelineStatus.upcoming;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 26,
            child: Column(children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
                child: Icon(icon, size: 14, color: Colors.white),
              ),
              if (!last)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: step.status == TimelineStatus.done ? Colors.green.shade200 : AppColors.divider,
                  ),
                ),
            ]),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(step.label,
                            style: AppTextStyles.bodyMedium.copyWith(
                                fontWeight: FontWeight.w700,
                                color: muted ? AppColors.onSurfaceVariant : AppColors.onSurface)),
                      ),
                      if (step.at != null)
                        Text(fmtWhen(step.at!),
                            style: AppTextStyles.caption.copyWith(color: AppColors.onSurfaceVariant)),
                    ],
                  ),
                  if (step.detail != null) ...[
                    const SizedBox(height: 2),
                    Text(step.detail!,
                        style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant, height: 1.35)),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
