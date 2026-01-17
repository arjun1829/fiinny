// lib/ui/comp/group_switcher.dart
import 'package:flutter/material.dart';
import 'package:lifemap/ui/tonal/tonal_card.dart';
import 'package:lifemap/ui/tokens.dart';
import 'package:lifemap/details/models/recurring_scope.dart';
import 'package:lifemap/details/models/group.dart';

/// Lightweight friend option used by the switcher.
class FriendOption {
  final String id;          // friendId (usually their phone)
  final String label;       // display name
  final String? avatarUrl;  // optional
  const FriendOption({
    required this.id,
    required this.label,
    this.avatarUrl,
  });
}

/// Scope tabs
enum _ScopeTab { personal, friends, groups }

/// A compact, modern switcher to choose the active scope for Subscriptions:
/// - Personal (your own items)
/// - Friend (mirrored pair with someone)
/// - Group (shared in a group)
///
/// Pass `current` (RecurringScope) and listen to `onChanged` for selection.
/// Provide `friends` and `groups` you want to present as choices.
class GroupSwitcher extends StatefulWidget {
  final String userPhone;

  final RecurringScope current;
  final ValueChanged<RecurringScope> onChanged;

  final List<FriendOption> friends;
  final List<Group> groups;

  /// Optional actions (appear as trailing chips/icons)
  final VoidCallback? onAddFriend;
  final VoidCallback? onManageFriends;
  final VoidCallback? onCreateGroup;
  final VoidCallback? onManageGroups;

  /// Headline + hint under the header
  final String title;
  final String? subtitle;

  /// Whether to show inside a card. If false, renders as a plain block.
  final bool asCard;

  const GroupSwitcher({
    super.key,
    required this.userPhone,
    required this.current,
    required this.onChanged,
    required this.friends,
    required this.groups,
    this.onAddFriend,
    this.onManageFriends,
    this.onCreateGroup,
    this.onManageGroups,
    this.title = 'Scope',
    this.subtitle,
    this.asCard = true,
  });

  @override
  State<GroupSwitcher> createState() => _GroupSwitcherState();
}

class _GroupSwitcherState extends State<GroupSwitcher> {
  late _ScopeTab _tab;

  @override
  void initState() {
    super.initState();
    _tab = _initialTabFromScope(widget.current);
  }

  @override
  void didUpdateWidget(covariant GroupSwitcher oldWidget) {
    super.didUpdateWidget(oldWidget);
    // If external scope changed, reflect tab
    if (oldWidget.current != widget.current) {
      _tab = _initialTabFromScope(widget.current);
    }
  }

  _ScopeTab _initialTabFromScope(RecurringScope s) {
    if (s.isGroup) return _ScopeTab.groups;
    if (s.friendId != null && s.friendId!.isNotEmpty) return _ScopeTab.friends;
    return _ScopeTab.personal;
  }

  @override
  Widget build(BuildContext context) {
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(context),
        const SizedBox(height: 10),
        _segmented(),
        const SizedBox(height: 10),
        _choices(),
      ],
    );

    if (!widget.asCard) return content;

    return TonalCard(
      padding: const EdgeInsets.all(AppSpacing.l),
      borderRadius: const BorderRadius.all(Radius.circular(18)),
      surface: Colors.white,
      elevation: 0.5,
      borderWidth: 1,
      child: content,
    );
  }

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  Widget _header(BuildContext context) {
    final on = Colors.black.withValues(alpha: .92);
    final sub = Colors.black54;
    final currentLabel = _currentLabel();

    return Row(
      children: [
        const Icon(Icons.groups_rounded, color: AppColors.mint),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(widget.title,
                  style: TextStyle(
                    color: on,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  )),
              const SizedBox(height: 2),
              Text(
                widget.subtitle ??
                    'Currently: $currentLabel',
                style: TextStyle(color: sub, fontSize: 12.5),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        // Optional action overflow for quick management
        PopupMenuButton<String>(
          tooltip: 'More',
          onSelected: (v) {
            switch (v) {
              case 'add_friend':
                widget.onAddFriend?.call();
                break;
              case 'manage_friends':
                widget.onManageFriends?.call();
                break;
              case 'create_group':
                widget.onCreateGroup?.call();
                break;
              case 'manage_groups':
                widget.onManageGroups?.call();
                break;
            }
          },
          itemBuilder: (_) => [
            if (widget.onAddFriend != null)
              const PopupMenuItem(value: 'add_friend', child: _MenuRow(Icons.person_add_alt_1_rounded, 'Add friend')),
            if (widget.onManageFriends != null)
              const PopupMenuItem(value: 'manage_friends', child: _MenuRow(Icons.manage_accounts_rounded, 'Manage friends')),
            if (widget.onCreateGroup != null)
              const PopupMenuItem(value: 'create_group', child: _MenuRow(Icons.group_add_rounded, 'Create group')),
            if (widget.onManageGroups != null)
              const PopupMenuItem(value: 'manage_groups', child: _MenuRow(Icons.settings_rounded, 'Manage groups')),
          ],
          icon: Icon(Icons.more_vert_rounded, color: Colors.black.withValues(alpha: .70)),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Segmented control
  // ---------------------------------------------------------------------------

  Widget _segmented() {
    final tabs = [
      _segChip('Personal', Icons.person_rounded, _ScopeTab.personal),
      _segChip('Friends', Icons.people_alt_rounded, _ScopeTab.friends),
      _segChip('Groups', Icons.groups_rounded, _ScopeTab.groups),
    ];
    return Wrap(spacing: 8, children: tabs);
  }

  Widget _segChip(String label, IconData icon, _ScopeTab t) {
    final selected = _tab == t;
    final bg = selected ? AppColors.mint.withValues(alpha: .14) : const Color(0x0F000000);
    final side = selected ? AppColors.mint.withValues(alpha: .35) : const Color(0x1F000000);
    final fg = selected ? AppColors.mint : Colors.black87;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => setState(() => _tab = t),
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: ShapeDecoration(
            color: bg,
            shape: StadiumBorder(side: BorderSide(color: side)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: fg),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: fg)),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Choices list (chips with avatars)
  // ---------------------------------------------------------------------------

  Widget _choices() {
    switch (_tab) {
      case _ScopeTab.personal:
        return _personalTile();
      case _ScopeTab.friends:
        return _friendChips();
      case _ScopeTab.groups:
        return _groupChips();
    }
  }

  Widget _personalTile() {
    final isSelected = !widget.current.isGroup &&
        (widget.current.friendId == null || widget.current.friendId!.isEmpty);
    return _ScopeTile(
      label: 'My items',
      subtitle: widget.userPhone,
      leading: _avatar(char: 'Me'),
      selected: isSelected,
      onTap: () {
        final s = RecurringScope.friend(widget.userPhone, '');
        widget.onChanged(s);
      },
    );
  }

  Widget _friendChips() {
    if (widget.friends.isEmpty) {
      return _emptyState(
        icon: Icons.people_alt_rounded,
        text: 'No friends yet. Add one to share & track together.',
        ctaLabel: 'Add friend',
        onTap: widget.onAddFriend,
      );
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final f in widget.friends)
          _scopeChip(
            label: f.label,
            subtitle: f.id,
            leading: _avatar(url: f.avatarUrl, char: f.label),
            selected: _isCurrentFriend(f.id),
            onTap: () => widget.onChanged(RecurringScope.friend(widget.userPhone, f.id)),
          ),
        if (widget.onAddFriend != null)
          _addChip('Add', Icons.person_add_alt_1_rounded, widget.onAddFriend!),
        if (widget.onManageFriends != null)
          _addChip('Manage', Icons.manage_accounts_rounded, widget.onManageFriends!),
      ],
    );
  }

  Widget _groupChips() {
    if (widget.groups.isEmpty) {
      return _emptyState(
        icon: Icons.groups_rounded,
        text: 'No groups yet. Create one to collaborate.',
        ctaLabel: 'Create group',
        onTap: widget.onCreateGroup,
      );
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final g in widget.groups)
          Builder(
            builder: (_) {
              final String gid = g.id; // may be nullable in your model
              final bool selected =
                  widget.current.isGroup && widget.current.groupId == gid;
              final String label = (g.name ?? 'Group').toString();
              final String? avatar = _groupAvatarUrl(g);      // safe helper (below)
              final String? membersText = _groupMembersText(g); // safe helper (below)

              return _scopeChip(
                label: label,
                subtitle: membersText,
                leading: _avatar(url: avatar, char: label),
                selected: selected,
                onTap: () {
                  if (gid.isEmpty) return;
                  widget.onChanged(RecurringScope.group(gid));
                },
              );
            },
          ),
        if (widget.onCreateGroup != null)
          _addChip('New group', Icons.group_add_rounded, widget.onCreateGroup!),
        if (widget.onManageGroups != null)
          _addChip('Manage', Icons.settings_rounded, widget.onManageGroups!),
      ],
    );
  }


  // ---------------------------------------------------------------------------
  // Small atoms
  // ---------------------------------------------------------------------------
  // Try common property names without breaking compile if your Group lacks them.
  String? _groupAvatarUrl(Group g) {
    try {
      final v = (g as dynamic).avatarUrl;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    try {
      final v = (g as dynamic).photoUrl;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    try {
      final v = (g as dynamic).imageUrl;
      if (v is String && v.isNotEmpty) return v;
    } catch (_) {}
    return null;
  }

  int? _groupMemberCount(Group g) {
    try {
      final v = (g as dynamic).memberCount;
      if (v is int) return v;
    } catch (_) {}
    try {
      final v = (g as dynamic).members;
      if (v is List) return v.length;
    } catch (_) {}
    try {
      final v = (g as dynamic).participantUserIds;
      if (v is List) return v.length;
    } catch (_) {}
    return null;
  }

  String? _groupMembersText(Group g) {
    final n = _groupMemberCount(g);
    if (n == null) return null;
    return '$n member${n == 1 ? '' : 's'}';
  }


  Widget _scopeChip({
    required String label,
    String? subtitle,
    required Widget leading,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final bg = selected ? AppColors.mint.withValues(alpha: .14) : Colors.white;
    final side = selected ? AppColors.mint.withValues(alpha: .35) : Colors.black.withValues(alpha: .14);
    final fg = selected ? AppColors.mint : Colors.black87;
    final sub = Colors.black54;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: ShapeDecoration(
            color: bg,
            shape: StadiumBorder(side: BorderSide(color: side)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              leading,
              const SizedBox(width: 8),
              Text(label,
                  style: TextStyle(fontWeight: FontWeight.w800, color: fg)),
              if (subtitle != null && subtitle.isNotEmpty) ...[
                const SizedBox(width: 8),
                Text('• $subtitle',
                    style: TextStyle(color: sub, fontWeight: FontWeight.w600)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _addChip(String label, IconData icon, VoidCallback onTap) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: ShapeDecoration(
            color: const Color(0x0F000000),
            shape: StadiumBorder(side: BorderSide(color: const Color(0x1F000000))),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: Colors.black87),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyState({
    required IconData icon,
    required String text,
    String? ctaLabel,
    VoidCallback? onTap,
  }) {
    final sub = Colors.black54;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black.withValues(alpha: .12)),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.mint),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: sub))),
          if (onTap != null && (ctaLabel ?? '').isNotEmpty)
            TextButton(
              onPressed: onTap,
              style: TextButton.styleFrom(foregroundColor: AppColors.mint),
              child: Text(ctaLabel!),
            ),
        ],
      ),
    );
  }

  Widget _avatar({String? url, String? char}) {
    if (url != null && url.isNotEmpty) {
      return CircleAvatar(
        radius: 12,
        backgroundImage: NetworkImage(url),
        backgroundColor: AppColors.mintSoft,
      );
    }
    final text = _initials(char ?? '');
    return CircleAvatar(
      radius: 12,
      backgroundColor: AppColors.mint.withValues(alpha: .12),
      foregroundColor: AppColors.mint,
      child: Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }

  bool _isCurrentFriend(String friendId) {
    return !widget.current.isGroup &&
        (widget.current.friendId != null && widget.current.friendId == friendId);
  }

  String _currentLabel() {
    if (widget.current.isGroup) {
      final id = widget.current.groupId;
      if (id != null) {
        for (final g in widget.groups) {
          if (g.id == id) return 'Group • ${(g.name ?? 'Group')}';
        }
      }
      return 'Group';
    }
    if (widget.current.friendId != null && widget.current.friendId!.isNotEmpty) {
      final fid = widget.current.friendId!;
      for (final f in widget.friends) {
        if (f.id == fid) return 'Friend • ${f.label}';
      }
      return 'Friend';
    }
    return 'Personal';
  }


  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return '•';
    if (parts.length == 1) return parts.first.characters.take(2).toString().toUpperCase();
    return (parts[0].characters.first + parts[1].characters.first).toUpperCase();
  }
}

class _ScopeTile extends StatelessWidget {
  final String label;
  final String? subtitle;
  final Widget leading;
  final bool selected;
  final VoidCallback onTap;

  const _ScopeTile({
    required this.label,
    required this.leading,
    required this.selected,
    required this.onTap,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final side = selected ? AppColors.mint.withValues(alpha: .35) : Colors.black.withValues(alpha: .12);
    final bg = selected ? AppColors.mint.withValues(alpha: .12) : Colors.white;
    final fg = selected ? AppColors.mint : Colors.black87;
    final sub = Colors.black54;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: side),
          ),
          child: Row(
            children: [
              leading,
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: TextStyle(fontWeight: FontWeight.w900, color: fg)),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(subtitle!, style: TextStyle(color: sub, fontSize: 12)),
                    ],
                  ],
                ),
              ),
              Icon(Icons.check_circle,
                  size: 18, color: selected ? AppColors.mint : Colors.transparent),
            ],
          ),
        ),
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MenuRow(this.icon, this.label);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.black87),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}
