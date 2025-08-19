// lib/group/group_totals_tab.dart
import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../models/expense_item.dart';
import '../group/group_balance_math.dart' show pairwiseNetForUser;

class GroupTotalsTab extends StatelessWidget {
  final String currentUserPhone;
  final GroupModel group;
  final List<FriendModel> members;
  final List<ExpenseItem> expenses;

  final VoidCallback? onAddExpense;
  final VoidCallback? onSettleUp;
  final VoidCallback? onRemind;

  const GroupTotalsTab({
    Key? key,
    required this.currentUserPhone,
    required this.group,
    required this.members,
    required this.expenses,
    this.onAddExpense,
    this.onSettleUp,
    this.onRemind,
  }) : super(key: key);

  FriendModel _friend(String phone) {
    try {
      return members.firstWhere((f) => f.phone == phone);
    } catch (_) {
      return FriendModel(phone: phone, name: phone, avatar: '👤');
    }
  }

  String _initial(String s) =>
      s.trim().isEmpty ? '?' : s.trim().substring(0, 1).toUpperCase();

  Widget _chip(Color bg, Color fg, IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Pairwise net from *your* POV for THIS group only:
    // + => they owe YOU, - => YOU owe them
    final pairNet = pairwiseNetForUser(expenses, currentUserPhone, onlyGroupId: group.id);

    final rows = pairNet.entries.toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs()));

    // Totals for header chips
    double owedToYou = 0, youOwe = 0;
    for (final v in pairNet.values) {
      if (v > 0) owedToYou += v;
      if (v < 0) youOwe += (-v);
    }
    final net = owedToYou - youOwe;

    // Transactions count for this group
    final txCount = expenses.where((e) => (e.groupId ?? '') == group.id).length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        // --- Header chips (You vs group) ---
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _chip(
              owedToYou > 0 ? Colors.green.withOpacity(.12) : Colors.grey.withOpacity(.12),
              owedToYou > 0 ? Colors.green.shade700 : Colors.grey.shade700,
              Icons.call_received_rounded,
              owedToYou > 0
                  ? "Owed to you ₹${owedToYou.toStringAsFixed(0)}"
                  : "No one owes you",
            ),
            _chip(
              youOwe > 0 ? Colors.red.withOpacity(.12) : Colors.grey.withOpacity(.12),
              youOwe > 0 ? Colors.redAccent : Colors.grey.shade700,
              Icons.call_made_rounded,
              youOwe > 0 ? "You owe ₹${youOwe.toStringAsFixed(0)}" : "You owe none",
            ),
            _chip(
              net >= 0 ? Colors.teal.withOpacity(.12) : Colors.orange.withOpacity(.12),
              net >= 0 ? Colors.teal.shade800 : Colors.orange.shade800,
              Icons.balance_rounded,
              net >= 0 ? "Net +₹${net.toStringAsFixed(0)}" : "Net -₹${(-net).toStringAsFixed(0)}",
            ),
            _chip(
              Colors.indigo.withOpacity(.08),
              Colors.indigo.shade900,
              Icons.receipt_long,
              "Transactions $txCount",
            ),
          ],
        ),
        const SizedBox(height: 16),

        // --- Quick actions ---
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: onAddExpense,
                icon: const Icon(Icons.add),
                label: const Text("Add Expense"),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: onSettleUp,
                icon: const Icon(Icons.handshake),
                label: const Text("Settle Up"),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal.shade800,
                  foregroundColor: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filled(
              onPressed: onRemind,
              style: ButtonStyle(
                backgroundColor: MaterialStatePropertyAll(Colors.orange.shade600),
              ),
              icon: const Icon(Icons.notifications_active_rounded, color: Colors.white),
              tooltip: 'Send reminder',
            ),
          ],
        ),
        const SizedBox(height: 16),

        // --- Per-member sentences (skip zeros) ---
        Text(
          "Balances by member",
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.teal.shade900),
        ),
        const SizedBox(height: 8),

        if (rows.isEmpty)
          Text("All settled for now.", style: TextStyle(color: Colors.grey[700]))
        else
          ...rows.map((e) {
            final phone = e.key;
            final amount = e.value; // + => they owe you, - => you owe them
            final f = _friend(phone);

            final displayName = phone == currentUserPhone
                ? 'You'
                : (f.name.isNotEmpty ? f.name : phone);

            final avatarUrl = f.avatar;
            final leading = avatarUrl.startsWith('http')
                ? CircleAvatar(backgroundImage: NetworkImage(avatarUrl))
                : CircleAvatar(child: Text(_initial(displayName)));

            final sentence = amount > 0
                ? "$displayName owes you ₹${amount.toStringAsFixed(2)}"
                : "You owe $displayName ₹${(-amount).toStringAsFixed(2)}";

            final amtColor = amount > 0 ? Colors.teal.shade800 : Colors.redAccent;

            return Container(
              margin: const EdgeInsets.symmetric(vertical: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(.05),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  )
                ],
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Row(
                children: [
                  leading,
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      sentence,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Text(
                    "₹${amount.abs().toStringAsFixed(0)}",
                    style: TextStyle(fontWeight: FontWeight.w800, color: amtColor),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}
