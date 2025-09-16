import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:lifemap/models/friend_model.dart';
import 'package:lifemap/models/group_model.dart';
import 'package:lifemap/models/expense_item.dart';

import 'package:lifemap/services/friend_service.dart';
import 'package:lifemap/services/group_service.dart';
import 'package:lifemap/services/activity_service.dart';
import 'package:lifemap/services/expense_service.dart';

import 'package:lifemap/widgets/activity_feed_widget.dart';
import 'package:lifemap/widgets/add_friend_dialog.dart';
import 'package:lifemap/widgets/add_group_dialog.dart';
import 'package:lifemap/widgets/settleup_dialog.dart';
import 'package:lifemap/widgets/split_summary_widget.dart';

import 'package:lifemap/details/friend_detail_screen.dart';
import 'package:lifemap/details/group_detail_screen.dart';
import 'package:lifemap/widgets/add_expense_dialog.dart';
import 'package:lifemap/screens/activity/activity_screen.dart';

/* ===========================================================================
 * FRIENDS & GROUPS — Upgraded UI (self-contained)
 * - AppBar icons: 📊 summary (bottom sheet), 🔍 search (overlay)
 * - Center FAB -> Activity screen
 * - "Open only" toggle under tabs
 * - Lists + math identical to existing logic
 * =========================================================================== */
enum Direction { all, owedToYou, youOwe }

class FriendsScreen extends StatefulWidget {
  final String userPhone;
  const FriendsScreen({required this.userPhone, Key? key}) : super(key: key);

  @override
  State<FriendsScreen> createState() => _FriendsScreenState(


  );

}
class _TinyPill extends StatelessWidget {
  final IconData icon; final String text;
  const _TinyPill({required this.icon, required this.text});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF09857a).withOpacity(.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFE0ECE9)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: const Color(0xFF09857a)),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(
              fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF09857a))),
        ],
      ),
    );
  }
}


class _ActionTile extends StatelessWidget {
  final IconData icon; final String label; final VoidCallback onTap;
  const _ActionTile({required this.icon, required this.label, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
          backgroundColor: const Color(0xFF09857a).withOpacity(.10),
          child: Icon(icon, color: const Color(0xFF09857a))),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

class _FriendsScreenState extends State<FriendsScreen>
    with TickerProviderStateMixin {
  late TabController _tabController;
  final tabs = const ['All', 'Friends', 'Groups', 'Activity'];
  bool get _filtersActive => _direction != Direction.all || _openOnly;



  // filters
  bool _openOnly = false;

  // search overlay
  final TextEditingController _searchCtrl = TextEditingController();
  String _query = '';
  bool _searchOpen = false;
  late final AnimationController _searchAnim;
  late final Animation<double> _searchSlide;
  Direction _direction = Direction.all;

  // What direction of balances to show


  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: tabs.length, vsync: this);

    _searchCtrl.addListener(() {
      final q = _searchCtrl.text.trim();
      if (q != _query) setState(() => _query = q);
    });

    _searchAnim =
        AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
    _searchSlide = CurvedAnimation(parent: _searchAnim, curve: Curves.easeOutCubic);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchCtrl.dispose();
    _searchAnim.dispose();
    super.dispose();
  }

  Future<List<FriendModel>> _fetchAllFriends() async {
    return await FriendService().streamFriends(widget.userPhone).first;
  }



  Future<List<GroupModel>> _fetchAllGroups() async {
    return await GroupService().streamGroups(widget.userPhone).first;
  }

  void _toggleSearch() {
    setState(() => _searchOpen = !_searchOpen);
    if (_searchOpen) {
      _searchAnim.forward();
    } else {
      _searchAnim.reverse();
      _searchCtrl.clear();
    }
  }

  Future<void> _openFilterSheet() async {
    Direction tmpDirection = _direction;
    bool tmpOpenOnly = _openOnly;

    await showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: false,
      backgroundColor: Colors.transparent, // <-- soft shadow look
      builder: (_) {
        return SafeArea(
          top: false,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.15),
                  blurRadius: 28,
                  offset: const Offset(0, 12),
                ),
              ],
              border: Border.all(color: const Color(0xFFE8F1EF)),
            ),
            child: StatefulBuilder(
              builder: (context, setModalState) {
                Widget chip({
                  required IconData icon,
                  required String label,
                  required bool selected,
                  required VoidCallback onTap,
                }) {
                  return ChoiceChip(
                    avatar: Icon(icon, size: 16,
                        color: selected ? Colors.white : const Color(0xFF09857a)),
                    label: Text(label),
                    selected: selected,
                    onSelected: (_) => setModalState(onTap),
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: selected ? Colors.white : const Color(0xFF09857a),
                    ),
                    backgroundColor: const Color(0xFF09857a).withOpacity(.08),
                    selectedColor: const Color(0xFF09857a),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: selected
                            ? const Color(0xFF09857a)
                            : const Color(0xFFE0ECE9),
                      ),
                    ),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  );
                }

                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // handle
                      Container(
                        width: 44, height: 5,
                        decoration: BoxDecoration(
                          color: Colors.black12,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      const SizedBox(height: 14),

                      Row(
                        children: const [
                          Icon(Icons.tune_rounded, color: Color(0xFF09857a)),
                          SizedBox(width: 8),
                          Text('Filters',
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                        ],
                      ),
                      const SizedBox(height: 14),

                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text('Show',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: Colors.grey[800],
                            )),
                      ),
                      const SizedBox(height: 8),

                      Wrap(
                        spacing: 8, runSpacing: 8,
                        children: [
                          chip(
                            icon: Icons.all_inclusive_rounded,
                            label: 'All',
                            selected: tmpDirection == Direction.all,
                            onTap: () => tmpDirection = Direction.all,
                          ),
                          chip(
                            icon: Icons.arrow_downward_rounded,
                            label: 'Owes you',
                            selected: tmpDirection == Direction.owedToYou,
                            onTap: () => tmpDirection = Direction.owedToYou,
                          ),
                          chip(
                            icon: Icons.arrow_upward_rounded,
                            label: 'You owe',
                            selected: tmpDirection == Direction.youOwe,
                            onTap: () => tmpDirection = Direction.youOwe,
                          ),
                        ],
                      ),

                      const SizedBox(height: 16),

                      Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFFF6FBF9),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFE4EFEC)),
                        ),
                        child: SwitchListTile.adaptive(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                          title: const Text('Open only',
                              style: TextStyle(fontWeight: FontWeight.w600)),
                          value: tmpOpenOnly,
                          activeColor: const Color(0xFF09857a),
                          onChanged: (v) => setModalState(() => tmpOpenOnly = v),
                        ),
                      ),

                      const SizedBox(height: 12),

                      Row(
                        children: [
                          TextButton.icon(
                            onPressed: () => setModalState(() {
                              tmpDirection = Direction.all;
                              tmpOpenOnly = false;
                            }),
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('Reset'),
                          ),
                          const Spacer(),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF09857a),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            onPressed: () {
                              Navigator.pop(context);
                              setState(() {
                                _direction = tmpDirection;
                                _openOnly  = tmpOpenOnly;
                              });
                            },
                            icon: const Icon(Icons.check_rounded),
                            label: const Text('Apply',
                                style: TextStyle(fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }




  Future<void> _openSummarySheet() async {
    final allTx   = await ExpenseService().getExpensesStream(widget.userPhone).first;
    final friends = await FriendService().streamFriends(widget.userPhone).first;
    if (!mounted) return;

    await showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,                 // allow tall/full height
      backgroundColor: Colors.transparent,      // for rounded top + shadow
      barrierColor: Colors.black.withOpacity(0.25),
      builder: (_) {
        return DraggableScrollableSheet(
          initialChildSize: 0.85,               // opens tall
          minChildSize: 0.35,
          maxChildSize: 0.98,                   // pull to (almost) full screen
          expand: false,
          builder: (context, scrollCtrl) {
            return Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.10),
                    blurRadius: 24,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  children: [
                    const SizedBox(height: 10),
                    // grab handle
                    Container(
                      width: 42, height: 5,
                      decoration: BoxDecoration(
                        color: Colors.black12,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Split Summary',
                      style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 10),

                    // Scrollable content area (hooked to the sheet’s controller)
                    Expanded(
                      child: SingleChildScrollView(
                        controller: scrollCtrl,
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [Color(0xFFFFFFFF), Color(0xFFF3FBF9)],
                            ),
                            border: Border.all(color: Color(0xFFE6ECEA)),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.06),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: SplitSummaryWidget(
                              expenses: allTx,
                              friends: friends,
                              userPhone: widget.userPhone,
                            ),
                          ),
                        ),
                      ),
                    ),

                    // Buttons pinned at the bottom
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      child: Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              icon: const Icon(Icons.handshake_rounded),
                              label: const Text('Settle Up'),
                              onPressed: () async {
                                final allFriends = await _fetchAllFriends();
                                final allGroups  = await _fetchAllGroups();
                                if (!mounted) return;
                                Navigator.pop(context);
                                await showDialog(
                                  context: context,
                                  builder: (_) => SettleUpDialog(
                                    userPhone: widget.userPhone,
                                    friends: allFriends,
                                    groups: allGroups,
                                  ),
                                );
                              },
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF09857a),
                                foregroundColor: Colors.white,
                              ),
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Close'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }


  Future<void> _quickPickAndOpen(BuildContext context, {required bool forSettle}) async {
    final allFriends = await _fetchAllFriends();
    final allGroups = await _fetchAllGroups();

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (context) {
        return _QuickPickerSheet(
          friends: allFriends,
          groups: allGroups,
          userPhone: widget.userPhone,
          onPickFriend: (friend) async {
            Navigator.pop(context);
            if (forSettle) {
              await showDialog(
                context: context,
                builder: (_) => SettleUpDialog(
                  userPhone: widget.userPhone,
                  friends: [friend],
                  groups: const [],
                ),
              );
            } else {
              final ok = await Navigator.push<bool>(
                context,
                MaterialPageRoute(
                  builder: (_) => AddExpenseScreen(
                    userPhone: widget.userPhone,
                    friends: allFriends,
                    groups: allGroups,
                    contextFriend: friend,
                  ),
                ),
              );
              if (ok == true && mounted) setState(() {});
            }
          },
          onPickGroup: (group) async {
            Navigator.pop(context);
            if (forSettle) {
              await showDialog(
                context: context,
                builder: (_) => SettleUpDialog(
                  userPhone: widget.userPhone,
                  friends: const [],
                  groups: [group],
                ),
              );
            } else {
              final ok = await Navigator.push<bool>(
                context,
                MaterialPageRoute(
                  builder: (_) => AddExpenseScreen(
                    userPhone: widget.userPhone,
                    friends: allFriends,
                    groups: allGroups,
                    contextGroup: group,
                  ),
                ),
              );
              if (ok == true && mounted) setState(() {});
            }
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      appBar: AppBar(
        title: const Text("Friends & Groups"),
        backgroundColor: Colors.white,
        elevation: 2,
        actions: [
          // <-- toggle first so it sits LEFT of the summary icon
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Transform.scale(
              scale: 0.90,
              child: Switch.adaptive(
                value: _openOnly,
                onChanged: (v) => setState(() => _openOnly = v),
                activeColor: const Color(0xFF09857a),
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Summary',
            icon: const Icon(Icons.stacked_bar_chart_rounded, color: Color(0xFF09857a)),
            onPressed: _openSummarySheet,
          ),
          IconButton(
            tooltip: 'Search',
            icon: const Icon(Icons.search_rounded, color: Color(0xFF09857a)),
            onPressed: _toggleSearch,
          ),
        ],

        bottom: PreferredSize(
          preferredSize: Size.fromHeight(kTextTabBarHeight + (_searchOpen ? 64 : 0)),
          child: Column(
            children: [
              TabBar(
                controller: _tabController,
                isScrollable: true, // keeps tabs comfy with the actions above
                labelColor: const Color(0xFF09857a),
                unselectedLabelColor: Colors.grey[600],
                indicatorColor: const Color(0xFF09857a),
                tabs: tabs.map((t) => Tab(text: t)).toList(),
              ),
              // search row inside app bar (unchanged)
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                transitionBuilder: (child, anim) =>
                    SizeTransition(sizeFactor: anim, axisAlignment: -1.0, child: child),
                child: !_searchOpen
                    ? const SizedBox.shrink()
                    : SizedBox(
                  height: 64,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
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
                              autofocus: true,
                              decoration: const InputDecoration(
                                hintText: "Search friends, groups…",
                                border: InputBorder.none,
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Close',
                            icon: const Icon(Icons.close_rounded,
                                color: Color(0xFF09857a)),
                            onPressed: _toggleSearch,
                            splashRadius: 20,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),



      ),
      floatingActionButton: _BottomCTAButton(
        onTap: () {
          Navigator.of(context).push(
            _SlideUpRoute(
              child: ActivityScreen(userPhone: widget.userPhone),
            ),
          );
        },

      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
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
                  direction: _direction,
                  onOpenFilters: _openFilterSheet,

                ),
                FriendsTab(
                  userPhone: widget.userPhone,
                  openOnly: _openOnly,
                  query: _query,
                  direction: _direction,

                ),
                GroupsTab(
                  userPhone: widget.userPhone,
                  openOnly: _openOnly,
                  query: _query,
                  direction: _direction,
                ),
                ActivityTab(userPhone: widget.userPhone),
              ],
            ),
          ),



        ],
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

// Overall totals (like Splitwise header)
class _OverallTotals {
  final double owedToYou;
  final double youOwe;
  const _OverallTotals(this.owedToYou, this.youOwe);
}

_OverallTotals _computeOverallTotals(
    List<ExpenseItem> allTx,
    String you,
    ) {
  final perPerson = <String, double>{};

  for (final e in allTx) {
    final parts = _participantsOf(e);
    for (final other in parts) {
      if (other == you) continue;
      final d = _pairSigned(e, you, other);
      perPerson.update(other, (v) => v + d, ifAbsent: () => d);
    }
  }

  double owedToYou = 0, youOwe = 0;
  for (final d in perPerson.values) {
    if (d > 0) owedToYou += d;
    if (d < 0) youOwe += (-d);
  }
  // round to 2dp to avoid tiny float noise
  owedToYou = double.parse(owedToYou.toStringAsFixed(2));
  youOwe    = double.parse(youOwe.toStringAsFixed(2));
  return _OverallTotals(owedToYou, youOwe);
}


/* ---------------------------------- ALL TAB -------------------------------- */

class AllTab extends StatelessWidget {
  final String userPhone;
  final bool openOnly;
  final String query;
  final Direction direction;           // <— add
  final VoidCallback onOpenFilters;    // <— add

  const AllTab({
    required this.userPhone,
    required this.openOnly,
    required this.query,
    required this.direction,
    required this.onOpenFilters,
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

                final items = <_ChatListItem>[];

                // ---------- Friends ----------
                for (final f in friends) {
                  if (query.isNotEmpty &&
                      !_matches(query, f.name) &&
                      !_matches(query, f.phone)) continue;

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

                  if (direction == Direction.owedToYou && net <= 0) continue;
                  if (direction == Direction.youOwe   && net >= 0) continue;

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
                    trailingText: net == 0 ? "" : "₹${net.abs().toStringAsFixed(0)}",
                    trailingColor: net > 0 ? Colors.green[700]
                        : (net < 0 ? Colors.red[700] : Colors.grey[700]),
                    trailingHint: _owedLabel(net), // NEW

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
                      final ok = await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddExpenseScreen(
                            userPhone: userPhone,
                            friends: allFriends,
                            groups: allGroups,
                            contextFriend: f, // context-aware
                          ),
                        ),
                      );
                      if (ok == true && context.mounted) {}
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
                  if (direction == Direction.owedToYou && net <= 0) continue;
                  if (direction == Direction.youOwe   && net >= 0) continue;

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
                    trailingHint: _owedLabel(net),
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
                      final ok = await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddExpenseScreen(
                            userPhone: userPhone,
                            friends: allFriends,
                            groups: allGroups,
                            contextGroup: g, // context-aware
                          ),
                        ),
                      );
                      if (ok == true && context.mounted) {}
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

                if (items.isEmpty) {
                  return const Center(child: Text("No friends or groups yet."));
                }

                final bottomPad = MediaQuery.of(context).padding.bottom + 120.0;
                final totals = _computeOverallTotals(allTx, userPhone);

                return RefreshIndicator(
                  onRefresh: () async {},
                  child: ListView.builder(
                    padding: EdgeInsets.only(top: 8, bottom: bottomPad),
                    itemCount: items.length + 1, // +1 for header
                    itemBuilder: (context, i) {
                      if (i == 0) {
                        final net = totals.owedToYou - totals.youOwe;
                        final title = net >= 0
                            ? "Overall, you are owed ₹${net.toStringAsFixed(0)}"
                            : "Overall, you owe ₹${(-net).toStringAsFixed(0)}";

                        return Padding(
                          padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
                          child: Container(
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                begin: Alignment.topLeft, end: Alignment.bottomRight,
                                colors: [Color(0xFFF6FBF9), Color(0xFFE9F4F1)],
                              ),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: const Color(0xFFE5F1EE)),
                            ),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              title: Text(
                                title,
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: net >= 0 ? Colors.teal[700] : Colors.red[700],
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    "Owed to you ₹${totals.owedToYou.toStringAsFixed(0)} • You owe ₹${totals.youOwe.toStringAsFixed(0)}",
                                    style: const TextStyle(fontSize: 12.5),
                                  ),
                                  const SizedBox(height: 6),
                                  Wrap(
                                    spacing: 6, runSpacing: 6,
                                    children: [
                                      if (direction == Direction.owedToYou)
                                        const _TinyPill(icon: Icons.arrow_downward_rounded, text: 'Owes you'),
                                      if (direction == Direction.youOwe)
                                        const _TinyPill(icon: Icons.arrow_upward_rounded, text: 'You owe'),
                                      if (openOnly)
                                        const _TinyPill(icon: Icons.lock_open_rounded, text: 'Open only'),
                                    ],
                                  ),
                                ],
                              ),
                              trailing: IconButton(
                                icon: const Icon(Icons.tune_rounded, size: 20, color: Color(0xFF09857a)),
                                onPressed: onOpenFilters,
                              ),
                              onTap: onOpenFilters,
                            ),
                          ),
                        );

                      }

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
  final Direction direction;
  const FriendsTab({
    required this.userPhone,
    required this.openOnly,
    required this.query,
    required this.direction,
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
              if (direction == Direction.owedToYou && net <= 0) continue;
              if (direction == Direction.youOwe   && net >= 0) continue;

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
                trailingHint: _owedLabel(net),
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
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AddExpenseScreen(
                        userPhone: userPhone,
                        friends: allFriends,
                        groups: allGroups,
                        contextFriend: f,
                      ),
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

            final bottomPad = MediaQuery.of(context).padding.bottom + 120.0;
            return ListView.builder(
              padding: EdgeInsets.only(top: 10, bottom: bottomPad),
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
  final Direction direction;
  const GroupsTab({
    required this.userPhone,
    required this.openOnly,
    required this.query,
    required this.direction,
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
                  if (direction == Direction.owedToYou && net <= 0) continue;
                  if (direction == Direction.youOwe   && net >= 0) continue;

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
                    trailingHint: _owedLabel(net),
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
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddExpenseScreen(
                            userPhone: userPhone,
                            friends: allFriends,
                            groups: allGroups,
                            contextGroup: g,
                          ),
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

                final bottomPad = MediaQuery.of(context).padding.bottom + 120.0;
                return ListView.builder(
                  padding: EdgeInsets.only(top: 10, bottom: bottomPad),
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
String _owedLabel(num net) {
  if (net > 0) return 'you are owed';
  if (net < 0) return 'you owe';
  return '';
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
  final String trailingHint; // NEW: "you are owed" / "you owe"


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
    this.trailingHint = '',

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

    // 1) Prefer the group's logo if available (matches GroupDetailScreen)
    final groupImg = _imgFromPath(item.imageUrl);
    if (groupImg != null) {
      return CircleAvatar(
        radius: 22,
        backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
        foregroundImage: groupImg,
      );
    }

    // 2) Else fall back to stacked member avatars (if any)
    final phones = (item.memberPhones ?? []).take(3).toList();
    if (phones.isNotEmpty) {
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

    // 3) Final fallback: emoji/icon
    return CircleAvatar(
      radius: 22,
      backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
      child: Text(item.fallbackEmoji, style: const TextStyle(fontSize: 20)),
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
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  item.trailingText, // ₹123
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: item.trailingColor ?? Colors.black87,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  item.trailingHint, // you are owed / you owe
                                  style: TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600,
                                    color: (item.trailingColor ?? Colors.black87).withOpacity(.85),
                                  ),
                                ),
                              ],
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
                        style: TextStyle(fontSize: 13, color: Colors.grey[900]),
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

/* ------------------------------- UI helpers -------------------------------- */

class _SheetHeader extends StatelessWidget {
  final String title;
  const _SheetHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 8),
        Container(
          width: 42,
          height: 5,
          decoration: BoxDecoration(
            color: Colors.black12,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          title,
          style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

// Smooth slide-up route for ActivityScreen
class _SlideUpRoute<T> extends PageRouteBuilder<T> {
  _SlideUpRoute({required Widget child})
      : super(
    transitionDuration: const Duration(milliseconds: 520),
    reverseTransitionDuration: const Duration(milliseconds: 360),
    pageBuilder: (_, __, ___) => child,
    transitionsBuilder: (_, animation, __, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 1),  // from bottom
          end: Offset.zero,
        ).animate(curved),
        child: FadeTransition(
          opacity: Tween<double>(begin: 0, end: 1).animate(curved),
          child: child,
        ),
      );
    },
  );
}


class _BottomCTAButton extends StatefulWidget {
  final VoidCallback onTap;
  const _BottomCTAButton({required this.onTap});

  @override
  State<_BottomCTAButton> createState() => _BottomCTAButtonState();
}

class _BottomCTAButtonState extends State<_BottomCTAButton>
    with TickerProviderStateMixin {
  late final AnimationController _pulse =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))
    ..repeat(reverse: true);

  late final AnimationController _press =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 180));

  @override
  void dispose() {
    _pulse.dispose();
    _press.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;

    return Padding(
      padding: EdgeInsets.only(
          right: 12,
          bottom: bottom > 0 ? bottom : 12),
      child: GestureDetector(
        onTapDown: (_) => _press.forward(),
        onTapCancel: () => _press.reverse(),
        onTapUp: (_) async {
          await _press.reverse();
          widget.onTap();
        },
        child: AnimatedBuilder(
          animation: Listenable.merge([_pulse, _press]),
          builder: (_, __) {
            final glowT = Curves.easeInOut.transform(_pulse.value);
            final blur = 18.0 + 10.0 * glowT;
            final spread = 1.0 + 2.0 * glowT;
            final scale = Tween(begin: 1.0, end: 0.95)
                .animate(CurvedAnimation(parent: _press, curve: Curves.easeOut))
                .value;

            return Transform.scale(
              scale: scale,
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFE9F6F3), Color(0xFFD7EFE9)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0x3309857a),
                      blurRadius: blur,
                      spreadRadius: spread,
                      offset: const Offset(0, 10),
                    ),
                    const BoxShadow(
                      color: Color(0x55FFFFFF),
                      blurRadius: 8,
                      offset: Offset(0, -2),
                    ),
                  ],
                  border: Border.all(color: const Color(0xFFE5F1EE), width: 1.2),
                ),
                child: Container(
                  margin: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    color: const Color(0xFF09857a),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0x7009857a).withOpacity(0.65),
                        blurRadius: 18 + 6 * glowT,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.add, color: Colors.white, size: 28),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _QuickPickerSheet extends StatefulWidget {
  final List<FriendModel> friends;
  final List<GroupModel> groups;
  final String userPhone;
  final void Function(FriendModel friend) onPickFriend;
  final void Function(GroupModel group) onPickGroup;

  const _QuickPickerSheet({
    required this.friends,
    required this.groups,
    required this.userPhone,
    required this.onPickFriend,
    required this.onPickGroup,
  });

  @override
  State<_QuickPickerSheet> createState() => _QuickPickerSheetState();
}

class _QuickPickerSheetState extends State<_QuickPickerSheet> {
  int _seg = 0; // 0 friends, 1 groups
  final TextEditingController _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isFriends = _seg == 0;
    final q = _q.text.trim().toLowerCase();
    final friends = widget.friends
        .where((f) =>
    q.isEmpty ||
        f.name.toLowerCase().contains(q) ||
        f.phone.toLowerCase().contains(q))
        .toList();
    final groups =
    widget.groups.where((g) => q.isEmpty || g.name.toLowerCase().contains(q)).toList();

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 12,
          right: 12,
          top: 10,
          bottom: 12 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _SheetHeader(title: 'Select Friend or Group'),
            const SizedBox(height: 8),
            // Segments
            Container(
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFFF0F4F3),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  _segBtn('Friends', 0),
                  _segBtn('Groups', 1),
                ],
              ),
            ),
            const SizedBox(height: 10),
            // Search
            TextField(
              controller: _q,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: isFriends ? 'Search friends...' : 'Search groups...',
                filled: true,
                fillColor: const Color(0xFFF7FAF9),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFE6ECEA)),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: isFriends ? friends.length : groups.length,
                itemBuilder: (_, i) {
                  if (isFriends) {
                    final f = friends[i];
                    return ListTile(
                      leading: const CircleAvatar(child: Text('👤')),
                      title: Text(f.name),
                      subtitle: Text(f.phone),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => widget.onPickFriend(f),
                    );
                  } else {
                    final g = groups[i];
                    return ListTile(
                      leading: const CircleAvatar(child: Text('👥')),
                      title: Text(g.name),
                      subtitle: Text('${g.memberPhones.length} members'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => widget.onPickGroup(g),
                    );
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Expanded _segBtn(String text, int idx) {
    final active = _seg == idx;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => setState(() => _seg = idx),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? const Color(0xFF09857a) : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            text,
            style: TextStyle(
              color: active ? Colors.white : const Color(0xFF09857a),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
