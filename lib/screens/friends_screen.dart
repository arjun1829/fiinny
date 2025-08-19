// lib/screens/friends/friends_screen.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/friend_model.dart';
import '../../models/group_model.dart';
import '../../models/expense_item.dart';

import '../../services/friend_service.dart';
import '../../services/group_service.dart';
import '../../services/activity_service.dart';
import '../../services/expense_service.dart';

import '../../widgets/friend_list_widget.dart';
import '../../widgets/group_list_widget.dart';
import '../../widgets/activity_feed_widget.dart';

import '../../widgets/add_friend_dialog.dart';
import '../../widgets/add_group_dialog.dart';
import '../../widgets/add_expense_dialog.dart';
import '../../widgets/settleup_dialog.dart';
import '../../widgets/split_summary_widget.dart';
import '../details/friend_detail_screen.dart';
import '../details/group_detail_screen.dart';

/* ===========================================================================
 * FRIENDS & GROUPS — Dashboard-style screen
 * - Search field below TabBar (pill)
 * - “open only” tiny switch at top-right of that search row (no overflow)
 * - All/Friends/Groups use glossy tiles + avatars + trailing owed/owe amounts
 * - Sorted by latest activity (last transaction time)
 * - Uses SplitSummaryWidget at top of “All” tab
 * - Extended FAB with label (“Add”)
 * =========================================================================== */

class FriendsScreen extends StatefulWidget {
  final String userPhone;
  const FriendsScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen>
    with TickerProviderStateMixin {
  late TabController _tabController;
  final tabs = const ['All', 'Friends', 'Groups', 'Activity'];

  // filters
  bool _openOnly = false;
  final TextEditingController _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: tabs.length, vsync: this);
    _searchCtrl.addListener(() {
      final q = _searchCtrl.text.trim();
      if (q != _query) {
        setState(() => _query = q);
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<List<FriendModel>> _fetchAllFriends() async {
    return await FriendService().streamFriends(widget.userPhone).first;
  }

  void _showAddMenu() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.person_add_alt_1_rounded),
              title: const Text("Add Friend (Phone)"),
              onTap: () async {
                Navigator.pop(context);
                final result = await showDialog(
                  context: context,
                  builder: (_) => AddFriendDialog(userPhone: widget.userPhone),
                );
                if (result == true) setState(() {});
              },
            ),
            ListTile(
              leading: const Icon(Icons.group_add_rounded),
              title: const Text("Add Group"),
              onTap: () async {
                Navigator.pop(context);
                final allFriends = await _fetchAllFriends();
                final result = await showDialog(
                  context: context,
                  builder: (_) => AddGroupDialog(
                    userPhone: widget.userPhone,
                    allFriends: allFriends,
                  ),
                );
                if (result == true) setState(() {});
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_money_rounded),
              title: const Text("Add Expense"),
              onTap: () async {
                Navigator.pop(context);
                final allFriends = await _fetchAllFriends();
                final allGroups =
                await GroupService().streamGroups(widget.userPhone).first;
                final result = await showDialog(
                  context: context,
                  builder: (_) => AddExpenseDialog(
                    userPhone: widget.userPhone,
                    friends: allFriends,
                    groups: allGroups,
                  ),
                );
                if (result == true) setState(() {});
              },
            ),
            ListTile(
              leading: const Icon(Icons.handshake_rounded),
              title: const Text("Settle Up"),
              onTap: () async {
                Navigator.pop(context);
                final allFriends = await _fetchAllFriends();
                final allGroups =
                await GroupService().streamGroups(widget.userPhone).first;
                final result = await showDialog(
                  context: context,
                  builder: (_) => SettleUpDialog(
                    userPhone: widget.userPhone,
                    friends: allFriends,
                    groups: allGroups,
                  ),
                );
                if (result == true) setState(() {});
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Dashboard vibe background
    return Scaffold(
      appBar: AppBar(
        title: const Text("Friends & Groups"),
        backgroundColor: Colors.white,
        elevation: 2,
        // move switch + search to the bottom area to avoid overflow
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(92),
          child: Column(
            children: [
              // TabBar
              TabBar(
                controller: _tabController,
                labelColor: const Color(0xFF09857a),
                unselectedLabelColor: Colors.grey[600],
                indicatorColor: const Color(0xFF09857a),
                tabs: tabs.map((t) => Tab(text: t)).toList(),
              ),
              // Search row + tiny switch
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                child: Row(
                  children: [
                    // Search pill
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF09857a).withOpacity(0.06),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Row(
                          children: [
                            const Icon(Icons.search_rounded,
                                size: 20, color: Color(0xFF09857a)),
                            const SizedBox(width: 6),
                            Expanded(
                              child: TextField(
                                controller: _searchCtrl,
                                decoration: const InputDecoration(
                                  hintText: "Search friends, groups…",
                                  border: InputBorder.none,
                                ),
                              ),
                            ),
                            if (_query.isNotEmpty)
                              IconButton(
                                tooltip: 'Clear',
                                icon: const Icon(Icons.close_rounded,
                                    size: 18, color: Color(0xFF09857a)),
                                onPressed: () => _searchCtrl.clear(),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Tiny "open only" switch – right corner, small, moved slightly left
                    Transform.translate(
                      offset: const Offset(-4, 0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Transform.scale(
                            scale: 0.82,
                            child: Switch.adaptive(
                              value: _openOnly,
                              activeColor: const Color(0xFF09857a),
                              onChanged: (v) =>
                                  setState(() => _openOnly = v),
                            ),
                          ),
                          const SizedBox(height: 0),
                          const Text(
                            "open",
                            style: TextStyle(
                                fontSize: 10, color: Color(0xFF09857a)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddMenu,
        backgroundColor: const Color(0xFF09857a),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text("Add", style: TextStyle(color: Colors.white)),
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFF7FBFF), Color(0xFFEFF7F4)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: TabBarView(
          controller: _tabController,
          children: [
            AllTab(
              userPhone: widget.userPhone,
              openOnly: _openOnly,
              query: _query,
            ),
            FriendsTab(
              userPhone: widget.userPhone,
              openOnly: _openOnly,
              query: _query,
            ),
            GroupsTab(
              userPhone: widget.userPhone,
              openOnly: _openOnly,
              query: _query,
            ),
            ActivityTab(userPhone: widget.userPhone),
          ],
        ),
      ),
    );
  }
}

/* --------------------------- Settlement-aware math -------------------------- */

bool _isSettlement(ExpenseItem e) {
  final t = (e.type).toLowerCase();
  final lbl = (e.label ?? '').toLowerCase();
  if (t.contains('settle') || lbl.contains('settle')) return true;
  if ((e.friendIds.length == 1) &&
      (e.customSplits == null || e.customSplits!.isEmpty)) {
    return (e.isBill == true);
  }
  return false;
}

Set<String> _participantsOf(ExpenseItem e) {
  final s = <String>{};
  if (e.payerId.isNotEmpty) s.add(e.payerId);
  s.addAll(e.friendIds);
  if (e.customSplits != null && e.customSplits!.isNotEmpty) {
    s.addAll(e.customSplits!.keys);
  }
  return s;
}

Map<String, double> _splitsOf(ExpenseItem e) {
  if (e.customSplits != null && e.customSplits!.isNotEmpty) {
    return Map<String, double>.from(e.customSplits!);
  }
  final parts = _participantsOf(e).toList();
  if (parts.isEmpty) return const {};
  final each = e.amount / parts.length;
  return {for (final id in parts) id: each};
}

/// Signed pair delta between 'you' and 'other':
/// + => other owes YOU; - => YOU owe other; 0 => no effect.
double _pairSigned(ExpenseItem e, String you, String other) {
  final parts = _participantsOf(e);
  if (!parts.contains(you) || !parts.contains(other)) return 0.0;

  if (_isSettlement(e)) {
    final others = e.friendIds;
    if (others.isEmpty) return 0.0;
    final perOther = e.amount / others.length;
    if (e.payerId == you && others.contains(other)) return perOther;
    if (e.payerId == other && others.contains(you)) return -perOther;
    return 0.0;
  }

  final splits = _splitsOf(e);
  if (e.payerId == you && splits.containsKey(other)) {
    return splits[other] ?? 0.0; // they owe you
  }
  if (e.payerId == other && splits.containsKey(you)) {
    return -(splits[you] ?? 0.0); // you owe them
  }
  return 0.0; // third-party paid
}

/* ---------------------------------- ALL TAB -------------------------------- */

class AllTab extends StatelessWidget {
  final String userPhone;
  final bool openOnly;
  final String query;
  const AllTab({
    required this.userPhone,
    required this.openOnly,
    required this.query,
    Key? key,
  }) : super(key: key);

  bool _matches(String query, String hay) =>
      hay.toLowerCase().contains(query.toLowerCase());

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ExpenseItem>>(
      stream: ExpenseService().getExpensesStream(userPhone),
      builder: (context, txSnapshot) {
        final allTx = txSnapshot.data ?? [];

        return StreamBuilder<List<FriendModel>>(
          stream: FriendService().streamFriends(userPhone),
          builder: (context, friendSnapshot) {
            final friends = friendSnapshot.data ?? [];

            return StreamBuilder<List<GroupModel>>(
              stream: GroupService().streamGroups(userPhone),
              builder: (context, groupSnapshot) {
                final groups = groupSnapshot.data ?? [];

                // --- SplitSummaryWidget (big glossy card like dashboard)
                final summaryWidget = Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(26),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFFFFFFFF), Color(0xFFF3FBF9)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.08),
                          blurRadius: 20,
                          offset: const Offset(0, 10),
                        ),
                      ],
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: SplitSummaryWidget(
                        expenses: allTx,
                        friends: friends,
                        userPhone: userPhone,
                      ),
                    ),
                  ),
                );

                final items = <_ChatListItem>[];

                // ---------- Friends ----------
                for (final f in friends) {
                  // filter by search text
                  if (query.isNotEmpty &&
                      !_matches(query, f.name) &&
                      !_matches(query, f.phone)) {
                    continue;
                  }

                  final affecting = allTx
                      .where((e) =>
                  _pairSigned(e, userPhone, f.phone).abs() >= 0.005)
                      .toList()
                    ..sort((a, b) => b.date.compareTo(a.date));

                  double net = 0.0;
                  for (final e in affecting) {
                    net += _pairSigned(e, userPhone, f.phone);
                  }
                  net = double.parse(net.toStringAsFixed(2));

                  if (openOnly && net == 0.0) continue;

                  final lastTx = affecting.isNotEmpty ? affecting.first : null;

                  final subtitle = (net == 0.0)
                      ? "All settled"
                      : (net > 0
                      ? "Owes you ₹${net.toStringAsFixed(0)}"
                      : "You owe ₹${(-net).toStringAsFixed(0)}");

                  final tail = (lastTx == null)
                      ? " • No activity yet"
                      : " • last: ${(lastTx.label?.isNotEmpty == true ? lastTx.label! : lastTx.type)} ₹${_fmtAmt(lastTx.amount)}";

                  items.add(_ChatListItem(
                    id: f.phone,
                    phone: f.phone,
                    isGroup: false,
                    title: f.name,
                    subtitle: "$subtitle$tail",
                    imageUrl: (f.avatar.startsWith('http') ||
                        f.avatar.startsWith('assets'))
                        ? f.avatar
                        : null,
                    fallbackEmoji: f.avatar.isNotEmpty &&
                        !(f.avatar.startsWith('http') ||
                            f.avatar.startsWith('assets'))
                        ? f.avatar
                        : '👤',
                    memberAvatars: null,
                    memberPhones: null,
                    lastUpdate: lastTx?.date,
                    trailingText: net == 0
                        ? ""
                        : "${net > 0 ? '+ ' : '- '}₹${net.abs().toStringAsFixed(0)}",
                    trailingColor: net > 0
                        ? Colors.green[700]
                        : (net < 0 ? Colors.red[700] : Colors.grey[700]),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => FriendDetailScreen(
                          userPhone: userPhone,
                          userName: "You",
                          friend: f,
                        ),
                      ),
                    ),
                    onExpense: () async {
                      final allFriends =
                      await FriendService().streamFriends(userPhone).first;
                      final allGroups =
                      await GroupService().streamGroups(userPhone).first;
                      await showDialog(
                        context: context,
                        builder: (_) => AddExpenseDialog(
                          userPhone: userPhone,
                          friends: allFriends,
                          groups: allGroups,
                        ),
                      );
                    },
                    onSettle: () async {
                      await showDialog(
                        context: context,
                        builder: (_) => SettleUpDialog(
                          userPhone: userPhone,
                          friends: [f],
                          groups: const [],
                        ),
                      );
                    },
                    openDetails: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => FriendDetailScreen(
                          userPhone: userPhone,
                          userName: "You",
                          friend: f,
                        ),
                      ),
                    ),
                  ));
                }

                // ---------- Groups ----------
                for (final g in groups) {
                  if (query.isNotEmpty && !_matches(query, g.name)) continue;

                  final gtx = allTx.where((t) => t.groupId == g.id).toList()
                    ..sort((a, b) => b.date.compareTo(a.date));
                  final lastTx = gtx.isNotEmpty ? gtx.first : null;

                  double owedToYou = 0.0, youOwe = 0.0;
                  final members =
                  g.memberPhones.where((p) => p != userPhone).toList();

                  for (final e in gtx) {
                    for (final m in members) {
                      final d = _pairSigned(e, userPhone, m);
                      if (d > 0) {
                        owedToYou += d;
                      } else if (d < 0) {
                        youOwe += (-d);
                      }
                    }
                  }
                  owedToYou = double.parse(owedToYou.toStringAsFixed(2));
                  youOwe = double.parse(youOwe.toStringAsFixed(2));
                  final net = owedToYou - youOwe;

                  if (openOnly && owedToYou == 0.0 && youOwe == 0.0) continue;

                  String subtitle;
                  if (owedToYou == 0 && youOwe == 0) {
                    subtitle = "All settled";
                  } else {
                    subtitle =
                    "Owed to you ₹${owedToYou.toStringAsFixed(0)} • You owe ₹${youOwe.toStringAsFixed(0)}";
                  }
                  if (lastTx != null) {
                    subtitle +=
                    " • last: ${(lastTx.label?.isNotEmpty == true ? lastTx.label! : lastTx.type)} ₹${_fmtAmt(lastTx.amount)}";
                  }

                  final memberPhones = g.memberPhones.take(3).toList();

                  items.add(_ChatListItem(
                    id: g.id,
                    phone: null,
                    isGroup: true,
                    title: g.name,
                    subtitle: subtitle,
                    imageUrl: g.avatarUrl,
                    fallbackEmoji: '👥',
                    memberAvatars: null,
                    memberPhones: memberPhones,
                    lastUpdate: lastTx?.date,
                    trailingText: net == 0
                        ? ""
                        : "${net > 0 ? '+ ' : '- '}₹${net.abs().toStringAsFixed(0)}",
                    trailingColor: net > 0
                        ? Colors.green[700]
                        : (net < 0 ? Colors.red[700] : Colors.grey[700]),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => GroupDetailScreen(
                          userId: userPhone,
                          group: g,
                        ),
                      ),
                    ),
                    onExpense: () async {
                      final allFriends =
                      await FriendService().streamFriends(userPhone).first;
                      final allGroups =
                      await GroupService().streamGroups(userPhone).first;
                      await showDialog(
                        context: context,
                        builder: (_) => AddExpenseDialog(
                          userPhone: userPhone,
                          friends: allFriends,
                          groups: allGroups,
                        ),
                      );
                    },
                    onSettle: () async {
                      await showDialog(
                        context: context,
                        builder: (_) => SettleUpDialog(
                          userPhone: userPhone,
                          friends: const [],
                          groups: [g],
                        ),
                      );
                    },
                    openDetails: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => GroupDetailScreen(
                          userId: userPhone,
                          group: g,
                        ),
                      ),
                    ),
                  ));
                }

                // Sort by last update
                items.sort((a, b) {
                  final aDt =
                      a.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
                  final bDt =
                      b.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
                  return bDt.compareTo(aDt);
                });

                return RefreshIndicator(
                  onRefresh: () async {},
                  child: ListView.builder(
                    padding:
                    const EdgeInsets.only(top: 8, bottom: 100), // clear FAB
                    itemCount: items.length + 1,
                    itemBuilder: (context, i) {
                      if (i == 0) return summaryWidget;
                      final item = items[i - 1];
                      return _GlassyChatTile(item: item);
                    },
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

/* -------------------------------- FRIENDS TAB ------------------------------ */

class FriendsTab extends StatelessWidget {
  final String userPhone;
  final bool openOnly;
  final String query;
  const FriendsTab({
    required this.userPhone,
    required this.openOnly,
    required this.query,
    Key? key,
  }) : super(key: key);

  bool _matches(String query, String hay) =>
      hay.toLowerCase().contains(query.toLowerCase());

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ExpenseItem>>(
      stream: ExpenseService().getExpensesStream(userPhone),
      builder: (context, txSnap) {
        final allTx = txSnap.data ?? [];
        return StreamBuilder<List<FriendModel>>(
          stream: FriendService().streamFriends(userPhone),
          builder: (context, friendSnap) {
            final friends = friendSnap.data ?? [];

            final items = <_ChatListItem>[];
            for (final f in friends) {
              if (query.isNotEmpty &&
                  !_matches(query, f.name) &&
                  !_matches(query, f.phone)) {
                continue;
              }

              final affecting = allTx
                  .where(
                      (e) => _pairSigned(e, userPhone, f.phone).abs() >= 0.005)
                  .toList()
                ..sort((a, b) => b.date.compareTo(a.date));

              double net = 0.0;
              for (final e in affecting) {
                net += _pairSigned(e, userPhone, f.phone);
              }
              net = double.parse(net.toStringAsFixed(2));
              if (openOnly && net == 0.0) continue;

              final lastTx = affecting.isNotEmpty ? affecting.first : null;

              final subtitle = (net == 0.0)
                  ? "All settled"
                  : (net > 0
                  ? "Owes you ₹${net.toStringAsFixed(0)}"
                  : "You owe ₹${(-net).toStringAsFixed(0)}");
              final tail = (lastTx == null)
                  ? " • No activity yet"
                  : " • last: ${(lastTx.label?.isNotEmpty == true ? lastTx.label! : lastTx.type)} ₹${_fmtAmt(lastTx.amount)}";

              items.add(_ChatListItem(
                id: f.phone,
                phone: f.phone,
                isGroup: false,
                title: f.name,
                subtitle: "$subtitle$tail",
                imageUrl: (f.avatar.startsWith('http') ||
                    f.avatar.startsWith('assets'))
                    ? f.avatar
                    : null,
                fallbackEmoji: f.avatar.isNotEmpty &&
                    !(f.avatar.startsWith('http') ||
                        f.avatar.startsWith('assets'))
                    ? f.avatar
                    : '👤',
                memberAvatars: null,
                memberPhones: null,
                lastUpdate: lastTx?.date,
                trailingText: net == 0
                    ? ""
                    : "${net > 0 ? '+ ' : '- '}₹${net.abs().toStringAsFixed(0)}",
                trailingColor: net > 0
                    ? Colors.green[700]
                    : (net < 0 ? Colors.red[700] : Colors.grey[700]),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => FriendDetailScreen(
                      userPhone: userPhone,
                      userName: "You",
                      friend: f,
                    ),
                  ),
                ),
                onExpense: () async {
                  final allFriends =
                  await FriendService().streamFriends(userPhone).first;
                  final allGroups =
                  await GroupService().streamGroups(userPhone).first;
                  await showDialog(
                    context: context,
                    builder: (_) => AddExpenseDialog(
                      userPhone: userPhone,
                      friends: allFriends,
                      groups: allGroups,
                    ),
                  );
                },
                onSettle: () async {
                  await showDialog(
                    context: context,
                    builder: (_) => SettleUpDialog(
                      userPhone: userPhone,
                      friends: [f],
                      groups: const [],
                    ),
                  );
                },
                openDetails: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => FriendDetailScreen(
                      userPhone: userPhone,
                      userName: "You",
                      friend: f,
                    ),
                  ),
                ),
              ));
            }

            items.sort((a, b) {
              final aDt =
                  a.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
              final bDt =
                  b.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
              return bDt.compareTo(aDt);
            });

            if (items.isEmpty) {
              return const Center(child: Text("No friends yet."));
            }

            return ListView.builder(
              padding: const EdgeInsets.only(top: 10, bottom: 100),
              itemCount: items.length,
              itemBuilder: (_, i) => _GlassyChatTile(item: items[i]),
            );
          },
        );
      },
    );
  }
}

/* -------------------------------- GROUPS TAB ------------------------------- */

class GroupsTab extends StatelessWidget {
  final String userPhone;
  final bool openOnly;
  final String query;
  const GroupsTab({
    required this.userPhone,
    required this.openOnly,
    required this.query,
    Key? key,
  }) : super(key: key);

  bool _matches(String query, String hay) =>
      hay.toLowerCase().contains(query.toLowerCase());

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ExpenseItem>>(
      stream: ExpenseService().getExpensesStream(userPhone),
      builder: (context, txSnap) {
        final allTx = txSnap.data ?? [];
        return StreamBuilder<List<GroupModel>>(
          stream: GroupService().streamGroups(userPhone),
          builder: (context, groupSnap) {
            final groups = groupSnap.data ?? [];

            return StreamBuilder<List<FriendModel>>(
              stream: FriendService().streamFriends(userPhone),
              builder: (context, friendSnap) {
                final friends = friendSnap.data ?? [];

                final items = <_ChatListItem>[];
                for (final g in groups) {
                  if (query.isNotEmpty && !_matches(query, g.name)) continue;

                  final gtx = allTx.where((t) => t.groupId == g.id).toList()
                    ..sort((a, b) => b.date.compareTo(a.date));
                  final lastTx = gtx.isNotEmpty ? gtx.first : null;

                  double owedToYou = 0.0, youOwe = 0.0;
                  final members =
                  g.memberPhones.where((p) => p != userPhone).toList();
                  for (final e in gtx) {
                    for (final m in members) {
                      final d = _pairSigned(e, userPhone, m);
                      if (d > 0) {
                        owedToYou += d;
                      } else if (d < 0) {
                        youOwe += (-d);
                      }
                    }
                  }
                  owedToYou = double.parse(owedToYou.toStringAsFixed(2));
                  youOwe = double.parse(youOwe.toStringAsFixed(2));
                  final net = owedToYou - youOwe;

                  if (openOnly && owedToYou == 0.0 && youOwe == 0.0) continue;

                  String subtitle;
                  if (owedToYou == 0 && youOwe == 0) {
                    subtitle = "All settled";
                  } else {
                    subtitle =
                    "Owed to you ₹${owedToYou.toStringAsFixed(0)} • You owe ₹${youOwe.toStringAsFixed(0)}";
                  }
                  if (lastTx != null) {
                    subtitle +=
                    " • last: ${(lastTx.label?.isNotEmpty == true ? lastTx.label! : lastTx.type)} ₹${_fmtAmt(lastTx.amount)}";
                  }

                  final memberPhones = g.memberPhones.take(3).toList();

                  items.add(_ChatListItem(
                    id: g.id,
                    phone: null,
                    isGroup: true,
                    title: g.name,
                    subtitle: subtitle,
                    imageUrl: g.avatarUrl,
                    fallbackEmoji: '👥',
                    memberAvatars: null,
                    memberPhones: memberPhones,
                    lastUpdate: lastTx?.date,
                    trailingText: net == 0
                        ? ""
                        : "${net > 0 ? '+ ' : '- '}₹${net.abs().toStringAsFixed(0)}",
                    trailingColor: net > 0
                        ? Colors.green[700]
                        : (net < 0 ? Colors.red[700] : Colors.grey[700]),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => GroupDetailScreen(
                          userId: userPhone,
                          group: g,
                        ),
                      ),
                    ),
                    onExpense: () async {
                      final allFriends =
                      await FriendService().streamFriends(userPhone).first;
                      final allGroups =
                      await GroupService().streamGroups(userPhone).first;
                      await showDialog(
                        context: context,
                        builder: (_) => AddExpenseDialog(
                          userPhone: userPhone,
                          friends: allFriends,
                          groups: allGroups,
                        ),
                      );
                    },
                    onSettle: () async {
                      await showDialog(
                        context: context,
                        builder: (_) => SettleUpDialog(
                          userPhone: userPhone,
                          friends: const [],
                          groups: [g],
                        ),
                      );
                    },
                    openDetails: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => GroupDetailScreen(
                          userId: userPhone,
                          group: g,
                        ),
                      ),
                    ),
                  ));
                }

                items.sort((a, b) {
                  final aDt =
                      a.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
                  final bDt =
                      b.lastUpdate ?? DateTime.fromMillisecondsSinceEpoch(0);
                  return bDt.compareTo(aDt);
                });

                if (items.isEmpty) {
                  return const Center(child: Text("No groups yet."));
                }

                return ListView.builder(
                  padding: const EdgeInsets.only(top: 10, bottom: 100),
                  itemCount: items.length,
                  itemBuilder: (_, i) => _GlassyChatTile(item: items[i]),
                );
              },
            );
          },
        );
      },
    );
  }
}

/* -------------------------------- ACTIVITY TAB ----------------------------- */

class ActivityTab extends StatelessWidget {
  final String userPhone;
  const ActivityTab({required this.userPhone, Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ActivityItem>>(
      stream: ActivityService().streamUserActivity(userPhone),
      builder: (context, snapshot) {
        final activities = snapshot.data ?? [];
        return ActivityFeedWidget(activities: activities);
      },
    );
  }
}

/* ---------------------------- Helpers & UI bits ---------------------------- */

String _fmtAmt(num n) {
  final s = n.toStringAsFixed(0);
  return s.replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]} ');
}

String _fmtTime(DateTime? dt) {
  if (dt == null) return '';
  final h = dt.hour.toString().padLeft(2, '0');
  final m = dt.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

/* ---------------------- Avatar cache & resolver (Firestore) ---------------- */

class _AvatarCache {
  static final Map<String, String?> _url = {};
  static Future<String?> getUrl(String phone) async {
    if (_url.containsKey(phone)) return _url[phone];
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(phone)
          .get();
      final url = (doc.data()?['avatar'] as String?)?.trim();
      _url[phone] = (url != null && url.isNotEmpty) ? url : null;
      return _url[phone];
    } catch (_) {
      _url[phone] = null;
      return null;
    }
  }
}

/* --------------------------- Data for our glossy tile ---------------------- */

class _ChatListItem {
  final String id;
  final String? phone; // friend phone for avatar fetch (null for groups)
  final bool isGroup;
  final String title;
  final String subtitle;
  final String? imageUrl; // direct image (friend/group) if we already have it
  final String fallbackEmoji; // used if no image
  final List<String>? memberAvatars; // (unused now)
  final List<String>? memberPhones; // for groups: fetch small avatars
  final DateTime? lastUpdate;

  // trailing amount (e.g., + ₹1000 / − ₹500)
  final String trailingText;
  final Color? trailingColor;

  final VoidCallback onTap;
  final VoidCallback onExpense;
  final VoidCallback onSettle;
  final VoidCallback openDetails;

  _ChatListItem({
    required this.id,
    required this.phone,
    required this.isGroup,
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.fallbackEmoji,
    required this.memberAvatars,
    required this.memberPhones,
    required this.lastUpdate,
    required this.trailingText,
    required this.trailingColor,
    required this.onTap,
    required this.onExpense,
    required this.onSettle,
    required this.openDetails,
  });
}

/* --------------------------- Polished glossy tile UI ----------------------- */

class _GlassyChatTile extends StatelessWidget {
  final _ChatListItem item;
  const _GlassyChatTile({required this.item, Key? key}) : super(key: key);

  ImageProvider? _imgFromPath(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http')) return NetworkImage(path);
    if (path.startsWith('assets/')) return AssetImage(path);
    return null;
  }

  Widget _friendAvatar() {
    final direct = _imgFromPath(item.imageUrl);
    if (direct != null) {
      return CircleAvatar(
        radius: 22,
        backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
        foregroundImage: direct,
      );
    }
    if (item.phone == null) {
      return CircleAvatar(
        radius: 22,
        backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
        child: Text(item.fallbackEmoji, style: const TextStyle(fontSize: 20)),
      );
    }
    return FutureBuilder<String?>(
      future: _AvatarCache.getUrl(item.phone!),
      builder: (context, snap) {
        final prov = _imgFromPath(snap.data);
        if (prov != null) {
          return CircleAvatar(
            radius: 22,
            backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
            foregroundImage: prov,
          );
        }
        return CircleAvatar(
          radius: 22,
          backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
          child: Text(item.fallbackEmoji, style: const TextStyle(fontSize: 20)),
        );
      },
    );
  }

  Widget _miniMember(String phone) {
    return FutureBuilder<String?>(
      future: _AvatarCache.getUrl(phone),
      builder: (context, snap) {
        final prov = _imgFromPath(snap.data);
        return CircleAvatar(
          radius: 16,
          backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
          foregroundImage: prov,
          child: prov == null
              ? const Text('👤', style: TextStyle(fontSize: 14))
              : null,
        );
      },
    );
  }

  Widget _avatar() {
    if (!item.isGroup) return _friendAvatar();

    // Group: stacked mini avatars (fetched by phone)
    final phones = (item.memberPhones ?? []).take(3).toList();
    if (phones.isEmpty) {
      final groupImg = _imgFromPath(item.imageUrl);
      return CircleAvatar(
        radius: 22,
        backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
        foregroundImage: groupImg,
        child: groupImg == null
            ? Text(item.fallbackEmoji, style: const TextStyle(fontSize: 20))
            : null,
      );
    }
    return SizedBox(
      width: 50,
      height: 46,
      child: Stack(
        children: List.generate(phones.length, (i) {
          final left = i * 18.0;
          return Positioned(left: left, top: 2, child: _miniMember(phones[i]));
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: item.onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFFFFFFF), Color(0xFFF3FBF9)],
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 16,
                offset: const Offset(0, 7),
              ),
            ],
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                _avatar(),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title + trailing amount + time
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 16.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: .2,
                                color: Color(0xFF09857a),
                              ),
                            ),
                          ),
                          if (item.trailingText.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            Text(
                              item.trailingText,
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                color: item.trailingColor ?? Colors.black87,
                              ),
                            ),
                          ],
                          const SizedBox(width: 10),
                          Text(
                            _fmtTime(item.lastUpdate),
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.grey[700],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style:
                        TextStyle(fontSize: 13, color: Colors.grey[900]),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                PopupMenuButton<String>(
                  tooltip: 'Actions',
                  onSelected: (v) {
                    if (v == 'expense') item.onExpense();
                    if (v == 'settle') item.onSettle();
                    if (v == 'open') item.openDetails();
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'expense', child: Text('Add expense')),
                    PopupMenuItem(value: 'settle', child: Text('Settle up')),
                    PopupMenuItem(value: 'open', child: Text('Open details')),
                  ],
                  child: const Icon(Icons.more_vert, color: Color(0xFF09857a)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
