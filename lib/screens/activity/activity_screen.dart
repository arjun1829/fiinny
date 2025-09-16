import 'package:flutter/material.dart';

import '../../models/friend_model.dart';
import '../../models/group_model.dart';
import '../../models/expense_item.dart';

import '../../services/friend_service.dart';
import '../../services/group_service.dart';
import '../../services/expense_service.dart';

import '../../widgets/add_friend_dialog.dart';
import '../../widgets/add_friend_expense_dialog.dart';
import '../../widgets/add_group_expense_dialog.dart';
import '../../widgets/add_group_dialog.dart';

const Color _kPrimary = Color(0xFF09857a);
const Color _kBg = Color(0xFFF8FAF9);
const Color _kText = Color(0xFF0F1E1C);

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

  bool _match(String q, String hay) => hay.toLowerCase().contains(q.toLowerCase());

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

  Future<void> _openGroupExpense(GroupModel g, List<FriendModel> allFriends) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AddGroupExpenseScreen(
        userPhone: widget.userPhone,
        userName: 'You',
        userAvatar: null,
        group: g,
        allFriends: allFriends,
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
      backgroundColor: _kPrimary.withOpacity(.10),
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
      backgroundColor: _kPrimary.withOpacity(.10),
      foregroundImage: prov,
      child: prov == null ? const Text('👥') : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(
        backgroundColor: _kBg,
        elevation: 0,
        surfaceTintColor: _kBg,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded, color: _kText),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Add an expense',
          style: TextStyle(color: _kText, fontWeight: FontWeight.w800),
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

                    // --- recency map (friendPhone / groupId -> latest date)
                    final Map<String, DateTime> lastSeen = {};
                    for (final e in tx) {
                      for (final f in e.friendIds) {
                        final p = lastSeen[f];
                        if (p == null || e.date.isAfter(p)) lastSeen[f] = e.date;
                      }
                      final gid = e.groupId;
                      if (gid != null) {
                        final p = lastSeen[gid];
                        if (p == null || e.date.isAfter(p)) lastSeen[gid] = e.date;
                      }
                    }

                    // --- sort
                    final recentFriends = [...friends]..sort((a, b) {
                      final ad = lastSeen[a.phone] ?? DateTime.fromMillisecondsSinceEpoch(0);
                      final bd = lastSeen[b.phone] ?? DateTime.fromMillisecondsSinceEpoch(0);
                      return bd.compareTo(ad);
                    });
                    final recentGroups = [...groups]..sort((a, b) {
                      final ad = lastSeen[a.id] ?? DateTime.fromMillisecondsSinceEpoch(0);
                      final bd = lastSeen[b.id] ?? DateTime.fromMillisecondsSinceEpoch(0);
                      return bd.compareTo(ad);
                    });

                    // --- filter
                    final fq = _q.isEmpty
                        ? recentFriends
                        : recentFriends.where((f) => _match(_q, f.name) || _match(_q, f.phone)).toList();
                    final gq = _q.isEmpty
                        ? recentGroups
                        : recentGroups.where((g) => _match(_q, g.name)).toList();

                    return Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 640),
                        child: ListView(
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                          children: [
                            // Search — subtle focus animation
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              curve: Curves.easeOut,
                              decoration: BoxDecoration(
                                boxShadow: _searchFocus.hasFocus
                                    ? [const BoxShadow(color: Color(0x14000000), blurRadius: 16, offset: Offset(0, 8))]
                                    : const [],
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: TextField(
                                controller: _searchCtrl,
                                focusNode: _searchFocus,
                                decoration: InputDecoration(
                                  prefixIcon: const Icon(Icons.search_rounded),
                                  hintText: 'Enter name or phone…',
                                  filled: true,
                                  fillColor: Colors.white,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(14),
                                    borderSide: BorderSide(color: Colors.grey.shade300),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(14),
                                    borderSide: BorderSide(color: Colors.grey.shade300),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(14),
                                    borderSide: const BorderSide(color: _kPrimary),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),

                            // Quick actions (bouncy)
                            Row(
                              children: [
                                Expanded(
                                  child: _Bouncy(
                                    onTap: _addFromContacts,
                                    child: _QuickChip(
                                      icon: Icons.contact_phone_rounded,
                                      label: 'Add from contacts',
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _Bouncy(
                                    onTap: () async {
                                      final ok = await showDialog<bool>(
                                        context: context,
                                        builder: (_) => AddFriendDialog(userPhone: widget.userPhone),
                                      );
                                      if (ok == true && mounted) setState(() {});
                                    },
                                    child: const _QuickChip(
                                      icon: Icons.person_add_alt_1_rounded,
                                      label: 'Add friend',
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _Bouncy(
                                    onTap: () async {
                                      final allFriends =
                                      await FriendService().streamFriends(widget.userPhone).first;
                                      final ok = await showDialog<bool>(
                                        context: context,
                                        builder: (_) => AddGroupDialog(
                                          userPhone: widget.userPhone,
                                          allFriends: allFriends,
                                        ),
                                      );
                                      if (ok == true && mounted) setState(() {});
                                    },
                                    child: const _QuickChip(
                                      icon: Icons.group_add_rounded,
                                      label: 'Add group',
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),

                            if (fq.isNotEmpty) ...[
                              const _SectionHeader('Recent'),
                              ...List.generate(
                                fq.take(6).length,
                                    (i) => _SlideFade(
                                  delayMs: 40 * i,
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
                              const _SectionHeader('Groups'),
                              ...List.generate(
                                gq.length,
                                    (i) => _SlideFade(
                                  delayMs: 40 * i,
                                  child: _Bouncy(
                                    onTap: () => _openGroupExpense(gq[i], friends),
                                    child: _PickerTile(
                                      leading: _avatarGroup(gq[i]),
                                      title: gq[i].name,
                                      subtitle: '${gq[i].memberPhones.length} members',
                                    ),
                                  ),
                                ),
                              ),
                            ],

                            if (fq.isEmpty && gq.isEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 60),
                                child: Column(
                                  children: const [
                                    Icon(Icons.search_off_rounded, size: 40, color: Colors.grey),
                                    SizedBox(height: 8),
                                    Text('No matches yet'),
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
      height: 44,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [BoxShadow(color: Color(0x16000000), blurRadius: 12, offset: Offset(0, 6))],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: _kPrimary, size: 20),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w600),
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
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: 13,
          color: Colors.black54,
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
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: ListTile(
        leading: leading,
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: const Icon(Icons.chevron_right_rounded),
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
          child: Transform.translate(offset: Offset(0, dy), child: widget.child),
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
  late final AnimationController _ac =
  AnimationController(vsync: this, duration: const Duration(milliseconds: 110), lowerBound: 0.0, upperBound: 0.08);

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
