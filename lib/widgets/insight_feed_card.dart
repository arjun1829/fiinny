import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../brain/insight_microcopy.dart';
import '../core/flags/premium_gate.dart';
import '../models/insight_model.dart';
import '../themes/badge.dart';
import '../themes/glass_card.dart';
import '../themes/tokens.dart';
import 'premium/premium_chip.dart';

class InsightFeedCard extends StatelessWidget {
  final List<InsightModel> insights;
  final int maxItems;
  final bool showHeader;
  final String? userId;

  const InsightFeedCard({
    Key? key,
    required this.insights,
    this.maxItems = 5,
    this.showHeader = true,
    this.userId,
  }) : super(key: key);

  static final _dt = DateFormat('dd MMM, hh:mm a');

  // merge duplicates by (title|category|type) keeping worst severity + latest time
  List<InsightModel> _prepare(List<InsightModel> list) {
    final map = <String, InsightModel>{};
    for (final i in list) {
      final key = '${i.title}|${i.category}|${i.type.name}';
      final existing = map[key];
      if (existing == null) {
        map[key] = i;
      } else {
        final a = existing.severity ?? 0;
        final b = i.severity ?? 0;
        final worse = (b > a) || (b == a && i.timestamp.isAfter(existing.timestamp));
        if (worse) map[key] = i;
      }
    }
    final merged = map.values.toList();
    merged.sort((a, b) {
      int sa = _severityScore(a.type, a.severity);
      int sb = _severityScore(b.type, b.severity);
      if (sb != sa) return sb.compareTo(sa);
      return b.timestamp.compareTo(a.timestamp);
    });
    return merged;
  }

  static int _severityScore(InsightType t, int? s) {
    final base = switch (t) {
      InsightType.critical => 3,
      InsightType.warning => 2,
      InsightType.positive => 1,
      _ => 1,
    };
    return (s ?? base).clamp(0, 9);
  }

  Color _color(InsightType type, int? severity) {
    if (type == InsightType.positive) return Fx.good;
    if (type == InsightType.warning) return Fx.warn;
    if (type == InsightType.critical) return Fx.bad;
    if ((severity ?? 0) >= 3) return Fx.bad;
    if (severity == 2) return Fx.warn;
    if (severity == 1) return Fx.mintDark;
    return Fx.text;
  }

  IconData _icon(InsightType type, String? category) {
    switch (category) {
      case 'loan':
        return Icons.account_balance_wallet_rounded;
      case 'asset':
        return Icons.account_balance_rounded;
      case 'goal':
        return Icons.flag_circle_rounded;
      case 'netWorth':
        return Icons.bar_chart_rounded;
      case 'crisis':
        return Icons.error_rounded;
      case 'expense':
        return Icons.trending_up_rounded;
    }
    switch (type) {
      case InsightType.positive:
        return Icons.thumb_up_alt_rounded;
      case InsightType.warning:
        return Icons.warning_amber_rounded;
      case InsightType.critical:
        return Icons.error_rounded;
      default:
        return Icons.insights_rounded;
    }
  }

  String _categoryLabel(String? c) {
    return switch (c) {
      'loan' => 'Loan',
      'asset' => 'Asset',
      'goal' => 'Goal',
      'netWorth' => 'Net Worth',
      'crisis' => 'Crisis',
      'expense' => 'Expense',
      _ => '',
    };
  }

  String _timeAgo(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays >= 1) return '${diff.inDays}d ago';
    if (diff.inHours >= 1) return '${diff.inHours}h ago';
    if (diff.inMinutes >= 1) return '${diff.inMinutes}m ago';
    return 'Just now';
  }

  @override
  Widget build(BuildContext context) {
    final prepared = _prepare(insights);
    if (prepared.isEmpty) return const SizedBox.shrink();

    Widget buildCard(List<InsightModel> list, {required bool showUpsell}) {
      return GlassCard(
        radius: Fx.r24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showHeader) ...[
              Row(
                children: [
                  const Icon(Icons.psychology_alt_rounded, color: Fx.mintDark),
                  const SizedBox(width: Fx.s8),
                  Text("Smart Insights", style: Fx.title),
                  const Spacer(),
                  if (showUpsell) ...[
                    PremiumChip(
                      onTap: () {
                        if (userId != null) {
                          Navigator.pushNamed(context, '/premium', arguments: userId);
                        }
                      },
                      label: 'Go Premium',
                    ),
                    const SizedBox(width: Fx.s6),
                  ],
                  PillBadge("${list.length}", color: Fx.mintDark, icon: Icons.insights_rounded),
                ],
              ),
              const SizedBox(height: Fx.s12),
            ],
            ...list.map((insight) {
              final color = _color(insight.type, insight.severity);
              final icon = _icon(insight.type, insight.category);
              final fallback = InsightMicrocopy.fallback();

              return Padding(
                key: ValueKey('${insight.title}|${insight.timestamp.toIso8601String()}'),
                padding: const EdgeInsets.symmetric(vertical: Fx.s6),
                child: InkWell(
                  borderRadius: BorderRadius.circular(Fx.r12),
                  onTap: () {
                    showDialog(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: Row(children: [
                          Icon(icon, color: color),
                          const SizedBox(width: Fx.s8),
                          Expanded(child: Text(insight.title.isEmpty ? "Insight" : insight.title)),
                        ]),
                        content: Text(insight.description.isEmpty ? fallback : insight.description),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Close'),
                          ),
                        ],
                      ),
                    );
                  },
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(icon, color: color, size: 22),
                      const SizedBox(width: Fx.s10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Expanded(
                                child: Text(
                                  insight.title.isEmpty ? "No Title" : insight.title,
                                  style: TextStyle(
                                    color: color,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if ((insight.category ?? '').isNotEmpty) ...[
                                const SizedBox(width: Fx.s8),
                                PillBadge(_categoryLabel(insight.category), color: color),
                              ],
                            ]),
                            const SizedBox(height: Fx.s4),
                            Text(
                              insight.description.isEmpty ? fallback : insight.description,
                              style: Fx.label.copyWith(fontSize: 13.5, color: Colors.black87),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: Fx.s4),
                            Row(children: [
                              if (insight.severity != null)
                                PillBadge("Severity: ${insight.severity}", color: color),
                              const Spacer(),
                              Text(
                                _timeAgo(insight.timestamp),
                                style: Fx.label.copyWith(fontSize: 11, color: Colors.grey[600]),
                              ),
                              const SizedBox(width: Fx.s6),
                              Text(
                                _dt.format(insight.timestamp),
                                style: Fx.label.copyWith(fontSize: 10.5, color: Colors.grey[500]),
                              ),
                            ]),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      );
    }

    if (userId == null) {
      final display = prepared.take(maxItems).toList();
      return buildCard(display, showUpsell: false);
    }

    return FutureBuilder<bool>(
      future: PremiumGate.instance.isPremium(userId!),
      builder: (context, snapshot) {
        final isPro = snapshot.data == true;
        final limit = (isPro ? maxItems.clamp(5, 20) : maxItems.clamp(3, 6)).toInt();
        final display = prepared.take(limit).toList();
        return buildCard(display, showUpsell: !isPro);
      },
    );
  }
}
