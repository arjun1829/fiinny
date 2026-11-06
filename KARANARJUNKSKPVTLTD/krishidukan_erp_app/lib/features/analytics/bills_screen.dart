import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/navigation.dart';
import '../../app/theme.dart';
import '../../core/erp_links.dart';
import '../../core/format.dart';
import '../../widgets/bill_tile.dart';
import '../../widgets/range_selector.dart';
import '../../widgets/ui.dart';
import 'analytics_repository.dart';
import 'business_type.dart';
import 'metrics.dart';
import 'models.dart';

final _searchProvider = StateProvider.autoDispose((_) => '');

class BillsScreen extends ConsumerWidget {
  const BillsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final search = ref.watch(_searchProvider).trim().toLowerCase();
    final status = ref.watch(billStatusFilterProvider);
    final channel = ref.watch(billChannelFilterProvider);
    final inRange = ref.watch(filteredBillsProvider);
    final billsAsync = ref.watch(billsProvider);

    // Search + channel narrow the list first; status counts are taken after,
    // so the numbers on the status pills always match what tapping shows.
    final base = inRange.where((b) {
      if (channel != null && b.channel != channel) return false;
      if (search.isEmpty) return true;
      return b.customerName.toLowerCase().contains(search) ||
          b.number.toLowerCase().contains(search);
    }).toList();
    final counts = {
      for (final f in BillStatusFilter.values) f: base.where(f.matches).length,
    };
    final bills = base.where(status.matches).toList();
    final total = bills.fold<double>(0, (s, b) => s + b.amount);
    final due = bills.fold<double>(0, (s, b) => s + b.outstanding);

    return Column(
      children: [
        PageHeader(
          title: 'Bills',
          actions: [
            IconButton(
              tooltip: 'New bill in web ERP',
              // Manufacturers have no POS counter — their "new bill" is a
              // GST invoice.
              onPressed: () => openErp(
                context,
                ref.read(businessTypeProvider) ==
                        TenantBusinessType.manufacturer
                    ? '/b2b-invoice'
                    : '/pos',
              ),
              icon: Icon(Icons.add_rounded, color: AppColors.primary),
            ),
          ],
        ),
        Container(
          color: AppColors.surface,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search customer or bill number',
                  prefixIcon: const Icon(Icons.search_rounded, size: 21),
                  isDense: true,
                  fillColor: AppColors.tile,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
                onChanged: (v) => ref.read(_searchProvider.notifier).state = v,
              ),
              const SizedBox(height: 12),
              _StatusTabs(selected: status, counts: counts),
            ],
          ),
        ),
        Divider(height: 1, color: AppColors.border),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            backgroundColor: AppColors.surface,
            onRefresh: () async {
              ref.invalidate(billsProvider);
              await ref.read(billsProvider.future);
            },
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const RangeSelector(
                          padding: EdgeInsets.symmetric(horizontal: 16),
                        ),
                        _ChannelFilter(selected: channel),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: _TotalsStrip(
                            count: bills.length,
                            total: total,
                            due: due,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (billsAsync.isLoading)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (billsAsync.hasError && !billsAsync.hasValue)
                  SliverFillRemaining(
                    child: ErrorState(
                      error: billsAsync.error!,
                      onRetry: () => ref.invalidate(billsProvider),
                    ),
                  )
                else if (bills.isEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.all(16),
                    sliver: SliverToBoxAdapter(
                      child: EmptyNote(
                        search.isNotEmpty
                            ? 'No bills match "$search".'
                            : 'No ${status == BillStatusFilter.all ? '' : '${status.label.toLowerCase()} '}bills in this period.',
                        icon: Icons.receipt_long_outlined,
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    sliver: _GroupedBillList(bills: bills),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusTabs extends ConsumerWidget {
  const _StatusTabs({required this.selected, required this.counts});

  final BillStatusFilter selected;
  final Map<BillStatusFilter, int> counts;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.tile,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final f in BillStatusFilter.values)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () =>
                    ref.read(billStatusFilterProvider.notifier).state = f,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: f == selected ? AppColors.surface : null,
                    borderRadius: BorderRadius.circular(9),
                    boxShadow: f == selected && !AppColors.isDark
                        ? const [
                            BoxShadow(
                              color: Color(0x14000000),
                              blurRadius: 4,
                              offset: Offset(0, 1),
                            ),
                          ]
                        : null,
                  ),
                  child: Text(
                    '${f.label} (${counts[f] ?? 0})',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight:
                          f == selected ? FontWeight.w700 : FontWeight.w500,
                      color: f == selected
                          ? (f == BillStatusFilter.unpaid
                              ? AppColors.critical
                              : AppColors.ink)
                          : AppColors.inkMute,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ChannelFilter extends ConsumerWidget {
  const _ChannelFilter({required this.selected});

  final Channel? selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visible = ref.watch(visibleChannelsProvider);
    if (visible.length < 2) return const SizedBox.shrink();

    Widget chip(String label, Channel? value) {
      final on = value == selected;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: FilterChip(
          label: Text(label),
          selected: on,
          showCheckmark: false,
          onSelected: (_) =>
              ref.read(billChannelFilterProvider.notifier).state = value,
          labelStyle: TextStyle(
            fontSize: 12.5,
            fontWeight: on ? FontWeight.w700 : FontWeight.w500,
            color: on ? AppColors.primary : AppColors.inkDim,
          ),
          backgroundColor: AppColors.surface,
          selectedColor: AppColors.primarySoft,
          side: BorderSide(color: on ? AppColors.primary : AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          visualDensity: VisualDensity.compact,
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Row(
        children: [
          chip('All channels', null),
          for (final c in Channel.values)
            if (visible.contains(c))
              chip(c == Channel.b2c ? 'Shop (POS)' : c.label, c),
        ],
      ),
    );
  }
}

class _TotalsStrip extends StatelessWidget {
  const _TotalsStrip({
    required this.count,
    required this.total,
    required this.due,
  });

  final int count;
  final double total;
  final double due;

  @override
  Widget build(BuildContext context) {
    Widget cell(String label, String value, Color color) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AppText.small),
              const SizedBox(height: 2),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value,
                    style: AppText.amount.copyWith(fontSize: 15, color: color)),
              ),
            ],
          ),
        );

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          cell('Bills', '$count', AppColors.ink),
          cell('Total', fmtInr(total), AppColors.ink),
          cell('Due', fmtInr(due),
              due > 0 ? AppColors.critical : AppColors.good),
        ],
      ),
    );
  }
}

/// Bills under "Today", "Yesterday", "12 Oct 2026" headings.
class _GroupedBillList extends StatelessWidget {
  const _GroupedBillList({required this.bills});

  final List<Bill> bills;

  String _dayLabel(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    final diff = today.difference(day).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    return fmtFullDate(d);
  }

  @override
  Widget build(BuildContext context) {
    // Flatten into [header, bill, bill, header, bill…] once per build.
    final items = <Object>[];
    String? current;
    for (final b in bills) {
      final label = _dayLabel(b.date);
      if (label != current) {
        items.add(label);
        current = label;
      }
      items.add(b);
    }

    return SliverList.builder(
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        if (item is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
            child: Text(item,
                style: AppText.label.copyWith(fontWeight: FontWeight.w600)),
          );
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: BillTile(bill: item as Bill),
        );
      },
    );
  }
}
