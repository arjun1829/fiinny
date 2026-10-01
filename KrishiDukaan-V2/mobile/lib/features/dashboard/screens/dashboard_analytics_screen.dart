import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/models/order_model.dart';
import '../../../core/providers/user_provider.dart';
import '../../../core/utils/currency_utils.dart';
import '../data/store_analytics.dart';
import '../providers/dashboard_provider.dart';

/// Seller Analytics: orders and revenue from the seller's own orders, plus the
/// reach and engagement figures the weekly/monthly/yearly digest notification
/// quotes (store views, product views, calls, followers, reel interactions).
///
/// The digest links here with `?period=week|month|year`, so whichever window
/// the notification summarised is the one that opens.
const _weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
String _weekdayLabel(DateTime d) => _weekdayLabels[d.weekday - 1];

const _monthAbbrShort = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
String _shortDate(DateTime d) => '${d.day} ${_monthAbbrShort[d.month - 1]}';

class DashboardAnalyticsScreen extends ConsumerStatefulWidget {
  /// 'week' | 'month' | 'year' from an analytics_digest notification.
  final String? initialPeriod;

  const DashboardAnalyticsScreen({super.key, this.initialPeriod});

  @override
  ConsumerState<DashboardAnalyticsScreen> createState() =>
      _DashboardAnalyticsScreenState();
}

class _DashboardAnalyticsScreenState
    extends ConsumerState<DashboardAnalyticsScreen> {
  late AnalyticsPeriod _period;
  // Non-null only while the Custom Date Range filter is the active
  // selection — it overrides _period everywhere until the user picks a
  // preset again. Kept separate from AnalyticsPeriod (rather than adding a
  // 4th enum value) since a custom range carries actual dates, not a fixed
  // day count.
  AnalyticsRange? _customRange;

  @override
  void initState() {
    super.initState();
    _period = AnalyticsPeriod.fromKey(widget.initialPeriod);
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 3),
      lastDate: now,
      initialDateRange: _customRange != null
          ? DateTimeRange(start: _customRange!.start, end: _customRange!.end)
          : DateTimeRange(
              start: now.subtract(const Duration(days: 6)), end: now),
    );
    if (picked == null) return;
    setState(() {
      _customRange = AnalyticsRange(start: picked.start, end: picked.end);
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider).value;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('Analytics',
            style: AppTextStyles.heading2.copyWith(color: Colors.white)),
      ),
      body: user == null
          ? const Center(child: Text('Not logged in.'))
          : Column(
              children: [
                _PeriodSelector(
                  selected: _period,
                  customRange: _customRange,
                  onChanged: (p) => setState(() {
                    _period = p;
                    _customRange = null;
                  }),
                  onPickCustom: _pickCustomRange,
                ),
                Expanded(
                  child: _Body(
                    sellerPhone: user.phone,
                    period: _period,
                    customRange: _customRange,
                  ),
                ),
              ],
            ),
    );
  }
}

/// Week / Month / Year / Custom segmented control. Custom shows the picked
/// range (e.g. "12 Sep – 18 Sep") once one is chosen, instead of a static
/// "Custom" label, so the active window is always visible at a glance.
class _PeriodSelector extends StatelessWidget {
  final AnalyticsPeriod selected;
  final AnalyticsRange? customRange;
  final ValueChanged<AnalyticsPeriod> onChanged;
  final VoidCallback onPickCustom;

  const _PeriodSelector({
    required this.selected,
    required this.customRange,
    required this.onChanged,
    required this.onPickCustom,
  });

  static const _monthAbbr = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  String _fmt(DateTime d) => '${d.day} ${_monthAbbr[d.month - 1]}';

  @override
  Widget build(BuildContext context) {
    final isCustom = customRange != null;
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          for (final p in AnalyticsPeriod.values) ...[
            Expanded(
              child: _Chip(
                label: p.label,
                selected: !isCustom && p == selected,
                onTap: () => onChanged(p),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            flex: 2,
            child: _Chip(
              icon: Icons.calendar_month_outlined,
              label: isCustom
                  ? '${_fmt(customRange!.start)} – ${_fmt(customRange!.end)}'
                  : 'Custom',
              selected: isCustom,
              onTap: onPickCustom,
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  const _Chip(
      {required this.label,
      required this.selected,
      required this.onTap,
      this.icon});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary
              : AppColors.primaryContainer.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon,
                  size: 14,
                  color: selected ? Colors.white : AppColors.onSurfaceVariant),
              const SizedBox(width: 4),
            ],
            Flexible(
              child: Text(
                label,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: AppTextStyles.bodyMedium.copyWith(
                  color: selected ? Colors.white : AppColors.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final String sellerPhone;
  final AnalyticsPeriod period;
  final AnalyticsRange? customRange;
  const _Body(
      {required this.sellerPhone, required this.period, this.customRange});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(sellerOrdersProvider(sellerPhone));
    final reachAsync = ref.watch(storeAnalyticsProvider(
        (phone: sellerPhone, period: period, customRange: customRange)));

    return ordersAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const Center(child: Text('Failed to load analytics.')),
      data: (orders) => _Content(
        orders: orders,
        period: period,
        customRange: customRange,
        reach: reachAsync,
      ),
    );
  }
}

class _Content extends StatelessWidget {
  final List<OrderModel> orders;
  final AnalyticsPeriod period;
  final AnalyticsRange? customRange;
  final AsyncValue<StoreAnalytics> reach;

  const _Content({
    required this.orders,
    required this.period,
    required this.reach,
    this.customRange,
  });

  @override
  Widget build(BuildContext context) {
    // Scope orders to the selected window so the revenue figure and the reach
    // figures below it describe the same stretch of time. A custom range has
    // an explicit end (not necessarily today), so it needs its own upper
    // bound rather than just a "since X" cutoff.
    final range = customRange;
    final cutoff = range?.start ??
        DateTime.now().subtract(Duration(days: period.days));
    final upperBoundExclusive = range?.end.add(const Duration(days: 1));
    final inPeriod = orders.where((o) {
      if (o.createdAt == null) return true;
      if (o.createdAt!.isBefore(cutoff)) return false;
      if (upperBoundExclusive != null &&
          !o.createdAt!.isBefore(upperBoundExclusive)) {
        return false;
      }
      return true;
    }).toList();
    // 'rejected' is the canonical declined status; the old mobile-only
    // 'cancelled' alias is still excluded so historical docs stay correct.
    final valid = inPeriod
        .where((o) => o.status != 'rejected' && o.status != 'cancelled')
        .toList();
    final totalRevenue = valid.fold<double>(0, (sum, o) => sum + o.total);
    final totalOrders = inPeriod.length;

    // The trend chart is a fixed "Last 7 Days" for the Week/Month/Year
    // presets (a 365-bar chart would be unreadable on a phone), but a Custom
    // Date Range is exactly the window the seller asked to see, so it drives
    // the chart directly — bucketed if long, one bar per day if short.
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final trendLabel = range != null ? 'Selected Range' : 'Last 7 Days';
    final days = range?.days ??
        List.generate(7, (i) => today.subtract(Duration(days: 6 - i)));
    final dayRevenue = {for (final d in days) d: 0.0};
    for (final o in valid) {
      final created = o.createdAt;
      if (created == null) continue;
      final day = DateTime(created.year, created.month, created.day);
      if (dayRevenue.containsKey(day)) {
        dayRevenue[day] = dayRevenue[day]! + o.total;
      }
    }
    // Cap the number of bars — a year-long custom range would otherwise
    // render hundreds of slivers. Buckets sum consecutive days and are
    // labelled by the bucket's first day.
    const maxBars = 14;
    final trendPoints = <_TrendPoint>[];
    if (days.length <= maxBars) {
      for (final d in days) {
        trendPoints.add(_TrendPoint(
          label: range != null ? _shortDate(d) : _weekdayLabel(d),
          value: dayRevenue[d] ?? 0,
        ));
      }
    } else {
      final bucketSize = (days.length / maxBars).ceil();
      for (var i = 0; i < days.length; i += bucketSize) {
        final chunk = days.skip(i).take(bucketSize);
        trendPoints.add(_TrendPoint(
          label: _shortDate(chunk.first),
          value: chunk.fold<double>(0, (s, d) => s + (dayRevenue[d] ?? 0)),
        ));
      }
    }
    final maxRevenue =
        trendPoints.fold<double>(0, (m, p) => p.value > m ? p.value : m);

    final productRevenue = <String, double>{};
    final productQty = <String, int>{};
    for (final o in valid) {
      for (final item in o.items) {
        final name = item.name.isNotEmpty ? item.name : 'Product';
        productRevenue[name] = (productRevenue[name] ?? 0) + item.lineTotal;
        productQty[name] = (productQty[name] ?? 0) + item.quantity;
      }
    }
    final topProducts = productRevenue.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Total Orders',
                value: '$totalOrders',
                icon: Icons.receipt_long_outlined,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Total Revenue',
                value: CurrencyUtils.format(totalRevenue),
                icon: Icons.currency_rupee,
                color: AppColors.success,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // ── Reach & engagement ────────────────────────────────────────────
        // The same counters the analytics_digest notification quotes.
        Text('Reach & Engagement', style: AppTextStyles.heading3),
        const SizedBox(height: 12),
        reach.when(
          loading: () => const _Card(
            children: [
              SizedBox(
                height: 80,
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
          ),
          error: (_, _) =>
              _EmptyCard(message: 'Could not load engagement stats'),
          data: (r) => _ReachGrid(reach: r),
        ),
        const SizedBox(height: 20),

        Text(trendLabel, style: AppTextStyles.heading3),
        const SizedBox(height: 12),
        _TrendCard(points: trendPoints, maxRevenue: maxRevenue),
        const SizedBox(height: 20),
        Text('Top Products', style: AppTextStyles.heading3),
        const SizedBox(height: 12),
        if (topProducts.isEmpty)
          _EmptyCard(message: 'No sales yet')
        else
          _Card(
            children: [
              for (var i = 0; i < topProducts.length && i < 10; i++) ...[
                if (i > 0) const Divider(height: 1),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(topProducts[i].key, style: AppTextStyles.bodyMedium),
                  subtitle: Text('${productQty[topProducts[i].key]} sold'),
                  trailing: Text(
                    CurrencyUtils.format(topProducts[i].value),
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ],
          ),
        const SizedBox(height: 40),
      ],
    );
  }
}

/// Two-column grid of reach counters. Zeroes are shown rather than hidden —
/// "0 store views this week" is itself the useful signal for a seller.
class _ReachGrid extends StatelessWidget {
  final StoreAnalytics reach;
  const _ReachGrid({required this.reach});

  @override
  Widget build(BuildContext context) {
    final tiles = <({String label, int value, IconData icon, Color color})>[
      (
        label: 'Store views',
        value: reach.storeViews,
        icon: Icons.storefront_outlined,
        color: AppColors.primary
      ),
      (
        label: 'Product views',
        value: reach.productViews,
        icon: Icons.visibility_outlined,
        color: AppColors.info
      ),
      (
        label: 'Product taps',
        value: reach.productClicks,
        icon: Icons.touch_app_outlined,
        color: AppColors.info
      ),
      (
        label: 'Calls',
        value: reach.calls,
        icon: Icons.call_outlined,
        color: AppColors.success
      ),
      (
        label: 'Directions',
        value: reach.directionRequests,
        icon: Icons.directions_outlined,
        color: AppColors.success
      ),
      (
        label: 'Followers',
        value: reach.followers,
        icon: Icons.people_alt_outlined,
        color: AppColors.primary
      ),
      (
        label: 'Reel views',
        value: reach.reelViews,
        icon: Icons.play_circle_outline,
        color: AppColors.info
      ),
      (
        label: 'Interactions',
        value: reach.interactions,
        icon: Icons.favorite_border,
        color: AppColors.error
      ),
    ];

    return Column(
      children: [
        for (var i = 0; i < tiles.length; i += 2) ...[
          if (i > 0) const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: tiles[i].label,
                  value: '${tiles[i].value}',
                  icon: tiles[i].icon,
                  color: tiles[i].color,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: i + 1 < tiles.length
                    ? _StatCard(
                        label: tiles[i + 1].label,
                        value: '${tiles[i + 1].value}',
                        icon: tiles[i + 1].icon,
                        color: tiles[i + 1].color,
                      )
                    : const SizedBox(),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _StatCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppTextStyles.heading2.copyWith(color: color)),
          ),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}

/// One bar's worth of pre-labelled, pre-bucketed trend data — computed by
/// _Content so this widget doesn't need to know whether it's showing raw
/// days or summed buckets.
class _TrendPoint {
  final String label;
  final double value;
  const _TrendPoint({required this.label, required this.value});
}

class _TrendCard extends StatelessWidget {
  final List<_TrendPoint> points;
  final double maxRevenue;
  const _TrendCard({required this.points, required this.maxRevenue});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            for (final point in points)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Column(
                  children: [
                    Text(
                      maxRevenue > 0
                          ? CurrencyUtils.format(point.value)
                          : '',
                      style: AppTextStyles.caption.copyWith(fontSize: 9),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      width: 20,
                      height: 4 +
                          (maxRevenue > 0
                              ? (point.value / maxRevenue) * 80
                              : 0),
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(point.label, style: AppTextStyles.caption),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: AppColors.cardShadow, blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final String message;
  const _EmptyCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Center(child: Text(message, style: AppTextStyles.bodyMedium)),
    );
  }
}
