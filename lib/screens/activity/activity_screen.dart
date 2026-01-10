import 'package:flutter/material.dart';

import '../../models/friend_model.dart';
import '../../models/group_model.dart';
import '../../models/expense_item.dart';

import '../../services/friend_service.dart';
import '../../services/group_service.dart';
import '../../services/expense_service.dart';

import '../../widgets/add_friend_dialog.dart';
import '../../widgets/add_friend_expense_dialog.dart';
import '../../widgets/add_group_dialog.dart';
import '../../widgets/add_group_expense_dialog.dart';

class ActivityScreen extends StatefulWidget {
  final String userPhone;
  const ActivityScreen({Key? key, required this.userPhone}) : super(key: key);

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocus = FocusNode();
  String _q = '';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() {
      final q = _searchCtrl.text.trim();
      if (q != _q) setState(() => _q = q);
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  bool _match(String q, String hay) =>
      hay.toLowerCase().contains(q.toLowerCase());

  Future<void> _openFriendExpense(FriendModel f) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AddFriendExpenseScreen(
        userPhone: widget.userPhone,
        friend: f,
        userName: 'You', // safe default; replace with real name if you have it
        userAvatar: null,
      ),
    );
    if (ok == true && mounted) setState(() {});
  }

  Future<void> _openGroupExpense(
      GroupModel g, List<FriendModel> friends) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AddGroupExpenseScreen(
        userPhone: widget.userPhone,
        group: g,
        userName: 'You',
        userAvatar: null,
        allFriends: friends,
      ),
    );
    if (ok == true && mounted) setState(() {});
  }

  Future<void> _addFromContacts() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AddFriendDialog(userPhone: widget.userPhone),
    );
    if (ok == true) {
      final all = await FriendService().streamFriends(widget.userPhone).first;
      if (mounted && all.isNotEmpty) {
        final latest = all.last; // naive pick; adapt if you store createdAt
        await _openFriendExpense(latest);
      }
      if (mounted) setState(() {});
    }
  }

  ImageProvider? _friendImage(FriendModel f) {
    final a = (f.avatar).trim();
    if (a.startsWith('http')) return NetworkImage(a);
    if (a.startsWith('assets/')) return AssetImage(a);
    return null;
  }

  ImageProvider? _groupImage(GroupModel g) {
    final url = (g.avatarUrl ?? '').trim();
    if (url.startsWith('http')) return NetworkImage(url);
    if (url.startsWith('assets/')) return AssetImage(url);
    return null;
  }

  Widget _avatarFriend(FriendModel f) {
    final prov = _friendImage(f);
    return CircleAvatar(
      radius: 18,
      backgroundColor: Theme.of(context).primaryColor.withOpacity(.10),
      foregroundImage: prov,
      child: prov == null
          ? Text(
              (f.avatar.isNotEmpty ? f.avatar : f.name.characters.first)
                  .toUpperCase(),
              style: const TextStyle(fontSize: 12),
            )
          : null,
    );
  }

  Widget _avatarGroup(GroupModel g) {
    final prov = _groupImage(g);
    return CircleAvatar(
      radius: 18,
      backgroundColor: Theme.of(context).primaryColor.withOpacity(.10),
      foregroundImage: prov,
      child: prov == null ? const Text('👥') : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA), // Clean background
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        shape: Border(bottom: BorderSide(color: Colors.grey.shade200)),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded, color: Colors.black87),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Add an expense',
          style: TextStyle(
              color: Colors.black87, fontWeight: FontWeight.w800, fontSize: 17),
        ),
      ),
      body: SafeArea(
        child: StreamBuilder<List<ExpenseItem>>(
          stream: ExpenseService().getExpensesStream(widget.userPhone),
          builder: (context, txSnap) {
            final tx = txSnap.data ?? [];
            return StreamBuilder<List<FriendModel>>(
              stream: FriendService().streamFriends(widget.userPhone),
              builder: (context, frSnap) {
                final friends = frSnap.data ?? [];
                return StreamBuilder<List<GroupModel>>(
                  stream: GroupService().streamGroups(widget.userPhone),
                  builder: (context, grSnap) {
                    final groups = grSnap.data ?? [];

                    // --- [LOGIC REMAINS UNCHANGED: Sorting/Filtering code] ---
                    final Map<String, DateTime> lastSeen = {};
                    for (final e in tx) {
                      for (final f in e.friendIds) {
                        final p = lastSeen[f];
                        if (p == null || e.date.isAfter(p))
                          lastSeen[f] = e.date;
                      }
                      final gid = e.groupId;
                      if (gid != null) {
                        final p = lastSeen[gid];
                        if (p == null || e.date.isAfter(p))
                          lastSeen[gid] = e.date;
                      }
                    }

                    final recentFriends = [...friends]..sort((a, b) {
                        final ad = lastSeen[a.phone] ??
                            DateTime.fromMillisecondsSinceEpoch(0);
                        final bd = lastSeen[b.phone] ??
                            DateTime.fromMillisecondsSinceEpoch(0);
                        return bd.compareTo(ad);
                      });
                    final recentGroups = [...groups]..sort((a, b) {
                        final ad = lastSeen[a.id] ??
                            DateTime.fromMillisecondsSinceEpoch(0);
                        final bd = lastSeen[b.id] ??
                            DateTime.fromMillisecondsSinceEpoch(0);
                        return bd.compareTo(ad);
                      });

                    final fq = _q.isEmpty
                        ? recentFriends
                        : recentFriends
                            .where((f) =>
                                _match(_q, f.name) || _match(_q, f.phone))
                            .toList();
                    final gq = _q.isEmpty
                        ? recentGroups
                        : recentGroups
                            .where((g) => _match(_q, g.name))
                            .toList();
                    // ---------------------------------------------------------

                    return Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 640),
                        child: ListView(
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                          children: [
                            // Search Bar (Modern Flat Style)
                            Container(
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: Colors.grey.shade300),
                              ),
                              child: TextField(
                                controller: _searchCtrl,
                                focusNode: _searchFocus,
                                decoration: const InputDecoration(
                                  prefixIcon: Icon(Icons.search_rounded,
                                      color: Colors.grey),
                                  hintText: 'Enter name or phone…',
                                  hintStyle: TextStyle(color: Colors.grey),
                                  border: InputBorder.none,
                                  contentPadding: EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 14),
                                ),
                              ),
                            ),
                            const SizedBox(height: 20),

                            // Quick actions
                            Row(
                              children: [
                                Expanded(
                                  child: _Bouncy(
                                    onTap: _addFromContacts,
                                    child: const _QuickChip(
                                      icon: Icons.person_add_alt_1_rounded,
                                      label: 'Add contact',
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _Bouncy(
                                    onTap: () async {
                                      final allFriends = await FriendService()
                                          .streamFriends(widget.userPhone)
                                          .first;
                                      final ok = await showDialog<bool>(
                                        context: context,
                                        builder: (_) => AddGroupDialog(
                                          userPhone: widget.userPhone,
                                          allFriends: allFriends,
                                        ),
                                      );
                                      if (ok == true && mounted)
                                        setState(() {});
                                    },
                                    child: const _QuickChip(
                                      icon: Icons.group_add_rounded,
                                      label: 'Create group',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),

                            if (fq.isNotEmpty) ...[
                              const _SectionHeader('Recent Friends'),
                              ...List.generate(
                                fq.take(6).length,
                                (i) => _SlideFade(
                                  delayMs: 30 * i,
                                  child: _Bouncy(
                                    onTap: () => _openFriendExpense(fq[i]),
                                    child: _PickerTile(
                                      leading: _avatarFriend(fq[i]),
                                      title: fq[i].name,
                                      subtitle: fq[i].phone,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 16),
                            ],

                            if (gq.isNotEmpty) ...[
                              const _SectionHeader('Your Groups'),
                              ...List.generate(
                                gq.length,
                                (i) => _SlideFade(
                                  delayMs: 30 * i,
                                  child: _Bouncy(
                                    onTap: () =>
                                        _openGroupExpense(gq[i], friends),
                                    child: _PickerTile(
                                      leading: _avatarGroup(gq[i]),
                                      title: gq[i].name,
                                      subtitle:
                                          '${gq[i].memberPhones.length} members',
                                    ),
                                  ),
                                ),
                              ),
                            ],

                            if (fq.isEmpty && gq.isEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 60),
                                child: Column(
                                  children: [
                                    Icon(Icons.search_off_rounded,
                                        size: 48, color: Colors.grey.shade300),
                                    const SizedBox(height: 12),
                                    Text('No matches found',
                                        style: TextStyle(
                                            color: Colors.grey.shade500,
                                            fontWeight: FontWeight.w600)),
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
          },
        ),
      ),
    );
  }
}

/* ============================== UI helpers =============================== */

class _QuickChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _QuickChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.03),
              blurRadius: 4,
              offset: const Offset(0, 2))
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.teal.shade700, size: 20),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, color: Colors.black87),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, left: 4),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: 12,
          color: Colors.grey,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

class _PickerTile extends StatelessWidget {
  final Widget leading;
  final String title;
  final String? subtitle;

  const _PickerTile({
    Key? key,
    required this.leading,
    required this.title,
    this.subtitle,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.02),
              blurRadius: 8,
              offset: const Offset(0, 2))
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: leading,
        title: Text(title,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        subtitle: subtitle == null
            ? null
            : Text(subtitle!,
                style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 13,
                    fontWeight: FontWeight.w500)),
        trailing:
            Icon(Icons.chevron_right_rounded, color: Colors.grey.shade300),
      ),
    );
  }
}

/* ----------------------- Animation primitives ----------------------- */

class _SlideFade extends StatefulWidget {
  final Widget child;
  final int delayMs; // stagger delay per item
  const _SlideFade({required this.child, this.delayMs = 0});

  @override
  State<_SlideFade> createState() => _SlideFadeState();
}

class _SlideFadeState extends State<_SlideFade> {
  double _target = 0; // 0 => hidden, 1 => shown

  @override
  void initState() {
    super.initState();
    // start animation after the delay
    Future.delayed(Duration(milliseconds: widget.delayMs), () {
      if (!mounted) return;
      setState(() => _target = 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutCubic,
      tween: Tween(begin: 0, end: _target),
      builder: (context, t, _) {
        final dy = 16 * (1 - t); // slide up as it fades in
        return Opacity(
          opacity: t,
          child:
              Transform.translate(offset: Offset(0, dy), child: widget.child),
        );
      },
    );
  }
}

class _Bouncy extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;
  const _Bouncy({required this.child, required this.onTap});

  @override
  State<_Bouncy> createState() => _BouncyState();
}

class _BouncyState extends State<_Bouncy> with SingleTickerProviderStateMixin {
  late final AnimationController _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 110),
      lowerBound: 0.0,
      upperBound: 0.08);

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  void _pressIn() => _ac.forward();
  void _pressOut() => _ac.reverse();

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _pressIn(),
      onTapCancel: _pressOut,
      onTapUp: (_) {
        _pressOut();
        widget.onTap();
      },
      child: AnimatedBuilder(
        animation: _ac,
        builder: (context, child) {
          final scale = 1 - _ac.value;
          return Transform.scale(scale: scale, child: child);
        },
        child: widget.child,
      ),
    );
  }
}
