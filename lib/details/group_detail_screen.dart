// lib/details/group_detail_screen.dart
import 'dart:io' show File;
import 'dart:typed_data';
import 'dart:ui' show ImageFilter;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

import '../models/group_model.dart';
import '../models/friend_model.dart';
import '../models/expense_item.dart';

import '../services/expense_service.dart';
import '../services/friend_service.dart';

// Use the math helpers via an alias so calls are unambiguous.
import '../group/group_balance_math.dart' as gbm;

// Optional sections reused
import '../group/group_chart_tab.dart';
import '../group/group_settings_sheet.dart';
import '../group/group_reminder_dialog.dart';

// Replaced: use the upgraded group-specific dialog
import '../widgets/add_group_expense_dialog.dart';
import '../widgets/settleup_dialog.dart';

class GroupDetailScreen extends StatefulWidget {
  final String userId; // phone
  final GroupModel group;

  const GroupDetailScreen({
    Key? key,
    required this.userId,
    required this.group,
  }) : super(key: key);

  @override
  State<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends State<GroupDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  List<FriendModel> _members = [];
  FriendModel? _creator;
  bool _loadingMembers = true;

  // Chat prefill when user taps "Discuss" on an expense
  String? _pendingChatDraft;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this); // Overview / Chart / Chat
    _fetchMembers();
  }

  Future<void> _fetchMembers() async {
    setState(() => _loadingMembers = true);
    final friends = <FriendModel>[];

    for (final phone in widget.group.memberPhones) {
      final f = await FriendService().getFriendByPhone(widget.userId, phone);
      if (f != null) {
        friends.add(f);
        if (phone == widget.group.createdBy) _creator = f;
      } else {
        final placeholder = FriendModel(phone: phone, name: phone, avatar: "👤");
        friends.add(placeholder);
        if (phone == widget.group.createdBy) _creator = placeholder;
      }
    }

    if (!mounted) return;
    setState(() {
      _members = friends;
      _loadingMembers = false;
    });
  }

  // ---------- Actions ----------
  Future<void> _openAddExpense() async {
    final result = await showDialog(
      context: context,
      builder: (_) => AddGroupExpenseDialog(
        userPhone: widget.userId,
        userName: "You",
        userAvatar: null,
        group: widget.group,
        allFriends: _members,
      ),
    );
    if (result == true && mounted) setState(() {});
  }

  Future<void> _openSettleUp() async {
    final result = await showDialog(
      context: context,
      builder: (_) => SettleUpDialog(
        userPhone: widget.userId,
        friends: _members,
        groups: [widget.group],
        initialGroup: widget.group,
      ),
    );
    if (result == true && mounted) setState(() {});
  }

  Future<void> _openRemind(List<ExpenseItem> groupExpenses) async {
    final participants = widget.group.memberPhones;
    final sent = await showDialog<bool>(
      context: context,
      builder: (_) => GroupReminderDialog(
        groupId: widget.group.id,
        currentUserPhone: widget.userId,
        participantPhones: participants,
        groupExpenses: groupExpenses,
      ),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reminder sent')),
      );
    }
  }

  void _openSettings() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => GroupSettingsSheet(
        group: widget.group,
        currentUserPhone: widget.userId,
        members: _members,
      ),
    );
    if (changed == true && mounted) {
      await _fetchMembers();
    }
  }

  // ---------- Helpers ----------
  FriendModel _friend(String phone) => _members.firstWhere(
        (f) => f.phone == phone,
    orElse: () => FriendModel(phone: phone, name: phone, avatar: '👤'),
  );

  String _fmtShort(DateTime dt) {
    const months = [
      'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
    ];
    return '${dt.day} ${months[dt.month - 1]}';
  }

  void _goDiscussExpense(ExpenseItem e) {
    final title = e.label?.isNotEmpty == true
        ? e.label!
        : (e.category?.isNotEmpty == true ? e.category! : "Expense");
    final msg =
        "Discussing: $title • ₹${e.amount.toStringAsFixed(0)} • ${_fmtShort(e.date)}";
    setState(() {
      _pendingChatDraft = msg;
    });
    _tabController.animateTo(2); // Chat tab
  }

  // Delete everywhere (all participants + optional group path)
  Future<void> _deleteExpenseEverywhere(ExpenseItem e) async {
    final fs = FirebaseFirestore.instance;
    final phones = <String>{
      widget.userId,
      e.payerId,
      ...e.friendIds.where((p) => p.isNotEmpty),
    }..removeWhere((p) => p.isEmpty);

    final batch = fs.batch();

    // User-scoped copies
    for (final p in phones) {
      final userDoc = fs.collection('users').doc(p).collection('expenses').doc(e.id);
      batch.delete(userDoc);
    }

    // Group-scoped canonical copy (if your backend uses this)
    if ((e.groupId ?? '').isNotEmpty) {
      final groupDoc = fs.collection('groups').doc(e.groupId).collection('expenses').doc(e.id);
      batch.delete(groupDoc);
    }

    await batch.commit();
  }

  Future<void> _confirmDelete(ExpenseItem e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete expense?'),
        content: Text(
          'This will permanently delete “${e.label?.isNotEmpty == true ? e.label! : e.category ?? 'Expense'}” for all members.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) {
      try {
        // Delete across all user copies + group collection (if present)
        await _deleteExpenseEverywhere(e);

        // Optional: also call your service for the local user (safe no-op if already gone)
        await ExpenseService().deleteExpense(widget.userId, e.id);
      } catch (_) {
        // swallow: best-effort across all paths
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Expense deleted')),
      );
      setState(() {});
    }
  }

  void _showExpenseDetails(BuildContext context, ExpenseItem e) {
    final splits = gbm.computeSplits(e);
    final payer = _friend(e.payerId);

    showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 4,
              width: 44,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            // Header row
            Row(
              children: [
                const Icon(Icons.receipt_long_rounded),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    e.label?.isNotEmpty == true
                        ? e.label!
                        : (e.category?.isNotEmpty == true ? e.category! : "Expense"),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  "₹${e.amount.toStringAsFixed(2)}",
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Payer / date
            Row(
              children: [
                const Text("Paid by: ", style: TextStyle(fontWeight: FontWeight.w700)),
                _avatar(e.payerId, radius: 12),
                const SizedBox(width: 8),
                Text(
                  payer.phone == widget.userId ? "You" : payer.name,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                Text(
                  "${_fmtShort(e.date)} ${e.date.hour.toString().padLeft(2,'0')}:${e.date.minute.toString().padLeft(2,'0')}",
                  style: TextStyle(color: Colors.grey.shade700),
                ),
              ],
            ),
            if (e.category != null && e.category!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Text("Category: ", style: TextStyle(fontWeight: FontWeight.w700)),
                  Flexible(child: Text(e.category!)),
                ],
              ),
            ],
            if (e.note.isNotEmpty) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text("Note: ${e.note}"),
              ),
            ],
            const Divider(height: 22),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                "Split details",
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: Colors.teal.shade900,
                ),
              ),
            ),
            const SizedBox(height: 10),
            ...splits.entries.map((s) {
              final f = _friend(s.key);
              final isYou = s.key == widget.userId;
              final owes = s.key != e.payerId; // payer "paid", others "owe"
              final subtitle = owes
                  ? (isYou ? "You owe" : "Owes")
                  : (isYou ? "You paid" : "Paid");
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: _avatar(s.key),
                title: Text(isYou ? "You" : f.name,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text("$subtitle ₹${s.value.toStringAsFixed(2)}"),
                trailing: Text(
                  "₹${s.value.toStringAsFixed(2)}",
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: owes ? Colors.redAccent : Colors.green,
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            // Actions inside sheet
            Row(
              children: [
                OutlinedButton.icon(
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Discuss'),
                  onPressed: () {
                    Navigator.pop(context);
                    _goDiscussExpense(e);
                  },
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  icon: const Icon(Icons.edit),
                  label: const Text('Edit'),
                  onPressed: () {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Edit coming soon')),
                    );
                  },
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                  label: const Text('Delete',
                      style: TextStyle(color: Colors.redAccent)),
                  onPressed: () {
                    Navigator.pop(context);
                    _confirmDelete(e);
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _avatar(String phone, {double radius = 16}) {
    final f = _friend(phone);
    final a = f.avatar;
    if (a.startsWith('http')) {
      return CircleAvatar(radius: radius, backgroundImage: NetworkImage(a));
    }
    final text =
    (a.isNotEmpty ? a : (f.name.isNotEmpty ? f.name[0] : '?')).toUpperCase();
    return CircleAvatar(radius: radius, child: Text(text));
  }

  // ---------- UI ----------
  @override
  Widget build(BuildContext context) {
    final labelColor = Colors.teal.shade900;
    final unselected = Colors.teal.shade600;

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
          title: Text(widget.group.name),
          backgroundColor: Colors.white,
          elevation: 2,
          actions: [
            IconButton(
              tooltip: 'Settings',
              icon: const Icon(Icons.settings_rounded),
              onPressed: _openSettings,
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            labelColor: labelColor,
            unselectedLabelColor: unselected,
            labelStyle: const TextStyle(fontWeight: FontWeight.w800),
            unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w700),
            indicatorColor: Colors.teal.shade800,
            indicatorWeight: 3,
            tabs: const [
              Tab(text: 'Overview'),
              Tab(text: 'Chart'),
              Tab(text: 'Chat'),
            ],
          ),
        ),
        body: _loadingMembers
            ? const Center(child: CircularProgressIndicator())
            : StreamBuilder<List<ExpenseItem>>(
          stream: ExpenseService()
              .getGroupExpensesStream(widget.userId, widget.group.id),
          builder: (context, snapshot) {
            final expenses = snapshot.data ?? [];

            // Pairwise math (YOU vs each member), group-only — unified logic
            final pairNet = gbm.pairwiseNetForUser(
              expenses,
              widget.userId,
              onlyGroupId: widget.group.id,
            );

            double owedToYou = 0, youOwe = 0;
            for (final v in pairNet.values) {
              if (v > 0) owedToYou += v;
              if (v < 0) youOwe += (-v);
            }

            return TabBarView(
              controller: _tabController,
              children: [
                // ============ OVERVIEW ============
                RefreshIndicator(
                  onRefresh: _fetchMembers,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    children: [
                      _headerCard(
                        owe: youOwe,
                        owed: owedToYou,
                        txCount: expenses.length,
                      ),
                      const SizedBox(height: 14),
                      _actionsRow(expenses),
                      const SizedBox(height: 16),
                      _balancesByMember(pairNet),
                      const SizedBox(height: 16),
                      _recentActivity(expenses),
                    ],
                  ),
                ),

                // ============ CHART ============
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 20),
                  child: GroupChartTab(
                    currentUserPhone: widget.userId,
                    members: _members,
                    expenses: expenses,
                  ),
                ),

                // ============ CHAT ============
                GroupChatTab(
                  groupId: widget.group.id,
                  currentUserId: widget.userId,
                  participants: widget.group.memberPhones,
                  initialDraft: _pendingChatDraft,
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  // ---------- Sections (Overview) ----------
  Widget _headerCard({
    required double owe,
    required double owed,
    required int txCount,
  }) {
    final createdByYou = widget.group.createdBy == widget.userId;
    final creatorLabel = createdByYou ? "You" : _friend(widget.group.createdBy).name;

    final net = owed - owe;
    final netColor = net >= 0 ? Colors.teal.shade800 : Colors.orange.shade800;
    final netText =
    net >= 0 ? "Net +₹${net.toStringAsFixed(0)}" : "Net -₹${(-net).toStringAsFixed(0)}";

    return _glassCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _groupAvatar(),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.group.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: Colors.teal.shade900)),
                const SizedBox(height: 6),
                Text(
                  "Created by $creatorLabel   •   ${_members.length} members   •   $txCount transactions",
                  style: TextStyle(color: Colors.grey.shade900),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _chip(
                      bg: owed > 0 ? Colors.green.withOpacity(.12) : Colors.grey.withOpacity(.12),
                      fg: owed > 0 ? Colors.green.shade700 : Colors.grey.shade700,
                      icon: Icons.call_received_rounded,
                      text: owed > 0 ? "Owed to you ₹${owed.toStringAsFixed(0)}" : "No one owes you",
                    ),
                    _chip(
                      bg: owe > 0 ? Colors.red.withOpacity(.12) : Colors.grey.withOpacity(.12),
                      fg: owe > 0 ? Colors.redAccent : Colors.grey.shade700,
                      icon: Icons.call_made_rounded,
                      text: owe > 0 ? "You owe ₹${owe.toStringAsFixed(0)}" : "You owe none",
                    ),
                    _chip(
                      bg: net >= 0 ? Colors.teal.withOpacity(.12) : Colors.orange.withOpacity(.12),
                      fg: netColor,
                      icon: Icons.balance_rounded,
                      text: netText,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionsRow(List<ExpenseItem> expenses) {
    return _glassCard(
      child: Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: _openAddExpense,
              icon: const Icon(Icons.add),
              label: const Text("Add Expense"),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.redAccent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: _openSettleUp,
              icon: const Icon(Icons.handshake),
              label: const Text("Settle Up"),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal.shade800,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(width: 10),
          IconButton.filled(
            onPressed: () => _openRemind(expenses),
            style: ButtonStyle(
              backgroundColor: MaterialStatePropertyAll(Colors.orange.shade600),
            ),
            icon: const Icon(Icons.notifications_active_rounded, color: Colors.white),
            tooltip: 'Send reminder',
          ),
        ],
      ),
    );
  }

  Widget _balancesByMember(Map<String, double> pairNet) {
    final rows = pairNet.entries.toList()
      ..sort((a, b) => b.value.abs().compareTo(a.value.abs())); // big first

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Balances by member",
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: Colors.teal.shade900)),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          Text("All settled for now.", style: TextStyle(color: Colors.grey[700]))
        else
          ...rows.map((e) {
            final phone = e.key;
            final amount = e.value; // + => they owe you, - => you owe them
            final f = _friend(phone);

            final displayName = phone == widget.userId
                ? 'You'
                : (f.name.isNotEmpty ? f.name : phone);

            final avatarUrl = f.avatar;
            final leading = avatarUrl.startsWith('http')
                ? CircleAvatar(backgroundImage: NetworkImage(avatarUrl))
                : CircleAvatar(child: Text((displayName.isNotEmpty ? displayName[0] : '?').toUpperCase()));

            final sentence = amount > 0
                ? "$displayName owes you ₹${amount.toStringAsFixed(2)}"
                : "You owe $displayName ₹${(-amount).toStringAsFixed(2)}";

            final amtColor = amount > 0 ? Colors.teal.shade800 : Colors.redAccent;

            return Container(
              margin: const EdgeInsets.symmetric(vertical: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(.05),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  )
                ],
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Row(
                children: [
                  leading,
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      sentence,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Text(
                    "₹${amount.abs().toStringAsFixed(0)}",
                    style: TextStyle(fontWeight: FontWeight.w800, color: amtColor),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  Widget _recentActivity(List<ExpenseItem> expenses) {
    if (expenses.isEmpty) {
      return _glassCard(
        child: Row(
          children: [
            const Icon(Icons.receipt_long_outlined),
            const SizedBox(width: 8),
            Text("No group activity yet.",
                style: TextStyle(color: Colors.grey.shade700)),
          ],
        ),
      );
    }

    final sorted = [...expenses]..sort((a, b) => b.date.compareTo(a.date));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Recent activity",
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: Colors.teal.shade900)),
        const SizedBox(height: 8),
        ...sorted.map((e) => _activityCard(e)),
      ],
    );
  }

  Widget _activityCard(ExpenseItem e) {
    final payer = _friend(e.payerId);
    final splits = gbm.computeSplits(e);
    final title = e.label?.isNotEmpty == true
        ? e.label!
        : (e.category?.isNotEmpty == true ? e.category! : "Expense");
    final cat = e.category;

    // People preview (first 3)
    final previewPhones = splits.keys.take(3).toList();
    final more = splits.length - previewPhones.length;

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(.65),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(.6)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.06),
                blurRadius: 12,
                offset: const Offset(0, 6),
              )
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title + amount + menu
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _avatar(e.payerId, radius: 16),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.teal.withOpacity(.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      "₹${e.amount.toStringAsFixed(0)}",
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Colors.teal.shade900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  PopupMenuButton<String>(
                    tooltip: 'More',
                    onSelected: (v) {
                      if (v == 'discuss') _goDiscussExpense(e);
                      if (v == 'delete') _confirmDelete(e);
                      if (v == 'edit') {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Edit coming soon')),
                        );
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: 'discuss',
                        child: ListTile(
                          leading: Icon(Icons.chat_bubble_outline),
                          title: Text('Discuss'),
                          dense: true,
                        ),
                      ),
                      PopupMenuItem(
                        value: 'edit',
                        child: ListTile(
                          leading: Icon(Icons.edit),
                          title: Text('Edit'),
                          dense: true,
                        ),
                      ),
                      PopupMenuItem(
                        value: 'delete',
                        child: ListTile(
                          leading: Icon(Icons.delete_outline, color: Colors.redAccent),
                          title: Text('Delete', style: TextStyle(color: Colors.redAccent)),
                          dense: true,
                        ),
                      ),
                    ],
                    icon: const Icon(Icons.more_vert),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Meta chips: category / date / people
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (cat != null && cat.isNotEmpty)
                    _chip(
                      bg: Colors.indigo.withOpacity(.08),
                      fg: Colors.indigo.shade900,
                      icon: Icons.category_outlined,
                      text: cat,
                    ),
                  _chip(
                    bg: Colors.grey.withOpacity(.10),
                    fg: Colors.grey.shade900,
                    icon: Icons.event,
                    text: "${_fmtShort(e.date)} ${e.date.year}",
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ...previewPhones.map((p) => Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: _avatar(p, radius: 10),
                      )),
                      if (more > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.teal.withOpacity(.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            "+$more",
                            style: TextStyle(
                              color: Colors.teal.shade900,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),

              if (e.note.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  e.note,
                  style: TextStyle(color: Colors.grey.shade800),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    "Paid by ${payer.phone == widget.userId ? "You" : payer.name}",
                    style: TextStyle(
                        color: Colors.grey.shade800,
                        fontWeight: FontWeight.w600,
                        fontSize: 12),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => _showExpenseDetails(context, e),
                    icon: const Icon(Icons.info_outline, size: 18),
                    label: const Text("Details"),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.teal.shade800,
                    ),
                  ),
                  const SizedBox(width: 6),
                  TextButton.icon(
                    onPressed: () => _goDiscussExpense(e),
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    label: const Text("Discuss"),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.orange.shade800,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------- Common UI bits ----------
  Widget _glassCard({required Widget child, EdgeInsets? padding}) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          padding: padding ?? const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(.7),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(.6)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(.06),
                blurRadius: 12,
                offset: const Offset(0, 6),
              )
            ],
          ),
          child: child,
        ),
      ),
    );
  }

  // SINGLE version of _chip (avoid duplicates)
  Widget _chip({
    required Color bg,
    required Color fg,
    required IconData icon,
    required String text,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _groupAvatar() {
    final url = widget.group.avatarUrl;
    if (url != null && url.isNotEmpty) {
      return CircleAvatar(radius: 28, backgroundImage: NetworkImage(url));
    }
    return const CircleAvatar(
      radius: 28,
      child: Icon(Icons.groups_rounded, size: 28),
    );
  }
}

/// =======================================================
/// ==============  GROUP CHAT (embedded)  ===============
/// =======================================================
class GroupChatTab extends StatefulWidget {
  final String groupId;
  final String currentUserId; // phone
  final List<String> participants; // phones
  final String? initialDraft;

  const GroupChatTab({
    Key? key,
    required this.groupId,
    required this.currentUserId,
    required this.participants,
    this.initialDraft,
  }) : super(key: key);

  @override
  State<GroupChatTab> createState() => _GroupChatTabState();
}

class _GroupChatTabState extends State<GroupChatTab> {
  final _msgController = TextEditingController();
  final _scrollController = ScrollController();
  final _imagePicker = ImagePicker();

  bool _pickingEmoji = false;
  bool _pickingSticker = false;
  bool _uploading = false;

  DocumentReference<Map<String, dynamic>> get _threadRef =>
      FirebaseFirestore.instance.collection('group_chats').doc(widget.groupId);

  CollectionReference<Map<String, dynamic>> get _messagesRef =>
      _threadRef.collection('messages');

  @override
  void initState() {
    super.initState();
    _ensureThreadDoc();
    if (widget.initialDraft != null && widget.initialDraft!.isNotEmpty) {
      _msgController.text = widget.initialDraft!;
      _msgController.selection = TextSelection.fromPosition(
        TextPosition(offset: _msgController.text.length),
      );
    }
  }

  @override
  void didUpdateWidget(covariant GroupChatTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialDraft != oldWidget.initialDraft &&
        (widget.initialDraft ?? '').isNotEmpty) {
      _msgController.text = widget.initialDraft!;
      _msgController.selection = TextSelection.fromPosition(
        TextPosition(offset: _msgController.text.length),
      );
    }
  }

  Future<void> _ensureThreadDoc() async {
    final doc = await _threadRef.get();
    final parts = {...widget.participants, widget.currentUserId}.toList();
    if (!doc.exists) {
      await _threadRef.set({
        'participants': parts,
        'createdAt': FieldValue.serverTimestamp(),
        'lastMessage': null,
        'lastFrom': null,
        'lastAt': FieldValue.serverTimestamp(),
        'lastType': null,
      });
    } else {
      await _threadRef.set({
        'participants': FieldValue.arrayUnion(parts),
      }, SetOptions(merge: true));
    }
  }

  Future<void> _sendMessage({
    required String text,
    String type = 'text',
    Map<String, dynamic> extra = const {},
  }) async {
    final msg = text.trim();
    if (type == 'text' && msg.isEmpty) return;

    final now = FieldValue.serverTimestamp();

    await _messagesRef.add({
      'from': widget.currentUserId,
      'message': msg,
      'timestamp': now,
      'type': type,
      'edited': false,
      ...extra,
    });

    final lastPreview = switch (type) {
      'image' => '[photo]',
      'file' => extra['fileName'] ?? '[file]',
      'sticker' => msg,
      _ => msg,
    };

    await _threadRef.set({
      'lastMessage': lastPreview,
      'lastFrom': widget.currentUserId,
      'lastAt': now,
      'lastType': type,
    }, SetOptions(merge: true));

    if (type == 'text') _msgController.clear();

    await Future.delayed(const Duration(milliseconds: 50));
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  // ---- Attachments ----
  String _mimeFromExtension(String? ext) {
    switch ((ext ?? '').toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'ppt':
        return 'application/vnd.ms-powerpoint';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      default:
        return 'application/octet-stream';
    }
  }

  String _guessMimeByName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }

  bool _isImageMime(String? mime) => (mime ?? '').startsWith('image/');

  Future<void> _pickFromCamera() async {
    try {
      final shot = await _imagePicker.pickImage(
          source: ImageSource.camera, imageQuality: 85);
      if (shot == null) return;
      await _uploadImageXFile(shot);
    } catch (_) {
      _toast('Camera unavailable');
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final img = await _imagePicker.pickImage(
          source: ImageSource.gallery, imageQuality: 85);
      if (img == null) return;
      await _uploadImageXFile(img);
    } catch (_) {
      _toast('Gallery unavailable');
    }
  }

  Future<void> _pickAnyFile() async {
    try {
      final res = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: kIsWeb,
        type: FileType.any,
      );
      if (res == null || res.files.isEmpty) return;
      final file = res.files.first;
      final name = file.name;
      final ext = (file.extension ?? '').toLowerCase();
      final extMime = _mimeFromExtension(ext);
      final mime =
      extMime == 'application/octet-stream' ? _guessMimeByName(name) : extMime;

      if (kIsWeb) {
        final bytes = file.bytes;
        if (bytes == null) return;
        await _uploadBytes(bytes, name, mime,
            typeHint: _isImageMime(mime) ? 'image' : 'file');
      } else {
        final path = file.path;
        if (path == null) return;
        await _uploadFilePath(path, name, mime,
            typeHint: _isImageMime(mime) ? 'image' : 'file');
      }
    } catch (_) {
      _toast('File picker error');
    }
  }

  Future<void> _uploadImageXFile(XFile xf) async {
    final name = xf.name;
    final mime = _guessMimeByName(name);
    if (kIsWeb) {
      final bytes = await xf.readAsBytes();
      await _uploadBytes(bytes, name, mime, typeHint: 'image');
    } else {
      await _uploadFilePath(xf.path, name, mime, typeHint: 'image');
    }
  }

  Future<void> _uploadBytes(
      Uint8List bytes,
      String name,
      String mime, {
        required String typeHint,
      }) async {
    setState(() => _uploading = true);
    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('group_chat_uploads')
          .child(widget.groupId)
          .child('${DateTime.now().millisecondsSinceEpoch}_$name');

      final metadata = SettableMetadata(contentType: mime);
      final task = await ref.putData(bytes, metadata);
      final url = await task.ref.getDownloadURL();

      await _sendMessage(
        text: typeHint == 'image' ? '[photo]' : name,
        type: typeHint,
        extra: {
          'fileUrl': url,
          'fileName': name,
          'mime': mime,
          'size': bytes.length,
        },
      );
    } catch (_) {
      _toast('Upload failed');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _uploadFilePath(
      String path,
      String name,
      String mime, {
        required String typeHint,
      }) async {
    setState(() => _uploading = true);
    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('group_chat_uploads')
          .child(widget.groupId)
          .child('${DateTime.now().millisecondsSinceEpoch}_$name');

      final metadata = SettableMetadata(contentType: mime);
      final task = await ref.putFile(File(path), metadata);
      final url = await task.ref.getDownloadURL();

      final fileSize = await File(path).length();

      await _sendMessage(
        text: typeHint == 'image' ? '[photo]' : name,
        type: typeHint,
        extra: {
          'fileUrl': url,
          'fileName': name,
          'mime': mime,
          'size': fileSize,
        },
      );
    } catch (_) {
      _toast('Upload failed');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  // ---- Message actions ----
  Future<void> _editMessage(DocumentSnapshot<Map<String, dynamic>> doc) async {
    final data = doc.data();
    if (data == null) return;
    if (data['from'] != widget.currentUserId) return;
    if ((data['type'] ?? 'text') != 'text') return;

    final controller =
    TextEditingController(text: (data['message'] ?? '').toString());
    final newText = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit message'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('Save')),
        ],
      ),
    );

    if (newText == null || newText.isEmpty) return;

    await doc.reference.update({
      'message': newText,
      'edited': true,
      'editedAt': FieldValue.serverTimestamp(),
    });

    await _threadRef.set({
      'lastMessage': newText,
      'lastFrom': widget.currentUserId,
      'lastAt': FieldValue.serverTimestamp(),
      'lastType': 'text',
    }, SetOptions(merge: true));
  }

  Future<void> _deleteMessage(DocumentSnapshot<Map<String, dynamic>> doc) async {
    final data = doc.data();
    if (data == null) return;
    if (data['from'] != widget.currentUserId) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete message?'),
        content: const Text('This will delete the message for all members.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirm != true) return;

    final fileUrl = (data['fileUrl'] ?? '').toString();
    if (fileUrl.isNotEmpty) {
      try {
        await FirebaseStorage.instance.refFromURL(fileUrl).delete();
      } catch (_) {}
    }

    await doc.reference.delete();
  }

  Future<void> _clearChat() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear chat?'),
        content: const Text('This will delete all messages for all members.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok != true) return;

    try {
      const batchSize = 50;
      while (true) {
        final snap = await _messagesRef.orderBy('timestamp').limit(batchSize).get();
        if (snap.docs.isEmpty) break;
        final batch = FirebaseFirestore.instance.batch();
        for (final d in snap.docs) {
          final fu = (d.data()['fileUrl'] ?? '').toString();
          if (fu.isNotEmpty) {
            try {
              await FirebaseStorage.instance.refFromURL(fu).delete();
            } catch (_) {}
          }
          batch.delete(d.reference);
        }
        await batch.commit();
        if (snap.docs.length < batchSize) break;
      }
      _toast('Chat cleared');
    } catch (_) {
      _toast('Failed to clear chat');
    }
  }

  // ---- Pickers (compact) ----
  final List<String> _emojiBank = const [
    '😀','😁','😂','🤣','😊','😍','😘','😎','🤗','🤩',
    '👍','👏','🙏','🙌','🔥','✨','🎉','❤️','💙','💚',
    '💛','💜','🧡','💯','✅','❌','🤝','🙋','👊','🤞',
    '🤔','😴','😭','😤','😇','😜','🤪','🥳','🤯','🥹',
  ];

  final List<String> _stickerBank = const [
    '🎉','🎂','🥳','💐','🌟','💪','🫶','🤍','🧠','🚀',
    '🍕','☕','🍫','🍰','🏆','🕺','💃','🎶','🧩','🛡️',
    '🐱','🐶','🐼','🐨','🐧','🦄','🐥','🐵','🐯','🐸',
  ];

  Widget _buildEmojiPicker() {
    return SizedBox(
      height: 200,
      child: GridView.builder(
        padding: const EdgeInsets.all(8),
        itemCount: _emojiBank.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 8,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
        ),
        itemBuilder: (_, i) {
          final e = _emojiBank[i];
          return InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () {
              _msgController.text += e;
              _msgController.selection = TextSelection.fromPosition(
                  TextPosition(offset: _msgController.text.length));
              setState(() => _pickingEmoji = false);
            },
            child: Center(child: Text(e, style: const TextStyle(fontSize: 22))),
          );
        },
      ),
    );
  }

  Widget _buildStickerPicker() {
    return SizedBox(
      height: 200,
      child: GridView.builder(
        padding: const EdgeInsets.all(8),
        itemCount: _stickerBank.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 6,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
        ),
        itemBuilder: (_, i) {
          final s = _stickerBank[i];
          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              _sendMessage(text: s, type: 'sticker');
              setState(() => _pickingSticker = false);
            },
            child: Container(
              decoration: BoxDecoration(
                color: Colors.teal.withOpacity(0.08),
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: Text(s, style: const TextStyle(fontSize: 32)),
            ),
          );
        },
      ),
    );
  }

  // ---- UI helpers ----
  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _showAttachmentSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_rounded),
              title: const Text('Camera'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromCamera();
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: const Text('Photo from gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickFromGallery();
              },
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_rounded),
              title: const Text('File / PDF'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAnyFile();
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.emoji_emotions),
              title: const Text('Sticker pack'),
              onTap: () {
                Navigator.pop(ctx);
                setState(() {
                  _pickingEmoji = false;
                  _pickingSticker = true;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  void _onBubbleLongPress(
      DocumentSnapshot<Map<String, dynamic>> d,
      bool isMe,
      String type,
      ) async {
    final actions = <Widget>[];

    if (isMe && type == 'text') {
      actions.add(
        ListTile(
          leading: const Icon(Icons.edit),
          title: const Text('Edit'),
          onTap: () {
            Navigator.pop(context);
            _editMessage(d);
          },
        ),
      );
    }
    if (isMe) {
      actions.add(
        ListTile(
          leading: const Icon(Icons.delete, color: Colors.red),
          title: const Text('Delete'),
          onTap: () {
            Navigator.pop(context);
            _deleteMessage(d);
          },
        ),
      );
    }
    actions.add(
      ListTile(
        leading: const Icon(Icons.copy_all),
        title: const Text('Copy'),
        onTap: () async {
          Navigator.pop(context);
          final text = (d.data()?['message'] ?? '').toString();
          await Clipboard.setData(ClipboardData(text: text));
          _toast('Copied');
        },
      ),
    );

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(child: Wrap(children: actions)),
    );
  }

  void _onOpenAttachment(Map<String, dynamic> data) {
    final url = (data['fileUrl'] ?? '').toString();
    final mime = (data['mime'] ?? '').toString();
    final name = (data['fileName'] ?? '').toString();
    if (url.isEmpty) return;

    if (mime.startsWith('image/')) {
      showDialog(
        context: context,
        builder: (_) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: InteractiveViewer(
            child: Image.network(url, fit: BoxFit.contain),
          ),
        ),
      );
    } else {
      Clipboard.setData(ClipboardData(text: url));
      _toast('Link copied: $name');
    }
  }

  @override
  void dispose() {
    _msgController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pickerVisible = _pickingEmoji || _pickingSticker;

    return Column(
      children: [
        // Messages
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _messagesRef
                .orderBy('timestamp', descending: true)
                .limit(200)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              final docs = snapshot.data?.docs ?? [];
              if (docs.isEmpty) {
                return const Center(child: Text("No messages yet."));
              }

              return ListView.builder(
                controller: _scrollController,
                reverse: true,
                itemCount: docs.length,
                itemBuilder: (context, i) {
                  final d = docs[i];
                  final data = d.data();
                  final isMe = data['from'] == widget.currentUserId;
                  final msg = (data['message'] ?? '') as String;
                  final type = (data['type'] ?? 'text') as String;
                  final ts = (data['timestamp'] as Timestamp?);
                  final timeStr = ts != null
                      ? TimeOfDay.fromDateTime(ts.toDate()).format(context)
                      : '';
                  final edited = data['edited'] == true;

                  final bubbleColor =
                  isMe ? Colors.teal.withOpacity(0.15) : Colors.grey.withOpacity(0.15);

                  Widget content;
                  if (type == 'sticker') {
                    content = Text(msg, style: const TextStyle(fontSize: 32));
                  } else if (type == 'image') {
                    content = GestureDetector(
                      onTap: () => _onOpenAttachment(data),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          (data['fileUrl'] ?? '').toString(),
                          width: 210,
                          height: 210,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const SizedBox(
                            width: 210,
                            height: 120,
                            child: Center(child: Icon(Icons.broken_image)),
                          ),
                        ),
                      ),
                    );
                  } else if (type == 'file') {
                    content = InkWell(
                      onTap: () => _onOpenAttachment(data),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.insert_drive_file, size: 20),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              (data['fileName'] ?? 'file').toString(),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                        ],
                      ),
                    );
                  } else {
                    content = Text(
                      msg,
                      style: TextStyle(
                        color: isMe ? Colors.teal[900] : Colors.grey[900],
                        fontWeight: isMe ? FontWeight.w600 : FontWeight.w400,
                      ),
                    );
                  }

                  return Align(
                    alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                    child: GestureDetector(
                      onLongPress: () => _onBubbleLongPress(d, isMe, type),
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        padding: EdgeInsets.symmetric(
                          horizontal: (type == 'sticker' || type == 'image') ? 8 : 12,
                          vertical: (type == 'sticker' || type == 'image') ? 8 : 10,
                        ),
                        decoration: BoxDecoration(
                          color: bubbleColor,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment:
                          isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                          children: [
                            content,
                            const SizedBox(height: 4),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(timeStr, style: TextStyle(fontSize: 11, color: Colors.grey[700])),
                                if (edited) ...[
                                  const SizedBox(width: 6),
                                  Text('edited', style: TextStyle(fontSize: 10, color: Colors.grey[600])),
                                ]
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),

        if (_uploading) const LinearProgressIndicator(minHeight: 2),

        if (pickerVisible) const Divider(height: 1),

        // Emoji / Sticker picker area
        AnimatedCrossFade(
          crossFadeState:
          pickerVisible ? CrossFadeState.showFirst : CrossFadeState.showSecond,
          duration: const Duration(milliseconds: 180),
          firstChild: _pickingEmoji ? _buildEmojiPicker() : _buildStickerPicker(),
          secondChild: const SizedBox.shrink(),
        ),

        const Divider(height: 1),

        // Composer
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 6, 6, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  padding: const EdgeInsets.all(6),
                  constraints: const BoxConstraints(),
                  tooltip: 'Attach',
                  onPressed: _showAttachmentSheet,
                  icon: const Icon(Icons.attach_file_rounded, size: 20, color: Colors.teal),
                ),
                IconButton(
                  padding: const EdgeInsets.all(6),
                  constraints: const BoxConstraints(),
                  tooltip: 'Emoji',
                  onPressed: () {
                    setState(() {
                      _pickingSticker = false;
                      _pickingEmoji = !_pickingEmoji;
                    });
                  },
                  icon:
                  const Icon(Icons.emoji_emotions_outlined, size: 20, color: Colors.teal),
                ),
                IconButton(
                  padding: const EdgeInsets.all(6),
                  constraints: const BoxConstraints(),
                  tooltip: 'Stickers',
                  onPressed: () {
                    setState(() {
                      _pickingEmoji = false;
                      _pickingSticker = !_pickingSticker;
                    });
                  },
                  icon: const Icon(Icons.auto_awesome, size: 20, color: Colors.teal),
                ),
                Expanded(
                  child: TextField(
                    controller: _msgController,
                    keyboardType: TextInputType.multiline,
                    textInputAction: TextInputAction.newline,
                    minLines: 1,
                    maxLines: 6,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      hintText: "Type a message…",
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.all(Radius.circular(12)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton(
                  padding: const EdgeInsets.all(6),
                  constraints: const BoxConstraints(),
                  icon: const Icon(Icons.send_rounded, size: 20, color: Colors.teal),
                  onPressed: () => _sendMessage(text: _msgController.text),
                ),
                PopupMenuButton<String>(
                  tooltip: 'More',
                  icon: const Icon(Icons.more_vert, size: 20, color: Colors.teal),
                  onSelected: (v) {
                    if (v == 'clear') _clearChat();
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'clear', child: Text('Clear chat')),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
