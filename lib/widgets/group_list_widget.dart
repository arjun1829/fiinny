// lib/widgets/group_list_widget.dart

import 'package:flutter/material.dart';
import '../models/group_model.dart';

class GroupListWidget extends StatelessWidget {
  final List<GroupModel> groups;
  final void Function(GroupModel)? onTap;
  final void Function(GroupModel)? onLongPress; // Optional: for edit/delete menus

  const GroupListWidget({
    Key? key,
    required this.groups,
    this.onTap,
    this.onLongPress,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (groups.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(32),
        child: Center(child: Text("No groups yet. Create one!")),
      );
    }
    return ListView.separated(
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      itemCount: groups.length,
      separatorBuilder: (_, __) => Divider(height: 1),
      itemBuilder: (context, idx) {
        final group = groups[idx];
        final memberAvatars = group.memberAvatarList;

        // Up to 5 avatars (emoji/url/initial/fallback)
        final List<Widget> avatarWidgets = [];
        for (int i = 0; i < memberAvatars.length && i < 5; i++) {
          final avatar = memberAvatars[i];
          if (avatar.isNotEmpty && avatar.startsWith("http")) {
            avatarWidgets.add(
              Padding(
                padding: const EdgeInsets.only(right: 2.5),
                child: CircleAvatar(
                  radius: 9,
                  backgroundImage: NetworkImage(avatar),
                  backgroundColor: Colors.transparent,
                ),
              ),
            );
          } else if (avatar.isNotEmpty) {
            avatarWidgets.add(
              Padding(
                padding: const EdgeInsets.only(right: 2.5),
                child: CircleAvatar(
                  radius: 9,
                  backgroundColor: Colors.grey.shade200,
                  child: Text(
                    avatar,
                    style: TextStyle(fontSize: 11),
                  ),
                ),
              ),
            );
          }
        }
        if (group.memberCount > 5) {
          avatarWidgets.add(
            CircleAvatar(
              radius: 9,
              backgroundColor: Colors.grey.shade200,
              child: Text("+${group.memberCount - 5}", style: TextStyle(fontSize: 11)),
            ),
          );
        }

        return InkWell(
          onTap: onTap != null ? () => onTap!(group) : null,
          onLongPress: onLongPress != null ? () => onLongPress!(group) : null,
          child: ListTile(
            leading: group.avatarUrl != null && group.avatarUrl!.isNotEmpty
                ? CircleAvatar(
              radius: 22,
              backgroundImage: NetworkImage(group.avatarUrl!),
              backgroundColor: Colors.transparent,
            )
                : CircleAvatar(
              radius: 22,
              backgroundColor: Theme.of(context).colorScheme.secondary.withValues(alpha: 0.13),
              child: Icon(Icons.groups_rounded, color: Theme.of(context).colorScheme.secondary),
            ),
            title: Text(group.name),
            subtitle: Row(
              children: [
                Text("${group.memberCount} members"),
                SizedBox(width: 10),
                ...avatarWidgets,
              ],
            ),
            trailing: Icon(Icons.chevron_right),
          ),
        );
      },
    );
  }
}
