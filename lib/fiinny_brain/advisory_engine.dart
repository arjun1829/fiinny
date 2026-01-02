import 'fiinny_user_snapshot.dart';
import 'insight_models.dart';
import 'advisory_models.dart';

class AdvisoryEngine {
  /// Generate actionable recommendations based on snapshot and insights
  static AdvisoryReport generateAdvice(
    FiinnyUserSnapshot snapshot,
    List<FiinnyInsight> insights,
  ) {
    if (insights.isEmpty) {
      return AdvisoryReport.empty();
    }

    final recommendations = <Recommendation>[];
    double totalPotentialSavings = 0.0;

    // Process each insight and generate recommendations
    for (final insight in insights) {
      final recs = _generateRecommendationsForInsight(insight, snapshot);
      recommendations.addAll(recs);
      
      // Sum up potential savings
      for (final rec in recs) {
        totalPotentialSavings += rec.impact;
      }
    }

    // Determine priority action (highest impact)
    String priorityAction = 'Keep up the good work!';
    if (recommendations.isNotEmpty) {
      recommendations.sort((a, b) => b.impact.compareTo(a.impact));
      priorityAction = recommendations.first.action;
    }

    // Identify quick wins (low effort, decent impact)
    final quickWins = recommendations
        .where((r) => r.category == 'SETTLE_SPLITS' || r.category == 'REDUCE_SMALL_EXPENSE')
        .map((r) => r.action)
        .take(3)
        .toList();

    return AdvisoryReport(
      recommendations: recommendations,
      priorityAction: priorityAction,
      quickWins: quickWins,
      potentialMonthlySavings: totalPotentialSavings,
    );
  }

  /// Generate recommendations for a specific insight
  static List<Recommendation> _generateRecommendationsForInsight(
    FiinnyInsight insight,
    FiinnyUserSnapshot snapshot,
  ) {
    final recommendations = <Recommendation>[];

    switch (insight.id) {
      case 'LOW_SAVINGS':
        // Recommend reducing top expense category by 15%
        final topCategory = snapshot.patterns.highSpendCategories.isNotEmpty
            ? snapshot.patterns.highSpendCategories.first
            : 'expenses';
        final categoryPct = snapshot.patterns.categorySpendPercentage[topCategory] ?? 0.0;
        final categoryAmount = (snapshot.incomeSummary.total * categoryPct) / 100.0;
        final reduction = categoryAmount * 0.15;

        recommendations.add(Recommendation(
          id: 'REDUCE_${topCategory.toUpperCase()}',
          category: 'REDUCE_EXPENSE',
          action: 'Reduce $topCategory spending by 15%',
          impact: reduction,
          reasoning: 'Your savings rate is low. Cutting back on $topCategory can help.',
        ));
        break;

      case 'HIGH_FOOD_SPEND':
        final foodPct = snapshot.patterns.categorySpendPercentage['Food'] ?? 0.0;
        final foodAmount = (snapshot.incomeSummary.total * foodPct) / 100.0;
        final reduction = foodAmount * 0.20;

        recommendations.add(Recommendation(
          id: 'REDUCE_FOOD',
          category: 'REDUCE_EXPENSE',
          action: 'Cook at home more often to reduce food expenses',
          impact: reduction,
          reasoning: 'Food spending is high. Meal planning can save ₹${reduction.toStringAsFixed(0)}/month.',
        ));
        break;

      case 'PAYCHECK_TO_PAYCHECK':
        // Priority: Build emergency buffer
        recommendations.add(Recommendation(
          id: 'BUILD_BUFFER',
          category: 'INCREASE_SAVINGS',
          action: 'Build a ₹5,000 emergency buffer this month',
          impact: 5000.0,
          reasoning: 'You\'re living paycheck to paycheck. A small buffer prevents crisis.',
        ));
        break;

      case 'UNSETTLED_SPLITS':
      case 'FRIENDS_PENDING_HIGH':
        final owedToYou = snapshot.splits.totalOwedToYou;
        if (owedToYou > 0) {
          recommendations.add(Recommendation(
            id: 'COLLECT_SPLITS',
            category: 'SETTLE_SPLITS',
            action: 'Collect ₹${owedToYou.toStringAsFixed(0)} from friends',
            impact: owedToYou,
            reasoning: 'This money is already yours. Collecting it improves cash flow.',
          ));
        }
        break;

      case 'UNPLANNED_SHOPPING_SPIKE':
        final shoppingPct = snapshot.patterns.categorySpendPercentage['Shopping'] ?? 0.0;
        final shoppingAmount = (snapshot.incomeSummary.total * shoppingPct) / 100.0;
        final reduction = shoppingAmount * 0.30;

        recommendations.add(Recommendation(
          id: 'REDUCE_SHOPPING',
          category: 'REDUCE_EXPENSE',
          action: 'Pause non-essential shopping for 2 weeks',
          impact: reduction,
          reasoning: 'Shopping spiked this month. A pause helps reset spending habits.',
        ));
        break;

      case 'HIGH_SPENDING':
        // Generic advice: Follow 50/30/20 rule
        final targetSavings = snapshot.incomeSummary.total * 0.20;
        final currentSavings = (snapshot.incomeSummary.total * snapshot.behavior.savingsRate) / 100.0;
        final gap = targetSavings - currentSavings;

        if (gap > 0) {
          recommendations.add(Recommendation(
            id: 'FOLLOW_50_30_20',
            category: 'INCREASE_SAVINGS',
            action: 'Aim to save 20% of income (₹${targetSavings.toStringAsFixed(0)})',
            impact: gap,
            reasoning: 'The 50/30/20 rule is a proven budgeting framework.',
          ));
        }
        break;

      default:
        // No specific recommendation for this insight
        break;
    }

    return recommendations;
  }
}
