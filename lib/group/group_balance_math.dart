// lib/group/group_balance_math.dart
import '../models/expense_item.dart';

class MemberTotals {
  double paid;
  double share;
  double get net => paid - share;

  MemberTotals({this.paid = 0.0, this.share = 0.0});

  void addPaid(double v) => paid += v;
  void addShare(double v) => share += v;
}

/// Returns a map phone -> split amount for an expense.
/// Uses customSplits when present, otherwise equal split among payer + friendIds.
Map<String, double> computeSplits(ExpenseItem e) {
  if (e.customSplits != null && e.customSplits!.isNotEmpty) {
    return Map<String, double>.from(e.customSplits!);
  }
  final participants = <String>{e.payerId, ...e.friendIds}.toList();
  if (participants.isEmpty) return {};
  final each = e.amount / participants.length;
  return {for (final id in participants) id: each};
}

/// phone -> net (paid - share)
Map<String, double> computeNetByMember(List<ExpenseItem> expenses) {
  final totals = computeMemberTotals(expenses);
  // Light rounding to avoid tiny FP drift in UI
  return {
    for (final e in totals.entries)
      e.key: double.parse(e.value.net.toStringAsFixed(2))
  };
}

/// phone -> (paid, share, net)
Map<String, MemberTotals> computeMemberTotals(List<ExpenseItem> expenses) {
  final map = <String, MemberTotals>{};

  for (final e in expenses) {
    if ((e.payerId).isEmpty) continue;

    if (_isSettlement(e)) {
      // Treat settlement as cash transfer from payer -> others.
      final payer = e.payerId;
      final others = e.friendIds.toSet().where((id) => id.isNotEmpty).toList();
      if (others.isEmpty) continue;

      final amt = e.amount.abs();
      final perOther = amt / others.length;

      // Payer's net goes DOWN by full amount => increase payer's share.
      map.putIfAbsent(payer, () => MemberTotals()).addShare(amt);

      // Each counterparty's net goes UP by their portion => increase their paid.
      for (final o in others) {
        map.putIfAbsent(o, () => MemberTotals()).addPaid(perOther);
      }
      continue;
    }

    // ---------- Normal expense ----------
    // Paid
    map.putIfAbsent(e.payerId, () => MemberTotals()).addPaid(e.amount);

    // Share
    final splits = computeSplits(e);
    splits.forEach((id, share) {
      map.putIfAbsent(id, () => MemberTotals()).addShare(share);
    });
  }

  return map;
}

// ---------- Pairwise net for a specific user (used across screens) ----------
// Positive => they owe YOU; Negative => YOU owe them.
Map<String, double> pairwiseNetForUser(
    List<ExpenseItem> expenses,
    String currentUser, {
      String? onlyGroupId,
    }) {
  final res = <String, double>{};

  double round2(num v) => (v * 100).roundToDouble() / 100.0;
  void add(String k, double v) => res[k] = round2((res[k] ?? 0.0) + v);

  final tx = onlyGroupId == null
      ? expenses
      : expenses.where((e) => (e.groupId ?? '') == onlyGroupId);

  for (final e in tx) {
    if (e.payerId.isEmpty) continue;

    if (_isSettlement(e)) {
      // Settlement = direct transfer between payer and friendIds
      final others = e.friendIds.where((id) => id.isNotEmpty).toList();
      if (others.isEmpty) continue;

      final perOther = e.amount / others.length;

      if (e.payerId == currentUser) {
        // You paid them -> they owe you
        for (final o in others) {
          if (o == currentUser) continue;
          add(o, perOther);
        }
        continue;
      }

      if (others.contains(currentUser)) {
        // They paid you -> you owe them
        add(e.payerId, -perOther);
      }
      continue;
    }

    // ----- Normal expense -----
    final splits = computeSplits(e);
    final participants = splits.keys.toSet();

    // You paid, they participated -> they owe you their share
    if (e.payerId == currentUser) {
      for (final p in participants) {
        if (p == currentUser) continue;
        final share = splits[p] ?? 0.0;
        add(p, share);
      }
      continue;
    }

    // They paid, you participated -> you owe them your share
    if (participants.contains(currentUser)) {
      final yourShare = splits[currentUser] ?? 0.0;
      add(e.payerId, -yourShare);
    }
  }

  // Tidy rounding & drop near-zero noise
  res.updateAll((_, v) => round2(v));
  res.removeWhere((_, v) => v.abs() < 0.005);
  return res;
}

// --------- Helpers ---------
bool _isSettlement(ExpenseItem e) {
  final t = (e.type).toLowerCase();
  final lbl = (e.label ?? '').toLowerCase();
  if (t.contains('settle') || lbl.contains('settle')) return true;

  // Your Settle Up flow: single counterparty, no custom splits, marked as bill/transfer.
  if ((e.friendIds.length == 1) &&
      (e.customSplits == null || e.customSplits!.isEmpty)) {
    return e.isBill == true;
  }
  return false;
}
