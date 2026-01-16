import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../models/expense_item.dart';
import '../details/group_detail_screen.dart';

class GroupsTab extends StatelessWidget {
  final List<GroupModel> groups;
  final Map<String, FriendModel> friendsById;
  final String userId;
  final List<ExpenseItem> expenses;
  final VoidCallback onRefresh;

  const GroupsTab({
    Key? key,
    required this.groups,
    required this.friendsById,
    required this.userId,
    required this.expenses,
    required this.onRefresh,
  }) : super(key: key);

  Widget _groupSummary(BuildContext context, GroupModel group) {
    double youNet = 0;
    for (final exp in expenses.where((e) => e.groupId == group.id)) {
      final splitCount = exp.friendIds.length + 1;
      final splitAmt = exp.amount / splitCount;
      if (exp.type == "Settlement") {
        if (exp.payerId == userId && exp.friendIds.contains(userId)) {
          continue;
        } else if (exp.payerId == userId) {
          youNet += exp.amount;
        } else if (exp.friendIds.contains(userId)) {
          youNet -= exp.amount;
        }
      } else {
        if (exp.payerId == userId) {
          youNet += splitAmt * exp.friendIds.length;
        } else if (exp.friendIds.contains(userId)) {
          youNet -= splitAmt;
        }
      }
    }

    String label;
    Color color;
    if (youNet > 0.5) {
      label = "You’re owed ₹${youNet.toStringAsFixed(0)}";
      color = Colors.green;
    } else if (youNet < -0.5) {
      label = "You owe ₹${(-youNet).toStringAsFixed(0)}";
      color = Colors.red;
    } else {
      label = "Settled";
      color = Colors.grey;
    }

    return Chip(
      label: Text(label,
          style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      backgroundColor: color.withValues(alpha: 0.14),
      shape: const StadiumBorder(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 18, 10),
            child: Text(
              "Groups",
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                fontSize: 20,
                color: theme.textTheme.titleLarge?.color,
              ),
            ),
          ),
          if (groups.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Text(
                "No groups yet. Tap + to add.",
                style: TextStyle(
                    color: Colors.grey[700], fontWeight: FontWeight.w500),
              ),
            )
          else
            ...groups.map((g) => Card(
                  margin:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  elevation: 2.5,
                  color: Colors.white,
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.teal[100],
                      radius: 22,
                      child: Icon(Icons.groups_rounded,
                          color: theme.primaryColor, size: 28),
                    ),
                    title: Text(
                      g.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        fontSize: 16.5,
                      ),
                    ),
                    subtitle: Text(
                      "Members: ${g.memberIds.length}",
                      style: TextStyle(color: Colors.teal[800], fontSize: 13.5),
                    ),
                    trailing: _groupSummary(context, g),
                    onTap: () async {
                      final result = await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => GroupDetailScreen(
                            userId: userId,
                            group: g,
                            friendsById: friendsById,
                          ),
                        ),
                      );
                      if (result == true) onRefresh();
                    },
                  ),
                )),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
