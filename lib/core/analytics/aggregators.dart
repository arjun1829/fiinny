// lib/core/analytics/aggregators.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/expense_item.dart';
import '../../models/income_item.dart';

/// Extended to support quarter + custom.
enum Period { day, week, month, quarter, year, last2, last5, all, custom }

class SeriesPoint {
  final String x; // label (e.g., 'Mon', 'Jan', '12')
  final double y;
  const SeriesPoint(this.x, this.y);
}

/// Optional custom date range (inclusive to the day; end auto-extends by +1 day internally)
class CustomRange {
  final DateTime start, end;
  const CustomRange(this.start, this.end);
}

class AnalyticsAgg {
  /// Returns [start, end) for the selected period. For [Period.custom], pass [custom].
  static DateTimeRange rangeFor(Period p, DateTime now, {CustomRange? custom}) {
    switch (p) {
      case Period.day: {
        final s = DateTime(now.year, now.month, now.day);
        return DateTimeRange(start: s, end: s.add(const Duration(days: 1)));
      }
      case Period.week: {
        final s0 = now.subtract(Duration(days: now.weekday - 1));
        final s = DateTime(s0.year, s0.month, s0.day);
        return DateTimeRange(start: s, end: s.add(const Duration(days: 7)));
      }
      case Period.month: {
        final s = DateTime(now.year, now.month, 1);
        final e = DateTime(now.year, now.month + 1, 1);
        return DateTimeRange(start: s, end: e);
      }
      case Period.quarter: {
        final q = ((now.month - 1) ~/ 3) + 1;
        final sm = (q - 1) * 3 + 1;
        final s = DateTime(now.year, sm, 1);
        final e = DateTime(now.year, sm + 3, 1);
        return DateTimeRange(start: s, end: e);
      }
      case Period.year: {
        final s = DateTime(now.year, 1, 1);
        final e = DateTime(now.year + 1, 1, 1);
        return DateTimeRange(start: s, end: e);
      }
      case Period.last2: {
        final y = now.subtract(const Duration(days: 1));
        final s = DateTime(y.year, y.month, y.day);
        final e = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
        return DateTimeRange(start: s, end: e);
      }
      case Period.last5: {
        final s0 = now.subtract(const Duration(days: 4));
        final s = DateTime(s0.year, s0.month, s0.day);
        final e = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
        return DateTimeRange(start: s, end: e);
      }
      case Period.all:
        return DateTimeRange(start: DateTime(2000, 1, 1), end: now.add(const Duration(days: 1)));
      case Period.custom:
        if (custom != null) {
          final s = DateTime(custom.start.year, custom.start.month, custom.start.day);
          final e = DateTime(custom.end.year, custom.end.month, custom.end.day).add(const Duration(days: 1));
          return DateTimeRange(start: s, end: e);
        }
        // Fallback to "today" if custom not provided
        final s = DateTime(now.year, now.month, now.day);
        return DateTimeRange(start: s, end: s.add(const Duration(days: 1)));
    }
  }

  // ---------- Basic filters & sums ----------
  static List<ExpenseItem> filterExpenses(List<ExpenseItem> all, DateTimeRange r) =>
      all.where((e) => !e.date.isBefore(r.start) && e.date.isBefore(r.end)).toList();

  static List<IncomeItem> filterIncomes(List<IncomeItem> all, DateTimeRange r) =>
      all.where((e) => !e.date.isBefore(r.start) && e.date.isBefore(r.end)).toList();

  static double sumAmount<T>(Iterable<T> list, double Function(T) amount) =>
      list.fold(0.0, (a, b) => a + amount(b));

  // ---------- Rollups (legacy/simple) ----------
  static Map<String, double> byCategory(List<ExpenseItem> exp) {
    final m = <String, double>{};
    for (final e in exp) {
      final k = (e.category ?? 'Uncategorized').trim();
      if (k.isEmpty) continue;
      m[k] = (m[k] ?? 0) + e.amount;
    }
    return m;
  }

  static Map<String, double> byIncomeCategory(List<IncomeItem> inc) {
    final m = <String, double>{};
    for (final i in inc) {
      final k = (i.category ?? i.type ?? 'Uncategorized').trim();
      if (k.isEmpty) continue;
      m[k] = (m[k] ?? 0) + i.amount;
    }
    return m;
  }

  /// Sums by the *real counterparty/merchant* rather than category/label.
  /// Prefers `counterparty`, then `upiVpa`, then legacy `label`. Falls back to 'Unknown'.
  static Map<String, double> byMerchant(List<ExpenseItem> exp) {
    final m = <String, double>{};
    for (final e in exp) {
      String k = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
      if (k.isEmpty) k = 'Unknown';
      m[k] = (m[k] ?? 0) + e.amount;
    }
    return m;
  }

  // ---------- Smart category resolvers & rollups ----------
  static const Set<String> _noisyTypes = {
    'email debit', 'sms debit', 'email credit', 'sms credit', 'debit', 'credit', ''
  };

  static String resolveExpenseCategory(ExpenseItem e) {
    final raw = ((e.category ?? e.type) ?? '').trim();
    if (raw.isNotEmpty && !_noisyTypes.contains(raw.toLowerCase())) return raw;

    final base = "${e.label ?? ''} ${e.note}".toLowerCase();
    bool hasAny(Iterable<String> xs) => xs.any((k) => base.contains(k));

    if (hasAny(['zomato','swiggy','food','meal','restaurant','dine'])) return 'Food & Dining';
    if (hasAny(['grocery','dmart','bigbasket','kirana','fresh']))      return 'Groceries';
    if (hasAny(['ola','uber','rapido','metro','bus','auto','train']))  return 'Transport';
    if (hasAny(['fuel','petrol','diesel','hpcl','bpcl','ioc']))        return 'Fuel';
    if (hasAny(['amazon','flipkart','myntra','ajio','nykaa']))         return 'Shopping';
    if (hasAny(['electric','power','wifi','broadband','mobile bill','recharge','gas','dth','water']))
      return 'Bills & Utilities';
    if (hasAny(['rent','landlord']))                                   return 'Rent';
    if (hasAny(['emi','loan','nbfc','interest debit']))                return 'EMI & Loans';
    if (hasAny(['netflix','prime','spotify','hotstar','youtube']))     return 'Subscriptions';
    if (hasAny(['hospital','clinic','pharma','apollo','1mg']))         return 'Health';
    if (hasAny(['tuition','coaching','college','fee']))                return 'Education';
    if (hasAny(['flight','air','indigo','vistara','hotel','mmt']))     return 'Travel';
    if (hasAny(['movie','pvr','inox','bookmyshow','concert']))         return 'Entertainment';
    if (hasAny(['charge','penalty','fee']))                            return 'Fees & Charges';
    if (hasAny(['sip','mutual fund','stock','zerodha','groww']))       return 'Investments';
    if (hasAny(['upi','imps','neft','rtgs']) && (e.payerId ?? '').isNotEmpty)
      return 'Transfers (Self)';

    return 'Other';
  }

  static String resolveIncomeCategory(IncomeItem i) {
    final raw = ((i.category ?? i.type) ?? '').trim();
    if (raw.isNotEmpty && !_noisyTypes.contains(raw.toLowerCase())) return raw;

    final t = "${i.label ?? ''} ${i.note ?? ''} ${i.source ?? ''}".toLowerCase();
    bool hasAny(Iterable<String> xs) => xs.any((k) => t.contains(k));

    if (hasAny(['salary','payroll','wage','stipend'])) return 'Salary';
    if (hasAny(['freelance','consult','contract']))     return 'Freelance';
    if (hasAny(['interest','fd','rd']))                 return 'Interest';
    if (hasAny(['dividend','div.']))                    return 'Dividend';
    if (hasAny(['cashback','reward','promo']))          return 'Cashback/Rewards';
    if (hasAny(['refund','reimb','chargeback']))        return 'Refund/Reimbursement';
    if (hasAny(['rent']))                               return 'Rent Received';
    if (hasAny(['gift']))                               return 'Gift';
    if (hasAny(['self transfer','from self','own account','sweep'])) return 'Transfer In (Self)';
    if (hasAny(['sold','sale','proceeds']))             return 'Sale Proceeds';
    if (hasAny(['loan disbursal','loan credit']))       return 'Loan Received';
    if (hasAny(['upi','imps','neft','gpay','phonepe','paytm'])) return 'Transfer In (Self)';
    return 'Other';
  }

  static Map<String, double> byExpenseCategorySmart(List<ExpenseItem> exp) {
    final m = <String, double>{};
    for (final e in exp) {
      final k = resolveExpenseCategory(e);
      m[k] = (m[k] ?? 0) + e.amount;
    }
    return m;
  }

  static Map<String, double> byIncomeCategorySmart(List<IncomeItem> inc) {
    final m = <String, double>{};
    for (final i in inc) {
      final k = resolveIncomeCategory(i);
      m[k] = (m[k] ?? 0) + i.amount;
    }
    return m;
  }

  // ---------- Convenience filters (for drill-down sheets) ----------
  static List<ExpenseItem> expensesByCategory(List<ExpenseItem> xs, String category) =>
      xs.where((e) => resolveExpenseCategory(e).toLowerCase() == category.toLowerCase()).toList();

  static List<IncomeItem> incomesByCategory(List<IncomeItem> xs, String category) =>
      xs.where((i) => resolveIncomeCategory(i).toLowerCase() == category.toLowerCase()).toList();

  static List<ExpenseItem> expensesByMerchant(List<ExpenseItem> xs, String merchant) =>
      xs.where((e) {
        final k = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
        return k.isNotEmpty && k.toLowerCase() == merchant.toLowerCase();
      }).toList();

  // ---------- Series (stacked income+expense per bucket) ----------
  static List<SeriesPoint> amountSeries(
    Period p,
    List<ExpenseItem> exp,
    List<IncomeItem> inc,
    DateTime now, {
    CustomRange? custom,
  }) {
    final fmtDay = DateFormat('d');
    final fmtMon = DateFormat('MMM');

    switch (p) {
      case Period.day: {
        final bars = List<double>.filled(24, 0);
        for (final e in exp) { bars[e.date.hour] += e.amount; }
        for (final i in inc) { bars[i.date.hour] += i.amount; }
        return List.generate(24, (h) => SeriesPoint(h.toString(), bars[h]));
      }
      case Period.week: {
        final bars = List<double>.filled(7, 0);
        for (final e in exp) { bars[e.date.weekday - 1] += e.amount; }
        for (final i in inc) { bars[i.date.weekday - 1] += i.amount; }
        const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        return List.generate(7, (d) => SeriesPoint(labels[d], bars[d]));
      }
      case Period.month: {
        final days = DateTime(now.year, now.month + 1, 0).day;
        final bars = List<double>.filled(days, 0);
        for (final e in exp) { bars[e.date.day - 1] += e.amount; }
        for (final i in inc) { bars[i.date.day - 1] += i.amount; }
        return List.generate(days, (d) =>
            SeriesPoint(fmtDay.format(DateTime(now.year, now.month, d + 1)), bars[d]));
      }
      case Period.quarter: {
        final qStartMonth = ((now.month - 1) ~/ 3) * 3 + 1;
        final labels = List.generate(
          3,
          (i) => fmtMon.format(DateTime(now.year, qStartMonth + i, 1)),
        );
        final bars = List<double>.filled(3, 0);
        for (final e in exp) {
          final idx = e.date.month - qStartMonth;
          if (idx >= 0 && idx < bars.length) bars[idx] += e.amount;
        }
        for (final i in inc) {
          final idx = i.date.month - qStartMonth;
          if (idx >= 0 && idx < bars.length) bars[idx] += i.amount;
        }
        return List.generate(3, (m) => SeriesPoint(labels[m], bars[m]));
      }
      case Period.year: {
        final bars = List<double>.filled(12, 0);
        for (final e in exp) { bars[e.date.month - 1] += e.amount; }
        for (final i in inc) { bars[i.date.month - 1] += i.amount; }
        const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return List.generate(12, (m) => SeriesPoint(labels[m], bars[m]));
      }
      case Period.last2: {
        final bars2 = List<double>.filled(2, 0);
        final y = now.subtract(const Duration(days: 1));
        for (final e in exp) {
          if (_sameDay(e.date, y)) bars2[0] += e.amount;
          else if (_sameDay(e.date, now)) bars2[1] += e.amount;
        }
        for (final i in inc) {
          if (_sameDay(i.date, y)) bars2[0] += i.amount;
          else if (_sameDay(i.date, now)) bars2[1] += i.amount;
        }
        return [SeriesPoint('Yest', bars2[0]), SeriesPoint('Today', bars2[1])];
      }
      case Period.last5: {
        final bars5 = List<double>.filled(5, 0);
        for (int d = 0; d < 5; d++) {
          final target = now.subtract(Duration(days: 4 - d));
          for (final e in exp) { if (_sameDay(e.date, target)) bars5[d] += e.amount; }
          for (final i in inc) { if (_sameDay(i.date, target)) bars5[d] += i.amount; }
        }
        return List.generate(5, (d) {
          final day = now.subtract(Duration(days: 4 - d));
          return SeriesPoint('${day.day}', bars5[d]);
        });
      }
      case Period.all: {
        if (exp.isEmpty && inc.isEmpty) return const [];
        DateTime? minD, maxD;
        for (final e in exp) {
          minD = (minD == null || e.date.isBefore(minD!)) ? e.date : minD;
          maxD = (maxD == null || e.date.isAfter(maxD!)) ? e.date : maxD;
        }
        for (final i in inc) {
          minD = (minD == null || i.date.isBefore(minD!)) ? i.date : minD;
          maxD = (maxD == null || i.date.isAfter(maxD!)) ? i.date : maxD;
        }
        if (minD == null || maxD == null) return const [];
        final months = (maxD!.year - minD!.year) * 12 + (maxD!.month - minD!.month) + 1;
        final bars = List<double>.filled(months, 0);
        for (final e in exp) {
          final idx = (e.date.year - minD!.year) * 12 + (e.date.month - minD!.month);
          if (idx >= 0 && idx < months) bars[idx] += e.amount;
        }
        for (final i in inc) {
          final idx = (i.date.year - minD!.year) * 12 + (i.date.month - minD!.month);
          if (idx >= 0 && idx < months) bars[idx] += i.amount;
        }
        return List.generate(months, (m) {
          final d = DateTime(minD!.year, minD!.month + m, 1);
          return SeriesPoint(fmtMon.format(d), bars[m]);
        });
      }
      case Period.custom:
        if (custom == null) return const [];
        final start = DateTime(custom.start.year, custom.start.month, custom.start.day);
        final end = DateTime(custom.end.year, custom.end.month, custom.end.day);
        final totalDays = end.difference(start).inDays + 1;
        final clamped = totalDays.clamp(1, 62); // keep labels manageable
        final days = clamped is int ? clamped : clamped.toInt();
        final bars = List<double>.filled(days, 0);
        for (final e in exp) {
          final idx = DateTime(e.date.year, e.date.month, e.date.day)
              .difference(start)
              .inDays;
          if (idx >= 0 && idx < days) bars[idx] += e.amount;
        }
        for (final i in inc) {
          final idx = DateTime(i.date.year, i.date.month, i.date.day)
              .difference(start)
              .inDays;
          if (idx >= 0 && idx < days) bars[idx] += i.amount;
        }
        final fmtDayMon = DateFormat('d MMM');
        return List.generate(days, (d) {
          final labelDate = start.add(Duration(days: d));
          return SeriesPoint(fmtDayMon.format(labelDate), bars[d]);
        });
    }
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
