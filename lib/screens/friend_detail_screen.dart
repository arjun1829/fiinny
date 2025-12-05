// lib/friends/screens/friend_detail_screen.dart

import 'package:flutter/material.dart';
import '../models/friend_model.dart';
import '../services/expense_service.dart';
import '../services/balance_service.dart';
import '../widgets/activity_feed_widget.dart';
import '../widgets/settleup_dialog.dart';
import '../services/activity_service.dart'; // ActivityItem, ActivityType
import '../models/expense_item.dart';
import '../../sharing/widgets/partner_chat_tab.dart'; // <-- reuse the same chat

class FriendDetailScreen extends StatefulWidget {
  final String userId;
  final FriendModel friend;

  const FriendDetailScreen({
    Key? key,
    required this.userId,
    required this.friend,
  }) : super(key: key);

  @override
  State<FriendDetailScreen> createState() => _FriendDetailScreenState();
}

class _FriendDetailScreenState extends State<FriendDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final friend = widget.friend;

    return Scaffold(
      appBar: AppBar(
        title: Text(friend.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.handshake_rounded),
            tooltip: 'Settle Up',
            onPressed: () {
              showDialog(
                context: context,
                builder: (context) => SettleUpDialog(
                  userPhone: widget.userId,
                  friends: [friend],
                  groups: const [],
                ),
              );
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          labelColor: Theme.of(context).colorScheme.primary,
          unselectedLabelColor: Theme.of(context).textTheme.bodyMedium?.color?.withOpacity(0.7),
          indicatorColor: Theme.of(context).colorScheme.primary,
          tabs: const [
            Tab(text: 'Activity'),
            Tab(text: 'Chat'),
          ],
        ),
      ),

      body: Column(
        children: [
          // --- Net balance card (subtle, glossy-ish) ---
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: StreamBuilder<BalanceResult>(
              stream: BalanceService().streamUserBalances(widget.userId),
              builder: (context, snapshot) {
                double net = 0;
                if (snapshot.hasData) {
                  net = snapshot.data!.perFriendNet[friend.phone] ?? 0.0;
                }
                final positive = net >= 0;
                final color = positive ? Colors.green : Colors.redAccent;

                return Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    color: Theme.of(context).cardColor,
                    boxShadow: [
                      BoxShadow(
                        color: Theme.of(context).shadowColor.withOpacity(0.06),
                        blurRadius: 14,
                        offset: const Offset(0, 8),
                      ),
                    ],
                    border: Border.all(color: Theme.of(context).dividerColor.withOpacity(0.5)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
                    child: Column(
                      children: [
                        Text(
                          positive ? "Owed to You" : "You Owe",
                          style: TextStyle(
                            fontSize: 14.5,
                            color: color,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "₹${net.abs().toStringAsFixed(2)}",
                          style: TextStyle(
                            fontSize: 22,
                            color: color,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          const Divider(height: 1),

          // --- Tabs content ---
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                // ACTIVITY TAB
                StreamBuilder<List<ExpenseItem>>(
                  stream: ExpenseService().getExpensesStream(widget.userId),
                  builder: (context, snapshot) {
                    final txs = (snapshot.data ?? [])
                        .where((e) =>
                    e.friendIds.contains(friend.phone) ||
                        e.payerId == friend.phone)
                        .toList();

                    final activities = txs.map((e) {
                      final isSettle = e.isBill ||
                          (e.label ?? '').toLowerCase().contains('settle');
                      return ActivityItem(
                        id: e.id,
                        type: isSettle ? ActivityType.settleup : ActivityType.expense,
                        amount: e.amount,
                        label: e.label ?? e.type,
                        note: e.note,
                        date: e.date,
                        friendId: friend.phone,
                        groupId: e.groupId,
                        payerId: e.payerId,
                        receiverId: null,
                        isSettleUp: isSettle,
                      );
                    }).toList();

                    return ActivityFeedWidget(activities: activities);
                  },
                ),

                // CHAT TAB — reuses the same chat thread as partner screen
                PartnerChatTab(
                  partnerUserId: friend.phone,   // friend is the peer
                  currentUserId: widget.userId,  // me
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
