import 'package:intl/intl.dart';

/// Every date key in the sales data (`daySessions.date`, `salesAttendance.date`,
/// `salesExpenses.date`) is an IST calendar day, because the field team works in
/// India and a UTC day would roll over at 05:30 local time — splitting a single
/// working day across two keys. The web app anchors to IST for the same reason
/// (app/sales/day-session-service.ts getTodayIST), so this must match it exactly.
class IstDate {
  IstDate._();

  static const _offset = Duration(hours: 5, minutes: 30);

  /// Current instant expressed as an IST wall-clock DateTime.
  static DateTime nowIst() => DateTime.now().toUtc().add(_offset);

  /// `YYYY-MM-DD` for the IST calendar day containing [instant] (defaults to now).
  static String key([DateTime? instant]) {
    final ist = instant == null ? nowIst() : instant.toUtc().add(_offset);
    return '${ist.year.toString().padLeft(4, '0')}-'
        '${ist.month.toString().padLeft(2, '0')}-'
        '${ist.day.toString().padLeft(2, '0')}';
  }

  static String today() => key();

  /// UTC instant of 00:00 IST on [dateKey] — the lower bound for "on this day"
  /// timestamp range queries.
  static DateTime startOfDayUtc(String dateKey) {
    final p = dateKey.split('-').map(int.parse).toList();
    return DateTime.utc(p[0], p[1], p[2]).subtract(_offset);
  }

  static DateTime endOfDayUtc(String dateKey) =>
      startOfDayUtc(dateKey).add(const Duration(days: 1));

  /// Shifts a `YYYY-MM-DD` key by [days] (negative goes back).
  static String shift(String dateKey, int days) {
    final p = dateKey.split('-').map(int.parse).toList();
    final d = DateTime.utc(p[0], p[1], p[2]).add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  /// The IST date key [days] before today.
  static String daysAgo(int days) => shift(today(), -days);

  /// First day of the IST month containing [dateKey].
  static String monthStart(String dateKey) => '${dateKey.substring(0, 7)}-01';

  static DateTime parse(String dateKey) {
    final p = dateKey.split('-').map(int.parse).toList();
    return DateTime(p[0], p[1], p[2]);
  }

  /// "Mon, 14 Jul 2026"
  static String longLabel(String dateKey) =>
      DateFormat('EEE, d MMM yyyy').format(parse(dateKey));

  /// "14 Jul"
  static String shortLabel(String dateKey) =>
      DateFormat('d MMM').format(parse(dateKey));

  /// Renders a Firestore timestamp instant as IST clock time, e.g. "4:12 PM".
  static String timeLabel(DateTime? instant) {
    if (instant == null) return '—';
    return DateFormat('h:mm a').format(instant.toUtc().add(_offset));
  }

  /// "Just now" / "12m ago" / "3h ago" / "Yesterday" / "5d ago".
  static String relativeLabel(DateTime? instant) {
    if (instant == null) return '';
    final mins = DateTime.now().difference(instant).inMinutes;
    if (mins < 1) return 'Just now';
    if (mins < 60) return '${mins}m ago';
    final hrs = mins ~/ 60;
    if (hrs < 24) return '${hrs}h ago';
    final days = hrs ~/ 24;
    if (days == 1) return 'Yesterday';
    if (days < 30) return '${days}d ago';
    return '${days ~/ 30}mo ago';
  }
}
