import '../models/expense_item.dart';
import 'enhanced_split_models.dart';

/// Query engine for answering split-related questions
class SplitQueryEngine {
  // ==================== A. PENDING AMOUNTS & DUES (Q1-20) ====================
  
  /// How much money is {friend} pending on me?
  static double getAmountOwedBy(String friendPhone, EnhancedSplitReport report) {
    final detail = report.friendDetails[friendPhone];
    if (detail == null) return 0;
    return detail.netBalance > 0 ? detail.netBalance : 0;
  }

  /// How much do I owe {friend}?
  static double getAmountOwedTo(String friendPhone, EnhancedSplitReport report) {
    final detail = report.friendDetails[friendPhone];
    if (detail == null) return 0;
    return detail.netBalance < 0 ? detail.netBalance.abs() : 0;
  }

  /// Who has the highest pending amount with me?
  static String? getHighestPendingFriend(EnhancedSplitReport report) {
    if (report.friendDetails.isEmpty) return null;
    
    String? highestFriend;
    double highestAmount = 0;
    
    for (final entry in report.friendDetails.entries) {
      final amount = entry.value.netBalance.abs();
      if (amount > highestAmount) {
        highestAmount = amount;
        highestFriend = entry.key;
      }
    }
    
    return highestFriend;
  }

  /// How much money is still unsettled overall?
  static double getTotalUnsettled(EnhancedSplitReport report) {
    return report.totalPendingReceivable + report.totalPendingPayable;
  }

  /// Which friends haven't paid me back yet?
  static List<String> getUnsettledFriends(EnhancedSplitReport report) {
    return report.friendDetails.entries
        .where((e) => e.value.netBalance > 0 && e.value.unsettledExpenses > 0)
        .map((e) => e.key)
        .toList();
  }

  /// What is the net balance between me and {friend}?
  static double getNetBalance(String friendPhone, EnhancedSplitReport report) {
    return report.friendDetails[friendPhone]?.netBalance ?? 0;
  }

  /// Who owes me money right now?
  static List<String> getWhoOwesMe(EnhancedSplitReport report) {
    return report.friendDetails.entries
        .where((e) => e.value.netBalance > 0)
        .map((e) => e.key)
        .toList();
  }

  /// How much money do I need to collect?
  static double getTotalToCollect(EnhancedSplitReport report) {
    return report.totalPendingReceivable;
  }

  /// How much money do I need to return?
  static double getTotalToReturn(EnhancedSplitReport report) {
    return report.totalPendingPayable;
  }

  /// Am I net positive or negative in splits?
  static String getNetPosition(EnhancedSplitReport report) {
    if (report.netPosition > 0) return 'positive';
    if (report.netPosition < 0) return 'negative';
    return 'balanced';
  }

  /// Which friend should I remind first? (highest pending + longest delay)
  static String? getFriendToRemindFirst(EnhancedSplitReport report) {
    if (report.friendDetails.isEmpty) return null;
    
    String? topFriend;
    double topScore = 0;
    
    for (final entry in report.friendDetails.entries) {
      final detail = entry.value;
      if (detail.netBalance <= 0 || detail.unsettledExpenses == 0) continue;
      
      // Score = amount * days delay
      final score = detail.netBalance * detail.daysSinceLastSettlement;
      if (score > topScore) {
        topScore = score;
        topFriend = entry.key;
      }
    }
    
    return topFriend;
  }

  // ==================== B. FRIEND-WISE BREAKDOWN (Q21-40) ====================

  /// Show me all expenses with {friend}
  static List<ExpenseItem> getExpensesWithFriend(
    String friendPhone,
    List<ExpenseItem> expenses,
  ) {
    return expenses.where((e) => 
      e.friendIds.contains(friendPhone) || e.payerId == friendPhone
    ).toList();
  }

  /// How many times have I paid for {friend}?
  static int getPaymentCount(String friendPhone, List<ExpenseItem> expenses, String userPhone) {
    return expenses.where((e) => 
      e.payerId == userPhone && e.friendIds.contains(friendPhone)
    ).length;
  }

  /// With whom do I split expenses most often?
  static String? getMostFrequentSplitFriend(EnhancedSplitReport report) {
    if (report.friendDetails.isEmpty) return null;
    
    String? mostFrequent;
    int maxExpenses = 0;
    
    for (final entry in report.friendDetails.entries) {
      if (entry.value.totalExpenses > maxExpenses) {
        maxExpenses = entry.value.totalExpenses;
        mostFrequent = entry.key;
      }
    }
    
    return mostFrequent;
  }

  /// Who usually pays first in our group? (most reliable)
  static String? getMostReliableFriend(EnhancedSplitReport report) {
    return report.behavior.mostReliableFriend;
  }

  /// Who usually delays settlements?
  static String? getMostDelayedFriend(EnhancedSplitReport report) {
    return report.behavior.mostDelayedFriend;
  }

  /// Which friend costs me the most?
  static String? getMostExpensiveFriend(EnhancedSplitReport report) {
    return report.behavior.mostExpensiveFriend;
  }

  /// How much did I spend on {category} with {friend}?
  static double getCategorySpendWithFriend(
    String friendPhone,
    String category,
    EnhancedSplitReport report,
  ) {
    final detail = report.friendDetails[friendPhone];
    return detail?.categoryBreakdown[category] ?? 0;
  }

  // ==================== C. GROUP & TRIP EXPENSES (Q41-60) ====================

  /// How much is pending in my {group} group?
  static double getGroupPending(String groupId, EnhancedSplitReport report) {
    return report.groupDetails[groupId]?.totalPending ?? 0;
  }

  /// Is the {group} group fully settled?
  static bool isGroupFullySettled(String groupId, EnhancedSplitReport report) {
    return report.groupDetails[groupId]?.isFullySettled ?? true;
  }

  /// Who hasn't paid in the {group} yet?
  static List<String> getGroupUnsettledMembers(
    String groupId,
    EnhancedSplitReport report,
  ) {
    final group = report.groupDetails[groupId];
    if (group == null) return [];
    
    return group.memberBalances.entries
        .where((e) => e.value < 0) // Negative balance = they owe
        .map((e) => e.key)
        .toList();
  }

  /// Which group has the highest pending amount?
  static String? getHighestPendingGroup(EnhancedSplitReport report) {
    if (report.groupDetails.isEmpty) return null;
    
    String? highestGroup;
    double highestPending = 0;
    
    for (final entry in report.groupDetails.entries) {
      if (entry.value.totalPending > highestPending) {
        highestPending = entry.value.totalPending;
        highestGroup = entry.key;
      }
    }
    
    return highestGroup;
  }

  // ==================== D. BEHAVIOR & PATTERNS (Q76-90) ====================

  /// Am I always the one paying first?
  static bool isAlwaysPayingFirst(EnhancedSplitReport report) {
    return report.behavior.alwaysPaysFirst;
  }

  /// Do I lend money too easily?
  static bool lendsEasily(EnhancedSplitReport report) {
    return report.behavior.lendsEasily;
  }

  /// Is splitting expenses hurting me financially?
  static bool isSplittingHurtingFinances(EnhancedSplitReport report, double totalIncome) {
    // If social spending > 30% of income, it's concerning
    return report.behavior.socialSpendingPct > 30;
  }

  /// Which friend causes the most imbalance?
  static String? getMostImbalancedFriend(EnhancedSplitReport report) {
    // Friend with highest absolute net balance
    if (report.friendDetails.isEmpty) return null;
    
    String? mostImbalanced;
    double maxImbalance = 0;
    
    for (final entry in report.friendDetails.entries) {
      final imbalance = entry.value.netBalance.abs();
      if (imbalance > maxImbalance) {
        maxImbalance = imbalance;
        mostImbalanced = entry.key;
      }
    }
    
    return mostImbalanced;
  }

  /// Is my friend circle expensive?
  static bool isFriendCircleExpensive(EnhancedSplitReport report, double totalExpenses) {
    if (totalExpenses == 0) return false;
    
    final splitExpenseTotal = report.friendDetails.values
        .fold<double>(0, (sum, detail) => sum + detail.totalPaidByYou + detail.totalPaidByThem);
    
    // If split expenses > 40% of total, it's expensive
    return (splitExpenseTotal / totalExpenses) > 0.4;
  }

  // ==================== E. AWARENESS & SUMMARY (Q91-100) ====================

  /// What is my total pending split amount?
  static double getTotalPendingSplitAmount(EnhancedSplitReport report) {
    return getTotalUnsettled(report);
  }

  /// Did my split situation improve? (requires historical comparison)
  static bool didSplitSituationImprove(
    EnhancedSplitReport current,
    EnhancedSplitReport? previous,
  ) {
    if (previous == null) return false;
    return current.netPosition > previous.netPosition;
  }

  /// Which friend should I be careful with?
  static List<String> getFriendsToBeCarefulWith(EnhancedSplitReport report) {
    return report.risks
        .where((r) => r.type == 'DELAYED_PAYMENT' || r.type == 'IMBALANCED_FRIEND')
        .map((r) => r.friendPhone!)
        .toSet()
        .toList();
  }

  /// What is my biggest split expense mistake?
  static String? getBiggestMistake(EnhancedSplitReport report) {
    // Identify the most critical risk
    if (report.risks.isEmpty) return null;
    
    // Prioritize: HIGH_PENDING > DELAYED_PAYMENT > IMBALANCED_FRIEND
    final highPending = report.risks.where((r) => r.type == 'HIGH_PENDING').toList();
    if (highPending.isNotEmpty) {
      return 'High pending amount of ₹${highPending.first.amount?.toStringAsFixed(0)} with ${highPending.first.friendPhone}';
    }
    
    final delayed = report.risks.where((r) => r.type == 'DELAYED_PAYMENT').toList();
    if (delayed.isNotEmpty) {
      return 'Payment delayed for ${delayed.first.days} days with ${delayed.first.friendPhone}';
    }
    
    final imbalanced = report.risks.where((r) => r.type == 'IMBALANCED_FRIEND').toList();
    if (imbalanced.isNotEmpty) {
      return 'Imbalanced relationship with ${imbalanced.first.friendPhone} (you always pay)';
    }
    
    return null;
  }

  // ==================== HELPER METHODS ====================

  /// Get all risks for a specific friend
  static List<SplitRisk> getRisksForFriend(String friendPhone, EnhancedSplitReport report) {
    return report.risks.where((r) => r.friendPhone == friendPhone).toList();
  }

  /// Get summary statistics
  static Map<String, dynamic> getSummaryStats(EnhancedSplitReport report) {
    return {
      'totalFriends': report.friendDetails.length,
      'totalGroups': report.groupDetails.length,
      'totalReceivable': report.totalPendingReceivable,
      'totalPayable': report.totalPendingPayable,
      'netPosition': report.netPosition,
      'totalRisks': report.risks.length,
      'alwaysPayingFirst': report.behavior.alwaysPaysFirst,
      'socialSpendingPct': report.behavior.socialSpendingPct,
    };
  }
}
