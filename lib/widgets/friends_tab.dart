import 'package:flutter/material.dart';
import '../models/friend_model.dart';
import '../models/expense_item.dart';
import '../models/group_model.dart';
import '../details/friend_detail_screen.dart';

class FriendsTab extends StatefulWidget {
  final List<FriendModel> friends;
  final Map<String, double> netBalances;
  final double totalOwedToYou;
  final double totalYouOwe;
  final double netOverall;
  final List<ExpenseItem> expenses;
  final List<GroupModel> groups;
  final String userId;
  final Map<String, FriendModel> friendsById;
  final VoidCallback reloadData;

  const FriendsTab({
    Key? key,
    required this.friends,
    required this.netBalances,
    required this.totalOwedToYou,
    required this.totalYouOwe,
    required this.netOverall,
    required this.expenses,
    required this.groups,
    required this.userId,
    required this.friendsById,
    required this.reloadData,
  }) : super(key: key);

  @override
  State<FriendsTab> createState() => _FriendsTabState();
}

class _FriendsTabState extends State<FriendsTab> {
  bool _showSettled = false;
  String _sortBy = 'recent';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Sorting and grouping logic
    final friendList = List<FriendModel>.from(widget.friends);
    final Map<String, DateTime> lastActivity = {};
    for (var f in friendList) {
      final related = widget.expenses
          .where((e) => e.payerId == f.phone || e.friendIds.contains(f.phone));
      lastActivity[f.phone] = related.isNotEmpty
          ? related.map((e) => e.date).reduce((a, b) => a.isAfter(b) ? a : b)
          : DateTime(2000);
    }
    if (_sortBy == 'recent') {
      friendList.sort(
          (a, b) => lastActivity[b.phone]!.compareTo(lastActivity[a.phone]!));
    } else {
      friendList.sort((a, b) => (widget.netBalances[b.phone] ?? 0)
          .abs()
          .compareTo((widget.netBalances[a.phone] ?? 0).abs()));
    }

    final unsettled = friendList
        .where((f) => (widget.netBalances[f.phone] ?? 0).abs() > 0.5)
        .toList();
    final settled = friendList
        .where((f) => (widget.netBalances[f.phone] ?? 0).abs() <= 0.5)
        .toList();

    final owingFriends = widget.friends
        .where((f) => (widget.netBalances[f.phone] ?? 0) > 0)
        .toList()
      ..sort((a, b) => (widget.netBalances[b.phone] ?? 0)
          .compareTo(widget.netBalances[a.phone] ?? 0));
    final topOwing = owingFriends.take(2).toList();

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // --- Snapshot Card ---
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 18),
          child: Card(
            color: Colors.white,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
            elevation: 3,
            child: Padding(
              padding: const EdgeInsets.all(17),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Your Balance Snapshot",
                    style: TextStyle(
                      color: theme.primaryColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 17,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      Column(
                        children: [
                          Text("You’re owed",
                              style: TextStyle(color: Colors.green[700])),
                          Text(
                            "₹${widget.totalOwedToYou.toStringAsFixed(0)}",
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.green,
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                      Column(
                        children: [
                          Text("You owe",
                              style: TextStyle(color: Colors.red[700])),
                          Text(
                            "₹${widget.totalYouOwe.toStringAsFixed(0)}",
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.red,
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                      Column(
                        children: [
                          Text("Net",
                              style: TextStyle(fontWeight: FontWeight.w500)),
                          Text(
                            "₹${widget.netOverall.toStringAsFixed(0)}",
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: widget.netOverall > 0
                                  ? Colors.green
                                  : widget.netOverall < 0
                                      ? Colors.red
                                      : Colors.teal,
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (topOwing.isNotEmpty) ...[
                    const SizedBox(height: 13),
                    Text(
                      "Top Owers:",
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    ...topOwing.map(
                      (f) => Padding(
                        padding: const EdgeInsets.only(left: 10, top: 2),
                        child: Text(
                          "${f.name} owes you ₹${widget.netBalances[f.phone]!.toStringAsFixed(0)}",
                          style: TextStyle(
                            color: theme.primaryColorDark,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text("Sort by: "),
                      ChoiceChip(
                        label: const Text("Recent"),
                        selected: _sortBy == 'recent',
                        onSelected: (v) => setState(() => _sortBy = 'recent'),
                      ),
                      const SizedBox(width: 8),
                      ChoiceChip(
                        label: const Text("Amount"),
                        selected: _sortBy == 'amount',
                        onSelected: (v) => setState(() => _sortBy = 'amount'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        // --- Friends List Title ---
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 8),
          child: Text(
            "Friends",
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
              fontSize: 20,
              color: theme.textTheme.titleLarge?.color,
            ),
          ),
        ),
        // --- Unsettled Friends ---
        ...unsettled.map((friend) {
          final net = widget.netBalances[friend.phone] ?? 0;
          final balColor = net > 0
              ? Colors.green
              : net < 0
                  ? Colors.red
                  : Colors.grey;
          return Card(
            margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            color: Colors.white,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: 2,
            child: ListTile(
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => FriendDetailScreen(
                      friend: friend,
                      userPhone: widget.userId,
                      userName: 'You',
                    ),
                  ),
                ).then((_) => widget.reloadData());
              },
              leading:
                  Text(friend.avatar, style: const TextStyle(fontSize: 32)),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      friend.name,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 17,
                        color: theme.textTheme.titleLarge?.color,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    net > 0
                        ? "+₹${net.toStringAsFixed(0)}"
                        : net < 0
                            ? "-₹${(-net).toStringAsFixed(0)}"
                            : "Settled",
                    style: TextStyle(
                      color: balColor,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
              subtitle: friend.phone.isNotEmpty
                  ? Text(friend.phone,
                      style: TextStyle(color: Colors.teal[700], fontSize: 13.5))
                  : null,
            ),
          );
        }),
        // --- Settled Friends (Expandable) ---
        if (settled.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 14, left: 18, right: 18),
            child: AnimatedCrossFade(
              firstChild: OutlinedButton.icon(
                icon: const Icon(Icons.visibility, size: 18),
                label: const Text("Show Settled Friends"),
                onPressed: () => setState(() => _showSettled = true),
              ),
              secondChild: Column(
                children: [
                  ...settled.map((friend) => Card(
                        margin: const EdgeInsets.symmetric(
                            horizontal: 0, vertical: 4),
                        elevation: 1,
                        color: Colors.grey[100],
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14)),
                        child: ListTile(
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => FriendDetailScreen(
                                  friend: friend,
                                  userPhone: widget.userId,
                                  userName: 'You',
                                ),
                              ),
                            ).then((_) => widget.reloadData());
                          },
                          leading: Text(friend.avatar,
                              style: const TextStyle(
                                  fontSize: 32, color: Colors.grey)),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  friend.name,
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.grey[600],
                                  ),
                                ),
                              ),
                              Text(
                                "Settled",
                                style: TextStyle(
                                    color: Colors.grey,
                                    fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          subtitle: Text("All Settled!",
                              style: TextStyle(
                                  color: Colors.grey[600], fontSize: 13)),
                        ),
                      )),
                ],
              ),
              crossFadeState: _showSettled
                  ? CrossFadeState.showSecond
                  : CrossFadeState.showFirst,
              duration: const Duration(milliseconds: 300),
            ),
          ),
        const SizedBox(height: 34),
      ],
    );
  }
}
