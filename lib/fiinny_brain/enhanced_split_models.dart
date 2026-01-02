/// Detailed split analysis for a single friend
class FriendSplitDetail {
  final String friendPhone;
  final String friendName;
  final double netBalance;              // + = they owe you, - = you owe them
  final int totalExpenses;
  final int unsettledExpenses;
  final double totalPaidByYou;
  final double totalPaidByThem;
  final DateTime? lastExpenseDate;
  final DateTime? oldestUnsettledDate;
  final int daysSinceLastSettlement;
  final List<String> paymentMethods;    // UPI, Cash, etc.
  final Map<String, double> categoryBreakdown;

  const FriendSplitDetail({
    required this.friendPhone,
    required this.friendName,
    required this.netBalance,
    required this.totalExpenses,
    required this.unsettledExpenses,
    required this.totalPaidByYou,
    required this.totalPaidByThem,
    this.lastExpenseDate,
    this.oldestUnsettledDate,
    required this.daysSinceLastSettlement,
    required this.paymentMethods,
    required this.categoryBreakdown,
  });

  Map<String, dynamic> toJson() => {
    'friendPhone': friendPhone,
    'friendName': friendName,
    'netBalance': netBalance,
    'totalExpenses': totalExpenses,
    'unsettledExpenses': unsettledExpenses,
    'totalPaidByYou': totalPaidByYou,
    'totalPaidByThem': totalPaidByThem,
    'lastExpenseDate': lastExpenseDate?.toIso8601String(),
    'oldestUnsettledDate': oldestUnsettledDate?.toIso8601String(),
    'daysSinceLastSettlement': daysSinceLastSettlement,
    'paymentMethods': paymentMethods,
    'categoryBreakdown': categoryBreakdown,
  };
}

/// Group/trip split analysis
class GroupSplitDetail {
  final String groupId;
  final String groupName;
  final double totalPending;
  final int memberCount;
  final Map<String, double> memberBalances;  // phone -> balance
  final bool isFullySettled;
  final int totalExpenses;
  final DateTime? lastExpenseDate;

  const GroupSplitDetail({
    required this.groupId,
    required this.groupName,
    required this.totalPending,
    required this.memberCount,
    required this.memberBalances,
    required this.isFullySettled,
    required this.totalExpenses,
    this.lastExpenseDate,
  });

  Map<String, dynamic> toJson() => {
    'groupId': groupId,
    'groupName': groupName,
    'totalPending': totalPending,
    'memberCount': memberCount,
    'memberBalances': memberBalances,
    'isFullySettled': isFullySettled,
    'totalExpenses': totalExpenses,
    'lastExpenseDate': lastExpenseDate?.toIso8601String(),
  };
}

/// Behavioral patterns in split expenses
class SplitBehaviorAnalysis {
  final bool alwaysPaysFirst;           // True if user pays >70% of time
  final bool lendsEasily;               // True if often pays for others
  final double avgSettlementDelay;      // Average days to settle
  final String? mostExpensiveFriend;    // Friend with highest total expenses
  final String? mostReliableFriend;     // Friend who settles fastest
  final String? mostDelayedFriend;      // Friend who delays most
  final double socialSpendingPct;       // % of total expenses that are splits

  const SplitBehaviorAnalysis({
    required this.alwaysPaysFirst,
    required this.lendsEasily,
    required this.avgSettlementDelay,
    this.mostExpensiveFriend,
    this.mostReliableFriend,
    this.mostDelayedFriend,
    required this.socialSpendingPct,
  });

  Map<String, dynamic> toJson() => {
    'alwaysPaysFirst': alwaysPaysFirst,
    'lendsEasily': lendsEasily,
    'avgSettlementDelay': avgSettlementDelay,
    'mostExpensiveFriend': mostExpensiveFriend,
    'mostReliableFriend': mostReliableFriend,
    'mostDelayedFriend': mostDelayedFriend,
    'socialSpendingPct': socialSpendingPct,
  };
}

/// Risk flags for split expenses
class SplitRisk {
  final String type;                    // DELAYED_PAYMENT, HIGH_PENDING, IMBALANCED_FRIEND
  final String description;
  final String? friendPhone;
  final double? amount;
  final int? days;

  const SplitRisk({
    required this.type,
    required this.description,
    this.friendPhone,
    this.amount,
    this.days,
  });

  Map<String, dynamic> toJson() => {
    'type': type,
    'description': description,
    if (friendPhone != null) 'friendPhone': friendPhone,
    if (amount != null) 'amount': amount,
    if (days != null) 'days': days,
  };
}

/// Complete enhanced split report
class EnhancedSplitReport {
  final Map<String, FriendSplitDetail> friendDetails;
  final Map<String, GroupSplitDetail> groupDetails;
  final SplitBehaviorAnalysis behavior;
  final List<SplitRisk> risks;
  final double totalPendingReceivable;  // Total owed to you
  final double totalPendingPayable;     // Total you owe
  final double netPosition;             // Receivable - Payable

  const EnhancedSplitReport({
    required this.friendDetails,
    required this.groupDetails,
    required this.behavior,
    required this.risks,
    required this.totalPendingReceivable,
    required this.totalPendingPayable,
    required this.netPosition,
  });

  Map<String, dynamic> toJson() => {
    'friendDetails': friendDetails.map((k, v) => MapEntry(k, v.toJson())),
    'groupDetails': groupDetails.map((k, v) => MapEntry(k, v.toJson())),
    'behavior': behavior.toJson(),
    'risks': risks.map((r) => r.toJson()).toList(),
    'totalPendingReceivable': totalPendingReceivable,
    'totalPendingPayable': totalPendingPayable,
    'netPosition': netPosition,
  };

  /// Empty report when no split expenses
  static EnhancedSplitReport empty() => const EnhancedSplitReport(
    friendDetails: {},
    groupDetails: {},
    behavior: SplitBehaviorAnalysis(
      alwaysPaysFirst: false,
      lendsEasily: false,
      avgSettlementDelay: 0,
      socialSpendingPct: 0,
    ),
    risks: [],
    totalPendingReceivable: 0,
    totalPendingPayable: 0,
    netPosition: 0,
  );
}
