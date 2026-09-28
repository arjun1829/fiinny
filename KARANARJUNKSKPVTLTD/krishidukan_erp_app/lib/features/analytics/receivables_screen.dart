import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/time_range.dart';
import '../../widgets/customer_actions.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/range_selector.dart';
import 'analytics_repository.dart';
import 'metrics.dart';
import 'models.dart';

class ReceivablesScreen extends ConsumerWidget {
  const ReceivablesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = ref.watch(metricsProvider);
    final position = ref.watch(positionProvider);
    final range = ref.watch(timeRangeProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.cardHi,
          onRefresh: () async {
            ref.invalidate(billsProvider);
            ref.invalidate(positionProvider);
            await ref.read(billsProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 96),
            children: [
              const _ScreenTitle('Payments', 'Money in, money owed'),
              const SizedBox(height: 16),
              const RangeSelector(),
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.55,
                children: [
                  KpiCard(
                    label: 'Collected · ${range.label}',
                    value: fmtInrCompact(m.collected),
                    sub: '${m.paidCount} paid in full',
                    accent: AppColors.good,
                  ),
                  KpiCard(
                    label: 'Unpaid · ${range.label}',
                    value: fmtInrCompact(m.outstanding),
                    sub: '${m.pendingCount + m.partialCount} bills open',
                    accent: AppColors.critical,
                  ),
                ],
              ),
              const SectionTitle('Bill status'),
              Panel(
                child: Column(
                  children: [
                    _StatusRow(
                      icon: Icons.check_circle,
                      label: 'Paid',
                      count: m.paidCount,
                      total: m.billCount,
                      color: AppColors.good,
                    ),
                    const SizedBox(height: 14),
                    _StatusRow(
                      icon: Icons.timelapse,
                      label: 'Partly paid',
                      count: m.partialCount,
                      total: m.billCount,
                      color: AppColors.warning,
                    ),
                    const SizedBox(height: 14),
                    _StatusRow(
                      icon: Icons.error,
                      label: 'Pending',
                      count: m.pendingCount,
                      total: m.billCount,
                      color: AppColors.critical,
                    ),
                  ],
                ),
              ),
              const SectionTitle('Customer dues · all time'),
              position.when(
                loading: () => const Panel(
                  padding: EdgeInsets.all(28),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (_, __) =>
                    const EmptyNote('Could not load customer dues.'),
                data: (p) => p == null
                    ? const SizedBox.shrink()
                    : Column(
                        children: [
                          KpiCard(
                            label: 'Total udhaar to collect',
                            value: fmtInr(p.retailerOutstanding),
                            sub:
                                '${p.topRetailerDues.length} customers with dues',
                            accent: AppColors.critical,
                          ),
                          const SizedBox(height: 10),
                          _DuesList(dues: p.topRetailerDues),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScreenTitle extends StatelessWidget {
  const _ScreenTitle(this.title, this.subtitle);

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(subtitle.toUpperCase(), style: kMicro),
        const SizedBox(height: 4),
        Text(
          title,
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
            color: AppColors.ink,
          ),
        ),
      ],
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.icon,
    required this.label,
    required this.count,
    required this.total,
    required this.color,
  });

  final IconData icon;
  final String label;
  final int count;
  final int total;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final pct = total == 0 ? 0.0 : count / total;
    return Column(
      children: [
        Row(
          children: [
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                label,
                style: TextStyle(fontSize: 12.5, color: AppColors.inkDim),
              ),
            ),
            Text('$count', style: kTabular.copyWith(fontSize: 13)),
          ],
        ),
        const SizedBox(height: 7),
        ClipRRect(
          borderRadius: BorderRadius.circular(2),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: 4,
            backgroundColor: AppColors.cardHi,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }
}

class _DuesList extends StatelessWidget {
  const _DuesList({required this.dues});

  final List<NamedAmount> dues;

  @override
  Widget build(BuildContext context) {
    if (dues.isEmpty) {
      return const EmptyNote('No pending dues. All settled.');
    }
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(
        children: [
          for (final d in dues)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.critical.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          d.name.isEmpty ? '?' : d.name[0].toUpperCase(),
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.critical,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Text(
                          d.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: AppColors.ink),
                        ),
                      ),
                      Text(
                        fmtInr(d.amount),
                        style: kTabular.copyWith(
                            fontSize: 13, color: AppColors.critical),
                      ),
                    ],
                  ),
                  if (d.canCall || d.canNote) ...[
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.only(left: 39),
                      child: CustomerActions(
                        customerName: d.name,
                        phone: d.phone,
                        retailerId: d.retailerId,
                        compact: true,
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
