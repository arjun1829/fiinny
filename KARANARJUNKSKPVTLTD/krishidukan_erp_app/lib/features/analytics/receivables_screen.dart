import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/navigation.dart';
import '../../app/theme.dart';
import '../../core/erp_links.dart';
import '../../core/format.dart';
import '../../widgets/due_tile.dart';
import '../../widgets/range_selector.dart';
import '../../widgets/ui.dart';
import 'analytics_repository.dart';
import 'metrics.dart';

/// "Who owes me, and how do I get it back" — every due customer with Call and
/// Note on the row itself, plus one-tap reminders and payment links.
class ReceivablesScreen extends ConsumerStatefulWidget {
  const ReceivablesScreen({super.key});

  @override
  ConsumerState<ReceivablesScreen> createState() => _ReceivablesScreenState();
}

class _ReceivablesScreenState extends ConsumerState<ReceivablesScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final m = ref.watch(metricsProvider);
    final position = ref.watch(positionProvider);

    return Column(
      children: [
        const PageHeader(title: 'Dues & collections'),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            backgroundColor: AppColors.surface,
            onRefresh: () async {
              ref.invalidate(billsProvider);
              ref.invalidate(positionProvider);
              await Future.wait([
                ref.read(billsProvider.future),
                ref.read(positionProvider.future),
              ]);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                position.when(
                  loading: () => const SkeletonBox(height: 150),
                  error: (_, __) => const EmptyNote(
                    'Couldn\'t load customer dues. Pull down to refresh.',
                    icon: Icons.wifi_off_rounded,
                  ),
                  data: (p) => _OwedCard(
                    total: p?.retailerOutstanding ?? 0,
                    customers: p?.customerDues.length ?? 0,
                  ),
                ),
                const SectionHeader('This period'),
                const RangeSelector(),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: StatTile(
                        label: 'Received',
                        value: fmtInrCompact(m.collected),
                        sub: '${m.paidCount} bills fully paid',
                        icon: Icons.south_west_rounded,
                        color: AppColors.good,
                        onTap: () =>
                            openBills(ref, status: BillStatusFilter.paid),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: StatTile(
                        label: 'Unpaid',
                        value: fmtInrCompact(m.outstanding),
                        sub: '${m.pendingCount + m.partialCount} bills open',
                        icon: Icons.schedule_rounded,
                        color: AppColors.critical,
                        onTap: () =>
                            openBills(ref, status: BillStatusFilter.unpaid),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _StatusBreakdown(
                  paid: m.paidCount,
                  partial: m.partialCount,
                  pending: m.pendingCount,
                ),
                SectionHeader(
                  'Customer dues',
                  trailing: Text('All time', style: AppText.small),
                ),
                position.when(
                  loading: () => const SkeletonBox(height: 220),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (p) {
                    final dues = p?.customerDues ?? const [];
                    if (dues.isEmpty) {
                      return const EmptyNote('No pending dues — all settled.',
                          icon: Icons.verified_outlined);
                    }
                    final q = _query.trim().toLowerCase();
                    final shown = q.isEmpty
                        ? dues
                        : dues
                            .where((d) => d.name.toLowerCase().contains(q))
                            .toList();
                    final max = dues.first.amount;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (dues.length > 6) ...[
                          TextField(
                            onChanged: (v) => setState(() => _query = v),
                            decoration: const InputDecoration(
                              hintText: 'Search customer',
                              prefixIcon: Icon(Icons.search_rounded, size: 21),
                              isDense: true,
                            ),
                          ),
                          const SizedBox(height: 10),
                        ],
                        if (shown.isEmpty)
                          EmptyNote('No customer matches "$_query".',
                              icon: Icons.person_search_outlined)
                        else
                          AppCard(
                            padding: const EdgeInsets.fromLTRB(14, 4, 10, 4),
                            child: Column(
                              children: [
                                for (var i = 0; i < shown.length; i++) ...[
                                  if (i > 0) const Divider(indent: 52),
                                  DueRow(
                                    due: shown[i],
                                    share: max == 0 ? 0 : shown[i].amount / max,
                                  ),
                                ],
                              ],
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _OwedCard extends StatelessWidget {
  const _OwedCard({required this.total, required this.customers});

  final double total;
  final int customers;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconBadge(
                icon: Icons.account_balance_wallet_outlined,
                color: AppColors.critical,
                size: 34,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text('Customers owe you', style: AppText.label),
              ),
              Text(
                customers == 0
                    ? ''
                    : '$customers ${customers == 1 ? 'customer' : 'customers'}',
                style: AppText.label,
              ),
            ],
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              fmtInr(total),
              style: AppText.figure.copyWith(fontSize: 30),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => openErp(context, '/payment-reminders'),
                  icon: Icon(Icons.notifications_active_outlined,
                      size: 18, color: AppColors.primary),
                  label: const Text('Remind'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => openErp(context, '/payment-links'),
                  icon: const Icon(Icons.link_rounded, size: 18),
                  label: const Text('Payment link'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// One stacked bar (paid / partly paid / pending) with a legend underneath.
class _StatusBreakdown extends StatelessWidget {
  const _StatusBreakdown({
    required this.paid,
    required this.partial,
    required this.pending,
  });

  final int paid;
  final int partial;
  final int pending;

  @override
  Widget build(BuildContext context) {
    final total = paid + partial + pending;
    final parts = [
      ('Paid', paid, AppColors.good),
      ('Partly paid', partial, AppColors.warning),
      ('Pending', pending, AppColors.critical),
    ];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Bill status', style: AppText.label),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: SizedBox(
              height: 10,
              child: total == 0
                  ? Container(color: AppColors.cardHi)
                  : Row(
                      children: [
                        for (final (_, n, c) in parts)
                          if (n > 0)
                            Expanded(flex: n, child: Container(color: c)),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (label, n, c) in parts)
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration:
                            BoxDecoration(color: c, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          '$label $n',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              AppText.small.copyWith(color: AppColors.inkDim),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
