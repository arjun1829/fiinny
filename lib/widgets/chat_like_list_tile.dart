import 'package:flutter/material.dart';

class ChatLikeListTile extends StatelessWidget {
  final String title; // Friend or Group Name
  final String subtitle; // Last activity (expense, settlement, etc)
  final String? imageUrl; // Main avatar image URL (optional, for group/friend)
  final List<String>?
      memberAvatars; // For group: list of member avatars (emojis or URLs)
  final DateTime? lastUpdate; // Last update time
  final bool unread; // Show unread dot
  final int unreadCount; // Unread count (optional)
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool isGroup; // True if this is a group chat-style row

  const ChatLikeListTile({
    super.key,
    required this.title,
    required this.subtitle,
    this.imageUrl,
    this.memberAvatars,
    this.lastUpdate,
    this.unread = false,
    this.unreadCount = 0,
    this.onTap,
    this.onLongPress,
    this.isGroup = false,
  });

  // WhatsApp-style time format
  String _formatTime(DateTime? dt) {
    if (dt == null) return "";
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return "now";
    if (diff.inMinutes < 60) return "${diff.inMinutes} min";
    if (diff.inHours < 24) return "${diff.inHours} hr";
    if (diff.inDays < 7) return "${diff.inDays}d";
    return "${dt.day}/${dt.month}";
  }

  // Avatars for groups: stacked
  Widget _buildGroupAvatar() {
    // Show group image if present
    if (imageUrl != null && imageUrl!.isNotEmpty) {
      return CircleAvatar(radius: 23, backgroundImage: NetworkImage(imageUrl!));
    }
    // Stacked member avatars (up to 3)
    if (memberAvatars != null && memberAvatars!.isNotEmpty) {
      return SizedBox(
        width: 46,
        height: 46,
        child: Stack(
          children:
              memberAvatars!.take(3).toList().asMap().entries.map((entry) {
            final idx = entry.key;
            final avatar = entry.value;
            return Positioned(
              left: idx * 18.0,
              child: avatar.startsWith("http")
                  ? CircleAvatar(
                      radius: 13, backgroundImage: NetworkImage(avatar))
                  : CircleAvatar(
                      radius: 13,
                      child: Text(avatar, style: TextStyle(fontSize: 14))),
            );
          }).toList(),
        ),
      );
    }
    // Fallback: default group icon
    return CircleAvatar(
      radius: 23,
      child: Icon(Icons.groups_rounded, color: Colors.blueGrey),
      backgroundColor: Colors.grey[300],
    );
  }

  Widget _buildFriendAvatar() {
    if (imageUrl != null && imageUrl!.isNotEmpty) {
      return CircleAvatar(radius: 23, backgroundImage: NetworkImage(imageUrl!));
    }
    // If emoji or text
    if (memberAvatars != null && memberAvatars!.isNotEmpty) {
      final av = memberAvatars!.first;
      if (av.length == 1) {
        return CircleAvatar(
            radius: 23, child: Text(av, style: TextStyle(fontSize: 20)));
      }
    }
    // Default person
    return CircleAvatar(
      radius: 23,
      child: Icon(Icons.person, color: Colors.grey[600]),
      backgroundColor: Colors.grey[200],
    );
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 7, horizontal: 10),
        child: Row(
          children: [
            // Avatar
            isGroup ? _buildGroupAvatar() : _buildFriendAvatar(),
            SizedBox(width: 13),
            // Name/subtitle
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontWeight:
                                unread ? FontWeight.bold : FontWeight.w500,
                            fontSize: 17,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (lastUpdate != null)
                        Text(
                          _formatTime(lastUpdate),
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontWeight:
                                unread ? FontWeight.bold : FontWeight.normal,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                  SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.grey[700],
                      fontWeight: unread ? FontWeight.bold : FontWeight.normal,
                      fontSize: 15,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            // Unread dot/count
            if (unread)
              Padding(
                padding: const EdgeInsets.only(left: 8.0),
                child: unreadCount > 0
                    ? Container(
                        padding:
                            EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.blue,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          unreadCount.toString(),
                          style: TextStyle(color: Colors.white, fontSize: 12),
                        ),
                      )
                    : Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: Colors.blue,
                          shape: BoxShape.circle,
                        ),
                      ),
              ),
          ],
        ),
      ),
    );
  }
}
