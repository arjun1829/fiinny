import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/navigation.dart';
import '../../app/theme.dart';
import '../../core/erp_links.dart';
import '../../core/format.dart';
import '../../widgets/range_selector.dart';
import '../../widgets/ui.dart';
import 'analytics_repository.dart';
import 'metrics.dart';

/// The owner's balance sheet in plain words: what customers owe me, what I
/// owe suppliers, what's sitting in stock, and the net of it.
class PositionScreen extends ConsumerWidget {
  const PositionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final position = ref.watch(positionProvider);
    final flow = ref.watch(supplierFlowProvider);

    return Column(
      children: [
        const PageHeader(title: 'Business position'),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            backgroundColor: AppColors.surface,
            onRefresh: () async {
              ref.invalidate(positionProvider);
              await ref.read(positionProvider.future);
            },
            child: position.when(
              loading: () => ListView(
                padding: const EdgeInsets.all(16),
                children: const [
                  SkeletonBox(height: 130),
                  SizedBox(height: 14),
                  SkeletonBox(height: 220),
                  SizedBox(height: 14),
                  SkeletonBox(height: 160),
                ],
              ),
              error: (e, _) => ErrorState(
                error: e,
                onRetry: () => ref.invalidate(positionProvider),
              ),
              data: (p) {
                if (p == null) return const SizedBox.shrink();
                final net = p.retailerOutstanding - p.supplierOutstanding;
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                  children: [
                    _NetCard(net: net),
                    const SectionHeader('Balances'),
                    Row(
                      children: [
                        Expanded(
                          child: StatTile(
                            label: 'To collect',
                            value: fmtInrCompact(p.retailerOutstanding),
                            sub: 'From customers',
                            icon: Icons.south_west_rounded,
                            color: AppColors.good,
                            onTap: () => ref
                                .read(currentTabProvider.notifier)
                                .state = AppTab.dues,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: StatTile(
                            label: 'To pay',
                            value: fmtInrCompact(p.supplierOutstanding),
                            sub: 'To suppliers',
                            icon: Icons.north_east_rounded,
                            color: AppColors.critical,
                            onTap: () => openErp(context, '/supplier-ledger'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    StatTile(
                      label: 'Stock value',
                      value: fmtInr(p.inventoryValue),
                      sub: 'Loose pieces × selling price · tap to view stock',
                      icon: Icons.inventory_2_outlined,
                      color: AppColors.b2b,
                      onTap: () => openErp(context, '/rates'),
                    ),
                    const SectionHeader('Supplier purchases'),
                    const RangeSelector(),
                    const SizedBox(height: 12),
                    AppCard(
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
                      child: Column(
                        children: [
                          _FlowRow(
                            icon: Icons.shopping_cart_outlined,
                            label: 'Purchased in period',
                            value: fmtInr(flow.purchases),
                            color: AppColors.pos,
                          ),
                          const Divider(indent: 46),
                          _FlowRow(
                            icon: Icons.payments_outlined,
                            label: 'Paid to suppliers',
                            value: fmtInr(flow.payments),
                            color: AppColors.good,
                          ),
                          const Divider(indent: 46),
                          _FlowRow(
                            icon: Icons.account_balance_outlined,
                            label: 'Still owed (all time)',
                            value: fmtInr(p.supplierOutstanding),
                            color: AppColors.critical,
                            bold: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => openErp(context, '/supplier-ledger'),
                      icon: Icon(Icons.open_in_new_rounded,
                          size: 18, color: AppColors.primary),
                      label: const Text('Open supplier ledger'),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline_rounded,
                            size: 15, color: AppColors.inkMute),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Balances are all-time totals from your ERP '
                            'ledgers. Purchases and payments follow the '
                            'period you pick.',
                            style: AppText.small,
                          ),
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _NetCard extends StatelessWidget {
  const _NetCard({required this.net});

  final double net;

  @override
  Widget build(BuildContext context) {
    final good = net >= 0;
    final color = good ? AppColors.good : AppColors.critical;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Net position', style: AppText.label)),
              StatusChip(good ? 'In your favour' : 'You owe more',
                  color: color),
            ],
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              fmtInr(net),
              style: AppText.figure.copyWith(fontSize: 30, color: color),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            good
                ? 'Customers owe you more than you owe suppliers.'
                : 'You owe suppliers more than customers owe you.',
            style: TextStyle(fontSize: 13, color: AppColors.inkDim),
          ),
        ],
      ),
    );
  }
}

class _FlowRow extends StatelessWidget {
  const _FlowRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    this.bold = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          IconBadge(icon: icon, color: color, size: 34),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label,
                style: TextStyle(fontSize: 14, color: AppColors.inkDim)),
          ),
          Text(
            value,
            style: AppText.amount.copyWith(
              color: bold ? color : AppColors.ink,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
