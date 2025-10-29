import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../themes/tokens.dart';
import '../themes/glass_card.dart';

class AssetsSummaryCard extends StatelessWidget {
  final String userId;
  final int assetCount;
  final double totalAssets;
  final VoidCallback onAddAsset;

  const AssetsSummaryCard({
    required this.userId,
    required this.assetCount,
    required this.totalAssets,
    required this.onAddAsset,
    Key? key,
  }) : super(key: key);

  static final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

  @override
  Widget build(BuildContext context) {
    final titleStyle = Theme.of(context)
        .textTheme
        .titleMedium
        ?.copyWith(fontWeight: FontWeight.w700, fontSize: 16);
    return SizedBox(
      width: double.infinity,
      child: GlassCard(
        padding: const EdgeInsets.all(13),
        radius: Fx.r24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.savings_rounded, color: Fx.good),
              const SizedBox(width: Fx.s8),
              Text("Assets", style: titleStyle),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.add_circle, color: Fx.mintDark),
                tooltip: "Add Asset",
                onPressed: onAddAsset,
              ),
            ]),
            const SizedBox(height: Fx.s6),
            Text(
              _inr.format(totalAssets),
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Fx.good,
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("$assetCount items", style: Fx.label),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
