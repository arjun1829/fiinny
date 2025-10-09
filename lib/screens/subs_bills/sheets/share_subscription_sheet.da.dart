import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/details/models/shared_item.dart';

/// A bottom sheet to share/unshare a subscription (SharedItem) with a friend or a group.
/// - Minimal assumptions about your friend/group models (uses dynamic getters safely)
/// - Optional callbacks so you can wire any backend/service
/// - If you pass a `sharingService`, it will try common method names dynamically
///
/// Typical usage:
/// showModalBottomSheet(
///   context: context,
///   isScrollControlled: true,
///   backgroundColor: Colors.white,
///   shape: const RoundedRectangleBorder(
///     borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
///   ),
///   builder: (_) => ShareSubscriptionSheet(
///     item: item,
///     userPhone: currentUserPhone,
///     friendCandidates: friendsList, // any list; items just need 'id' & 'label'/name
///     groupCandidates: groupsList,   // any list; items just need 'id' & 'name'
///     sharingService: SharingService(), // optional
///     onDone: () { /* refresh UI */ },
///   ),
/// );
class ShareSubscriptionSheet extends StatefulWidget {
  final SharedItem item;
  final String userPhone;

  /// Can be any list; items may be your Friend model, Map, or DTO.
  /// We’ll look for { id, label/name/phone, avatar/photo } via dynamic.
  final List<dynamic> friendCandidates;

  /// Can be any list; items may be your Group model, Map, or DTO.
  /// We’ll look for { id, name, avatar/photo, members } via dynamic.
  final List<dynamic> groupCandidates;

  /// Optional injected sharing service. If present, we’ll try common method
  /// names via dynamic (e.g. shareWithFriend / shareItemToFriends, etc).
  final Object? sharingService;

  /// Optional overrides to run instead of (or in addition to) the service calls.
  final Future<bool> Function({
  required SharedItem item,
  required String friendId,
  bool splitEqually,
  bool canEdit,
  bool canMarkPaid,
  })? onShareToFriend;

  final Future<bool> Function({
  required SharedItem item,
  required String groupId,
  bool splitEqually,
  bool canEdit,
  bool canMarkPaid,
  })? onShareToGroup;

  final Future<bool> Function({
  required SharedItem item,
  required String friendId,
  })? onUnshareFriend;

  final Future<bool> Function({
  required SharedItem item,
  required String groupId,
  })? onUnshareGroup;

  final VoidCallback? onDone;

  const ShareSubscriptionSheet({
    super.key,
    required this.item,
    required this.userPhone,
    this.friendCandidates = const [],
    this.groupCandidates = const [],
    this.sharingService,
    this.onShareToFriend,
    this.onShareToGroup,
    this.onUnshareFriend,
    this.onUnshareGroup,
    this.onDone,
  });

  @override
  State<ShareSubscriptionSheet> createState() => _ShareSubscriptionSheetState();
}

enum _Scope { personal, friend, group }

class _ShareSubscriptionSheetState extends State<ShareSubscriptionSheet> {
  _Scope _scope = _Scope.friend;
  String? _selectedFriendId;
  String? _selectedGroupId;

  bool _splitEqually = true;
  bool _canEdit = false;
  bool _canMarkPaid = true;

  String _friendSearch = '';
  String _groupSearch = '';

  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // Prefill scope: if already shared with >1, default to friend scope (user can switch)
    final participants = widget.item.participantUserIds ?? const <String>[];
    if (participants.length <= 1) {
      _scope = _Scope.friend;
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = 'Share ${widget.item.title ?? 'Subscription'}';

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 8,
          // make room for keyboard with a little buffer
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _handle(),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const Spacer(),
                IconButton(
                  tooltip: 'Close',
                  onPressed: _busy ? null : () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _itemSummary(widget.item),

            const SizedBox(height: 10),
            _scopeSelector(),

            const SizedBox(height: 10),
            if (_scope == _Scope.friend) _friendPicker(),
            if (_scope == _Scope.group) _groupPicker(),

            const SizedBox(height: 8),
            _permissionsCard(),

            const SizedBox(height: 14),
            _footerBar(),
          ],
        ),
      ),
    );
  }

  // =================== Header bits ===================

  Widget _handle() {
    return Center(
      child: Container(
        width: 44,
        height: 5,
        decoration: BoxDecoration(
          color: Colors.black12,
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }

  Widget _itemSummary(SharedItem item) {
    final amt = (item.rule.amount ?? item.amount ?? 0).toDouble();
    final next = item.nextDueAt;
    return TonalCard(
      padding: const EdgeInsets.all(14),
      borderRadius: const BorderRadius.all(Radius.circular(16)),
      surface: Colors.white,
      child: Row(
        children: [
          _avatar(char: item.title ?? item.provider ?? 'S'),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title ?? 'Subscription',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 2),
                Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _chip('₹ ${_fmtAmount(amt)}', AppColors.mint),
                    if (next != null)
                      Text(
                        'Next ${_fmtDate(next)}',
                        style: const TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    if ((item.rule.frequency ?? '').isNotEmpty)
                      _chip(item.rule.frequency!, AppColors.mint),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // =================== Scope selector ===================

  Widget _scopeSelector() {
    return Row(
      children: [
        Expanded(
          child: SegmentedButton<_Scope>(
            segments: const [
              ButtonSegment(value: _Scope.personal, icon: Icon(Icons.person_rounded), label: Text('Personal')),
              ButtonSegment(value: _Scope.friend, icon: Icon(Icons.person_add_rounded), label: Text('Friend')),
              ButtonSegment(value: _Scope.group, icon: Icon(Icons.groups_rounded), label: Text('Group')),
            ],
            selected: <_Scope>{_scope},
            onSelectionChanged: _busy
                ? null
                : (s) {
              HapticFeedback.selectionClick();
              setState(() => _scope = s.first);
            },
            style: ButtonStyle(
              visualDensity: VisualDensity.compact,
              foregroundColor: WidgetStateProperty.resolveWith((states) {
                return states.contains(WidgetState.selected) ? AppColors.mint : Colors.black87;
              }),
            ),
          ),
        ),
      ],
    );
  }

  // =================== Friend picker ===================

  Widget _friendPicker() {
    final filtered = widget.friendCandidates.where((f) {
      if (_friendSearch.trim().isEmpty) return true;
      final text = (_friendLabel(f) ?? '').toLowerCase();
      return text.contains(_friendSearch.trim().toLowerCase());
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 6),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search friend',
            prefixIcon: Icon(Icons.search_rounded),
            isDense: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
          ),
          onChanged: (s) => setState(() => _friendSearch = s),
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 220),
          child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            child: ListView.separated(
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final f = filtered[i];
                final id = _friendId(f);
                final label = _friendLabel(f) ?? 'Friend';
                final avatar = _friendAvatar(f);
                final selected = id != null && id == _selectedFriendId;

                return ListTile(
                  dense: true,
                  leading: _avatar(url: avatar, char: label),
                  title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: _busy || id == null ? null : () => setState(() => _selectedFriendId = id),
                  trailing: selected
                      ? const Icon(Icons.check_circle_rounded, color: AppColors.mint)
                      : const SizedBox.shrink(),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  // =================== Group picker ===================

  Widget _groupPicker() {
    final filtered = widget.groupCandidates.where((g) {
      if (_groupSearch.trim().isEmpty) return true;
      final text = (_groupName(g) ?? '').toLowerCase();
      return text.contains(_groupSearch.trim().toLowerCase());
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 6),
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search group',
            prefixIcon: Icon(Icons.search_rounded),
            isDense: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
          ),
          onChanged: (s) => setState(() => _groupSearch = s),
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 220),
          child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            child: ListView.separated(
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final g = filtered[i];
                final id = _groupId(g);
                final label = _groupName(g) ?? 'Group';
                final avatar = _groupAvatar(g);
                final selected = id != null && id == _selectedGroupId;

                return ListTile(
                  dense: true,
                  leading: _avatar(url: avatar, char: label),
                  title: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: _groupMembersText(g) != null
                      ? Text(_groupMembersText(g)!, maxLines: 1, overflow: TextOverflow.ellipsis)
                      : null,
                  onTap: _busy || id == null ? null : () => setState(() => _selectedGroupId = id),
                  trailing: selected
                      ? const Icon(Icons.check_circle_rounded, color: AppColors.mint)
                      : const SizedBox.shrink(),
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  // =================== Permissions & split ===================

  Widget _permissionsCard() {
    final participants = widget.item.participantUserIds ?? const <String>[];
    final alreadyShared = participants.length > 1;

    return TonalCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      borderRadius: const BorderRadius.all(Radius.circular(16)),
      surface: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Sharing options', style: TextStyle(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          SwitchListTile.adaptive(
            value: _splitEqually,
            onChanged: _busy ? null : (v) => setState(() => _splitEqually = v),
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text('Split cost equally'),
            subtitle: const Text('Simple 50/50 now; custom splits can come later'),
          ),
          SwitchListTile.adaptive(
            value: _canMarkPaid,
            onChanged: _busy ? null : (v) => setState(() => _canMarkPaid = v),
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text('Allow marking as paid'),
            subtitle: const Text('Friend/group can record payment events'),
          ),
          SwitchListTile.adaptive(
            value: _canEdit,
            onChanged: _busy ? null : (v) => setState(() => _canEdit = v),
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text('Allow editing details'),
            subtitle: const Text('Title/amount/date may be updated by them'),
          ),
          const SizedBox(height: 6),
          if (alreadyShared)
            Row(
              children: [
                const Icon(Icons.info_outline_rounded, size: 16, color: Colors.black45),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Currently shared with ${participants.length - 1} other user(s).',
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  // =================== Footer ===================

  Widget _footerBar() {
    final canShareFriend = _scope == _Scope.friend && (_selectedFriendId ?? '').isNotEmpty;
    final canShareGroup = _scope == _Scope.group && (_selectedGroupId ?? '').isNotEmpty;

    final shareEnabled = !_busy && (canShareFriend || canShareGroup);
    final showUnshare =
        (_scope == _Scope.friend && (_selectedFriendId ?? '').isNotEmpty) ||
            (_scope == _Scope.group && (_selectedGroupId ?? '').isNotEmpty);

    return Row(
      children: [
        if (showUnshare)
          OutlinedButton.icon(
            onPressed: _busy ? null : _unshare,
            icon: const Icon(Icons.link_off_rounded),
            label: const Text('Unshare'),
          ),
        if (showUnshare) const SizedBox(width: 8),
        Expanded(
          child: FilledButton.icon(
            onPressed: shareEnabled ? _share : null,
            icon: const Icon(Icons.share_rounded, color: Colors.white),
            label: Text(_scope == _Scope.friend ? 'Share with friend' : 'Share to group'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.mint,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              textStyle: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          onPressed: _busy
              ? null
              : () {
            Navigator.of(context).maybePop();
            widget.onDone?.call();
          },
          child: const Text('Done'),
        ),
      ],
    );
  }

  // =================== Actions ===================

  Future<void> _share() async {
    if (_busy) return;
    setState(() => _busy = true);
    final item = widget.item;

    try {
      bool ok = false;

      if (_scope == _Scope.friend && (_selectedFriendId ?? '').isNotEmpty) {
        final fid = _selectedFriendId!;
        // 1) Optional override callback
        if (widget.onShareToFriend != null) {
          ok = await widget.onShareToFriend!(
            item: item,
            friendId: fid,
            splitEqually: _splitEqually,
            canEdit: _canEdit,
            canMarkPaid: _canMarkPaid,
          );
        } else {
          // 2) Try dynamic calls on sharingService
          ok = await _shareViaService(friendId: fid, groupId: null);
        }
      } else if (_scope == _Scope.group && (_selectedGroupId ?? '').isNotEmpty) {
        final gid = _selectedGroupId!;
        if (widget.onShareToGroup != null) {
          ok = await widget.onShareToGroup!(
            item: item,
            groupId: gid,
            splitEqually: _splitEqually,
            canEdit: _canEdit,
            canMarkPaid: _canMarkPaid,
          );
        } else {
          ok = await _shareViaService(friendId: null, groupId: gid);
        }
      }

      if (!mounted) return;
      if (ok) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Shared successfully')));
        widget.onDone?.call();
      } else {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Share failed')));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unshare() async {
    if (_busy) return;
    setState(() => _busy = true);
    final item = widget.item;

    try {
      bool ok = false;

      if (_scope == _Scope.friend && (_selectedFriendId ?? '').isNotEmpty) {
        final fid = _selectedFriendId!;
        if (widget.onUnshareFriend != null) {
          ok = await widget.onUnshareFriend!(item: item, friendId: fid);
        } else {
          ok = await _unshareViaService(friendId: fid, groupId: null);
        }
      } else if (_scope == _Scope.group && (_selectedGroupId ?? '').isNotEmpty) {
        final gid = _selectedGroupId!;
        if (widget.onUnshareGroup != null) {
          ok = await widget.onUnshareGroup!(item: item, groupId: gid);
        } else {
          ok = await _unshareViaService(friendId: null, groupId: gid);
        }
      }

      if (!mounted) return;
      if (ok) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Unshared')));
        widget.onDone?.call();
      } else {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not unshare')));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // =================== Service glue (dynamic for resilience) ===================

  Future<bool> _shareViaService({String? friendId, String? groupId}) async {
    final svc = widget.sharingService;
    if (svc == null) return false;

    final payload = {
      'item': widget.item,
      'userPhone': widget.userPhone,
      'friendId': friendId,
      'groupId': groupId,
      'options': {
        'splitEqually': _splitEqually,
        'permissions': {
          'canEdit': _canEdit,
          'canMarkPaid': _canMarkPaid,
        },
      },
    };

    // Try likely method names; return true on first success
    final dyn = svc as dynamic;
    try {
      if (friendId != null) {
        // Common friend share names
        try {
          final r = await dyn.shareWithFriend?.call(
            userPhone: widget.userPhone,
            friendId: friendId,
            item: widget.item,
            splitEqually: _splitEqually,
            canEdit: _canEdit,
            canMarkPaid: _canMarkPaid,
          );
          if (r == true) return true;
        } catch (_) {}
        try {
          final r = await dyn.shareItemToFriends?.call(payload);
          if (r == true) return true;
        } catch (_) {}
      } else if (groupId != null) {
        try {
          final r = await dyn.shareToGroup?.call(
            userPhone: widget.userPhone,
            groupId: groupId,
            item: widget.item,
            splitEqually: _splitEqually,
            canEdit: _canEdit,
            canMarkPaid: _canMarkPaid,
          );
          if (r == true) return true;
        } catch (_) {}
        try {
          final r = await dyn.shareItemToGroup?.call(payload);
          if (r == true) return true;
        } catch (_) {}
      }
    } catch (_) {}

    return false;
  }

  Future<bool> _unshareViaService({String? friendId, String? groupId}) async {
    final svc = widget.sharingService;
    if (svc == null) return false;

    final dyn = svc as dynamic;
    try {
      if (friendId != null) {
        try {
          final r = await dyn.revokeForUser?.call(
            userPhone: widget.userPhone,
            friendOrUserId: friendId,
            itemId: widget.item.id,
          );
          if (r == true) return true;
        } catch (_) {}
        try {
          final r = await dyn.unshareFromFriend?.call(
            userPhone: widget.userPhone,
            friendId: friendId,
            itemId: widget.item.id,
          );
          if (r == true) return true;
        } catch (_) {}
      } else if (groupId != null) {
        try {
          final r = await dyn.revokeForGroup?.call(
            groupId: groupId,
            itemId: widget.item.id,
          );
          if (r == true) return true;
        } catch (_) {}
        try {
          final r = await dyn.unshareFromGroup?.call(
            groupId: groupId,
            itemId: widget.item.id,
          );
          if (r == true) return true;
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  // =================== Small atoms ===================

  Widget _chip(String text, Color c) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withOpacity(.18)),
      ),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: c)),
    );
  }

  Widget _avatar({String? url, String? char}) {
    final initial = (char == null || char.trim().isEmpty)
        ? 'S'
        : char.trim().characters.first.toUpperCase();
    if (url != null && url.isNotEmpty) {
      return CircleAvatar(
        radius: 18,
        backgroundImage: NetworkImage(url),
        backgroundColor: AppColors.mintSoft,
      );
    }
    return CircleAvatar(
      radius: 18,
      backgroundColor: AppColors.mint.withOpacity(.12),
      child: Text(initial, style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.mint)),
    );
  }

  static String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${m[d.month - 1]} ${d.day.toString().padLeft(2, '0')}';
  }

  static String _fmtAmount(double v) {
    final n = v.abs();
    if (n >= 10000000) return '${(n / 10000000).toStringAsFixed(1)}Cr';
    if (n >= 100000) return '${(n / 100000).toStringAsFixed(1)}L';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return v % 1 == 0 ? v.toStringAsFixed(0) : v.toStringAsFixed(2);
  }

  // -------- Dynamic-safe getters for Friend --------
  String? _friendId(dynamic f) {
    try { final v = (f as dynamic).id; if (v is String) return v; } catch (_) {}
    try { final v = (f as dynamic).userId; if (v is String) return v; } catch (_) {}
    try { final v = (f as dynamic).phone; if (v is String) return v; } catch (_) {}
    if (f is Map) {
      final id = f['id'] ?? f['userId'] ?? f['phone'];
      if (id is String) return id;
    }
    return null;
  }

  String? _friendLabel(dynamic f) {
    try { final v = (f as dynamic).label; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    try { final v = (f as dynamic).name; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    try { final v = (f as dynamic).phone; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    if (f is Map) {
      final v = f['label'] ?? f['name'] ?? f['phone'];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  String? _friendAvatar(dynamic f) {
    try { final v = (f as dynamic).avatarUrl; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    try { final v = (f as dynamic).photoUrl; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    if (f is Map) {
      final v = f['avatarUrl'] ?? f['photoUrl'];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  // -------- Dynamic-safe getters for Group --------
  String? _groupId(dynamic g) {
    try { final v = (g as dynamic).id; if (v is String) return v; } catch (_) {}
    if (g is Map) { final v = g['id']; if (v is String) return v; }
    return null;
  }

  String? _groupName(dynamic g) {
    try { final v = (g as dynamic).name; if (v is String) return v; } catch (_) {}
    try { final v = (g as dynamic).title; if (v is String) return v; } catch (_) {}
    if (g is Map) {
      final v = g['name'] ?? g['title'];
      if (v is String) return v;
    }
    return null;
  }

  String? _groupAvatar(dynamic g) {
    try { final v = (g as dynamic).avatarUrl; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    try { final v = (g as dynamic).photoUrl; if (v is String && v.isNotEmpty) return v; } catch (_) {}
    if (g is Map) {
      final v = g['avatarUrl'] ?? g['photoUrl'];
      if (v is String && v.isNotEmpty) return v;
    }
    return null;
  }

  String? _groupMembersText(dynamic g) {
    // try a few shapes: memberCount, members:[], participantUserIds:[]
    try { final v = (g as dynamic).memberCount; if (v is int) return '$v member${v == 1 ? '' : 's'}'; } catch (_) {}
    try { final v = (g as dynamic).members; if (v is List) return '${v.length} members'; } catch (_) {}
    try { final v = (g as dynamic).participantUserIds; if (v is List) return '${v.length} members'; } catch (_) {}
    if (g is Map) {
      final v1 = g['memberCount'];
      if (v1 is int) return '$v1 member${v1 == 1 ? '' : 's'}';
      final v2 = g['members'];
      if (v2 is List) return '${v2.length} members';
      final v3 = g['participantUserIds'];
      if (v3 is List) return '${v3.length} members';
    }
    return null;
  }
}
