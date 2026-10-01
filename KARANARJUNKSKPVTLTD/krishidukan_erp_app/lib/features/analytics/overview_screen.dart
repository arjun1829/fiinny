import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/format.dart';
import '../../core/time_range.dart';
import '../../widgets/channel_pie_chart.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/range_selector.dart';
import '../../widgets/revenue_chart.dart';
import '../auth/auth_repository.dart';
import 'analytics_repository.dart';
import 'business_type.dart';
import 'metrics.dart';
import 'models.dart';

class OverviewScreen extends ConsumerWidget {
  const OverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(appUserProvider).valueOrNull;
    final bills = ref.watch(billsProvider);
    final m = ref.watch(metricsProvider);
    final range = ref.watch(timeRangeProvider);
    final visibleChannels = ref.watch(visibleChannelsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: bills.isLoading
            ? const Center(child: CircularProgressIndicator())
            : bills.hasError
                ? _ErrorView(
                    error: bills.error!,
                    onRetry: () => ref.invalidate(billsProvider),
                  )
                : RefreshIndicator(
                    color: AppColors.accent,
                    backgroundColor: AppColors.cardHi,
                    onRefresh: () async {
                      ref.invalidate(billsProvider);
                      await ref.read(billsProvider.future);
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(14, 6, 14, 96),
                      children: [
                        _Header(business: user?.businessName ?? '…'),
                        const SizedBox(height: 16),
                        const RangeSelector(),
                        const SizedBox(height: 14),
                        _HeroTotal(
                          metrics: m,
                          range: range,
                          topChannel: m.topChannelAmong(visibleChannels),
                        ),
                        const SectionTitle('By channel'),
                        _ChannelGrid(metrics: m),
                        _RevenueSection(metrics: m),
                        const SectionTitle('Top customers'),
                        _TopList(items: m.topCustomers),
                      ],
                    ),
                  ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.business});

  final String business;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: AppColors.accent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.eco, size: 19, color: AppColors.accentInk),
        ),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(greetingFor(DateTime.now().hour).toUpperCase(),
                  style: kMicro),
              const SizedBox(height: 3),
              Text(
                business,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The headline number. A hero figure, not a chart — one value, read at a glance.
class _HeroTotal extends StatelessWidget {
  const _HeroTotal({
    required this.metrics,
    required this.range,
    required this.topChannel,
  });

  final SalesMetrics metrics;
  final TimeRange range;
  final Channel? topChannel;

  @override
  Widget build(BuildContext context) {
    final count = metrics.billCount;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
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
          Row(
            children: [
              Text('TOTAL BILLED', style: kMicro),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  range.label.toUpperCase(),
                  style: kMicro.copyWith(color: AppColors.accent),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              fmtInr(metrics.total),
              style: kFigure.copyWith(fontSize: 40, letterSpacing: -1.6),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _HeroStat(
                label: 'BILLS',
                value: '$count',
              ),
              Container(
                width: 1,
                height: 26,
                margin: const EdgeInsets.symmetric(horizontal: 16),
                color: AppColors.border,
              ),
              _HeroStat(
                label: 'AVG BILL',
                value: count == 0 ? '—' : fmtInrCompact(metrics.average),
              ),
              Container(
                width: 1,
                height: 26,
                margin: const EdgeInsets.symmetric(horizontal: 16),
                color: AppColors.border,
              ),
              _HeroStat(
                label: 'TOP',
                value: topChannel?.label ?? '—',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: kMicro),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
      ],
    );
  }
}

enum _RevenueView { trend, split }

/// Daily trend stays a bar chart (it's a time series); "Split" swaps in a pie
/// of the same period's channel totals — a proportion-of-whole view a bar
/// chart can't show at a glance.
class _RevenueSection extends ConsumerStatefulWidget {
  const _RevenueSection({required this.metrics});

  final SalesMetrics metrics;

  @override
  ConsumerState<_RevenueSection> createState() => _RevenueSectionState();
}

class _RevenueSectionState extends ConsumerState<_RevenueSection> {
  _RevenueView _view = _RevenueView.trend;

  static Map<Channel, (String, Color)> get _allLegend => {
        Channel.b2b: ('B2B', AppColors.b2b),
        Channel.b2c: ('POS', AppColors.pos),
        Channel.online: ('ONLINE', AppColors.online),
      };

  @override
  Widget build(BuildContext context) {
    final visible = ref.watch(visibleChannelsProvider);
    // A pie of one slice says nothing a hero figure doesn't already — the
    // split view only earns its place once there's more than one channel.
    final showSplitToggle = visible.length > 1;
    final view = showSplitToggle ? _view : _RevenueView.trend;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          view == _RevenueView.trend ? 'Daily billing' : 'Channel split',
          trailing: showSplitToggle
              ? _ViewToggle(
                  view: view,
                  onChanged: (v) => setState(() => _view = v),
                )
              : null,
        ),
        Panel(
          padding: view == _RevenueView.trend
              ? const EdgeInsets.fromLTRB(6, 16, 14, 14)
              : const EdgeInsets.fromLTRB(14, 18, 14, 14),
          child: view == _RevenueView.trend
              ? Column(
                  children: [
                    RevenueChart(points: widget.metrics.trend),
                    const SizedBox(height: 14),
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: ChartLegend(items: [
                        for (final c in Channel.values)
                          if (visible.contains(c)) _allLegend[c]!,
                      ]),
                    ),
                  ],
                )
              : ChannelPieChart(byChannel: widget.metrics.byChannel),
        ),
      ],
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle({required this.view, required this.onChanged});

  final _RevenueView view;
  final ValueChanged<_RevenueView> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ToggleButton(
            icon: Icons.bar_chart_rounded,
            active: view == _RevenueView.trend,
            onTap: () => onChanged(_RevenueView.trend),
          ),
          _ToggleButton(
            icon: Icons.pie_chart_rounded,
            active: view == _RevenueView.split,
            onTap: () => onChanged(_RevenueView.split),
          ),
        ],
      ),
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 26,
        height: 22,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(7),
        ),
        child: Icon(
          icon,
          size: 14,
          color: active ? AppColors.accentInk : AppColors.inkMute,
        ),
      ),
    );
  }
}

class _ChannelGrid extends ConsumerWidget {
  const _ChannelGrid({required this.metrics});

  final SalesMetrics metrics;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = {
      Channel.b2b: AppColors.b2b,
      Channel.b2c: AppColors.pos,
      Channel.online: AppColors.online,
    };
    // A manufacturer tenant never runs a POS counter or an online storefront
    // (MANUFACTURER_SCREENS excludes both) — those tiles would always read
    // ₹0, so they're dropped rather than shown empty.
    final visible = ref.watch(visibleChannelsProvider);

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.55,
      children: [
        for (final c in Channel.values)
          if (visible.contains(c))
            KpiCard(
              label: c.label,
              value: fmtInrCompact(metrics.byChannel[c] ?? 0),
              sub: '${metrics.countByChannel[c] ?? 0} bills',
              accent: colors[c],
            ),
        KpiCard(
          label: 'Collected',
          value: fmtInrCompact(metrics.collected),
          sub: '${metrics.paidCount} paid in full',
          accent: AppColors.good,
        ),
      ],
    );
  }
}

class _TopList extends StatelessWidget {
  const _TopList({required this.items});

  final List<NamedAmount> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const EmptyNote('No billing in this period');
    }
    final max = items.first.amount;
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Column(
        children: [
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: AppColors.ink),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        fmtInrCompact(item.amount),
                        style: kTabular.copyWith(fontSize: 13),
                      ),
                    ],
                  ),
                  const SizedBox(height: 7),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: LinearProgressIndicator(
                      value: max == 0 ? 0 : item.amount / max,
                      minHeight: 4,
                      backgroundColor: AppColors.cardHi,
                      valueColor: AlwaysStoppedAnimation(AppColors.accentDim),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final isPermission = error.toString().contains('permission-denied');
    return ListView(
      padding: const EdgeInsets.all(30),
      children: [
        const SizedBox(height: 70),
        Icon(isPermission ? Icons.lock_outline : Icons.cloud_off,
            size: 48, color: AppColors.inkMute),
        const SizedBox(height: 18),
        Text(
          isPermission
              ? 'This account cannot view analytics. Ask your admin for the analyst or admin role.'
              : 'Could not load your data. Check your connection and try again.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.inkDim, fontSize: 13),
        ),
        const SizedBox(height: 22),
        Center(
          child: FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ),
      ],
    );
  }
}
