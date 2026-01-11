// lib/core/analytics/aggregators.dart
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/expense_item.dart';
import '../../models/income_item.dart';

class SeriesPoint {
  final String x;
  final double y;
  const SeriesPoint(this.x, this.y);
}

enum Period {
  day,
  week,
  month,
  lastMonth,
  quarter,
  year,
  last2,
  last5,
  all,
  custom,
}

class CustomRange {
  final DateTime start;
  final DateTime end;
  const CustomRange(this.start, this.end);
}

class AnalyticsAgg {
  // -------- Date ranges (end is treated inclusive for whole-day logic) --------
  static DateTimeRange rangeFor(Period p, DateTime now, {CustomRange? custom}) {
    DateTime d0(DateTime d) => DateTime(d.year, d.month, d.day);
    switch (p) {
      case Period.day:
        final d = d0(now);
        return DateTimeRange(start: d, end: d);
      case Period.week:
        final start = d0(now).subtract(Duration(days: now.weekday - 1));
        final end = start.add(const Duration(days: 6));
        return DateTimeRange(start: start, end: end);
      case Period.month:
        final start = DateTime(now.year, now.month, 1);
        final end = DateTime(now.year, now.month + 1, 0);
        return DateTimeRange(start: start, end: end);
      case Period.lastMonth:
        final prevStart = DateTime(now.year, now.month - 1, 1);
        final prevEnd = DateTime(prevStart.year, prevStart.month + 1, 0);
        return DateTimeRange(start: prevStart, end: prevEnd);
      case Period.quarter:
        final qStartMonth = ((now.month - 1) ~/ 3) * 3 + 1;
        final start = DateTime(now.year, qStartMonth, 1);
        final end = DateTime(now.year, qStartMonth + 3, 0);
        return DateTimeRange(start: start, end: end);
      case Period.year:
        return DateTimeRange(
          start: DateTime(now.year, 1, 1),
          end: DateTime(now.year, 12, 31),
        );
      case Period.last2:
        final y = d0(now).subtract(const Duration(days: 1));
        final t = d0(now);
        return DateTimeRange(start: y, end: t);
      case Period.last5:
        final start = d0(now).subtract(const Duration(days: 4));
        final end = d0(now);
        return DateTimeRange(start: start, end: end);
      case Period.all:
        return DateTimeRange(
          start: DateTime(2000, 1, 1),
          end: DateTime(2100, 12, 31),
        );
      case Period.custom:
        if (custom == null) {
          final d = d0(now);
          return DateTimeRange(start: d, end: d);
        }
        final s = d0(custom.start);
        final e = d0(custom.end);
        return DateTimeRange(start: s, end: e);
    }
  }

  // Inclusive day filter
  static bool _within(DateTime d, DateTimeRange r) {
    final s = DateTime(r.start.year, r.start.month, r.start.day);
    final eExcl = DateTime(
      r.end.year,
      r.end.month,
      r.end.day,
    ).add(const Duration(days: 1));
    return !d.isBefore(s) && d.isBefore(eExcl);
  }

  static List<ExpenseItem> filterExpenses(
    List<ExpenseItem> xs,
    DateTimeRange r,
  ) {
    final out = xs.where((e) => _within(e.date, r)).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    return out;
  }

  static List<IncomeItem> filterIncomes(List<IncomeItem> xs, DateTimeRange r) {
    final out = xs.where((i) => _within(i.date, r)).toList()
      ..sort((a, b) => b.date.compareTo(a.date));
    return out;
  }

  static double sumAmount<T>(List<T> items, double Function(T) getAmount) {
    var s = 0.0;
    for (final x in items) s += getAmount(x);
    return s;
  }

  // -------- Category resolvers (robust) --------
  static const _noise = {
    'email debit',
    'sms debit',
    'email credit',
    'sms credit',
    'debit',
    'credit',
    '',
  };

  static String _clean(String? raw) {
    final s = (raw ?? '').trim();
    if (s.isEmpty) return 'Other';
    if (_noise.contains(s.toLowerCase())) return 'Other';
    return s;
  }

  static String resolveExpenseCategory(ExpenseItem e) {
    final t0 = _clean(e.type);
    if (t0 != 'Other') return t0;

    final base = "${e.label ?? ''} ${e.note ?? ''}".toLowerCase();
    bool has(Iterable<String> keys) => keys.any((k) => base.contains(k));

    if (has(['zomato', 'swiggy', 'restaurant', 'food', 'meal', 'eat', 'dine']))
      return 'Food & Dining';
    if (has([
      'grocery',
      'mart',
      'd mart',
      'dmart',
      'bigbasket',
      'fresh',
      'kirana',
      'blinkit',
      'zepto',
      'ratnadeep',
      'more',
    ]))
      return 'Groceries';
    if (has(['ola', 'uber', 'rapido', 'metro', 'bus', 'auto', 'cab', 'train']))
      return 'Transport';
    if (has(['fuel', 'petrol', 'diesel', 'hpcl', 'bpcl', 'ioc'])) return 'Fuel';
    if (has([
      'amazon',
      'flipkart',
      'myntra',
      'ajio',
      'nykaa',
      'tata cliq',
      'meesho',
    ]))
      return 'Shopping';
    if (has([
      'electric',
      'electricity',
      'power',
      'water bill',
      'wifi',
      'broadband',
      'dth',
      'mobile bill',
      'recharge',
      'gas',
    ]))
      return 'Bills & Utilities';
    if (has(['rent', 'landlord'])) return 'Rent';
    if (has(['emi', 'loan', 'nbfc', 'interest debit'])) return 'EMI & Loans';
    if (has([
      'netflix',
      'prime',
      'spotify',
      'yt premium',
      'hotstar',
      'zee5',
      'sonyliv',
      'youtube',
    ]))
      return 'Subscriptions';
    if (has([
      'hospital',
      'clinic',
      'pharma',
      'apollo',
      '1mg',
      'pharmacy',
      'diagnostic',
    ]))
      return 'Health';
    if (has(['fee', 'college', 'tuition', 'coaching'])) return 'Education';
    if (has([
      'flight',
      'vistara',
      'indigo',
      'hotel',
      'mmt',
      'makemytrip',
      'booking.com',
      'oyo',
    ]))
      return 'Travel';
    if (has(['movie', 'pvr', 'inox', 'bookmyshow', 'concert', 'event']))
      return 'Entertainment';
    if (has(['charge', 'fee', 'penalty'])) return 'Fees & Charges';
    if (has([
      'sip',
      'mutual fund',
      'mf',
      'stock',
      'zerodha',
      'groww',
      'angel',
      'upstox',
    ]))
      return 'Investments';
    if (t0 == 'Transfer')
      return 'Transfers (Self)'; // Map CommonRegex 'Transfer' to this bucket
    if (has(['upi', 'imps', 'neft', 'rtgs']) && (e.payerId.isNotEmpty))
      return 'Transfers (Self)';

    return 'Other';
  }

  static String resolveIncomeCategory(IncomeItem i) {
    final raw = _clean(i.type ?? i.category);
    if (raw != 'Other') return raw;

    final t = "${i.label ?? ''} ${i.note ?? ''} ${i.source ?? ''}"
        .toLowerCase();
    bool has(Iterable<String> keys) => keys.any((k) => t.contains(k));

    if (has(['salary', 'payroll', 'wage', 'stipend', 'payout', 'ctc']))
      return 'Salary';
    if (has([
      'freelance',
      'consult',
      'contract',
      'side hustle',
      'upwork',
      'fiverr',
    ]))
      return 'Freelance';
    if (has([
      'interest',
      's/b interest',
      'fd interest',
      'rd interest',
      'int.',
      'fd',
      'rd',
    ]))
      return 'Interest';
    if (has(['dividend', 'div.', 'payout dividend'])) return 'Dividend';
    if (has(['cashback', 'cash back', 'reward', 'promo', 'offer']))
      return 'Cashback/Rewards';
    if (has(['refund', 'reversal', 'chargeback', 'reimb']))
      return 'Refund/Reimbursement';
    if (has(['rent'])) return 'Rent Received';
    if (has(['gift', 'gifting'])) return 'Gift';
    if (has(['self transfer', 'from self', 'own account', 'sweep in']))
      return 'Transfer In (Self)';
    if (has(['sold', 'sale', 'proceeds', 'liquidation']))
      return 'Sale Proceeds';
    if (has(['loan disbursal', 'loan credit', 'emi refund', 'nbfc']))
      return 'Loan Received';
    if (has(['upi', 'imps', 'neft', 'rtgs', 'gpay', 'phonepe', 'paytm']))
      return 'Transfer In (Self)';

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

  // -------- Merchant rollup (counterparty / upiVpa / label) --------
  static Map<String, double> byMerchant(List<ExpenseItem> exp) {
    final out = <String, double>{};
    for (final e in exp) {
      final raw = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
      if (raw.isEmpty) continue;
      final key = _displayMerchantKey(raw);
      if (key.isEmpty) continue;
      out[key] = (out[key] ?? 0) + e.amount;
    }
    final entries = out.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return Map<String, double>.fromEntries(entries);
  }

  static String displayMerchantKey(String raw) => _displayMerchantKey(raw);

  static String _displayMerchantKey(String s) {
    var t = s.trim();
    t = t.replaceAll(
      RegExp(
        r'@okaxis|@oksbi|@okhdfcbank|@okicici|@ybl|@ibl|@upi',
        caseSensitive: false,
      ),
      '',
    );
    t = t.replaceAll(RegExp(r'^upi[:\- ]*', caseSensitive: false), '');
    t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
    return _toTitle(t);
  }

  static String _toTitle(String s) {
    if (s.isEmpty) return s;
    return s
        .split(' ')
        .map(
          (w) => w.isEmpty
              ? w
              : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}',
        )
        .join(' ');
  }

  // -------- Optional: series per period (used for charts if needed) --------
  static List<SeriesPoint> amountSeries(
    Period p,
    List<ExpenseItem> exp,
    List<IncomeItem> _inc,
    DateTime now, {
    CustomRange? custom,
  }) {
    List<SeriesPoint> mk(List<double> vals, String Function(int) labelOf) =>
        List.generate(vals.length, (i) => SeriesPoint(labelOf(i), vals[i]));

    switch (p) {
      case Period.day:
        final v = List<double>.filled(24, 0);
        for (final e in exp) v[e.date.hour] += e.amount;
        return mk(v, (i) => '${i}h');
      case Period.week:
        final v = List<double>.filled(7, 0);
        for (final e in exp) v[e.date.weekday - 1] += e.amount;
        return mk(v, (i) => 'D${i + 1}');
      case Period.month:
        final days = DateTime(now.year, now.month + 1, 0).day;
        final v = List<double>.filled(days, 0);
        for (final e in exp) v[e.date.day - 1] += e.amount;
        return mk(v, (i) => '${i + 1}');
      case Period.lastMonth:
        final prevStart = DateTime(now.year, now.month - 1, 1);
        final daysPrev = DateTime(prevStart.year, prevStart.month + 1, 0).day;
        final vPrev = List<double>.filled(daysPrev, 0);
        for (final e in exp) {
          if (e.date.year == prevStart.year &&
              e.date.month == prevStart.month) {
            vPrev[e.date.day - 1] += e.amount;
          }
        }
        return mk(vPrev, (i) => '${i + 1}');
      case Period.quarter:
        final qStartMonth = ((now.month - 1) ~/ 3) * 3 + 1;
        final v = List<double>.filled(3, 0);
        for (final e in exp) {
          final idx = e.date.month - qStartMonth;
          if (idx >= 0 && idx < v.length) v[idx] += e.amount;
        }
        return mk(v, (i) => 'M${i + 1}');
      case Period.year:
        final v = List<double>.filled(12, 0);
        for (final e in exp) v[e.date.month - 1] += e.amount;
        return mk(v, (i) => DateFormat('MMM').format(DateTime(2000, i + 1, 1)));
      case Period.last2:
        final y = DateTime(
          now.year,
          now.month,
          now.day,
        ).subtract(const Duration(days: 1));
        final t = DateTime(now.year, now.month, now.day);
        double sumDay(DateTime d) => exp
            .where(
              (e) =>
                  e.date.year == d.year &&
                  e.date.month == d.month &&
                  e.date.day == d.day,
            )
            .fold(0.0, (s, e) => s + e.amount);
        return [SeriesPoint('Y', sumDay(y)), SeriesPoint('T', sumDay(t))];
      case Period.last5:
        final v = List<double>.filled(5, 0);
        for (int d = 0; d < 5; d++) {
          final target = DateTime(
            now.year,
            now.month,
            now.day,
          ).subtract(Duration(days: 4 - d));
          for (final e in exp) {
            if (e.date.year == target.year &&
                e.date.month == target.month &&
                e.date.day == target.day) {
              v[d] += e.amount;
            }
          }
        }
        return mk(v, (i) => 'D${i + 1}');
      case Period.all:
        final v = List<double>.filled(12, 0);
        for (final e in exp) v[e.date.month - 1] += e.amount;
        return mk(v, (i) => DateFormat('MMM').format(DateTime(2000, i + 1, 1)));
      case Period.custom:
        if (custom == null) return const [];
        final start = DateTime(
          custom.start.year,
          custom.start.month,
          custom.start.day,
        );
        final end = DateTime(custom.end.year, custom.end.month, custom.end.day);
        final n = end.difference(start).inDays + 1;
        final lenRaw = n.clamp(1, 31);
        final len = lenRaw is int ? lenRaw : lenRaw.toInt();
        final v = List<double>.filled(len, 0);
        for (final e in exp) {
          final d = DateTime(e.date.year, e.date.month, e.date.day);
          final idx = d.difference(start).inDays;
          if (idx >= 0 && idx < len) v[idx] += e.amount;
        }
        return mk(v, (i) => '${i + 1}');
    }
  }

  // -------- Convenience filters (for drill-down sheets) --------
  static List<ExpenseItem> expensesByCategory(
    List<ExpenseItem> xs,
    String category,
  ) => xs
      .where(
        (e) =>
            resolveExpenseCategory(e).toLowerCase() == category.toLowerCase(),
      )
      .toList();

  static List<IncomeItem> incomesByCategory(
    List<IncomeItem> xs,
    String category,
  ) => xs
      .where(
        (i) => resolveIncomeCategory(i).toLowerCase() == category.toLowerCase(),
      )
      .toList();

  static List<ExpenseItem> expensesByMerchant(
    List<ExpenseItem> xs,
    String merchant,
  ) {
    final target = merchant.toLowerCase();
    return xs.where((e) {
      final raw = (e.counterparty ?? e.upiVpa ?? e.label ?? '').trim();
      if (raw.isEmpty) return false;
      final key = displayMerchantKey(raw).toLowerCase();
      return key == target;
    }).toList();
  }
}
