import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_colors.dart';
import '../constants/app_text_styles.dart';
import '../providers/locale_provider.dart';

/// "N people bought this in the last …" — precomputed every 6 hours by the
/// rebuildProductBuyStats function into productBuyStats/{productId}, so the
/// product page reads one small doc and never touches orders. Same data and
/// look as the website's components/shared/bought-by.tsx.
class BuyStats {
  final String label;
  final int days;

  /// Recent buyers as an initial + colour index — no names or photos.
  final List<({String initial, int colour})> recent;

  const BuyStats({required this.label, required this.days, required this.recent});

  static BuyStats? fromMap(Map<String, dynamic>? d) {
    final show = d?['show'];
    if (show is! Map) return null;
    final label = show['label'];
    final days = show['days'];
    if (label is! String || label.isEmpty || days is! num) return null;
    final recent = (d?['recent'] is List ? d!['recent'] as List : const [])
        .whereType<Map>()
        .take(4)
        .map((r) => (
              initial: r['i'] is String ? r['i'] as String : '',
              colour: r['c'] is num ? (r['c'] as num).toInt() : 0,
            ))
        .toList();
    return BuyStats(label: label, days: days.toInt(), recent: recent);
  }
}

/// Kept for the session: reopening a product costs no read.
final buyStatsProvider =
    FutureProvider.family<BuyStats?, String>((ref, productId) async {
  if (productId.isEmpty) return null;
  try {
    final snap = await FirebaseFirestore.instance
        .collection('productBuyStats')
        .doc(productId)
        .get();
    return BuyStats.fromMap(snap.data());
  } catch (_) {
    return null;
  }
});

// Same order as the website, indexed by the stored colour.
const _colours = [
  Color(0xFF2E7D32),
  Color(0xFFF57C00),
  Color(0xFF1565C0),
  Color(0xFF6A1B9A),
  Color(0xFF00838F),
  Color(0xFFAD1457),
];

/// Overlapping initials of recent buyers + "300+ people bought this in the
/// last 2 months". Takes no space until the stats arrive, and none at all
/// for products with too few buyers.
class BoughtBy extends ConsumerWidget {
  final String productId;
  const BoughtBy({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(buyStatsProvider(productId)).value;
    if (stats == null) return const SizedBox.shrink();
    final hindi = ref.watch(localeProvider).languageCode == 'hi';
    final period = switch (stats.days) {
      <= 30 => hindi ? '30 दिनों' : '30 days',
      <= 60 => hindi ? '2 महीनों' : '2 months',
      _ => hindi ? '3 महीनों' : '3 months',
    };
    const size = 26.0;
    const step = 18.0;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          if (stats.recent.isNotEmpty) ...[
            SizedBox(
              width: size + step * (stats.recent.length - 1),
              height: size,
              child: Stack(
                children: [
                  // Drawn last-to-first so the most recent sits on top.
                  for (var i = stats.recent.length - 1; i >= 0; i--)
                    Positioned(
                      left: step * i,
                      child: Container(
                        width: size,
                        height: size,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _colours[stats.recent[i].colour % _colours.length],
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: Text(
                          stats.recent[i].initial.isEmpty
                              ? '•'
                              : stats.recent[i].initial,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text.rich(
              TextSpan(
                children: hindi
                    ? [
                        TextSpan(text: 'पिछले $period में '),
                        TextSpan(
                          text: '${stats.label} लोगों ने इसे खरीदा',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurface,
                          ),
                        ),
                      ]
                    : [
                        TextSpan(
                          text: '${stats.label} people bought this',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppColors.onSurface,
                          ),
                        ),
                        TextSpan(text: ' in the last $period'),
                      ],
              ),
              style: AppTextStyles.bodySmall
                  .copyWith(color: AppColors.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}
