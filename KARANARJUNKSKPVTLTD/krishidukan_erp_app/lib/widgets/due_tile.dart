import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../core/format.dart';
import '../features/analytics/models.dart';
import 'customer_actions.dart';
import 'ui.dart';

/// A customer who owes money: avatar, name, amount, and round Call / Note
/// buttons right on the row.
class DueRow extends StatelessWidget {
  const DueRow({super.key, required this.due, this.share});

  final NamedAmount due;

  /// 0..1 share of the largest due, drawn as a thin bar. Null hides it.
  final double? share;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          InitialAvatar(due.name, color: AppColors.critical, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  due.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 3),
                Text(
                  fmtInr(due.amount),
                  style: AppText.amount.copyWith(
                    fontSize: 13.5,
                    color: AppColors.critical,
                  ),
                ),
                if (share != null) ...[
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: share,
                      minHeight: 4,
                      backgroundColor: AppColors.cardHi,
                      valueColor: AlwaysStoppedAnimation(
                          AppColors.critical.withValues(alpha: 0.55)),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          CustomerActions(
            customerName: due.name,
            phone: due.phone,
            retailerId: due.retailerId,
            compact: true,
          ),
        ],
      ),
    );
  }
}
