// TransactionAmountCard.dart

import 'package:flutter/material.dart';

class TransactionAmountCard extends StatelessWidget {
  final String label; // e.g. "Transaction Amount"
  final double amount;
  final List<double> barData;
  final String period;
  final VoidCallback onViewAllTap;
  final VoidCallback onFilterTap;

  const TransactionAmountCard({
    Key? key,
    required this.label,
    required this.amount,
    required this.barData,
    required this.period,
    required this.onViewAllTap,
    required this.onFilterTap,
  }) : super(key: key);

  String _labelForIndex(int idx) {
    // For "All Time" we do not show x-axis labels at all.
    // This avoids confusion when barData length (months) happens to be 28–31.
    if (period == 'All Time') return '';

    if (barData.length == 24) {
      if (idx == 0) return '12AM';
      if (idx == 6) return '6AM';
      if (idx == 12) return '12PM';
      if (idx == 18) return '6PM';
    } else if (barData.length == 7) {
      const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      return days[idx];
    } else if (barData.length == 12) {
      const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      return months[idx];
    } else if (
        // Only treat 28–31 as "days of month" when the period
        // is actually a month, not for "All Time".
        (period == 'M' || period == 'This Month' || period == 'Last Month') &&
        barData.length >= 28 &&
        barData.length <= 31) {
      if (idx % 7 == 0) return '${idx + 1}'; // 1, 8, 15, 22, 29...
    }
    return '';
  }

  static String filterPeriodLabel(String filter) {
    switch (filter) {
      case "D":
      case "Today":
        return "Today";
      case "W":
      case "This Week":
        return "This Week";
      case "Yesterday":
        return "Yesterday";
      case "M":
      case "This Month":
        return "This Month";
      case "Last Month":
        return "Last Month";
      case "Y":
      case "This Year":
        return "This Year";
      default:
        return filter;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final textTheme = theme.textTheme;

    final double maxVal = barData.isEmpty ? 1.0 : barData.reduce((a, b) => a > b ? a : b);

    return GestureDetector(
      onTap: onViewAllTap,
      child: Card(
        margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        clipBehavior: Clip.antiAlias, // ensure nothing paints outside the card
        child: Padding(
          // a bit more bottom padding so labels stay visually inside
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: colorScheme.primary,
                ),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  Text(
                    filterPeriodLabel(period),
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                      color: colorScheme.primary,
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: onFilterTap,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: colorScheme.primary.withOpacity(0.13),
                      ),
                      child: Icon(Icons.filter_list_rounded, color: colorScheme.primary, size: 19),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                "₹${amount.toStringAsFixed(0)}",
                style: TextStyle(
                  fontSize: 27,
                  fontWeight: FontWeight.bold,
                  color: colorScheme.primary,
                ),
              ),
              const SizedBox(height: 6),
              // --- BAR CHART ---
              SizedBox(
                height: 48,
                width: double.infinity,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final totalBarWidth = barData.length * 13.0;
                    final showScroll = totalBarWidth > constraints.maxWidth;
                    return SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minWidth: constraints.maxWidth,
                          maxWidth: showScroll ? totalBarWidth : constraints.maxWidth,
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: List.generate(barData.length, (idx) {
                            final val = barData[idx];
                            final barHeight = maxVal == 0 ? 0.0 : (val / maxVal) * 42.0;
                            return Container(
                              width: 12,
                              margin: const EdgeInsets.symmetric(horizontal: 0.5),
                              height: barHeight,
                              decoration: BoxDecoration(
                                color: barHeight > 0 ? colorScheme.primary : colorScheme.primary.withOpacity(0.3),
                                borderRadius: BorderRadius.circular(4),
                              ),
                            );
                          }),
                        ),
                      ),
                    );
                  },
                ),
              ),
              // --- TIME LABELS ---
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final totalBarWidth = barData.length * 13.0;
                    final showScroll = totalBarWidth > constraints.maxWidth;
                    return SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minWidth: constraints.maxWidth,
                          maxWidth: showScroll ? totalBarWidth : constraints.maxWidth,
                        ),
                        child: Row(
                          children: List.generate(barData.length, (idx) {
                            final label = _labelForIndex(idx);
                            return Container(
                              width: 12,
                              alignment: Alignment.center,
                              child: label.isNotEmpty
                                  ? Text(
                                label,
                                style: TextStyle(
                                  color: textTheme.bodySmall?.color,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w500,
                                  height: 1.0, // <-- Make sure this is here!
                                ),
                                textAlign: TextAlign.center,
                                overflow: TextOverflow.visible,
                                softWrap: false,
                              )
                                  : const SizedBox.shrink(),
                            );
                          }),
                        ),
                      ),
                    );
                  },
                ),
              ),

            ],
          ),
        ),
      ),
    );
  }
}
