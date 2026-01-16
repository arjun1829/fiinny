import 'package:flutter/material.dart';
import '../models/expense_item.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';

class ActivityTab extends StatelessWidget {
  final List<ExpenseItem> expenses;
  final List<FriendModel> friends;
  final List<GroupModel> groups;
  final String userId;

  const ActivityTab({
    super.key,
    required this.expenses,
    required this.friends,
    required this.groups,
    required this.userId,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final friendsById = {for (final f in friends) f.id: f};
    final groupsById = {for (final g in groups) g.id: g};
    final sortedExpenses = List<ExpenseItem>.from(expenses)
      ..sort((a, b) => b.date.compareTo(a.date));

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 10, bottom: 40),
        itemCount: sortedExpenses.length,
        separatorBuilder: (_, __) => const SizedBox(height: 5),
        itemBuilder: (context, idx) {
          final e = sortedExpenses[idx];
          final dateStr = "${e.date.day}/${e.date.month}/${e.date.year}";
          final isSettlement = e.type == "Settlement";
          final payer = friendsById[e.payerId];
          final avatar = isSettlement
              ? Icon(Icons.compare_arrows_rounded,
                  size: 32, color: Colors.teal[700])
              : (payer != null
                  ? CircleAvatar(
                      backgroundColor: Colors.teal[100],
                      child: Text(
                        payer.name.isNotEmpty
                            ? payer.name[0].toUpperCase()
                            : "U",
                        style: const TextStyle(
                            color: Colors.teal, fontWeight: FontWeight.bold),
                      ),
                    )
                  : CircleAvatar(
                      backgroundColor: Colors.teal[50],
                      child: const Icon(Icons.person, color: Colors.teal),
                    ));

          return Card(
            margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
            elevation: 2,
            color: Colors.white,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
            child: ListTile(
              leading: avatar,
              title: Text(
                _describeExpense(e, friendsById, groupsById, userId),
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  fontSize: 15.5,
                  color: Colors.teal[900],
                ),
              ),
              subtitle: Row(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      color: isSettlement
                          ? Colors.orange.withValues(alpha: 0.12)
                          : Colors.teal.withValues(alpha: 0.09),
                      borderRadius: BorderRadius.circular(7),
                    ),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
                    child: Text(
                      isSettlement ? "Settlement" : "Expense",
                      style: TextStyle(
                        color: isSettlement
                            ? Colors.orange[700]
                            : Colors.teal[700],
                        fontWeight: FontWeight.w600,
                        fontSize: 12.8,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    dateStr,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
              trailing: Text(
                "₹${e.amount.toStringAsFixed(0)}",
                style: TextStyle(
                  color: isSettlement ? Colors.orange[700] : Colors.teal[700],
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  String _describeExpense(
    ExpenseItem e,
    Map<String, FriendModel> friendsById,
    Map<String, GroupModel> groupsById,
    String userId,
  ) {
    final payer = friendsById[e.payerId]?.name ??
        (e.payerId == userId ? "You" : "Someone");
    final isYouPayer = e.payerId == userId;
    final group = e.groupId != null ? groupsById[e.groupId!] : null;
    final groupName = group != null ? ' in "${group.name}"' : "";

    if (e.type == "Settlement") {
      final receivers = e.friendIds
          .map((id) =>
              friendsById[id]?.name ?? (id == userId ? "You" : "someone"))
          .toList();
      if (isYouPayer) {
        if (receivers.length == 1) {
          return "You settled with ${receivers.first}$groupName";
        } else {
          return "You settled with ${receivers.join(', ')}$groupName";
        }
      } else if (e.friendIds.contains(userId)) {
        return "$payer settled with you$groupName";
      } else {
        return "$payer settled with ${receivers.join(', ')}$groupName";
      }
    } else {
      if (isYouPayer) {
        if (e.friendIds.length == 1) {
          final friend = friendsById[e.friendIds.first];
          return "You paid for ${friend?.name ?? "someone"}$groupName";
        } else if (e.friendIds.isNotEmpty) {
          final names = e.friendIds
              .map((id) => friendsById[id]?.name ?? "someone")
              .toList();
          return "You paid for ${names.join(', ')}$groupName";
        }
        return "You added an expense$groupName";
      } else {
        if (e.friendIds.contains(userId)) {
          return "$payer paid for you$groupName";
        }
        return "$payer added an expense$groupName";
      }
    }
  }
}
