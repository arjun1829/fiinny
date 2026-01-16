// lib/group/expense_breakdown_sheet.dart
import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';

// keep the logic consistent across app
import '../group/group_balance_math.dart'
    show computeSplits, looksLikeSettlement;

/// A bottom sheet that explains an expense like Splitwise:
/// - who paid
/// - how many people it's split among (for normal bills)
/// - each member's share
/// - who owes whom / who paid/received (for settlements)
///
/// Pass a member index so we can resolve names/avatars for phones in the expense.
class ExpenseBreakdownSheet extends StatelessWidget {
  final ExpenseItem expense;
  final String currentUserPhone;
  final Map<String, FriendModel> membersByPhone; // phone -> FriendModel

  const ExpenseBreakdownSheet({
    super.key,
    required this.expense,
    required this.currentUserPhone,
    required this.membersByPhone,
  });

  @override
  Widget build(BuildContext context) {
    final isSettlement = looksLikeSettlement(expense);

    // Participants (payer + friendIds). For custom splits that include
    // someone not in friendIds (rare), computeSplits() already covers that.
    final participants = <String>{expense.payerId, ...expense.friendIds}
        .toList()
      ..sort((a, b) =>
          _nameOf(a).toLowerCase().compareTo(_nameOf(b).toLowerCase()));

    // Display amounts per member
    Map<String, double> perMember;
    double sumShown;

    if (isSettlement) {
      // Treat as transfer: payer -> friendIds (equally if many).
      final others = expense.friendIds.where((id) => id.isNotEmpty).toList();
      final amt = expense.amount.abs();
      final perOther = others.isEmpty ? 0.0 : amt / others.length;

      perMember = {
        expense.payerId: _round2(amt),
        for (final o in others) o: _round2(perOther),
      };
      sumShown = _round2(amt);
    } else {
      // Normal bill: use shared helper (payer absorbs rounding delta).
      final splits = computeSplits(expense);
      perMember = {
        for (final e in splits.entries) e.key: _round2(e.value),
      };
      sumShown = _round2(perMember.values.fold(0.0, (a, b) => a + b));
    }

    final payerName = _displayName(expense.payerId);
    final splitCount = participants.length;
    final payerShare = perMember[expense.payerId] ?? 0.0;
    final payerGetsBack =
        isSettlement ? 0.0 : _round2(expense.amount - payerShare);

    final title = expense.label?.isNotEmpty == true
        ? expense.label!
        : (expense.type.isNotEmpty
            ? expense.type
            : (isSettlement ? 'Settlement' : 'Expense'));

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Title row
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.teal.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      "₹${expense.amount.toStringAsFixed(2)}",
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, color: Colors.teal),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Meta chips
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _chip(icon: Icons.person, label: "Paid by $payerName"),
                  if (!isSettlement)
                    _chip(
                        icon: Icons.people_alt_rounded,
                        label: "Split among $splitCount")
                  else
                    _chip(icon: Icons.swap_horiz_rounded, label: "Settlement"),
                  if ((expense.category ?? '').isNotEmpty)
                    _chip(
                        icon: Icons.category_outlined,
                        label: expense.category!),
                  _chip(
                      icon: Icons.calendar_today,
                      label: _dateStr(expense.date)),
                ],
              ),

              if (expense.note.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(expense.note,
                    style: TextStyle(color: Colors.grey.shade800)),
              ],

              const SizedBox(height: 14),
              Divider(color: Colors.grey.shade300, height: 1),
              const SizedBox(height: 8),

              Text(
                isSettlement ? "Settlement details" : "Who owes what",
                style: TextStyle(
                    fontWeight: FontWeight.w800, color: Colors.teal.shade900),
              ),
              const SizedBox(height: 8),

              // Per member details
              ...participants.map((phone) {
                final isPayer = phone == expense.payerId;
                final amt = (perMember[phone] ?? 0.0).abs();

                // Line text
                String lineText;
                TextStyle lineStyle;

                if (isSettlement) {
                  if (isPayer) {
                    final others = participants
                        .where((p) => p != expense.payerId)
                        .toList();
                    final joined =
                        _joinNames(others.map(_displayName).toList());
                    lineText =
                        "Paid $joined ₹${expense.amount.abs().toStringAsFixed(2)}";
                    lineStyle = TextStyle(
                      fontSize: 12,
                      color: Colors.teal.shade700,
                      fontWeight: FontWeight.w600,
                    );
                  } else {
                    lineText =
                        "Received from $payerName ₹${_perOtherSettlementShare().toStringAsFixed(2)}";
                    lineStyle = const TextStyle(
                      fontSize: 12,
                      color: Colors.green,
                      fontWeight: FontWeight.w600,
                    );
                  }
                } else {
                  if (isPayer) {
                    lineText = "Gets ₹${payerGetsBack.toStringAsFixed(2)} back";
                    lineStyle = TextStyle(
                      fontSize: 12,
                      color: Colors.teal.shade700,
                      fontWeight: FontWeight.w600,
                    );
                  } else {
                    lineText = "Owes $payerName ₹${amt.toStringAsFixed(2)}";
                    lineStyle = const TextStyle(
                      fontSize: 12,
                      color: Colors.redAccent,
                      fontWeight: FontWeight.w600,
                    );
                  }
                }

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      _avatar(phone),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_displayName(phone),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700)),
                            Text(lineText, style: lineStyle),
                          ],
                        ),
                      ),
                      Text(
                        "₹${amt.toStringAsFixed(2)}",
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          // tint a bit to match semantics
                          color: isSettlement
                              ? (isPayer
                                  ? Colors.teal.shade800
                                  : Colors.green.shade800)
                              : (isPayer
                                  ? Colors.teal.shade800
                                  : Colors.grey.shade900),
                        ),
                      ),
                    ],
                  ),
                );
              }),

              const SizedBox(height: 10),
              Divider(color: Colors.grey.shade200, height: 1),
              const SizedBox(height: 10),

              // Footer / totals
              Row(
                children: [
                  Expanded(
                    child: Text(
                      isSettlement ? "Transfer amount" : "Shares total",
                      style: TextStyle(
                          color: Colors.grey.shade800,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                  Text(
                    "₹${(isSettlement ? expense.amount.abs() : sumShown).toStringAsFixed(2)}",
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              if (!isSettlement &&
                  (_diff(expense.amount, sumShown)).abs() > 0.01) ...[
                const SizedBox(height: 4),
                Text(
                  "Note: shares don’t add up exactly due to rounding.",
                  style: TextStyle(fontSize: 12, color: Colors.orange.shade700),
                ),
              ],

              const SizedBox(height: 6),
            ],
          ),
        ),
      ),
    );
  }

  // ---------- helpers ----------

  double _perOtherSettlementShare() {
    final others = expense.friendIds.where((id) => id.isNotEmpty).toList();
    if (others.isEmpty) {
      return 0.0;
    }
    return _round2(expense.amount.abs() / others.length);
  }

  String _joinNames(List<String> names) {
    if (names.isEmpty) {
      return '';
    }
    if (names.length == 1) {
      return names.first;
    }
    if (names.length == 2) {
      return "${names[0]} and ${names[1]}";
    }
    return "${names[0]}, ${names[1]} and ${names.length - 2} others";
  }

  String _nameOf(String phone) {
    final f = membersByPhone[phone];
    return (f != null && f.name.isNotEmpty) ? f.name : phone;
  }

  String _displayName(String phone) =>
      phone == currentUserPhone ? "You" : _nameOf(phone);

  String _dateStr(DateTime? d) {
    if (d == null) {
      return '';
    }
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return "$y-$m-$day";
  }

  Widget _chip({required IconData icon, required String label}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.grey.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.grey.shade800),
          const SizedBox(width: 6),
          Text(label,
              style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade900,
                  fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _avatar(String phone) {
    final f = membersByPhone[phone];
    final avatarUrl = f?.avatar ?? '';
    if (avatarUrl.startsWith('http')) {
      return CircleAvatar(radius: 16, backgroundImage: NetworkImage(avatarUrl));
    }
    final initial =
        (f?.name.isNotEmpty == true) ? f!.name.characters.first : '👤';
    return CircleAvatar(
        radius: 16, child: Text(initial, style: const TextStyle(fontSize: 14)));
  }

  double _round2(double v) => (v * 100).roundToDouble() / 100.0;
  double _diff(double a, double b) => _round2(a - b);
}
