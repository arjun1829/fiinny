import '../models/transaction_model.dart';
import '../models/goal_model.dart';
import '../models/expense_item.dart';
import '../models/bank_account_model.dart';
import '../models/credit_card_model.dart';
import '../models/loan_model.dart';
import '../models/asset_model.dart'; // Ensure this matches file check
import 'transaction_engine.dart';
import 'pattern_engine.dart';
import 'behavior_engine.dart';
import 'goal_engine.dart';
import 'split_engine.dart';
import 'snapshot_models.dart';
import 'phase_one_progress.dart';

/// Immutable snapshot of the user's financial state after Phase One.
/// No logic is performed here; it only assembles outputs from the hardened engines.
class FiinnyUserSnapshot {
  final IncomeSummary incomeSummary;
  final ExpenseSummary expenseSummary;
  final TransactionInsights transactionInsights;
  final PatternSummary patterns;
  final BehaviorMetrics behavior;
  final GoalStatusSummary goals;
  final SplitStatusSummary splits;

  // Phase 6: Unified Financial Truth
  final EntityState entityState;

  final DateTime generatedAt;
  final PhaseOneProgress progress;

  const FiinnyUserSnapshot({
    required this.incomeSummary,
    required this.expenseSummary,
    required this.transactionInsights,
    required this.patterns,
    required this.behavior,
    required this.goals,
    required this.splits,
    required this.entityState,
    required this.generatedAt,
    required this.progress,
  });

  Map<String, dynamic> toJson() => {
        'incomeSummary': incomeSummary.toJson(),
        'expenseSummary': expenseSummary.toJson(),
        'transactionInsights': transactionInsights.toJson(),
        'patterns': patterns.toJson(),
        'behavior': behavior.toJson(),
        'goals': goals.toJson(),
        'splits': splits.toJson(),
        'entityState': entityState.toJson(),
        'generatedAt': generatedAt.toIso8601String(),
        'progress': progress.progressPercentage,
      };

  /// Factory to generate a snapshot from raw data.
  /// This method only orchestrates calls to existing engines and aggregates results.
  static FiinnyUserSnapshot generate({
    required List<TransactionModel> transactions,
    required List<GoalModel> goals,
    required List<ExpenseItem> expenses,

    // Phase 6: Entity State Inputs (Optional for back-compat)
    List<BankAccountModel> bankAccounts = const [],
    List<CreditCardModel> creditCards = const [],
    List<LoanModel> loans = const [],
    List<AssetModel> assets = const [],
    String myUserId = 'me',
  }) {
    // ---- Transaction classification ----
    double incomeTotal = 0;
    double salaryIncome = 0;
    double expenseTotal = 0;
    double transferTotal = 0;
    int incomeCount = 0;
    int expenseCount = 0;
    int transferCount = 0;
    final Map<String, int> categoryCounts = {};

    for (var t in transactions) {
      final classification = TransactionEngine.analyze(t);
      // Count categories for insights
      categoryCounts.update(classification.category, (c) => c + 1,
          ifAbsent: () => 1);

      if (classification.isTransfer) {
        transferTotal += t.amount;
        transferCount++;
        continue;
      }

      if (classification.isIncome) {
        incomeTotal += t.amount;
        incomeCount++;
        if (classification.isSalary) {
          salaryIncome += t.amount;
        }
      } else {
        expenseTotal += t.amount;
        expenseCount++;
      }
    }

    // ---- Assemble summary objects ----
    final incomeSummary = IncomeSummary(
      total: incomeTotal,
      salaryIncome: salaryIncome,
      otherIncome: incomeTotal - salaryIncome,
      transactionCount: incomeCount,
    );

    final expenseSummary = ExpenseSummary(
      total: expenseTotal,
      transferAmount: transferTotal,
      transactionCount: expenseCount,
      transferCount: transferCount,
    );

    final transactionInsights = TransactionInsights(
      categoryBreakdown: categoryCounts,
      totalTransactions: transactions.length,
      incomeTransactions: incomeCount,
      expenseTransactions: expenseCount,
      transferTransactions: transferCount,
    );

    // ---- Engine analyses that operate on the raw lists ----
    final patternReport = PatternEngine.analyze(transactions, incomeTotal);
    final patterns = PatternSummary(
      subscriptions: patternReport.subscriptions,
      highSpendCategories: patternReport.highSpendCategories,
      categorySpendPercentage: patternReport.categorySpendPercentage,
    );

    final behaviorReport = BehaviorEngine.analyze(incomeTotal, expenseTotal);
    final behavior = BehaviorMetrics(
      savingsRate: behaviorReport.savingsRate,
      expenseToIncomeRatio: behaviorReport.expenseToIncomeRatio,
      riskFlags: behaviorReport.riskFlags,
    );

    // Goal status – use monthly savings derived from income/expense
    double monthlySavings = 0;
    if (transactions.isNotEmpty) {
      // Treat the provided list as one month for simplicity.
      monthlySavings = incomeTotal - expenseTotal;
    }
    final goalReports =
        goals.map((g) => GoalEngine.checkStatus(g, monthlySavings)).toList();
    final goalsSummary = GoalStatusSummary(
      goals: goalReports,
      totalGoals: goalReports.length,
      onTrackGoals: goalReports.where((r) => r.onTrack).length,
      offTrackGoals: goalReports.where((r) => !r.onTrack).length,
    );

    final splitReport = SplitEngine.calculate(expenses, myUserId);

    // Calculate derived split metrics
    double totalOwedToYou = 0;
    double totalYouOwe = 0;
    splitReport.netBalances.forEach((friendId, balance) {
      if (balance > 0) {
        totalOwedToYou += balance;
      } else {
        totalYouOwe += balance.abs();
      }
    });

    final splits = SplitStatusSummary(
      netBalances: splitReport.netBalances,
      totalOwedToYou: totalOwedToYou,
      totalYouOwe: totalYouOwe,
      friendCount: splitReport.netBalances.length,
    );

    // ---- Phase 6: Entity State Calculation ----
    double totalAcctBalance = 0;
    final acctBalances = <EntityBalance>[];
    for (var b in bankAccounts) {
      final val = b.currentBalance ?? 0.0;
      totalAcctBalance += val;
      acctBalances.add(EntityBalance(
          entityId: b.id, name: b.bankName, currentBalance: val, type: 'bank'));
    }

    double totalAssetValue = 0;
    final assetBalances = <EntityBalance>[];
    for (var a in assets) {
      final val = a.value; // Corrected from currentValue
      totalAssetValue += val;
      assetBalances.add(EntityBalance(
          entityId: a.id ?? 'unknown',
          name: a.title, // Corrected from name
          currentBalance: val,
          type: 'asset'));
    }

    double totalLoansOutstanding = 0;
    final loanBalances = <EntityBalance>[];
    for (var l in loans) {
      // Logic: For unified truth, we want Actual Outstanding > Amount.
      // If outstandingPrincipal is tracked (from SMS/Manual update), use it.
      // Else fallback to original amount (conservative fallback).
      final val = l.outstandingPrincipal ?? (l.isClosed ? 0.0 : l.amount);
      if (!l.isClosed) {
        totalLoansOutstanding += val;
        loanBalances.add(EntityBalance(
            entityId: l.id ?? 'loan',
            name: l.title,
            currentBalance:
                val, // Debt is stored positive here (amount you owe)
            type: 'loan'));
      }
    }

    double totalCCDebt = 0;
    double totalCCLimit = 0;
    final ccBalances = <EntityBalance>[];
    for (var c in creditCards) {
      // Logic: Debt is "Total Due" or "Current Outstanding Balance".
      // Prefer currentBalance if positive (often tracked as 'Spent').
      // Else use totalDue.
      final val = c.currentBalance ?? c.totalDue;
      if (val > 0) {
        totalCCDebt += val;
      }
      if (c.creditLimit != null) totalCCLimit += c.creditLimit!;

      ccBalances.add(EntityBalance(
          entityId: c.id,
          name: c.bankName,
          currentBalance: val, // Owed
          limit: c.creditLimit,
          type: 'credit_card'));
    }

    // Derived Metrics
    // Net Worth = (Cash + Assets) - (Loans + CC Debt)
    // Note: 'totalYouOwe' from splits is informal debt, often excluded from formal Net Worth unless huge.
    // We will exclude friend-debt for now to match 'Financial Institution' view.
    final netWorth = (totalAcctBalance + totalAssetValue) -
        (totalLoansOutstanding + totalCCDebt);

    // Liquid Cash = Bank Accounts + Assets tagged as 'Cash' (simplified to just Bank for now)
    final liquidCash = totalAcctBalance;

    final totalDebt = totalLoansOutstanding + totalCCDebt;

    double util = 0;
    if (totalCCLimit > 0) {
      util = totalCCDebt / totalCCLimit;
    }

    // Safe to Spend = Liquid Cash - Total Goal Saved Amount
    // This assumes provided 'goals' have updated 'savedAmount'
    final totalGoalSaved =
        goals.fold<double>(0.0, (sum, g) => sum + g.savedAmount);
    final safeToSpend = liquidCash - totalGoalSaved;

    final entityState = EntityState(
      netWorth: netWorth,
      liquidCash: liquidCash,
      totalDebt: totalDebt,
      safeToSpend: safeToSpend, // New metric
      creditUtilizationInfo: util,
      bankAccounts: acctBalances,
      creditCards: ccBalances,
      loans: loanBalances,
      assets: assetBalances,
    );

    return FiinnyUserSnapshot(
      incomeSummary: incomeSummary,
      expenseSummary: expenseSummary,
      transactionInsights: transactionInsights,
      patterns: patterns,
      behavior: behavior,
      goals: goalsSummary, // Corrected from goals
      splits: splits,
      entityState: entityState,
      generatedAt: DateTime.now(),
      progress: PhaseOneProgress.current(),
    );
  }
}
