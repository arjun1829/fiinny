import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/format_utils.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../providers/report_providers.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(reportRangeProvider);
    final reportAsync = ref.watch(salesReportProvider);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Reports'),
            Text(
              range.subtitle,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: SegmentedButton<RangePreset>(
              segments: [
                for (final p in RangePreset.values)
                  ButtonSegment(value: p, label: Text(p.label)),
              ],
              selected: {range},
              showSelectedIcon: false,
              onSelectionChanged: (s) =>
                  ref.read(reportRangeProvider.notifier).set(s.first),
              style: SegmentedButton.styleFrom(
                visualDensity: VisualDensity.compact,
                textStyle: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: reportAsync.when(
              loading: () =>
                  const LoadingView(message: 'Crunching your numbers…'),
              error: (e, _) => ErrorView(
                message:
                    'Could not build your report. '
                    'Check your connection and try again.',
                onRetry: () => ref.invalidate(salesReportProvider),
              ),
              data: (report) {
                if (report.isEmpty) {
                  return const EmptyView(
                    icon: Icons.insert_chart_outlined_rounded,
                    title: 'Nothing to report yet',
                    message:
                        'Once you start days and log visits, your totals for '
                        'this period appear here.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(salesReportProvider);
                    await ref.read(salesReportProvider.future);
                  },
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
                    children: [
                      const SectionLabel('Activity'),
                      Row(
                        children: [
                          Expanded(
                            child: _Metric(
                              icon: Icons.storefront_rounded,
                              label: 'Visits',
                              value: '${report.visitCount}',
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _Metric(
                              icon: Icons.groups_2_rounded,
                              label: 'Dealers covered',
                              value: '${report.dealersCovered}',
                              color: AppColors.info,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _Metric(
                              icon: Icons.event_available_rounded,
                              label: 'Days worked',
                              value: '${report.daysWorked}',
                              color: AppColors.success,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _Metric(
                              icon: Icons.trending_up_rounded,
                              label: 'Visits / day',
                              value: report.visitsPerWorkingDay.toStringAsFixed(
                                1,
                              ),
                              color: AppColors.harvest,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 26),
                      const SectionLabel('Time & travel'),
                      Row(
                        children: [
                          Expanded(
                            child: _Metric(
                              icon: Icons.timer_rounded,
                              label: 'Hours worked',
                              value: FormatUtils.duration(report.totalMinutes),
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _Metric(
                              icon: Icons.route_rounded,
                              label: 'Distance',
                              value: report.totalDistanceKm == 0
                                  ? '—'
                                  : '${report.totalDistanceKm.toStringAsFixed(0)} km',
                              color: AppColors.info,
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 26),
                      const SectionLabel('Expenses'),
                      Row(
                        children: [
                          Expanded(
                            child: _Metric(
                              icon: Icons.receipt_long_rounded,
                              label: 'Claimed',
                              value: FormatUtils.money(report.expenseTotal),
                              color: AppColors.success,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _Metric(
                              icon: Icons.hourglass_bottom_rounded,
                              label: 'Awaiting approval',
                              value: FormatUtils.money(report.expensePending),
                              color: AppColors.warning,
                            ),
                          ),
                        ],
                      ),

                      if (report.visitsByDate.isNotEmpty) ...[
                        const SizedBox(height: 26),
                        const SectionLabel('Visits per day'),
                        AppCard(child: _DailyBars(report: report)),
                      ],

                      if (report.visitsByPurpose.isNotEmpty) ...[
                        const SizedBox(height: 26),
                        const SectionLabel('What the visits were for'),
                        AppCard(
                          child: Column(
                            children: [
                              for (final e in report.visitsByPurpose)
                                _PurposeBar(
                                  label: e.key,
                                  count: e.value,
                                  total: report.visitCount,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 34,
            width: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(height: 12),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              color: AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// Simple column chart of visits per day, oldest to newest.
class _DailyBars extends StatelessWidget {
  const _DailyBars({required this.report});
  final SalesReport report;

  @override
  Widget build(BuildContext context) {
    final entries = report.visitsByDate.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final max = entries.fold<int>(1, (m, e) => e.value > m ? e.value : m);

    return SizedBox(
      height: 132,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        reverse: true,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final e in entries)
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      '${e.value}',
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      width: 22,
                      height: (e.value / max) * 78 + 6,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(
                          alpha: 0.35 + 0.65 * (e.value / max),
                        ),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    SizedBox(
                      width: 30,
                      child: Text(
                        IstDate.shortLabel(e.key),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 9.5,
                          color: AppColors.outline,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PurposeBar extends StatelessWidget {
  const _PurposeBar({
    required this.label,
    required this.count,
    required this.total,
  });

  final String label;
  final int count;
  final int total;

  @override
  Widget build(BuildContext context) {
    final fraction = total == 0 ? 0.0 : count / total;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurface,
                  ),
                ),
              ),
              Text(
                '$count · ${(fraction * 100).round()}%',
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 6,
              backgroundColor: AppColors.surfaceContainer,
              valueColor: const AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}
