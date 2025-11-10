import 'dart:math' as math;

import 'package:characters/characters.dart';
import 'package:flutter/material.dart';

import '../../models/friend_model.dart';
import '../../models/group_model.dart';
import '../../services/contact_name_service.dart';
import '../../ui/theme/small_typography_overlay.dart';
import '../ads/sleek_ad_card.dart';

enum QuickCreateSegment { friends, groups, newEntry }

enum QuickCreateAction {
  addFriendFromContacts,
  addFriendManual,
  createGroup,
}

class QuickCreatePickResult {
  final FriendModel? friend;
  final GroupModel? group;
  final QuickCreateAction? action;

  const QuickCreatePickResult._({this.friend, this.group, this.action});

  factory QuickCreatePickResult.friend(FriendModel friend) =>
      QuickCreatePickResult._(friend: friend);

  factory QuickCreatePickResult.group(GroupModel group) =>
      QuickCreatePickResult._(group: group);

  factory QuickCreatePickResult.action(QuickCreateAction action) =>
      QuickCreatePickResult._(action: action);
}

Future<QuickCreatePickResult?> showQuickCreatePickSheet({
  required BuildContext context,
  required List<FriendModel> friends,
  required List<GroupModel> groups,
  required ContactNameService contactNames,
}) {
  return showModalBottomSheet<QuickCreatePickResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    useRootNavigator: true,
    builder: (context) {
      return _QuickCreatePickSheet(
        friends: friends,
        groups: groups,
        contactNames: contactNames,
      );
    },
  );
}

class _QuickCreatePickSheet extends StatefulWidget {
  const _QuickCreatePickSheet({
    required this.friends,
    required this.groups,
    required this.contactNames,
  });

  final List<FriendModel> friends;
  final List<GroupModel> groups;
  final ContactNameService contactNames;

  @override
  State<_QuickCreatePickSheet> createState() => _QuickCreatePickSheetState();
}

class _QuickCreatePickSheetState extends State<_QuickCreatePickSheet> {
  final TextEditingController _searchCtrl = TextEditingController();
  QuickCreateSegment _segment = QuickCreateSegment.friends;
  late List<FriendModel> _friends;
  late List<GroupModel> _groups;

  @override
  void initState() {
    super.initState();
    _friends = List.of(widget.friends);
    _groups = List.of(widget.groups);
    widget.contactNames.addListener(_onContactsUpdated);
  }

  @override
  void dispose() {
    widget.contactNames.removeListener(_onContactsUpdated);
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onContactsUpdated() {
    if (mounted) setState(() {});
  }

  String _friendDisplay(FriendModel friend) {
    return widget.contactNames.bestDisplayName(
      phone: friend.phone,
      remoteName: friend.name,
    );
  }

  Iterable<FriendModel> get _filteredFriends {
    final q = _searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return _friends;
    return _friends.where((friend) {
      final display = _friendDisplay(friend).toLowerCase();
      return display.contains(q) ||
          friend.phone.toLowerCase().contains(q) ||
          friend.name.toLowerCase().contains(q);
    });
  }

  Iterable<GroupModel> get _filteredGroups {
    final q = _searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return _groups;
    return _groups.where((group) {
      return group.name.toLowerCase().contains(q) ||
          group.memberPhones.any((m) => m.toLowerCase().contains(q));
    });
  }

  void _closeWithResult(QuickCreatePickResult result) {
    if (!mounted) return;
    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= 560;
        final sheet = SmallTypographyOverlay(
          child: SafeArea(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              decoration: BoxDecoration(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                gradient: LinearGradient(
                  colors: [
                    Colors.white.withOpacity(0.96),
                    Colors.white.withOpacity(0.90),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(color: Colors.white.withOpacity(0.55)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x23000000),
                    blurRadius: 26,
                    offset: Offset(0, -6),
                  ),
                ],
              ),
              child: Padding(
                padding: EdgeInsets.only(
                  left: 18,
                  right: 18,
                  top: 16,
                  bottom: 12 + MediaQuery.of(context).viewInsets.bottom,
                ),
                child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: const [
                      Text(
                        'Add or pick',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0A6F66),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (isWide)
                    SizedBox(
                      height: math.max(360, MediaQuery.of(context).size.height * 0.55),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _WideRail(
                            segment: _segment,
                            onChanged: (seg) {
                              setState(() {
                                _segment = seg;
                                _searchCtrl.clear();
                              });
                            },
                          ),
                          const SizedBox(width: 18),
                          Expanded(child: _buildContent(isWide: true)),
                        ],
                      ),
                    )
                  else
                    _buildContent(isWide: false),
                  const SizedBox(height: 12),
                  const SleekAdCard(
                    margin: EdgeInsets.only(top: 4),
                    radius: 16,
                  ),
                ],
              ),
            ),
          ),
        );

        return FractionallySizedBox(
          heightFactor: isWide ? 0.9 : 0.94,
          child: sheet,
        );
      },
    );
  }

  Widget _buildContent({required bool isWide}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (!isWide)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _SegmentedHeader(
              value: _segment,
              onChanged: (seg) {
                setState(() {
                  _segment = seg;
                  _searchCtrl.clear();
                });
              },
            ),
          ),
        _buildSearchAndQuickActions(),
        const SizedBox(height: 12),
        Flexible(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeOutCubic,
            child: _segment == QuickCreateSegment.newEntry
                ? _buildNewEntryCards()
                : _buildList(),
          ),
        ),
      ],
    );
  }

  Widget _buildSearchAndQuickActions() {
    Widget? quickRow;
    if (_segment == QuickCreateSegment.friends) {
      quickRow = Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          _QuickActionChip(
            icon: Icons.contact_phone_rounded,
            label: 'Add from Contacts',
            onTap: () =>
                _closeWithResult(QuickCreatePickResult.action(QuickCreateAction.addFriendFromContacts)),
          ),
          _QuickActionChip(
            icon: Icons.person_add_alt_1_rounded,
            label: 'Add friend (manual)',
            onTap: () =>
                _closeWithResult(QuickCreatePickResult.action(QuickCreateAction.addFriendManual)),
          ),
        ],
      );
    } else if (_segment == QuickCreateSegment.groups) {
      quickRow = Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          _QuickActionChip(
            icon: Icons.group_add_rounded,
            label: 'Create group',
            onTap: () =>
                _closeWithResult(QuickCreatePickResult.action(QuickCreateAction.createGroup)),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _searchCtrl,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: _segment == QuickCreateSegment.groups
                ? 'Search groups…'
                : 'Search friends…',
            prefixIcon: const Icon(Icons.search_rounded),
            filled: true,
            fillColor: const Color(0xFFF4F8F7),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: Color(0xFFE4ECE9)),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        if (quickRow != null) ...[
          const SizedBox(height: 10),
          quickRow,
        ],
      ],
    );
  }

  Widget _buildList() {
    final isFriends = _segment == QuickCreateSegment.friends;
    final items = isFriends ? _filteredFriends.toList() : _filteredGroups.toList();
    if (items.isEmpty) {
      return Center(
        child: Text(
          isFriends ? 'No friends found' : 'No groups found',
          style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.grey),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        if (isFriends) {
          final friend = items[index] as FriendModel;
          final initials = (friend.avatar.trim().isNotEmpty
                  ? friend.avatar.trim()
                  : friend.name.characters.isNotEmpty
                      ? friend.name.characters.first
                      : friend.phone.characters.first)
              .toUpperCase();
          return _QuickListTile(
            leading: CircleAvatar(
              radius: 20,
              backgroundColor: const Color(0xFF09857a).withOpacity(0.08),
              child: Text(initials, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            title: _friendDisplay(friend),
            subtitle: friend.phone,
            onTap: () => _closeWithResult(QuickCreatePickResult.friend(friend)),
          );
        } else {
          final group = items[index] as GroupModel;
          final members = group.memberPhones.length;
          final initials = group.name.characters.isNotEmpty
              ? group.name.characters.first
              : '👥';
          return _QuickListTile(
            leading: CircleAvatar(
              radius: 20,
              backgroundColor: const Color(0xFF09857a).withOpacity(0.08),
              child: Text(initials, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            title: group.name,
            subtitle: '$members member${members == 1 ? '' : 's'}',
            onTap: () => _closeWithResult(QuickCreatePickResult.group(group)),
          );
        }
      },
    );
  }

  Widget _buildNewEntryCards() {
    return ListView(
      shrinkWrap: true,
      children: [
        _NewEntryCard(
          icon: Icons.contact_phone_rounded,
          title: 'Add from Contacts',
          subtitle: 'Import a contact and invite instantly',
          onTap: () =>
              _closeWithResult(QuickCreatePickResult.action(QuickCreateAction.addFriendFromContacts)),
        ),
        const SizedBox(height: 12),
        _NewEntryCard(
          icon: Icons.person_add_alt_1_rounded,
          title: 'Add friend manually',
          subtitle: 'Enter phone number and name',
          onTap: () =>
              _closeWithResult(QuickCreatePickResult.action(QuickCreateAction.addFriendManual)),
        ),
        const SizedBox(height: 12),
        _NewEntryCard(
          icon: Icons.group_add_rounded,
          title: 'Create a new group',
          subtitle: 'Plan trips, homes, events and more',
          onTap: () =>
              _closeWithResult(QuickCreatePickResult.action(QuickCreateAction.createGroup)),
        ),
      ],
    );
  }
}

class _QuickActionChip extends StatelessWidget {
  const _QuickActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: Icon(icon, size: 18, color: const Color(0xFF09857a)),
      label: Text(
        label,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      onPressed: onTap,
      elevation: 1,
      pressElevation: 0,
      backgroundColor: const Color(0xFF09857a).withOpacity(0.10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Color(0xFF09857a)),
      ),
    );
  }
}

class _QuickListTile extends StatelessWidget {
  const _QuickListTile({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final Widget leading;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              leading,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: Colors.grey[700],
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF09857a)),
            ],
          ),
        ),
      ),
    );
  }
}

class _NewEntryCard extends StatelessWidget {
  const _NewEntryCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      elevation: 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF09857a).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.all(12),
                child: Icon(icon, color: const Color(0xFF09857a)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: Color(0xFF09857a)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SegmentedHeader extends StatelessWidget {
  const _SegmentedHeader({
    required this.value,
    required this.onChanged,
  });

  final QuickCreateSegment value;
  final ValueChanged<QuickCreateSegment> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF0F5F4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: QuickCreateSegment.values.map((segment) {
          final active = value == segment;
          final label = _labelForSegment(segment);
          return Expanded(
            child: InkWell(
              onTap: () => onChanged(segment),
              borderRadius: BorderRadius.circular(12),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: active ? const Color(0xFF09857a) : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: active ? Colors.white : const Color(0xFF09857a),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  String _labelForSegment(QuickCreateSegment segment) {
    switch (segment) {
      case QuickCreateSegment.friends:
        return 'Friends';
      case QuickCreateSegment.groups:
        return 'Groups';
      case QuickCreateSegment.newEntry:
        return 'New';
    }
  }
}

class _WideRail extends StatelessWidget {
  const _WideRail({
    required this.segment,
    required this.onChanged,
  });

  final QuickCreateSegment segment;
  final ValueChanged<QuickCreateSegment> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      decoration: BoxDecoration(
        color: const Color(0xFFF0F5F4),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: QuickCreateSegment.values.map((seg) {
          final active = seg == segment;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Material(
              color: active ? const Color(0xFF09857a) : Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => onChanged(seg),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
                  child: Row(
                    children: [
                      Icon(
                        _iconForSegment(seg),
                        size: 18,
                        color: active ? Colors.white : const Color(0xFF09857a),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _labelForSegment(seg),
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: active ? Colors.white : const Color(0xFF09857a),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  String _labelForSegment(QuickCreateSegment segment) {
    switch (segment) {
      case QuickCreateSegment.friends:
        return 'Friends';
      case QuickCreateSegment.groups:
        return 'Groups';
      case QuickCreateSegment.newEntry:
        return 'New';
    }
  }

  IconData _iconForSegment(QuickCreateSegment segment) {
    switch (segment) {
      case QuickCreateSegment.friends:
        return Icons.person_rounded;
      case QuickCreateSegment.groups:
        return Icons.groups_rounded;
      case QuickCreateSegment.newEntry:
        return Icons.add_circle_rounded;
    }
  }
}
