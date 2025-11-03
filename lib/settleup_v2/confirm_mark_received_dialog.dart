import 'package:flutter/material.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors, AppSpacing;

class ConfirmMarkReceivedDialog extends StatelessWidget {
  const ConfirmMarkReceivedDialog({
    super.key,
    required this.friendName,
    required this.amountText,
  });

  final String friendName;
  final String amountText;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.ink800,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Are you sure you received $amountText outside Fiinny?',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: AppSpacing.m),
            Text(
              '$friendName will see this as settled in Fiinny. No money movement will happen due to this action.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withOpacity(.72),
                    height: 1.4,
                  ),
            ),
            const SizedBox(height: AppSpacing.xl),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  style: TextButton.styleFrom(foregroundColor: AppColors.bad),
                  child: const Text('CANCEL'),
                ),
                const SizedBox(width: AppSpacing.m),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: TextButton.styleFrom(foregroundColor: AppColors.mint),
                  child: const Text('CONFIRM'),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
