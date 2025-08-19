import '../models/insight_model.dart';
import '../services/user_data.dart';
import 'firebase_insight_service.dart';
import '../models/income_item.dart';
import '../models/expense_item.dart';
import '../models/goal_model.dart';
import '../models/loan_model.dart';
import '../models/asset_model.dart';
import '../services/notification_service.dart';

class FiinnyBrainService {
  static final _firebaseService = FirebaseInsightService();

  /// ✅ Step 1: Convert live data to UserData for brain processing
  static Future<UserData> createFromLiveData(
      String userId, {
        List<IncomeItem> incomes = const [],
        List<ExpenseItem> expenses = const [],
        List<GoalModel> goals = const [],
        List<LoanModel> loans = const [],
        List<AssetModel> assets = const [],
        double? creditCardBill,
        double? overrideWeeklyLimit,
      }) async {
    double? autoBill = creditCardBill;
    if (autoBill == null) {
      try {
        final billExpenses = expenses.where((e) =>
        e.type.toLowerCase().contains('credit card') &&
            (e.type.toLowerCase().contains('bill') || e.type.toLowerCase() == 'credit card'));
        if (billExpenses.isNotEmpty) {
          autoBill = billExpenses.reduce((a, b) => a.date.isAfter(b.date) ? a : b).amount;
        }
      } catch (_) {}
    }

    return UserData(
      incomes: incomes,
      expenses: expenses,
      goals: goals,
      loans: loans,
      assets: assets,
      creditCardBill: autoBill,
      currentWeekStartOverride: null,
    )..setWeeklyLimit(overrideWeeklyLimit ?? 2800);
  }

  /// ✅ Step 2: Generate insights from UserData
  static List<InsightModel> generateInsights(
      UserData userData, {
        String? userId,
      }) {
    List<InsightModel> insights = [];

    // 1. Overspending
    if (userData.getSpendingRatio() > 0.8) {
      insights.add(_createInsight(
        title: "🚨 High Spending Alert",
        description: "You've used over 80% of your income!",
        type: InsightType.critical,
        userId: userId,
        category: "expense",
        severity: 3,
      ));
    }

    // 2. Food Expense
    final foodExpense = userData.getCategoryExpense("Food");
    if (foodExpense > 5000) {
      insights.add(_createInsight(
        title: "🍕 Food Spending Spike",
        description: "You've spent ₹${foodExpense.toStringAsFixed(0)} on food!",
        type: InsightType.warning,
        userId: userId,
        category: "expense",
        severity: 2,
      ));
    }

    // 3. Credit Card Debt
    if (userData.creditCardBill != null && userData.creditCardBill! > 0) {
      insights.add(_createInsight(
        title: "💳 Credit Card Bill Alert",
        description: "Outstanding bill of ₹${userData.creditCardBill!.toStringAsFixed(0)} detected.",
        type: InsightType.critical,
        userId: userId,
        category: "expense",
        severity: 3,
      ));
    }

    // 4. Weekly limit breached
    final spent = userData.getWeeklySpending();
    if (spent > userData.weeklyLimit) {
      insights.add(_createInsight(
        title: "⚠️ Over Weekly Limit",
        description: "You've crossed your weekly limit of ₹${userData.weeklyLimit}!",
        type: InsightType.warning,
        userId: userId,
        category: "expense",
        severity: 2,
      ));
    }

    // 5. Crisis Mode Breach
    if (spent > userData.weeklyLimit * 1.2) {
      insights.add(_createInsight(
        title: "🛑 Crisis Mode Breach",
        description: "You're spending 20% more than your crisis limit. Consider slowing down!",
        type: InsightType.critical,
        userId: userId,
        category: "expense",
        severity: 3,
      ));
      if (userId != null) {
        NotificationService().showNotification(
          title: "⚠️ Crisis Mode Breach",
          body: "You're 20% over your weekly limit. Spend cautiously!",
        );
      }

    }

    // 6. Loans: Open Loan Alerts
    if (userData.loans.isNotEmpty) {
      final openLoans = userData.loans.where((l) => !(l.isClosed ?? false)).toList();
      for (final loan in openLoans) {
        // EMI due date soon (if dueDate is set and < 7 days away)
        if (loan.dueDate != null) {
          final daysLeft = loan.dueDate!.difference(DateTime.now()).inDays;
          if (daysLeft >= 0 && daysLeft <= 7) {
            insights.add(_createInsight(
              title: "⏳ EMI Due Soon",
              description: "Loan '${loan.title}' EMI/due in $daysLeft days.",
              type: InsightType.warning,
              userId: userId,
              category: "loan",
              severity: 2,
              relatedLoanId: loan.id,
            ));
          }
        }
        // High interest rate
        if (loan.interestRate != null && loan.interestRate! > 18) {
          insights.add(_createInsight(
            title: "💸 High Interest Alert",
            description: "Loan '${loan.title}' has a high interest rate (${loan.interestRate?.toStringAsFixed(1)}%).",
            type: InsightType.warning,
            userId: userId,
            category: "loan",
            severity: 2,
            relatedLoanId: loan.id,
          ));
        }
      }

      // Many open loans
      if (openLoans.length > 2) {
        insights.add(_createInsight(
          title: "⚠️ Multiple Open Loans",
          description: "You have ${openLoans.length} open loans. Consider closing some.",
          type: InsightType.info,
          userId: userId,
          category: "loan",
          severity: 1,
        ));
      }
    } else {
      // Debt free!
      insights.add(_createInsight(
        title: "🎉 You’re Debt-Free!",
        description: "Congratulations, you have no active loans. Keep it up!",
        type: InsightType.positive,
        userId: userId,
        category: "loan",
        severity: 0,
      ));
    }

    // 7. Assets: Asset growth
    if (userData.assets.isNotEmpty) {
      double totalAssetValue = userData.assets.fold(0.0, (a, b) => a + (b.value));
      if (totalAssetValue > 0) {
        insights.add(_createInsight(
          title: "🏦 Wealth Update",
          description: "Your assets are now worth ₹${totalAssetValue.toStringAsFixed(0)}.",
          type: InsightType.info,
          userId: userId,
          category: "asset",
          severity: 1,
        ));
      }
    }

    // 8. Goal Progress
    for (final goal in userData.goals) {
      if (goal.targetAmount > 0 && goal.savedAmount > 0) {
        final percent = (goal.savedAmount / goal.targetAmount * 100).clamp(0, 100).toStringAsFixed(1);
        insights.add(_createInsight(
          title: "🎯 Goal Progress: ${goal.title}",
          description: "You have saved $percent% of your goal '${goal.title}'.",
          type: double.tryParse(percent) == 100.0
              ? InsightType.positive
              : InsightType.info,
          userId: userId,
          category: "goal",
          severity: double.tryParse(percent) == 100.0 ? 0 : 1,
          relatedGoalId: goal.id,
        ));
      }
    }

    // 9. Net Worth
    final totalAssets = userData.assets.fold(0.0, (a, b) => a + (b.value));
    final totalLoan = userData.loans
        .where((l) => !(l.isClosed ?? false))
        .fold(0.0, (a, b) => a + b.amount);
    final netWorth = totalAssets - totalLoan;
    insights.add(_createInsight(
      title: "💡 Net Worth Update",
      description: "Your net worth is ₹${netWorth.toStringAsFixed(0)}.",
      type: netWorth >= 0 ? InsightType.positive : InsightType.warning,
      userId: userId,
      category: "netWorth",
      severity: netWorth >= 0 ? 0 : 2,
    ));

    return insights;
  }

  /// 🔧 Utility to create & optionally save insight
  static InsightModel _createInsight({
    required String title,
    required String description,
    required InsightType type,
    String? userId,
    String? category,
    int? severity,
    String? relatedLoanId,
    String? relatedAssetId,
    String? relatedGoalId,
  }) {
    final insight = InsightModel(
      title: title,
      description: description,
      type: type,
      timestamp: DateTime.now(),
      userId: userId,
      category: category,
      severity: severity,
      relatedLoanId: relatedLoanId,
      relatedAssetId: relatedAssetId,
      relatedGoalId: relatedGoalId,
    );

    if (userId != null) {
      _firebaseService.saveInsight(userId, insight);
    }

    return insight;
  }
}
