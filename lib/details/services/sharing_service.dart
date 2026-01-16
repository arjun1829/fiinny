// lib/details/services/sharing_service.dart
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/shared_item.dart';
import '../models/recurring_scope.dart';
import '../models/group.dart';

import 'recurring_service.dart';

// Optional push nudge; comment if you don't have it
import '../../services/push/push_service.dart' as push;

/// Firestore:
/// - Friend tree: users/{userPhone}/friends/{friendId}/recurring/{itemId}
/// - Group tree : groups/{groupId}/recurring/{itemId}
/// - Invites    : invites/{token}
///
/// This service focuses on cloning/sharing existing items across scopes
/// (friend <-> friend, friend -> group) and creating/accepting invite links.
/// All writes keep a tiny `shared` block for traceability.
class SharingService {
  final FirebaseFirestore _db;
  final RecurringService _recurring;

  SharingService({
    FirebaseFirestore? db,
    RecurringService? recurring,
  })  : _db = db ?? FirebaseFirestore.instance,
        _recurring = recurring ?? RecurringService();

  // ------------------------------- Public API --------------------------------

  /// Clone an existing item from a source scope into a **friend** mirror
  /// (creates entries under both /users/{user}/friends/{friend} and the reverse).
  ///
  /// Returns the **new itemId** in the destination scope (friend mirror).
  Future<String?> shareExistingToFriend({
    required RecurringScope source,
    required String itemId,
    required String ownerUserPhone, // the user who is initiating the share
    required String targetFriendId, // the friend to share with
  }) async {
    try {
      // 1) Read source item JSON (safe for both friend & group scope)
      final srcRef = _docFor(source, itemId);
      final snap = await srcRef.get();
      if (!snap.exists) return null;

      final data = snap.data()!;
      final SharedItem src = SharedItem.fromJson(snap.id, data);

      // 2) Build destination participants
      final participants = <String>{ownerUserPhone, targetFriendId}.toList();

      // 3) Prepare clone JSON with linkage
      final clonedJson = _cloneForShare(
        original: src.toJson(),
        participants: participants,
        sharedFromPath: srcRef.path,
        sharedFromId: itemId,
        ownerUser: ownerUserPhone,
        sharedToKind: 'friend',
        sharedToId: targetFriendId,
      );

      // 4) Create a new item (mirrored) using RecurringService.add
      final newItem = SharedItem.fromJson(
        'temp', // id ignored by add(); it generates one
        clonedJson,
      );

      final newId = await _recurring.add(
        ownerUserPhone,
        targetFriendId,
        newItem,
        mirrorToFriend: true, // ensure both sides get it
      );

      // Optional push to the friend
      try {
        await push.PushService.nudgeFriendRecurringLocal(
          friendId: targetFriendId,
          itemTitle: src.title ?? 'Shared item',
          dueOn: src.nextDueAt,
          frequency: src.rule.frequency,
          amount: (() {
            final a = (src.rule.amount).toDouble();
            return a > 0 ? '₹${a.toStringAsFixed(0)}' : null;
          })(),
        );
      } catch (_) {}

      return newId;
    } catch (e, st) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('[SharingService] shareExistingToFriend failed: $e\n$st');
      }
      return null;
    }
  }

  /// Clone an existing item from a source scope into a **group** collection:
  /// groups/{groupId}/recurring/{newId}
  ///
  /// Returns the **new itemId** in the group.
  Future<String?> shareExistingToGroup({
    required RecurringScope source,
    required String itemId,
    required String groupId,
  }) async {
    try {
      // 1) Read source item
      final srcRef = _docFor(source, itemId);
      final snap = await srcRef.get();
      if (!snap.exists) return null;

      final data = snap.data()!;
      final SharedItem src = SharedItem.fromJson(snap.id, data);

      // 2) Read group to fetch memberIds (optional but nice)
      final grpSnap = await _db.collection('groups').doc(groupId).get();
      List<String> memberIds = const [];
      if (grpSnap.exists) {
        final g = Group.fromJson(grpSnap.id, grpSnap.data() ?? {});
        memberIds = g.memberIds;
      }

      // 3) Prepare clone JSON for group scope
      final participants = memberIds.isEmpty
          ? ((data['participants']?['userIds'] as List?)
                  ?.whereType<String>()
                  .toList() ??
              const [])
          : memberIds;

      final clonedJson = _cloneForShare(
        original: src.toJson(),
        participants: participants,
        sharedFromPath: srcRef.path,
        sharedFromId: itemId,
        sharedToKind: 'group',
        sharedToId: groupId,
      );

      // 4) Write to groups/{groupId}/recurring
      final col = _db.collection('groups').doc(groupId).collection('recurring');
      final newRef = col.doc();
      await newRef.set({
        ...clonedJson,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      return newRef.id;
    } catch (e, st) {
      if (kDebugMode) {
        // ignore: avoid_print
        print('[SharingService] shareExistingToGroup failed: $e\n$st');
      }
      return null;
    }
  }

  /// Create a **one-time invite** that, when accepted, clones the item to the
  /// acceptor’s friend mirror with the inviter.
  ///
  /// Returns a shareable deep link (or token if you prefer).
  Future<String> createFriendInviteLink({
    required RecurringScope source,
    required String itemId,
    required String inviterUserPhone,
    Duration ttl = const Duration(days: 3),
    String? schemeBase, // e.g. "lifemap://share"
  }) async {
    final token = _randomToken(22);
    final expiresAt = DateTime.now().add(ttl);

    final srcPath = _docFor(source, itemId).path;
    await _db.collection('invites').doc(token).set({
      'type': 'recurring-share',
      'scope': source.isGroup ? 'group' : 'friend',
      'srcPath': srcPath,
      'itemId': itemId,
      'inviter': inviterUserPhone,
      'status': 'active',
      'createdAt': FieldValue.serverTimestamp(),
      'expiresAt': Timestamp.fromDate(expiresAt),
    });

    // If you use Firebase Dynamic Links, generate it there instead.
    final base = schemeBase ?? 'lifemap://share';
    return '$base?token=$token';
  }

  /// Accept an invite token — clones the source item to a new friend mirror
  /// between the **acceptor** and the **inviter** listed in the invite.
  ///
  /// Returns the new itemId, or null on failure/expired.
  Future<String?> acceptFriendInvite({
    required String token,
    required String acceptorUserPhone,
  }) async {
    final ref = _db.collection('invites').doc(token);
    final snap = await ref.get();
    if (!snap.exists) return null;

    final j = snap.data()!;
    if (j['type'] != 'recurring-share') return null;
    if ((j['status'] ?? 'active') != 'active') return null;

    final expiresAt = (j['expiresAt'] is Timestamp)
        ? (j['expiresAt'] as Timestamp).toDate()
        : null;
    if (expiresAt != null && DateTime.now().isAfter(expiresAt)) {
      await ref.update(
          {'status': 'expired', 'updatedAt': FieldValue.serverTimestamp()});
      return null;
    }

    final srcPath = (j['srcPath'] ?? '').toString();
    final inviter = (j['inviter'] ?? '').toString();
    if (srcPath.isEmpty || inviter.isEmpty) return null;

    // Read the source item
    final srcDoc = await _db.doc(srcPath).get();
    if (!srcDoc.exists) return null;

    final data = srcDoc.data()!;
    final src = SharedItem.fromJson(srcDoc.id, data);

    // Clone to inviter ↔ acceptor
    final participants = <String>{inviter, acceptorUserPhone}.toList();
    final clonedJson = _cloneForShare(
      original: src.toJson(),
      participants: participants,
      sharedFromPath: srcDoc.reference.path,
      sharedFromId: srcDoc.id,
      ownerUser: inviter,
      sharedToKind: 'friend',
      sharedToId: acceptorUserPhone,
    );

    final newItem = SharedItem.fromJson('temp', clonedJson);
    final newId = await _recurring.add(inviter, acceptorUserPhone, newItem,
        mirrorToFriend: true);

    // mark consumed
    await ref.update({
      'status': 'consumed',
      'consumedBy': acceptorUserPhone,
      'consumedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });

    return newId;
  }

  // ------------------------------- Helpers -----------------------------------

  /// Returns a path-aware docRef for friend/group scope.
  DocumentReference<Map<String, dynamic>> _docFor(RecurringScope s, String id) {
    if (s.isGroup) {
      return _db
          .collection('groups')
          .doc(s.groupId!)
          .collection('recurring')
          .doc(id);
    }
    return _db
        .collection('users')
        .doc(s.userPhone!)
        .collection('friends')
        .doc(s.friendId!)
        .collection('recurring')
        .doc(id);
  }

  /// Clone + normalize JSON for a shared copy.
  Map<String, dynamic> _cloneForShare({
    required Map<String, dynamic> original,
    required List<String> participants,
    required String sharedFromPath,
    required String sharedFromId,
    String? ownerUser,
    required String sharedToKind, // 'friend' | 'group'
    required String sharedToId, // friendId or groupId
  }) {
    // Deep copy
    final j = Map<String, dynamic>.from(original);

    // Ensure rule presence & normalize anchorDate to Timestamp if needed
    final rule =
        (j['rule'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    if (rule['status'] == null) rule['status'] = 'active';

    final ad = rule['anchorDate'];
    if (ad is DateTime) rule['anchorDate'] = Timestamp.fromDate(ad);
    if (ad is String) {
      try {
        rule['anchorDate'] = Timestamp.fromDate(DateTime.parse(ad));
      } catch (_) {}
    }
    j['rule'] = rule;

    // Participants mirror
    j['participants'] = {
      'userIds': participants.toSet().toList(),
    };

    // Small “shared” trace block
    final sharedBlock = {
      'fromPath': sharedFromPath,
      'fromId': sharedFromId,
      'toKind': sharedToKind,
      'toId': sharedToId,
      if (ownerUser != null) 'ownerUser': ownerUser,
      'sharedAt': FieldValue.serverTimestamp(),
    };
    final meta =
        (j['meta'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    meta['shared'] = sharedBlock;
    j['meta'] = meta;

    // Top-level convenience too (for debugging/analytics)
    j['link'] = {
      ...(j['link'] as Map? ?? const {}),
      'sharedFromId': sharedFromId,
      'sharedFromPath': sharedFromPath,
    };

    // Nudge timestamps (let caller write createdAt/updatedAt)
    j.remove('createdAt');
    j.remove('updatedAt');

    // If there was a top-level deeplink, keep it.
    // If not, no-op (UI already guards).
    return j;
  }

  String _randomToken(int len) {
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final r = Random.secure();
    return String.fromCharCodes(
        List.generate(len, (_) => chars.codeUnitAt(r.nextInt(chars.length))));
  }
}
