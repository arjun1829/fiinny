import '../models/expense_item.dart';
import 'enhanced_split_models.dart';

class EnhancedSplitEngine {
  /// Analyze split expenses to generate detailed friend and group reports
  static EnhancedSplitReport analyze(
    List<ExpenseItem> expenses,
    String userPhone, {
    Map<String, String>? friendNames, // phone -> name mapping
    Map<String, String>? groupNames,  // groupId -> name mapping
  }) {
    if (expenses.isEmpty) {
      return EnhancedSplitReport.empty();
    }

    // Filter to split expenses only (has friendIds or groupId)
    final splitExpenses = expenses.where((e) => 
      e.friendIds.isNotEmpty || (e.groupId != null && e.groupId!.isNotEmpty)
    ).toList();

    if (splitExpenses.isEmpty) {
      return EnhancedSplitReport.empty();
    }

    // 1. Analyze friend-level details
    final friendDetails = _analyzeFriendDetails(splitExpenses, userPhone, friendNames ?? {});

    // 2. Analyze group details
    final groupDetails = _analyzeGroupDetails(splitExpenses, userPhone, groupNames ?? {});

    // 3. Analyze behavior patterns
    final behavior = _analyzeBehavior(splitExpenses, userPhone, friendDetails, expenses);

    // 4. Identify risks
    final risks = _identifyRisks(friendDetails, groupDetails);

    // 5. Calculate totals
    double totalReceivable = 0;
    double totalPayable = 0;
    
    for (final detail in friendDetails.values) {
      if (detail.netBalance > 0) {
        totalReceivable += detail.netBalance;
      } else {
        totalPayable += detail.netBalance.abs();
      }
    }

    return EnhancedSplitReport(
      friendDetails: friendDetails,
      groupDetails: groupDetails,
      behavior: behavior,
      risks: risks,
      totalPendingReceivable: totalReceivable,
      totalPendingPayable: totalPayable,
      netPosition: totalReceivable - totalPayable,
    );
  }

  /// Analyze each friend's split details
  static Map<String, FriendSplitDetail> _analyzeFriendDetails(
    List<ExpenseItem> splitExpenses,
    String userPhone,
    Map<String, String> friendNames,
  ) {
    final friendMap = <String, List<ExpenseItem>>{};

    // Group expenses by friend
    for (final expense in splitExpenses) {
      // Case 1: Friend is in friendIds list
      for (final friendPhone in expense.friendIds) {
        if (friendPhone == userPhone) continue;
        friendMap.putIfAbsent(friendPhone, () => []).add(expense);
      }
      
      // Case 2: Friend is the payer (and user is in friendIds)
      if (expense.payerId != userPhone && expense.friendIds.contains(userPhone)) {
        friendMap.putIfAbsent(expense.payerId, () => []).add(expense);
      }
    }

    final details = <String, FriendSplitDetail>{};

    for (final entry in friendMap.entries) {
      final friendPhone = entry.key;
      final friendExpenses = entry.value;

      double netBalance = 0;
      double totalPaidByUser = 0;
      double totalPaidByFriend = 0;
      int unsettledCount = 0;
      DateTime? lastExpenseDate;
      DateTime? oldestUnsettledDate;
      final paymentMethods = <String>{};
      final categoryBreakdown = <String, double>{};

      for (final expense in friendExpenses) {
        // Update last expense date
        if (lastExpenseDate == null || expense.date.isAfter(lastExpenseDate)) {
          lastExpenseDate = expense.date;
        }

        // Check if settled
        final isSettled = expense.settledFriendIds.contains(friendPhone) || 
                         expense.settledFriendIds.contains(userPhone);

        if (!isSettled) {
          unsettledCount++;
          if (oldestUnsettledDate == null || expense.date.isBefore(oldestUnsettledDate)) {
            oldestUnsettledDate = expense.date;
          }
        }

        // Calculate balance
        final splitAmount = _calculateSplitAmount(expense, userPhone, friendPhone);
        
        if (expense.payerId == userPhone) {
          totalPaidByUser += splitAmount;
          if (!isSettled) {
            netBalance += splitAmount; // They owe you
          }
        } else if (expense.payerId == friendPhone) {
          totalPaidByFriend += splitAmount;
          if (!isSettled) {
            netBalance -= splitAmount; // You owe them
          }
        }

        // Track payment methods
        if (expense.instrument != null) {
          paymentMethods.add(expense.instrument!);
        }

        // Category breakdown
        final category = expense.category ?? 'Uncategorized';
        categoryBreakdown[category] = (categoryBreakdown[category] ?? 0) + splitAmount;
      }

      // Calculate days since last settlement
      int daysSinceLastSettlement = 0;
      if (oldestUnsettledDate != null) {
        daysSinceLastSettlement = DateTime.now().difference(oldestUnsettledDate).inDays;
      }

      details[friendPhone] = FriendSplitDetail(
        friendPhone: friendPhone,
        friendName: friendNames[friendPhone] ?? friendPhone,
        netBalance: netBalance,
        totalExpenses: friendExpenses.length,
        unsettledExpenses: unsettledCount,
        totalPaidByYou: totalPaidByUser,
        totalPaidByThem: totalPaidByFriend,
        lastExpenseDate: lastExpenseDate,
        oldestUnsettledDate: oldestUnsettledDate,
        daysSinceLastSettlement: daysSinceLastSettlement,
        paymentMethods: paymentMethods.toList(),
        categoryBreakdown: categoryBreakdown,
      );
    }

    return details;
  }

  /// Calculate split amount for a specific friend in an expense
  static double _calculateSplitAmount(ExpenseItem expense, String userPhone, String friendPhone) {
    // Check custom splits first
    if (expense.customSplits != null && expense.customSplits!.isNotEmpty) {
      return expense.customSplits![friendPhone] ?? 0;
    }

    // Equal split among all participants
    final participants = expense.friendIds.length + 1; // +1 for payer if not in friendIds
    return expense.amount / participants;
  }

  /// Analyze group-level details
  static Map<String, GroupSplitDetail> _analyzeGroupDetails(
    List<ExpenseItem> splitExpenses,
    String userPhone,
    Map<String, String> groupNames,
  ) {
    final groupMap = <String, List<ExpenseItem>>{};

    // Group expenses by groupId
    for (final expense in splitExpenses) {
      if (expense.groupId != null && expense.groupId!.isNotEmpty) {
        groupMap.putIfAbsent(expense.groupId!, () => []).add(expense);
      }
    }

    final details = <String, GroupSplitDetail>{};

    for (final entry in groupMap.entries) {
      final groupId = entry.key;
      final groupExpenses = entry.value;

      final memberBalances = <String, double>{};
      double totalPending = 0;
      bool isFullySettled = true;
      DateTime? lastExpenseDate;

      for (final expense in groupExpenses) {
        if (lastExpenseDate == null || expense.date.isAfter(lastExpenseDate)) {
          lastExpenseDate = expense.date;
        }

        // Check if this expense is settled
        final isSettled = expense.settledFriendIds.isNotEmpty;
        if (!isSettled) {
          isFullySettled = false;
          totalPending += expense.amount;
        }

        // Track member balances (simplified - would need more logic for accurate group splits)
        for (final friendPhone in expense.friendIds) {
          memberBalances.putIfAbsent(friendPhone, () => 0);
        }
      }

      details[groupId] = GroupSplitDetail(
        groupId: groupId,
        groupName: groupNames[groupId] ?? groupId,
        totalPending: totalPending,
        memberCount: memberBalances.length,
        memberBalances: memberBalances,
        isFullySettled: isFullySettled,
        totalExpenses: groupExpenses.length,
        lastExpenseDate: lastExpenseDate,
      );
    }

    return details;
  }

  /// Analyze behavioral patterns
  static SplitBehaviorAnalysis _analyzeBehavior(
    List<ExpenseItem> splitExpenses,
    String userPhone,
    Map<String, FriendSplitDetail> friendDetails,
    List<ExpenseItem> allExpenses,
  ) {
    int userPaidCount = 0;
    final int totalSplitExpenses = splitExpenses.length;
    final double totalSettlementDelay = 0;
    int settledCount = 0;

    for (final expense in splitExpenses) {
      if (expense.payerId == userPhone) {
        userPaidCount++;
      }

      // Calculate settlement delay
      if (expense.settledFriendIds.isNotEmpty) {
        // Simplified: assume settled within 7 days on average
        // In reality, would need settlement timestamp
        settledCount++;
      }
    }

    // Calculate percentages
    final alwaysPaysFirst = totalSplitExpenses > 0 && (userPaidCount / totalSplitExpenses) > 0.7;
    final lendsEasily = userPaidCount > totalSplitExpenses * 0.5;

    // Find most expensive/reliable friends
    String? mostExpensiveFriend;
    String? mostReliableFriend;
    String? mostDelayedFriend;
    double maxExpense = 0;
    int minDelay = 999999;
    int maxDelay = 0;

    for (final entry in friendDetails.entries) {
      final detail = entry.value;
      
      if (detail.totalPaidByYou + detail.totalPaidByThem > maxExpense) {
        maxExpense = detail.totalPaidByYou + detail.totalPaidByThem;
        mostExpensiveFriend = entry.key;
      }

      if (detail.daysSinceLastSettlement < minDelay && detail.unsettledExpenses == 0) {
        minDelay = detail.daysSinceLastSettlement;
        mostReliableFriend = entry.key;
      }

      if (detail.daysSinceLastSettlement > maxDelay && detail.unsettledExpenses > 0) {
        maxDelay = detail.daysSinceLastSettlement;
        mostDelayedFriend = entry.key;
      }
    }

    // Calculate social spending percentage
    final totalExpenseAmount = allExpenses.fold<double>(0, (sum, e) => sum + e.amount);
    final splitExpenseAmount = splitExpenses.fold<double>(0, (sum, e) => sum + e.amount);
    final socialSpendingPct = totalExpenseAmount > 0 ? (splitExpenseAmount / totalExpenseAmount) * 100 : 0;

    return SplitBehaviorAnalysis(
      alwaysPaysFirst: alwaysPaysFirst,
      lendsEasily: lendsEasily,
      avgSettlementDelay: settledCount > 0 ? totalSettlementDelay / settledCount : 0,
      mostExpensiveFriend: mostExpensiveFriend,
      mostReliableFriend: mostReliableFriend,
      mostDelayedFriend: mostDelayedFriend,
      socialSpendingPct: socialSpendingPct.toDouble(),
    );
  }

  /// Identify split-related risks
  static List<SplitRisk> _identifyRisks(
    Map<String, FriendSplitDetail> friendDetails,
    Map<String, GroupSplitDetail> groupDetails,
  ) {
    final risks = <SplitRisk>[];

    // Check for delayed payments (>30 days)
    for (final entry in friendDetails.entries) {
      final detail = entry.value;
      
      if (detail.daysSinceLastSettlement > 30 && detail.unsettledExpenses > 0) {
        risks.add(SplitRisk(
          type: 'DELAYED_PAYMENT',
          description: '${detail.friendName} has pending amount for ${detail.daysSinceLastSettlement} days',
          friendPhone: entry.key,
          amount: detail.netBalance.abs(),
          days: detail.daysSinceLastSettlement,
        ));
      }

      // Check for high pending amounts (>5000)
      if (detail.netBalance.abs() > 5000) {
        risks.add(SplitRisk(
          type: 'HIGH_PENDING',
          description: 'High pending amount with ${detail.friendName}',
          friendPhone: entry.key,
          amount: detail.netBalance.abs(),
        ));
      }

      // Check for imbalanced relationships (one person always pays)
      if (detail.totalPaidByYou > 0 && detail.totalPaidByThem == 0) {
        risks.add(SplitRisk(
          type: 'IMBALANCED_FRIEND',
          description: '${detail.friendName} never pays first',
          friendPhone: entry.key,
        ));
      }
    }

    return risks;
  }
}
