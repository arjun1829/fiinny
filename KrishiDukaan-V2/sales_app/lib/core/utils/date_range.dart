import '../utils/ist_date.dart';

/// Preset windows used by Expenses and Reports. Both screens offer the same
/// choices so a rep comparing "what did I spend" against "what did I do" is
/// always looking at the same span of days.
enum RangePreset {
  thisWeek('This Week'),
  thisMonth('This Month'),
  last30('Last 30 Days');

  const RangePreset(this.label);
  final String label;

  /// Inclusive `[from, to]` IST date keys.
  (String, String) resolve() {
    final today = IstDate.today();
    switch (this) {
      case RangePreset.thisWeek:
        // Week starts Monday — the field team's reporting week.
        final weekday = IstDate.parse(today).weekday; // Mon = 1
        return (IstDate.shift(today, -(weekday - 1)), today);
      case RangePreset.thisMonth:
        return (IstDate.monthStart(today), today);
      case RangePreset.last30:
        return (IstDate.shift(today, -29), today);
    }
  }

  String get subtitle {
    final (from, to) = resolve();
    return '${IstDate.shortLabel(from)} – ${IstDate.shortLabel(to)}';
  }
}
