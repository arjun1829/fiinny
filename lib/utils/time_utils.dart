import 'package:intl/intl.dart';

class TimeUtils {
  // Minute-level key in local time (yyyy-MM-ddTHH:mm)
  static String toMinuteKey(DateTime dt) {
    final local = dt.toLocal();
    final f = DateFormat('yyyy-MM-ddTHH:mm');
    return f.format(local);
  }

  // Truncate to minute
  static DateTime toMinute(DateTime dt) {
    final l = dt.toLocal();
    return DateTime(l.year, l.month, l.day, l.hour, l.minute);
  }
}
