import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../models/expense_item.dart';

class HiddenChargesCard extends StatelessWidget {
  final String userPhone;
  final int days; // window
  const HiddenChargesCard({super.key, required this.userPhone, this.days = 30});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final from = DateTime(now.year, now.month, now.day).subtract(Duration(days: days));

    final q = FirebaseFirestore.instance
        .collection('users').doc(userPhone)
        .collection('expenses')
        .where('date', isGreaterThanOrEqualTo: Timestamp.fromDate(from))
        .orderBy('date', descending: true);

    return StreamBuilder<QuerySnapshot>(
      stream: q.snapshots(),
      builder: (ctx, snap) {
        if (!snap.hasData) {
          return _card(context, title: 'Hidden Charges', body: const Text('Analyzing…'));
        }
        final docs = snap.data!.docs;
        double total = 0;
        final byType = <String, double>{};
        final feeWords = RegExp(r'\b(fee|charge|convenience|processing|gst|markup|penalty|late)\b',
            caseSensitive: false);

        List<ExpenseItem> items = docs.map((d) => ExpenseItem.fromFirestore(d)).toList();

        for (final e in items) {
          final tags = (e.toJson()['tags'] as List?)?.cast<String>() ?? const [];
          final isFeeTag = tags.contains('fee');
          final isFeeHeuristic = feeWords.hasMatch(e.note);
          if (!isFeeTag && !isFeeHeuristic) continue;

          // figure type
          String t = 'Fee';
          final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();
          if (meta != null && meta['feeType'] is String && (meta['feeType'] as String).trim().isNotEmpty) {
            t = _title(meta['feeType'] as String);
          } else {
            // lightweight guess
            if (e.note.toLowerCase().contains('late')) t = 'Late Fee';
            else if (e.note.toLowerCase().contains('convenience')) t = 'Convenience';
            else if (e.note.toLowerCase().contains('processing')) t = 'Processing';
            else if (e.note.toLowerCase().contains('gst')) t = 'GST';
            else if (e.note.toLowerCase().contains('markup') || e.note.toLowerCase().contains('forex')) t = 'Forex Markup';
          }

          total += e.amount;
          byType[t] = (byType[t] ?? 0) + e.amount;
        }

        return _card(
          context,
          title: 'Hidden Charges (last $days days)',
          subtitle: 'Total ₹${_fmt(total)}',
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: byType.entries.map((e) {
                  return Chip(
                    label: Text('${e.key}: ₹${_fmt(e.value)}'),
                  );
                }).toList(),
              ),
              const SizedBox(height: 8),
              if (total == 0)
                const Text('No hidden charges detected. ✅')
              else
                const Text('Tip: You can reduce convenience/forex charges by using UPI/zero-markup cards.'),
            ],
          ),
        );
      },
    );
  }

  Widget _card(BuildContext ctx, {required String title, String? subtitle, required Widget body}) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(ctx).cardColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: kElevationToShadow[2],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: Theme.of(ctx).textTheme.titleMedium),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(subtitle, style: Theme.of(ctx).textTheme.bodyMedium),
        ],
        const SizedBox(height: 12),
        body,
      ]),
    );
  }

  static String _fmt(double v) => v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 2);
  static String _title(String s) => s.isEmpty ? s : s.split(RegExp(r'\s+')).map((w) => w.isEmpty ? w : w[0].toUpperCase()+w.substring(1)).join(' ');
}
