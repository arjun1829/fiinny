import 'package:flutter/foundation.dart';

/// Indicates where a recurring item lives:
/// - friend scope: users/{user}/friends/{friend}/recurring
/// - group scope : groups/{groupId}/recurring
@immutable
class RecurringScope {
  final String? userPhone;
  final String? friendId;
  final String? groupId;

  const RecurringScope._({
    this.userPhone,
    this.friendId,
    this.groupId,
  });

  const RecurringScope.friend(String userPhone, String friendId)
      : this._(userPhone: userPhone, friendId: friendId);

  const RecurringScope.group(String groupId)
      : this._(groupId: groupId);

  bool get isGroup => groupId != null;

  @override
  String toString() =>
      isGroup ? 'RecurringScope(group:$groupId)'
          : 'RecurringScope(friend:$userPhone↔$friendId)';

  @override
  bool operator ==(Object other) =>
      other is RecurringScope &&
          other.userPhone == userPhone &&
          other.friendId == friendId &&
          other.groupId == groupId;

  @override
  int get hashCode => Object.hash(userPhone, friendId, groupId);
}
