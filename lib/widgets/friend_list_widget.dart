// lib/widgets/friend_list_widget.dart

import 'package:flutter/material.dart';

import '../models/friend_model.dart';
import '../services/contact_name_service.dart';

class FriendListWidget extends StatefulWidget {
  final List<FriendModel> friends;
  final void Function(FriendModel)? onTap;
  final void Function(FriendModel)? onLongPress; // Optional: for edit/delete menus

  const FriendListWidget({
    Key? key,
    required this.friends,
    this.onTap,
    this.onLongPress,
  }) : super(key: key);

  @override
  State<FriendListWidget> createState() => _FriendListWidgetState();
}

class _FriendListWidgetState extends State<FriendListWidget> {
  final ContactNameService _contactNames = ContactNameService.instance;

  @override
  void initState() {
    super.initState();
    _contactNames.addListener(_onNamesChanged);
    _primeContacts(widget.friends);
  }

  @override
  void didUpdateWidget(covariant FriendListWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _primeContacts(widget.friends);
  }

  @override
  void dispose() {
    _contactNames.removeListener(_onNamesChanged);
    super.dispose();
  }

  void _onNamesChanged() {
    if (!mounted) return;
    setState(() {});
  }

  void _primeContacts(List<FriendModel> friends) {
    for (final friend in friends) {
      final remote = friend.name.trim();
      if (_contactNames.shouldPreferContact(remote.isNotEmpty ? remote : null, friend.phone)) {
        _contactNames.lookup(friend.phone);
      }
    }
  }

  String _displayNameFor(FriendModel friend) {
    final remote = friend.name.trim();
    return _contactNames.bestDisplayName(
      phone: friend.phone,
      remoteName: remote.isNotEmpty ? remote : null,
      fallback: friend.phone,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.friends.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: Text("No friends yet. Add some!")),
      );
    }
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: widget.friends.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, idx) {
        final friend = widget.friends[idx];
        final displayName = _displayNameFor(friend);
        final subtitle = friend.phone.isNotEmpty && friend.phone != displayName
            ? friend.phone
            : null;
        final leadingLabel = friend.avatar.isNotEmpty
            ? friend.avatar.substring(0, 1)
            : (displayName.isNotEmpty
                ? displayName.characters.first.toUpperCase()
                : '👤');

        return InkWell(
          onTap: widget.onTap != null ? () => widget.onTap!(friend) : null,
          onLongPress: widget.onLongPress != null ? () => widget.onLongPress!(friend) : null,
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Theme.of(context).colorScheme.secondary.withValues(alpha: 0.16),
              child: Text(
                leadingLabel,
                style: const TextStyle(fontSize: 20),
              ),
            ),
            title: Text(displayName),
            subtitle: subtitle != null ? Text(subtitle) : null,
            trailing: const Icon(Icons.chevron_right),
          ),
        );
      },
    );
  }
}
