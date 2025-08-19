import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/insight_model.dart';

class InsightFeedCard extends StatelessWidget {
  final List<InsightModel> insights;

  const InsightFeedCard({Key? key, required this.insights}) : super(key: key);

  Color _getColor(InsightType type, int? severity) {
    if (type == InsightType.positive) return Colors.green.shade600;
    if (type == InsightType.warning) return Colors.orange.shade700;
    if (type == InsightType.critical) return Colors.red.shade600;
    if (severity != null) {
      if (severity >= 3) return Colors.red.shade700;
      if (severity == 2) return Colors.orange.shade700;
      if (severity == 1) return Colors.teal.shade700;
    }
    return Colors.blue.shade600;
  }

  IconData _getIcon(InsightType type, String? category) {
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
      default:
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
  }

  String _timeAgo(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inDays >= 1) return '${diff.inDays}d ago';
    if (diff.inHours >= 1) return '${diff.inHours}h ago';
    if (diff.inMinutes >= 1) return '${diff.inMinutes}m ago';
    return 'Just now';
  }

  String _categoryLabel(String? category) {
    switch (category) {
      case 'loan':
        return 'Loan';
      case 'asset':
        return 'Asset';
      case 'goal':
        return 'Goal';
      case 'netWorth':
        return 'Net Worth';
      case 'crisis':
        return 'Crisis';
      case 'expense':
        return 'Expense';
      default:
        return '';
    }
  }

  String _prettyDate(DateTime dt) {
    try {
      return DateFormat('dd MMM, hh:mm a').format(dt);
    } catch (e) {
      return dt.toIso8601String();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (insights.isEmpty) return const SizedBox.shrink();

    return Card(
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      color: Colors.white.withOpacity(0.93),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.teal.shade300, Colors.teal.shade700],
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                "🔍 Smart Insights",
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Insight List
            ...insights.map((insight) {
              final color = _getColor(insight.type, insight.severity);
              final icon = _getIcon(insight.type, insight.category);
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(13),
                    onTap: () {
                      // Show dialog with full details (future enhancement)
                      showDialog(
                        context: context,
                        builder: (_) => AlertDialog(
                          title: Row(
                            children: [
                              Icon(icon, color: color, size: 27),
                              const SizedBox(width: 10),
                              Expanded(child: Text(insight.title)),
                            ],
                          ),
                          content: Text(insight.description),
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
                        Icon(icon, color: color, size: 27),
                        const SizedBox(width: 13),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      insight.title.isEmpty ? "No Title" : insight.title,
                                      style: TextStyle(
                                        color: color,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 15.2,
                                      ),
                                    ),
                                  ),
                                  if ((insight.category ?? '').isNotEmpty) ...[
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: color.withOpacity(0.09),
                                        borderRadius: BorderRadius.circular(7),
                                      ),
                                      child: Text(
                                        _categoryLabel(insight.category),
                                        style: TextStyle(
                                          color: color,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 11,
                                          letterSpacing: 0.3,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                insight.description.isEmpty ? "No description available." : insight.description,
                                style: const TextStyle(fontSize: 13.5, color: Colors.black87),
                              ),
                              Row(
                                children: [
                                  if (insight.severity != null)
                                    Container(
                                      margin: const EdgeInsets.only(right: 8, top: 1),
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: color.withOpacity(0.13),
                                        borderRadius: BorderRadius.circular(5),
                                      ),
                                      child: Text(
                                        "Severity: ${insight.severity}",
                                        style: TextStyle(
                                          color: color,
                                          fontWeight: FontWeight.w600,
                                          fontSize: 10.8,
                                        ),
                                      ),
                                    ),
                                  const Spacer(),
                                  Text(
                                    _timeAgo(insight.timestamp),
                                    style: TextStyle(
                                      color: Colors.grey[600],
                                      fontSize: 11.3,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  const SizedBox(width: 7),
                                  Text(
                                    _prettyDate(insight.timestamp),
                                    style: TextStyle(
                                      color: Colors.grey[500],
                                      fontSize: 10.5,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ],
        ),
      ),
    );
  }
}
