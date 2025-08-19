import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart'; // for Timestamp (safe to keep; no-op if unused)

class SharedGoalsWidget extends StatelessWidget {
  /// Each goal map can include:
  /// {
  ///   'title': String,
  ///   'amount': num/double/int (target),
  ///   'savedAmount': num (optional, defaults 0),
  ///   'targetDate': Timestamp/DateTime/String (optional),
  ///   'completed': bool (optional),
  ///   'currency': String (e.g., "₹", "USD") optional
  /// }
  final List<Map<String, dynamic>> goals;

  const SharedGoalsWidget({Key? key, required this.goals}) : super(key: key);

  String _safeTitle(Map<String, dynamic> g) {
    final t = (g['title'] ?? '').toString().trim();
    return t.isEmpty ? 'Untitled goal' : t;
    }

  double _toDouble(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.replaceAll(',', '').trim()) ?? 0.0;
    return 0.0;
  }

  String _currency(Map<String, dynamic> g) {
    final c = (g['currency'] ?? '').toString().trim();
    // Default to INR symbol if not provided
    return c.isEmpty ? '₹' : c;
  }

  /// Accepts Timestamp / DateTime / String and returns a short dd/MM/yy string.
  String _fmtDate(dynamic v) {
    if (v == null) return '';
    DateTime? d;
    if (v is Timestamp) {
      d = v.toDate();
    } else if (v is DateTime) {
      d = v;
    } else if (v is String) {
      // very lenient parse; if it fails, just show the raw string
      try {
        d = DateTime.tryParse(v);
      } catch (_) {
        d = null;
      }
      if (d == null) return v;
    }
    if (d == null) return '';
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    final yy = (d.year % 100).toString().padLeft(2, '0');
    return '$dd/$mm/$yy';
  }

  @override
  Widget build(BuildContext context) {
    if (goals.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.flag_circle_rounded, size: 44, color: Colors.teal.withOpacity(0.7)),
            const SizedBox(height: 8),
            Text('No shared goals yet!',
                style: TextStyle(color: Colors.teal[700], fontWeight: FontWeight.w600)),
          ],
        ),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: goals.length,
      itemBuilder: (context, i) {
        final g = goals[i];

        final title = _safeTitle(g);
        final target = _toDouble(g['amount']);       // target amount
        final saved = _toDouble(g['savedAmount']);   // saved so far (optional)
        final currency = _currency(g);
        final completed = (g['completed'] == true) || (target > 0 && saved >= target);
        final targetDateStr = _fmtDate(g['targetDate']);

        final progress = target <= 0 ? 0.0 : (saved / target).clamp(0.0, 1.0);
        final pct = (progress * 100).toStringAsFixed(0);

        return Card(
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title + Status chip
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: completed
                            ? Colors.green.withOpacity(0.12)
                            : Colors.orange.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            completed ? Icons.check_circle : Icons.radio_button_unchecked,
                            size: 16,
                            color: completed ? Colors.green[700] : Colors.orange[800],
                          ),
                          const SizedBox(width: 6),
                          Text(
                            completed ? 'Completed' : 'In progress',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: completed ? Colors.green[700] : Colors.orange[800],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Progress bar
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: Colors.grey.withOpacity(0.18),
                    valueColor: AlwaysStoppedAnimation(
                      completed ? Colors.green : Colors.teal,
                    ),
                  ),
                ),
                const SizedBox(height: 8),

                // Amounts + target date
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '$currency${saved.toStringAsFixed(0)} / $currency${target.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: completed ? Colors.green[800] : Colors.teal[800],
                      ),
                    ),
                    Text(
                      pct == '0' && target == 0
                          ? ''
                          : '$pct%',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: completed ? Colors.green[800] : Colors.teal[800],
                      ),
                    ),
                  ],
                ),

                if (targetDateStr.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.event, size: 16, color: Colors.grey),
                      const SizedBox(width: 6),
                      Text(
                        'Due: $targetDateStr',
                        style: TextStyle(color: Colors.grey[700], fontSize: 13),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
