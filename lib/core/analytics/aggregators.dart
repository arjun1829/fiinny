// lib/core/analytics/aggregators.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/expense_item.dart';
import '../../models/income_item.dart';

enum Period { day, week, month, year, last2, last5, all }

class SeriesPoint {
  final String x; // label (e.g., 'Mon', 'Jan', '12')
  final double y;
  SeriesPoint(this.x, this.y);
}

class AnalyticsAgg {
  static DateTimeRange rangeFor(Period p, DateTime now) {
    switch (p) {
      case Period.day:
        final s = DateTime(now.year, now.month, now.day);
        return DateTimeRange(start: s, end: s.add(const Duration(days: 1)));
      case Period.week:
        final s = now.subtract(Duration(days: now.weekday - 1));
        final start = DateTime(s.year, s.month, s.day);
        return DateTimeRange(start: start, end: start.add(const Duration(days: 7)));
      case Period.month:
        final s = DateTime(now.year, now.month, 1);
        final e = DateTime(now.year, now.month + 1, 1);
        return DateTimeRange(start: s, end: e);
      case Period.year:
        final s = DateTime(now.year, 1, 1);
        final e = DateTime(now.year + 1, 1, 1);
        return DateTimeRange(start: s, end: e);
      case Period.last2:
        final s = now.subtract(const Duration(days: 1));
        final start = DateTime(s.year, s.month, s.day);
        final end = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
        return DateTimeRange(start: start, end: end);
      case Period.last5:
        final s = now.subtract(const Duration(days: 4));
        final start = DateTime(s.year, s.month, s.day);
        final end = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
        return DateTimeRange(start: start, end: end);
      case Period.all:
        return DateTimeRange(start: DateTime(2000, 1, 1), end: now.add(const Duration(days: 1)));
    }
  }

  static List<ExpenseItem> filterExpenses(List<ExpenseItem> all, DateTimeRange r) =>
      all.where((e) => !e.date.isBefore(r.start) && e.date.isBefore(r.end)).toList();

  static List<IncomeItem> filterIncomes(List<IncomeItem> all, DateTimeRange r) =>
      all.where((e) => !e.date.isBefore(r.start) && e.date.isBefore(r.end)).toList();

  static double sumAmount<T>(Iterable<T> list, double Function(T) amount) =>
      list.fold(0.0, (a, b) => a + amount(b));

  static Map<String, double> byCategory(List<ExpenseItem> exp) {
    final m = <String, double>{};
    for (final e in exp) {
      final k = (e.category ?? 'Uncategorized').trim();
      m[k] = (m[k] ?? 0) + e.amount;
    }
    return m;
  }

  static Map<String, double> byMerchant(List<ExpenseItem> exp) {
    final m = <String, double>{};
    for (final e in exp) {
      final k = (e.label ?? e.category ?? 'Merchant').trim();
      m[k] = (m[k] ?? 0) + e.amount;
    }
    return m;
  }

  /// Build x-axis & y series for the chosen period (sum incomes+expenses per bucket).
  static List<SeriesPoint> amountSeries(Period p, List<ExpenseItem> exp, List<IncomeItem> inc, DateTime now) {
    final fmtDay = DateFormat('d');
    final fmtMon = DateFormat('MMM');
    switch (p) {
      case Period.day:
        final bars = List<double>.filled(24, 0);
        for (final e in exp) {
          bars[e.date.hour] += e.amount;
        }
        for (final i in inc) {
          bars[i.date.hour] += i.amount;
        }
        return List.generate(24, (h) => SeriesPoint(h.toString(), bars[h]));
      case Period.week:
        final bars = List<double>.filled(7, 0);
        for (final e in exp) {
          bars[e.date.weekday - 1] += e.amount;
        }
        for (final i in inc) {
          bars[i.date.weekday - 1] += i.amount;
        }
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return List.generate(7, (d) => SeriesPoint(labels[d], bars[d]));
      case Period.month:
        final days = DateTime(now.year, now.month + 1, 0).day;
        final bars = List<double>.filled(days, 0);
        for (final e in exp) {
          bars[e.date.day - 1] += e.amount;
        }
        for (final i in inc) {
          bars[i.date.day - 1] += i.amount;
        }
        return List.generate(days, (d) =>
            SeriesPoint(fmtDay.format(DateTime(now.year, now.month, d + 1)), bars[d]));
      case Period.year:
        final bars = List<double>.filled(12, 0);
        for (final e in exp) {
          bars[e.date.month - 1] += e.amount;
        }
        for (final i in inc) {
          bars[i.date.month - 1] += i.amount;
        }
        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return List.generate(12, (m) => SeriesPoint(labels[m], bars[m]));
      case Period.last2:
        final bars2 = List<double>.filled(2, 0);
        final y = now.subtract(const Duration(days: 1));
        for (final e in exp) {
          if (_sameDay(e.date, y)) {
            bars2[0] += e.amount;
          } else if (_sameDay(e.date, now)) {
            bars2[1] += e.amount;
          }
        }
        for (final i in inc) {
          if (_sameDay(i.date, y)) {
            bars2[0] += i.amount;
          } else if (_sameDay(i.date, now)) {
            bars2[1] += i.amount;
          }
        }
        return [SeriesPoint('Yest', bars2[0]), SeriesPoint('Today', bars2[1])];
      case Period.last5:
        final bars5 = List<double>.filled(5, 0);
        for (int d = 0; d < 5; d++) {
          final target = now.subtract(Duration(days: 4 - d));
          for (final e in exp) {
            if (_sameDay(e.date, target)) {
              bars5[d] += e.amount;
            }
          }
          for (final i in inc) {
            if (_sameDay(i.date, target)) {
              bars5[d] += i.amount;
            }
          }
        }
        return List.generate(5, (d) {
          final day = now.subtract(Duration(days: 4 - d));
          return SeriesPoint('${day.day}', bars5[d]);
        });
      case Period.all:
        // Month buckets from min..max
        if (exp.isEmpty && inc.isEmpty) {
          return const [];
        }
        DateTime? minD;
        DateTime? maxD;
        for (final e in exp) {
          minD = (minD == null || e.date.isBefore(minD!)) ? e.date : minD;
          maxD = (maxD == null || e.date.isAfter(maxD!)) ? e.date : maxD;
        }
        for (final i in inc) {
          minD = (minD == null || i.date.isBefore(minD!)) ? i.date : minD;
          maxD = (maxD == null || i.date.isAfter(maxD!)) ? i.date : maxD;
        }
        if (minD == null || maxD == null) {
          return const [];
        }
        final months = (maxD!.year - minD!.year) * 12 + (maxD!.month - minD!.month) + 1;
        final bars = List<double>.filled(months, 0);
        for (final e in exp) {
          final idx = (e.date.year - minD!.year) * 12 + (e.date.month - minD!.month);
          bars[idx] += e.amount;
        }
        for (final i in inc) {
          final idx = (i.date.year - minD!.year) * 12 + (i.date.month - minD!.month);
          bars[idx] += i.amount;
        }
        return List.generate(months, (m) {
          final d = DateTime(minD!.year, minD!.month + m, 1);
          return SeriesPoint(fmtMon.format(d), bars[m]);
        });
    }
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
