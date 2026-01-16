import 'dart:math';
import '../models/expense_item.dart';

class RecurringItem {
  final String key; // stable recurring key (merchant|last4)
  final String name; // display name (merchant/title)
  final String type; // "subscription" | "autopay" | "loan_emi"
  final double monthlyAmount; // approx monthly cost (avg or last)
  final DateTime lastDate;
  final DateTime nextDueDate;
  final int occurrences;
  final List<String> tags;

  RecurringItem({
    required this.key,
    required this.name,
    required this.type,
    required this.monthlyAmount,
    required this.lastDate,
    required this.nextDueDate,
    required this.tags,
    required this.occurrences,
  });
}

class CadenceDetector {
  static final _subMerchants = RegExp(
    r'\b(netflix|spotify|prime|hotstar|youtube premium|apple music|one|gold|swiggy one|zomato gold|adobe|microsoft|google|icloud|dropbox|notion|canva)\b',
    caseSensitive: false,
  );
  static final _loanKw = RegExp(
      r'\b(emi|loan|repayment|installment|instalment)\b',
      caseSensitive: false);
  static final _autopayKw = RegExp(
      r'\b(standing instruction|si|ecs|mandate|autopay|auto[- ]?debit|upi[- ]?auto)\b',
      caseSensitive: false);

  /// Detect monthly-like recurring spends from expenses.
  /// Looks ~180d back if you pass that slice.
  static List<RecurringItem> detect(List<ExpenseItem> expenses) {
    // group by merchant|cardLast4
    final groups = <String, List<ExpenseItem>>{};
    for (final e in expenses) {
      final merchant = _merchantOf(e);
      final last4 = (e.cardLast4 ?? '').trim();
      final key = '${merchant.toLowerCase()}|$last4';
      groups.putIfAbsent(key, () => []).add(e);
    }

    final out = <RecurringItem>[];
    groups.forEach((key, list) {
      if (list.length < 2) {
        return; // need at least 2 to consider recurring
      }
      list.sort((a, b) => a.date.compareTo(b.date));

      // build day intervals
      final diffs = <int>[];
      for (int i = 1; i < list.length; i++) {
        diffs.add(list[i].date.difference(list[i - 1].date).inDays.abs());
      }
      if (diffs.isEmpty) {
        return;
      }

      // median
      diffs.sort();
      final median = diffs.length.isOdd
          ? diffs[diffs.length ~/ 2]
          : ((diffs[diffs.length ~/ 2 - 1] + diffs[diffs.length ~/ 2]) / 2)
              .round();

      // consider monthly if ~27..34 days
      final isMonthly = median >= 27 && median <= 34;
      if (!isMonthly) {
        return;
      }

      // classify type from tags/notes
      final tagsUnion = <String>{};
      bool isLoan = false, isAutopay = false, isSubscription = false;
      for (final e in list) {
        final tags = e.tags ?? const [];
        tagsUnion.addAll(tags);
        final n = e.note.toLowerCase();
        isLoan |= tags.contains('loan_emi') || _loanKw.hasMatch(n);
        isAutopay |= tags.contains('autopay') || _autopayKw.hasMatch(n);
        isSubscription |=
            tags.contains('subscription') || _subMerchants.hasMatch(n);
      }
      String type;
      if (isLoan) {
        type = 'loan_emi';
      } else if (isSubscription) {
        type = 'subscription';
      } else if (isAutopay) {
        type = 'autopay';
      } else {
        type = 'subscription'; // default bucket
      }

      // approx amount (use avg of last 3 or last)
      final tail = list.sublist(max(0, list.length - 3));
      final monthly =
          tail.fold<double>(0.0, (a, b) => a + b.amount) / tail.length;

      final last = list.last.date;
      var next = last.add(Duration(days: median));
      // if next in past, keep adding median until future (handles catch-up)
      final today = DateTime.now();
      while (!next.isAfter(today)) {
        next = next.add(Duration(days: median));
      }

      out.add(RecurringItem(
        key: key,
        name: _merchantOf(list.last), // display title
        type: type,
        monthlyAmount: monthly,
        lastDate: last,
        nextDueDate: next,
        tags: tagsUnion.toList(),
        occurrences: list.length,
      ));
    });

    // sort by nextDueDate soonest first
    out.sort((a, b) => a.nextDueDate.compareTo(b.nextDueDate));
    return out;
  }

  static String _merchantOf(ExpenseItem e) {
    final meta = (e.toJson()['brainMeta'] as Map?)?.cast<String, dynamic>();
    final m = (meta != null ? (meta['merchant'] as String?) : null) ??
        e.label ??
        e.category ??
        '';
    if (m.trim().isNotEmpty) return _title(m.trim());
    // fallback: guess from note (first big token)
    final n = e.note;
    final m2 = RegExp(r'[A-Z][A-Z0-9&._-]{3,}').firstMatch(n.toUpperCase());
    if (m2 != null) return _title(m2.group(0)!);
    return 'Recurring';
  }

  static String _title(String s) => s
      .split(RegExp(r'\s+'))
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
      .join(' ');
}
