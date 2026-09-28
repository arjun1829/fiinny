import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app/theme.dart';
import '../core/format.dart';
import '../core/time_range.dart';
import '../features/analytics/metrics.dart';

/// Sliding segmented control. Tapping "Custom" opens a date-range picker;
/// picking dates selects the range, cancelling reverts to the prior selection.
class RangeSelector extends ConsumerWidget {
  const RangeSelector({super.key});

  Future<void> _pickCustom(BuildContext context, WidgetRef ref) async {
    final prior = ref.read(timeRangeProvider);
    final existing = ref.read(customDateWindowProvider);
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      initialDateRange: existing != null
          ? DateTimeRange(start: existing.$1, end: existing.$2)
          : DateTimeRange(
              start: now.subtract(const Duration(days: 6)), end: now),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppColors.accent,
            onPrimary: AppColors.accentInk,
            surface: AppColors.card,
            onSurface: AppColors.ink,
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null) {
      // User backed out of the picker without choosing — keep the range that
      // was active before they tapped Custom rather than stranding it selected
      // with no dates behind it.
      if (ref.read(timeRangeProvider) == TimeRange.custom &&
          ref.read(customDateWindowProvider) == null) {
        ref.read(timeRangeProvider.notifier).state = prior;
      }
      return;
    }
    ref.read(customDateWindowProvider.notifier).state =
        (picked.start, picked.end);
    ref.read(timeRangeProvider.notifier).state = TimeRange.custom;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(timeRangeProvider);
    const ranges = TimeRange.values;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 38,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: LayoutBuilder(
            builder: (context, c) {
              final w = c.maxWidth / ranges.length;
              return Stack(
                children: [
                  AnimatedAlign(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    alignment: Alignment(
                      -1 + 2 * (selected.index / (ranges.length - 1)),
                      0,
                    ),
                    child: Container(
                      width: w,
                      height: double.infinity,
                      decoration: BoxDecoration(
                        color: AppColors.accent,
                        borderRadius: BorderRadius.circular(9),
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      for (final r in ranges)
                        Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => r == TimeRange.custom
                                ? _pickCustom(context, ref)
                                : ref.read(timeRangeProvider.notifier).state =
                                    r,
                            child: Center(
                              child: AnimatedDefaultTextStyle(
                                duration: const Duration(milliseconds: 180),
                                style: TextStyle(
                                  fontSize: r == TimeRange.custom ? 15 : 11.5,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.3,
                                  color: selected == r
                                      ? AppColors.accentInk
                                      : AppColors.inkDim,
                                ),
                                child: r == TimeRange.custom
                                    ? const Icon(Icons.calendar_month, size: 15)
                                    : Text(r.label),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
        if (selected == TimeRange.custom) ...[
          const SizedBox(height: 7),
          const _CustomRangeLabel(),
        ],
      ],
    );
  }
}

class _CustomRangeLabel extends ConsumerWidget {
  const _CustomRangeLabel();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final window = ref.watch(customDateWindowProvider);
    if (window == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Row(
        children: [
          Icon(Icons.event, size: 12, color: AppColors.accentDim),
          const SizedBox(width: 5),
          Text(
            '${fmtFullDate(window.$1)} — ${fmtFullDate(window.$2)}',
            style: TextStyle(fontSize: 11.5, color: AppColors.inkDim),
          ),
        ],
      ),
    );
  }
}
