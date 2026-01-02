import 'fiinny_user_snapshot.dart';
import 'insight_models.dart';
import 'behavior_engine.dart';

class InsightEngine {
  // Lock MVP scope: Disable goal insights for now
  static const bool MVP_GOALS_ENABLED = false;

  /// Generate insights from a snapshot using deterministic rules.
  static List<FiinnyInsight> analyze(FiinnyUserSnapshot snapshot) {
    final insights = <FiinnyInsight>[];

    // 1. LOW_SAVINGS
    // Rule: IF behavior.savingsRate < 0.20 (Converted to 20.0 for 0-100 scale)
    if (snapshot.behavior.savingsRate < 20.0) {
      insights.add(FiinnyInsight(
        id: 'LOW_SAVINGS',
        category: InsightCategory.RISK,
        severity: InsightSeverity.MEDIUM,
        factsUsed: ['behavior.savingsRate'],
        values: {'savingsRate': snapshot.behavior.savingsRate},
        actionable: true,
      ));
    }

    // 2. HIGH_SPENDING
    // Rule: IF behavior.expenseRatio > 0.80 (Converted to 80.0)
    if (snapshot.behavior.expenseToIncomeRatio > 80.0) {
      insights.add(FiinnyInsight(
        id: 'HIGH_SPENDING',
        category: InsightCategory.RISK,
        severity: InsightSeverity.HIGH,
        factsUsed: ['behavior.expenseToIncomeRatio'],
        values: {'expenseRatio': snapshot.behavior.expenseToIncomeRatio},
        actionable: true,
      ));
    }

    // 3. DOMINANT_EXPENSE_CATEGORY
    // Rule: IF patterns.dominantCategories is not empty
    if (snapshot.patterns.highSpendCategories.isNotEmpty) {
      insights.add(FiinnyInsight(
        id: 'DOMINANT_EXPENSE_CATEGORY',
        category: InsightCategory.INFO,
        severity: InsightSeverity.LOW,
        factsUsed: ['patterns.highSpendCategories'],
        values: {'dominantCategories': snapshot.patterns.highSpendCategories},
        actionable: true,
      ));
    }

    // -- NEW MVP INSIGHTS --

    // 4. HIGH_FOOD_SPEND
    // Rule: If 'Food' or 'Dining' is in high spend categories ( > 30% of income)
    // Actually, pattern engine defines high spend as > 30%. We just check if 'Food' is in that list.
    // Or we check % specifically? Logic: "HIGH_FOOD_SPEND".
    // I'll check if 'Food' or 'Dining' exists in highSpendCategories.
    final foodCategories = ['Food', 'Dining', 'Restaurants', 'Groceries']; 
    final highFood = snapshot.patterns.highSpendCategories
        .where((c) => foodCategories.contains(c)).toList();
    
    if (highFood.isNotEmpty) {
       insights.add(FiinnyInsight(
        id: 'HIGH_FOOD_SPEND',
        category: InsightCategory.INFO,
        severity: InsightSeverity.LOW,
        factsUsed: ['patterns.highSpendCategories'],
        values: {'categories': highFood},
        actionable: true,
      ));
    }

    // 5. UNPLANNED_SHOPPING_SPIKE
    // Rule: Any category named 'Shopping' with > 30% spend? Or sudden spike?
    // "Phase One" engines don't detect "spikes" (historical). They only show current month high spend.
    // So "UNPLANNED_SHOPPING_SPIKE" = 'Shopping' in highSpendCategories?
    // Let's assume yes for MVP static logic.
    if (snapshot.patterns.highSpendCategories.contains('Shopping')) {
       insights.add(FiinnyInsight(
        id: 'UNPLANNED_SHOPPING_SPIKE',
        category: InsightCategory.RISK,
        severity: InsightSeverity.MEDIUM,
        factsUsed: ['patterns.highSpendCategories'],
        values: {'category': 'Shopping'},
        actionable: true,
      ));
    }

    // 6. PAYCHECK_TO_PAYCHECK
    // Rule: Income > 0 AND Savings Rate < 5%? Or Expense Ratio > 95%?
    // Let's align with LOW_SAVINGS but stricter.
    // Or maybe if savings rate is near 0 (-5 to 5%).
    // Let's use: ExpenseRatio > 95%.
    if (snapshot.behavior.expenseToIncomeRatio > 95.0) {
      insights.add(FiinnyInsight(
        id: 'PAYCHECK_TO_PAYCHECK',
        category: InsightCategory.RISK,
        severity: InsightSeverity.HIGH,
        factsUsed: ['behavior.expenseToIncomeRatio'],
        values: {'expenseRatio': snapshot.behavior.expenseToIncomeRatio},
        actionable: true,
      ));
    }
    
    // 7. FRIENDS_PENDING_HIGH
    // Rule: If you owe > X or are owed > X?
    // Let's say if totalPending > 1000? Or just if unsettled splits exist significantly.
    // Prompt: "FRIENDS_PENDING_HIGH". 
    // I'll check if totalPending (you owe + owed to you) > 1000.
    final totalPending = snapshot.splits.totalYouOwe + snapshot.splits.totalOwedToYou;
    if (totalPending > 1000) {
      insights.add(FiinnyInsight(
        id: 'FRIENDS_PENDING_HIGH',
        category: InsightCategory.INFO,
        severity: InsightSeverity.MEDIUM,
        factsUsed: ['splits.totalYouOwe', 'splits.totalOwedToYou'],
        values: {'totalPending': totalPending},
        actionable: true,
      ));
    }

    // 8. UNSETTLED_SPLITS (Modified logic to coexist or be broader)
    // Original Rule: IF splits.totalPendingAmount > 0
    if (totalPending > 0) {
      insights.add(FiinnyInsight(
        id: 'UNSETTLED_SPLITS',
        category: InsightCategory.INFO,
        severity: InsightSeverity.LOW,
        factsUsed: ['splits.totalYouOwe', 'splits.totalOwedToYou'],
        values: {
          'totalYouOwe': snapshot.splits.totalYouOwe,
          'totalOwedToYou': snapshot.splits.totalOwedToYou,
          'totalPending': totalPending
        },
        actionable: true,
      ));
    }

    // ----------------------
    // GOAL INSIGHTS (GUARDED)
    // ----------------------
    if (MVP_GOALS_ENABLED) {
        // GOAL_OFF_TRACK
        if (snapshot.goals.offTrackGoals > 0) {
          final offTrackNames = snapshot.goals.goals
              .where((g) => !g.onTrack)
              .map((g) => g.goalName)
              .toList();

          insights.add(FiinnyInsight(
            id: 'GOAL_OFF_TRACK',
            category: InsightCategory.RISK,
            severity: InsightSeverity.MEDIUM,
            factsUsed: ['goals.offTrackGoals'],
            values: {'offTrackCount': snapshot.goals.offTrackGoals, 'goals': offTrackNames},
            actionable: true,
          ));
        }
        
        // GOAL_BLOCKED_BY_SPENDING (Placeholder logic if implemented later)
    }

    // INCOME_UNSTABLE (Keep active)
    if (snapshot.behavior.riskFlags.contains(BehaviorEngine.INCOME_UNSTABLE)) {
      insights.add(FiinnyInsight(
        id: 'INCOME_UNSTABLE',
        category: InsightCategory.RISK,
        severity: InsightSeverity.HIGH,
        factsUsed: ['behavior.riskFlags'],
        values: {'riskFlags': snapshot.behavior.riskFlags},
        actionable: false, 
      ));
    }

    return insights;
  }
}
