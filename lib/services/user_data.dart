import '../models/income_item.dart';
import '../models/expense_item.dart';
import '../models/goal_model.dart';
import '../models/loan_model.dart';
import '../models/asset_model.dart';

class UserData {
  List<IncomeItem> incomes;
  List<ExpenseItem> expenses;
  List<GoalModel> goals;
  List<LoanModel> loans;
  List<AssetModel> assets;

  double? creditCardBill; // 💳 Used for insights, reminders, etc.
  double weeklyLimit;     // 🛡️ Survival/spending threshold
  DateTime currentWeekStart;

  UserData({
    required this.incomes,
    required this.expenses,
    required this.goals,
    this.loans = const [],
    this.assets = const [],
    this.creditCardBill,
    this.weeklyLimit = 2800,
    DateTime? currentWeekStartOverride,
  }) : currentWeekStart = currentWeekStartOverride ?? _getStartOfWeek();

  // --- Aggregation & analytics ---

  double getTotalIncome() => incomes.fold(0.0, (sum, item) => sum + item.amount);

  double getTotalExpenses() => expenses.fold(0.0, (sum, item) => sum + item.amount);

  double getSavings() => getTotalIncome() - getTotalExpenses();

  double getSpendingRatio() {
    final income = getTotalIncome();
    final expense = getTotalExpenses();
    if (income == 0) return 0;
    return (expense / income).clamp(0, 1);
  }

  double getCategoryExpense(String category) {
    return expenses
        .where((e) => e.type.toLowerCase() == category.toLowerCase())
        .fold(0.0, (sum, item) => sum + item.amount);
  }

  double getWeeklySpending() {
    return expenses
        .where((e) => e.date.isAfter(currentWeekStart))
        .fold(0.0, (sum, item) => sum + item.amount);
  }

  double getTotalAssetValue() {
    return assets.fold(0.0, (sum, item) => sum + item.value);
  }

  double getTotalLoanValue({bool openOnly = true}) {
    if (openOnly) {
      return loans
          .where((l) => !(l.isClosed ?? false))
          .fold(0.0, (sum, item) => sum + item.amount);
    }
    return loans.fold(0.0, (sum, item) => sum + item.amount);
  }

  // --- Weekly budgeting/threshholds ---
  void setWeeklyLimit(double limit) => weeklyLimit = limit;

  bool isWeeklyLimitExceeded() {
    return getWeeklySpending() > weeklyLimit;
  }

  // --- Helper for starting week (Monday) ---
  static DateTime _getStartOfWeek() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
  }

  // --- Serialization for easy backup or sync (optional) ---
  Map<String, dynamic> toJson() => {
    'incomes': incomes.map((e) => e.toJson()).toList(),
    'expenses': expenses.map((e) => e.toJson()).toList(),
    'goals': goals.map((e) => e.toJson()).toList(),
    'loans': loans.map((e) => e.toJson()).toList(),
    'assets': assets.map((e) => e.toJson()).toList(),
    'creditCardBill': creditCardBill,
    'weeklyLimit': weeklyLimit,
    'currentWeekStart': currentWeekStart.toIso8601String(),
  };

  static UserData fromJson(Map<String, dynamic> json) => UserData(
    incomes: (json['incomes'] as List).map((e) => IncomeItem.fromJson(e)).toList(),
    expenses: (json['expenses'] as List).map((e) => ExpenseItem.fromJson(e)).toList(),
    goals: (json['goals'] as List).map((e) => GoalModel.fromJson(e)).toList(),
    loans: (json['loans'] as List).map((e) => LoanModel.fromJson(e)).toList(),
    assets: (json['assets'] as List).map((e) => AssetModel.fromJson(e)).toList(),
    creditCardBill: json['creditCardBill']?.toDouble(),
    weeklyLimit: json['weeklyLimit']?.toDouble() ?? 2800,
    currentWeekStartOverride: json['currentWeekStart'] != null
        ? DateTime.parse(json['currentWeekStart'])
        : null,
  );
}
