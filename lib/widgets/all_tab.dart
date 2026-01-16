import 'package:flutter/material.dart';
import '../models/friend_model.dart';
import '../models/group_model.dart';
import '../models/expense_item.dart';
import '../details/friend_detail_screen.dart';
import '../details/group_detail_screen.dart';

class AllTab extends StatefulWidget {
  final List<FriendModel> friends;
  final Map<String, double> netBalancesByFriend;
  final List<GroupModel> groups;
  final Map<String, GroupModel> groupsById;
  final List<ExpenseItem> expenses;
  final String userId;

  const AllTab({
    Key? key,
    required this.friends,
    required this.netBalancesByFriend,
    required this.groups,
    required this.groupsById,
    required this.expenses,
    required this.userId,
  }) : super(key: key);

  @override
  State<AllTab> createState() => _AllTabState();
}

class _AllTabState extends State<AllTab> {
  String _sortBy = 'recent';

  double get totalOwedToYou => widget.friends.fold(0.0, (sum, f) {
        final net = widget.netBalancesByFriend[f.id] ?? 0;
        return net > 0 ? sum + net : sum;
      });
  double get totalYouOwe => widget.friends.fold(0.0, (sum, f) {
        final net = widget.netBalancesByFriend[f.id] ?? 0;
        return net < 0 ? sum - net : sum;
      });
  double get netOverall => totalOwedToYou - totalYouOwe;

  List<FriendModel> get topOwing {
    final owingFriends = widget.friends
        .where((f) => (widget.netBalancesByFriend[f.id] ?? 0) > 0)
        .toList()
      ..sort((a, b) => (widget.netBalancesByFriend[b.id] ?? 0)
          .compareTo(widget.netBalancesByFriend[a.id] ?? 0));
    return owingFriends.take(2).toList();
  }

  @override
  Widget build(BuildContext context) {
    // --- Merge friends & groups with sort
    final List<_AllRowItem> rows = [];

    final Map<String, DateTime> lastActivity = {};
    for (final f in widget.friends) {
      final related = widget.expenses
          .where((e) => e.payerId == f.id || e.friendIds.contains(f.id));
      lastActivity[f.id] = related.isNotEmpty
          ? related.map((e) => e.date).reduce((a, b) => a.isAfter(b) ? a : b)
          : DateTime(2000);
    }
    for (final g in widget.groups) {
      final related = widget.expenses.where((e) => e.groupId == g.id);
      lastActivity[g.id] = related.isNotEmpty
          ? related.map((e) => e.date).reduce((a, b) => a.isAfter(b) ? a : b)
          : DateTime(2000);
    }

    // Friends
    for (final f in widget.friends) {
      final net = widget.netBalancesByFriend[f.id] ?? 0;
      final lastExpense = widget.expenses
          .where((e) => e.payerId == f.id || e.friendIds.contains(f.id))
          .toList()
        ..sort((a, b) => b.date.compareTo(a.date));
      final isNew = lastExpense.isNotEmpty &&
          DateTime.now().difference(lastExpense.first.date).inHours < 24;
      rows.add(_AllRowItem(
        id: f.id,
        type: _AllRowType.friend,
        avatar: f.avatar,
        name: f.name,
        net: net,
        subtitle: lastExpense.isNotEmpty
            ? (lastExpense.first.type == "Settlement"
                ? (net < 0 ? "You settled up" : "They settled up")
                : (net < 0
                    ? "You owe"
                    : (net > 0 ? "They owe you" : "All settled")))
            : "",
        time: lastActivity[f.id] ?? DateTime(2000),
        isNew: isNew,
      ));
    }
    // Groups
    for (final g in widget.groups) {
      final groupExpenses =
          widget.expenses.where((e) => e.groupId == g.id).toList();
      final last = groupExpenses.isNotEmpty
          ? groupExpenses.reduce((a, b) => a.date.isAfter(b.date) ? a : b)
          : null;
      final net = netForGroup(g);
      final isNew =
          last != null && DateTime.now().difference(last.date).inHours < 24;
      rows.add(_AllRowItem(
        id: g.id,
        type: _AllRowType.group,
        avatar: "👥",
        name: g.name,
        net: net,
        subtitle: groupExpenses.isNotEmpty ? "Group updated" : "",
        time: lastActivity[g.id] ?? DateTime(2000),
        isNew: isNew,
      ));
    }

    // Sorting
    if (_sortBy == 'recent') {
      rows.sort((a, b) => b.time.compareTo(a.time));
    } else {
      rows.sort((a, b) => b.net.abs().compareTo(a.net.abs()));
    }

    return SafeArea(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          // --- Snapshot Card ---
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 18),
            child: Card(
              color: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18)),
              elevation: 3,
              child: Padding(
                padding: const EdgeInsets.all(17),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Balance Snapshot",
                      style: TextStyle(
                        color: Theme.of(context).primaryColor,
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
                              "₹${totalOwedToYou.toStringAsFixed(0)}",
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
                              "₹${totalYouOwe.toStringAsFixed(0)}",
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
                              "₹${netOverall.toStringAsFixed(0)}",
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: netOverall > 0
                                    ? Colors.green
                                    : netOverall < 0
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
                      const SizedBox(height: 15),
                      Text(
                        "Top Owers:",
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      ...topOwing.map(
                        (f) => Padding(
                          padding: const EdgeInsets.only(left: 10, top: 2),
                          child: Text(
                            "${f.name} owes you ₹${widget.netBalancesByFriend[f.id]!.toStringAsFixed(0)}",
                            style: TextStyle(
                              color: Theme.of(context).primaryColorDark,
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
          // --- Card List (friends + groups) ---
          ...rows.map((row) {
            final color = row.net > 0
                ? Colors.green
                : row.net < 0
                    ? Colors.red
                    : Colors.grey;
            return Card(
              margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              color: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              elevation: 2,
              child: ListTile(
                onTap: () {
                  if (row.type == _AllRowType.friend) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => FriendDetailScreen(
                          friend:
                              widget.friends.firstWhere((f) => f.id == row.id),
                          userPhone: widget.userId,
                          userName: 'You',
                        ),
                      ),
                    );
                  } else if (row.type == _AllRowType.group) {
                    final group = widget.groupsById[row.id];
                    if (group != null) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => GroupDetailScreen(
                            userId: widget.userId,
                            group: group,
                            friendsById: {
                              for (final f in widget.friends) f.id: f
                            },
                          ),
                        ),
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text("Group not found!")),
                      );
                    }
                  }
                },
                leading: Text(row.avatar, style: const TextStyle(fontSize: 32)),
                title: Row(
                  children: [
                    Expanded(
                      child: Text(
                        row.name,
                        style: TextStyle(
                          fontWeight:
                              row.isNew ? FontWeight.bold : FontWeight.w600,
                          fontSize: 17,
                          color: Theme.of(context).textTheme.titleLarge?.color,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      row.net > 0
                          ? "+₹${row.net.toStringAsFixed(0)}"
                          : row.net < 0
                              ? "-₹${(-row.net).toStringAsFixed(0)}"
                              : "Settled",
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                subtitle: Text(
                  row.subtitle,
                  style: TextStyle(
                    fontSize: 13.5,
                    color: Colors.grey[700],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: row.isNew
                    ? Container(
                        margin: const EdgeInsets.only(left: 4),
                        width: 11,
                        height: 11,
                        decoration: BoxDecoration(
                          color: Theme.of(context).primaryColor,
                          shape: BoxShape.circle,
                        ),
                      )
                    : null,
              ),
            );
          }).toList(),
          const SizedBox(height: 38),
        ],
      ),
    );
  }

  // Group net logic (matches your latest per-head, settlement, etc.)
  double netForGroup(GroupModel group) {
    double youNet = 0;
    for (final exp in widget.expenses.where((e) => e.groupId == group.id)) {
      final splitCount = exp.friendIds.length + 1;
      final splitAmt = exp.amount / splitCount;
      if (exp.type == "Settlement") {
        if (exp.payerId == widget.userId &&
            exp.friendIds.contains(widget.userId)) {
          continue;
        } else if (exp.payerId == widget.userId) {
          youNet += exp.amount;
        } else if (exp.friendIds.contains(widget.userId)) {
          youNet -= exp.amount;
        }
      } else {
        if (exp.payerId == widget.userId) {
          youNet += splitAmt * exp.friendIds.length;
        } else if (exp.friendIds.contains(widget.userId)) {
          youNet -= splitAmt;
        }
      }
    }
    return youNet;
  }
}

enum _AllRowType { friend, group }

class _AllRowItem {
  final String id;
  final _AllRowType type;
  final String avatar;
  final String name;
  final double net;
  final String subtitle;
  final DateTime time;
  final bool isNew;

  _AllRowItem({
    required this.id,
    required this.type,
    required this.avatar,
    required this.name,
    required this.net,
    required this.subtitle,
    required this.time,
    required this.isNew,
  });
}
