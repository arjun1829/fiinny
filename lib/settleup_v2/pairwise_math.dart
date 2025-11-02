import '../models/expense_item.dart';
import '../group/group_balance_math.dart' show computeSplits;

class PairwiseTotals {
  final double owe;
  final double owed;
  final double net;

  const PairwiseTotals({
    required this.owe,
    required this.owed,
    required this.net,
  });
}

class PairwiseBucketTotals {
  final double owe;
  final double owed;

  const PairwiseBucketTotals({
    required this.owe,
    required this.owed,
  });

  double get net => owed - owe;
}

class PairwiseBreakdown {
  final PairwiseTotals totals;
  final Map<String, PairwiseBucketTotals> buckets;

  const PairwiseBreakdown({
    required this.totals,
    required this.buckets,
  });
}

bool isSettlementLike(ExpenseItem e) {
  final type = (e.type).toLowerCase();
  final label = (e.label ?? '').toLowerCase();
  if (type.contains('settle') || label.contains('settle')) return true;
  if ((e.friendIds.length == 1) &&
      (e.customSplits == null || e.customSplits!.isEmpty)) {
    return e.isBill == true;
  }
  return false;
}

bool involvesPair(ExpenseItem e, String you, String friend) {
  if (isSettlementLike(e)) {
    final recipients = e.friendIds;
    final youPaidFriend = e.payerId == you && recipients.contains(friend);
    final friendPaidYou = e.payerId == friend && recipients.contains(you);
    return youPaidFriend || friendPaidYou;
  }
  final splits = computeSplits(e);
  final youPaidFriendIn = (e.payerId == you) && splits.containsKey(friend);
  final friendPaidYouIn = (e.payerId == friend) && splits.containsKey(you);
  return youPaidFriendIn || friendPaidYouIn;
}

List<ExpenseItem> pairwiseExpenses(
  String you,
  String friend,
  Iterable<ExpenseItem> all,
) {
  final list = all.where((e) => involvesPair(e, you, friend)).toList();
  list.sort((a, b) => b.date.compareTo(a.date));
  return list;
}

PairwiseBreakdown computePairwiseBreakdown(
  String you,
  String friend,
  Iterable<ExpenseItem> pairwise,
) {
  double youOwe = 0.0;
  double owedToYou = 0.0;
  final oweByBucket = <String, double>{};
  final owedByBucket = <String, double>{};

  String bucketId(String? groupId) =>
      (groupId == null || groupId.isEmpty) ? '__none__' : groupId;

  for (final e in pairwise) {
    final bucket = bucketId(e.groupId);

    if (isSettlementLike(e)) {
      if (e.payerId == you) {
        owedToYou += e.amount;
        owedByBucket[bucket] = (owedByBucket[bucket] ?? 0) + e.amount;
      } else if (e.payerId == friend) {
        youOwe += e.amount;
        oweByBucket[bucket] = (oweByBucket[bucket] ?? 0) + e.amount;
      }
      continue;
    }

    final splits = computeSplits(e);
    final yourShare = splits[you] ?? 0.0;
    final theirShare = splits[friend] ?? 0.0;

    if (e.payerId == you) {
      owedToYou += theirShare;
      owedByBucket[bucket] = (owedByBucket[bucket] ?? 0) + theirShare;
    } else if (e.payerId == friend) {
      youOwe += yourShare;
      oweByBucket[bucket] = (oweByBucket[bucket] ?? 0) + yourShare;
    }
  }

  double round2(double value) => double.parse(value.toStringAsFixed(2));
  bool isSettled(double owed, double owe) => (owed - owe).abs() < 0.01;

  youOwe = round2(youOwe);
  owedToYou = round2(owedToYou);
  double net = round2(owedToYou - youOwe);

  if (isSettled(owedToYou, youOwe)) {
    youOwe = 0.0;
    owedToYou = 0.0;
    net = 0.0;
  }

  final buckets = <String, PairwiseBucketTotals>{};
  final bucketKeys = {...oweByBucket.keys, ...owedByBucket.keys};
  for (final key in bucketKeys) {
    final owe = round2(oweByBucket[key] ?? 0.0);
    final owed = round2(owedByBucket[key] ?? 0.0);
    if (isSettled(owed, owe)) {
      buckets[key] = const PairwiseBucketTotals(owe: 0.0, owed: 0.0);
    } else {
      buckets[key] = PairwiseBucketTotals(owe: owe, owed: owed);
    }
  }

  return PairwiseBreakdown(
    totals: PairwiseTotals(owe: youOwe, owed: owedToYou, net: net),
    buckets: buckets,
  );
}
