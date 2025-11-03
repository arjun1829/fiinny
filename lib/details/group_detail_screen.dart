// lib/details/group_detail_screen.dart
import '../chat/io_file_ops.dart' if (dart.library.html) '../chat/io_file_ops_stub.dart';

import 'dart:typed_data';
import 'dart:ui' show ImageFilter;
import 'package:characters/characters.dart';
import 'package:url_launcher/url_launcher.dart';

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
import '../services/group_service.dart';
import '../core/ads/ads_banner_card.dart';
import '../core/ads/ads_shell.dart';
import '../screens/edit_expense_screen.dart';

// Use the math helpers via an alias so calls are unambiguous.
import '../group/group_balance_math.dart' as gbm;

// Optional sections reused
import '../group/group_chart_tab.dart';
import '../group/group_settings_sheet.dart';
import '../group/group_reminder_dialog.dart';

// Replaced: use the upgraded group-specific dialog
import '../widgets/add_group_expense_dialog.dart';
import '../widgets/settleup_dialog.dart';
import 'package:lifemap/ui/comp/share_badge.dart';

import '../core/flags/fx_flags.dart';
import '../settleup_v2/index.dart';
import 'analytics/group_analytics_tab.dart';

import '../details/recurring/group_recurring_screen.dart';

// put this near the top of the file, after imports
Future<Uri?> _safeDownloadUri(String raw) async {
  try {
    if (!raw.contains('://')) {
      final ref = FirebaseStorage.instance.ref(raw);
      final d = await ref.getDownloadURL();
      return Uri.parse(d);
    }

    final uri = Uri.parse(raw);

    if (uri.scheme == 'gs') {
      final ref = FirebaseStorage.instance.refFromURL(raw);
      final d = await ref.getDownloadURL();
      return Uri.parse(d);
    }

    final looksLikeStorage = uri.host.contains('firebasestorage.googleapis.com');
    final hasToken = uri.queryParameters.containsKey('token');
    if (looksLikeStorage && !hasToken) {
      final ref = FirebaseStorage.instance.refFromURL(raw);
      final d = await ref.getDownloadURL();
      return Uri.parse(d);
    }

    return uri; // non-Firebase links (Drive/Dropbox/etc.)
  } catch (_) {
    return null;
  }
}

// Add near your helpers (below _safeDownloadUri)

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
  late GroupModel _group;

  List<FriendModel> _members = [];
  FriendModel? _creator;
  bool _loadingMembers = true;
  bool _balancesExpanded = true; // or false if you want it collapsed by default
  Map<String, String> _memberDisplayNames = {};
  List<Map<String, dynamic>> get _shareFaces => _members
            .map((m) => {
                    'id': m.phone,
                    'name': (m.name.isNotEmpty && m.name != m.phone)
                          ? m.name
                          : _maskPhoneForDisplay(m.phone),
              'avatarUrl': m.avatar.startsWith('http') ? m.avatar : null,
            })
      .toList();


  // Chat prefill when user taps "Discuss" on an expense
  String? _pendingChatDraft;

  // Prefer names; otherwise show a friendly placeholder instead of phone
  String _maskPhoneForDisplay(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return 'Member';
    final last4 = digits.length >= 4 ? digits.substring(digits.length - 4) : digits;
    return 'Member ($last4)'; // e.g., Member (4821)
  }

  bool _looksLikeImageName(String? s) {
    final n = (s ?? '').toLowerCase();
    return n.endsWith('.jpg') || n.endsWith('.jpeg') ||
        n.endsWith('.png') || n.endsWith('.gif') ||
        n.endsWith('.webp');
  }

// Inline preview first; fallback to tile if not an image or if resolving fails
  Widget _attachmentView({
    required String url,
    String? name,
    int? sizeBytes,
  }) {
    return FutureBuilder<Uri?>(
      future: _safeDownloadUri(url),
      builder: (context, snap) {
        final resolved = snap.data;
        if (snap.connectionState != ConnectionState.done || resolved == null) {
          // While resolving (or failed), show the tile
          return _attachmentTile(url: url, name: name, sizeBytes: sizeBytes);
        }

        // Decide if it's an image by filename (explicit name or URL tail)
        final tail = Uri.decodeComponent(
          resolved.pathSegments.isNotEmpty ? resolved.pathSegments.last : '',
        );
        final isImg = _looksLikeImageName(name) || _looksLikeImageName(tail);

        if (!isImg) {
          // Not an image → keep the compact tile that opens externally
          return _attachmentTile(
            url: resolved.toString(),
            name: name,
            sizeBytes: sizeBytes,
          );
        }

        // Image → show inline with tap-to-zoom
        return GestureDetector(
          onTap: () {
            showDialog(
              context: context,
              builder: (_) => Dialog(
                insetPadding: const EdgeInsets.all(16),
                child: InteractiveViewer(
                  child: Image.network(resolved.toString(), fit: BoxFit.contain),
                ),
              ),
            );
          },
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220),
              child: Image.network(
                resolved.toString(),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _attachmentTile(
                  url: resolved.toString(),
                  name: name,
                  sizeBytes: sizeBytes,
                ),
              ),
            ),
          ),
        );
      },
    );
  }




  Widget _attachmentTile({
    required String url,
    String? name,
    int? sizeBytes,
  }) {
    final cs = Theme.of(context).colorScheme;

    String displayName = name ?? '';
    if (displayName.isEmpty) {
      final u = Uri.tryParse(url);
      displayName = (u != null && u.pathSegments.isNotEmpty)
          ? u.pathSegments.last
          : 'Attachment';
    }



    String _fmtBytesLocal(int b) {
      if (b <= 0) return '';
      const units = ['B','KB','MB','GB','TB'];
      double v = b.toDouble();
      int i = 0;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return '${v < 10 ? v.toStringAsFixed(1) : v.toStringAsFixed(0)} ${units[i]}';
    }

    final sizeText = sizeBytes == null ? '' : _fmtBytesLocal(sizeBytes);

    return InkWell(
      onTap: () async {
        final launchUri = await _safeDownloadUri(url);
        if (launchUri == null) return;
        final ok = await launchUrl(launchUri, mode: LaunchMode.externalApplication);
        if (!ok && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not open $displayName')),
          );
        }
      },

      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: cs.surfaceVariant.withOpacity(0.6),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.attach_file, size: 18),
            const SizedBox(width: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 220),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  if (sizeText.isNotEmpty)
                    Text(sizeText,
                        style: TextStyle(fontSize: 11, color: Colors.grey[700])),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.open_in_new, size: 16),
          ],
        ),
      ),
    );
  }


  String _nameFor(String phone) {
    if (phone == widget.userId) return 'You';
    final f = _friend(phone);
    final n = f.name.trim();
    // If FriendService has a real name, use it; if it fell back to the phone, mask it.
    if (n.isNotEmpty && n != phone) return n;
    return _maskPhoneForDisplay(phone);
  }


  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }


  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this); // Overview / Chart / Analytics / Chat
    _group = widget.group;
    _fetchMembers();
  }

  Future<void> _fetchMembers() async {
    setState(() => _loadingMembers = true);
    final latest = await GroupService().getGroupById(_group.id);
    final activeGroup = latest ?? _group;
    final displayNames = Map<String, String>.from(activeGroup.memberDisplayNames ?? {});
    final friends = <FriendModel>[];
    FriendModel? creator;

    for (final phone in activeGroup.memberPhones) {
      final fetched = await FriendService().getFriendByPhone(widget.userId, phone);
      if (fetched != null) {
        friends.add(fetched);
        if (phone == activeGroup.createdBy) creator = fetched;
        continue;
      }

      final fallbackName = displayNames[phone]?.trim();
      final placeholder = FriendModel(
        phone: phone,
        name: (fallbackName != null && fallbackName.isNotEmpty)
            ? fallbackName
            : _maskPhoneForDisplay(phone),
        avatar: "👤",
      );
      friends.add(placeholder);
      if (phone == activeGroup.createdBy) creator = placeholder;
    }

    if (!mounted) return;
    setState(() {
      _group = activeGroup;
      _memberDisplayNames = displayNames;
      _members = friends;
      _creator = creator;
      _loadingMembers = false;
    });
  }

  // ---------- Actions ----------
  Future<void> _openAddExpense() async {
    final result = await showDialog(
      context: context,
      builder: (_) => AddGroupExpenseScreen(
        userPhone: widget.userId,
        userName: "You",
        userAvatar: null,
        group: _group,
        allFriends: _members,
      ),
    );
    if (result == true && mounted) setState(() {});
  }

  Future<void> _openLegacySettleDialog() async {
    final result = await showDialog(
      context: context,
      builder: (_) => SettleUpDialog(
        userPhone: widget.userId,
        friends: _members,
        groups: [_group],
        initialGroup: _group,
      ),
    );
    if (result == true && mounted) setState(() {});
  }

  Future<void> _openSettleUp() async {
    if (!FxFlags.settleUpV2) {
      await _openLegacySettleDialog();
      return;
    }

    try {
      final settled = await SettleUpFlowV2Launcher.openForGroup(
        context: context,
        currentUserPhone: widget.userId,
        group: _group,
        membersOverride: _members,
        memberDisplayNames: _memberDisplayNames,
      );

      if (settled == null) {
        await _openLegacySettleDialog();
      } else if (settled && mounted) {
        setState(() {});
      }
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open Settle Up: $err')),
      );
      await _openLegacySettleDialog();
    }
  }

  Future<void> _openRemind(List<ExpenseItem> groupExpenses) async {
    final participants = _group.memberPhones;
    final sent = await showDialog<bool>(
      context: context,
      builder: (_) => GroupReminderDialog(
        groupId: _group.id,
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
        group: _group,
        currentUserPhone: widget.userId,
        members: _members,
        onChanged: () async {
          await _fetchMembers();
        },
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

  Future<void> _openEditExpense(ExpenseItem e) async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => EditExpenseScreen(
          userPhone: widget.userId,
          expense: e,
        ),
      ),
    );
    if (updated == true && mounted) {
      setState(() {});
    }
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

  void _showExpenseDetailsUpgraded(BuildContext context, ExpenseItem e) {
    final splits = gbm.computeSplits(e);
    final cs = Theme.of(context).colorScheme;

    String title = e.label?.isNotEmpty == true
        ? e.label!
        : (e.category?.isNotEmpty == true ? e.category! : "Expense");

    String cleanNote = e.note;
    String? noteUrl;
    {
      final m = RegExp(r'(https?:\/\/[^\s]+)', caseSensitive: false).firstMatch(cleanNote);
      if (m != null) {
        noteUrl = m.group(0);
        cleanNote = cleanNote
            .replaceFirst(m.group(0)!, '')
            .replaceAll(RegExp(r'\s{2,}'), ' ')
            .trim();
      }
    }


    showModalBottomSheet(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Grabber
            Container(
              height: 4, width: 44, margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(3),
              ),
            ),

            // Header
            Row(
              children: [
                const Icon(Icons.receipt_long_rounded),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  "₹${e.amount.toStringAsFixed(2)}",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: cs.primary),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Paid by + date
            Row(
              children: [
                _avatar(e.payerId, radius: 12),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    "Paid by ${_nameFor(e.payerId)}",
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const Spacer(),
                Text(
                  "${_fmtShort(e.date)} ${e.date.year}  "
                      "${e.date.hour.toString().padLeft(2, '0')}:${e.date.minute.toString().padLeft(2, '0')}",
                  style: TextStyle(color: Colors.grey.shade700),
                ),
              ],
            ),

            if ((e.category ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Text("Category: ", style: TextStyle(fontWeight: FontWeight.w600)),
                  Flexible(child: Text(e.category!)),
                ],
              ),
            ],

            if (cleanNote.isNotEmpty) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text("Note: $cleanNote"),
              ),
            ],

            if ((noteUrl ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  "Attachment",
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: cs.primary,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              _attachmentView(
                url: noteUrl!,
                // leave name/size null: tile derives a pretty name and hides raw URL
                name: null,
                sizeBytes: null,
              ),
            ],

            if ((e.attachmentUrl ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Attachment',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: cs.primary,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              _attachmentView(
                url: e.attachmentUrl!,
                name: e.attachmentName,          // ok if null; tile will derive a name
                sizeBytes: e.attachmentSize,     // ok if null; size hidden
              ),
            ],



            const Divider(height: 22),

            // Split
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                "Split",
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: cs.primary),
              ),
            ),
            const SizedBox(height: 8),

            ...splits.entries.map((s) {
              final isYou = s.key == widget.userId;
              final owes = s.key != e.payerId; // payer "paid", others "owe"
              final who = isYou ? "You" : _nameFor(s.key);
              final subtitle = owes ? (isYou ? "You owe" : "Owes") : (isYou ? "You paid" : "Paid");
              final amtColor = owes ? cs.error : Colors.green.shade700;

              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: _avatar(s.key),
                title: Text(who, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text("$subtitle ₹${s.value.toStringAsFixed(2)}"),
                trailing: Text(
                  "₹${s.value.toStringAsFixed(2)}",
                  style: TextStyle(fontWeight: FontWeight.w700, color: amtColor),
                ),
              );
            }),

            const SizedBox(height: 8),

            // Actions (kept minimal)
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
                    Future.delayed(
                      Duration.zero,
                      () => _openEditExpense(e),
                    );
                  },
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  icon: Icon(Icons.delete_outline, color: cs.error),
                  label: Text('Delete', style: TextStyle(color: cs.error)),
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
    final displayName  = _nameFor(phone);
    final initial = displayName .isNotEmpty ? displayName .characters.first.toUpperCase() : '?';
    return CircleAvatar(radius: radius, child: Text(initial));
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
          title: Text(_group.name),
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
              Tab(text: 'Analytics'),
              Tab(text: 'Chat'),
            ],
          ),
        ),
        body: _loadingMembers
            ? const Center(child: CircularProgressIndicator())
            : StreamBuilder<List<ExpenseItem>>(
          stream: ExpenseService()
              .getGroupExpensesStream(widget.userId, _group.id),
          builder: (context, snapshot) {
            final expenses = snapshot.data ?? [];
            final safeBottom = context.adsBottomPadding();

            // Pairwise math (YOU vs each member), group-only — unified logic
            final pairNet = gbm.pairwiseNetForUser(
              expenses,
              widget.userId,
              onlyGroupId: _group.id,
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
                    padding: EdgeInsets.fromLTRB(16, 16, 16, safeBottom + 24),
                    children: [
                      _headerCard(
                        owe: youOwe,
                        owed: owedToYou,
                        txCount: expenses.length,
                      ),
                      const SizedBox(height: 12),
                      AdsBannerCard(
                        placement: 'group_detail_summary_banner',
                        inline: true,
                        inlineMaxHeight: 120,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                        minHeight: 92,
                      ),
                      const SizedBox(height: 14),
                      _recurringShortcutCard(),
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
                  padding: EdgeInsets.fromLTRB(16, 20, 16, safeBottom + 20),
                  child: GroupChartTab(
                    currentUserPhone: widget.userId,
                    members: _members,
                    expenses: expenses,
                  ),
                ),

                // ============ ANALYTICS ============
                RefreshIndicator(
                  onRefresh: _fetchMembers,
                  child: GroupAnalyticsTab(
                    expenses: expenses,
                    currentUserPhone: widget.userId,
                    group: _group,
                    members: _members,
                    memberDisplayNames: _memberDisplayNames,
                  ),
                ),

                // ============ CHAT ============
                SafeArea(
                  top: false,
                  bottom: false,
                  child: Padding(
                    padding: EdgeInsets.only(bottom: safeBottom),
                    child: GroupChatTab(
                      groupId: _group.id,
                      currentUserId: widget.userId,
                      participants: _group.memberPhones,
                      initialDraft: _pendingChatDraft,
                    ),
                  ),
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
    final createdByYou = _group.createdBy == widget.userId;
    final creatorLabel = _nameFor(_group.createdBy);


    final theme = Theme.of(context);
    final Color mint = theme.colorScheme.primary;
    final Color danger = theme.colorScheme.error;
    final Color neutral =
        theme.textTheme.bodySmall?.color?.withOpacity(0.7) ?? Colors.grey.shade600;
    final double net = owed - owe;
    const duration = Duration(milliseconds: 180);

    Color netColor;
    IconData netIcon;
    String netLabel;
    if (net > 0.01) {
      netColor = mint;
      netIcon = Icons.trending_up_rounded;
      netLabel = '+ ₹${net.toStringAsFixed(2)}';
    } else if (net < -0.01) {
      netColor = danger;
      netIcon = Icons.trending_down_rounded;
      netLabel = '- ₹${(-net).toStringAsFixed(2)}';
    } else {
      netColor = neutral;
      netIcon = Icons.check_circle_rounded;
      netLabel = 'Settled';
    }

    final bool allSettled = owe.abs() < 0.01 && owed.abs() < 0.01;
    final creatorDisplay = createdByYou ? 'You' : creatorLabel;
    final subtitle =
        "Created by $creatorDisplay • ${_members.length} members • $txCount transactions";

    final baseColor = theme.cardColor;
    final bool isDark = theme.brightness == Brightness.dark;

    return AnimatedContainer(
      duration: duration,
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? Colors.white10 : Colors.white.withOpacity(0.65),
        ),
        gradient: LinearGradient(
          colors: [
            baseColor.withOpacity(isDark ? 0.92 : 0.98),
            baseColor.withOpacity(isDark ? 0.88 : 0.94),
            mint.withOpacity(0.06),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.3 : 0.08),
            blurRadius: 18,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _groupAvatar(radius: 26),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _group.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge?.copyWith(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ) ??
                          const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                            color: neutral,
                            fontWeight: FontWeight.w600,
                          ) ??
                          TextStyle(color: neutral, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              AnimatedContainer(
                duration: duration,
                decoration: BoxDecoration(
                  color: netColor.withOpacity(netLabel == 'Settled' ? 0.14 : 0.16),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: netColor.withOpacity(0.4)),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(netIcon, size: 18, color: netColor),
                    const SizedBox(width: 6),
                    AnimatedSwitcher(
                      duration: duration,
                      child: Text(
                        'Net $netLabel',
                        key: ValueKey(netLabel),
                        style: TextStyle(
                          color: netColor,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AmountChip(
                icon: Icons.call_received_rounded,
                color: owed > 0.01 ? mint : neutral,
                label: owed > 0.01
                    ? 'Owed to you ₹${owed.toStringAsFixed(2)}'
                    : 'No one owes you',
              ),
              _AmountChip(
                icon: Icons.call_made_rounded,
                color: owe > 0.01 ? danger : neutral,
                label: owe > 0.01
                    ? 'You owe ₹${owe.toStringAsFixed(2)}'
                    : 'You owe ₹0.00',
              ),
              if (allSettled)
                const _SettledBadge(),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 12,
            runSpacing: 10,
            children: [
              _SummaryStat(
                icon: Icons.receipt_long_rounded,
                label: 'Transactions',
                value: '$txCount',
              ),
              _SummaryStat(
                icon: Icons.groups_rounded,
                label: 'Members',
                value: '${_members.length}',
              ),
            ],
          ),
          if (_shareFaces.isNotEmpty) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: ShareBadge(
                participants: _shareFaces,
                dense: true,
                onTap: _openSettings,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _recurringShortcutCard() {
    return _glassCard(
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => GroupRecurringScreen(
                  groupId: _group.id,
                  currentUserPhone: widget.userId,
                  groupName: _group.name,
                ),
              ),
            );
          },
          child: Row(
            children: [
              Container(
                height: 40,
                width: 40,
                decoration: BoxDecoration(
                  color: Colors.teal.withOpacity(.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.repeat_rounded, color: Colors.teal),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Text(
                  'Recurring',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              Text(
                'View all',
                style: TextStyle(
                  color: Colors.teal.shade700,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
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

    // how many members currently unsettled (non-zero balance)?
    final unsettledCount = rows.where((e) => e.value.abs() > 0.005).length;
    final headerSubtitle = unsettledCount == 0 ? 'All settled' : '$unsettledCount unsettled';

    return _glassCard(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      child: Theme( // hide ExpansionTile divider ripple seams
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: _balancesExpanded,
          onExpansionChanged: (v) => setState(() => _balancesExpanded = v),
          tilePadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          childrenPadding: const EdgeInsets.only(top: 8, bottom: 8),
          title: Row(
            children: [
              Text(
                "Balances by member",
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: Colors.teal.shade900,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.teal.withOpacity(.10),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  headerSubtitle,
                  style: TextStyle(
                    color: Colors.teal.shade900,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          // Body
          children: [
            if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text("All settled for now.", style: TextStyle(color: Colors.grey[700])),
              )
            else
              ...rows.map((e) {
                final phone = e.key;
                final amount = e.value; // + => they owe you, - => you owe them
                final f = _friend(phone);
                final displayName = _nameFor(phone);

                final avatarUrl = f.avatar;
                final leading = avatarUrl.startsWith('http')
                    ? CircleAvatar(backgroundImage: NetworkImage(avatarUrl))
                    : CircleAvatar(child: Text((displayName.isNotEmpty ? displayName[0] : '?').toUpperCase()));

                final sentence = amount > 0
                    ? "$displayName owes you ₹${amount.toStringAsFixed(2)}"
                    : "You owe $displayName ₹${(-amount).toStringAsFixed(2)}";

                final amtColor = amount > 0 ? Colors.teal.shade800 : Colors.redAccent;

                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
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
        ),
      ),
    );
  }


  // Helper: friendly date section label
  String _friendlyDateLabel(DateTime dt) {
    final now = DateTime.now();
    bool sameDay(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;

    final yesterday = now.subtract(const Duration(days: 1));
    if (sameDay(dt, now)) return 'Today';
    if (sameDay(dt, yesterday)) return 'Yesterday';

    final showYear = dt.year != now.year;
    return '${_fmtShort(dt)}${showYear ? ' ${dt.year}' : ''}';
  }

// Helper: tiny category icon
  IconData _categoryIcon(String? cat) {
    final c = (cat ?? '').toLowerCase();
    if (c.contains('food') || c.contains('lunch') || c.contains('dinner')) return Icons.restaurant_rounded;
    if (c.contains('travel') || c.contains('trip') || c.contains('flight')) return Icons.flight_takeoff_rounded;
    if (c.contains('stay') || c.contains('hotel')) return Icons.hotel_rounded;
    if (c.contains('cab') || c.contains('ride') || c.contains('uber')) return Icons.local_taxi_rounded;
    if (c.contains('grocer')) return Icons.local_grocery_store_rounded;
    if (c.contains('movie') || c.contains('fun') || c.contains('entertain')) return Icons.local_activity_rounded;
    return Icons.category_outlined;
  }

// Helper: your net impact for a single expense (+ you’re owed, – you owe)
  double _yourImpact(ExpenseItem e) {
    final splits = gbm.computeSplits(e);
    if (widget.userId == e.payerId) {
      double others = 0;
      for (final entry in splits.entries) {
        if (entry.key != e.payerId) others += entry.value;
      }
      return others; // others owe you
    }
    final yourShare = splits[widget.userId] ?? 0;
    return -yourShare; // you owe
  }

  Widget _recentActivity(List<ExpenseItem> expenses) {
    if (expenses.isEmpty) {
      return _glassCard(
        child: Row(
          children: [
            const Icon(Icons.receipt_long_outlined),
            const SizedBox(width: 8),
            Text("No group activity yet.", style: TextStyle(color: Colors.grey.shade700)),
          ],
        ),
      );
    }

    final sorted = [...expenses]..sort((a, b) => b.date.compareTo(a.date));

    String? lastSection;
    final children = <Widget>[
      Text("Recent activity",
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.teal.shade900)),
      const SizedBox(height: 8),
    ];

    int inserted = 0;
    for (final e in sorted) {
      final section = _friendlyDateLabel(e.date);
      if (section != lastSection) {
        lastSection = section;
        children.add(Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 6),
          child: Row(
            children: [
              Text(section,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Colors.grey.shade800,
                  )),
              const SizedBox(width: 8),
              Expanded(child: Divider(color: Colors.grey.shade300, height: 1)),
            ],
          ),
        ));
      }
      children.add(_activityCard(e));
      inserted++;
      if (inserted % 5 == 0) {
        final slot = inserted ~/ 5;
        children.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: AdsBannerCard(
            placement: 'group_detail_activity_$slot',
            inline: true,
            inlineMaxHeight: 120,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            minHeight: 88,
          ),
        ));
      }
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }

  Widget _activityCard(ExpenseItem e) {
    final payer = _friend(e.payerId);
    final splits = gbm.computeSplits(e);
    final title = e.label?.isNotEmpty == true
        ? e.label!
        : (e.category?.isNotEmpty == true ? e.category! : "Expense");
    final cat = e.category;
    final youDelta = _yourImpact(e); // + => you’re owed, - => you owe

    // People preview (first 3)
    final previewPhones = splits.keys.take(3).toList();
    final more = splits.length - previewPhones.length;

    final impactBg = (youDelta >= 0 ? Colors.green : Colors.red).withOpacity(.10);
    final impactFg = youDelta >= 0 ? Colors.green.shade700 : Colors.redAccent;
    final impactText =
    youDelta >= 0 ? "You’re owed ₹${youDelta.toStringAsFixed(0)}" : "You owe ₹${(-youDelta).toStringAsFixed(0)}";

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(.72),
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
              // Top row: payer + title + amount + overflow
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
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
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
                      style: TextStyle(fontWeight: FontWeight.w800, color: Colors.teal.shade900),
                    ),
                  ),
                  const SizedBox(width: 4),
                  PopupMenuButton<String>(
                    tooltip: 'More',
                    onSelected: (v) {
                      if (v == 'discuss') _goDiscussExpense(e);
                      if (v == 'delete') _confirmDelete(e);
                      if (v == 'details') _showExpenseDetailsUpgraded(context, e);
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: 'details',
                        child: ListTile(
                          leading: Icon(Icons.info_outline),
                          title: Text('Details'),
                          dense: true,
                        ),
                      ),
                      PopupMenuItem(
                        value: 'discuss',
                        child: ListTile(
                          leading: Icon(Icons.chat_bubble_outline),
                          title: Text('Discuss'),
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

              // Meta row: your impact + category + date + people avatars
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _chip(
                    bg: impactBg,
                    fg: impactFg,
                    icon: youDelta >= 0 ? Icons.call_received_rounded : Icons.call_made_rounded,
                    text: impactText,
                  ),
                  if (cat != null && cat.isNotEmpty)
                    _chip(
                      bg: Colors.indigo.withOpacity(.08),
                      fg: Colors.indigo.shade900,
                      icon: _categoryIcon(cat),
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
                            style: TextStyle(color: Colors.teal.shade900, fontWeight: FontWeight.w700),
                          ),
                        ),
                    ],
                  ),
                ],
              ),

              if (e.note.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(e.note, style: TextStyle(color: Colors.grey.shade800), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],

              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    "Paid by ${_nameFor(e.payerId)}",
                    style: TextStyle(color: Colors.grey.shade800, fontWeight: FontWeight.w600, fontSize: 12),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => _showExpenseDetailsUpgraded(context, e),
                    icon: const Icon(Icons.info_outline, size: 18),
                    label: const Text("Details"),
                    style: TextButton.styleFrom(foregroundColor: Colors.teal.shade800),
                  ),
                  const SizedBox(width: 6),
                  TextButton.icon(
                    onPressed: () => _goDiscussExpense(e),
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    label: const Text("Discuss"),
                    style: TextButton.styleFrom(foregroundColor: Colors.orange.shade800),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

// UPGRADED DETAILS SHEET (clear header + "your impact")
  void _showExpenseDetails(BuildContext context, ExpenseItem e) {
    final splits = gbm.computeSplits(e);
    final payer = _friend(e.payerId);
    final youDelta = _yourImpact(e);

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
              height: 4, width: 44, margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(3)),
            ),
            // Header
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: Colors.teal.withOpacity(.12),
                  foregroundColor: Colors.teal.shade900,
                  child: const Icon(Icons.receipt_long_rounded),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    e.label?.isNotEmpty == true
                        ? e.label!
                        : (e.category?.isNotEmpty == true ? e.category! : "Expense"),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(width: 8),
                Text("₹${e.amount.toStringAsFixed(2)}",
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 10),

            // Meta row
            Wrap(
              spacing: 8, runSpacing: 8,
              children: [
                _chip(
                  bg: (youDelta >= 0 ? Colors.green : Colors.red).withOpacity(.10),
                  fg: youDelta >= 0 ? Colors.green.shade700 : Colors.redAccent,
                  icon: youDelta >= 0 ? Icons.call_received_rounded : Icons.call_made_rounded,
                  text: youDelta >= 0
                      ? "You’re owed ₹${youDelta.toStringAsFixed(0)}"
                      : "You owe ₹${(-youDelta).toStringAsFixed(0)}",
                ),
                if ((e.category ?? '').isNotEmpty)
                  _chip(
                    bg: Colors.indigo.withOpacity(.08),
                    fg: Colors.indigo.shade900,
                    icon: _categoryIcon(e.category),
                    text: e.category!,
                  ),
                _chip(
                  bg: Colors.grey.withOpacity(.10),
                  fg: Colors.grey.shade900,
                  icon: Icons.event,
                  text:
                  "${_fmtShort(e.date)} ${e.date.year}  ${e.date.hour.toString().padLeft(2, '0')}:${e.date.minute.toString().padLeft(2, '0')}",
                ),
                _chip(
                  bg: Colors.grey.withOpacity(.10),
                  fg: Colors.grey.shade900,
                  icon: Icons.person,
                  text: "Paid by ${_nameFor(e.payerId)}",
                ),
              ],
            ),

            if (e.note.isNotEmpty) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: Text("Note: ${e.note}", style: TextStyle(color: Colors.grey.shade800)),
              ),
            ],

            const Divider(height: 22),

            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                "Split details",
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.teal.shade900),
              ),
            ),
            const SizedBox(height: 8),

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
                title: Text(_nameFor(s.key), style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text("$subtitle ₹${s.value.toStringAsFixed(2)}"),
                trailing: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: (owes ? Colors.red : Colors.green).withOpacity(.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    "₹${s.value.toStringAsFixed(2)}",
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: owes ? Colors.redAccent : Colors.green.shade700,
                    ),
                  ),
                ),
              );
            }),

            const SizedBox(height: 10),

            // Actions
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
                    Future.delayed(
                      Duration.zero,
                      () => _openEditExpense(e),
                    );
                  },
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                  label: const Text('Delete', style: TextStyle(color: Colors.redAccent)),
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

  // Legacy helper for other chips
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

  Widget _groupAvatar({double radius = 28}) {
    final url = _group.avatarUrl;
    if (url != null && url.isNotEmpty) {
      return CircleAvatar(radius: radius, backgroundImage: NetworkImage(url));
    }
    return CircleAvatar(
      radius: radius,
      child: Icon(Icons.groups_rounded, size: radius),
    );
  }
}

// Summary helpers for premium header UI
class _AmountChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _AmountChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: effectiveColor.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: effectiveColor.withOpacity(0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: effectiveColor),
          const SizedBox(width: 6),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 160),
            child: Text(
              label,
              key: ValueKey(label),
              style: TextStyle(
                color: effectiveColor,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _SummaryStat({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = theme.colorScheme.primary.withOpacity(
      theme.brightness == Brightness.dark ? 0.18 : 0.12,
    );
    final textColor =
        theme.textTheme.bodyMedium?.color ?? (theme.brightness == Brightness.dark
            ? Colors.white
            : Colors.black87);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                      color: textColor.withOpacity(0.7),
                      fontWeight: FontWeight.w600,
                    ) ??
                    TextStyle(
                      fontSize: 12,
                      color: textColor.withOpacity(0.7),
                      fontWeight: FontWeight.w600,
                    ),
              ),
              Text(
                value,
                style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: textColor,
                    ) ??
                    TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: textColor,
                    ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettledBadge extends StatelessWidget {
  const _SettledBadge();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle_rounded, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            'All settled',
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
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
  String _fmtBytes(int b) {
    if (b <= 0) return '';
    const units = ['B','KB','MB','GB','TB'];
    double v = b.toDouble();
    int i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    final digits = v < 10 ? 1 : 0;
    return '${v.toStringAsFixed(digits)} ${units[i]}';
  }


  DocumentReference<Map<String, dynamic>> get _threadRef =>
      FirebaseFirestore.instance.collection('group_chats').doc(widget.groupId);

  CollectionReference<Map<String, dynamic>> get _messagesRef =>
      _threadRef.collection('messages');

  // Compact icon used in the composer like PartnerChatTab
  Widget _miniIcon({
    required IconData icon,
    String? tooltip,
    VoidCallback? onPressed,
  }) {
    return IconButton(
      icon: Icon(icon, size: 18),
      tooltip: tooltip,
      onPressed: onPressed,
      padding: EdgeInsets.zero,
      visualDensity: const VisualDensity(horizontal: -4, vertical: -4),
      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
      splashRadius: 18,
      color: Colors.teal,
    );
  }


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

    String lastPreview;
    switch (type) {
      case 'image':
        lastPreview = '[photo]';
        break;
      case 'file':
        lastPreview = (extra['fileName'] ?? '[file]').toString();
        break;
      case 'sticker':
        lastPreview = msg;
        break;
      default:
        lastPreview = msg;
    }


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

      // uses conditional helper (io on mobile/desktop; throws on web)
      final task = await ioPutFile(ref, path, metadata);
      final url = await task.ref.getDownloadURL();
      final fileSize = await ioFileLength(path);

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
      height: 220,
      child: GridView.builder(
        padding: const EdgeInsets.all(10),
        itemCount: _emojiBank.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 8,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
        ),
        itemBuilder: (_, i) {
          final e = _emojiBank[i];
          return InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () {
              _msgController.text += e;
              _msgController.selection = TextSelection.fromPosition(
                TextPosition(offset: _msgController.text.length),
              );
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
      height: 220,
      child: GridView.builder(
        padding: const EdgeInsets.all(10),
        itemCount: _stickerBank.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 6,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
        ),
        itemBuilder: (_, i) {
          final s = _stickerBank[i];
          return InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              _sendMessage(text: s, type: 'sticker');
              setState(() => _pickingSticker = false);
            },
            child: Container(
              decoration: BoxDecoration(
                color: Colors.teal.withOpacity(0.08),
                borderRadius: BorderRadius.circular(16),
              ),
              alignment: Alignment.center,
              child: Text(s, style: const TextStyle(fontSize: 34)),
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

  Future<void> _onOpenAttachment(Map<String, dynamic> data) async {
    final raw  = (data['fileUrl']  ?? '').toString();
    final mime = (data['mime']     ?? '').toString();
    final name = (data['fileName'] ?? '').toString();

    if (raw.isEmpty) return;

    final resolved = await _safeDownloadUri(raw);
    if (resolved == null) {
      _toast('Invalid link');
      return;
    }

    if (mime.startsWith('image/')) {
      // In-app preview for images
      showDialog(
        context: context,
        builder: (_) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          child: InteractiveViewer(
            child: Image.network(resolved.toString(), fit: BoxFit.contain),
          ),
        ),
      );
      return;
    }

    // Non-image → open externally (browser / viewer)
    final ok = await launchUrl(resolved, mode: LaunchMode.externalApplication);
    if (!ok) _toast('Could not open $name');
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

    // local compact icon helper (keeps this snippet self-contained)
    Widget miniIcon({
      required IconData icon,
      String? tooltip,
      VoidCallback? onPressed,
    }) {
      return IconButton(
        icon: Icon(icon, size: 18, color: Colors.teal),
        tooltip: tooltip,
        onPressed: onPressed,
        padding: EdgeInsets.zero,
        visualDensity: const VisualDensity(horizontal: -4, vertical: -4),
        constraints: const BoxConstraints.tightFor(width: 36, height: 36),
        splashRadius: 18,
      );
    }

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

              const chatAdEvery = 20;
              final blockSize = chatAdEvery + 1;
              final adCount = chatAdEvery > 0 ? docs.length ~/ chatAdEvery : 0;
              final totalItems = docs.length + adCount;

              return ListView.builder(
                controller: _scrollController,
                reverse: true,
                itemCount: totalItems,
                itemBuilder: (context, i) {
                  final isAdSlot = chatAdEvery > 0 && blockSize > 0 && (i + 1) % blockSize == 0;
                  if (isAdSlot) {
                    final slot = (i + 1) ~/ blockSize;
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: AdsBannerCard(
                        placement: 'group_chat_midroll_$slot',
                        inline: true,
                        inlineMaxHeight: 100,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                        minHeight: 72,
                      ),
                    );
                  }

                  final adsBefore = chatAdEvery > 0 ? (i + 1) ~/ blockSize : 0;
                  final messageIndex = i - adsBefore;
                  final d = docs[messageIndex];
                  final data = d.data();
                  final isMe = data['from'] == widget.currentUserId;
                  final msg = (data['message'] ?? '') as String;
                  final type = (data['type'] ?? 'text') as String;
                  final ts = (data['timestamp'] as Timestamp?);
                  final timeStr = ts != null
                      ? TimeOfDay.fromDateTime(ts.toDate()).format(context)
                      : '';
                  final edited = data['edited'] == true;

                  final bubbleColor = isMe
                      ? Colors.teal.withOpacity(0.15)
                      : Colors.grey.withOpacity(0.15);

                  Widget content;
                  if (type == 'sticker') {
                    content = Text(msg, style: const TextStyle(fontSize: 34));
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
                    final url  = (data['fileUrl'] ?? '').toString();
                    final name = (data['fileName'] ?? '').toString();
                    final size = (data['size'] ?? 0) as int;

                    // Derive a display name ONLY from fileName or the URL's last path segment.
                    String displayName = name;
                    if (displayName.isEmpty && url.isNotEmpty) {
                      final u = Uri.tryParse(url);
                      displayName = (u != null && u.pathSegments.isNotEmpty)
                          ? u.pathSegments.last
                          : 'Attachment';
                    }

                    final prettySize = _fmtBytes(size); // helper below

                    content = InkWell(
                      onTap: () => _onOpenAttachment(data),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.grey.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.insert_drive_file, size: 18),
                            const SizedBox(width: 8),
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 200),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    displayName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                  if (prettySize.isNotEmpty)
                                    Text(prettySize,
                                        style: TextStyle(fontSize: 11, color: Colors.grey[700])),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.open_in_new, size: 16),
                          ],
                        ),
                      ),
                    );
                  }

                  else {
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
                                Text(
                                  timeStr,
                                  style: TextStyle(fontSize: 11, color: Colors.grey[700]),
                                ),
                                if (edited) ...[
                                  const SizedBox(width: 6),
                                  Text('edited',
                                      style: TextStyle(fontSize: 10, color: Colors.grey[600])),
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

        // Composer (compact, PartnerChatTab-style)
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                miniIcon(
                  icon: Icons.attach_file_rounded,
                  tooltip: 'Attach',
                  onPressed: _showAttachmentSheet,
                ),
                miniIcon(
                  icon: Icons.emoji_emotions_outlined,
                  tooltip: 'Emoji',
                  onPressed: () {
                    setState(() {
                      _pickingSticker = false;
                      _pickingEmoji = !_pickingEmoji;
                    });
                  },
                ),
                miniIcon(
                  icon: Icons.auto_awesome,
                  tooltip: 'Stickers',
                  onPressed: () {
                    setState(() {
                      _pickingEmoji = false;
                      _pickingSticker = !_pickingSticker;
                    });
                  },
                ),

                // Expanding input
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 40),
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
                ),

                miniIcon(
                  icon: Icons.send_rounded,
                  tooltip: 'Send',
                  onPressed: () => _sendMessage(text: _msgController.text),
                ),

                PopupMenuButton<String>(
                  padding: EdgeInsets.zero,
                  iconSize: 18,
                  constraints: const BoxConstraints(minWidth: 140),
                  icon: const Icon(Icons.more_vert, color: Colors.teal, size: 18),
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
