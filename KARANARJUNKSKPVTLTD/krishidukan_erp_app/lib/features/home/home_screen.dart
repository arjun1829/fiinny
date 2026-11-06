import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/navigation.dart';
import '../../app/theme.dart';
import '../../core/erp_links.dart';
import '../../core/format.dart';
import '../../core/time_range.dart';
import '../../widgets/all_features_sheet.dart';
import '../../widgets/bill_tile.dart';
import '../../widgets/channel_pie_chart.dart';
import '../../widgets/due_tile.dart';
import '../../widgets/range_selector.dart';
import '../../widgets/revenue_chart.dart';
import '../../widgets/ui.dart';
import '../analytics/analytics_repository.dart';
import '../analytics/business_type.dart';
import '../analytics/metrics.dart';
import '../analytics/models.dart';
import '../auth/auth_repository.dart';

/// Everything an owner checks daily on one scroll, in the order they'd ask:
/// how much did I sell → who owes me → what do I want to do next.
/// Every tile either jumps straight to the filtered list in-app or opens the
/// exact web-ERP page — no hunting through menus.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(billsProvider);
    ref.invalidate(positionProvider);
    await ref.read(billsProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bills = ref.watch(billsProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: bills.hasError && !bills.hasValue
          ? SafeArea(
              child: ErrorState(
                error: bills.error!,
                onRetry: () => ref.invalidate(billsProvider),
              ),
            )
          : RefreshIndicator(
              color: AppColors.primary,
              backgroundColor: AppColors.surface,
              onRefresh: () => _refresh(ref),
              child: ListView(
                padding: const EdgeInsets.only(bottom: 28),
                children: [
                  _Header(onRefresh: () => _refresh(ref)),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 14, 16, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _QuickAccess(),
                        _CreateInErp(),
                        _CollectMoney(),
                        _SalesTrend(),
                        _ByChannel(),
                        _RecentBills(),
                        _TopCustomers(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

// ───────────────────────────── Header + summary ─────────────────────────────

class _Header extends ConsumerWidget {
  const _Header({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final top = MediaQuery.paddingOf(context).top;
    final fg = AppColors.onHeader;

    return Stack(
      children: [
        // Blue band; the summary card overlaps its lower half.
        Container(height: top + 128, color: AppColors.header),
        Column(
          children: [
            SizedBox(height: top),
            SizedBox(
              height: 60,
              child: Row(
                children: [
                  const SizedBox(width: 4),
                  IconButton(
                    tooltip: 'Menu',
                    onPressed: () => Scaffold.of(context).openDrawer(),
                    icon: Icon(Icons.menu_rounded, color: fg),
                  ),
                  const SizedBox(width: 2),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          greetingFor(DateTime.now().hour),
                          style: TextStyle(
                            fontSize: 12.5,
                            color: fg.withValues(alpha: 0.78),
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          user?.businessName ?? 'Loading…',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: fg,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Refresh',
                    onPressed: onRefresh,
                    icon: Icon(Icons.refresh_rounded, color: fg),
                  ),
                  const SizedBox(width: 4),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: _SummaryCard(),
            ),
            const SizedBox(height: 14),
            const RangeSelector(padding: EdgeInsets.symmetric(horizontal: 16)),
          ],
        ),
      ],
    );
  }
}

class _SummaryCard extends ConsumerWidget {
  const _SummaryCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loading = ref.watch(billsProvider).isLoading;
    final m = ref.watch(metricsProvider);
    final range = ref.watch(timeRangeProvider);
    final unpaidCount = m.pendingCount + m.partialCount;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A10234A),
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      range == TimeRange.custom
                          ? 'Sales · selected dates'
                          : 'Sales · ${range.label.toLowerCase()}',
                      style: AppText.label,
                    ),
                    const Spacer(),
                    if (!loading)
                      Text(
                          '${m.billCount} ${m.billCount == 1 ? 'bill' : 'bills'}',
                          style: AppText.label),
                  ],
                ),
                const SizedBox(height: 6),
                loading
                    ? const SkeletonBox(height: 34, width: 170)
                    : FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          fmtInr(m.total),
                          style: AppText.figure.copyWith(
                            fontSize: 30,
                            letterSpacing: -0.8,
                          ),
                        ),
                      ),
              ],
            ),
          ),
          Divider(height: 1, color: AppColors.border),
          IntrinsicHeight(
            child: Row(
              children: [
                _MiniStat(
                  label: 'Received',
                  value: loading ? '—' : fmtInrCompact(m.collected),
                  color: AppColors.good,
                  icon: Icons.south_west_rounded,
                  onTap: () => openBills(ref, status: BillStatusFilter.paid),
                ),
                VerticalDivider(width: 1, color: AppColors.border),
                _MiniStat(
                  label: unpaidCount == 0 ? 'Unpaid' : 'Unpaid · $unpaidCount',
                  value: loading ? '—' : fmtInrCompact(m.outstanding),
                  color: AppColors.critical,
                  icon: Icons.schedule_rounded,
                  onTap: () => openBills(ref, status: BillStatusFilter.unpaid),
                ),
                VerticalDivider(width: 1, color: AppColors.border),
                _MiniStat(
                  label: 'Avg bill',
                  value: loading || m.billCount == 0
                      ? '—'
                      : fmtInrCompact(m.average),
                  color: AppColors.primary,
                  icon: Icons.receipt_outlined,
                  onTap: () => openBills(ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final String value;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, size: 13, color: color),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.small),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: AppText.amount.copyWith(fontSize: 15.5, color: color),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────── Shortcuts ────────────────────────────────

/// A titled white card holding a grid of tiles — the reference layout.
class _TileCard extends StatelessWidget {
  const _TileCard({required this.title, required this.tiles, this.trailing});

  final String title;
  final List<Widget> tiles;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(8, 14, 8, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
              child: Row(
                children: [
                  Expanded(child: Text(title, style: AppText.section)),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
            TileGrid(children: tiles),
          ],
        ),
      ),
    );
  }
}

/// In-app destinations, pre-filtered.
class _QuickAccess extends ConsumerWidget {
  const _QuickAccess();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = ref.watch(metricsProvider);
    final dues = ref.watch(positionProvider).valueOrNull?.customerDues.length;
    final unpaid = m.pendingCount + m.partialCount;

    String? badge(int? n) =>
        n == null || n == 0 ? null : (n > 99 ? '99+' : '$n');

    return _TileCard(
      title: 'Quick access',
      tiles: [
        FeatureTile(
          icon: Icons.receipt_long_outlined,
          label: 'All Bills',
          onTap: () => openBills(ref),
        ),
        FeatureTile(
          icon: Icons.pending_actions_outlined,
          label: 'Unpaid Bills',
          badge: badge(unpaid),
          onTap: () => openBills(ref, status: BillStatusFilter.unpaid),
        ),
        FeatureTile(
          icon: Icons.account_balance_wallet_outlined,
          label: 'Customer Dues',
          badge: badge(dues),
          onTap: () =>
              ref.read(currentTabProvider.notifier).state = AppTab.dues,
        ),
        FeatureTile(
          icon: Icons.store_mall_directory_outlined,
          label: 'Business Position',
          onTap: () =>
              ref.read(currentTabProvider.notifier).state = AppTab.business,
        ),
      ],
    );
  }
}

/// The most-used web-ERP actions, plus "All features" for everything else.
class _CreateInErp extends ConsumerWidget {
  const _CreateInErp();

  static const _pinned = [
    '/pos',
    '/b2b-invoice',
    '/quotations',
    '/digital-khata',
    '/payment-links',
    '/expenses',
    '/rates',
    '/supplier-ledger',
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final type = ref.watch(businessTypeProvider);
    final all = {
      for (final g in erpFeatureGroups)
        for (final f in g.features) f.path: f,
    };
    final shown = [
      for (final p in _pinned)
        if (all[p] != null && erpFeatureVisible(all[p]!, type)) all[p]!,
    ].take(7);

    return _TileCard(
      title: 'Create & manage',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('in web ERP', style: AppText.small),
          const SizedBox(width: 3),
          Icon(Icons.north_east_rounded, size: 12, color: AppColors.inkMute),
        ],
      ),
      tiles: [
        for (final f in shown)
          FeatureTile(
            icon: f.icon,
            label: f.label,
            onTap: () => openErp(context, f.path),
          ),
        FeatureTile(
          icon: Icons.apps_rounded,
          label: 'All Features',
          onTap: () => showAllFeatures(context),
        ),
      ],
    );
  }
}

// ─────────────────────────────── Collect money ──────────────────────────────

class _CollectMoney extends ConsumerWidget {
  const _CollectMoney();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final position = ref.watch(positionProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Collect money',
          actionLabel: 'See all',
          onAction: () =>
              ref.read(currentTabProvider.notifier).state = AppTab.dues,
        ),
        position.when(
          loading: () => const SkeletonBox(height: 150),
          error: (_, __) => const EmptyNote(
            'Couldn\'t load customer dues. Pull down to refresh.',
            icon: Icons.wifi_off_rounded,
          ),
          data: (p) {
            if (p == null || p.customerDues.isEmpty) {
              return const EmptyNote('No pending dues — all settled.',
                  icon: Icons.verified_outlined);
            }
            final top = p.customerDues.take(3).toList();
            return AppCard(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: fmtInr(p.retailerOutstanding),
                                style: AppText.amount.copyWith(
                                  fontSize: 17,
                                  color: AppColors.critical,
                                ),
                              ),
                              TextSpan(
                                text:
                                    '  to collect from ${p.customerDues.length} '
                                    '${p.customerDues.length == 1 ? 'customer' : 'customers'}',
                                style: AppText.label,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  for (var i = 0; i < top.length; i++) ...[
                    if (i > 0) const Divider(),
                    DueRow(due: top[i]),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

// ──────────────────────────────── Sales trend ───────────────────────────────

enum _TrendView { bars, split }

class _SalesTrend extends ConsumerStatefulWidget {
  const _SalesTrend();

  @override
  ConsumerState<_SalesTrend> createState() => _SalesTrendState();
}

class _SalesTrendState extends ConsumerState<_SalesTrend> {
  _TrendView _view = _TrendView.bars;

  @override
  Widget build(BuildContext context) {
    final m = ref.watch(metricsProvider);
    final loading = ref.watch(billsProvider).isLoading;
    final visible = ref.watch(visibleChannelsProvider);
    // A one-slice pie says nothing the total doesn't.
    final canSplit = visible.length > 1;
    final view = canSplit ? _view : _TrendView.bars;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          view == _TrendView.bars ? 'Daily sales' : 'Sales split',
          trailing: canSplit
              ? SegmentedButton<_TrendView>(
                  showSelectedIcon: false,
                  style: SegmentedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    selectedBackgroundColor: AppColors.primarySoft,
                    selectedForegroundColor: AppColors.primary,
                    side: BorderSide(color: AppColors.border),
                  ),
                  segments: const [
                    ButtonSegment(
                      value: _TrendView.bars,
                      icon: Icon(Icons.bar_chart_rounded, size: 18),
                      tooltip: 'Daily',
                    ),
                    ButtonSegment(
                      value: _TrendView.split,
                      icon: Icon(Icons.donut_large_rounded, size: 17),
                      tooltip: 'Split',
                    ),
                  ],
                  selected: {view},
                  onSelectionChanged: (s) => setState(() => _view = s.first),
                )
              : null,
        ),
        loading
            ? const SkeletonBox(height: 220)
            : AppCard(
                padding: view == _TrendView.bars
                    ? const EdgeInsets.fromLTRB(6, 18, 14, 14)
                    : const EdgeInsets.fromLTRB(14, 18, 14, 16),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: view == _TrendView.bars
                      ? Column(
                          key: const ValueKey('bars'),
                          children: [
                            RevenueChart(points: m.trend),
                            const SizedBox(height: 12),
                            Padding(
                              padding: const EdgeInsets.only(left: 10),
                              child: ChartLegend(items: [
                                for (final c in Channel.values)
                                  if (visible.contains(c))
                                    (c.label, channelColor(c)),
                              ]),
                            ),
                          ],
                        )
                      : ChannelPieChart(
                          key: const ValueKey('split'),
                          byChannel: m.byChannel,
                        ),
                ),
              ),
      ],
    );
  }
}

class _ByChannel extends ConsumerWidget {
  const _ByChannel();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visible = ref.watch(visibleChannelsProvider);
    if (visible.length < 2) return const SizedBox.shrink();
    final m = ref.watch(metricsProvider);
    final channels = [
      for (final c in Channel.values)
        if (visible.contains(c)) c
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('Sales by channel'),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            children: [
              for (var i = 0; i < channels.length; i++) ...[
                if (i > 0) const Divider(indent: 66),
                _ChannelRow(
                  channel: channels[i],
                  amount: m.byChannel[channels[i]] ?? 0,
                  count: m.countByChannel[channels[i]] ?? 0,
                  share: m.total == 0
                      ? 0
                      : (m.byChannel[channels[i]] ?? 0) / m.total,
                  onTap: () => openBills(ref, channel: channels[i]),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({
    required this.channel,
    required this.amount,
    required this.count,
    required this.share,
    required this.onTap,
  });

  final Channel channel;
  final double amount;
  final int count;
  final double share;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = channelColor(channel);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
        child: Row(
          children: [
            IconBadge(icon: channelIcon(channel), color: color, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          channel == Channel.b2c ? 'Shop (POS)' : channel.label,
                          style: AppText.body
                              .copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text(fmtInr(amount), style: AppText.amount),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(3),
                          child: LinearProgressIndicator(
                            value: share,
                            minHeight: 5,
                            backgroundColor: AppColors.cardHi,
                            valueColor: AlwaysStoppedAnimation(color),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '$count ${count == 1 ? 'bill' : 'bills'} · ${(share * 100).round()}%',
                        style: AppText.small,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded,
                size: 20, color: AppColors.inkMute),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────── Lists ───────────────────────────────

class _RecentBills extends ConsumerWidget {
  const _RecentBills();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loading = ref.watch(billsProvider).isLoading;
    final bills = ref.watch(filteredBillsProvider).take(5).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          'Recent bills',
          actionLabel: 'See all',
          onAction: () => openBills(ref),
        ),
        if (loading)
          for (var i = 0; i < 3; i++) ...[
            const SkeletonBox(height: 68),
            const SizedBox(height: 8),
          ]
        else if (bills.isEmpty)
          const EmptyNote('No bills in this period.',
              icon: Icons.receipt_long_outlined)
        else
          for (final b in bills) ...[
            BillTile(bill: b),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}

class _TopCustomers extends ConsumerWidget {
  const _TopCustomers();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(metricsProvider).topCustomers;
    if (ref.watch(billsProvider).isLoading || items.isEmpty) {
      return const SizedBox.shrink();
    }
    final max = items.first.amount;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader('Top customers'),
        AppCard(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                if (i > 0) const Divider(),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 22,
                        child: Text('${i + 1}',
                            style: AppText.label
                                .copyWith(fontWeight: FontWeight.w700)),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    items[i].name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppText.body,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(fmtInrCompact(items[i].amount),
                                    style: AppText.amount),
                              ],
                            ),
                            const SizedBox(height: 6),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(3),
                              child: LinearProgressIndicator(
                                value: max == 0 ? 0 : items[i].amount / max,
                                minHeight: 4,
                                backgroundColor: AppColors.cardHi,
                                valueColor:
                                    AlwaysStoppedAnimation(AppColors.primary),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
