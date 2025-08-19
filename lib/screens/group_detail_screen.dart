import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/balance_service.dart';
import '../widgets/activity_feed_widget.dart';
import '../widgets/settleup_dialog.dart';
import '../services/activity_service.dart'; // <-- brings in ActivityItem, ActivityType
import '../widgets/activity_feed_widget.dart';
import '../models/expense_item.dart';        // already used, keep this import


class GroupDetailScreen extends StatelessWidget {
  final String userId;
  final GroupModel group;

  const GroupDetailScreen({
    Key? key,
    required this.userId,
    required this.group,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(group.name),
        actions: [
          IconButton(
            icon: Icon(Icons.handshake_rounded),
            tooltip: 'Settle Up',
            onPressed: () {
              // Settle up with any group member
              showDialog(
                context: context,
                builder: (context) => SettleUpDialog(
                  userPhone: userId,
                  friends: [], // For group, you may want to filter only group members (excluding self)
                  groups: [group],
                ),
              );
            },
          )
        ],
      ),
      body: Column(
        children: [
          // Live per-member group balances
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
            child: StreamBuilder<BalanceResult>(
              stream: BalanceService().streamUserBalances(userId),
              builder: (context, snapshot) {
                final groupBalances = snapshot.data?.perGroupNet ?? {};
                final net = groupBalances[group.id] ?? 0.0;
                final color = net >= 0 ? Colors.blue : Colors.redAccent;
                return Card(
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                  color: color.withOpacity(0.14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
                    child: Column(
                      children: [
                        Text(
                          net >= 0 ? "Owed to You" : "You Owe Group",
                          style: TextStyle(fontSize: 15, color: color, fontWeight: FontWeight.bold),
                        ),
                        SizedBox(height: 4),
                        Text(
                          "₹${net.abs().toStringAsFixed(2)}",
                          style: TextStyle(fontSize: 23, color: color, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Divider(height: 2),
          // List all transactions in this group
          Expanded(
            child: StreamBuilder<List<ExpenseItem>>(
              stream: ExpenseService().getGroupExpensesStream(userId, group.id),
              builder: (context, snapshot) {
                final txs = snapshot.data ?? [];
                return ActivityFeedWidget(
                  activities: txs.map((e) =>
                      ActivityItem(
                        id: e.id,
                        type: e.isBill || (e.label ?? '').toLowerCase().contains('settle')
                            ? ActivityType.settleup
                            : ActivityType.expense,
                        amount: e.amount,
                        label: e.label ?? e.type,
                        note: e.note,
                        date: e.date,
                        friendId: null,
                        groupId: group.id,
                        payerId: e.payerId,
                        receiverId: null,
                        isSettleUp: e.isBill || (e.label ?? '').toLowerCase().contains('settle'),
                      ),
                  ).toList(),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
