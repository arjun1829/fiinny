import 'package:flutter/material.dart';
import '../../themes/tokens.dart';
import '../../themes/glass_card.dart';
import '../../themes/badge.dart';

class SubsSuggestionsSheet extends StatelessWidget {
  /// Optional: pass userId if you want to display dynamic counts in future.
  final String? userId;
  /// Optional: when user taps "Review suggestions"
  final VoidCallback? onReview;

  const SubsSuggestionsSheet({super.key, this.userId, this.onReview});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(999))),
            const SizedBox(height: Fx.s12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lightbulb_rounded, color: Fx.mintDark),
                const SizedBox(width: Fx.s8),
                Text('Suggested Subscriptions', style: Fx.title),
              ],
            ),
            const SizedBox(height: Fx.s6),
            Text(
              'We’ll surface suggestions from your transactions as we detect recurring patterns.',
              textAlign: TextAlign.center,
              style: Fx.label,
            ),
            const SizedBox(height: Fx.s16),
            GlassCard(
              radius: Fx.r20,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('How it works', style: Fx.title.copyWith(fontSize: 16)),
                  const SizedBox(height: Fx.s6),
                  ...[
                    'Group similar debits by merchant & amount.',
                    'Flag likely subscriptions/auto-pays.',
                    'You confirm and save in one tap.',
                  ].map((t) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      const Icon(Icons.check_circle_rounded, size: 16, color: Fx.mintDark),
                      const SizedBox(width: Fx.s8),
                      Expanded(child: Text(t, style: Fx.label)),
                    ]),
                  )),
                ],
              ),
            ),
            const SizedBox(height: Fx.s16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                PillBadge('Ready', color: Fx.mintDark, icon: Icons.psychology_alt_rounded),
              ],
            ),
            const SizedBox(height: Fx.s16),
            FilledButton(
              onPressed: onReview ?? () => Navigator.pop(context),
              child: const Text('Review suggestions'),
            ),
          ],
        ),
      ),
    );
  }
}
