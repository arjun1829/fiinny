// lib/widgets/friend_list_widget.dart

import 'package:flutter/material.dart';
import '../models/friend_model.dart';

class FriendListWidget extends StatelessWidget {
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
  Widget build(BuildContext context) {
    if (friends.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(32),
        child: Center(child: Text("No friends yet. Add some!")),
      );
    }
    return ListView.separated(
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      itemCount: friends.length,
      separatorBuilder: (_, __) => Divider(height: 1),
      itemBuilder: (context, idx) {
        final friend = friends[idx];
        return InkWell(
          onTap: onTap != null ? () => onTap!(friend) : null,
          onLongPress: onLongPress != null ? () => onLongPress!(friend) : null,
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Theme.of(context).colorScheme.secondary.withOpacity(0.16),
              child: Text(
                friend.avatar.isNotEmpty
                    ? friend.avatar.substring(0, 1)
                    : (friend.name.isNotEmpty ? friend.name[0].toUpperCase() : "👤"),
                style: TextStyle(fontSize: 20),
              ),
            ),
            title: Text(friend.name),
            subtitle: friend.phone != null && friend.phone!.isNotEmpty
                ? Text(friend.phone!)
                : null,
            trailing: Icon(Icons.chevron_right),
          ),
        );
      },
    );
  }
}
