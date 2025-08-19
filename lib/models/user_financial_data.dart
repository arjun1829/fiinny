// models/user_financial_data.dart

import 'income_item.dart';
import 'expense_item.dart';
import 'goal_model.dart';
import 'loan_model.dart';
import 'asset_model.dart';
import 'credit_card_model.dart';
import 'bill_model.dart';

class UserFinancialData {
  final List<IncomeItem> incomes;
  final List<ExpenseItem> expenses;
  final List<GoalModel> goals;
  final List<LoanModel> loans;
  final List<AssetModel> assets;
  final List<CreditCardModel> creditCards; // New
  final List<BillModel> bills;             // New

  final double? creditCardBill; // Optional
  final double weeklyLimit;
  final DateTime currentWeekStart;

  UserFinancialData({
    this.incomes = const [],
    this.expenses = const [],
    this.goals = const [],
    this.loans = const [],
    this.assets = const [],
    this.creditCards = const [],
    this.bills = const [],
    this.creditCardBill,
    this.weeklyLimit = 2800,
    DateTime? currentWeekStart,
  }) : currentWeekStart = currentWeekStart ?? _getStartOfWeek();

  factory UserFinancialData.fromJson(Map<String, dynamic> json) {
    return UserFinancialData(
      incomes: (json['incomes'] as List<dynamic>?)
          ?.map((e) => IncomeItem.fromJson(e))
          .toList() ??
          [],
      expenses: (json['expenses'] as List<dynamic>?)
          ?.map((e) => ExpenseItem.fromJson(e))
          .toList() ??
          [],
      goals: (json['goals'] as List<dynamic>?)
          ?.map((e) => GoalModel.fromJson(e))
          .toList() ??
          [],
      loans: (json['loans'] as List<dynamic>?)
          ?.map((e) => LoanModel.fromJson(e))
          .toList() ??
          [],
      assets: (json['assets'] as List<dynamic>?)
          ?.map((e) => AssetModel.fromJson(e))
          .toList() ??
          [],
      creditCards: (json['creditCards'] as List<dynamic>?)
          ?.map((e) => CreditCardModel.fromJson(e))
          .toList() ??
          [],
      bills: (json['bills'] as List<dynamic>?)
          ?.map((e) => BillModel.fromJson(e))
          .toList() ??
          [],
      creditCardBill: (json['creditCardBill'] as num?)?.toDouble(),
      weeklyLimit: (json['weeklyLimit'] as num?)?.toDouble() ?? 2800,
      currentWeekStart: json['currentWeekStart'] != null
          ? DateTime.parse(json['currentWeekStart'])
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'incomes': incomes.map((e) => e.toJson()).toList(),
    'expenses': expenses.map((e) => e.toJson()).toList(),
    'goals': goals.map((e) => e.toJson()).toList(),
    'loans': loans.map((e) => e.toJson()).toList(),
    'assets': assets.map((e) => e.toJson()).toList(),
    'creditCards': creditCards.map((e) => e.toJson()).toList(),
    'bills': bills.map((e) => e.toJson()).toList(),
    'creditCardBill': creditCardBill,
    'weeklyLimit': weeklyLimit,
    'currentWeekStart': currentWeekStart.toIso8601String(),
  };

  static DateTime _getStartOfWeek() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
  }
}
