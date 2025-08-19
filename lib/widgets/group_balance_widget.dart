// lib/widgets/group_balance_widget.dart

import 'package:flutter/material.dart';
import '../models/friend_model.dart';

class GroupBalanceWidget extends StatelessWidget {
  final Map<String, double> netBalances; // userId -> balance (+ve means owed to user, -ve means user owes)
  final List<FriendModel> members;
  final String currentUserId;

  const GroupBalanceWidget({
    Key? key,
    required this.netBalances,
    required this.members,
    required this.currentUserId,
  }) : super(key: key);

  FriendModel? _findMember(String id) =>
      members.firstWhere((f) => f.phone == id, orElse: () => FriendModel(phone: id, name: "Unknown", avatar: "👤"));

  @override
  Widget build(BuildContext context) {
    if (members.isEmpty || netBalances.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(18),
        child: Text("No balances to show."),
      );
    }

    // Show your balance at top, then others
    final entries = netBalances.entries.toList()
      ..sort((a, b) {
        if (a.key == currentUserId) return -1;
        if (b.key == currentUserId) return 1;
        return a.value.abs().compareTo(b.value.abs()) * -1;
      });

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      margin: const EdgeInsets.only(bottom: 22),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Group Balances", style: Theme.of(context).textTheme.titleMedium),
            SizedBox(height: 10),
            ...entries.map((entry) {
              final m = _findMember(entry.key);
              final isYou = entry.key == currentUserId;
              final amount = entry.value;
              final color = amount == 0
                  ? Colors.grey
                  : amount > 0
                  ? Colors.green
                  : Colors.red;

              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: m != null && m.avatar.isNotEmpty && m.avatar.startsWith('http')
                    ? CircleAvatar(
                  backgroundImage: NetworkImage(m.avatar),
                  radius: 18,
                )
                    : CircleAvatar(
                  radius: 18,
                  child: Text(
                    m?.avatar.isNotEmpty == true
                        ? m!.avatar
                        : m?.name[0].toUpperCase() ?? "👤",
                    style: TextStyle(fontSize: 16),
                  ),
                ),
                title: Text(isYou ? "${m?.name ?? "You"} (You)" : m?.name ?? "Unknown"),
                trailing: Text(
                  amount == 0
                      ? "Settled"
                      : amount > 0
                      ? "Gets ₹${amount.toStringAsFixed(2)}"
                      : "Owes ₹${amount.abs().toStringAsFixed(2)}",
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
