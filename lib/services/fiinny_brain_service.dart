import '../models/insight_model.dart';
import '../services/user_data.dart';
import 'firebase_insight_service.dart';
import '../models/income_item.dart';
import '../models/expense_item.dart';
import '../models/goal_model.dart';
import '../models/loan_model.dart';
import '../models/asset_model.dart';
import '../services/notification_service.dart';
import '../services/notif_prefs_service.dart';

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
            (e.type.toLowerCase().contains('bill') ||
                e.type.toLowerCase() == 'credit card'));
        if (billExpenses.isNotEmpty) {
          autoBill = billExpenses
              .reduce((a, b) => a.date.isAfter(b.date) ? a : b)
              .amount;
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
  static const int _criticalSeverity = 3;
  static const Map<String, int> _channelThresholds = {
    'overspend_alerts': 2,
    'brain_insights': 1,
    'loan_watch': 1,
    'goal_milestones': 1,
    'networth_updates': 1,
  };

  static List<InsightModel> generateInsights(
    UserData userData, {
    String? userId,
    String currencySymbol = '₹',
  }) {
    final insights = <InsightModel>[];

    final totalIncome = userData.getTotalIncome();
    final totalExpenses = userData.getTotalExpenses();
    final savings = userData.getSavings();
    final spendingRatio = totalIncome == 0
        ? 0.0
        : (totalExpenses / totalIncome).clamp(0.0, double.infinity);

    if (totalIncome > 0 && spendingRatio >= 1.0) {
      insights.add(_createInsight(
        title: '🔥 Spending exceeds income',
        description:
            'Your expenses of $currencySymbol${totalExpenses.toStringAsFixed(0)} are outpacing your income of $currencySymbol${totalIncome.toStringAsFixed(0)}.',
        type: InsightType.critical,
        userId: userId,
        category: 'expense',
        severity: _criticalSeverity,
      ));
    }

    if (spendingRatio > 0.8) {
      insights.add(_createInsight(
        title: '🚨 High spending alert',
        description:
            "You've used ${(spendingRatio * 100).toStringAsFixed(0)}% of your income this month.",
        type: InsightType.critical,
        userId: userId,
        category: 'expense',
        severity: _criticalSeverity,
      ));
    }

    if (totalExpenses > 0 && spendingRatio <= 0.5) {
      insights.add(_createInsight(
        title: '👏 Great budgeting streak',
        description:
            "You're tracking well — only ${(spendingRatio * 100).toStringAsFixed(0)}% of income spent so far.",
        type: InsightType.positive,
        userId: userId,
        category: 'expense',
        severity: 0,
      ));
    }

    final foodExpense = userData.getCategoryExpense('Food');
    if (foodExpense > 0) {
      final foodShare = totalIncome == 0 ? 0.0 : foodExpense / totalIncome;
      if (foodExpense > 5000 || foodShare > 0.25) {
        insights.add(_createInsight(
          title: '🍕 Food spending spike',
          description:
              "You've spent $currencySymbol${foodExpense.toStringAsFixed(0)} on food — that's ${(foodShare * 100).toStringAsFixed(0)}% of income.",
          type: InsightType.warning,
          userId: userId,
          category: 'expense',
          severity: 2,
        ));
      } else if (foodShare > 0.15) {
        insights.add(_createInsight(
          title: '🍲 Food is your top treat',
          description:
              'Food spends are ${(foodShare * 100).toStringAsFixed(0)}% of income. Set a cap if that feels high.',
          type: InsightType.info,
          userId: userId,
          category: 'expense',
          severity: 1,
        ));
      }
    }

    if (userData.creditCardBill != null && userData.creditCardBill! > 0) {
      final bill = userData.creditCardBill!;
      final severe = bill >= 10000 ? _criticalSeverity : 2;
      insights.add(_createInsight(
        title: '💳 Credit card bill alert',
        description:
            'Outstanding card bill of $currencySymbol${bill.toStringAsFixed(0)} detected.',
        type: severe >= _criticalSeverity
            ? InsightType.critical
            : InsightType.warning,
        userId: userId,
        category: 'credit_card',
        severity: severe,
      ));
    }

    final weeklySpent = userData.getWeeklySpending();
    if (weeklySpent > userData.weeklyLimit) {
      insights.add(_createInsight(
        title: '⚠️ Weekly limit crossed',
        description:
            "You've crossed your weekly limit of $currencySymbol${userData.weeklyLimit.toStringAsFixed(0)} by spending $currencySymbol${weeklySpent.toStringAsFixed(0)}.",
        type: InsightType.warning,
        userId: userId,
        category: 'expense',
        severity: 2,
      ));
    }
    if (weeklySpent > userData.weeklyLimit * 1.2) {
      insights.add(_createInsight(
        title: '🛑 Crisis mode breach',
        description:
            "You're spending 20% more than your crisis limit. Pull back this week.",
        type: InsightType.critical,
        userId: userId,
        category: 'expense',
        severity: _criticalSeverity,
      ));
    }

    final subscriptionExpenses =
        userData.expenses.where(_looksLikeSubscription).toList();
    if (subscriptionExpenses.isNotEmpty) {
      final subsTotal = subscriptionExpenses.fold<double>(
          0.0, (sum, item) => sum + item.amount);
      final shareOfIncome = totalIncome == 0 ? 0.0 : subsTotal / totalIncome;
      final severity =
          shareOfIncome > 0.25 || subscriptionExpenses.length >= 5 ? 2 : 1;
      insights.add(_createInsight(
        title: '📺 Subscriptions check-in',
        description:
            '${subscriptionExpenses.length} active subscriptions total $currencySymbol${subsTotal.toStringAsFixed(0)} / month.',
        type: severity >= 2 ? InsightType.warning : InsightType.info,
        userId: userId,
        category: 'subscription',
        severity: severity,
      ));
    }

    final topCategory = _topCategory(userData.expenses);
    if (topCategory != null && totalExpenses > 0) {
      final share = (topCategory.value / totalExpenses).clamp(0.0, 1.0);
      if (share >= 0.35) {
        insights.add(_createInsight(
          title: '🏷️ ${topCategory.key} dominates spending',
          description:
              '${(share * 100).toStringAsFixed(0)}% of your spends are in ${topCategory.key}. Consider trimming.',
          type: InsightType.warning,
          userId: userId,
          category: 'expense',
          severity: 2,
        ));
      }
    }

    if (savings > 0) {
      insights.add(_createInsight(
        title: '💚 You are saving',
        description:
            'Saved $currencySymbol${savings.toStringAsFixed(0)} this month. Keep it rolling!',
        type: InsightType.positive,
        userId: userId,
        category: 'expense',
        severity: 0,
      ));
    } else if (savings < 0) {
      insights.add(_createInsight(
        title: '📉 Spending more than you earn',
        description:
            'You are short by $currencySymbol${savings.abs().toStringAsFixed(0)} this month. Plan a catch-up.',
        type: InsightType.warning,
        userId: userId,
        category: 'expense',
        severity: 2,
      ));
    }

    final openLoans =
        userData.loans.where((l) => !(l.isClosed ?? false)).toList();
    if (openLoans.isNotEmpty) {
      final now = DateTime.now();
      for (final loan in openLoans) {
        if (loan.dueDate != null) {
          final daysLeft = loan.dueDate!.difference(now).inDays;
          if (daysLeft >= 0 && daysLeft <= 7) {
            insights.add(_createInsight(
              title: '⏳ EMI due soon',
              description: "Loan '${loan.title}' is due in $daysLeft days.",
              type: InsightType.warning,
              userId: userId,
              category: 'loan',
              severity: 2,
              relatedLoanId: loan.id,
            ));
          }
        }
        if (loan.interestRate != null && loan.interestRate! > 18) {
          insights.add(_createInsight(
            title: '💸 High interest alert',
            description:
                "Loan '${loan.title}' has a high interest rate (${loan.interestRate?.toStringAsFixed(1)}%).",
            type: InsightType.warning,
            userId: userId,
            category: 'loan',
            severity: 2,
            relatedLoanId: loan.id,
          ));
        }
        if ((loan.reminderEnabled ?? true) == false) {
          insights.add(_createInsight(
            title: '🔔 Enable reminders?',
            description:
                "Add a reminder for '${loan.title}' so EMIs aren't missed.",
            type: InsightType.info,
            userId: userId,
            category: 'loan',
            severity: 1,
            relatedLoanId: loan.id,
          ));
        }
      }

      if (openLoans.length > 2) {
        insights.add(_createInsight(
          title: '⚠️ Multiple open loans',
          description:
              'You have ${openLoans.length} active loans. Prioritise repayments to reduce stress.',
          type: InsightType.info,
          userId: userId,
          category: 'loan',
          severity: 1,
        ));
      }
    } else {
      insights.add(_createInsight(
        title: '🎉 You’re debt-free',
        description: 'Congratulations, you have no active loans. Keep it up!',
        type: InsightType.positive,
        userId: userId,
        category: 'loan',
        severity: 0,
      ));
    }

    if (userData.assets.isNotEmpty) {
      final totalAssetValue =
          userData.assets.fold<double>(0.0, (sum, a) => sum + a.value);
      if (totalAssetValue > 0) {
        insights.add(_createInsight(
          title: '🏦 Wealth update',
          description:
              'Assets tracked at $currencySymbol${totalAssetValue.toStringAsFixed(0)}.',
          type: InsightType.info,
          userId: userId,
          category: 'asset',
          severity: 1,
        ));
      }
    } else {
      insights.add(_createInsight(
        title: '📈 Track your assets',
        description: 'Add investments and property to see true net worth.',
        type: InsightType.info,
        userId: userId,
        category: 'asset',
        severity: 1,
      ));
    }

    for (final goal in userData.goals) {
      if (goal.status == GoalStatus.archived) {
        continue;
      }
      final progressPct = (goal.progress * 100).clamp(0, 100);
      if (goal.isAchieved) {
        insights.add(_createInsight(
          title: '🎯 Goal complete: ${goal.title}',
          description: "You’ve hit 100% of '${goal.title}'. Time to celebrate!",
          type: InsightType.positive,
          userId: userId,
          category: 'goal',
          severity: 0,
          relatedGoalId: goal.id,
        ));
        continue;
      }

      if (goal.daysRemaining <= 30 && progressPct < 75) {
        insights.add(_createInsight(
          title: '⏰ Goal at risk: ${goal.title}',
          description:
              '${goal.daysRemaining} days left. Save $currencySymbol${goal.requiredPerMonth.toStringAsFixed(0)} per month to catch up.',
          type: InsightType.warning,
          userId: userId,
          category: 'goal',
          severity: 2,
          relatedGoalId: goal.id,
        ));
      } else if (progressPct >= 50) {
        insights.add(_createInsight(
          title: '💪 Halfway there: ${goal.title}',
          description:
              "${progressPct.toStringAsFixed(1)}% saved. Keep the momentum!",
          type: InsightType.info,
          userId: userId,
          category: 'goal',
          severity: 1,
          relatedGoalId: goal.id,
        ));
      }
    }

    final totalAssets =
        userData.assets.fold<double>(0.0, (sum, a) => sum + a.value);
    final totalLoan = openLoans.fold<double>(0.0, (sum, l) => sum + l.amount);
    final netWorth = totalAssets - totalLoan;
    insights.add(_createInsight(
      title: '💡 Net worth update',
      description:
          'Your net worth is $currencySymbol${netWorth.toStringAsFixed(0)}.',
      type: netWorth >= 0 ? InsightType.positive : InsightType.warning,
      userId: userId,
      category: 'netWorth',
      severity: netWorth >= 0 ? 0 : 2,
    ));

    return insights;
  }

  static Future<List<InsightModel>> generateInsightsAndNotify(
    UserData userData, {
    required String userId,
    Map<String, dynamic>? notificationPrefs,
    bool respectQuietHours = true,
    bool sendNotifications = true,
    String currencySymbol = '₹',
  }) async {
    final insights = generateInsights(userData,
        userId: userId, currencySymbol: currencySymbol);
    if (!sendNotifications) {
      return insights;
    }

    final prefs = notificationPrefs != null
        ? NotifPrefsService.resolveWithDefaults(notificationPrefs)
        : await NotifPrefsService.fetchForUser(userId);

    final pushEnabled = (prefs['push_enabled'] as bool?) ?? true;
    if (!pushEnabled) {
      return insights;
    }

    final channels = Map<String, dynamic>.from(prefs['channels'] ?? {});
    final quiet = Map<String, dynamic>.from(prefs['quiet_hours'] ?? {});
    final inQuiet =
        respectQuietHours && _isWithinQuietHours(DateTime.now(), quiet);

    for (final insight in insights) {
      final channelKey = _channelForInsight(insight);
      if (channelKey == null) {
        continue;
      }
      if (!(channels[channelKey] as bool? ?? false)) {
        continue;
      }

      final severity = insight.severity ?? 0;
      final threshold = _channelThresholds[channelKey] ?? 0;
      if (severity < threshold) {
        continue;
      }
      if (inQuiet && severity < _criticalSeverity) {
        continue;
      }

      final payload = _payloadForInsight(insight);
      await NotificationService().showNotification(
        title: insight.title,
        body: insight.description,
        payload: payload,
      );
    }

    return insights;
  }

  static String? _channelForInsight(InsightModel insight) {
    final category = (insight.category ?? '').toLowerCase();
    switch (category) {
      case 'expense':
        return (insight.severity ?? 0) >= 2
            ? 'overspend_alerts'
            : 'brain_insights';
      case 'credit_card':
      case 'bill':
        return 'overspend_alerts';
      case 'loan':
        return 'loan_watch';
      case 'goal':
        return 'goal_milestones';
      case 'asset':
      case 'networth':
        return 'networth_updates';
      case 'subscription':
        return 'brain_insights';
      default:
        return 'brain_insights';
    }
  }

  static String? _payloadForInsight(InsightModel insight) {
    final userId = insight.userId ?? '';
    switch ((insight.category ?? '').toLowerCase()) {
      case 'loan':
        return _buildPayload('loans', {
          if (userId.isNotEmpty) 'uid': userId,
          if ((insight.relatedLoanId ?? '').isNotEmpty)
            'loanId': insight.relatedLoanId!,
        });
      case 'goal':
        return _buildPayload('goals', {
          if (userId.isNotEmpty) 'uid': userId,
          if ((insight.relatedGoalId ?? '').isNotEmpty)
            'goalId': insight.relatedGoalId!,
        });
      case 'asset':
      case 'networth':
        return _buildPayload('assets', {
          if (userId.isNotEmpty) 'uid': userId,
        });
      case 'credit_card':
      case 'bill':
      case 'expense':
      case 'subscription':
      default:
        return _buildPayload('subs', {
          if (userId.isNotEmpty) 'uid': userId,
        });
    }
  }

  static String? _buildPayload(String host, Map<String, String> params) {
    final filtered = <String, String>{};
    params.forEach((key, value) {
      if (value.isNotEmpty) filtered[key] = value;
    });
    return Uri(
      scheme: 'app',
      host: host,
      queryParameters: filtered.isEmpty ? null : filtered,
    ).toString();
  }

  static bool _isWithinQuietHours(DateTime now, Map<String, dynamic> quiet) {
    final startStr = (quiet['start'] as String?) ?? '00:00';
    final endStr = (quiet['end'] as String?) ?? '00:00';
    if (startStr == '00:00' && endStr == '00:00') {
      return false;
    }
    final startMinutes = _timeToMinutes(startStr);
    final endMinutes = _timeToMinutes(endStr);
    final nowMinutes = now.hour * 60 + now.minute;

    if (startMinutes <= endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    } else {
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }
  }

  static int _timeToMinutes(String hhmm) {
    final parts = hhmm.split(':');
    final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return (h.clamp(0, 23) * 60) + m.clamp(0, 59);
  }

  static MapEntry<String, double>? _topCategory(List<ExpenseItem> expenses) {
    if (expenses.isEmpty) {
      return null;
    }
    final totals = <String, double>{};
    for (final e in expenses) {
      final raw = e.category?.trim().isNotEmpty == true
          ? e.category!.trim()
          : e.type.trim();
      totals[raw] = (totals[raw] ?? 0) + e.amount;
    }
    if (totals.isEmpty) {
      return null;
    }
    final sorted = totals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return sorted.first;
  }

  static bool _looksLikeSubscription(ExpenseItem expense) {
    final tags =
        (expense.tags ?? const <String>[]).map((t) => t.toLowerCase()).toList();
    final type = expense.type.toLowerCase();
    final note = expense.note.toLowerCase();
    if (tags.contains('subscription') ||
        tags.contains('autopay') ||
        tags.contains('membership') ||
        tags.contains('recurring')) {
      return true;
    }
    if (expense.brainMeta != null &&
        expense.brainMeta!['recurringKey'] != null) {
      return true;
    }
    return type.contains('subscription') ||
        type.contains('membership') ||
        note.contains('subscription') ||
        note.contains('membership');
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
