import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/theme.dart';
import '../core/format.dart';
import '../core/time_range.dart';
import '../features/analytics/metrics.dart';

/// Period picker as a row of pills: Today · Week · Month · Quarter · All ·
/// Pick dates. The selection is shared app-wide, so changing it on one tab
/// changes every tab — the owner never sees two screens disagreeing.
class RangeSelector extends ConsumerWidget {
  const RangeSelector({super.key, this.padding = EdgeInsets.zero});

  final EdgeInsetsGeometry padding;

  static Future<void> pickCustom(BuildContext context, WidgetRef ref) async {
    final existing = ref.read(customDateWindowProvider);
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      helpText: 'Choose dates',
      saveText: 'Apply',
      initialDateRange: existing != null
          ? DateTimeRange(start: existing.$1, end: existing.$2)
          : DateTimeRange(
              start: now.subtract(const Duration(days: 6)), end: now),
    );
    // Backing out keeps whatever range was active before.
    if (picked == null) return;
    ref.read(customDateWindowProvider.notifier).state =
        (picked.start, picked.end);
    ref.read(timeRangeProvider.notifier).state = TimeRange.custom;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(timeRangeProvider);
    final custom = ref.watch(customDateWindowProvider);

    String labelFor(TimeRange r) {
      if (r != TimeRange.custom) return r.label;
      if (selected == TimeRange.custom && custom != null) {
        return '${fmtDayMonth(custom.$1)} – ${fmtDayMonth(custom.$2)}';
      }
      return 'Pick dates';
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          for (final r in TimeRange.values) ...[
            _RangePill(
              label: labelFor(r),
              icon: r == TimeRange.custom ? Icons.calendar_today_rounded : null,
              selected: selected == r,
              onTap: () => r == TimeRange.custom
                  ? pickCustom(context, ref)
                  : ref.read(timeRangeProvider.notifier).state = r,
            ),
            if (r != TimeRange.values.last) const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _RangePill extends StatelessWidget {
  const _RangePill({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final fg = selected ? AppColors.onPrimary : AppColors.inkDim;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: selected ? AppColors.primary : AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected ? AppColors.primary : AppColors.border,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 13, color: fg),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: fg,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
