import 'package:flutter/material.dart';
import '../../../services/subscriptions/subscriptions_service.dart';
import '../../../widgets/common/progress_bar.dart';
import '../../../widgets/common/pill_badge.dart';

class SummaryCard extends StatelessWidget {
  final SubsBillsKpis kpis;
  const SummaryCard({Key? key, required this.kpis}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _TitleRow(),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: [
              PillBadge(text: 'Active: ${kpis.active}'),
              PillBadge(text: 'Paused: ${kpis.paused}'),
              PillBadge(text: 'Closed: ${kpis.closed}'),
              PillBadge(text: 'Overdue: ${kpis.overdue}'),
              PillBadge(text: kpis.monthTotal > 0 ? 'This month: ₹${kpis.monthTotal.toStringAsFixed(0)}' : 'This month: --'),
              PillBadge(text: kpis.nextDue == null ? 'Next: --' : 'Next: ${_fmt(kpis.nextDue!)}'),
            ],
          ),
          const SizedBox(height: 12),
          ProgressBar(
            label: 'Month progress',
            value: kpis.monthProgress,
            meta: kpis.monthMeta,
          ),
        ],
      ),
    );
  }

  static String _fmt(DateTime d) => '${d.day}/${d.month}/${d.year}';

  Widget _card({required Widget child}) => Container(
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.black12),
      boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 6))],
    ),
    child: Padding(padding: const EdgeInsets.all(14), child: child),
  );
}

class _TitleRow extends StatelessWidget {
  const _TitleRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: const [
        Icon(Icons.receipt_long_outlined),
        SizedBox(width: 8),
        Text('Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
      ],
    );
  }
}
