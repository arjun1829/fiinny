import 'package:flutter/material.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/balance_service.dart';
import '../widgets/activity_feed_widget.dart';
import '../widgets/settleup_dialog.dart';
import '../services/activity_service.dart';
import '../models/expense_item.dart';
import 'group_chat_tab.dart';

class GroupDetailScreen extends StatefulWidget {
  final String userId;
  final GroupModel group;

  const GroupDetailScreen({
    Key? key,
    required this.userId,
    required this.group,
  }) : super(key: key);

  @override
  State<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends State<GroupDetailScreen> {
  int _selectedIndex = 3; // Default to Chat (3)

  void _showSettleUpDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => SettleUpDialog(
        userPhone: widget.userId,
        friends: const [],
        groups: [widget.group],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    final backgroundColor =
        const Color(0xFFF1F5F9); // User's requested BG color

    return Scaffold(
      backgroundColor: backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // ------------------------------------------------
            // CUSTOM APP BAR (Minimizing standard AppBar usage to match custom feel if needed,
            // but user code just showed Tab Bar. We'll keep a minimal header for navigation)
            // ------------------------------------------------
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.black),
                    onPressed: () => Navigator.pop(context),
                  ),
                  Text(
                    group.name,
                    style: const TextStyle(
                      color: Colors.black,
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.handshake_rounded,
                        color: Colors.black),
                    tooltip: 'Settle Up',
                    onPressed: () => _showSettleUpDialog(context),
                  ),
                  IconButton(
                    icon: const Icon(Icons.settings, color: Colors.black54),
                    onPressed: () {},
                  )
                ],
              ),
            ),

            // ------------------------------------------------
            // 1. TOP CUSTOM TAB BAR (User's Code)
            // ------------------------------------------------
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10),
              child: Container(
                height: 50,
                decoration: BoxDecoration(
                  color: Colors.grey[200], // Light grey background for tab bar
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    _buildTabItem("History", 0),
                    _buildTabItem("Chart", 1),
                    _buildTabItem("Analytics", 2),
                    _buildTabItem("Chat", 3), // Active tab logic via index
                  ],
                ),
              ),
            ),

            // ------------------------------------------------
            // 2. BODY CONTENT (Switched based on tab)
            // ------------------------------------------------
            Expanded(
              child: _buildBody(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    switch (_selectedIndex) {
      case 0:
        return _buildHistoryTab();
      case 1:
        return const Center(child: Text("Chart View Placeholder"));
      case 2:
        return const Center(child: Text("Analytics View Placeholder"));
      case 3:
        return _buildChatTab();
      default:
        return const SizedBox.shrink();
    }
  }

  // Helper widget for Top Tab Bar Items (Adapted from user code)
  Widget _buildTabItem(String text, int index) {
    final isActive = _selectedIndex == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _selectedIndex = index),
        child: Padding(
          padding: const EdgeInsets.all(4.0),
          child: Container(
            decoration: BoxDecoration(
              color: isActive ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              boxShadow: isActive
                  ? [
                      BoxShadow(
                          color: Colors.black.withOpacity(0.05), blurRadius: 4)
                    ]
                  : [],
            ),
            child: Center(
              child: Text(
                text,
                style: TextStyle(
                  color: isActive ? const Color(0xFF0F8A7E) : Colors.grey[600],
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                  fontSize: 13,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // --- TAB 0: HISTORY (Balance + Feed) ---
  Widget _buildHistoryTab() {
    return Column(
      children: [
        // Balance Card
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: StreamBuilder<BalanceResult>(
            stream: BalanceService().streamUserBalances(widget.userId),
            builder: (context, snapshot) {
              final groupBalances = snapshot.data?.perGroupNet ?? {};
              final net = groupBalances[widget.group.id] ?? 0.0;
              final positive = net >= 0;
              final color = positive ? Colors.green : Colors.redAccent;

              return Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
                  child: Column(
                    children: [
                      Text(
                        positive ? "Owed to You" : "You Owe Group",
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

        // Activity Feed
        Expanded(
          child: StreamBuilder<List<ExpenseItem>>(
            stream: ExpenseService()
                .getGroupExpensesStream(widget.userId, widget.group.id),
            builder: (context, snapshot) {
              final txs = snapshot.data ?? [];
              return ActivityFeedWidget(
                activities: txs
                    .map(
                      (e) => ActivityItem(
                        id: e.id,
                        type: e.isBill ||
                                (e.label ?? '').toLowerCase().contains('settle')
                            ? ActivityType.settleup
                            : ActivityType.expense,
                        amount: e.amount,
                        label: e.label ?? e.type,
                        note: e.note,
                        date: e.date,
                        friendId: null,
                        groupId: widget.group.id,
                        payerId: e.payerId,
                        receiverId: null,
                        isSettleUp: e.isBill ||
                            (e.label ?? '').toLowerCase().contains('settle'),
                      ),
                    )
                    .toList(),
              );
            },
          ),
        ),
      ],
    );
  }

  // --- TAB 3: CHAT ---
  Widget _buildChatTab() {
    return GroupChatTab(
      groupId: widget.group.id,
      currentUserId: widget.userId,
      onSettleUp: () => _showSettleUpDialog(context),
    );
  }
}
