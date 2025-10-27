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

  /// Optional: triggered when "See all" is tapped.
  final VoidCallback? onSeeAll;

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
    this.onSeeAll,
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
  int _selected = 0; // 0=All, 1=Today, 2=Tomorrow, 3=Week

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = List.generate(widget.daysWindow, (i) => today.add(Duration(days: i)));

    final sorted = widget.items
        .where((e) => e.nextDueAt != null)
        .toList()
      ..sort((a, b) => (a.nextDueAt ?? DateTime(2100))
          .compareTo(b.nextDueAt ?? DateTime(2100)));

    final windowEnd = days.isEmpty ? today : days.last;
    final inWindow = sorted.where((e) {
      final dd = DateTime(e.nextDueAt!.year, e.nextDueAt!.month, e.nextDueAt!.day);
      return !dd.isBefore(today) && !dd.isAfter(windowEnd);
    }).toList();

    final overdueCount = sorted.where((e) => _isOverdue(e.nextDueAt!)).length;
    final totalUpcoming = inWindow.length;

    final filtered = _filterBySelection(inWindow, today, _selected);

    // === Compact micro-hub ===
    return TonalCard(
      margin: const EdgeInsets.symmetric(horizontal: 2), // breathing room from side panels
      padding: const EdgeInsets.fromLTRB(AppSpacing.l, AppSpacing.l, AppSpacing.l, AppSpacing.l),
      borderRadius: const BorderRadius.all(Radius.circular(22)),
      surface: Colors.white.withOpacity(.96),
      onTap: widget.onSeeAll ?? () => _openFullPage(context, inWindow, sorted),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Counters + action
          Row(
            children: [
              _CounterPill(
                icon: Icons.schedule_rounded,
                label: '$totalUpcoming upcoming',
                highlight: totalUpcoming > 0,
              ),
              const SizedBox(width: 8),
              _CounterPill(
                icon: Icons.warning_amber_rounded,
                label: '$overdueCount overdue',
                highlight: overdueCount > 0,
                iconColor:
                    overdueCount > 0 ? AppColors.bad : Colors.black.withOpacity(.45),
              ),
              const Spacer(),
              TextButton(
                onPressed: widget.onSeeAll ??
                    () => _openFullPage(context, inWindow, sorted),
                style: TextButton.styleFrom(foregroundColor: AppColors.mint),
                child: const Text('See all'),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Filter chips
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _FilterChip(
                label: 'All ($totalUpcoming)',
                selected: _selected == 0,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selected = 0);
                },
              ),
              _FilterChip(
                label: 'Today',
                selected: _selected == 1,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selected = 1);
                },
              ),
              _FilterChip(
                label: 'Tomorrow',
                selected: _selected == 2,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selected = 2);
                },
              ),
              _FilterChip(
                label: 'Week',
                selected: _selected == 3,
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selected = 3);
                },
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Content
          if (inWindow.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Text('No upcoming items', style: TextStyle(color: Colors.black54)),
            )
          else if (_selected == 0)
            _GroupedByDay(
              days: days,
              items: inWindow,
              rowBuilder: (it) => _row(context, it),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _row(context, filtered[i]),
            ),
        ],
      ),
    );
  }

  List<SharedItem> _filterBySelection(
      List<SharedItem> items, DateTime today, int selection) {
    final tomorrow = today.add(const Duration(days: 1));
    final weekEnd = today.add(const Duration(days: 6));
    switch (selection) {
      case 1:
        return items
            .where((e) => _sameDay(e.nextDueAt!, today))
            .toList(growable: false);
      case 2:
        return items
            .where((e) => _sameDay(e.nextDueAt!, tomorrow))
            .toList(growable: false);
      case 3:
        return items
            .where((e) {
              final dd = DateTime(
                  e.nextDueAt!.year, e.nextDueAt!.month, e.nextDueAt!.day);
              return !dd.isAfter(weekEnd);
            })
            .toList(growable: false);
      default:
        return items;
    }
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  // ================= FULL PAGE (bottom sheet) =================

  void _openFullPage(
    BuildContext context,
    List<SharedItem> inWindow,
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
        final today = DateTime(now.year, now.month, now.day);
        final controller = ScrollController();
        // compute filtered for current selection inside stateful builder
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            List<SharedItem> sheetFiltered() =>
                _filterBySelection(inWindow, today, _selected);

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

                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                _FilterChip(
                                  label: 'All (${inWindow.length})',
                                  selected: _selected == 0,
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    setState(() => _selected = 0);
                                    setSheetState(() {});
                                  },
                                ),
                                _FilterChip(
                                  label: 'Today',
                                  selected: _selected == 1,
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    setState(() => _selected = 1);
                                    setSheetState(() {});
                                  },
                                ),
                                _FilterChip(
                                  label: 'Tomorrow',
                                  selected: _selected == 2,
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    setState(() => _selected = 2);
                                    setSheetState(() {});
                                  },
                                ),
                                _FilterChip(
                                  label: 'Week',
                                  selected: _selected == 3,
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    setState(() => _selected = 3);
                                    setSheetState(() {});
                                  },
                                ),
                              ],
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
                          const Padding(
                            padding: EdgeInsets.only(left: 8),
                            child: _StatusChip('Overdue', AppColors.bad),
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

  static Widget _tag(String text, Color c) {
    return _Pill(
      text,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      backgroundColor: c.withOpacity(.08),
      borderColor: c.withOpacity(.18),
      textStyle: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color: c,
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

class _StatusChip extends StatelessWidget {
  final String text;
  final Color base;

  const _StatusChip(this.text, this.base, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: base.withOpacity(.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withOpacity(.22)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: base,
          fontWeight: FontWeight.w800,
          fontSize: 11.5,
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final EdgeInsetsGeometry padding;
  final Color? backgroundColor;
  final Color? borderColor;
  final TextStyle? textStyle;

  const _Pill(
    this.text, {
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    this.backgroundColor,
    this.borderColor,
    this.textStyle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: backgroundColor ?? Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor ?? Colors.black.withOpacity(.10)),
      ),
      child: Text(text, style: textStyle ?? const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}

class _CounterPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool highlight;
  final Color? iconColor;

  const _CounterPill({
    required this.icon,
    required this.label,
    this.highlight = false,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final baseColor = iconColor ?? (highlight ? AppColors.mint : Colors.black.withOpacity(.70));
    final textColor = highlight ? baseColor : Colors.black.withOpacity(.70);
    final bg = highlight ? baseColor.withOpacity(.10) : Colors.white;
    final border = highlight ? baseColor.withOpacity(.28) : Colors.black.withOpacity(.08);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: baseColor),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final fg = selected ? AppColors.mint : Colors.black87;
    final bg = selected ? AppColors.mint.withOpacity(.12) : Colors.white;
    final border = selected ? AppColors.mint.withOpacity(.30) : Colors.black.withOpacity(.08);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: ShapeDecoration(
            color: bg,
            shape: StadiumBorder(side: BorderSide(color: border)),
          ),
          child: Text(
            label,
            style: TextStyle(fontWeight: FontWeight.w700, color: fg),
          ),
        ),
      ),
    );
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
