import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lifemap/ui/tokens.dart' show AppColors, AppSpacing;

class SettleSuccessDialog extends StatefulWidget {
  const SettleSuccessDialog({super.key});

  @override
  State<SettleSuccessDialog> createState() => _SettleSuccessDialogState();
}

class _SettleSuccessDialogState extends State<SettleSuccessDialog> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    HapticFeedback.lightImpact();
    _timer = Timer(const Duration(milliseconds: 1400), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.ink800,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: AppColors.good,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check_rounded, color: Colors.white, size: 42),
            ),
            const SizedBox(height: AppSpacing.l),
            Text(
              'Success!',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: AppSpacing.s),
            Text(
              'Marked as settled.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withOpacity(.7),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
