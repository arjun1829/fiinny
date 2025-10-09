// lib/screens/subs_bills/widgets/upcoming_timeline.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lifemap/details/models/shared_item.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'brand_avatar_registry.dart';
import 'package:lifemap/ui/atoms/brand_avatar.dart';

class UpcomingTimeline extends StatefulWidget {
  final List<SharedItem> items; // unfiltered full list
  final int daysWindow;

  /// Optional hooks—use these to integrate with your services if you want
  /// to override the built-in sheets.
  final void Function(SharedItem item)? onOpenItem;
  final void Function(SharedItem item)? onPay;
  final void Function(SharedItem item)? onManage;
  final void Function(SharedItem item)? onReminder;
  final void Function(SharedItem item)? onMarkPaid;

  const UpcomingTimeline({
    super.key,
    required this.items,
    this.daysWindow = 10,
    this.onOpenItem,
    this.onPay,
    this.onManage,
    this.onReminder,
    this.onMarkPaid,
  });

  @override
  State<UpcomingTimeline> createState() => _UpcomingTimelineState();
}

class _UpcomingTimelineState extends State<UpcomingTimeline> {
  int _selected = 0; // 0=All, then 1..N for each day

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final days = List.generate(widget.daysWindow, (i) {
      final d = now.add(Duration(days: i));
      return DateTime(d.year, d.month, d.day);
    });

    // sort once
    final sorted = widget.items
        .where((e) => e.nextDueAt != null)
        .toList()
      ..sort((a, b) => (a.nextDueAt ?? DateTime(2100))
          .compareTo(b.nextDueAt ?? DateTime(2100)));

    // counts per day (for chips)
    final countsByDay = <int, int>{};
    for (final e in sorted) {
      final d = DateTime(e.nextDueAt!.year, e.nextDueAt!.month, e.nextDueAt!.day);
      final idx = _indexForDay(d, days);
      if (idx != null) countsByDay[idx] = (countsByDay[idx] ?? 0) + 1;
    }

    // filter for selected day
    final filtered = _selected == 0
        ? sorted
        : sorted.where((e) {
      final dd = DateTime(e.nextDueAt!.year, e.nextDueAt!.month, e.nextDueAt!.day);
      return dd == days[_selected - 1];
    }).toList();

    final totalUpcoming = sorted.length;
    final overdueCount = sorted.where((e) => _isOverdue(e.nextDueAt!)).length;

    // === GIANT CARD (tap to open full page) ===
    return TonalCard(
      margin: const EdgeInsets.symmetric(horizontal: 2), // breathing room from side panels
      padding: const EdgeInsets.fromLTRB(AppSpacing.l, AppSpacing.l, AppSpacing.l, AppSpacing.l),
      borderRadius: const BorderRadius.all(Radius.circular(22)),
      surface: Colors.white.withOpacity(.96),
      onTap: () => _openFullPage(context, days, countsByDay, sorted),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.upcoming_rounded, color: AppColors.mint),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Upcoming (10 days)',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: AppColors.mint,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ),
              _pill(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.schedule_rounded, size: 14),
                    const SizedBox(width: 6),
                    Text(
                      '$totalUpcoming',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (overdueCount > 0)
                _pill(
                  borderColor: Colors.red.withOpacity(.28),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.warning_amber_rounded, size: 14, color: Colors.red),
                      const SizedBox(width: 6),
                      Text(
                        '$overdueCount overdue',
                        style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.red),
                      ),
                    ],
                  ),
                ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: () => _openFullPage(context, days, countsByDay, sorted),
                style: TextButton.styleFrom(foregroundColor: AppColors.mint),
                child: const Text('See all'),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Day chips (scrollable)
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: days.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                if (idx == 0) {
                  return _chip(
                    'All',
                    _selected == 0,
                    count: totalUpcoming == 0 ? null : totalUpcoming,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selected = 0);
                    },
                  );
                }
                final d = days[idx - 1];
                final label = _dayLabel(d, now);
                final c = countsByDay[idx] ?? 0;
                return _chip(
                  label,
                  _selected == idx,
                  count: c == 0 ? null : c,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _selected = idx);
                  },
                );
              },
            ),
          ),

          const SizedBox(height: 12),

          // Content
          if (sorted.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text('No upcoming items', style: TextStyle(color: Colors.black54)),
            )
          else if (_selected != 0)
          // Single-day list
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _row(context, filtered[i]),
            )
          else
          // All: grouped by day with mini headers
            _GroupedByDay(
              days: days,
              items: sorted,
              rowBuilder: (it) => _row(context, it),
            ),
        ],
      ),
    );
  }

  // ================= FULL PAGE (bottom sheet) =================

  void _openFullPage(
      BuildContext context,
      List<DateTime> days,
      Map<int, int> countsByDay,
      List<SharedItem> sorted,
      ) {
    HapticFeedback.selectionClick();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      barrierColor: Colors.black.withOpacity(.25),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (_) {
        final now = DateTime.now();
        final controller = ScrollController();
        // compute filtered for current selection inside stateful builder
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            List<SharedItem> sheetFiltered() {
              if (_selected == 0) return sorted;
              return sorted.where((e) {
                final d = DateTime(e.nextDueAt!.year, e.nextDueAt!.month, e.nextDueAt!.day);
                return d == days[_selected - 1];
              }).toList();
            }

            return DraggableScrollableSheet(
              expand: false,
              maxChildSize: 0.98,
              initialChildSize: 0.92,
              minChildSize: 0.70,
              builder: (context, scrollController) {
                return CustomScrollView(
                  controller: scrollController,
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // handle + title
                            Center(
                              child: Container(
                                width: 44,
                                height: 5,
                                decoration: BoxDecoration(
                                  color: Colors.black12,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                const Icon(Icons.upcoming_rounded, color: AppColors.mint),
                                const SizedBox(width: 8),
                                const Expanded(
                                  child: Text(
                                    'Upcoming',
                                    style: TextStyle(
                                      color: AppColors.mint,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 18,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Close',
                                  onPressed: () => Navigator.pop(context),
                                  icon: const Icon(Icons.close_rounded),
                                )
                              ],
                            ),
                            const SizedBox(height: 12),

                            // chips (same behavior inside sheet)
                            SizedBox(
                              height: 40,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: days.length + 1,
                                separatorBuilder: (_, __) => const SizedBox(width: 8),
                                itemBuilder: (context, idx) {
                                  if (idx == 0) {
                                    final total = sorted.length;
                                    return _chip(
                                      'All',
                                      _selected == 0,
                                      count: total == 0 ? null : total,
                                      onTap: () {
                                        HapticFeedback.selectionClick();
                                        setState(() => _selected = 0);
                                        setSheetState(() {});
                                      },
                                    );
                                  }
                                  final d = days[idx - 1];
                                  final label = _dayLabel(d, now);
                                  final c = countsByDay[idx] ?? 0;
                                  return _chip(
                                    label,
                                    _selected == idx,
                                    count: c == 0 ? null : c,
                                    onTap: () {
                                      HapticFeedback.selectionClick();
                                      setState(() => _selected = idx);
                                      setSheetState(() {});
                                    },
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // list
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      sliver: SliverList.separated(
                        itemCount: sheetFiltered().length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _row(context, sheetFiltered()[i]),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  // =================== ROW + Actions ===================

  Widget _row(BuildContext context, SharedItem e) {
    final title = e.title ?? (e.type ?? 'Item');
    final due = e.nextDueAt!;
    final amt = (e.rule.amount ?? 0).toDouble();
    final asset = BrandAvatarRegistry.assetFor(title);

    final dark = Colors.black.withOpacity(.92);
    final isOverdue = _isOverdue(due);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          HapticFeedback.selectionClick();
          if (widget.onOpenItem != null) return widget.onOpenItem!(e);
          _openItemSheet(context, e);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black.withOpacity(.12)),
          ),
          child: Row(
            children: [
              BrandAvatar(assetPath: asset, label: title, size: 34, radius: 9),
              const SizedBox(width: 10),

              // Title + meta (overflow-safe)
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // title & 'Overdue'
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: FontWeight.w800, color: dark),
                          ),
                        ),
                        if (isOverdue)
                          Container(
                            margin: const EdgeInsets.only(left: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.red.withOpacity(.08),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: Colors.red.withOpacity(.25)),
                            ),
                            child: const Text(
                              'Overdue',
                              style: TextStyle(color: Colors.red, fontWeight: FontWeight.w800, fontSize: 11.5),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    // date • amount
                    Text(
                      '${_fmtDate(due)} • ₹ ${_fmtAmount(amt)}',
                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                  ],
                ),
              ),

              // trailing icon (fixed box to avoid row overflow)
              SizedBox(
                width: 22,
                child: Icon(_iconFor(e.type), color: Colors.black38, size: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openItemSheet(BuildContext context, SharedItem e) {
    final due = e.nextDueAt!;
    final amt = (e.rule.amount ?? 0).toDouble();

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      barrierColor: Colors.black.withOpacity(.25),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.black12,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.event_note_rounded, color: AppColors.mint),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      e.title ?? 'Item',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.mint,
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  )
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _tag('Due ${_fmtDate(due)}', AppColors.mint),
                  _tag('₹ ${_fmtAmount(amt)}', AppColors.mint),
                  if (e.rule.frequency != null && e.rule.frequency!.isNotEmpty)
                    _tag(e.rule.frequency!, AppColors.mint),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton.icon(
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      if (widget.onManage != null) widget.onManage!(e);
                      Navigator.pop(context);
                    },
                    icon: const Icon(Icons.tune_rounded, size: 18),
                    label: const Text('Manage'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.mint,
                      foregroundColor: Colors.white,
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      if (widget.onPay != null) widget.onPay!(e);
                      Navigator.pop(context);
                    },
                    icon: const Icon(Icons.payments_rounded, size: 18),
                    label: const Text('Pay'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () {
                      HapticFeedback.selectionClick();
                      if (widget.onReminder != null) widget.onReminder!(e);
                      Navigator.pop(context);
                    },
                    icon: const Icon(Icons.alarm_add_rounded, size: 18),
                    label: const Text('Set reminder'),
                  ),
                  if (_isOverdue(due))
                    OutlinedButton.icon(
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        if (widget.onMarkPaid != null) widget.onMarkPaid!(e);
                        Navigator.pop(context);
                      },
                      icon: const Icon(Icons.check_circle_outline_rounded, size: 18),
                      label: const Text('Mark paid'),
                    ),
                ],
              ),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  // ---- small atoms ----

  static Widget _pill({required Widget child, Color? borderColor}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor ?? Colors.black.withOpacity(.14)),
      ),
      child: child,
    );
  }

  Widget _chip(String text, bool selected,
      {required VoidCallback onTap, int? count}) {
    final bg = selected ? AppColors.mint.withOpacity(.16) : Colors.white.withOpacity(.90);
    final fg = selected ? AppColors.mint.withOpacity(.95) : Colors.black87;
    final side = selected ? AppColors.mint.withOpacity(.35) : Colors.black12;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          Feedback.forTap(context);
          onTap();
        },
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: ShapeDecoration(
            color: bg,
            shape: StadiumBorder(side: BorderSide(color: side)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(text, style: TextStyle(fontWeight: FontWeight.w700, color: fg)),
              if (count != null) ...[
                const SizedBox(width: 6),
                _badge(count, fg),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static Widget _tag(String text, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(.18)),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: c)),
    );
  }

  Widget _badge(int n, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: fg.withOpacity(.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withOpacity(.25)),
      ),
      child: Text(
        n.toString(),
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: fg),
      ),
    );
  }

  // ---- helpers ----

  bool _isOverdue(DateTime due) {
    final now = DateTime.now();
    final d = DateTime(due.year, due.month, due.day);
    final today = DateTime(now.year, now.month, now.day);
    return d.isBefore(today);
  }

  int? _indexForDay(DateTime d, List<DateTime> days) {
    for (var i = 0; i < days.length; i++) {
      if (days[i] == d) return i + 1; // +1 because 0 is "All"
    }
    return null;
  }

  IconData _iconFor(String? type) {
    switch (type) {
      case 'subscription':
        return Icons.subscriptions_rounded;
      case 'emi':
        return Icons.account_balance_rounded;
      case 'reminder':
        return Icons.alarm_rounded;
      default:
        return Icons.repeat_rounded;
    }
  }

  String _dayLabel(DateTime d, DateTime today) {
    final isToday = d.year == today.year && d.month == today.month && d.day == today.day;
    final tomorrow = DateTime(today.year, today.month, today.day + 1);
    final isTomorrow = d == DateTime(tomorrow.year, tomorrow.month, tomorrow.day);
    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    const w = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return w[d.weekday - 1];
  }

  String _fmtAmount(double v) {
    final i = v.round();
    if (i >= 10000000) return '${(i / 10000000).toStringAsFixed(1)}Cr';
    if (i >= 100000) return '${(i / 100000).toStringAsFixed(1)}L';
    if (i >= 1000) return '${(i / 1000).toStringAsFixed(1)}k';
    return i.toString();
  }

  String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }
}

/// Groups items by day and renders headers: used only when "All" tab is active.
class _GroupedByDay extends StatelessWidget {
  final List<DateTime> days;
  final List<SharedItem> items;
  final Widget Function(SharedItem) rowBuilder;

  const _GroupedByDay({
    required this.days,
    required this.items,
    required this.rowBuilder,
  });

  @override
  Widget build(BuildContext context) {
    // Build map day -> items
    final map = <DateTime, List<SharedItem>>{};
    for (final d in days) {
      map[d] = <SharedItem>[];
    }
    for (final e in items) {
      final due = e.nextDueAt!;
      final key = DateTime(due.year, due.month, due.day);
      if (map.containsKey(key)) {
        map[key]!.add(e);
      }
    }

    final children = <Widget>[];
    for (final d in days) {
      final dayItems = map[d]!;
      if (dayItems.isEmpty) continue;
      children.add(_dayHeader(d));
      children.add(const SizedBox(height: 8));
      children.add(
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: dayItems.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) => rowBuilder(dayItems[i]),
        ),
      );
      children.add(const SizedBox(height: 12));
    }

    return Column(children: children);
  }

  Widget _dayHeader(DateTime d) {
    final now = DateTime.now();
    final label = _dayLabel(d, now);
    return Row(
      children: [
        const Icon(Icons.event_rounded, size: 16, color: AppColors.mint),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.mint, fontWeight: FontWeight.w900),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          _fmtDate(d),
          style: const TextStyle(color: Colors.black54, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  String _dayLabel(DateTime d, DateTime today) {
    final isToday = d.year == today.year && d.month == today.month && d.day == today.day;
    final tomorrow = DateTime(today.year, today.month, today.day + 1);
    final isTomorrow = d == DateTime(tomorrow.year, tomorrow.month, tomorrow.day);
    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    const w = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return w[d.weekday - 1];
  }

  String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }
}
