enum TimeRange { today, week, month, quarter, all, custom }

extension TimeRangeX on TimeRange {
  String get label => switch (this) {
        TimeRange.today => 'Today',
        TimeRange.week => 'Week',
        TimeRange.month => 'Month',
        TimeRange.quarter => 'Quarter',
        TimeRange.all => 'All',
        TimeRange.custom => 'Custom',
      };

  /// Inclusive local-midnight start of the window, matching AnalyticsPage.tsx.
  /// Not meaningful for [TimeRange.custom] — that window comes from the picked
  /// dates instead (see DateWindow.forRange).
  DateTime from(DateTime now) => switch (this) {
        TimeRange.today => DateTime(now.year, now.month, now.day),
        TimeRange.week => _weekStart(now),
        TimeRange.month => DateTime(now.year, now.month, 1),
        TimeRange.quarter =>
          DateTime(now.year, (now.month - 1) ~/ 3 * 3 + 1, 1),
        TimeRange.all => DateTime.fromMillisecondsSinceEpoch(0),
        TimeRange.custom => now,
      };
}

DateTime _weekStart(DateTime now) {
  final monday = now.subtract(Duration(days: now.weekday - 1));
  return DateTime(monday.year, monday.month, monday.day);
}

/// The resolved [from, to] bounds a bill's date is checked against, inclusive
/// on both ends.
class DateWindow {
  const DateWindow(this.from, this.to);

  final DateTime from;
  final DateTime to;

  bool contains(DateTime d) => !d.isBefore(from) && !d.isAfter(to);

  static DateWindow forRange(TimeRange range,
      {DateTime? customFrom, DateTime? customTo}) {
    final now = DateTime.now();
    if (range == TimeRange.custom && customFrom != null && customTo != null) {
      return DateWindow(
        DateTime(customFrom.year, customFrom.month, customFrom.day),
        DateTime(customTo.year, customTo.month, customTo.day, 23, 59, 59, 999),
      );
    }
    return DateWindow(range.from(now), now);
  }
}
