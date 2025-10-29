import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/group_model.dart';

class GroupService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // User's personal group subcollection (legacy/notifications only)
  CollectionReference<Map<String, dynamic>> getGroupsCollection(String userPhone) {
    return _firestore.collection('users').doc(userPhone).collection('groups');
  }

  // Main global group collection (source of truth)
  CollectionReference<Map<String, dynamic>> get globalGroups =>
      _firestore.collection('groups');

  /// --- UNIVERSAL: Stream all groups where user is a member (GLOBAL only, phone based) ---
  Stream<List<GroupModel>> streamGroups(String userPhone) {
    return globalGroups
        .where('memberPhones', arrayContains: userPhone)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => GroupModel.fromFirestore(doc)).toList());
  }

  /// One-time fetch: all groups where user is a member (GLOBAL only, phone based)
  Future<List<GroupModel>> fetchUserGroups(String userPhone) async {
    final snap =
        await globalGroups.where('memberPhones', arrayContains: userPhone).get();
    return snap.docs.map((doc) => GroupModel.fromFirestore(doc)).toList();
  }

  /// Add a group globally and mirror to all member's subcollections (for notifications/offline)
  Future<String> addGroup({
    required String userPhone,
    required String name,
    required List<String> memberPhones,
    required String createdBy, // should be phone of creator
    String? avatarUrl,
    Map<String, String>? memberAvatars,
    Map<String, String>? memberDisplayNames,
  }) async {
    final now = DateTime.now();
    final allMembers = Set<String>.from(memberPhones)..add(createdBy);

    // Create in global collection
    final docRef = globalGroups.doc();
    final group = GroupModel.withCreator(
      id: docRef.id,
      name: name,
      memberPhones: allMembers.toList(),
      createdBy: createdBy,
      createdAt: now,
      avatarUrl: avatarUrl,
      memberAvatars: memberAvatars,
      memberDisplayNames: memberDisplayNames,
    );
    final batch = _firestore.batch();
    batch.set(docRef, group.toJson());

    // (Optional) Mirror in each member's personal collection (for notifications/offline/legacy)
    for (final memberPhone in allMembers) {
      final userDoc = getGroupsCollection(memberPhone).doc(docRef.id);
      batch.set(userDoc, group.toJson(), SetOptions(merge: true));
    }
    await batch.commit();
    return docRef.id;
  }

  /// Update group details globally and in user subcollections (for notifications/offline/legacy)
  Future<void> updateGroup(
    String groupId,
    Map<String, dynamic> updates,
  ) async {
    // Update in global collection
    await globalGroups.doc(groupId).update(updates);

    // For each member, update their copy (optional, for legacy/offline)
    final group = await getGroupById(groupId);
    if (group != null) {
      for (final memberPhone in group.memberPhones) {
        await getGroupsCollection(memberPhone).doc(groupId).update(updates);
      }
    }
  }

  /// Delete group globally and from user subcollections
  Future<void> deleteGroup(String groupId) async {
    // Remove from global collection
    await globalGroups.doc(groupId).delete();

    // Remove from all members' personal group lists (for notifications/offline)
    final group = await getGroupById(groupId);
    if (group != null) {
      for (final memberPhone in group.memberPhones) {
        await getGroupsCollection(memberPhone).doc(groupId).delete();
      }
    }
  }

  /// Get group by ID (from global collection)
  Future<GroupModel?> getGroupById(String groupId) async {
    final doc = await globalGroups.doc(groupId).get();
    if (!doc.exists) return null;
    return GroupModel.fromFirestore(doc);
  }

  /// Add members to a group (updates all relevant places)
  Future<void> addMembers(
    String groupId,
    List<String> newMemberPhones, {
    Map<String, String>? displayNames,
  }) async {
    if (newMemberPhones.isEmpty) return;

    final uniqueMembers = newMemberPhones.toSet().toList();

    // Update global collection
    final updates = <String, dynamic>{
      'memberPhones': FieldValue.arrayUnion(uniqueMembers),
    };

    if (displayNames != null && displayNames.isNotEmpty) {
      for (final entry in displayNames.entries) {
        final phone = entry.key.trim();
        final name = entry.value.trim();
        if (phone.isEmpty || name.isEmpty) continue;
        updates['memberDisplayNames.$phone'] = name;
      }
    }

    await globalGroups.doc(groupId).update(updates);

    // Fetch group and mirror for each new member (for notifications/offline)
    final group = await getGroupById(groupId);
    if (group != null) {
      final batch = _firestore.batch();
      for (final memberPhone in uniqueMembers) {
        final userDoc = getGroupsCollection(memberPhone).doc(groupId);
        batch.set(userDoc, group.toJson(), SetOptions(merge: true));
      }
      await batch.commit();
    }
  }

  /// Remove members from group (updates all relevant places)
  Future<void> removeMembers(String groupId, List<String> removeMemberPhones) async {
    // Remove from global
    await globalGroups.doc(groupId).update({
      'memberPhones': FieldValue.arrayRemove(removeMemberPhones),
    });

    // Remove from each member's subcollection (for notifications/offline)
    for (final memberPhone in removeMemberPhones) {
      await getGroupsCollection(memberPhone).doc(groupId).delete();
    }
  }

  /// LEGACY: stream only groups created by user (not recommended for new code/UI)
  Stream<List<GroupModel>> streamOwnedGroups(String userPhone) {
    return getGroupsCollection(userPhone)
        .where('createdBy', isEqualTo: userPhone)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => GroupModel.fromFirestore(doc)).toList());
  }
}
