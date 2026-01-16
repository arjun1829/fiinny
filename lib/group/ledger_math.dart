import '../models/expense_item.dart';

bool _looksLikeSettlement(ExpenseItem e) {
  final type = e.type.toLowerCase();
  final label = (e.label ?? '').toLowerCase();
  if (type.contains('settle') || label.contains('settle')) {
    return true;
  }
  if (e.isBill == true && e.friendIds.length == 1) {
    return true;
  }
  return false;
}

Set<String> _participantsFor(ExpenseItem e) {
  final participants = <String>{};
  if (e.payerId.trim().isNotEmpty) {
    participants.add(e.payerId.trim());
  }
  participants.addAll(e.friendIds.where((id) => id.trim().isNotEmpty));
  if (e.customSplits != null) {
    participants
        .addAll(e.customSplits!.keys.where((id) => id.trim().isNotEmpty));
  }
  return participants;
}

Map<String, double> _equalSplit(double amount, Set<String> participants) {
  if (participants.isEmpty) {
    return const {};
  }
  final share = amount / participants.length;
  final rounded = double.parse(share.toStringAsFixed(2));
  return {for (final p in participants) p: rounded};
}

Map<String, double> _settlementSplit(ExpenseItem e, Set<String> participants) {
  if (participants.length != 2) {
    return _equalSplit(e.amount, participants);
  }
  final payer = e.payerId;
  final other =
      participants.firstWhere((id) => id != payer, orElse: () => payer);
  return {
    payer: 0.0,
    other: double.parse(e.amount.toStringAsFixed(2)),
  };
}

/// +ve => other owes YOU. -ve => YOU owe other.
double netBetween(String you, String other, List<ExpenseItem> tx) {
  double net = 0.0;

  for (final expense in tx) {
    final participants = _participantsFor(expense);
    if (!participants.contains(you) || !participants.contains(other)) {
      continue;
    }

    Map<String, double> splits;
    if (expense.customSplits != null && expense.customSplits!.isNotEmpty) {
      splits = Map<String, double>.from(expense.customSplits!);
    } else if (_looksLikeSettlement(expense)) {
      splits = _settlementSplit(expense, participants);
    } else {
      splits = _equalSplit(expense.amount, participants);
    }

    final yourShare = splits[you] ?? 0.0;
    final otherShare = splits[other] ?? 0.0;

    if (expense.payerId == you) {
      net += otherShare;
    } else if (expense.payerId == other) {
      net -= yourShare;
    }
  }

  return double.parse(net.toStringAsFixed(2));
}

Map<String, double> pairwiseNetForUserInGroup(
  List<ExpenseItem> tx,
  String you,
  String groupId,
) {
  final scoped = tx.where((e) => (e.groupId ?? '').trim() == groupId).toList();
  final members = <String>{};
  for (final expense in scoped) {
    members.addAll(_participantsFor(expense));
  }
  members.removeWhere((id) => id.isEmpty || id == you);

  final result = <String, double>{};
  for (final member in members) {
    final net = netBetween(you, member, scoped);
    if (net.abs() >= 0.005) {
      result[member] = net;
    }
  }
  return result;
}

({double youOwe, double owedToYou, double net}) summarizeForHeader(
    Map<String, double> pairwise) {
  double youOwe = 0.0;
  double owedToYou = 0.0;
  for (final value in pairwise.values) {
    if (value > 0) {
      owedToYou += value;
    } else if (value < 0) {
      youOwe += -value;
    }
  }

  double round2(double v) => double.parse(v.toStringAsFixed(2));

  youOwe = round2(youOwe);
  owedToYou = round2(owedToYou);
  final net = round2(owedToYou - youOwe);

  if (net.abs() < 0.01 && youOwe.abs() < 0.01 && owedToYou.abs() < 0.01) {
    return (youOwe: 0.0, owedToYou: 0.0, net: 0.0);
  }

  return (youOwe: youOwe, owedToYou: owedToYou, net: net);
}
