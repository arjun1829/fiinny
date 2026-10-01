import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/range_selector.dart';
import 'analytics_repository.dart';
import 'metrics.dart';

class PositionScreen extends ConsumerWidget {
  const PositionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final position = ref.watch(positionProvider);
    final flow = ref.watch(supplierFlowProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.cardHi,
          onRefresh: () async {
            ref.invalidate(positionProvider);
            await ref.read(positionProvider.future);
          },
          child: position.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => ListView(
              padding: const EdgeInsets.all(30),
              children: [
                SizedBox(height: 80),
                Icon(Icons.cloud_off, size: 48, color: AppColors.inkMute),
                SizedBox(height: 18),
                Text(
                  'Could not load your business position. Pull down to retry.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.inkDim, fontSize: 13),
                ),
              ],
            ),
            data: (p) {
              if (p == null) return const SizedBox.shrink();
              final net = p.retailerOutstanding - p.supplierOutstanding;
              return ListView(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 96),
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('BALANCES ARE ALL-TIME', style: kMicro),
                      const SizedBox(height: 4),
                      Text(
                        'Position',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.5,
                          color: AppColors.ink,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const RangeSelector(),
                  const SizedBox(height: 16),
                  _NetCard(net: net),
                  const SectionTitle('Balances · all time'),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.55,
                    children: [
                      KpiCard(
                        label: 'To collect',
                        value: fmtInrCompact(p.retailerOutstanding),
                        sub: 'From customers',
                        accent: AppColors.good,
                      ),
                      KpiCard(
                        label: 'To pay',
                        value: fmtInrCompact(p.supplierOutstanding),
                        sub: 'To suppliers',
                        accent: AppColors.critical,
                      ),
                      KpiCard(
                        label: 'Stock value',
                        value: fmtInrCompact(p.inventoryValue),
                        sub: 'At selling price',
                        accent: AppColors.b2b,
                      ),
                      KpiCard(
                        label: 'Net position',
                        value: fmtInrCompact(net),
                        sub: net >= 0 ? 'In your favour' : 'You owe more',
                        accent: net >= 0 ? AppColors.good : AppColors.critical,
                      ),
                    ],
                  ),
                  const SectionTitle('Supplier ledger · selected range'),
                  Panel(
                    child: Column(
                      children: [
                        _MetricRow(
                          label: 'Purchases in range',
                          value: fmtInr(flow.purchases),
                          color: AppColors.pos,
                        ),
                        const Divider(height: 22),
                        _MetricRow(
                          label: 'Paid in range',
                          value: fmtInr(flow.payments),
                          color: AppColors.online,
                        ),
                        const Divider(height: 22),
                        _MetricRow(
                          label: 'Still owed · all time',
                          value: fmtInr(p.supplierOutstanding),
                          color: AppColors.critical,
                          bold: true,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Balances are all-time snapshots from your ERP ledgers. '
                    'Purchases and payments above respect the range picked.',
                    style: TextStyle(fontSize: 11, color: AppColors.inkMute),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _NetCard extends StatelessWidget {
  const _NetCard({required this.net});

  final double net;

  @override
  Widget build(BuildContext context) {
    final favourable = net >= 0;
    final color = favourable ? AppColors.good : AppColors.critical;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderHi),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.cardHi, AppColors.bg],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('NET POSITION', style: kMicro),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              fmtInr(net),
              style: kFigure.copyWith(fontSize: 34, letterSpacing: -1.3),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                favourable ? Icons.trending_up : Icons.trending_down,
                size: 14,
                color: color,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  favourable
                      ? 'Customers owe you more than you owe'
                      : 'You owe suppliers more than customers owe you',
                  style: TextStyle(fontSize: 11.5, color: color),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({
    required this.label,
    required this.value,
    required this.color,
    this.bold = false,
  });

  final String label;
  final String value;
  final Color color;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 3,
          height: 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: TextStyle(fontSize: 12.5, color: AppColors.inkDim),
          ),
        ),
        Text(
          value,
          style: kTabular.copyWith(
            fontSize: 13.5,
            fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
            color: bold ? color : AppColors.ink,
          ),
        ),
      ],
    );
  }
}
