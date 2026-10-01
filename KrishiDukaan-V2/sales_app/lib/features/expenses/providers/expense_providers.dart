import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/auth_provider.dart';
import '../../../core/utils/date_range.dart';
import '../data/expense.dart';
import '../data/expense_repository.dart';

final expenseRepositoryProvider = Provider<ExpenseRepository>(
  (ref) => ExpenseRepository(),
);

/// Which window the Expenses tab is showing.
final expenseRangeProvider =
    NotifierProvider<ExpenseRangeNotifier, RangePreset>(
      ExpenseRangeNotifier.new,
    );

class ExpenseRangeNotifier extends Notifier<RangePreset> {
  @override
  RangePreset build() => RangePreset.thisMonth;
  void set(RangePreset preset) => state = preset;
}

final expensesProvider = FutureProvider<List<Expense>>((ref) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const [];
  final (from, to) = ref.watch(expenseRangeProvider).resolve();
  return ref.watch(expenseRepositoryProvider).inRange(uid, from, to);
});

final expensesInRangeProvider =
    FutureProvider.family<List<Expense>, RangePreset>((ref, preset) async {
      final uid = ref.watch(currentUidProvider);
      if (uid == null) return const [];
      final (from, to) = preset.resolve();
      return ref.watch(expenseRepositoryProvider).inRange(uid, from, to);
    });

/// Totals for the visible claims, split by review state — what the rep actually
/// wants to know: how much is still waiting on someone else.
class ExpenseTotals {
  final double total;
  final double pending;
  final double approved;
  final double rejected;
  final int count;

  const ExpenseTotals({
    required this.total,
    required this.pending,
    required this.approved,
    required this.rejected,
    required this.count,
  });

  factory ExpenseTotals.of(List<Expense> expenses) {
    double total = 0, pending = 0, approved = 0, rejected = 0;
    for (final e in expenses) {
      total += e.amount;
      switch (e.status) {
        case ExpenseStatus.pending:
          pending += e.amount;
        case ExpenseStatus.approved:
          approved += e.amount;
        case ExpenseStatus.rejected:
          rejected += e.amount;
      }
    }
    return ExpenseTotals(
      total: total,
      pending: pending,
      approved: approved,
      rejected: rejected,
      count: expenses.length,
    );
  }
}
