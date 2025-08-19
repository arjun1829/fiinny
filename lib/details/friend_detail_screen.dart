// lib/details/friend_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/friend_model.dart';
import '../models/expense_item.dart';
import '../models/group_model.dart';
import '../services/expense_service.dart';
import '../services/group_service.dart';

import '../widgets/add_friend_expense_dialog.dart';
import '../widgets/settleup_dialog.dart';
import '../widgets/expense_list_widget.dart';
import '../widgets/simple_bar_chart_widget.dart';

// Chat tab (reuses the same thread id scheme as partners)
import 'package:lifemap/sharing/widgets/partner_chat_tab.dart';

// Shared split logic (keeps math identical everywhere)
import '../group/group_balance_math.dart' show computeSplits;

class FriendDetailScreen extends StatefulWidget {
  final String userPhone; // current user
  final String userName;
  final String? userAvatar;
  final FriendModel friend;

  const FriendDetailScreen({
    Key? key,
    required this.userPhone,
    required this.userName,
    this.userAvatar,
    required this.friend,
  }) : super(key: key);

  @override
  State<FriendDetailScreen> createState() => _FriendDetailScreenState();
}

class _FriendDetailScreenState extends State<FriendDetailScreen>
    with SingleTickerProviderStateMixin {
  Map<String, double>? _lastCustomSplit;
  late TabController _tabController;

  String? _friendAvatarUrl;
  String? _friendDisplayName;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadFriendProfile();
  }

  Future<void> _loadFriendProfile() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.friend.phone)
          .get();
      if (!mounted) return;
      if (doc.exists) {
        final data = doc.data();
        if (data != null) {
          setState(() {
            _friendAvatarUrl = (data['avatar'] as String?)?.trim();
            final n = (data['name'] as String?)?.trim();
            if (n != null && n.isNotEmpty) _friendDisplayName = n;
          });
        }
      }
    } catch (_) {/* fallback to FriendModel */}
  }

  Future<void> _refreshAll() async {
    await _loadFriendProfile();
    if (mounted) setState(() {});
  }

  // ---------- Pairwise logic (ONLY you <-> this friend) ----------

  // Settlement detector aligned with the rest of the app.
  bool _isSettlement(ExpenseItem e) {
    final t = (e.type).toLowerCase();
    final lbl = (e.label ?? '').toLowerCase();
    if (t.contains('settle') || lbl.contains('settle')) return true;
    // Your Settle Up flow: single counterparty, no custom splits, marked as bill/transfer
    if ((e.friendIds.length == 1) && (e.customSplits == null || e.customSplits!.isEmpty)) {
      return e.isBill == true;
    }
    return false;
  }

  /// Keep ONLY expenses that create a direct pairwise relation between YOU and FRIEND:
  /// - Settlement: (payer==you && recipients include friend) OR (payer==friend && recipients include you)
  /// - Normal:     (you paid AND friend is in split) OR (friend paid AND you are in split)
  bool _isPairwiseBetween(ExpenseItem e, String you, String friend) {
    if (_isSettlement(e)) {
      final recips = e.friendIds;
      return (e.payerId == you && recips.contains(friend)) ||
          (e.payerId == friend && recips.contains(you));
    }
    final splits = computeSplits(e);
    final youPaid_friendIn = (e.payerId == you) && splits.containsKey(friend);
    final friendPaid_youIn = (e.payerId == friend) && splits.containsKey(you);
    return youPaid_friendIn || friendPaid_youIn;
  }

  /// Filter & sort newest first
  List<ExpenseItem> _pairwiseExpenses(String you, String friend, List<ExpenseItem> all) {
    final list = all.where((e) => _isPairwiseBetween(e, you, friend)).toList();
    list.sort((a, b) => b.date.compareTo(a.date));
    return list;
  }

  /// Accumulate totals using pairwise-only items.
  /// Returns (youOwe, owedToYou, net) and per-group breakdown.
  (_Totals totals, Map<String, _BucketTotals> byBucket) _computePairwiseTotals(
      String you,
      String friend,
      List<ExpenseItem> pairwise,
      ) {
    double youOwe = 0.0;     // you owe friend
    double owedToYou = 0.0;  // friend owes you
    final oweByBucket = <String, double>{};
    final owedByBucket = <String, double>{};

    String bucketId(String? groupId) => (groupId == null || groupId.isEmpty) ? '__none__' : groupId;

    for (final e in pairwise) {
      final b = bucketId(e.groupId);

      if (_isSettlement(e)) {
        if (e.payerId == you) {
          owedToYou += e.amount;
          owedByBucket[b] = (owedByBucket[b] ?? 0) + e.amount;
        } else if (e.payerId == friend) {
          youOwe += e.amount;
          oweByBucket[b] = (oweByBucket[b] ?? 0) + e.amount;
        }
        continue;
      }

      final splits = computeSplits(e);
      final yourShare = splits[you] ?? 0.0;
      final theirShare = splits[friend] ?? 0.0;

      if (e.payerId == you) {
        // They owe you their share
        owedToYou += theirShare;
        owedByBucket[b] = (owedByBucket[b] ?? 0) + theirShare;
      } else if (e.payerId == friend) {
        // You owe your share
        youOwe += yourShare;
        oweByBucket[b] = (oweByBucket[b] ?? 0) + yourShare;
      }
    }

    // Round to trim fp dust
    youOwe = double.parse(youOwe.toStringAsFixed(2));
    owedToYou = double.parse(owedToYou.toStringAsFixed(2));
    final net = double.parse((owedToYou - youOwe).toStringAsFixed(2));

    final buckets = <String, _BucketTotals>{};
    final allB = {...oweByBucket.keys, ...owedByBucket.keys};
    for (final b in allB) {
      final owe = double.parse((oweByBucket[b] ?? 0.0).toStringAsFixed(2));
      final owed = double.parse((owedByBucket[b] ?? 0.0).toStringAsFixed(2));
      buckets[b] = _BucketTotals(owe: owe, owed: owed);
    }

    return (_Totals(owe: youOwe, owed: owedToYou, net: net), buckets);
  }

  // ---------- UI helpers ----------
  BoxDecoration _cardDeco(BuildContext context) {
    return BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16, offset: const Offset(0, 8))],
      border: Border.all(color: Colors.grey.shade200),
    );
  }

  Widget _card(BuildContext context, {required Widget child, EdgeInsets? padding}) {
    return Container(
      decoration: _cardDeco(context),
      child: Padding(padding: padding ?? const EdgeInsets.all(16), child: child),
    );
  }

  Widget _buildAvatar() {
    final url = (_friendAvatarUrl?.isNotEmpty == true) ? _friendAvatarUrl! : widget.friend.avatar;
    if (url.isNotEmpty && url.startsWith('http')) {
      return CircleAvatar(radius: 36, backgroundImage: NetworkImage(url));
    }
    final initial = widget.friend.name.isNotEmpty ? widget.friend.name[0].toUpperCase() : '👤';
    return CircleAvatar(radius: 36, child: Text(initial, style: const TextStyle(fontSize: 28)));
  }

  String get _displayName =>
      (_friendDisplayName?.isNotEmpty == true) ? _friendDisplayName! : widget.friend.name;

  // ---------- Actions ----------
  void _openAddExpense() async {
    final result = await showDialog(
      context: context,
      builder: (_) => AddFriendExpenseDialog(
        userPhone: widget.userPhone,
        userName: widget.userName,
        userAvatar: widget.userAvatar,
        friend: widget.friend,
        initialSplits: _lastCustomSplit,
      ),
    );
    if (result == true) setState(() {});
  }

  void _openSettleUp() async {
    final result = await showDialog(
      context: context,
      builder: (_) => SettleUpDialog(
        userPhone: widget.userPhone,
        friends: [widget.friend],
        groups: const [],
        initialFriend: widget.friend,
      ),
    );
    if (result == true) setState(() {});
  }

  void _remind() async {
    _tabController.animateTo(2);
    final msg =
        "Hi ${_displayName.split(' ').first}, quick nudge — current balance says we should settle soon. Can we do ₹… today? 😊";
    await Clipboard.setData(ClipboardData(text: msg));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Reminder copied — paste in chat')),
    );
  }

  Future<void> _deleteEntry(ExpenseItem e) async {
    try {
      await ExpenseService().deleteExpense(widget.userPhone, e.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Expense deleted')));
      setState(() {});
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete: $err')));
    }
  }

  // ---------- Build ----------
  @override
  Widget build(BuildContext context) {
    final friendPhone = widget.friend.phone;
    final you = widget.userPhone;
    final primary = Colors.teal.shade800;

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFF7FBFF), Color(0xFFEFF5FF)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(_displayName),
          backgroundColor: Colors.white,
          elevation: 2,
          actions: [
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () async {
                final controller = TextEditingController(text: _displayName);
                final name = await showDialog<String>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text("Edit Name"),
                    content: TextField(controller: controller, autofocus: true),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
                      ElevatedButton(
                        onPressed: () => Navigator.pop(ctx, controller.text.trim()),
                        child: const Text("Save"),
                      ),
                    ],
                  ),
                );
                if (name != null && name.isNotEmpty) {
                  setState(() => _friendDisplayName = name);
                }
              },
              tooltip: "Edit friend",
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            labelColor: Colors.teal.shade900,
            unselectedLabelColor: Colors.teal.shade600,
            labelStyle: const TextStyle(fontWeight: FontWeight.w800),
            unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700),
            indicatorColor: Colors.teal.shade800,
            indicatorWeight: 3,
            tabs: const [Tab(text: "History"), Tab(text: "Chart"), Tab(text: "Chat")],
          ),
        ),
        body: StreamBuilder<List<ExpenseItem>>(
          stream: ExpenseService().getExpensesStream(you),
          builder: (context, snapshot) {
            final all = snapshot.data ?? [];

            // Pairwise-only list
            final pairwise = _pairwiseExpenses(you, friendPhone, all);

            // Totals + per-group breakdown (pairwise only)
            final (totals, buckets) = _computePairwiseTotals(you, friendPhone, pairwise);
            final totalOwe = totals.owe;
            final totalOwed = totals.owed;
            final net = totals.net;

            return TabBarView(
              controller: _tabController,
              children: [
                // ------------------ 1) HISTORY ------------------
                RefreshIndicator(
                  onRefresh: _refreshAll,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 16, 14, 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Header card
                          _card(
                            context,
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                _buildAvatar(),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _displayName,
                                        style: TextStyle(
                                          fontSize: 22,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.teal.shade900,
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      if (widget.friend.phone.isNotEmpty)
                                        Text(
                                          widget.friend.phone,
                                          style: const TextStyle(fontSize: 14, color: Colors.black87),
                                        ),
                                      const SizedBox(height: 10),
                                      Wrap(
                                        spacing: 10,
                                        runSpacing: 8,
                                        crossAxisAlignment: WrapCrossAlignment.center,
                                        children: [
                                          // Net pill
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                            decoration: BoxDecoration(
                                              color: (net >= 0 ? Colors.green : Colors.redAccent).withOpacity(0.12),
                                              borderRadius: BorderRadius.circular(999),
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Icon(
                                                  net >= 0
                                                      ? Icons.trending_up_rounded
                                                      : Icons.trending_down_rounded,
                                                  size: 16,
                                                  color: net >= 0 ? Colors.green : Colors.redAccent,
                                                ),
                                                const SizedBox(width: 6),
                                                Text(
                                                  "${net >= 0 ? '+' : '-'} ₹${net.abs().toStringAsFixed(2)}",
                                                  style: TextStyle(
                                                    color: net >= 0 ? Colors.green : Colors.redAccent,
                                                    fontWeight: FontWeight.w800,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          // You owe
                                          Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Text("You Owe: ",
                                                  style: TextStyle(
                                                      fontWeight: FontWeight.bold, color: Colors.black87)),
                                              FittedBox(
                                                child: Text(
                                                  "₹${totalOwe.toStringAsFixed(2)}",
                                                  style: const TextStyle(
                                                      color: Colors.redAccent, fontWeight: FontWeight.w700),
                                                ),
                                              ),
                                            ],
                                          ),
                                          // Owes you
                                          Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Text("Owes You: ",
                                                  style: TextStyle(
                                                      fontWeight: FontWeight.bold, color: Colors.black87)),
                                              FittedBox(
                                                child: Text(
                                                  "₹${totalOwed.toStringAsFixed(2)}",
                                                  style: TextStyle(
                                                      color: Colors.teal.shade700, fontWeight: FontWeight.w700),
                                                ),
                                              ),
                                            ],
                                          ),
                                          // total pairwise transactions with this friend
                                          Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              const Text("Transactions: ",
                                                  style: TextStyle(
                                                      fontWeight: FontWeight.bold, color: Colors.black87)),
                                              Text(
                                                "${pairwise.length}",
                                                style: const TextStyle(
                                                    color: Colors.indigo, fontWeight: FontWeight.w700),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),

                          // Actions card (Add / Settle / Remind)
                          _card(
                            context,
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Wrap(
                                spacing: 12,
                                runSpacing: 10,
                                children: [
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.add),
                                    label: const Text("Add Expense"),
                                    onPressed: _openAddExpense,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.redAccent,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                  ),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.handshake),
                                    label: const Text("Settle Up"),
                                    onPressed: _openSettleUp,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: primary,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                  ),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.notifications_active_rounded),
                                    label: const Text("Remind"),
                                    onPressed: _remind,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.deepOrange,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Per-group breakdown (pairwise only)
                          StreamBuilder<List<GroupModel>>(
                            stream: GroupService().streamGroups(widget.userPhone),
                            builder: (context, groupSnap) {
                              final groups = groupSnap.data ?? [];
                              String nameFor(String bucketId) {
                                if (bucketId == '__none__') return 'Outside groups';
                                final g = groups.firstWhere(
                                      (x) => x.id == bucketId,
                                  orElse: () => GroupModel(
                                    id: bucketId,
                                    name: 'Group',
                                    memberPhones: const [],
                                    createdBy: '',
                                    createdAt: DateTime.now(),
                                  ),
                                );
                                return g.name;
                              }

                              final entries = buckets.entries
                                  .where((e) => e.value.owe > 0 || e.value.owed > 0)
                                  .toList()
                                ..sort((a, b) => (b.value.net.compareTo(a.value.net)));

                              if (entries.isEmpty) return const SizedBox.shrink();

                              return _card(
                                context,
                                padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      "Breakdown",
                                      style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                        color: Colors.teal.shade900,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    ...entries.map((e) {
                                      final b = e.value;
                                      final title = nameFor(e.key);
                                      final netColor =
                                      b.net >= 0 ? Colors.green : Colors.redAccent;
                                      final netText =
                                          "${b.net >= 0 ? '+' : '-'} ₹${b.net.abs().toStringAsFixed(2)}";
                                      return ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        dense: true,
                                        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                                        subtitle: Text(
                                          "You owe: ₹${b.owe.toStringAsFixed(2)}   •   Owes you: ₹${b.owed.toStringAsFixed(2)}",
                                          style: TextStyle(color: Colors.grey[800]),
                                        ),
                                        trailing: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                          decoration: BoxDecoration(
                                            color: netColor.withOpacity(0.12),
                                            borderRadius: BorderRadius.circular(999),
                                          ),
                                          child: Text(netText,
                                              style: TextStyle(color: netColor, fontWeight: FontWeight.w800)),
                                        ),
                                      );
                                    }),
                                  ],
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 16),

                          // Pairwise history list
                          _card(
                            context,
                            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  "Shared History",
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                    color: Colors.teal.shade900,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                ExpenseListWidget(
                                  expenses: pairwise,
                                  currentUserPhone: widget.userPhone,
                                  friend: widget.friend,
                                  onDelete: _deleteEntry,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // ------------------ 2) CHART ------------------
                RefreshIndicator(
                  onRefresh: _refreshAll,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 22, 14, 22),
                      child: _card(
                        context,
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                Text(
                                  "Overview",
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                    color: Colors.teal.shade900,
                                  ),
                                ),
                                const Spacer(),
                                Icon(Icons.bar_chart_rounded,
                                    color: Colors.teal.shade700, size: 18),
                              ],
                            ),
                            const SizedBox(height: 12),

                            // Compact summary chips
                            Builder(builder: (context) {
                              final int txCount = pairwise.length;
                              final double totalAmt = pairwise.fold<double>(0.0, (s, e) => s + e.amount);
                              return Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  // Tx count
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.teal.withOpacity(0.10),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.receipt_long, size: 14, color: Colors.teal),
                                        const SizedBox(width: 6),
                                        Text("Tx: $txCount",
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.teal.shade900,
                                                fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                                  // Total amount
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.indigo.withOpacity(0.08),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(Icons.currency_rupee, size: 14, color: Colors.indigo),
                                        const SizedBox(width: 6),
                                        Text("Total ₹${totalAmt.toStringAsFixed(0)}",
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.indigo.shade900,
                                                fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                                  // You owe label
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.red.withOpacity(0.10),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: const Text(
                                      "You owe",
                                      style: TextStyle(
                                          fontSize: 12, color: Colors.redAccent, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  // Owed to you label
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.green.withOpacity(0.10),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: const Text(
                                      "Owed to you",
                                      style: TextStyle(
                                          fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                ],
                              );
                            }),

                            const SizedBox(height: 14),

                            SizedBox(
                              height: 240,
                              child: SimpleBarChartWidget(
                                owe: totalOwe,
                                owed: totalOwed,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),

                // ------------------ 3) CHAT ------------------
                SafeArea(
                  top: false,
                  child: PartnerChatTab(
                    currentUserId: widget.userPhone,
                    partnerUserId: widget.friend.phone,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Totals {
  final double owe;   // you owe friend
  final double owed;  // friend owes you
  final double net;   // owed - owe
  const _Totals({required this.owe, required this.owed, required this.net});
}

class _BucketTotals {
  final double owe;   // you owe friend
  final double owed;  // friend owes you
  double get net => owed - owe;
  const _BucketTotals({required this.owe, required this.owed});
}
