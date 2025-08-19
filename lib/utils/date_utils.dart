// utils/date_utils.dart

import 'package:intl/intl.dart';

class DateUtilsFiinny {
  /// Returns start of week (Monday) for a given date
  static DateTime startOfWeek(DateTime date) {
    return DateTime(date.year, date.month, date.day).subtract(Duration(days: date.weekday - 1));
  }

  /// Returns end of week (Sunday) for a given date
  static DateTime endOfWeek(DateTime date) {
    return DateTime(date.year, date.month, date.day).add(Duration(days: 7 - date.weekday));
  }

  /// Returns formatted date as 'dd MMM yyyy'
  static String formatDate(DateTime date) {
    return DateFormat('dd MMM yyyy').format(date);
  }

  /// Returns formatted time as 'hh:mm a'
  static String formatTime(DateTime date) {
    return DateFormat('hh:mm a').format(date);
  }

  /// Returns true if the given date is today
  static bool isToday(DateTime date) {
    final now = DateTime.now();
    return now.year == date.year && now.month == date.month && now.day == date.day;
  }

  /// Days between two dates (inclusive)
  static int daysBetween(DateTime from, DateTime to) {
    return to.difference(from).inDays.abs();
  }
}
